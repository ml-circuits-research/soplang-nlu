import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {gunzipSync,gzipSync} from 'node:zlib'
import {performance} from 'node:perf_hooks'
import {hasCompleteSource} from '../../../lib/check-analysis.mjs'
import {pairedGraph} from './index.mjs'
const [sources,output,python,modelPath]=process.argv.slice(2)
if(!modelPath)throw Error('Expected SOURCES NEW_OUTPUT PYTHON CHECKPOINT')
const rows=gunzipSync(readFileSync(sources)).toString().trim().split('\n').map(JSON.parse)
mkdirSync(output)
const pool=[],durations=[]
const started=performance.now()
const strategy=await pairedGraph.open({knowledgeDir:process.env.SOP_KNOWLEDGE_DIR,graphOptions:{python,modelPath,device:'cpu'}})
const startupMs=performance.now()-started
try{
  for(const {id,text} of rows){
    const start=performance.now()
    const reading=await strategy.paired(text)
    durations.push(performance.now()-start)
    pool.push({id,text,candidates:Object.entries(reading).flatMap(([family,list])=>list.map(({sop,check},rank)=>({
      family,rank,sop,eligible:hasCompleteSource(check)})))})
  }
}finally{await strategy.close()}
writeFileSync(join(output,'sources.jsonl.gz'),readFileSync(sources),{flag:'wx'})
writeFileSync(join(output,'pool.jsonl.gz'),gzipSync(pool.map(row=>JSON.stringify(row)).join('\n')+'\n'),{flag:'wx'})
const sorted=durations.toSorted((a,b)=>a-b)
writeFileSync(join(output,'pool.jsonl.gz.timing.json'),JSON.stringify({texts:rows.length,startupMs,
  elapsedMs:performance.now()-started,medianMs:sorted[Math.ceil(sorted.length*.50)-1],p95Ms:sorted[Math.ceil(sorted.length*.95)-1]},null,2)+'\n',{flag:'wx'})
