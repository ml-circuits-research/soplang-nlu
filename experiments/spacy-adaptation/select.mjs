import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {gunzipSync,gzipSync} from 'node:zlib'
import {readCommittedRows,datasetRevision} from '../../tests/benchmark/train-split.mjs'

const [dataset,historical,output] = process.argv.slice(2)
if (!output) throw Error('Usage: select.mjs DATASET HISTORICAL_SAMPLE_GZ OUTPUT')
const lock = JSON.parse(readFileSync(new URL('../../tests/benchmark/fresh-1pct.lock.json',import.meta.url)))
const revision = datasetRevision(dataset,lock.datasetRevision)
const hash = value => createHash('sha256').update(value).digest('hex')
const rank = (pool,seed) => pool.map(row=>({row,score:hash(seed+'\0'+row.id)}))
  .sort((a,b)=>a.score.localeCompare(b.score)).map(item=>item.row)
const seed='webmeet-spacy-compact-pilot-600-v1'
const validationSeed='webmeet-spacy-compact-pilot-validation-v1'
const pool=[]
for await (const {id,text} of readCommittedRows(dataset,revision)) pool.push({id,text})
const count=Math.max(1,Math.round(pool.length*lock.percent/100))
const sealedTexts=new Set(rank(pool,lock.seed).slice(0,count).map(row=>row.text))
const historicalBytes=readFileSync(historical)
const historicalTexts=new Set(JSON.parse(gunzipSync(historicalBytes)).map(row=>row.text))
const seen=new Set()
const selected=[]
let excludedRows=0
for (const row of rank(pool,seed)) {
  if (sealedTexts.has(row.text)||historicalTexts.has(row.text)) {excludedRows++;continue}
  if (!row.text.trim() || seen.has(row.text)) continue
  seen.add(row.text)
  if (selected.length<600) selected.push(row)
}
if (selected.length!==600 || selected.some(row=>sealedTexts.has(row.text)||historicalTexts.has(row.text))) {
  throw Error('The experiment cannot prove a leak-free 600-text selection')
}
const validationIds=new Set(rank(selected,validationSeed).slice(0,90).map(row=>row.id))
const rows=selected.map(row=>({...row,split:validationIds.has(row.id)?'validation':'train'}))
const packed=gzipSync(JSON.stringify(rows))
mkdirSync(output,{recursive:true})
writeFileSync(join(output,'training-sources.json.gz'),packed,{flag:'wx'})
const manifest={revision,population:pool.length,seed,validationSeed,trainRows:510,validationRows:90,
  historicalSampleSha256:hash(historicalBytes),historicalExactTexts:historicalTexts.size,
  sealedPopulationRows:count,sealedExactTexts:sealedTexts.size,excludedRows,
  exactOverlapHistorical:0,exactOverlapSealed:0,trainingSourcesSha256:hash(packed)}
writeFileSync(join(output,'selection.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(manifest))
