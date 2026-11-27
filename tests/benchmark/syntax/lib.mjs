// The shared parts of the syntax benchmark: the normal form of a circuit, the registry of judged
// circuits, the labels of the messages (read from the dataset's syntactic files and written
// there), the packets for a judge, the levels and the agreement between strategies.
// Nothing here reads a knowledge repository or the `nlu` schema.
import {createHash} from 'node:crypto'
import {readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, copyFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {validateSyntax, parseCircuit, writeCircuit, coreOf, schema, wordsOf} from '../../../lib/syntax.mjs'
import {checkPacket, packetNumbers} from './check.mjs'

const here = dirname(fileURLToPath(import.meta.url))
export const packageRoot = resolve(here, '../../..')
export const sampleFile = join(packageRoot, 'eval-results/2026-11-26-fresh-locked-one-percent/sample.json.gz')
export const defaultRegistryDir = resolve(packageRoot, '../webmeet-dataset/annotations/syntax/v1/judged')
export const defaultSyntacticDir = resolve(packageRoot, '../webmeet-dataset/syntactic')
/**
 * The folder of syntactic files that goes with a registry: the one of the dataset the registry
 * stands in (<dataset>/annotations/syntax/v1/judged and <dataset>/syntactic). A registry named for a
 * trial, anywhere else, brings its own folder `syntactic` beside it, so a trial never reads or writes
 * the labels of the dataset.
 */
export function syntacticDirOf(registryDir = defaultRegistryDir, named) {
  if (typeof named === 'string') return resolve(named)
  return /[\\/]annotations[\\/]syntax[\\/]v1[\\/]judged[\\/]?$/u.test(registryDir) ? resolve(registryDir, '../../../../syntactic') : resolve(registryDir, '../syntactic')
}
export const LEVELS = Array.from({length: 11}, (_, level) => 'L' + level)
export const GRADES = ['L8', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6']
export const GOAL_LEVELS = ['L8', 'L9', 'L10']

// ---- small file helpers
export const readJsonl = file => readFileSync(file, 'utf8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line))
export const writeJsonl = (file, rows) => { mkdirSync(dirname(file), {recursive: true}); writeFileSync(file, rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '')) }
export const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
export const writeJson = (file, value) => { mkdirSync(dirname(file), {recursive: true}); writeFileSync(file, JSON.stringify(value, null, 2) + '\n') }

/** A sample: [{id, text}], from a JSON array that may be gzipped. Whatever else the file holds for a message is left out. */
export function readSample(file = sampleFile) {
  const bytes = readFileSync(file)
  return JSON.parse(bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes).map(({id, text}) => ({id, text}))
}

/**
 * Command line: positional words and --name value pairs; a --name with no value is true.
 * @param several names that take every word up to the next --name, as a list
 */
export function readArguments(argv, several = []) {
  const words = [], named = {}
  for (let at = 0; at < argv.length; at++) {
    if (!argv[at].startsWith('--')) { words.push(argv[at]); continue }
    const name = argv[at].slice(2), next = argv[at + 1]
    if (several.includes(name)) { named[name] = []; while (argv[at + 1] !== undefined && !argv[at + 1].startsWith('--')) named[name].push(argv[++at]) }
    else if (next === undefined || next.startsWith('--')) named[name] = true
    else { named[name] = next; at++ }
  }
  return {words, named}
}

// ---- the CSV files of the dataset
/** The records of a CSV text as lists of cells. Quotes hold commas, doubled quotes and line ends; an empty line is no record. */
export function readCsv(content) {
  const rows = []
  let row = [], field = '', quoted = false
  for (let at = 0; at < content.length; at++) {
    const sign = content[at]
    if (quoted) { if (sign !== '"') field += sign; else if (content[at + 1] === '"') { field += '"'; at++ } else quoted = false }
    else if (sign === '"') quoted = true
    else if (sign === ',') { row.push(field); field = '' }
    else if (sign === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (sign !== '\r') field += sign
  }
  if (field || row.length) rows.push([...row, field])
  return rows.filter(cells => !(cells.length === 1 && cells[0] === ''))
}
/**
 * The messages of one file of the dataset: the first column of every record after the header.
 * The record number counts the records from 1, as the dataset's own reader does.
 * @returns [{record, text}]
 */
export function messagesOfCsv(content) {
  const [header, ...records] = readCsv(content)
  if (header?.[0] !== 'text') throw new Error('The first column of a dataset file is `text`.')
  return records.map((cells, index) => ({record: index + 1, text: cells[0]}))
}
/** The rows of a CSV text as they are written, each with its line end; a line end inside quotes does not end a row. */
export function rawRows(content) {
  const rows = []
  let start = 0, quoted = false
  for (let at = 0; at < content.length; at++) {
    if (content[at] === '"') quoted = !quoted
    else if (content[at] === '\n' && !quoted) { rows.push(content.slice(start, at + 1)); start = at + 1 }
  }
  if (start < content.length) rows.push(content.slice(start))
  return rows
}
/** Where the first cell of a row ends, in the row as it is written. */
function firstCellEnd(row) {
  if (row[0] !== '"') { const end = row.search(/[,\r\n]/u); return end < 0 ? row.length : end }
  for (let at = 1; at < row.length; at++) if (row[at] === '"') { if (row[at + 1] === '"') at++; else return at + 1 }
  return row.length
}
/** One cell, quoted only when it holds a comma, a quote, a line end or a space at its edge. */
export const csvCell = value => { const text = String(value ?? ''); return /[",\n\r]|^\s|\s$/u.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text }
/** A CSV text from a header and rows of cells. A cell may hold several lines, such as a circuit with one wire per line. */
export const writeCsv = (header, rows, newline = '\n') => [header, ...rows].map(cells => cells.map(csvCell).join(',')).join(newline) + newline

// ---- the normal form of a circuit
// Two strategies can write the same circuit with other wire names, another order of the wires or of
// the keys, and with "next to" as one value or as two. The normal form removes these differences,
// so that the judge sees one text for one circuit and cannot tell who wrote it:
//   wires are named c, n, r, k with a number, in the order of their first word;
//   `dependent`, `modifier`, `auxiliary`, `negation` and `discourse` hold one word per value;
//   `marker` and `conjunction` hold neighbouring words as one value;
//   a clause lists its subject, then its complements; a relation `from`, then `to`.
const PER_WORD = new Set(['dependent', 'modifier', 'auxiliary', 'negation', 'discourse'])
const JOINED = new Set(['marker', 'conjunction'])
const LETTER = {'syntax.clause': 'c', 'syntax.nominal': 'n', 'syntax.relation': 'r', 'syntax.coordination': 'k'}
const REFERENCE_ORDER = ['subject', 'complement', 'ellipsis', 'from', 'to', 'conjunct']

/**
 * @returns {sop, core} for a valid circuit: its normal form and the core of that form. null for a
 * text that is no valid circuit of the message.
 */
export function normalForm(text, sop) {
  if (typeof text !== 'string' || typeof sop !== 'string') return null
  const check = validateSyntax(text, sop)
  if (!check.valid) return null
  let place = 0
  const wires = parseCircuit(sop).map(wire => {
    const words = new Map(), kept = [], references = [], atoms = []
    for (const [key, raw] of wire.slots) {
      const kind = schema[wire.type][key].kind
      if (kind === 'ref') references.push({key, ref: raw.slice(1)})
      else if (kind !== 'string') atoms.push({key, value: raw})
      else {
        const {first, last} = check.placements[place++]
        if (!PER_WORD.has(key) && !JOINED.has(key)) { kept.push({key, span: [first, last]}); continue }
        const list = words.get(key) ?? words.set(key, []).get(key)
        for (let word = first; word <= last; word++) list.push(word)
      }
    }
    for (const [key, list] of words) {
      list.sort((a, b) => a - b)
      for (const word of list) {
        const previous = kept.at(-1)
        if (JOINED.has(key) && previous?.key === key && previous.span[1] === word - 1) previous.span[1] = word
        else kept.push({key, span: [word, word]})
      }
    }
    const first = Math.min(Infinity, ...kept.map(slot => slot.span[0]))
    return {id: wire.id, type: wire.type, atoms, kept, references, first}
  })
  const byId = new Map(wires.map(wire => [wire.id, wire]))
  // a wire with no words of its own is placed by the first word of what it ties
  const anchor = (wire, depth = 0) => wire.first < Infinity || depth > 6 ? wire.first
    : Math.min(Infinity, ...wire.references.map(slot => anchor(byId.get(slot.ref), depth + 1)))
  for (const wire of wires) {
    wire.anchor = anchor(wire)
    wire.references = wire.references.map((slot, index) => ({...slot, index}))
      .sort((a, b) => REFERENCE_ORDER.indexOf(a.key) - REFERENCE_ORDER.indexOf(b.key) || anchor(byId.get(a.ref)) - anchor(byId.get(b.ref)) || a.index - b.index)
  }
  const signature = wire => wire.type + ' ' + wire.references.map(slot => slot.key + anchor(byId.get(slot.ref))).join(' ')
  const ordered = [...wires].sort((a, b) => (a.first === Infinity) - (b.first === Infinity) || a.anchor - b.anchor || (signature(a) < signature(b) ? -1 : signature(a) > signature(b) ? 1 : 0))
  const count = {}, name = new Map()
  for (const wire of ordered) name.set(wire.id, LETTER[wire.type] + (count[wire.type] = (count[wire.type] ?? 0) + 1))
  let normal
  try {
    normal = writeCircuit(text, ordered.map(wire => ({id: name.get(wire.id), type: wire.type,
      slots: [...wire.atoms, ...wire.kept, ...wire.references.map(slot => ({key: slot.key, ref: name.get(slot.ref)}))]})))
  } catch { normal = null }
  // repeated words that cross between wires may have no other order than the one the circuit was written in
  const core = normal === null ? null : coreOf(text, normal)
  return core === null ? {sop, core: coreOf(text, sop), kept: 'as written'} : {sop: normal, core}
}

// ---- the outputs of a run
/** The strategy files of a run folder: [{strategy, rows: [{id, text, sop, error, ms, normal, core}]}]. */
export function readOutputs(runDir) {
  const summaryFile = join(runDir, 'summary.json')
  const names = existsSync(summaryFile)
    ? Object.entries(readJson(summaryFile).strategies ?? {}).filter(([, entry]) => entry.file).map(([name]) => name)
    : readdirSync(runDir).filter(file => file.endsWith('.jsonl')).map(file => file.slice(0, -6)).sort()
  return names.filter(name => existsSync(join(runDir, name + '.jsonl'))).map(name => ({strategy: name, rows: withCores(readJsonl(join(runDir, name + '.jsonl')))}))
}
/** Adds to every row the normal form of its circuit and its core; both null when the circuit is not valid. */
export function withCores(rows) {
  return rows.map(row => { const normal = row.sop ? normalForm(row.text, row.sop) : null; return {...row, normal: normal?.sop ?? null, core: normal?.core ?? null} })
}

// ---- the registry of judged circuits
// One line per circuit a judge read in this schema: {text, sop, core, verdict, grade, note, judge, run, source}.
// The first line read for a circuit counts; judge-publish.mjs never writes a second one.
export function emptyRegistry() { return {files: [], rows: 0, ignored: 0, byText: new Map()} }
export function addToRegistry(registry, row) {
  const normal = normalForm(row.text, row.sop)
  if (!normal?.core || !['accepted', 'rejected'].includes(row.verdict)) { registry.ignored++; return false }
  registry.rows++
  const circuits = registry.byText.get(row.text) ?? registry.byText.set(row.text, new Map()).get(row.text)
  if (!circuits.has(normal.core)) circuits.set(normal.core, {...row, core: normal.core})
  return true
}
/** Reads every *.jsonl of the folder, in the order of their names. The core is computed again from the circuit. */
export function readRegistry(dir = defaultRegistryDir) {
  const registry = emptyRegistry()
  if (!existsSync(dir)) return registry
  for (const name of readdirSync(dir).filter(file => file.endsWith('.jsonl')).sort()) {
    registry.files.push(name)
    for (const row of readJsonl(join(dir, name))) addToRegistry(registry, row)
  }
  return registry
}
export const lookup = (registry, text, core) => core ? registry.byText.get(text)?.get(core) : undefined

// ---- the labels of the messages
// The label of a message is the circuit in the `sop` cell of its row in the dataset's syntactic
// files (columns text, sop, source, accepted_by). No other file holds labels: a tool that sets a
// label writes that cell.
export const SYNTACTIC_HEADER = ['text', 'sop', 'source', 'accepted_by']
/**
 * A label line {text, label, source, accepted_by} with its `core`. The core is computed from the
 * circuit the first time it is asked for, so reading the labels of a whole dataset costs no core.
 */
export function labelLine(line) {
  let core
  return Object.defineProperty({...line}, 'core', {get: () => core === undefined ? (core = normalForm(line.text, line.label)?.core ?? null) : core})
}
/**
 * The labels: a Map from the text of a message to its label line. `dir` is the folder of syntactic
 * files they were read from; `files` names, for every message of those files, labelled or not, the
 * file its row stands in (and `also` the further files of a message that stands in several).
 */
export class Labels extends Map {
  constructor(dir = null) { super(); this.dir = dir; this.files = new Map(); this.also = new Map() }
}
const csvFilesOf = dir => !existsSync(dir) ? [] : readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
  .flatMap(entry => entry.isDirectory() ? csvFilesOf(join(dir, entry.name)).map(file => entry.name + '/' + file) : entry.name.endsWith('.csv') ? [entry.name] : [])
/**
 * The labels of a dataset, from its syntactic files: a message whose `sop` cell is not empty has
 * that circuit as its label.
 * @param dir the folder of syntactic files
 * @param only the files to read, as paths inside the folder ("drawing/style-01.csv"); all when not given
 */
export function readLabels(dir = defaultSyntacticDir, only = null) {
  const labels = new Labels(dir)
  for (const file of only ?? csvFilesOf(dir)) {
    if (!existsSync(join(dir, file))) continue
    const [header, ...rows] = readCsv(readFileSync(join(dir, file), 'utf8'))
    if (header?.[0] !== 'text' || header[1] !== 'sop') throw new Error(`${join(dir, file)} is no syntactic file: its columns are ${SYNTACTIC_HEADER.join(', ')}.`)
    for (const [text, sop = '', source = '', accepted_by = ''] of rows) {
      if (!labels.files.has(text)) labels.files.set(text, file)
      else if (labels.files.get(text) !== file) labels.also.set(text, [...new Set([...labels.also.get(text) ?? [], file])])
      if (sop && !labels.has(text)) labels.set(text, labelLine({text, label: sop, source, accepted_by}))
    }
  }
  return labels
}
/**
 * One label per message from the circuits accepted in one run: the circuit most strategies wrote,
 * then the first by its number.
 * @param accepted items {n, text, sop, core, sources}
 * @returns Map text -> item
 */
export function chooseLabels(accepted) {
  const chosen = new Map()
  for (const item of [...accepted].sort((a, b) => a.n - b.n)) {
    const best = chosen.get(item.text)
    if (!best || item.sources.length > best.sources.length) chosen.set(item.text, item)
  }
  return chosen
}
/**
 * What a run changes in the labels: every circuit accepted in the run becomes the label of its
 * message, whatever label the message had, also when that was a circuit settled by agreement.
 * @param labels the labels as they are (a Map text -> label line)
 * @param accepted items {n, text, sop, core, sources, accepted_by}; accepted_by is "judge" when not given
 * @returns {changes: Map text -> {text, label, source, accepted_by}, first, replaced}: `first` messages
 *   had no label, `replaced` had another circuit or the same one accepted in another way
 */
export function labelChanges(labels, accepted) {
  const changes = new Map()
  let first = 0, replaced = 0
  for (const [text, item] of chooseLabels(accepted)) {
    const before = labels.get(text), acceptedBy = item.accepted_by ?? 'judge'
    if (before?.core === item.core && before.accepted_by === acceptedBy) continue
    changes.set(text, {text, label: item.sop, source: item.sources.join('+'), accepted_by: acceptedBy})
    if (before) replaced++; else first++
  }
  return {changes, first, replaced}
}
/**
 * Writes labels into the syntactic files: the cells sop, source and accepted_by of the row of each
 * message. Only the files that change are written; the order of the rows, the line ends, the
 * message cell as it is written and every row the changes do not name stay as they are.
 * @param labels the labels read from the folder (readLabels): they know the file of every message
 * @param changes Map text -> {label, source, accepted_by}
 * @returns {rows, files: [the files written], missing: [messages that have no row in the folder]}
 */
export function writeLabels(labels, changes) {
  const byFile = new Map(), missing = []
  for (const text of changes.keys()) {
    const files = [labels.files.get(text), ...labels.also.get(text) ?? []].filter(Boolean)
    if (!files.length) missing.push(text)
    for (const file of files) (byFile.get(file) ?? byFile.set(file, new Set()).get(file)).add(text)
  }
  const files = []
  let count = 0
  for (const [file, texts] of byFile) {
    const rows = rawRows(readFileSync(join(labels.dir, file), 'utf8'))
    let changed = false
    for (let k = 1; k < rows.length; k++) {
      const text = readCsv(rows[k])[0]?.[0]
      if (text === undefined || !texts.has(text)) continue
      const {label, source, accepted_by: acceptedBy} = changes.get(text)
      const next = rows[k].slice(0, firstCellEnd(rows[k])) + ',' + [label, source, acceptedBy].map(csvCell).join(',') + (/\r?\n$/u.exec(rows[k])?.[0] ?? '')
      if (next === rows[k]) continue
      rows[k] = next; changed = true; count++
    }
    if (changed) { writeFileSync(join(labels.dir, file), rows.join('')); files.push(file) }
  }
  return {rows: count, files, missing}
}

// ---- what needs a judge
/**
 * Collects the circuits of a run that no judge has seen, once per message and core, whatever number
 * of strategies wrote them.
 * @param outputs from readOutputs
 * @param earlier items of an earlier call for the same run: they keep their numbers
 * @param skip (text, core) => true for a circuit that needs no judge for another reason, such as agreement
 * @param labels the labels: a circuit equal to the label of its message is accepted already, by a
 *   judge or by agreement, and is not collected
 * @returns {items, added}: every item is {n, text, sop, core, sources}; `added` are the new ones
 */
export function collectItems(outputs, registry, {earlier = [], skip = () => false, labels = new Map()} = {}) {
  const items = earlier.map(item => ({...item}))
  const known = new Map(items.map(item => [item.text + '\0' + item.core, item]))
  const texts = [], circuits = new Map()
  for (const {strategy, rows} of outputs) for (const row of rows) {
    if (!circuits.has(row.text)) { circuits.set(row.text, new Map()); texts.push(row.text) }
    if (!row.core) continue
    const found = circuits.get(row.text)
    const circuit = found.get(row.core) ?? found.set(row.core, {sop: row.normal, sources: new Set()}).get(row.core)
    circuit.sources.add(strategy)
  }
  const added = []
  for (const text of texts) {
    const waiting = [...circuits.get(text)].filter(([core]) => !lookup(registry, text, core) && (known.has(text + '\0' + core) || labels.get(text)?.core !== core && !skip(text, core)))
    // the order inside a message follows the circuits, never the strategies
    for (const [core, circuit] of waiting.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) {
      const item = known.get(text + '\0' + core)
      if (item) { item.sources = [...new Set([...item.sources, ...circuit.sources])].sort(); continue }
      const fresh = {n: items.length + 1, text, sop: circuit.sop, core, sources: [...circuit.sources].sort()}
      items.push(fresh); added.push(fresh); known.set(text + '\0' + core, fresh)
    }
  }
  return {items, added}
}
/** Packets for a judge. A line holds the number, the message and the circuit, and nothing else. */
export function packetsOf(items, size = 200) {
  const packets = []
  for (let at = 0; at < items.length; at += size) packets.push(items.slice(at, at + size).map(({n, text, sop}) => ({n, text, sop})))
  return packets
}

// ---- verdicts and levels
/**
 * The verdicts of one run: Map text -> Map core -> {grade, note, sources, by}. `items` carry the
 * numbers the verdicts use. `by` is "judge", or "agreement" for a circuit that strategies of
 * different families wrote alike and that no judge of the run has read: it counts as accepted.
 * @param agreed circuits settled by agreement: [{text, core, sources}]
 */
export function runVerdicts(items, verdicts, agreed = []) {
  const byNumber = new Map(verdicts.map(verdict => [verdict.n, verdict]))
  const found = new Map()
  const circuitsOf = text => found.get(text) ?? found.set(text, new Map()).get(text)
  for (const item of items) {
    const verdict = byNumber.get(item.n)
    if (!verdict || !GRADES.includes(verdict.grade)) continue
    circuitsOf(item.text).set(item.core, {grade: verdict.grade, note: verdict.note ?? '', sources: item.sources, by: 'judge'})
  }
  for (const circuit of agreed) {
    if (!circuitsOf(circuit.text).has(circuit.core)) circuitsOf(circuit.text).set(circuit.core, {grade: 'L8', note: '', sources: circuit.sources, by: 'agreement'})
  }
  return found
}
/**
 * The level of one message for one strategy.
 *   L0        no valid circuit
 *   L1–L6     the circuit is rejected: the grade a judge gave it, in this run or in the registry
 *   L8        the circuit is accepted and is not the label the message had: a judge accepted it in
 *             this run and the message had no label, or the registry already held it as accepted,
 *             or it became the label of the message after the run started (settled by agreement
 *             in a conversion round, for example)
 *   L9        the circuit is equal to the label the message had before the run: no judge was needed
 *   L10       a judge accepted the circuit in this run and the message had another label before:
 *             the label is replaced
 *   waiting   no judge has read the circuit yet
 * L7 is unused: a strategy returns one circuit.
 * @param labelsBefore Map text -> {core}: the labels as they were before the run
 * @param labelsNow the labels of now, or a function that reads them; asked only for a circuit that
 *   nothing else knows
 */
export function levelOf(row, registry, verdicts = new Map(), labelsBefore = new Map(), labelsNow = new Map()) {
  if (!row.core) return 'L0'
  const label = labelsBefore.get(row.text)
  if (label?.core === row.core) return 'L9'
  const now = verdicts.get(row.text)?.get(row.core)
  if (now) return now.grade !== 'L8' ? now.grade : label ? 'L10' : 'L8'
  const before = lookup(registry, row.text, row.core)
  if (before) return before.verdict === 'accepted' ? 'L8' : before.grade
  return (typeof labelsNow === 'function' ? labelsNow() : labelsNow).get(row.text)?.core === row.core ? 'L8' : 'waiting'
}
/** One row per strategy: the count of every level, the waiting ones, GOAL, and the accepted circuits that leave an attachment open. */
export function tableOf(outputs, registry, verdicts = new Map(), labelsBefore = new Map(), labelsNow = new Map()) {
  return outputs.map(({strategy, rows}) => {
    const levels = Object.fromEntries(LEVELS.map(level => [level, 0]))
    let waiting = 0, ambiguous = 0
    for (const row of rows) {
      const level = levelOf(row, registry, verdicts, labelsBefore, labelsNow)
      if (level === 'waiting') { waiting++; continue }
      levels[level]++
      if (GOAL_LEVELS.includes(level) && / attachment=ambiguous(?= |$)/mu.test(row.sop)) ambiguous++
    }
    const accepted = GOAL_LEVELS.reduce((sum, level) => sum + levels[level], 0)
    // goal: of all messages. atMost: what GOAL becomes when every waiting circuit is accepted.
    return {strategy, messages: rows.length, levels, waiting, accepted, goal: rows.length ? accepted / rows.length : null,
      atMost: rows.length ? (accepted + waiting) / rows.length : null, ambiguous}
  })
}
const percent = share => share === null ? '—' : (100 * share).toFixed(1) + '%'
export function renderTable(table, {notRun = []} = {}) {
  const lines = ['| Strategy | Messages | ' + LEVELS.join(' | ') + ' | waiting | GOAL |', '| --- | ' + '---: | '.repeat(LEVELS.length + 3).trim()]
  for (const row of table) lines.push(`| ${row.strategy} | ${row.messages} | ${LEVELS.map(level => row.levels[level]).join(' | ')} | ${row.waiting} | ${percent(row.goal)} |`)
  const out = [lines.join('\n'), '',
    'GOAL is the share of all messages at L8, L9 or L10. A message whose circuit still waits for a judge has no level: it stands in the column "waiting" and is not counted in GOAL.',
    'L0 no valid circuit. L1 to L6 a circuit rejected by a judge, with the judge\'s grade. L7 is unused, since a strategy returns one circuit. L8 an accepted circuit that is not the label the message had: a judge accepted it in this run and the message had no label, or the registry already held it as accepted. L9 the circuit is equal to the label the message had before the run, so no judge was needed. L10 a judge accepted the circuit in this run and the message had another label before, so the label is replaced.']
  if (table.some(row => row.waiting)) {
    out.push('', 'Circuits are still waiting for a judge, so GOAL is not final. It can only rise:', '',
      '| Strategy | Waiting | GOAL now | GOAL if every waiting circuit is accepted |', '| --- | ---: | ---: | ---: |',
      ...table.map(row => `| ${row.strategy} | ${row.waiting} | ${percent(row.goal)} | ${percent(row.atMost)} |`))
  }
  out.push('', 'Accepted circuits that leave an attachment open (`attachment=ambiguous`):', '', '| Strategy | Accepted circuits | With `attachment=ambiguous` | Share |', '| --- | ---: | ---: | ---: |',
    ...table.map(row => `| ${row.strategy} | ${row.accepted} | ${row.ambiguous} | ${percent(row.accepted ? row.ambiguous / row.accepted : null)} |`))
  if (notRun.length) out.push('', 'Not in the table: ' + notRun.map(([name, reason]) => `${name} (${reason})`).join(', ') + '.')
  return out.join('\n') + '\n'
}

// ---- agreement between strategies
/**
 * For every message, the strategies grouped by the core of their circuit.
 * @param verdictOf optional (text, core) -> 'accepted' | 'rejected' | undefined: what a judge said of a circuit
 */
export function agreementOf(outputs, verdictOf = () => undefined) {
  const names = outputs.map(output => output.strategy)
  const messages = new Map()
  for (const {strategy, rows} of outputs) for (const row of rows) {
    const cores = messages.get(row.text) ?? messages.set(row.text, new Map()).get(row.text)
    cores.set(strategy, row.core)
  }
  const tally = () => ({messages: 0, accepted: 0, rejected: 0, unjudged: 0})
  const all = tally(), majority = tally(), sizes = Object.fromEntries(names.map((_, index) => [index + 1, 0]))
  const pairs = new Map()
  for (let a = 0; a < names.length; a++) for (let b = a + 1; b < names.length; b++) pairs.set(names[a] + '\0' + names[b], {a: names[a], b: names[b], both: 0, same: 0})
  let noCircuit = 0
  for (const [text, cores] of messages) {
    const groups = new Map()
    for (const name of names) { const core = cores.get(name); if (core) groups.set(core, (groups.get(core) ?? 0) + 1) }
    const [core, size] = [...groups].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
    if (size) sizes[size]++; else noCircuit++
    const count = into => { into.messages++; into[verdictOf(text, core) ?? 'unjudged']++ }
    if (size === names.length) count(all)
    if (size > names.length / 2) count(majority)
    for (const pair of pairs.values()) {
      const one = cores.get(pair.a), other = cores.get(pair.b)
      if (one && other) pair.both++
      if (one && one === other) pair.same++
    }
  }
  return {strategies: names, messages: messages.size, all, majority, sizes, noCircuit, pairs: [...pairs.values()]}
}
export function renderAgreement(result) {
  const {strategies, messages, all, majority, sizes, noCircuit, pairs} = result
  const share = count => percent(messages ? count / messages : null)
  const judged = tally => tally.accepted + tally.rejected
  const out = [`Strategies with an output in this run: ${strategies.length} (${strategies.join(', ')}). Messages: ${messages}.`, '']
  if (strategies.length < 2) return out.join('\n') + 'Agreement needs at least two strategies with an output in this run.\n'
  out.push('Two circuits of one message are the same when their core is equal. The last three columns say what is recorded of the shared circuit: a verdict of this run\'s judge, or else the verdict the registry holds.', '',
    '| Question | Messages | Share | The shared circuit is accepted | rejected | has no verdict |', '| --- | ---: | ---: | ---: | ---: | ---: |',
    `| All ${strategies.length} strategies wrote the same circuit | ${all.messages} | ${share(all.messages)} | ${all.accepted} | ${all.rejected} | ${all.unjudged} |`,
    `| More than half of them wrote the same circuit | ${majority.messages} | ${share(majority.messages)} | ${majority.accepted} | ${majority.rejected} | ${majority.unjudged} |`, '')
  for (const [label, tally] of [['all strategies', all], ['more than half of the strategies', majority]]) {
    if (judged(tally)) out.push(`When ${label} agreed and the shared circuit has a verdict, the verdict is "accepted" in ${percent(tally.accepted / judged(tally))} of the cases (${tally.accepted} of ${judged(tally)}).`)
  }
  out.push('', 'How many strategies wrote the most common circuit of a message:', '', '| Strategies that agree | Messages | Share |', '| ---: | ---: | ---: |',
    ...Object.entries(sizes).map(([size, count]) => `| ${size} | ${count} | ${share(count)} |`), `| no strategy wrote a valid circuit | ${noCircuit} | ${share(noCircuit)} |`)
  if (pairs.length) {
    out.push('', 'Each pair of strategies: the share of all messages for which both wrote the same circuit.', '', '| Strategy | Strategy | Same circuit | Share of messages | Both wrote a valid circuit |', '| --- | --- | ---: | ---: | ---: |',
      ...[...pairs].sort((a, b) => b.same - a.same).map(pair => `| ${pair.a} | ${pair.b} | ${pair.same} | ${share(pair.same)} | ${pair.both} |`))
  }
  return out.join('\n') + '\n'
}

// ---- circuits settled by agreement
/**
 * The core of a circuit with the start of every relation that has a marker left out, and its
 * ambiguity mark: what two circuits share when they differ only in where a phrase attaches. The
 * judges' rules let such a start be the clause or any nominal of it that grammar allows. On the
 * first two judged rounds, 325 of 327 circuits that VSS wrote and a parser strategy matched up to
 * these starts were accepted.
 */
export function relaxedCore(core) {
  if (!core) return null
  const marked = new Set([...core.matchAll(/^\d+-\d+ marker @(\(\d+>\d+\))$/gmu)].map(match => match[1]))
  let lines = core.split('\n')
  for (const id of marked) {
    const loose = id.replace(/^\(\d+>/u, '(*>')
    lines = lines.filter(line => !line.startsWith('relation ' + id + ' from ') && line !== 'relation ' + id + ' attachment ambiguous').map(line => line.replaceAll(id, loose))
  }
  return lines.sort().join('\n')
}

// ---- the agreement key: written alike up to what the judges' rules let pass either way
// rules.md names, in its settled cases, choices where both ways pass. agreementKey rewrites a circuit
// into one of the two ways for each such choice, and then takes a core like coreOf, with the start of a
// marked relation left out as relaxedCore does. Two circuits with one key differ only in those choices.
// Only choices that rules.md names are rewritten; each rewrite below quotes its rule.
const NAMING_PARTICIPLES = new Set(['called', 'named', 'titled', 'entitled', 'labeled', 'labelled'])
const GRADING_WORDS = new Set(['right', 'just', 'directly', 'immediately', 'straight', 'slightly', 'far', 'way', 'up', 'down', 'exactly', 'close'])
const PLACE_MARKERS = new Set(['above', 'below', 'behind', 'under', 'underneath', 'beneath', 'over', 'beside', 'next to', 'near', 'by', 'in front of', 'inside', 'outside',
  'between', 'along', 'against', 'around', 'on', 'at', 'in', 'into', 'onto', 'past', 'beyond', 'toward', 'towards', 'across', 'alongside', 'atop', 'on top of'])
// the quantity phrases of the rule's examples; judges rejected others held as dependents ("any of my meetings")
const QUANTITY_PHRASE = /^(?:a pair|a couple|all|every one)$/iu
/** The wires of a valid circuit with the span of every quoted value: {wires: [{id, type, slots: [{key, span | ref | value}]}], words}. */
function spannedWires(text, sop) {
  const normal = normalForm(text, sop)
  if (!normal?.core) return null
  const check = validateSyntax(text, normal.sop)
  if (!check.valid) return null
  let place = 0
  const wires = parseCircuit(normal.sop).map(wire => ({id: wire.id, type: wire.type, slots: wire.slots.map(([key, raw]) => {
    const kind = schema[wire.type][key].kind
    if (kind === 'ref') return {key, ref: raw.slice(1)}
    if (kind === 'string') { const {first, last} = check.placements[place++]; return {key, span: [first, last]} }
    return {key, value: raw}
  })}))
  return {wires, words: wordsOf(text)}
}
/**
 * The agreement key of a circuit: equal for two circuits of a message that differ only where the
 * judges' rules let both ways pass, null for a text that is no valid circuit of the message. The
 * choices it sets aside, each a settled case of rules.md:
 *   - the start of a marked relation, as relaxedCore (and the order of coordinated relations does not
 *     depend on it); except a relation marked "of", which starts at the nominal right before "of" or
 *     at a clause, and the marker of a naming participle, whose start is the thing named;
 *   - which clause holds a `discourse` word; a fragment that holds nothing but discourse words;
 *   - a number or a name right after a noun: a `dependent` of the noun, or a nominal of its own tied to
 *     it without a marker (not when that nominal is tied to anything else);
 *   - a name of several words whole in `head`, or its last word as head and the others dependents;
 *     with the number or name after a noun as a dependent, the run of words is the head;
 *   - "a bit", "a little": a measure nominal that is a complement, or `modifier` words of the clause;
 *   - a naming participle ("called", "named", ...): a nonfinite clause tied to the thing, or the marker
 *     of a relation from the thing to its name;
 *   - a quantity phrase before a noun ("a pair of", "all of", "every one of"): a nominal with a relation
 *     marked "of", or dependents of the noun;
 *   - "let's", "let us": the clause of "let" with the nonfinite clause tied to it (with "'s" or "us" as
 *     its subject or not), or discourse words of an imperative clause;
 *   - "left of", "right of" as one marker, or "left" a modifier of the clause (or a nominal of its own)
 *     with the relation marked "of" starting at the clause; a word that grades a place marker ("just
 *     above", "right behind") in the marker or as a modifier of the clause.
 * Measured on the judged runs of 2026-11-27, see README.md.
 */
export function agreementKey(text, sop) {
  const built = typeof text === 'string' && typeof sop === 'string' ? spannedWires(text, sop) : null
  if (!built) return null
  const {words} = built
  let wires = built.wires
  const byId = () => new Map(wires.map(wire => [wire.id, wire]))
  const spansOf = wire => wire.slots.filter(slot => slot.span)
  const wordsIn = wire => spansOf(wire).flatMap(slot => Array.from({length: slot.span[1] - slot.span[0] + 1}, (_, k) => slot.span[0] + k)).sort((a, b) => a - b)
  const refsTo = id => wires.flatMap(wire => wire.slots.filter(slot => slot.ref === id).map(slot => ({wire, slot})))
  const slotOf = (wire, key) => wire.slots.find(slot => slot.key === key)
  const refOf = (wire, key) => slotOf(wire, key)?.ref
  const marker = wire => slotOf(wire, 'marker')
  const isMarked = wire => wire.type === 'syntax.relation' && Boolean(marker(wire))
  // the start of a marked relation is not compared, so it is no tie of its own
  const ties = id => refsTo(id).filter(({wire, slot}) => !(isMarked(wire) && slot.key === 'from'))
  const word = at => words[at]?.text ?? ''
  const said = span => words.slice(span[0], span[1] + 1).map(one => one.text.toLowerCase()).join(' ')
  const quotedBefore = at => { const start = words[at]?.start; return start > 0 && /["'“‘]/u.test(text[start - 1]) }
  const nameLike = at => /^[\p{Lu}\p{N}]/u.test(word(at)) || /\p{N}/u.test(word(at)) || quotedBefore(at)
  const remove = (...gone) => { const set = new Set(gone); wires = wires.filter(wire => !set.has(wire)) }
  const redirect = (from, to) => { for (const wire of wires) for (const slot of wire.slots) if (slot.ref === from) slot.ref = to }
  const perWord = (key, span) => Array.from({length: span[1] - span[0] + 1}, (_, k) => ({key, span: [span[0] + k, span[0] + k]}))
  const clauseOf = (id, depth = 0) => {
    const wire = byId().get(id)
    if (!wire || depth > 8) return null
    if (wire.type === 'syntax.clause') return id
    const tied = refsTo(id)
    const holder = tied.find(({wire: other, slot}) => other.type === 'syntax.clause' && (slot.key === 'subject' || slot.key === 'complement'))
    if (holder) return holder.wire.id
    for (const {wire: other, slot} of tied) {
      if (other.type === 'syntax.relation' && slot.key === 'to') return clauseOf(refOf(other, 'from'), depth + 1)
      if (other.type === 'syntax.coordination' && slot.key === 'conjunct') return clauseOf(other.id, depth + 1)
    }
    return wire.type === 'syntax.relation' ? clauseOf(refOf(wire, 'from'), depth + 1) : null
  }

  // "A quantity phrase before a noun ("a pair of trees", "a couple of boxes", "all of the cushions", "every one of the
  // clouds") may be held as `dependent` words of that noun."
  for (const relation of wires.filter(wire => isMarked(wire) && said(marker(wire).span) === 'of')) {
    const at = marker(relation).span[0], end = byId().get(refOf(relation, 'to'))
    if (end?.type !== 'syntax.nominal' || wordsIn(end)[0] !== at + 1 || refsTo(relation.id).length) continue
    const quantity = wires.find(wire => wire.type === 'syntax.nominal' && wordsIn(wire).at(-1) === at - 1)
    if (!quantity || !QUANTITY_PHRASE.test(wordsIn(quantity).map(word).join(' '))) continue
    end.slots.push(...spansOf(quantity).flatMap(slot => perWord('dependent', slot.span)), {key: 'dependent', span: [at, at]})
    remove(relation); redirect(quantity.id, end.id); remove(quantity)
  }
  // "A number or a name right after a noun ("block 2", "x 120", "the node Intro") may be a `dependent` in that noun's
  // nominal, or a nominal of its own tied to the noun by a relation without a marker."
  for (let changed = true; changed;) {
    changed = false
    for (const relation of wires.filter(wire => wire.type === 'syntax.relation' && !marker(wire) && !spansOf(wire).length)) {
      const map = byId(), one = map.get(refOf(relation, 'from')), other = map.get(refOf(relation, 'to'))
      if (one?.type !== 'syntax.nominal' || other?.type !== 'syntax.nominal' || refsTo(relation.id).length) continue
      const pair = [[one, other], [other, one]].find(([noun, name]) => {
        const nounWords = wordsIn(noun), nameWords = wordsIn(name)
        return nameWords[0] === nounWords.at(-1) + 1 && spansOf(name).every(slot => nameLike(slot.span[0])) &&
          // a name of several words cut in two is no name after a noun ("Core Hub"); a number after a name is ("Work 5")
          !(/^\p{Lu}/u.test(word(nounWords.at(-1))) && !/\p{N}/u.test(word(nameWords[0]))) &&
          // tied to nothing else, not even as the start of a marked relation: merging would move that start
          refsTo(name.id).length === 1
      })
      if (!pair) continue
      const [noun, name] = pair
      noun.slots.push(...spansOf(name).flatMap(slot => perWord('dependent', slot.span)))
      remove(relation); redirect(name.id, noun.id); remove(name)
      changed = true
      break
    }
  }
  // "A participle that names or describes ("a group called g2") is the `verb` of a nonfinite clause tied to the thing.
  // Written as the `marker` of a relation between the thing and its name, it also passes."
  for (const clause of wires.filter(wire => wire.type === 'syntax.clause')) {
    if (clause.slots.map(slot => slot.key).sort().join(' ') !== 'complement form verb' || slotOf(clause, 'form').value !== 'nonfinite') continue
    const verb = slotOf(clause, 'verb')
    if (verb.span[0] !== verb.span[1] || !NAMING_PARTICIPLES.has(said(verb.span))) continue
    const tied = ties(clause.id)
    if (tied.length !== 1 || tied[0].slot.key !== 'to' || tied[0].wire.type !== 'syntax.relation' || marker(tied[0].wire)) continue
    const relation = tied[0].wire, thing = byId().get(refOf(relation, 'from'))
    if (thing?.type !== 'syntax.nominal') continue
    relation.slots = [{key: 'marker', span: verb.span}, {key: 'from', ref: thing.id}, {key: 'to', ref: refOf(clause, 'complement')}]
    redirect(clause.id, thing.id); remove(clause)
  }
  // "Words that grade a graded word ("a bit longer") are `modifier` words of the clause ...; "a bit" or "a little" may
  // also stand as a nominal of its own (a measure)."
  for (const nominal of wires.filter(wire => wire.type === 'syntax.nominal')) {
    const own = wordsIn(nominal)
    if (own.length !== 2 || word(own[0]).toLowerCase() !== 'a' || !['bit', 'little'].includes(word(own[1]).toLowerCase())) continue
    const tied = ties(nominal.id)
    if (tied.length !== 1 || tied[0].slot.key !== 'complement' || tied[0].wire.type !== 'syntax.clause') continue
    const clause = tied[0].wire
    clause.slots = [...clause.slots.filter(slot => slot !== tied[0].slot), ...own.map(at => ({key: 'modifier', span: [at, at]}))]
    redirect(nominal.id, clause.id); remove(nominal)
  }
  // ""let" is the `verb`; "'s" or "us" is a nominal that is its `complement`, and may be the `subject` of the
  // nonfinite clause of "add", tied to the clause of "let". Holding "let's" or "let us" as `discourse` words of an
  // imperative clause of "add" also passes." The second way is kept.
  for (const clause of wires.filter(wire => wire.type === 'syntax.clause')) {
    const verb = slotOf(clause, 'verb')
    if (!verb || verb.span[0] !== verb.span[1] || said(verb.span) !== 'let' || slotOf(clause, 'form').value !== 'imperative') continue
    const others = clause.slots.filter(slot => !['form', 'verb', 'discourse'].includes(slot.key))
    const pronoun = others.length === 1 && others[0].key === 'complement' ? byId().get(others[0].ref) : null
    if (pronoun?.type !== 'syntax.nominal' || wordsIn(pronoun).length !== 1 || wordsIn(pronoun)[0] !== verb.span[0] + 1 || !["'s", '’s', 'us'].includes(word(verb.span[0] + 1).toLowerCase())) continue
    const relation = refsTo(clause.id).find(({wire, slot}) => wire.type === 'syntax.relation' && !marker(wire) && slot.key === 'from')?.wire
    const target = relation && byId().get(refOf(relation, 'to'))
    if (target?.type !== 'syntax.clause' || slotOf(target, 'form').value !== 'nonfinite' || refsTo(relation.id).length) continue
    if (refsTo(pronoun.id).some(({wire, slot}) => !(wire === clause || wire === target && slot.key === 'subject'))) continue
    target.slots = target.slots.filter(slot => !(slot.key === 'subject' && slot.ref === pronoun.id))
    slotOf(target, 'form').value = 'imperative'
    target.slots.push({key: 'discourse', span: verb.span}, ...spansOf(pronoun).map(slot => ({key: 'discourse', span: slot.span})), ...clause.slots.filter(slot => slot.key === 'discourse'))
    remove(relation, pronoun); redirect(clause.id, target.id); remove(clause)
  }
  // ""left of" may be one `marker`, or "left" a nominal or a clause `modifier` with the relation marked "of" starting at
  // the clause or at "left"", and "A word that grades a linking word ("right behind", "just above") may be a `modifier`
  // of the clause the relation belongs to." The word is kept as a modifier of the clause of the relation's start.
  for (const relation of wires.filter(wire => isMarked(wire) && marker(wire).span[1] > marker(wire).span[0])) {
    const mark = marker(relation), first = word(mark.span[0]).toLowerCase(), rest = said([mark.span[0] + 1, mark.span[1]])
    const sideOf = ['left', 'right'].includes(first) && rest === 'of'
    if (!sideOf && !(GRADING_WORDS.has(first) && PLACE_MARKERS.has(rest))) continue
    const clause = clauseOf(refOf(relation, 'from'))
    if (!clause) continue
    byId().get(clause).slots.push({key: 'modifier', span: [mark.span[0], mark.span[0]]})
    mark.span = [mark.span[0] + 1, mark.span[1]]
    if (sideOf) slotOf(relation, 'from').ref = clause
  }
  for (const nominal of wires.filter(wire => wire.type === 'syntax.nominal' && wordsIn(wire).length === 1 && ['left', 'right'].includes(word(wordsIn(wire)[0]).toLowerCase()))) {
    const at = wordsIn(nominal)[0]
    const of = wires.find(wire => isMarked(wire) && marker(wire).span[0] === at + 1 && said(marker(wire).span) === 'of')
    const tied = ties(nominal.id)
    if (!of || tied.length > 1 || tied.some(({wire, slot}) => !(wire.type === 'syntax.clause' && slot.key === 'complement'))) continue
    const clause = tied.length ? tied[0].wire : byId().get(clauseOf(refOf(of, 'from')) ?? '')
    if (clause?.type !== 'syntax.clause') continue
    clause.slots = [...clause.slots.filter(slot => slot.ref !== nominal.id), {key: 'modifier', span: [at, at]}]
    redirect(nominal.id, clause.id); remove(nominal)
  }
  // the head as a run of words: "A name of several words ("Team lunch", "Sales 3") may stand whole in `head`, or with its
  // last word as `head` and the others as `dependent`", and the number or name right after a noun as its dependent
  for (const nominal of wires.filter(wire => wire.type === 'syntax.nominal')) {
    const head = slotOf(nominal, 'head')
    if (!head) continue
    let [first, last] = head.span
    const dependents = new Set(nominal.slots.filter(slot => slot.key === 'dependent').map(slot => slot.span[0]))
    // a head of several words is a name standing whole: what follows it is no part of it ("meeting Intro" + "Main")
    if (first === last) while (dependents.has(last + 1) && nameLike(last + 1)) last++
    if (last === head.span[1]) while (dependents.has(first - 1) && nameLike(first - 1)) first--
    if (first === head.span[0] && last === head.span[1]) continue
    nominal.slots = nominal.slots.filter(slot => !(slot.key === 'dependent' && slot.span[0] >= first && slot.span[0] <= last))
    head.span = [first, last]
  }
  // the starts that are not compared: those relaxedCore leaves out (a marked relation between two wires that hold words),
  // except "of after a nominal: the relation starts at that nominal or at its clause, never at another nominal", and the
  // marker of a naming participle, whose start is the thing named
  const worded = new Set(wires.filter(wire => (wire.type === 'syntax.clause' || wire.type === 'syntax.nominal') && spansOf(wire).length).map(wire => wire.id))
  const loose = new Set()
  for (const relation of wires.filter(wire => isMarked(wire) && worded.has(refOf(wire, 'from')) && worded.has(refOf(wire, 'to')))) {
    const linking = said(marker(relation).span), start = byId().get(refOf(relation, 'from'))
    if (NAMING_PARTICIPLES.has(linking)) continue
    if (linking === 'of' && start.type !== 'syntax.clause' && !wordsIn(start).includes(marker(relation).span[0] - 1)) continue
    loose.add(relation.id)
  }
  // "Which clause holds a `discourse` word" is not judged; a fragment left with nothing is no clause
  const discourse = []
  for (const clause of wires.filter(wire => wire.type === 'syntax.clause')) {
    const held = clause.slots.filter(slot => slot.key === 'discourse')
    if (!held.length) continue
    discourse.push(...held.map(slot => slot.span))
    clause.slots = clause.slots.filter(slot => slot.key !== 'discourse')
    if (clause.slots.every(slot => slot.key === 'form') && !refsTo(clause.id).length && wires.filter(wire => wire.type === 'syntax.clause').length > 1) remove(clause)
  }
  // the lines of coreOf, from the rewritten wires
  const map = byId(), firstOf = new Map()
  for (const wire of wires) for (const slot of spansOf(wire)) firstOf.set(wire.id, Math.min(firstOf.get(wire.id) ?? Infinity, slot.span[0]))
  const name = (id, depth = 0) => {
    const wire = map.get(id)
    if (!wire) return '?'
    if (firstOf.has(id) && wire.type !== 'syntax.relation' && wire.type !== 'syntax.coordination') return String(firstOf.get(id))
    if (depth > 6) return '?'
    if (loose.has(id)) return '(*>' + name(refOf(wire, 'to'), depth + 1) + ')'
    const refs = wire.slots.filter(slot => slot.ref).map(slot => name(slot.ref, depth + 1))
    return wire.type === 'syntax.coordination' ? '[' + refs.sort().join('+') + ']' : '(' + refs.join('>') + ')'
  }
  const lines = discourse.map(span => `${span[0]}-${span[1]} discourse @*`)
  for (const wire of wires) for (const slot of wire.slots) {
    if (loose.has(wire.id) && (slot.key === 'from' || slot.key === 'attachment')) continue
    lines.push(slot.span ? `${slot.span[0]}-${slot.span[1]} ${slot.key} @${name(wire.id)}` : `${wire.type.slice(7)} ${name(wire.id)} ${slot.key} ${slot.ref ? name(slot.ref) : slot.value}`)
  }
  return [...new Set(lines)].sort().join('\n')
}
/** How circuits are compared for agreement: by their core, up to the start of marked relations, or up to what the rules let pass. */
export const AGREEMENT_KEYS = ['core', 'relaxed', 'variants']
/**
 * The keys under which a circuit {sop, core} of a message is compared. Two circuits count as written
 * alike when they share one. 'variants' keeps the key of 'relaxed', so it never counts fewer circuits
 * alike than 'relaxed' does: agreementKey is stricter in a few starts ("of", naming participles).
 */
export function agreementKeysOf(text, circuit, key = 'core') {
  if (!circuit?.core) return []
  if (key === 'core') return ['core ' + circuit.core]
  const keys = ['relaxed ' + relaxedCore(circuit.core)]
  if (key === 'variants') { const variants = agreementKey(text, circuit.sop); if (variants !== null) keys.push('variants ' + variants) }
  return keys
}
/** Whether two circuits {sop, core} of one message count as written alike under a key of AGREEMENT_KEYS. */
export function writtenAlike(text, one, other, key = 'core') {
  const keys = new Set(agreementKeysOf(text, one, key))
  return agreementKeysOf(text, other, key).some(each => keys.has(each))
}
/**
 * The circuits that strategies of enough different families wrote alike, for the messages of a run.
 * A circuit the registry already holds is left out: it keeps its verdict, accepted or rejected. So is
 * a circuit that is the label of its message already: it is settled.
 * @param familyOf name of a strategy -> its family
 * @param minFamilies how many different families must have written the circuit (2 when not given)
 * @param key how circuits count as written alike, one of AGREEMENT_KEYS: 'core' (the same core, the
 *   default), 'relaxed' (relaxedCore: up to the start of marked relations) or 'variants' (relaxedCore
 *   or agreementKey: also up to the other choices the judges' rules let pass). With 'relaxed' or
 *   'variants' the circuits of a message that share a key, directly or through another circuit, form
 *   one group; the circuit that stands for them is the one a strategy of `prefer` wrote, in the order
 *   of that list, else the one most strategies wrote
 * @param relaxed the same as key 'relaxed', for the callers that pass it
 * @param labels the labels of the messages (a Map text -> label line)
 * @returns [{text, sop, core, sources, families}] in the order of the messages
 */
export function agreedCircuits(outputs, registry, familyOf, minFamilies = 2, {key = undefined, relaxed = false, prefer = [], labels = new Map()} = {}) {
  const compare = key ?? (relaxed ? 'relaxed' : 'core')
  if (!AGREEMENT_KEYS.includes(compare)) throw new Error(`Unknown agreement key "${compare}": one of ${AGREEMENT_KEYS.join(', ')}.`)
  const settled = (text, core) => Boolean(lookup(registry, text, core)) || labels.get(text)?.core === core
  const texts = [], circuits = new Map()
  for (const {strategy, rows} of outputs) for (const row of rows) {
    if (!circuits.has(row.text)) { circuits.set(row.text, new Map()); texts.push(row.text) }
    if (!row.core) continue
    const found = circuits.get(row.text)
    const circuit = found.get(row.core) ?? found.set(row.core, {text: row.text, sop: row.normal, core: row.core, sources: new Set()}).get(row.core)
    circuit.sources.add(strategy)
  }
  const agreed = []
  const byCore = (a, b) => a.core < b.core ? -1 : a.core > b.core ? 1 : 0
  for (const text of texts) {
    const written = [...circuits.get(text).values()].sort(byCore)
    if (compare === 'core') {
      for (const circuit of written) {
        const sources = [...circuit.sources].sort(), kinds = [...new Set(sources.map(familyOf))].sort()
        if (kinds.length >= minFamilies && !settled(text, circuit.core)) agreed.push({...circuit, sources, families: kinds})
      }
      continue
    }
    // the circuits that share a key, directly or through another circuit of the message, form one group
    const parent = written.map((_, index) => index), owner = new Map()
    const root = index => parent[index] === index ? index : (parent[index] = root(parent[index]))
    written.forEach((circuit, index) => {
      for (const each of agreementKeysOf(text, circuit, compare)) { if (owner.has(each)) parent[root(index)] = root(owner.get(each)); else owner.set(each, index) }
    })
    const groups = new Map()
    written.forEach((circuit, index) => { const at = root(index); groups.set(at, [...(groups.get(at) ?? []), circuit]) })
    for (const members of groups.values()) {
      const sources = [...new Set(members.flatMap(circuit => [...circuit.sources]))].sort(), kinds = [...new Set(sources.map(familyOf))].sort()
      if (kinds.length < minFamilies) continue
      const rank = circuit => { const at = prefer.findIndex(name => circuit.sources.has(name)); return at < 0 ? prefer.length : at }
      const chosen = [...members].sort((a, b) => rank(a) - rank(b) || b.sources.size - a.sources.size || byCore(a, b))[0]
      if (!settled(text, chosen.core)) agreed.push({...chosen, sources, families: kinds})
    }
  }
  return agreed
}
/**
 * A random share of the agreed circuits, for a judge to read: it shows how often agreement is right.
 * The choice depends only on the seed, the messages and the circuits.
 * @returns a Set of text + "\0" + core
 */
export function chooseAudit(agreed, share, seed) {
  const place = circuit => createHash('sha256').update(seed + '\0' + circuit.text + '\0' + circuit.core).digest('hex')
  const ordered = agreed.map(circuit => ({circuit, at: place(circuit)})).sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : 0)
  return new Set(ordered.slice(0, Math.round(agreed.length * share)).map(({circuit}) => circuit.text + '\0' + circuit.core))
}

// ---- the judging files of a run
export const judgingDir = runDir => join(runDir, 'judging')
export const itemsFile = runDir => join(runDir, 'key', 'items.jsonl')
export const agreementFile = runDir => join(runDir, 'key', 'agreement.jsonl')
/** The circuits of the run settled by agreement, as round.mjs settle recorded them; none for a run without that step. */
export function readAgreement(runDir) { return existsSync(agreementFile(runDir)) ? readJsonl(agreementFile(runDir)) : [] }
/** Writes what a judge needs: the items, new packets for the added ones, the rules and the checker. Returns the new packets as [name, lines]. */
export function writeJudging(runDir, items, added, size = 200) {
  const folder = judgingDir(runDir)
  mkdirSync(folder, {recursive: true})
  writeJsonl(itemsFile(runDir), items)
  const first = Math.max(0, ...packetNumbers(folder)) + 1
  const packets = packetsOf(added, size).map((packet, index) => [`packet-${first + index}.jsonl`, packet])
  for (const [name, packet] of packets) writeJsonl(join(folder, name), packet)
  copyFileSync(join(here, 'rules.md'), join(folder, 'RULES.md'))
  copyFileSync(join(here, 'check.mjs'), join(folder, 'check.mjs'))
  return packets.map(([name, packet]) => [name, packet.length])
}
/**
 * Everything the run knows of its circuits: the verdicts of its judge that pass the check, and the
 * circuits settled by agreement. {items, verdicts: Map as runVerdicts gives, problems}
 */
export function readRunVerdicts(runDir) {
  const items = readItems(runDir), read = readVerdictFiles(runDir)
  return {items, verdicts: runVerdicts(items, read.verdicts, readAgreement(runDir)), problems: read.problems}
}
// The labels as they were before the run, for the messages of the run: taken the first time the run
// is prepared, settled or published, and never changed after that. A line is {text, label, source,
// accepted_by}; a message with no line had no label. A file written by the earlier tools, with every
// label of the dataset and the keys {text, label, core, run, source, previous}, is read as well.
export const labelsBeforeFile = runDir => join(runDir, 'key', 'labels-before.jsonl')
/**
 * Keeps the labels that the messages of the run have at this moment, unless the run already has its file.
 * @param labels the labels of now
 * @param texts the messages of the run, or a function that gives them (called only when the file is to be written)
 */
export function keepLabelsBefore(runDir, labels, texts) {
  if (existsSync(labelsBeforeFile(runDir))) return false
  const messages = [...new Set(typeof texts === 'function' ? texts() : texts)]
  writeJsonl(labelsBeforeFile(runDir), messages.filter(text => labels.has(text)).map(text => { const {label, source, accepted_by} = labels.get(text); return {text, label, source, accepted_by} }))
  return true
}
/**
 * The labels before the run: those of the run's file, or the labels of now when the run has none yet.
 * @param labels the labels of now, or a function that reads them (called only when the run has no file)
 */
export function readLabelsBefore(runDir, labels = new Labels()) {
  if (!existsSync(labelsBeforeFile(runDir))) return typeof labels === 'function' ? labels() : labels
  const before = new Labels()
  for (const line of readJsonl(labelsBeforeFile(runDir))) {
    if (typeof line.label === 'string' && line.label) before.set(line.text, labelLine({text: line.text, label: line.label, source: line.source ?? '', accepted_by: line.accepted_by ?? ''}))
  }
  return before
}
export function readItems(runDir) { return existsSync(itemsFile(runDir)) ? readJsonl(itemsFile(runDir)) : [] }
/**
 * The verdicts of the run that pass the check of check.mjs: {verdicts: [{n, grade, note}], problems}.
 * A line with a format problem does not count until it is corrected; `problems` names such lines.
 */
export function readVerdictFiles(runDir) {
  const folder = judgingDir(runDir), verdicts = [], problems = []
  if (!existsSync(folder)) return {verdicts, problems}
  for (const k of packetNumbers(folder)) {
    const result = checkPacket(folder, k)
    verdicts.push(...result.verdicts)
    problems.push(...result.problems.map(problem => `verdicts-${k}.jsonl ${problem}`))
  }
  return {verdicts, problems}
}
