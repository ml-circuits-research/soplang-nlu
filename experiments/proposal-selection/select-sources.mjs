import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {gunzipSync,gzipSync} from 'node:zlib'
import {readCommittedRows,datasetRevision} from '../../tests/benchmark/train-split.mjs'

const [dataset,historical,oldTraining,diagnosticSelection,output] = process.argv.slice(2)
if (!output) throw Error('Usage: select-sources.mjs DATASET HISTORICAL_GZ PRIOR_TRAINING_GZ DIAGNOSTIC_JSON OUTPUT')
const lock = JSON.parse(readFileSync(new URL('../../tests/benchmark/fresh-1pct.lock.json',import.meta.url)))
const revision = datasetRevision(dataset,lock.datasetRevision)
const sha = value => createHash('sha256').update(value).digest('hex')
const rank = (pool,seed) => pool.map(row=>({row,key:sha(seed+'\0'+row.id)}))
  .sort((a,b)=>a.key.localeCompare(b.key)).map(item=>item.row)
const seed='webmeet-neuro-selector-supervision-600-v1'
const bytes = Object.fromEntries(Object.entries({historical,oldTraining,diagnosticSelection}).map(
  ([key,value])=>[key,readFileSync(value)]))
const historicalRows = JSON.parse(gunzipSync(bytes.historical))
const priorRows = JSON.parse(gunzipSync(bytes.oldTraining))
if (historicalRows.length!==1861 || priorRows.length!==600) throw Error('Unexpected exclusion cohort')
const records = new Map(historicalRows.map(({id,text})=>[id,text]))
const historicalTexts=new Set(records.values())
const oldTrainingTexts=new Set(priorRows.map(row=>row.text))
const diagnostic=JSON.parse(bytes.diagnosticSelection)
const diagnosticRows=diagnostic.rows.map(({id,sha256})=>{
  if (sha(diagnostic.seed+'\0'+id)!==sha256 || !records.has(id)) throw Error('Invalid diagnostic rank/ID')
  return {id,text:records.get(id)}
})
if (diagnosticRows.length!==250 || new Set(diagnosticRows.map(row=>row.id)).size!==250) {
  throw Error('Unexpected diagnostic cohort')
}
const pool=[]
for await (const {id,text} of readCommittedRows(dataset,revision)) pool.push({id,text})
const freshCount=Math.max(1,Math.round(pool.length*lock.percent/100))
const sealedTexts=new Set(rank(pool,lock.seed).slice(0,freshCount).map(row=>row.text))
const seen=new Set()
const allowed=[]
let excludedRows=0
for (const row of rank(pool,seed)) {
  if (historicalTexts.has(row.text)||oldTrainingTexts.has(row.text)||sealedTexts.has(row.text)) {
    excludedRows++
  } else if (row.text.trim() && !seen.has(row.text)) {
    seen.add(row.text)
    if (allowed.length<600) allowed.push(row)
  }
}
if (allowed.length!==600 || allowed.some(({text})=>historicalTexts.has(text)||oldTrainingTexts.has(text)||sealedTexts.has(text))) {
  throw Error('Could not prove permitted 600-text split')
}
const split={trainIds:allowed.slice(0,500).map(row=>row.id),validationIds:allowed.slice(500).map(row=>row.id)}
function save(name,rows) {
  const dir=join(output,name)
  mkdirSync(dir,{recursive:true})
  const encoded=gzipSync(rows.map(row=>JSON.stringify(row)).join('\n')+'\n')
  writeFileSync(join(dir,'sources.jsonl.gz'),encoded,{flag:'wx'})
  return sha(encoded)
}
const manifest={revision,seed,population:pool.length,excludedRows,trainRows:500,validationRows:100,
  exactOverlap:{historical:0,earlierModelTraining:0,sealedFresh:0},
  excludedExactTexts:{historical:historicalTexts.size,earlierModelTraining:oldTrainingTexts.size,sealedFresh:sealedTexts.size},
  sourceDigests:Object.fromEntries(Object.entries(bytes).map(([key,value])=>[key,sha(value)])),
  trainingSourcesSha256:save('train',allowed),diagnosticSourcesSha256:save('diagnostic',diagnosticRows)}
const splitBytes=JSON.stringify(split,null,2)+'\n'
writeFileSync(join(output,'train','split.json'),splitBytes,{flag:'wx'})
writeFileSync(join(output,'selection.json'),JSON.stringify({...manifest,splitSha256:sha(splitBytes)},null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(manifest))
