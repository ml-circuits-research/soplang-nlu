// Select a candidate for verification; a rank score never becomes a label.
import {readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {gunzipSync,gzipSync} from 'node:zlib'
import {selectorChoices} from '../../../strategies/neuro-selector/features.mjs'
import {selectReadings} from '../../../strategies/neuro-selector/score.mjs'
import {createAnalysisValidator,hasCompleteSource} from '../../../lib/check-analysis.mjs'

const [dir,partsArgument='6']=process.argv.slice(2)
if(!dir)throw Error('Expected tranche directory')
const root=fileURLToPath(new URL('../../../',import.meta.url))
const knowledgeDir=resolve(process.env.SOP_KNOWLEDGE_DIR ?? join(root,'../sop-knowledge-worlds'))
const {parse}=await import(pathToFileURL(join(knowledgeDir,'tools/sopworld/sopworld.mjs')))
const check=await createAnalysisValidator({knowledgeDir})
const model=JSON.parse(readFileSync(join(root,'strategies/neuro-selector/model.json')))
const sample=JSON.parse(gunzipSync(readFileSync(join(dir,'sample.json.gz'))))
const available=new Map()
for(let i=0;i<Number(partsArgument);i++){
  const path=join(dir,'part-'+i,'pool.jsonl.gz')
  const timing=JSON.parse(readFileSync(path+'.timing.json'))
  const rows=gunzipSync(readFileSync(path)).toString().trim().split('\n').map(JSON.parse)
  if(timing.rows!==rows.length)throw Error('Unsealed shard')
  for(const row of rows){
    if(available.has(row.id))throw Error('Duplicate source')
    available.set(row.id,row)
  }
}
if(available.size!==sample.length)throw Error('Incomplete collection')
const pool=[]
const failed=[]
for(const {id,text} of sample){
  const row=available.get(id)
  if(row?.text!==text)throw Error('Source mismatch')
  const options=selectorChoices(text,row.candidates,parse)
  const [best]=selectReadings(options,model)
  let candidates=[]
  if(best) {
    const sop=options.candidates[best.index].sop
    if(!hasCompleteSource(check(text,sop)))throw Error('Source gate drift at '+id)
    candidates=[{family:'selected-for-review',rank:0,sop,eligible:true}]
  } else failed.push({id,text})
  pool.push({id,text,candidates})
}
const write=(name,rows)=>writeFileSync(join(dir,name),gzipSync(rows.map(r=>JSON.stringify(r)).join('\n')+'\n'),{flag:'wx'})
write('sources.jsonl.gz',sample)
write('pool.jsonl.gz',pool)
write('no-complete-proposal.jsonl.gz',failed)
writeFileSync(join(dir,'pool.jsonl.gz.timing.json'),JSON.stringify({rows:pool.length,shards:Number(partsArgument)})+'\n',{flag:'wx'})
console.log(JSON.stringify({sample:pool.length,forReview:pool.length-failed.length,withoutCompleteProposal:failed.length}))
