// Prepare only the new publicly returned circuits for exact-judgment reuse.
import {readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {gunzipSync,gzipSync} from 'node:zlib'
import {createAnalysisValidator,hasCompleteSource} from '../../../lib/check-analysis.mjs'
const [stage,baseline,run]=process.argv.slice(2)
if(!run || !['prepare','score'].includes(stage))throw Error('Expected prepare|score BASELINE SUPPLEMENTAL_RUN')
const load=(dir,name)=>gunzipSync(readFileSync(join(dir,name))).toString()
const readLines=(dir,name)=>load(dir,name).trim().split('\n').filter(Boolean).map(JSON.parse)
const writeLines=(name,rows)=>writeFileSync(join(run,name),gzipSync(rows.map(r=>JSON.stringify(r)).join('\n')+'\n'),{flag:'wx'})
const samples=JSON.parse(load(baseline,'sample.json.gz'))
const outputs=readLines(run,'selector-distilbert.jsonl.gz')
if(!readFileSync(join(baseline,'sample.json.gz')).equals(readFileSync(join(run,'sample.json.gz')))||
   outputs.length!==samples.length||outputs.some((row,i)=>row.id!==samples[i].id||row.candidates.length>2))
  throw Error('Supplement differs from the original sample or proposal budget')
const validate=await createAnalysisValidator({knowledgeDir:process.env.SOP_KNOWLEDGE_DIR})
const expectedPool=outputs.map(({id,candidates},i)=>({id,text:samples[i].text,
  candidates:candidates.map((sop,rank)=>({family:'selector-distilbert',rank,sop,
    eligible:hasCompleteSource(validate(samples[i].text,sop))}))}))
if(stage==='prepare'){
  writeLines('sources.jsonl.gz',samples.map(({id,text})=>({id,text})))
  writeLines('pool.jsonl.gz',expectedPool)
}else{
  const voteRows=readLines(run,'votes.jsonl.gz')
  const voteKey=(id,sop)=>JSON.stringify([id,sop])
  const votes=new Map(voteRows.map(row=>[voteKey(row.id,row.sop),row.accepted]))
  const pool=readLines(run,'pool.jsonl.gz')
  const expectedVotes=new Set(expectedPool.flatMap(row=>row.candidates.filter(c=>c.eligible)
    .map(c=>voteKey(row.id,c.sop))))
  if(JSON.stringify(pool)!==JSON.stringify(expectedPool)||voteRows.length!==votes.size||
     votes.size!==expectedVotes.size||[...votes.keys()].some(key=>!expectedVotes.has(key)))
    throw Error('Saved review inputs or exact votes differ from frozen predictions')
  const original=readLines(join(baseline,'source-review'),'public-set-judgments.jsonl.gz')
    .filter(row=>row.engine==='selector-distilbert')
  const byId=new Map(original.map(row=>[row.id,row]))
  if(original.length!==pool.length||byId.size!==pool.length||
     pool.some(row=>byId.get(row.id)?.text!==row.text))
    throw Error('Original strategy judgments differ from the frozen sample')
  const paired={both:0,onlyOriginal:0,onlySupplemental:0,neither:0}
  const counts={none:0,some:0,all:0}
  for(const row of pool){
    const verdicts=row.candidates.map(candidate=>{
      if(!candidate.eligible)return false
      const vote=votes.get(voteKey(row.id,candidate.sop))
      if(typeof vote!=='boolean')throw Error('Missing independent judgment at '+row.id)
      return vote
    })
    const accepted=verdicts.filter(Boolean).length
    counts[accepted===0?'none':accepted===verdicts.length?'all':'some']++
    const previous=byId.get(row.id).outcome!=='none'
    if(previous)paired[accepted?'both':'onlyOriginal']++
    else paired[accepted?'onlySupplemental':'neither']++
  }
  const atLeastOne=counts.some+counts.all
  const summary={texts:pool.length,outcomes:counts,atLeastOne,percent:100*atLeastOne/pool.length,paired}
  writeFileSync(join(run,'supplemental-summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'})
  console.log(JSON.stringify(summary))
}
