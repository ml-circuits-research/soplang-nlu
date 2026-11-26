// Precompute the same first public draft that a live editor will receive.
// The cache supplies only previous engine outputs for the exact input; no
// judgment, reference, train/dev flag or dataset ID reaches a strategy.
import {readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
import {gunzipSync,gzipSync} from 'node:zlib'
import {createAnalysisValidator} from '../../../lib/check-analysis.mjs'
import {createReader} from '../../../lib/reader.mjs'
import {encodeGraph,tokenizeSource} from '../../../strategies/distilbert/graph.mjs'
import {neuroSelector} from '../../../strategies/neuro-selector/index.mjs'
import {selectorChoices} from '../../../strategies/neuro-selector/features.mjs'
import {selectReadings} from '../../../strategies/neuro-selector/score.mjs'
const [baseline,tranche,out,rankArg='0',totalArg='1']=process.argv.slice(2)
const rank=Number(rankArg),total=Number(totalArg)
if(!out||!Number.isInteger(total)||!Number.isInteger(rank)||rank<0||rank>=total)throw Error('Expected BASELINE TRANCHE OUTPUT RANK WORKERS')
const root=fileURLToPath(new URL('../../../',import.meta.url))
const archives=join(root,'eval-results')
const knowledgeDir=resolve(process.env.SOP_KNOWLEDGE_DIR ?? join(root,'../sop-knowledge-worlds'))
const {parse}=await import(pathToFileURL(join(knowledgeDir,'tools/sopworld/sopworld.mjs')))
const validate=await createAnalysisValidator({knowledgeDir})
const unpack=p=>gunzipSync(readFileSync(p)).toString()
const rows=p=>unpack(p).trim().split('\n').filter(Boolean).map(JSON.parse)
const sha=v=>createHash('sha256').update(v).digest('hex')
const model=JSON.parse(readFileSync(join(root,'strategies/neuro-selector/model.json')))
const splits=['train','dev','study']
const requests=splits.flatMap(split=>rows(join(baseline,split+'.jsonl.gz')).map(row=>({split,row})))
  .filter((r,i)=>i%total===rank)
const pending=new Set(requests.map(item=>item.row.text))
const cache=new Map()
const historic=join(archives,'2026-11-26-fresh-locked-one-percent')
const history=new Map(JSON.parse(unpack(join(historic,'sample.json.gz'))).map(r=>[r.id,r.text]))
for(const r of rows(join(historic,'neuro-selector.jsonl.gz'))){
  const text=history.get(r.id)
  if(pending.has(text)&&!r.error)cache.set(text,{sop:r.candidates[0]??null,via:'public-run'})
}
const pools=Array.from({length:6},(_,i)=>join(tranche,'part-'+i,'pool.jsonl.gz'))
pools.push(join(archives,'2026-11-26-neuro-selector-proposal-pools/train/pool.jsonl.gz'))
for(const path of pools)for(const r of rows(path)){
  if(!pending.has(r.text)||cache.has(r.text))continue
  const input=selectorChoices(r.text,r.candidates,parse)
  const [best]=selectReadings(input,model)
  const sop=best?input.candidates[best.index].sop:r.candidates[0]?.sop
  cache.set(r.text,{sop:sop??null,via:'public-pool'})
}
const outputs=Object.fromEntries(splits.map(s=>[s,[]]))
const counts={}
let reader
try{
  for(const {split,row} of requests){
    let hint=cache.get(row.text)
    if(!hint){
      reader??=await createReader({strategy:neuroSelector,knowledgeDir})
      const result=await reader.propose(row.text)
      if(result.error)throw Error(result.error)
      hint={sop:result.candidates[0]?.sop??null,via:'live'}
    }
    counts[hint.via]=(counts[hint.via]??0)+1
    let draftNodes=[]
    if(hint.sop){
      const check=validate(row.text,hint.sop,{alignSource:true})
      if(!check.valid)throw Error('Cached public draft failed grounding: '+row.id)
      try{draftNodes=encodeGraph(row.text,hint.sop,parse,check).nodes}
      catch(e){if(e.message!=='Unanchored graph component')throw e;counts.unanchored=(counts.unanchored??0)+1}
    }
    outputs[split].push({...row,tokens:row.tokens??tokenizeSource(row.text),draftNodes,draftSop:hint.sop})
  }
}finally{if(reader)await reader.close()}
const digest={}
for(const split of splits){
  const bytes=gzipSync(outputs[split].map(r=>JSON.stringify(r)).join('\n')+'\n')
  writeFileSync(join(out,split+'-'+rank+'.jsonl.gz'),bytes,{flag:'wx'})
  digest[split]=sha(bytes)
}
console.log(JSON.stringify({rank,counts,digest}))
