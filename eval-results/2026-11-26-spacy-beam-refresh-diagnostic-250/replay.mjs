import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {gunzipSync,gzipSync} from 'node:zlib'

const [checkout,archive,destination,knowledgeDir] = process.argv.slice(2).map(value=>resolve(value))
const dynamic = path => import(pathToFileURL(join(checkout,path)))
const [{createReader},{spacyDirect},{spacyBeam}] = await Promise.all([
  dynamic('lib/index.mjs'),dynamic('strategies/spacy-direct/index.mjs'),dynamic('strategies/spacy-beam/index.mjs')
])
const hash = buffer => createHash('sha256').update(buffer).digest('hex')
const sampleBytes = readFileSync(join(archive,'sample.json.gz'))
const rawBytes = readFileSync(join(archive,'dependency-beam.json.gz'))
const env = JSON.parse(readFileSync(join(archive,'environment.json')))
const sample = JSON.parse(gunzipSync(sampleBytes))
const raw = JSON.parse(gunzipSync(rawBytes))
assert.equal(hash(sampleBytes),env.sampleSha256)
assert.equal(sample.length,250)
assert.equal(raw.length,sample.length)
assert.equal(hash(rawBytes),env.experiment.rawSha256)
const readers = new Map()
const traces = new Map()
const evidence = []
const timing = {}
let active
const syntaxModel = {
  async open() {
    return {
      metadata: env.model,
      async parse(text) {
        assert.equal(active.text,text)
        return active.base
      },
      async parseBeam(text) {
        assert.equal(active.text,text)
        return {tokens:active.base, alternatives:active.options}
      },
      async close() {}
    }
  }
}
const save = (file,data) => writeFileSync(join(destination,file),data,{flag:'wx'})
const saveJson = (file,data) => save(file,JSON.stringify(data,null,2)+'\n')
const saveJsonl = (file,data) => save(file,gzipSync(data.map(JSON.stringify).join('\n')+'\n'))
try {
  for (const strategy of [spacyDirect,spacyBeam]) {
    const start = performance.now()
    readers.set(strategy.name,await createReader({strategy,knowledgeDir,syntaxModel}))
    traces.set(strategy.name,[])
    timing[strategy.name] = {startupMs:performance.now()-start}
  }
  for (const [index,{id,text}] of sample.entries()) {
    active = raw[index]
    assert.equal(active.id,id)
    assert.equal(active.text,text)
    evidence.push({id,sourceSha256:hash(text),greedyGraphSha256:hash(JSON.stringify(active.base)),
      beamGraphSha256:hash(JSON.stringify(active.options))})
    for (const [name,reader] of readers) {
      const start = performance.now()
      const result = await reader.propose(text)
      assert.equal(result.error,null,id)
      assert.ok(result.candidates.every(candidate=>candidate.check.valid),id)
      assert.ok(result.candidates.length <= (name==='spacy-direct' ? 1 : 3),id)
      traces.get(name).push({id,evaluatedSchema:'nlu',latencyMs:performance.now()-start,
        candidates:result.candidates.map(({sop})=>sop),checks:result.candidates.map(({check})=>check),
        rejected:result.rejected,diagnostics:result.analysisDiagnostics})
    }
  }
} finally {
  await Promise.allSettled([...readers.values()].map(reader=>reader.close()))
}
mkdirSync(destination,{recursive:true})
save('sample.json.gz',sampleBytes)
saveJsonl('model-evidence.jsonl.gz',evidence)
saveJson('environment.json',{...env,libraryRevision:'0b955a1',strategies:[...readers.keys()],
  experiment:{rawSha256:hash(rawBytes),modelInference:'Saved greedy and beam graphs, no model rerun'},
  verification:'Public createReader adapters with a source-locked shared syntaxModel'})
for (const [name,records] of traces) {
  saveJsonl(name+'.jsonl.gz',records)
  const times = records.map(row=>row.latencyMs).sort((a,b)=>a-b)
  const complete = records.filter(r=>r.checks.some(c=>!c.sourceGaps.materialUnresolved && !c.sourceGaps.materialUncovered)).length
  saveJson(name+'.json',{...timing[name],requests:records.length,withCompleteSource:complete,
    totalCandidates:records.reduce((n,r)=>n+r.candidates.length,0),
    medianMs:(times[124]+times[125])/2, p95Ms:times[Math.ceil(times.length*.95)-1],
    scope:'Public projection and validation, excluding dependency inference'})
}
