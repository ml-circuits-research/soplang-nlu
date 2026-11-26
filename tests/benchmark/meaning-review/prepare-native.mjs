import {createHash} from 'node:crypto'
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {resolve, join} from 'node:path'
import {gunzipSync, gzipSync} from 'node:zlib'
import {createAnalysisValidator} from '../../../lib/index.mjs'

const [run, output, installation] = process.argv.slice(2)
if (!run || !output || !installation) {
  throw Error('Usage: node prepare-native.mjs RUN OUTPUT KNOWLEDGE_DIR')
}
const engineNames = ['z3', 'prolog-worlds', 'prolog-example-transfer']
const normalized = value => value.replace(/\r\n?/g, '\n').trim()
const sha = value => createHash('sha256').update(value).digest('hex')
const environment = JSON.parse(readFileSync(join(run, 'environment.json'), 'utf8'))
const sampleBytes = readFileSync(join(run, 'sample.json.gz'))
const rows = JSON.parse(gunzipSync(sampleBytes))
if (!Array.isArray(rows) || !rows.length ||
    new Set(rows.map(row => row.id)).size !== rows.length ||
    environment.sample !== rows.length ||
    (environment.sampleSha256 && environment.sampleSha256 !== sha(sampleBytes))) {
  throw Error('Invalid native benchmark sample.')
}
const names = new Set(rows.map(row => row.id))
const validator = await createAnalysisValidator({knowledgeDir: resolve(installation)})
const stores = engineNames.map(engine => {
  const bytes = readFileSync(join(run, engine + '.jsonl.gz'))
  const predictions = new Map()
  for (const line of gunzipSync(bytes).toString().trim().split('\n')) {
    const row = JSON.parse(line)
    if (!names.has(row.id) || predictions.has(row.id)) throw Error(engine + ': unexpected or duplicate ID ' + row.id)
    if (row.evaluatedSchema !== 'nlu' || !Array.isArray(row.candidates)) throw Error(engine + ': missing native predictions for ' + row.id)
    predictions.set(row.id, row)
  }
  if (predictions.size !== rows.length) throw Error(engine + ': incomplete native cohort')
  return {predictions, sha256: sha(bytes)}
})

const packets = rows.map(({id, text}, rowIndex) => {
  const proposals = stores.map(({predictions}) => predictions.get(id))
  const circuits = [...new Set(proposals.flatMap(row => row.candidates.map(normalized)))].sort()
  const indices = new Map(circuits.map((sop, index) => [sop, index]))
  const checks = circuits.map(sop => validator(text, sop))
  const groups = {}
  const memberships = {}
  for (const [i, engine] of engineNames.entries()) {
    const row = proposals[i]
    const original = row.candidates.map(sop => indices.get(normalized(sop)))
    const eligible = [...new Set(original.filter(index => checks[index].valid))].sort((a,b) => a-b)
    const key = Object.keys(groups).find(key => String(groups[key]) === String(eligible)) ?? String(Object.keys(groups).length)
    groups[key] = eligible
    memberships[engine] = {key, original, error: row.error ?? null,
      rejected: (row.rejected ?? []).map(candidate => ({sop: candidate.sop, findings: candidate.check?.findings ?? []}))}
  }
  const allLines = [...new Set(circuits.flatMap(sop => sop.split('\n')))]
  const lineIndices = new Map(allLines.map((line, index) => [line, index]))
  return {id, rowIndex, text, references: [], groups, memberships, checks, lines: allLines,
    circuits: circuits.map(sop => sop.split('\n').map(line => lineIndices.get(line)))}
})

mkdirSync(output, {recursive: true})
const packed = gzipSync(JSON.stringify(packets))
writeFileSync(join(output, 'packets.json.gz'), packed, {flag: 'wx'})
const schema = readFileSync(fileURLToPath(new URL('../../../schemas/nlu/schema.sop', import.meta.url)))
const manifest = {
  profile: 'nlu-source-first-v1', source: resolve(run), sample: rows.length,
  datasetRevision: environment.revision, libraryRevision: environment.libraryRevision,
  sampleSha256: sha(sampleBytes), packetsSha256: sha(packed), schemaSha256: sha(schema),
  predictions: Object.fromEntries(engineNames.map((name,i) => [name, stores[i].sha256])),
  groups: packets.reduce((sum, packet) => sum + Object.keys(packet.groups).length, 0),
  nonemptyGroups: packets.reduce((sum, packet) => sum + Object.values(packet.groups).filter(group => group.length).length, 0)
}
writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest,null,2)+'\n', {flag: 'wx'})
console.log(JSON.stringify(manifest))
