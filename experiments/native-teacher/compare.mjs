import {readFileSync,writeFileSync} from 'node:fs'
import {gunzipSync,gzipSync} from 'node:zlib'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {selectorChoices} from '../../strategies/neuro-selector/features.mjs'
import {selectReadings} from '../../strategies/neuro-selector/score.mjs'
import {createAnalysisValidator,hasCompleteSource} from '../../lib/check-analysis.mjs'

const [teacherDir,poolDir,knowledgeDir] = process.argv.slice(2)
if (!knowledgeDir) throw Error('Usage: compare.mjs TEACHER_DIR POOL_TRAIN_DIR KNOWLEDGE_DIR')
const rows = (dir,name) => gunzipSync(readFileSync(join(dir,name))).toString().trim().split('\n').map(JSON.parse)
const key=(id,sop)=>JSON.stringify([id,sop])
const votes=dir=>new Map(rows(dir,'votes.jsonl.gz').map(({id,sop,accepted})=>[key(id,sop),accepted]))
const teacherVotes=votes(teacherDir), baselineVotes=votes(poolDir)
const baseline=new Map(rows(poolDir,'pool.jsonl.gz').map(row=>[row.id,row]))
const model=JSON.parse(readFileSync(new URL('../../strategies/neuro-selector/model.json',import.meta.url)))
const {parse}=await import(pathToFileURL(join(resolve(knowledgeDir),'tools/sopworld/sopworld.mjs')))
const validate=await createAnalysisValidator({knowledgeDir})
const assess=(votes,id,candidate)=>{
  const accepted=votes.get(key(id,candidate.sop))
  if(candidate.eligible&&typeof accepted!=='boolean')throw Error('Missing exact vote for '+id)
  return {...candidate,accepted:candidate.eligible&&accepted}
}
const outcomes=rows(teacherDir,'pool.jsonl.gz').map(({id,text,candidates})=>{
  const archived=baseline.get(id)
  if(archived?.text!==text||candidates.length>1)throw Error('Unmatched baseline source or multiple teacher results')
  const input=selectorChoices(text,archived.candidates,parse)
  const outputs=selectReadings(input,model).map(({index,probability})=>({sop:input.candidates[index].sop,eligible:true,probability}))
  const selector=(outputs.length?outputs:archived.candidates.slice(0,1)).map(c=>assess(baselineVotes,id,c))
  const teacher=candidates.map(c=>{
    if(c.eligible!==hasCompleteSource(validate(text,c.sop)))throw Error('Teacher static validation drift at '+id)
    return assess(teacherVotes,id,c)
  })
  const poolAny=input.candidates.some(c=>assess(baselineVotes,id,{...c,eligible:true}).accepted)
  return {id,text,selector,teacher,poolAny,
    teacherDuplicate:teacher.some(c=>input.candidates.some(known=>known.sop===c.sop))}
})
const n=(predicate)=>outcomes.filter(predicate).length
const any=array=>array.some(c=>c.accepted)
const all=array=>array.length>0&&array.every(c=>c.accepted)
const coverage=array=>array.some(c=>c.eligible)
const metrics=field=>({coverage:n(r=>coverage(r[field])),any:n(r=>any(r[field])),all:n(r=>all(r[field]))})
const summary={total:outcomes.length,teacher:metrics('teacher'),selector:metrics('selector'),
  bothAny:n(r=>any(r.teacher)&&any(r.selector)),teacherOnlyAny:n(r=>any(r.teacher)&&!any(r.selector)),
  selectorOnlyAny:n(r=>!any(r.teacher)&&any(r.selector)),neitherAny:n(r=>!any(r.teacher)&&!any(r.selector)),
  teacherBeyondPool:n(r=>any(r.teacher)&&!r.poolAny),teacherAcceptedExactPoolMatch:n(r=>any(r.teacher)&&r.teacherDuplicate),
  poolAny:n(r=>r.poolAny)}
const write=(name,value)=>writeFileSync(join(teacherDir,name),value,{flag:'wx'})
const pack=items=>gzipSync(items.map(x=>JSON.stringify(x)).join('\n')+'\n')
write('comparison.json',JSON.stringify(summary,null,2)+'\n')
write('outcomes.jsonl.gz',pack(outcomes))
write('accepted-supervision.jsonl.gz',pack(outcomes.filter(r=>any(r.teacher)).map(({id,text,teacher})=>({id,text,sop:teacher[0].sop}))))
console.log(JSON.stringify(summary))
