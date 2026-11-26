import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'

const load = path => gunzipSync(readFileSync(new URL(path,import.meta.url))).toString().trim().split('\n').map(JSON.parse)
for (const [model,old] of [['compact','compact/serial-timing'],['transformer','transformer/inference']]) {
  const current = load('./'+model+'/inference/model-evidence.jsonl.gz')
  const baseline = load('../2026-11-26-spacy-direct-dev100/'+old+'/model-evidence.jsonl.gz')
  if (baseline.length!==100 || current.length!==100 || !current.every((row,i)=>
    ['id','sourceSha256','graphSha256'].every(key=>row[key]===baseline[i][key]))) {
    throw Error(model+' dependency evidence differs')
  }
  console.log(model+' evidence matches all 100 frozen baseline graphs')
}
