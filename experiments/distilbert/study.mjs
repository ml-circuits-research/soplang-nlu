import {createHash} from 'node:crypto'
import {cpus} from 'node:os'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {gunzipSync,gzipSync} from 'node:zlib'
import {createReader} from '../../lib/reader.mjs'
import {hasCompleteSource} from '../../lib/check-analysis.mjs'
import {distilBert} from '../../strategies/distilbert/index.mjs'

const [study,baselinePath,out,knowledgeDir,python,modelPath,variant]=process.argv.slice(2)
if (!modelPath) throw Error('Usage: study.mjs STUDY BASELINE OUTPUT KNOWLEDGE PYTHON MODEL')
if (variant && variant!=='selector-repair') throw Error('Unknown study variant.')
const strategy=variant ? (await import('./repair/strategy.mjs')).selectorRepair : distilBert
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex')
const studyBytes=await readFile(study)
const baselineBytes=await readFile(baselinePath)
const rows=gunzipSync(studyBytes).toString().trim().split('\n').map(JSON.parse)
const baseline=JSON.parse(gunzipSync(baselineBytes)).baseline
if (rows.length!==100 || rows.length!==baseline.length || rows.some(({id,text},i)=>id!==baseline[i].id||text!==baseline[i].text) ||
    new Set(rows.map(r=>r.id)).size!==100 || new Set(rows.map(r=>r.text)).size!==100) {
  throw Error('Expected the 100 paired literal study sources in archive order')
}
await mkdir(out,{recursive:true})
const write=(name,bytes)=>writeFile(join(out,name),bytes,{flag:'wx'})
const json=(name,value)=>write(name,JSON.stringify(value,null,2)+'\n')
const pack=(name,values)=>write(name,gzipSync(values.map(r=>JSON.stringify(r)).join('\n')+'\n'))
const started=performance.now()
const reader=await createReader({strategy,knowledgeDir,python,modelPath,device:'cpu'})
const startupMs=performance.now()-started
const pool=[]
const traces=[]
const requestMs=[]
const began=performance.now()
try {
  for (const {id,text} of rows){
    const now=performance.now()
    const result=await reader.propose(text)
    const wallMs=performance.now()-now
    if (result.analysisDiagnostics?.device!=='cpu') throw Error('Expected CPU worker diagnostics at '+id)
    requestMs.push(wallMs)
    traces.push({id,text,wallMs,...result})
    pool.push({id,text,candidates:result.candidates.map(({sop,check},rank)=>({
      family:strategy.name,rank,sop,eligible:hasCompleteSource(check)
    }))})
  }
} finally {
  await reader.close()
}
const durations=requestMs.toSorted((a,b)=>a-b)
const q=p=>durations[Math.ceil(durations.length*p)-1]
await pack('sources.jsonl.gz',rows)
await pack('pool.jsonl.gz',pool)
await pack('trace.jsonl.gz',traces)
await json('pool.jsonl.gz.timing.json',{rows:rows.length,startupMs,requestsAndShutdownMs:performance.now()-began,
  firstRequestMs:requestMs[0],meanMs:requestMs.reduce((a,b)=>a+b,0)/requestMs.length,medianMs:q(0.5),p95Ms:q(0.95),
  cpu:cpus()[0]?.model,ompThreads:process.env.OMP_NUM_THREADS ?? null,mklThreads:process.env.MKL_NUM_THREADS ?? null,
  modelPath,python,studySha256:sha256(studyBytes),baselineSha256:sha256(baselineBytes),
  publicCandidates:pool.reduce((n,r)=>n+r.candidates.length,0),
  eligible:pool.filter(r=>r.candidates.some(c=>c.eligible)).length,
  errors:traces.filter(r=>r.error).length,rejected:traces.reduce((n,r)=>n+r.rejected.length,0),
  noGraph:traces.filter(r=>r.analysisDiagnostics?.status==='no-graph').length})
