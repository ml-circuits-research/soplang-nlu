import {gunzipSync} from 'node:zlib'
import {readFileSync,mkdirSync,writeFileSync,existsSync,renameSync,mkdtempSync,rmSync} from 'node:fs'
import {basename,join,dirname,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {createAnalysisValidator,hasCompleteSource} from '../../../lib/check-analysis.mjs'
import {datasetRevision,readCommittedRows} from '../train-split.mjs'
import {nativeReferencePath,normalizeCircuit} from '../native-references.mjs'

const [dataset,run,approvedPath,knowledgeDir] = process.argv.slice(2)
if (!knowledgeDir) throw Error('Expected dataset, frozen run, approved-candidate JSONL and knowledge directory.')
const readLines = path => {
  const data = readFileSync(path)
  return (path.endsWith('.gz') ? gunzipSync(data) : data).toString().split('\n').filter(Boolean).map(line=>JSON.parse(line))
}
const approved = readLines(approvedPath)
if (!approved.length) throw Error('Empty approval inventory.')
const target = resolve(dataset,nativeReferencePath)
const existing = existsSync(target) ? readLines(target) : []
const registry = new Map(existing.map(entry=>[entry.text,entry]))
if (registry.size !== existing.length) throw Error('Duplicate source in native annotations.')
const sample = new Map(JSON.parse(gunzipSync(readFileSync(join(run,'sample.json.gz')))).map(row=>[row.id,row.text]))
const environment = JSON.parse(readFileSync(join(run,'environment.json')))
const eligible = new Map(approved.map(({text})=>[text,new Map()]))
for (const engine of ['z3','prolog-worlds','prolog-example-transfer']) {
  for (const item of readLines(join(run,engine+'.jsonl.gz'))) {
    const entry = eligible.get(sample.get(item.id))
    if (!entry) continue
    for (const circuit of item.candidates) {
      const sop = normalizeCircuit(circuit)
      if (!entry.has(sop)) entry.set(sop,new Set())
      entry.get(sop).add(engine)
    }
  }
}
const found = new Set()
for await (const row of readCommittedRows(dataset,datasetRevision(dataset))) {
  if (eligible.has(row.text)) found.add(row.text)
}
const validate = await createAnalysisValidator({knowledgeDir})
const runId = basename(resolve(run))
const auditDigest = createHash('sha256').update(readFileSync(approvedPath)).digest('hex')
let added = 0
for (const item of approved) {
  const sop = normalizeCircuit(item.sop)
  const engines = eligible.get(item.text)?.get(sop)
  if (!found.has(item.text) || !engines?.size || item.grade !== 8 || !hasCompleteSource(validate(item.text,sop))) {
    throw Error('Unverified source, circuit, grade or syntax: '+item.text)
  }
  const affirmative = item.evidence.filter(vote=>vote.grade===8)
  if (item.disposition !== 'independently supported' || !item.identity ||
      new Set(affirmative.map(vote=>vote.model)).size < 2 || affirmative.length !== item.evidence.length ||
      item.dissentModels?.length) throw Error('Missing exact-candidate confirmation: '+item.text)
  const entry = registry.get(item.text) ?? {text:item.text,readings:[]}
  if (!entry.readings.some(reading=>normalizeCircuit(reading.sop) === sop)) {
    entry.readings.push({sop,engines:[...engines].sort(),
      review:{run:runId,sourceRevision:environment.revision,identity:item.identity,auditSha256:auditDigest}})
    registry.set(item.text,entry)
    added++
  }
}
if (added) {
  mkdirSync(dirname(target),{recursive:true})
  const temp = mkdtempSync(join(dirname(target),'.import-'))
  try {
    const ordered = [...registry.values()].sort((a,b)=>a.text<b.text?-1:a.text>b.text?1:0)
    writeFileSync(join(temp,'readings'),ordered.map(row=>JSON.stringify(row)).join('\n')+'\n')
    renameSync(join(temp,'readings'),target)
  } finally { rmSync(temp,{recursive:true,force:true}) }
}
console.log(JSON.stringify({approved:approved.length,added,texts:registry.size,auditDigest}))
