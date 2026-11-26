import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'

const archive=path=>gunzipSync(readFileSync(new URL(path,import.meta.url))).toString()
const hash=value=>createHash('sha256').update(value).digest('hex')
const expected=[
  ['compact','neural-dependency-dev100','core_web_sm'],
  ['transformer','transformer-dependency-dev100','core_web_trf']
]
for (const [run,rawDirectory,modelName] of expected) {
  const raw=JSON.parse(archive('../2026-11-26-'+rawDirectory+'/raw.json.gz')).results[0]
  const evidence=archive('./'+run+'/inference/model-evidence.jsonl.gz').trim().split('\n').map(JSON.parse)
  const predictions=archive('./'+run+'/inference/spacy-direct.jsonl.gz').trim().split('\n').map(JSON.parse)
  const environment=JSON.parse(readFileSync(new URL('./'+run+'/inference/environment.json',import.meta.url)))
  if (environment.model.model!==modelName || raw.metadata.model!==modelName ||
    environment.model.modelVersion!==raw.metadata.modelVersion || evidence.length!==100 ||
    predictions.length!==100 || raw.predictions.length!==100 || !raw.predictions.every((row,i)=>
      row.id===evidence[i].id && row.id===predictions[i].id &&
      hash(row.text)===evidence[i].sourceSha256 && hash(JSON.stringify(row.tokens))===evidence[i].graphSha256)) {
    throw Error('Frozen graph evidence or named model differs for '+run)
  }
  const timing=JSON.parse(readFileSync(new URL('./'+run+'/inference/spacy-direct.json',import.meta.url)))
  const ordered=predictions.map((row,i)=>row.latencyMs+evidence[i].latencyMs).sort((a,b)=>a-b)
  if (Math.abs(ordered[49]-timing.modelAndMapping.medianMs)>1e-7 ||
    Math.abs(ordered[94]-timing.modelAndMapping.p95Ms)>1e-7) {
    throw Error('Recorded timings do not match per-request measurements for '+run)
  }
  console.log(run,modelName,'100 exact frozen source/graph digests and timing percentiles verified')
}
