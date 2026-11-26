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
if(stage==='prepare'){
  const validate=await createAnalysisValidator({knowledgeDir:process.env.SOP_KNOWLEDGE_DIR})
  writeLines('sources.jsonl.gz',samples.map(({id,text})=>({id,text})))
  writeLines('pool.jsonl.gz',outputs.map(({id,candidates},i)=>({id,text:samples[i].text,
    candidates:candidates.map((sop,rank)=>({family:'selector-distilbert',rank,sop,
      eligible:hasCompleteSource(validate(samples[i].text,sop))}))})))
}else{
  const votes=new Map(readLines(run,'votes.jsonl.gz').map(row=>[JSON.stringify([row.id,row.sop]),row.accepted]))
  const pool=readLines(run,'pool.jsonl.gz')
  const counts={none:0,some:0,all:0}
  for(const row of pool){
    const verdicts=row.candidates.map(candidate=>{
      if(!candidate.eligible)return false
      const vote=votes.get(JSON.stringify([row.id,candidate.sop]))
      if(typeof vote!=='boolean')throw Error('Missing independent judgment at '+row.id)
      return vote
    })
    const accepted=verdicts.filter(Boolean).length
    counts[accepted===0?'none':accepted===verdicts.length?'all':'some']++
  }
  const atLeastOne=counts.some+counts.all
  const summary={texts:pool.length,outcomes:counts,atLeastOne,percent:100*atLeastOne/pool.length}
  writeFileSync(join(run,'supplemental-summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'})
  console.log(JSON.stringify(summary))
}
