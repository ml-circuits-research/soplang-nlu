import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {gunzipSync,gzipSync} from 'node:zlib'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createHash} from 'node:crypto'
const [root, rawFile, frozen, out, knowledgeDir] = process.argv.slice(2)
const sourceGz = readFileSync(join(frozen,'sample.json.gz'))
const source = JSON.parse(gunzipSync(sourceGz))
const raw = JSON.parse(gunzipSync(readFileSync(rawFile)))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const {createReader} = await import(pathToFileURL(join(root,'lib/reader.mjs')))
const {createRecordWriter} = await import(pathToFileURL(join(root,'tests/benchmark/record.mjs')))
const {spacyDirect} = await import(pathToFileURL(join(root,'strategies/spacy-direct/index.mjs')))
const [model] = raw.results
if (raw.sourceSha256 !== hash(sourceGz) || model.predictions.length!==source.length) throw Error('Raw replay sample mismatch')
let active
const syntaxModel = {async open() {
  return {metadata:model.metadata,async close(){},async parse(text) {
    if (!active || active.text!==text) throw Error('Replay source does not match loaded graph')
    return active.tokens
  }}
}}
const record = await createRecordWriter(knowledgeDir)
const reader = await createReader({strategy:spacyDirect,knowledgeDir,syntaxModel})
const predictions=[]
const evidence=[]
try {
  for (let i=0;i<source.length;i++) {
    const {id,text}=source[i]
    active=model.predictions[i]
    if (active.id!==id || active.text!==text) throw Error('Raw replay ID/text differs')
    predictions.push({id,...record(text,await reader.propose(text))})
    evidence.push({id,sourceSha256:hash(text),graphSha256:hash(JSON.stringify(active.tokens))})
  }
} finally {await reader.close()}
mkdirSync(out)
const jsonl = data=>gzipSync(data.map(JSON.stringify).join('\n')+'\n')
writeFileSync(join(out,'spacy-direct.jsonl.gz'),jsonl(predictions))
writeFileSync(join(out,'model-evidence.jsonl.gz'),jsonl(evidence))
writeFileSync(join(out,'sample.json.gz'),sourceGz)
writeFileSync(join(out,'environment.json'),JSON.stringify({...JSON.parse(readFileSync(join(frozen,'environment.json'))),
  libraryRevision:'24f248b',preview:true, sampleSha256:hash(sourceGz),sample:source.length})+'\n')
