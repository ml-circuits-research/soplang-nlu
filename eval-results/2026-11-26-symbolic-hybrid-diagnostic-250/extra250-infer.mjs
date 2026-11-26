import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {gunzipSync,gzipSync} from 'node:zlib'
import {execFileSync} from 'node:child_process'
const [cohort,beamFile,out,knowledgeDir,z3Path,swipl,modelPath]=process.argv.slice(2).map(value=>resolve(value))
const load=path=>import(pathToFileURL(resolve(path)))
const [{createReader},{createRecordWriter},{z3},{prolog},{prologExampleTransfer},{neuroZ3},z3Module] = await Promise.all([
  load('lib/reader.mjs'),load('tests/benchmark/record.mjs'),load('strategies/z3/index.mjs'),
  load('strategies/prolog/index.mjs'),load('strategies/prolog-example-transfer/index.mjs'),
  load('strategies/neuro-z3/index.mjs'),load(z3Path)])
const sha=x=>createHash('sha256').update(x).digest('hex')
const sampleBytes=readFileSync(join(cohort,'sample.json.gz'))
const beamBytes=readFileSync(beamFile)
const rows=JSON.parse(gunzipSync(sampleBytes))
const raw=JSON.parse(gunzipSync(beamBytes))
const env=JSON.parse(readFileSync(join(cohort,'environment.json')))
const expected=gunzipSync(readFileSync(join(cohort,'model-evidence.jsonl.gz'))).toString().trim().split('\n').map(JSON.parse)
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()
assert.ok(revision.startsWith('0b955a1'))
assert.equal(rows.length,250)
assert.equal(sha(sampleBytes),env.sampleSha256)
assert.equal(sha(beamBytes),env.experiment.rawSha256)
assert.equal(raw.length,250)
assert.equal(expected.length,250)
assert.ok(rows.every(({id,text},i)=>raw[i].id===id && raw[i].text===text && expected[i].id===id &&
  expected[i].sourceSha256===sha(text) && expected[i].greedyGraphSha256===sha(JSON.stringify(raw[i].base))))
let active
const syntaxModel={async open(){return {metadata:env.model,async parse(text){
  assert.equal(active.text,text)
  active.reads++
  return active.base
},async close(){}}}}
const plans={
  z3:[z3,{z3Module,topK:8}],
  'prolog-worlds':[prolog,{swipl,evidence:true}],
  'prolog-example-transfer':[prologExampleTransfer,{swipl,evidence:true,modelPath}],
  'neuro-z3':[neuroZ3,{z3Module,syntaxModel}]
}
mkdirSync(out,{recursive:true})
const save=(file,contents)=>writeFileSync(join(out,file),contents,{flag:'wx'})
const write=(file,contents)=>save(file,JSON.stringify(contents,null,2)+'\n')
save('sample.json.gz',sampleBytes)
write('environment.json',{...env,libraryRevision:revision,strategies:Object.keys(plans),workers:1,
  evaluation:'Public createReader; isolated serial per-engine; model inference excluded; frozen same-input greedy transformer graph for neuro-Z3',
  graphSha256:sha(beamBytes),trainingModelSha256:sha(readFileSync(modelPath))})
const record=await createRecordWriter(knowledgeDir)
for(const [name,[strategy,options]] of Object.entries(plans)){
  const startup=performance.now()
  let modelLoadMs
  const wrapped={...strategy,async open(config){
    const engine=await strategy.open(config)
    modelLoadMs=engine.modelLoadMs
    return engine
  }}
  const reader=await createReader({strategy:wrapped,knowledgeDir,...options})
  const startupMs=performance.now()-startup
  const answers=[]
  try{
    for(const [{id,text},item] of rows.map((r,i)=>[r,raw[i]])){
      active={...item,reads:0}
      const started=performance.now()
      const res=await reader.propose(text)
      const latencyMs=performance.now()-started
      if(name==='neuro-z3') assert.equal(active.reads,1)
      const transferred=(res.legacy?.candidates??[]).filter(c=>c.source==='prolog-example-transfer')
      answers.push({id,latencyMs,...record(text,res),
        ...(name==='prolog-example-transfer'?{transferLegacyCandidates:transferred.length,
          transferNativeSops:[...new Set(transferred.flatMap(c=>c.analysisSop?[c.analysisSop]:[]))]}:{})})
    }
  }finally{await reader.close()}
  const wallMs=performance.now()-startup
  save(name+'.jsonl.gz',gzipSync(answers.map(r=>JSON.stringify(r)).join('\n')+'\n'))
  const times=answers.map(r=>r.latencyMs).sort((a,b)=>a-b)
  const summary={startupMs,modelLoadMs,wallMs,requests:answers.length,medianMs:(times[124]+times[125])/2,
    p95Ms:times[Math.ceil(.95*times.length)-1],errors:answers.filter(r=>r.error).length,
    totalCandidates:answers.reduce((n,r)=>n+r.candidates.length,0),
    withCompleteSource:answers.filter(r=>r.checks.some(c=>c.valid&&c.coverage.allAccountedFor&&
      !c.sourceGaps.materialUnresolved&&!c.sourceGaps.materialUncovered)).length}
  write(name+'.json',summary)
  console.log(name,JSON.stringify(summary))
}
