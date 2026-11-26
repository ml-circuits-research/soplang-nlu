import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'

const bytes = path => readFileSync(new URL(path,import.meta.url))
const jsonl = path => gunzipSync(bytes(path)).toString().trim().split('\n').map(JSON.parse)
const hash = text => createHash('sha256').update(text).digest('hex')
const inputs = bytes('./inference/sample.json.gz')
const rows = JSON.parse(gunzipSync(inputs))
if (!inputs.equals(bytes('./compact/inference/sample.json.gz')) || rows.length !== 1861 ||
    new Set(rows.map(row=>row.id)).size !== rows.length) throw Error('Historical cohort mismatch')
for (const prefix of ['./inference/','./compact/inference/']) {
  const env = JSON.parse(bytes(prefix+'environment.json'))
  const predictors = jsonl(prefix+'spacy-direct.jsonl.gz')
  const evidence = jsonl(prefix+'model-evidence.jsonl.gz')
  if (env.sampleSha256 !== hash(inputs) || rows.length !== predictors.length ||
      rows.length !== evidence.length || !rows.every(({id,text},i) =>
        predictors[i].id === id && predictors[i].candidates.length === 1 &&
        evidence[i].id === id && evidence[i].sourceSha256 === hash(text))) {
    throw Error('Input or candidate mismatch for ' + env.model.model)
  }
  console.log(env.model.model + ' has one public circuit per frozen source with matching digests')
}
