import {readFileSync,writeFileSync} from 'node:fs'
import {gunzipSync,gzipSync} from 'node:zlib'
import {join} from 'node:path'
import {createAnalysisValidator,hasCompleteSource} from '../../lib/check-analysis.mjs'

const [work,baselinePath,knowledgeDir]=process.argv.slice(2)
if (!knowledgeDir) throw Error('Usage: score-study.mjs STUDY_OUTPUT BASELINE_OUTCOMES KNOWLEDGE')
const fromGzip=path=>gunzipSync(readFileSync(path)).toString()
const jsonl=name=>fromGzip(join(work,name)).trim().split('\n').filter(Boolean).map(JSON.parse)
const baseline=JSON.parse(fromGzip(baselinePath)).baseline
const pool=jsonl('pool.jsonl.gz')
const key=(id,sop)=>JSON.stringify([id,sop])
const votes=new Map(jsonl('votes.jsonl.gz').map(v=>[key(v.id,v.sop),v.accepted]))
const validate=await createAnalysisValidator({knowledgeDir})
if(baseline.length!==pool.length)throw Error('Unexpected cohort length')
const baselineFields=['pretrained-direct','base-beam','selector']
const fields=['distilbert',...baselineFields]
let baselineGateChanges=0
const outcomes=pool.map(({id,text,candidates},i)=>{
  const old=baseline[i]
  if(old.id!==id||old.text!==text)throw Error('Misaligned input '+id)
  for (const field of baselineFields) for(const c of old[field]) {
    if(hasCompleteSource(validate(text,c.sop))!==c.eligible)baselineGateChanges++
  }
  return {id,text,...Object.fromEntries(baselineFields.map(f=>[f,old[f]])),distilbert:candidates.map(c=>{
    const k=key(id,c.sop)
    const accepted=votes.get(k)
    if(hasCompleteSource(validate(text,c.sop))!==c.eligible || c.eligible&&typeof accepted!=='boolean')throw Error('Eligibility or vote mismatch on '+id)
    votes.delete(k)
    return {...c,accepted:c.eligible&&accepted}
  })}
})
if(votes.size)throw Error('Unexpected votes outside the scored candidate set')
const n=test=>outcomes.filter(test).length
const any=candidates=>candidates.some(c=>c.accepted)
const all=candidates=>candidates.length>0&&candidates.every(c=>c.accepted)
function metrics(cap){
  const selection=(row,field)=>row[field].slice(0,cap)
  const pass=(row,field)=>any(selection(row,field))
  const result={strategies:{},paired:{},
    distilbertOnlyAcrossBaselines:n(r=>pass(r,'distilbert')&&baselineFields.every(k=>!pass(r,k))),
    combinedSelectorDistilbertAny:n(r=>pass(r,'distilbert')||pass(r,'selector'))}
  for(const field of fields){
    const passes=n(r=>pass(r,field)), uniform=n(r=>all(selection(r,field)))
    result.strategies[field]={coverage:n(r=>selection(r,field).some(c=>c.eligible)),
      none:outcomes.length-passes,some:passes-uniform,all:uniform,any:passes,
      outputs:outcomes.reduce((total,r)=>total+selection(r,field).length,0)}
  }
  for(const field of baselineFields){
    result.paired[field]={both:n(r=>pass(r,'distilbert')&&pass(r,field)),
      distilbertOnly:n(r=>pass(r,'distilbert')&&!pass(r,field)),
      baselineOnly:n(r=>!pass(r,'distilbert')&&pass(r,field)),
      neither:n(r=>!pass(r,'distilbert')&&!pass(r,field))}
  }
  return result
}
const summary={rows:outcomes.length,baselineGateChanges,capTwo:metrics(2),unrestricted:metrics(Infinity)}
writeFileSync(join(work,'comparison.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'})
writeFileSync(join(work,'outcomes.jsonl.gz'),gzipSync(outcomes.map(row=>JSON.stringify(row)).join('\n')+'\n'),{flag:'wx'})
console.log(JSON.stringify(summary))
