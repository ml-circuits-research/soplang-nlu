import {gunzipSync,gzipSync} from 'node:zlib'
import {readFileSync,writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {projectDependencies} from '../../strategies/spacy-direct/project.mjs'
import {createAnalysisValidator,hasCompleteSource} from '../../lib/check-analysis.mjs'
const [input,output,installation]=process.argv.slice(2)
const rows=JSON.parse(gunzipSync(readFileSync(input)))
const validate=await createAnalysisValidator({knowledgeDir: installation ?? fileURLToPath(new URL('../../../sop-knowledge-worlds', import.meta.url))})
const final=[]
let base=0,all=0,changed=0,identical=0,distinct=0
for(const {id,text,base:tokens,options,beamMs,greedyMs} of rows){
 const candidates=[]
 function apply(seq,prob){
  const {sop}=projectDependencies(text,seq),check=validate(text,sop)
  if(candidates.some(c=>c.sop===sop)) return
  candidates.push({sop,complete:hasCompleteSource(check),prob})
 }
 apply(tokens,null);base+=candidates[0].complete
 for(const {score,tokens:seq} of options){
  if(seq.every((t,i)=>t.dep===tokens[i].dep && t.head===tokens[i].head))identical++
  apply(seq,score)
 }
 distinct+=candidates.length
 const complete=candidates.filter(c=>c.complete)
 all+=complete.length>0;changed+=complete.some(c=>c.prob!==null)
 final.push({id,text,greedyMs,beamMs,candidates})
}
console.log({base,all,changed,identical,distinct,n:rows.length})
writeFileSync(output,gzipSync(JSON.stringify(final)))
