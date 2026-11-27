// The judged loop that makes the benchmark measurable against the dataset.
//   prepare <run-folder>   read the frozen sample with the current model, compare every reading with the
//                          readings the dataset already accepts or rejects, and write packets for a judge
//                          with the texts that still need one
//   publish <run-folder>   merge the judge's verdicts into the dataset registry
//   report  <run-folder>   the L0–L10 table of the run
// The registry is <dataset>/annotations/nlu/v1/judged/*.jsonl: per text, the readings a judge accepted
// (with where each came from) and the readings a judge rejected (with the grade). A later run costs a
// judgment only for readings the registry has not seen.
import {readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createComparer} from './compare.mjs'
import {createVssReader} from './src/reader.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const [command, runArg, ...rest] = process.argv.slice(2)
const args = Object.fromEntries(rest.join(' ').split(/\s*--/u).filter(Boolean).map(pair => pair.split(/\s+/u)))
const run = resolve(runArg)
const dataset = resolve(args.dataset ?? resolve(here, '../../../webmeet-dataset'))
const knowledgeDir = resolve(args.knowledge ?? process.env.SOP_KNOWLEDGE_DIR ?? resolve(here, '../../../sop-knowledge-worlds'))
const sampleFile = resolve(args.sample ?? resolve(here, '../../eval-results/2026-11-26-fresh-locked-one-percent/sample.json.gz'))
const registryDir = join(dataset, 'annotations/nlu/v1/judged')
const {describe, sameGraph} = await createComparer(knowledgeDir)
const lines = file => readFileSync(file, 'utf8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line))

// ---- what the dataset says of a text today
function loadRegistry() {
  const registry = new Map()
  if (!existsSync(registryDir)) return registry
  for (const name of readdirSync(registryDir).filter(file => file.endsWith('.jsonl')).sort()) {
    for (const row of lines(join(registryDir, name))) {
      const entry = registry.get(row.text) ?? registry.set(row.text, {accepted: [], rejected: []}).get(row.text)
      for (const reading of row.accepted ?? []) if (!entry.accepted.some(other => other.sop === reading.sop)) entry.accepted.push(reading)
      for (const reading of row.rejected ?? []) if (!entry.rejected.some(other => other.sop === reading.sop)) entry.rejected.push(reading)
    }
  }
  return registry
}
function loadUnjudged(texts) {
  // circuits the dataset holds that no judge of this registry has looked at: earlier reviewed readings and automatic drafts
  const found = new Map()
  const add = (text, sop, source) => { if (!texts.has(text)) return; const list = found.get(text) ?? found.set(text, []).get(text); if (!list.some(other => other.sop === sop)) list.push({sop, source}) }
  const folder = join(dataset, 'annotations/nlu/v1')
  for (const row of lines(join(folder, 'readings.jsonl'))) for (const reading of row.readings) add(row.text, reading.sop, 'reviewed:' + (reading.engines ?? []).join('+'))
  for (const name of readdirSync(join(folder, 'batches')).filter(file => file.endsWith('.jsonl'))) for (const row of lines(join(folder, 'batches', name))) for (const reading of row.readings) add(row.text, reading.sop, 'reviewed:' + (reading.engines ?? []).join('+'))
  for (const kind of ['conversions', 'raw-conversions']) for (const model of readdirSync(join(folder, kind))) for (const name of readdirSync(join(folder, kind, model))) {
    for (const line of gunzipSync(readFileSync(join(folder, kind, model, name))).toString().split('\n')) {
      if (!line.trim()) continue
      const row = JSON.parse(line)
      for (const sop of row.readings ?? []) add(row.text, sop, 'draft:' + row.model)
    }
  }
  return found
}
const complete = (text, sop) => describe(text, sop).complete

if (command === 'prepare') {
  const sample = JSON.parse(gunzipSync(readFileSync(sampleFile)))
  const reader = createVssReader(JSON.parse(readFileSync(resolve(args.model ?? join(here, 'model/model.json')), 'utf8')))
  const registry = loadRegistry()
  const unjudged = loadUnjudged(new Set(sample.map(row => row.text)))
  const rows = [], packet = []
  for (const {id, text} of sample) {
    const readings = reader.analyse(text).analyses.map(analysis => analysis.sop)
    const known = registry.get(text) ?? {accepted: [], rejected: []}
    const state = readings.map(sop => known.accepted.some(other => sameGraph(sop, other.sop)) ? 'accepted'
      : known.rejected.find(other => sameGraph(sop, other.sop))?.grade ?? 'new')
    // an unjudged dataset circuit that is the same graph as ours still needs the judge: agreement is not acceptance
    const existing = (unjudged.get(text) ?? []).filter(other => !known.accepted.some(seen => seen.sop === other.sop) && !known.rejected.some(seen => seen.sop === other.sop))
    const row = {id, text, readings, state, hadAccepted: known.accepted.length > 0}
    if (state.includes('new')) {
      row.n = packet.length + 1
      packet.push({n: row.n, text, vss: readings.filter((_, k) => state[k] === 'new'), existing: existing.slice(0, Number(args.existing ?? 1)).map(other => other.sop)})
      row.existing = existing.slice(0, Number(args.existing ?? 1))
      row.judging = readings.map((_, k) => k).filter(k => state[k] === 'new')
    }
    rows.push(row)
  }
  mkdirSync(run, {recursive: true})
  writeFileSync(join(run, 'rows.json'), JSON.stringify(rows))
  const size = Number(args.size ?? 400)
  for (let part = 0; part * size < packet.length; part++) {
    writeFileSync(join(run, `packet-${part + 1}.jsonl`), packet.slice(part * size, (part + 1) * size).map(row => JSON.stringify(row)).join('\n') + '\n')
  }
  console.log(`${sample.length} texts; ${rows.filter(row => !row.n).length} settled by the registry; ${packet.length} need a judge, in ${Math.ceil(packet.length / size)} packets; ${packet.filter(row => row.existing.length).length} of them have an unjudged dataset circuit`)
}

if (command === 'publish' || command === 'report') {
  const rows = JSON.parse(readFileSync(join(run, 'rows.json'), 'utf8'))
  const verdicts = new Map()
  for (const name of readdirSync(run).filter(file => /^verdicts-\d+\.jsonl$/u.test(file))) for (const verdict of lines(join(run, name))) verdicts.set(verdict.n, verdict)
  const tag = args.tag ?? run.split('/').at(-1)
  const published = [], table = Object.fromEntries(Array.from({length: 11}, (_, level) => ['L' + level, 0]))
  let unjudgedRows = 0, invalidWritten = 0
  for (const row of rows) {
    const verdict = row.n ? verdicts.get(row.n) : null
    if (row.n && !verdict) { unjudgedRows++; continue }
    const grades = row.readings.map((_, k) => row.state[k] === 'accepted' ? 'L8' : row.state[k] !== 'new' ? row.state[k] : verdict.vss[row.judging.indexOf(k)])
    const good = grades.filter(grade => grade === 'L8').length
    const existingOk = (verdict?.existing ?? []).map(value => value === 'ok')
    // the level of the set, on the native v3 legend
    let level
    if (!row.readings.length) level = 'L0'
    else if (good === grades.length) level = row.readings.every((_, k) => row.state[k] === 'accepted') && row.hadAccepted ? 'L9'
      : row.existing?.length && !existingOk.some(Boolean) ? 'L10' : 'L8'
    else if (good > 0) level = 'L7'
    else level = grades.map(grade => grade).sort()[0]          // the principal failure: the lowest level named
    table[level]++
    if (!verdict) continue
    const accepted = [], rejected = []
    row.judging.forEach((k, j) => (verdict.vss[j] === 'L8' ? accepted : rejected).push({sop: row.readings[k], source: 'vss', ...(verdict.vss[j] === 'L8' ? {} : {grade: verdict.vss[j]})}))
    ;(row.existing ?? []).forEach((other, j) => (existingOk[j] ? accepted : rejected).push({sop: other.sop, source: other.source, ...(existingOk[j] ? {} : {grade: 'defect'})}))
    if (verdict.written) {
      if (complete(row.text, verdict.written)) accepted.push({sop: verdict.written, source: 'judge'})
      else invalidWritten++
    }
    // only circuits that pass the static check enter the accepted side
    published.push({id: row.id, text: row.text, accepted: accepted.filter(reading => complete(row.text, reading.sop)), rejected, judge: args.judge ?? 'claude-opus-5-5', run: tag, note: verdict.note})
  }
  const total = Object.values(table).reduce((a, b) => a + b, 0)
  console.log(`run ${tag}: ${total} texts with a level, ${unjudgedRows} still waiting for a judge`)
  console.log(Object.entries(table).map(([level, count]) => `${level} ${count} (${(100 * count / (total || 1)).toFixed(1)}%)`).join(' | '))
  console.log(`L8 or better: ${(100 * (table.L8 + table.L9 + table.L10) / (total || 1)).toFixed(1)}%`)
  writeFileSync(join(run, 'table.json'), JSON.stringify({run: tag, texts: total, waiting: unjudgedRows, levels: table}, null, 2) + '\n')
  if (command === 'publish') {
    mkdirSync(registryDir, {recursive: true})
    const file = join(registryDir, tag + '.jsonl')
    if (existsSync(file)) throw Error('The registry already holds ' + file + '; choose another --tag.')
    writeFileSync(file, published.map(row => JSON.stringify(row)).join('\n') + '\n')
    console.log(`published ${published.length} texts to ${file}: ${published.reduce((sum, row) => sum + row.accepted.length, 0)} accepted and ${published.reduce((sum, row) => sum + row.rejected.length, 0)} rejected readings; ${invalidWritten} circuits written by the judge failed the static check and were left out`)
  }
}
