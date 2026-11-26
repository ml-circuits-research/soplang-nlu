import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
const [dataset,historicalFile,out,knowledgeDir]=process.argv.slice(2)
const load=path=>import(pathToFileURL(resolve(path)))
const [{readCommittedRows,datasetRevision}, {trainExampleTransfer}]=await Promise.all([
  load('tests/benchmark/train-split.mjs'),load('strategies/prolog-example-transfer/index.mjs')])
const lock=JSON.parse(readFileSync('tests/benchmark/fresh-1pct.lock.json'))
const revision=datasetRevision(dataset,lock.datasetRevision)
const digest=content=>createHash('sha256').update(content).digest('hex')
const historicalBytes=readFileSync(historicalFile)
const historical=JSON.parse(gunzipSync(historicalBytes))
if (historical.length!==1861) throw Error('Expected all 1,861 historical rows')
const historicalIds=new Set(historical.map(r=>r.id))
const historicalTexts=new Set(historical.map(r=>r.text))
const rows=[]
const splitStart=performance.now()
for await(const row of readCommittedRows(dataset,revision)) rows.push(row)
const fresh=rows.map((row,index)=>({index,rank:digest(lock.seed+'\0'+row.id)}))
 .sort((a,b)=>a.rank.localeCompare(b.rank)).slice(0,Math.max(1,Math.round(rows.length*lock.percent/100)))
 .map(r=>rows[r.index])
const freshIds=new Set(fresh.map(r=>r.id))
const freshTexts=new Set(fresh.map(r=>r.text))
const excluded={historicalOnly:{rows:0,circuits:0},freshOnly:{rows:0,circuits:0},both:{rows:0,circuits:0}}
const trHash=createHash('sha256'),exHash=createHash('sha256')
const training=[]
const seenHistoricalIds=new Set()
let historicalIdsWithTextsOutsideHistoricalSet=0, trainingCircuits=0
for (const row of rows) {
  const historicalId=historicalIds.has(row.id)
  if (historicalId) seenHistoricalIds.add(row.id)
  const h=historicalTexts.has(row.text),f=freshTexts.has(row.text)
  if (historicalId && !h) historicalIdsWithTextsOutsideHistoricalSet++
  if(h||f||historicalId||freshIds.has(row.id)){
    const family=(h||historicalId)&&(f||freshIds.has(row.id))?'both':h||historicalId?'historicalOnly':'freshOnly'
    excluded[family].rows++
    excluded[family].circuits+=row.references.length
    exHash.update(JSON.stringify(row)+'\n')
  }else{
    training.push({text:row.text,references:row.references})
    trainingCircuits+=row.references.length
    trHash.update(JSON.stringify(row)+'\n')
  }
}
const trainingTexts=new Set(training.map(r=>r.text))
const overlap={
  historical:[...historicalTexts].filter(t=>trainingTexts.has(t)).length,
  sealed:[...freshTexts].filter(t=>trainingTexts.has(t)).length,
  betweenExcludedSlices:[...historicalTexts].filter(t=>freshTexts.has(t)).length,
  betweenExcludedIds:[...historicalIds].filter(t=>freshIds.has(t)).length
}
if(overlap.historical||overlap.sealed) throw Error('Training data overlaps an excluded exact source')
const splitMs=performance.now()-splitStart
const started=performance.now()
const model=await trainExampleTransfer(training,{knowledgeDir})
const trainingMs=performance.now()-started
const encoded=JSON.stringify(model)+'\n'
mkdirSync(out,{recursive:true})
writeFileSync(out+'/model.json',encoded)
const meta={revision,splitMethod:'Exclude full historical and sealed random sample by row ID and exact source text',
population:rows.length,historicalRows:historical.length,historicalExactTexts:historicalTexts.size,
historicalIdsPresentInPinnedDataset:seenHistoricalIds.size,historicalIdsWithTextsOutsideHistoricalSet,historicalSampleSha256:digest(historicalBytes),
sealedRows:fresh.length,sealedExactTexts:freshTexts.size,sealedSortedIdSha256:digest(JSON.stringify([...freshIds].sort())),
lockedSeedSha256:digest(lock.seed),excluded,overlap,trainingRows:training.length,trainingTexts:trainingTexts.size,
trainingCircuits,trainingSha256:trHash.digest('hex'),excludedSha256:exHash.digest('hex'),splitMs,trainingMs,
modelSha256:digest(encoded),modelVersion:model.version,modelTemplates:model.templates.length,modelTraining:model.training}
writeFileSync(out+'/prolog-example-transfer-training.json',JSON.stringify(meta,null,2)+'\n')
console.log(JSON.stringify(meta))
