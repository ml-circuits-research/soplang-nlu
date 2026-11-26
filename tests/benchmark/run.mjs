import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {gzipSync,gunzipSync} from 'node:zlib'
import {compareAlternatives} from '../../lib/compare-alternatives.mjs'
import {Worker} from 'node:worker_threads'
import {cpus,platform,arch} from 'node:os'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../../',import.meta.url))
const base=resolve(process.env.SOP_WORKSPACE ?? join(root,'..'))
const dataset=join(base,'webmeet-dataset')
const git=(cwd,...args)=>execFileSync('git',['-C',cwd,...args],{encoding:'utf8',maxBuffer:128*1024*1024})
const replay=process.argv[2]
const previous=replay && JSON.parse(readFileSync(join(replay,'environment.json'),'utf8'))
const revision=previous?.revision ?? git(dataset,'rev-parse','HEAD').trim()
const {readRecords}=await import(pathToFileURL(join(dataset,'tools/rows.mjs')))
const percent=Number(previous?.percent ?? process.env.SAMPLE_PERCENT ?? 1)
const workers=Number(previous?.workers ?? process.env.WORKERS ?? 4)
if (!(percent>0 && percent<=100 && Number.isSafeInteger(workers) && workers>0)) throw Error('Invalid benchmark configuration')
const seed=previous?.seed ?? process.env.SAMPLE_SEED ?? '42'
const hash=value=>createHash('sha256').update(value).digest('hex')
const pool=[]
for (const file of git(dataset,'ls-tree','-r','--name-only',revision).trim().split('\n').filter(p=>/^(diagram|drawing|calendar|document)\/[^/]+\.csv$/.test(p))) {
  const parsed=readRecords(git(dataset,'show',revision+':'+file))
  if (!parsed.ok) throw Error(file+': '+parsed.why)
  for (const row of parsed.records) {
    const id=file+'#'+row.record
    pool.push({id,score:hash(seed+'\0'+id),text:row.text,references:row.circuits.map(c=>c.sop)})
  }
}
pool.sort((a,b)=>a.score.localeCompare(b.score))
const rows=pool.slice(0,Math.max(1,Math.round(pool.length*percent/100)))
const dir=replay ?? join(root,'eval-results',new Date().toISOString().replaceAll(':','-'))
mkdirSync(dir,{recursive:true})
const save=(name,data)=>writeFileSync(join(dir,name),JSON.stringify(data,null,2)+'\n')
const metadata=previous ?? {revision,seed,percent,workers,population:pool.length,sample:rows.length,node:process.version,cpu:cpus()[0].model,platform:platform(),arch:arch(),strategies:{}}
if (replay) {
  const recorded=JSON.parse(gunzipSync(readFileSync(join(dir,'sample.json.gz'))))
  if (JSON.stringify(recorded)!==JSON.stringify(rows.map(({score,...r})=>r))) throw Error('Replay sample mismatch')
} else {
  save('environment.json',metadata)
  writeFileSync(join(dir,'sample.json.gz'),gzipSync(JSON.stringify(rows.map(({score,...r})=>r))))
}
for(const strategy of replay ? ['prolog-worlds'] : ['z3','prolog-worlds']){
  if (metadata.strategies[strategy]) throw Error('Configuration already recorded: '+strategy)
  const repo=join(base,(strategy==='prolog-worlds'?'prolog':strategy)+'-formaliser')
  const entry=join(repo,'src/reader.mjs')
  const options=strategy==='z3'?{topK:8,knowledgeDir:join(base,'sop-knowledge-worlds')}:{evidence:true,worldsOnly:strategy==='prolog-worlds'}
  const config={source:git(repo,'rev-parse','HEAD').trim(),workingDiffSha256:hash(git(repo,'diff','HEAD')),options}

  metadata.strategies[strategy]=config
  save('environment.json',metadata)
  const start=performance.now()
  console.log(strategy,'starting',rows.length,'requests',dir)
  const batches=await Promise.all(Array.from({length:Math.min(workers,rows.length)},(_,index)=>new Promise((ok,fail)=>{
    const worker=new Worker(new URL('./worker.mjs',import.meta.url),{workerData:{entry,options,rows:rows.filter((_,i)=>i%workers===index).map(({id,text})=>({id,text}))}})
    let data
    worker.on('message',result=>{data=result})
    worker.on('error',fail)
    worker.on('exit',code=>code===0 && data?ok(data):fail(Error('Worker exited '+code)))
  })))
  const wallMs=performance.now()-start
  const records=batches.flatMap(b=>b.records)
  const gold = new Map(rows.map(r => [r.id,r.references]))
  for (const row of records) row.comparison = compareAlternatives(gold.get(row.id),row.candidates)
  const latency=records.map(r=>r.latencyMs).sort((a,b)=>a-b)
  const summary={wallMs,requestsPerSecond:records.length*1000/wallMs,medianMs:latency[Math.ceil(records.length*.5)-1],p95Ms:latency[Math.ceil(records.length*.95)-1],errors:records.filter(r=>r.error).length,withExactMatch:records.filter(r=>r.comparison.matched).length,workerTiming:batches.map(b=>b.timing)}
  save(strategy+'.json',summary)
  writeFileSync(join(dir,strategy+'.jsonl.gz'),gzipSync(records.map(r=>JSON.stringify(r)).join('\n')))
  console.log(strategy,JSON.stringify(summary))
}
