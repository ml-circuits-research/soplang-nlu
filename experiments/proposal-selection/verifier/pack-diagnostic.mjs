import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {readFileSync,writeFileSync} from 'node:fs'
import {gunzipSync,gzipSync} from 'node:zlib'
import {createAnalysisValidator,hasCompleteSource} from '../../../lib/check-analysis.mjs'
import {directedGraph,sameDirectedGraph} from '../../../lib/directed-graph.mjs'
import {describeGraph} from './describe.mjs'
const [providers,paired,output,evidence]=process.argv.slice(2)
if(!evidence)throw Error('Expected PROVIDER_DIR PAIRED_DIR INPUT_OUTPUT EVIDENCE_OUTPUT')
const rows=path=>gunzipSync(readFileSync(path)).toString().trim().split('\n').filter(Boolean).map(JSON.parse)
const kd=resolve(process.env.SOP_KNOWLEDGE_DIR)
const {parse}=await import(pathToFileURL(join(kd,'tools/sopworld/sopworld.mjs')))
const validate=await createAnalysisValidator({knowledgeDir:kd})
const source=rows(join(providers,'pool.jsonl.gz'))
const pairedRows=new Map(rows(join(paired,'pool.jsonl.gz')).map(r=>[r.id,r]))
const voteKey=(id,sop)=>JSON.stringify([id,sop])
const votes=new Map()
let voteDisagreements=0
for(const dir of [providers,paired]){
  for(const v of rows(join(dir,'votes.jsonl.gz'))){
    const key=voteKey(v.id,v.sop)
    if(votes.has(key)&&votes.get(key)!==v.accepted)voteDisagreements++
    votes.set(key,v.accepted)
  }
}
const records=[],labels=[]
for(const row of source){
  const live=pairedRows.get(row.id)
  if(live?.text!==row.text)throw Error('Mismatched source')
  const items=[...live.candidates.filter(c=>c.family==='base'),...live.candidates.filter(c=>c.family==='extra'),...row.candidates]
  const choices=[],graphs=[],judgments=[]
  for(const c of items){
    if(!hasCompleteSource(validate(row.text,c.sop)))continue
    const wires=parse(c.sop),graph=directedGraph(wires,'strict')
    if(graphs.some(g=>sameDirectedGraph(graph,g)))continue
    const grade=votes.get(voteKey(row.id,c.sop))
    if(typeof grade!=='boolean')throw Error('Missing settled candidate: '+row.id)
    graphs.push(graph)
    choices.push({family:c.family,sop:c.sop,graph:describeGraph(wires)})
    judgments.push(grade)
  }
  records.push({id:row.id,text:row.text,choices})
  labels.push({id:row.id,accepted:judgments,base:live.candidates.filter(c=>c.family==='base').some(c=>votes.get(voteKey(row.id,c.sop))),
    deployedPair:live.candidates.filter(c=>c.family==='combined').some(c=>votes.get(voteKey(row.id,c.sop)))})
}
if(records.length!==pairedRows.size)throw Error('Missing source')
const pack=(f,data)=>writeFileSync(f,gzipSync(data.map(item=>JSON.stringify(item)).join('\n')+'\n'),{flag:'wx'})
pack(output,records);pack(evidence,labels)
console.log(JSON.stringify({rows:records.length,voteDisagreements,choices:records.reduce((n,r)=>n+r.choices.length,0)}))
