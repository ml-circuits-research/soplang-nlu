import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'

const archive = path => gunzipSync(readFileSync(new URL(path, import.meta.url))).toString()
const jsonl = path => archive(path).trim().split('\n').map(JSON.parse)
const hash = input => createHash('sha256').update(input).digest('hex')
for (const [name,rawFolder,measurement] of [
  ['compact','neural-dependency-dev100','compact/serial-timing'],
  ['transformer','transformer-dependency-dev100','transformer/inference']
]) {
  const graphs = JSON.parse(archive('../2026-11-26-'+rawFolder+'/raw.json.gz')).results[0].predictions
  const evidence = jsonl('./'+measurement+'/model-evidence.jsonl.gz')
  if (graphs.length !== evidence.length || !graphs.every((row,i) =>
    row.id === evidence[i].id && hash(row.text) === evidence[i].sourceSha256 &&
    hash(JSON.stringify(row.tokens)) === evidence[i].graphSha256)) {
    throw Error('The direct and raw '+name+' graphs differ')
  }
  console.log('Matching '+name+' source and graph digests for all '+graphs.length+' inputs')
}
const parallel = jsonl('./compact/inference/spacy-direct.jsonl.gz')
const serial = jsonl('./compact/serial-timing/spacy-direct.jsonl.gz')
if (parallel.length !== serial.length || !parallel.every((row,i) =>
  row.id === serial[i].id && JSON.stringify(row.candidates) === JSON.stringify(serial[i].candidates))) {
  throw Error('Compact serial and parallel public candidates differ')
}
console.log('Matching compact serial and parallel candidates for all '+parallel.length+' inputs')
