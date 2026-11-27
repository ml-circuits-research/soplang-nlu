// The shared parts of the syntax benchmark: the normal form of a circuit, the registry of judged
// circuits, the packets for a judge, the levels and the agreement between strategies.
// Nothing here reads a knowledge repository or the `nlu` schema.
import {readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {validateSyntax, parseCircuit, writeCircuit, coreOf, schema} from '../../../lib/syntax.mjs'
import {checkPacket, packetNumbers} from './check.mjs'

const here = dirname(fileURLToPath(import.meta.url))
export const packageRoot = resolve(here, '../../..')
export const sampleFile = join(packageRoot, 'eval-results/2026-11-26-fresh-locked-one-percent/sample.json.gz')
export const defaultRegistryDir = resolve(packageRoot, '../webmeet-dataset/annotations/syntax/v1/judged')
export const LEVELS = Array.from({length: 11}, (_, level) => 'L' + level)
export const GRADES = ['L8', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6']
export const GOAL_LEVELS = ['L8', 'L9', 'L10']

// ---- small file helpers
export const readJsonl = file => readFileSync(file, 'utf8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line))
export const writeJsonl = (file, rows) => { mkdirSync(dirname(file), {recursive: true}); writeFileSync(file, rows.map(row => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : '')) }
export const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
export const writeJson = (file, value) => { mkdirSync(dirname(file), {recursive: true}); writeFileSync(file, JSON.stringify(value, null, 2) + '\n') }

/** The fixed sample: [{id, text}]. Whatever else the file holds for a message is left out. */
export function readSample(file = sampleFile) {
  return JSON.parse(gunzipSync(readFileSync(file))).map(({id, text}) => ({id, text}))
}

/** Command line: positional words and --name value pairs; a --name with no value is true. */
export function readArguments(argv) {
  const words = [], named = {}
  for (let at = 0; at < argv.length; at++) {
    if (!argv[at].startsWith('--')) { words.push(argv[at]); continue }
    const next = argv[at + 1]
    if (next === undefined || next.startsWith('--')) named[argv[at].slice(2)] = true
    else { named[argv[at].slice(2)] = next; at++ }
  }
  return {words, named}
}

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
// One line per judged circuit: {text, sop, core, verdict, grade, note, judge, run, source}.
// A row written by the converter of older `nlu` references (run "convert-nlu…") was never read by a
// judge in this schema: a judge's row for the same circuit counts before it.
export const isConverted = row => String(row?.run ?? '').startsWith('convert-nlu')
export const sourcesOf = row => String(row?.source ?? '').split('+')

export function emptyRegistry() { return {files: [], rows: 0, ignored: 0, byText: new Map()} }
export function addToRegistry(registry, row) {
  const normal = normalForm(row.text, row.sop)
  if (!normal?.core || !['accepted', 'rejected'].includes(row.verdict)) { registry.ignored++; return false }
  registry.rows++
  const circuits = registry.byText.get(row.text) ?? registry.byText.set(row.text, new Map()).get(row.text)
  const seen = circuits.get(normal.core)
  if (!seen || (isConverted(seen) && !isConverted(row))) circuits.set(normal.core, {...row, core: normal.core})
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
export const circuitsOf = (registry, text) => [...registry.byText.get(text)?.values() ?? []]

// ---- what needs a judge
/**
 * Collects the circuits of a run that no judge has seen, once per message and core, whatever number
 * of strategies wrote them.
 * @param outputs from readOutputs
 * @param earlier items of an earlier call for the same run: they keep their numbers
 * @param auditReferences also collect the converted reference circuits of every message that has a
 *   circuit to judge, so that a judge reads them in this schema
 * @returns {items, added}: every item is {n, text, sop, core, sources}; `added` are the new ones
 */
export function collectItems(outputs, registry, {earlier = [], auditReferences = false} = {}) {
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
    const waiting = [...circuits.get(text)].filter(([core]) => !lookup(registry, text, core))
    if (auditReferences && waiting.length) {
      for (const row of circuitsOf(registry, text)) if (isConverted(row) && sourcesOf(row).includes('reference')) waiting.push([row.core, {sop: normalForm(text, row.sop).sop, sources: new Set(['reference'])}])
    }
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
/** The verdicts of one run: Map text -> Map core -> {grade, note, sources}. `items` carry the numbers the verdicts use. */
export function runVerdicts(items, verdicts) {
  const byNumber = new Map(verdicts.map(verdict => [verdict.n, verdict]))
  const found = new Map()
  for (const item of items) {
    const verdict = byNumber.get(item.n)
    if (!verdict || !GRADES.includes(verdict.grade)) continue
    const circuits = found.get(item.text) ?? found.set(item.text, new Map()).get(item.text)
    circuits.set(item.core, {grade: verdict.grade, note: verdict.note ?? '', sources: item.sources})
  }
  return found
}
/** Is a reference circuit of this message recorded as rejected, in the registry or by this run's judge? */
export function referenceRejected(text, registry, verdicts = new Map()) {
  return circuitsOf(registry, text).some(row => row.verdict === 'rejected' && sourcesOf(row).includes('reference')) ||
    [...verdicts.get(text)?.values() ?? []].some(verdict => verdict.grade !== 'L8' && verdict.sources.includes('reference'))
}
/**
 * The level of one message for one strategy.
 *   L0        no valid circuit
 *   L1–L6     the judge's grade for a rejected circuit
 *   L8        accepted by a judge in this run
 *   L9        accepted and already in the registry: no judge was needed
 *   L10       accepted, while a reference circuit of the message is recorded as rejected
 *   waiting   no judge has read the circuit yet
 * L7 is unused: a strategy returns one circuit.
 */
export function levelOf(row, registry, verdicts = new Map()) {
  if (!row.core) return 'L0'
  const now = verdicts.get(row.text)?.get(row.core)
  const before = now ? undefined : lookup(registry, row.text, row.core)
  if (!now && !before) return 'waiting'
  const grade = now ? now.grade : before.verdict === 'accepted' ? 'L8' : before.grade
  if (grade !== 'L8') return grade
  if (referenceRejected(row.text, registry, verdicts)) return 'L10'
  return now ? 'L8' : 'L9'
}
/** One row per strategy: the count of every level, the waiting ones, GOAL, and the accepted circuits that leave an attachment open. */
export function tableOf(outputs, registry, verdicts = new Map()) {
  return outputs.map(({strategy, rows}) => {
    const levels = Object.fromEntries(LEVELS.map(level => [level, 0]))
    let waiting = 0, ambiguous = 0
    for (const row of rows) {
      const level = levelOf(row, registry, verdicts)
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
    'L0 no valid circuit. L1 to L6 a circuit rejected by a judge, with the judge\'s grade. L7 is unused, since a strategy returns one circuit. L8 accepted by a judge in this run. L9 accepted and already in the registry, so no judge was needed. L10 accepted, while a reference circuit of that message is recorded as rejected.']
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

// ---- the judging files of a run
export const judgingDir = runDir => join(runDir, 'judging')
export const itemsFile = runDir => join(runDir, 'key', 'items.jsonl')
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
