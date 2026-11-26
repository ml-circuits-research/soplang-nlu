import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'

const archive = path => gunzipSync(readFileSync(new URL(path,import.meta.url))).toString()
const jsonl = path => archive(path).trim().split('\n').map(JSON.parse)
const hash = input => createHash('sha256').update(input).digest('hex')
for (const [run,rawFolder] of [
  ['compact-serial','neural-dependency-dev100'],
  ['inference','transformer-dependency-dev100']
]) {
  const raw = JSON.parse(archive('../2026-11-26-'+rawFolder+'/raw.json.gz')).results[0].predictions
  const evidence = jsonl('./'+run+'/model-evidence.jsonl.gz')
  if (raw.length!==100 || evidence.length!==raw.length || !raw.every((row,i)=>
    row.id===evidence[i].id && hash(row.text)===evidence[i].sourceSha256 &&
    hash(JSON.stringify(row.tokens))===evidence[i].graphSha256)) {
    throw Error('Mismatch between archived raw and provided model evidence for '+run)
  }
}
for (const [name,prior] of [
  ['neuro-prolog','./compact-refined/predictions.jsonl.gz'],
  ['neuro-z3','../2026-11-26-neural-native-dev100/inference/neuro-z3.jsonl.gz']
]) {
  const serial = jsonl('./compact-serial/'+name+'.jsonl.gz')
  const scored = jsonl(prior)
  if (serial.length!==100 || scored.length!==serial.length || !serial.every((row,i)=>
    row.id===scored[i].id && JSON.stringify(row.candidates)===JSON.stringify(scored[i].candidates))) {
    throw Error('Compact timed and scored public variants differ for '+name)
  }
}
console.log('Verified all raw graph digests and compact public candidate sets')
