import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {join,resolve} from 'node:path'
import {gunzipSync,gzipSync} from 'node:zlib'
import {pathToFileURL} from 'node:url'

const fromCheckout=path=>import(pathToFileURL(resolve(path)))
const [{createReader},{neuroProlog},{createRecordWriter}]=await Promise.all([
  fromCheckout('lib/reader.mjs'),
  fromCheckout('strategies/neuro-prolog/index.mjs'),
  fromCheckout('tests/benchmark/record.mjs')
])

const [source,rawFile,official,out,slice]=process.argv.slice(2)
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const sample=readFileSync(join(source,'sample.json.gz'))
const raw=readFileSync(rawFile)
const evidenceBytes=readFileSync(join(official,'model-evidence.jsonl.gz'))
const rows=JSON.parse(gunzipSync(sample))
const {results,sourceSha256}=JSON.parse(gunzipSync(raw))
const [model]=results
const graphEvidence=gunzipSync(evidenceBytes).toString().trim().split('\n').map(JSON.parse)
if (sha(sample)!==sourceSha256 || results.length!==1 || model.metadata.model!=='core_web_trf' ||
   rows.length!==1861 || graphEvidence.length!==rows.length || model.predictions.length!==rows.length ||
   !rows.every(({id,text},i)=>id===graphEvidence[i].id && id===model.predictions[i].id &&
     text===model.predictions[i].text && sha(text)===graphEvidence[i].sourceSha256 &&
     sha(JSON.stringify(model.predictions[i].tokens))===graphEvidence[i].graphSha256)) {
  throw Error('Source/graph digest mismatch')
}
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()
if (!revision.startsWith('24f248b')) throw Error('Wrong isolated replay revision')
const sliceRows=JSON.parse(readFileSync(slice)).rows
const knownIds=new Set(sliceRows.map(r=>r.id))
if (knownIds.size!==250) throw Error('Wrong diagnostic slice size')
let active
const syntaxModel={async open(){return {metadata:model.metadata,async close(){},async parse(text){
  if (!active || text!==active.text) throw Error('Requested graph outside current source')
  active.reads++
  return active.tokens
}}}}
const knowledgeDir=process.env.SOP_KNOWLEDGE_DIR
const record=await createRecordWriter(knowledgeDir)
const opened=performance.now()
const reader=await createReader({strategy:neuroProlog,knowledgeDir,syntaxModel,swipl:process.env.SWIPL})
const startupMs=performance.now()-opened
const predictions=[]
try {
  for (let i=0;i<rows.length;i++){
    const {id,text}=rows[i]
    active={text,tokens:model.predictions[i].tokens,reads:0}
    const start=performance.now()
    const result=await reader.propose(text)
    if (active.reads!==1) throw Error('Unexpected graph request count for '+id)
    predictions.push({id,latencyMs:performance.now()-start,...record(text,result)})
  }
} finally {await reader.close()}
const wallMs=performance.now()-opened
const ordered=predictions.map(r=>r.latencyMs).sort((a,b)=>a-b)
const timing={startupMs,wallMs,requests:predictions.length,errors:predictions.filter(r=>r.error).length,
  mappingMedianMs:ordered[Math.ceil(ordered.length*.50)-1],mappingP95Ms:ordered[Math.ceil(ordered.length*.95)-1]}
const jsonl=(file,rows)=>writeFileSync(file,gzipSync(rows.map(x=>JSON.stringify(x)).join('\n')+'\n'))
const original=JSON.parse(readFileSync(join(source,'environment.json')))
for (const [label,cohort] of [['historical',rows],['slice',sliceRows.map(r=>rows.find(x=>x.id===r.id))]]) {
  const directory=join(out,label)
  mkdirSync(directory,{recursive:true})
  const set=new Set(cohort.map(x=>x.id))
  const cohortBytes=label==='historical'?sample:gzipSync(JSON.stringify(cohort))
  const byId=new Map(predictions.filter(x=>set.has(x.id)).map(x=>[x.id,x]))
  const evidenceById=new Map(graphEvidence.filter(x=>set.has(x.id)).map(x=>[x.id,x]))
  writeFileSync(join(directory,'sample.json.gz'),cohortBytes)
  jsonl(join(directory,'neuro-prolog.jsonl.gz'),cohort.map(r=>byId.get(r.id)))
  jsonl(join(directory,'model-evidence.jsonl.gz'),cohort.map(r=>evidenceById.get(r.id)))
  writeFileSync(join(directory,'environment.json'),JSON.stringify({...original,
    sample:cohort.length,sampleSha256:sha(cohortBytes),libraryRevision:revision,projectorRevision:'fb8fa5b',
    workers:1,strategies:['neuro-prolog'],evaluatedSchema:'nlu',model:model.metadata,
    measurement:'Serial frozen-graph replay. Mapping timing excludes dependency inference.',
    rawSha256:sha(raw),officialGraphEvidenceSha256:sha(evidenceBytes)},null,2)+'\n')
  writeFileSync(join(directory,'neuro-prolog.json'),JSON.stringify({...timing,timingCohort:'historical',sample:cohort.length},null,2)+'\n')
}
console.log(JSON.stringify(timing))
