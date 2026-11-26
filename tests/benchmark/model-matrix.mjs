// Measure the model once per text, then measure each consumer on identical input.
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {gunzipSync,gzipSync} from 'node:zlib'
import {fileURLToPath} from 'node:url'
import {openDependencies} from '../../strategies/neural-dependencies/index.mjs'
import {createReader} from '../../lib/reader.mjs'
import {strategyModules} from './strategies.mjs'
import {createRecordWriter} from './record.mjs'

const [sampleDir, outputDir, model, selection = 'spacy-direct,neuro-prolog,neuro-z3'] = process.argv.slice(2)
if (!sampleDir || !outputDir || !model) throw Error('Expected prior inference directory, new output directory, model and optional comma-separated strategy names')
const names = selection.split(',')
if (new Set(names).size !== names.length || names.some(n => !['spacy-direct','neuro-prolog','neuro-z3'].includes(n))) throw Error('Invalid strategy selection')
const knowledgeDir = resolve(process.env.SOP_KNOWLEDGE_DIR ?? '../sop-knowledge-worlds')
const root = fileURLToPath(new URL('../../',import.meta.url))
const bytes = readFileSync(join(sampleDir,'sample.json.gz'))
const rows = JSON.parse(gunzipSync(bytes))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const previous = JSON.parse(readFileSync(join(sampleDir,'environment.json')))
if (rows.length !== previous.sample || hash(bytes) !== previous.sampleSha256) throw Error('Sample digest differs from frozen run')
mkdirSync(outputDir)
const save = (name,data) => writeFileSync(join(outputDir,name), data, {flag:'wx'})
const saveJson = (name,data) => save(name,JSON.stringify(data,null,2)+'\n')
const summarize = values => {
  const ordered = values.toSorted((a,b)=>a-b)
  const quantile = p => ordered[Math.ceil(p*values.length)-1]
  return {sumMs:values.reduce((a,b)=>a+b,0),medianMs:quantile(.5),p95Ms:quantile(.95)}
}
const start = performance.now()
const provider = await openDependencies({model})
const modelStartupMs = performance.now()-start
const readers = new Map()
const results = new Map()
const modelTimes = []
const startups = {}
const evidence = []
let active
// Only the single current graph can be requested, with its unmodified source.
const syntaxModel = {async open() {return {metadata:provider.metadata, async close(){}, async parse(text) {
  if (!active || text !== active.text) throw Error('Attempt to read outside the current measurement')
  active.reads++
  return active.tokens
}}}}
try {
  const record = await createRecordWriter(knowledgeDir)
  for (const name of names) {
    const [entry, key] = strategyModules[name]
    const strategy = (await import(entry))[key]
    const start = performance.now()
    readers.set(name,await createReader({strategy,knowledgeDir,syntaxModel,swipl:process.env.SWIPL}))
    results.set(name,[])
    startups[name]=performance.now()-start
  }
  for (const {id,text} of rows) {
    const start = performance.now()
    const tokens = await provider.parse(text)
    modelTimes.push(performance.now()-start)
    active = {text, reads:0, tokens:Object.freeze(tokens.map(Object.freeze))}
    evidence.push({id,sourceSha256:hash(text),graphSha256:hash(JSON.stringify(tokens)),latencyMs:modelTimes.at(-1)})
    for (const [name,reader] of readers) {
      active.reads = 0
      const start = performance.now()
      const result = await reader.propose(text)
      if (!active.reads) throw Error(name + ' did not request the shared dependency evidence')
      results.get(name).push({id,latencyMs:performance.now()-start,...record(text,result)})
    }
    active = undefined
  }
  save('sample.json.gz',bytes)
  const refs = 'native-references.json.gz'
  if (existsSync(join(sampleDir,refs))) save(refs,readFileSync(join(sampleDir,refs)))
  saveJson('environment.json',{revision:previous.revision,seed:previous.seed,sample:rows.length,
    nativeReferenceRevision:previous.nativeReferenceRevision,nativeReferenceSha256:previous.nativeReferenceSha256,
    nativeReferenceTexts:previous.nativeReferenceTexts,sampleSha256:hash(bytes),evaluatedSchema:'nlu',workers:1,strategies:names,
    libraryRevision:execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    knowledgeRevision:execFileSync('git',['-C',knowledgeDir,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    model:provider.metadata,modelStartupMs,modelInference:summarize(modelTimes)})
  save('model-evidence.jsonl.gz',gzipSync(evidence.map(r=>JSON.stringify(r)).join('\n')+'\n'))
  for (const [name,records] of results) {
    save(name+'.jsonl.gz',gzipSync(records.map(r=>JSON.stringify(r)).join('\n')+'\n'))
    saveJson(name+'.json',{startupMs:startups[name],mapping:summarize(records.map(r=>r.latencyMs)),
      modelAndMapping:summarize(records.map((r,i)=>r.latencyMs+modelTimes[i])),
      errors:records.filter(r=>r.error).length})
  }
} finally {
  await Promise.allSettled([...readers.values()].map(reader=>reader.close()))
  await provider.close()
}
