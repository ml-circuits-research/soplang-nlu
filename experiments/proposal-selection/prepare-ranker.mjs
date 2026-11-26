// Convert one already-reviewed pool into features for one named split.
// The diagnostic pool is prepared only after the selected ranker is sealed.
import {readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {gunzipSync,gzipSync} from 'node:zlib'
import {selectorChoices} from '../../strategies/neuro-selector/features.mjs'

const [directory,split,out,names]=process.argv.slice(2)
if(!['train','validation','diagnostic'].includes(split)||!out||!names)throw Error('Expected DIRECTORY SPLIT OUTPUT FEATURE_NAMES')
const rows=name=>gunzipSync(readFileSync(join(directory,name))).toString().trim().split('\n').filter(Boolean).map(JSON.parse)
const {parse}=await import(pathToFileURL(join(resolve(process.env.SOP_KNOWLEDGE_DIR ?? '../sop-knowledge-worlds'),'tools/sopworld/sopworld.mjs')))
const subset=split==='diagnostic'?undefined:new Set(JSON.parse(readFileSync(join(directory,'split.json')))[split==='train'?'trainIds':'validationIds'])
const votes=new Map()
for(const v of rows('votes.jsonl.gz')) {
  const key=JSON.stringify([v.id,v.sop])
  if(typeof v.accepted!=='boolean' || votes.has(key)&&votes.get(key)!==v.accepted)throw Error('Invalid or conflicting candidate vote')
  votes.set(key,v.accepted)
}
let ordered
const examples=[]
for(const row of rows('pool.jsonl.gz')){
  if(subset&&!subset.has(row.id))continue
  const {featureNames,candidates}=selectorChoices(row.text,row.candidates,parse)
  if(featureNames.length){
    if(ordered&&JSON.stringify(featureNames)!==JSON.stringify(ordered))throw Error('Feature order changed')
    ordered=featureNames
  }
  for(const c of candidates){
    const key=JSON.stringify([row.id,c.sop])
    if(!votes.has(key))throw Error('Missing eligible circuit judgment at '+row.id)
    c.accepted=votes.get(key)
  }
  examples.push({id:row.id,split,candidates})
}
if(!ordered||subset&&examples.length!==subset.size)throw Error('Incomplete split')
writeFileSync(out,gzipSync(examples.map(r=>JSON.stringify(r)).join('\n')+'\n'),{flag:'wx'})
if(split==='train')writeFileSync(names,JSON.stringify(ordered)+'\n',{flag:'wx'})
else if(JSON.stringify(ordered)!==JSON.stringify(JSON.parse(readFileSync(names))))throw Error('Feature names differ from training')
console.log(JSON.stringify({split,rows:examples.length,features:ordered.length}))
