import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'

const file=path=>readFileSync(new URL(path,import.meta.url))
const json=path=>JSON.parse(file(path))
const rows=path=>gunzipSync(file(path)).toString().trim().split('\n').map(JSON.parse)
const sha=value=>createHash('sha256').update(value).digest('hex')
const env=json('./inference/environment.json')
const original=json('./comparators/environment.json')
const train=json('./prolog-example-transfer-training.json')
const sample=file('./inference/sample.json.gz')
assert.equal(env.libraryRevision.slice(0,7),'0b955a1')
assert.equal(env.sampleSha256,sha(sample))
assert.equal(env.sampleSha256,original.sampleSha256)
assert.equal(env.graphSha256,original.experiment.rawSha256)
assert.equal(env.trainingModelSha256,train.modelSha256)
assert.equal(train.overlap.historical,0)
assert.equal(train.overlap.sealed,0)
assert.equal(train.trainingRows + Object.values(train.excluded).reduce((n,part)=>n+part.rows,0),train.population)
const selected=JSON.parse(gunzipSync(sample))
const evidence=rows('./model-evidence.jsonl.gz')
assert.equal(selected.length,250)
assert.equal(evidence.length,selected.length)
for (const [i,row] of selected.entries()){
  assert.equal(evidence[i].id,row.id)
  assert.equal(evidence[i].sourceSha256,sha(row.text))
}
for(const name of env.strategies){
  const predictions=rows('./inference/'+name+'.jsonl.gz')
  assert.equal(predictions.length,selected.length)
  const timing=json('./inference/'+name+'.json')
  assert.equal(timing.errors,predictions.filter(row=>row.error).length)
  const elapsed=predictions.map((row,index)=>{
    assert.equal(row.id,selected[index].id)
    assert.equal(row.candidates.length,row.checks.length)
    assert.ok(row.checks.every(check=>check.valid))
    return row.latencyMs
  }).sort((a,b)=>a-b)
  assert.equal(timing.medianMs,(elapsed[124]+elapsed[125])/2)
  assert.equal(timing.p95Ms,elapsed[237])
}
console.log('Frozen source, training exclusions, public validation records and reported timings verified')
