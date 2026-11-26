import {createHash} from 'node:crypto'
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {resolve, join} from 'node:path'
import {gunzipSync, gzipSync} from 'node:zlib'
import {createAnalysisValidator} from '../../../lib/index.mjs'
import {hasCompleteSource} from '../../../lib/check-analysis.mjs'

const [run, output, installation, subset] = process.argv.slice(2)
if (!run || !output || !installation) {
  throw Error('Usage: node prepare-native.mjs RUN OUTPUT KNOWLEDGE_DIR [STRATEGIES]')
}
const knownEngines = ['z3', 'prolog-worlds', 'prolog-example-transfer']
const engineNames = subset === undefined ? knownEngines : subset.split(',')
if (engineNames.some(engine => !knownEngines.includes(engine)) ||
    new Set(engineNames).size !== engineNames.length) {
  throw Error('Invalid native benchmark strategies.')
}
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
  const saved = proposals.map(row => [...row.candidates, ...(row.rejected ?? []).map(candidate => candidate.sop)])
  const circuits = [...new Set(saved.flatMap(candidates => candidates.map(normalized)))].sort()
  const indices = new Map(circuits.map((sop, index) => [sop, index]))
  const checks = circuits.map(sop => validator(text, sop))
  const groups = {}
  const staticJudgments = {}
  const groupKeys = new Map()
  const memberships = {}
  for (const [i, engine] of engineNames.entries()) {
    const row = proposals[i]
    const original = saved[i].map(sop => indices.get(normalized(sop)))
    const valid = [...new Set(original.filter(index => checks[index].valid))].sort((a,b) => a-b)
    const eligible = valid.filter(index => hasCompleteSource(checks[index]))
    let staticGrade
    let witness = null
    if (!eligible.length) {
      staticGrade = valid.length ? 2 : 0
      if (valid.length) {
        const gap = index => checks[index].sourceGaps.materialUncovered + checks[index].sourceGaps.materialUnresolved
        witness = valid.reduce((best, index) => gap(index) < gap(best) ? index : best)
      }
    }
    const signature = eligible.length ? 'review:' + eligible.join(',') : 'static:' + staticGrade + ':' + witness
    let key = groupKeys.get(signature)
    if (key === undefined) {
      key = String(groupKeys.size)
      groupKeys.set(signature, key)
      groups[key] = eligible
      if (staticGrade !== undefined) {
        const coverage = witness === null ? null : checks[witness].sourceGaps
        const reason = coverage
          ? 'All schema-valid, source-grounded proposals have source gaps. The closest has ' +
            coverage.materialUncovered + ' material uncovered and ' + coverage.materialUnresolved + ' material unresolved occurrence(s).'
          : 'No schema-valid, source-grounded native reading was emitted.'
        staticJudgments[key] = {rowIndex, group: key, grade: staticGrade, candidate: witness, reason}
      }
    }
    memberships[engine] = {key, original, returned: row.candidates.length, valid, error: row.error ?? null,
      rejected: (row.rejected ?? []).map(candidate => ({sop: candidate.sop, findings: candidate.check?.findings ?? []}))}
  }
  const allLines = [...new Set(circuits.flatMap(sop => sop.split('\n')))]
  const lineIndices = new Map(allLines.map((line, index) => [line, index]))
  return {id, rowIndex, text, references: [], groups, staticJudgments, memberships, checks, lines: allLines,
    circuits: circuits.map(sop => sop.split('\n').map(line => lineIndices.get(line)))}
})

mkdirSync(output, {recursive: true})
const packed = gzipSync(JSON.stringify(packets))
writeFileSync(join(output, 'packets.json.gz'), packed, {flag: 'wx'})
const schema = readFileSync(fileURLToPath(new URL('../../../schemas/nlu/schema.sop', import.meta.url)))
const checker = readFileSync(fileURLToPath(new URL('../../../lib/check-analysis.mjs', import.meta.url)))
const manifest = {
  profile: 'nlu-source-first-v2', source: resolve(run), sample: rows.length,
  coverageGate: 'all source accounted and no material gaps, allowing incidental unresolved punctuation',
  datasetRevision: environment.revision, libraryRevision: environment.libraryRevision,
  sampleSha256: sha(sampleBytes), packetsSha256: sha(packed), schemaSha256: sha(schema), checkerSha256: sha(checker),
  predictions: Object.fromEntries(engineNames.map((name,i) => [name, stores[i].sha256])),
  groups: packets.reduce((sum, packet) => sum + Object.keys(packet.groups).length, 0),
  nonemptyGroups: packets.reduce((sum, packet) => sum + Object.values(packet.groups).filter(group => group.length).length, 0),
  staticGroups: Object.fromEntries([0, 2].map(grade => [grade, packets.reduce((sum, packet) => sum +
    Object.values(packet.staticJudgments).filter(entry => entry.grade === grade).length, 0)]))
}
writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest,null,2)+'\n', {flag: 'wx'})
console.log(JSON.stringify(manifest))
