import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {gunzipSync,gzipSync} from 'node:zlib'
import {createAnalysisValidator,hasCompleteSource} from '../../lib/check-analysis.mjs'

const [mode,logical,dest,knowledgeDir,scheduledPrior]=process.argv.slice(2)
if(!['prepare','accept'].includes(mode)||!knowledgeDir)
  throw Error('Usage: curation-review-data.mjs prepare|accept LOGICAL_DIR REVIEW_DIR KNOWLEDGE_DIR [SCHEDULED_PRIOR_TARGETS.json.gz]')
const fromGzip=(path)=>gunzipSync(readFileSync(path)).toString().split('\n').filter(Boolean).map(JSON.parse)
const validate=await createAnalysisValidator({knowledgeDir})
const rows=fromGzip(join(logical,'records.jsonl.gz'))
const {model}=JSON.parse(readFileSync(join(logical,'..','manifest.json')))
const family={'gpt-6-sol':'sol-curated','gpt-6.1-terra':'terra-curated'}[model]
if(!family)throw Error('Unsupported curator in generation manifest')
const write=(name,bytes)=>writeFileSync(join(dest,name),bytes,{flag:'wx'})
const pack=(name,values)=>write(name,gzipSync(values.map(row=>JSON.stringify(row)+'\n').join('')))
const hash=name=>createHash('sha256').update(readFileSync(join(dest,name))).digest('hex')
const candidates=rows.map(({id,text,readings,status})=>{
  if(!Array.isArray(readings)||readings.length>2||readings.length===0&&status==='curated'||
    readings.length>0&&status!=='curated')throw Error('Unexpected curation result for '+id)
  const choices=readings.map(({sop},rank)=>{
    if(!hasCompleteSource(validate(text,sop)))throw Error('Grounding drift at '+id)
    return {family,rank,sop,eligible:true}
  })
  return {id,text,candidates:choices}
})
if(mode==='prepare'){
  const future=new Set(scheduledPrior?JSON.parse(gunzipSync(readFileSync(scheduledPrior))).map(t=>t.fingerprint):[])
  const fingerprint=(text,sop)=>createHash('sha256').update(JSON.stringify([text,sop.replace(/\r\n?/g,'\n').trim()])).digest('hex')
  const pool=candidates.map(row=>({...row,candidates:row.candidates.filter(c=>!future.has(fingerprint(row.text,c.sop)))}))
  pack('pool.jsonl.gz',pool)
  pack('sources.jsonl.gz',rows.map(({id,text})=>({id,text})))
  console.log(JSON.stringify({inputs:rows.length,candidateCircuits:pool.flatMap(r=>r.candidates).length,
    deferredCircuits:candidates.flatMap(r=>r.candidates).length-pool.flatMap(r=>r.candidates).length}))
}else{
  const votes=fromGzip(join(dest,'votes.jsonl.gz'))
  const key=(id,sop)=>JSON.stringify([id,sop])
  const byKey=new Map(votes.map(({id,sop,accepted})=>[key(id,sop),accepted]))
  if(byKey.size!==votes.length)throw Error('Duplicate curation judgment')
  const accepted=[]
  const unresolved=[]
  for(const row of rows){
    const readings=row.readings.filter(({sop})=>{
      const k=key(row.id,sop)
      const yes=byKey.get(k)
      if(typeof yes!=='boolean')throw Error('Missing review for '+row.id)
      byKey.delete(k)
      return yes
    })
    if(readings.length){
      accepted.push({id:row.id,text:row.text,readings,
        ...(readings.length===2?{ambiguity:row.ambiguity}:{})})
    }else{
      unresolved.push({id:row.id,text:row.text,stage:row.status==='rework'?'static-curation':'independent-review',
        ...(row.status==='rework'?{problems:row.problems,partialReadings:row.partialReadings}:
          {rejectedReadings:row.readings})})
    }
  }
  if(byKey.size)throw Error('Review includes unrequested candidates')
  pack('accepted.jsonl.gz',accepted)
  pack('rework.jsonl.gz',unresolved)
  const summary={inputs:rows.length,settledVotes:votes.length,acceptedSources:accepted.length,
    acceptedCircuits:accepted.flatMap(r=>r.readings).length,reworkSources:unresolved.length,
    ambiguousSources:accepted.filter(r=>r.readings.length===2).length,
    digests:Object.fromEntries(['accepted.jsonl.gz','rework.jsonl.gz','votes.jsonl.gz'].map(name=>[name,hash(name)]))}
  write('curation-review-summary.json',JSON.stringify(summary,null,2)+'\n')
  console.log(JSON.stringify(summary))
}
