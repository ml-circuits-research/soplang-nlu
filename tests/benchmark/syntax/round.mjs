// A conversion round: the next file of the dataset's `semantic/` folder gets its file in `syntactic/`.
// Testing the formalizers and converting the dataset are one activity.
//   node tests/benchmark/syntax/round.mjs plan [--rounds 3] [--min-messages 500] [--order size|name]
//   node tests/benchmark/syntax/round.mjs start <round> [--min-messages 500] [--order size|name] [--files <tab/name.csv,…>]
//   node tests/benchmark/syntax/run.mjs <round> --sample <round>/sample.json
//   node tests/benchmark/syntax/round.mjs settle <round> [--audit 0.05] [--size 200]
//   (judges write <round>/judging/verdicts-<k>.jsonl)
//   node tests/benchmark/syntax/round.mjs rewrite-prepare <round> [--size 100]
//   (judges write <round>/rewriting/written-<k>.jsonl)
//   node tests/benchmark/syntax/round.mjs write <round> --tag <name> [--judge <model>] [--allow-open]
//   node tests/benchmark/syntax/round.mjs report <round>
// plan   shows which files the next rounds would take, and writes nothing.
// start  takes the next source files that have no syntactic file, until the round has enough messages.
// settle a circuit that strategies of at least three different families (--families) wrote alike is settled by agreement; a
//        circuit the registry holds keeps its verdict; the others go to judge packets, with a random
//        share of the agreed ones so that it can be measured how often agreement is right.
// rewrite-prepare  the messages with no accepted circuit go to packets for a judge who writes the circuit.
// write  publishes verdicts, agreed and written circuits into the registry and the labels, then
//        writes the syntactic files. Nothing is written while a message of the round has no circuit.
// report the levels per strategy and how the messages of the round were settled.
// Every command takes --dataset <folder> (default ../webmeet-dataset): the registry and the labels
// are the ones of that dataset. The source files are read as they are on disk, not from git.
import {createHash} from 'node:crypto'
import {existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync} from 'node:fs'
import {basename, dirname, join, relative, resolve} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {coreOf} from '../../../lib/syntax.mjs'
import {readArguments, readSample, readJson, writeJson, readJsonl, writeJsonl, messagesOfCsv, writeCsv, readOutputs, readRegistry, addToRegistry, lookup,
  readLabels, writeLabels, updateLabels, collectItems, readItems, writeJudging, agreedCircuits, chooseAudit, agreementFile, readAgreement, readRunVerdicts,
  keepLabelsBefore, readLabelsBefore, tableOf, renderTable, labelsFileOf, judgingDir, packageRoot} from './lib.mjs'
import {readWritten, rewritingPackets} from './rewrite-check.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const digest = value => createHash('sha256').update(value).digest('hex')
export const SYNTACTIC_HEADER = ['text', 'sop', 'source', 'accepted_by']

// ---- choosing the files of a round
/** The messages of a source file, each distinct text once, in the order of the file: [{record, text}]. */
export function messagesOfFile(content) {
  const seen = new Set()
  return messagesOfCsv(content).filter(({text}) => text.trim() && !seen.has(text) && Boolean(seen.add(text)))
}
/**
 * The files of the next round.
 * @param sources [{file, messages}]: every source file with the number of its messages
 * @param taken a Set of files that have a syntactic file already, or belong to a round in progress
 * @param order "size": fewest messages first; "name": by name
 * @param files explicit choice: exactly these files, in this order
 * @returns the chosen [{file, messages}]: files are added until the round has minMessages messages
 */
export function pickFiles(sources, {taken = new Set(), minMessages = 500, order = 'size', files = null} = {}) {
  const byName = new Map(sources.map(source => [source.file, source]))
  if (files) {
    return files.map(file => {
      if (!byName.has(file)) throw new Error(`${file} is no source file.`)
      if (taken.has(file)) throw new Error(`${file} has a syntactic file already, or belongs to a round in progress.`)
      return byName.get(file)
    })
  }
  if (!['size', 'name'].includes(order)) throw new Error('The order is "size" or "name".')
  const free = sources.filter(source => !taken.has(source.file))
    .sort((a, b) => (order === 'size' ? a.messages - b.messages : 0) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
  const picked = []
  let messages = 0
  for (const source of free) {
    if (picked.length && messages >= minMessages) break
    picked.push(source)
    messages += source.messages
  }
  return picked
}
/** The files of the next rounds, one after the other: [[{file, messages}]]. */
export function planRounds(sources, rounds, options = {}) {
  const taken = new Set(options.taken ?? []), plan = []
  for (let round = 0; round < rounds; round++) {
    const picked = pickFiles(sources, {...options, taken, files: null})
    if (!picked.length) break
    for (const {file} of picked) taken.add(file)
    plan.push(picked)
  }
  return plan
}

// ---- what is known of the messages of a round
/**
 * Every circuit known for the messages of a round, with what is decided of it.
 * @param texts the messages
 * @param outputs the strategy files of the round (readOutputs)
 * @param registry the registry of judged circuits
 * @param verdicts the verdicts of the round: judge and agreement (readRunVerdicts)
 * @param written circuits a judge wrote in this round: [{text, sop, core}]
 * @returns Map text -> [{sop, core, strategies, status, by, grade, note}]
 *   status: "accepted", "rejected" or "waiting"; by: "agreement", "judge" or "written"
 */
export function roundState({texts, outputs, registry, verdicts = new Map(), written = []}) {
  const state = new Map(texts.map(text => [text, new Map()]))
  const circuitOf = (text, core, sop) => {
    const circuits = state.get(text)
    if (!circuits) return null
    return circuits.get(core) ?? circuits.set(core, {sop, core, strategies: new Set(), status: 'waiting', by: null, grade: null, note: ''}).get(core)
  }
  // every circuit that is known: those the registry holds, those the strategies wrote, those a judge wrote
  for (const [text, known] of registry.byText) if (state.has(text)) for (const row of known.values()) {
    const circuit = circuitOf(text, row.core, row.sop)
    for (const name of String(row.source ?? '').split('+')) if (name && name !== 'judge') circuit.strategies.add(name)
  }
  for (const {strategy, rows} of outputs) for (const row of rows) if (row.core) circuitOf(row.text, row.core, row.normal)?.strategies.add(strategy)
  for (const line of written) circuitOf(line.text, line.core, line.sop)
  // what is decided of each, the strongest word last: written by a judge, agreement, a judge of this
  // round who read it, and what the registry holds
  for (const line of written) Object.assign(state.get(line.text)?.get(line.core) ?? {}, {status: 'accepted', by: 'written', grade: 'L8'})
  for (const by of ['agreement', 'judge']) for (const [text, known] of verdicts) if (state.has(text)) for (const [core, verdict] of known) {
    if (verdict.by === by && state.get(text).has(core)) Object.assign(state.get(text).get(core), {status: verdict.grade === 'L8' ? 'accepted' : 'rejected', by, grade: verdict.grade, note: verdict.note ?? ''})
  }
  for (const [text, known] of registry.byText) if (state.has(text)) for (const row of known.values()) {
    Object.assign(state.get(text).get(row.core), {status: row.verdict, by: row.judge === 'agreement' ? 'agreement' : row.source === 'judge' ? 'written' : 'judge', grade: row.grade, note: row.note ?? ''})
  }
  return new Map([...state].map(([text, circuits]) => [text, [...circuits.values()].map(circuit => ({...circuit, strategies: [...circuit.strategies].sort()}))]))
}
/**
 * The circuit that stands for a message: its label when the label is among the accepted circuits,
 * else the accepted circuit most strategies wrote, then the first.
 * @param circuits the circuits of the message (roundState)
 * @param label the label line of the message, or undefined
 * @returns the circuit, or null when none is accepted
 */
export function chooseCircuit(circuits, label) {
  const accepted = circuits.filter(circuit => circuit.status === 'accepted')
  return accepted.find(circuit => circuit.core === label?.core) ?? accepted.reduce((best, circuit) => !best || circuit.strategies.length > best.strategies.length ? circuit : best, null)
}
/**
 * The rows of a syntactic file: every message of the source file once, in order.
 * @returns {rows: [[text, sop, source, accepted_by]], open: [text], counts: {agreement, judge, written, open}}
 */
export function syntacticRows(messages, state, labels) {
  const rows = [], open = [], counts = {agreement: 0, judge: 0, written: 0, open: 0}
  for (const {text} of messages) {
    const chosen = chooseCircuit(state.get(text) ?? [], labels.get(text))
    if (!chosen) { open.push(text); counts.open++; rows.push([text, '', '', '']); continue }
    counts[chosen.by]++
    rows.push([text, chosen.sop, chosen.by === 'written' ? 'judge' : chosen.strategies.join('+'), chosen.by])
  }
  return {rows, open, counts}
}

// ---- the folders
function places(named, recorded = {}) {
  const dataset = resolve(typeof named.dataset === 'string' ? named.dataset : recorded.dataset ?? join(packageRoot, '../webmeet-dataset'))
  const registryDir = resolve(typeof named.registry === 'string' ? named.registry : join(dataset, 'annotations/syntax/v1/judged'))
  return {dataset, semantic: join(dataset, 'semantic'), syntactic: join(dataset, 'syntactic'), registryDir, labelsFile: labelsFileOf(registryDir, named.labels)}
}
/** The source files of the dataset as they are on disk: [{file: "<tab>/<name>.csv", content}]. */
function readSources(semantic) {
  const sources = []
  for (const tab of readdirSync(semantic, {withFileTypes: true}).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) {
    for (const name of readdirSync(join(semantic, tab)).filter(file => file.endsWith('.csv')).sort()) sources.push({file: tab + '/' + name, content: readFileSync(join(semantic, tab, name), 'utf8')})
  }
  return sources
}
/** The files that have a syntactic file, and those of rounds in progress beside this one. */
function takenFiles(sources, syntactic, roundsDir, except) {
  const taken = new Set(sources.filter(source => existsSync(join(syntactic, source.file))).map(source => source.file)), claimed = new Map()
  if (existsSync(roundsDir)) for (const folder of readdirSync(roundsDir).sort()) {
    const file = join(roundsDir, folder, 'files.json')
    if (join(roundsDir, folder) === except || !existsSync(file)) continue
    for (const {file: name} of readJson(file).files ?? []) if (!taken.has(name)) { taken.add(name); claimed.set(name, folder) }
  }
  return {taken, claimed}
}
const roundFiles = roundDir => existsSync(join(roundDir, 'files.json')) ? readJson(join(roundDir, 'files.json')) : (console.error(`${roundDir} is no round: call "round.mjs start" first.`), process.exit(1))
const rewritingDir = roundDir => join(roundDir, 'rewriting')
const rewriteItemsFile = roundDir => join(roundDir, 'key', 'rewrite-items.jsonl')
const share = (count, total) => total ? (100 * count / total).toFixed(1) + '%' : '—'

/** Everything the later steps need: the messages, the circuits and what is decided of them. */
function readRound(roundDir, named) {
  const files = roundFiles(roundDir), where = places(named, files)
  const sample = readSample(join(roundDir, 'sample.json')), texts = [...new Set(sample.map(row => row.text))]
  const outputs = readOutputs(roundDir), registry = readRegistry(where.registryDir)
  const run = readRunVerdicts(roundDir), written = readWritten(rewritingDir(roundDir))
  return {files, where, sample, texts, outputs, registry, run, written, state: () => roundState({texts, outputs, registry, verdicts: run.verdicts, written: written.circuits})}
}

// ---- the commands
function plan(named) {
  const where = places(named), roundsDir = resolve(typeof named['rounds-dir'] === 'string' ? named['rounds-dir'] : join(packageRoot, 'eval-results'))
  const sources = readSources(where.semantic).map(({file, content}) => ({file, messages: messagesOfFile(content).length}))
  const {taken, claimed} = takenFiles(sources, where.syntactic, roundsDir, null)
  const rounds = planRounds(sources, Number(named.rounds ?? 3), {taken, minMessages: Number(named['min-messages'] ?? 500), order: named.order ?? 'size'})
  console.log(`${sources.length} source files in ${where.semantic}: ${sources.filter(source => existsSync(join(where.syntactic, source.file))).length} have a syntactic file, ${claimed.size} belong to a round in progress.`)
  console.log('| Round | File | Messages | Messages of the round |\n| ---: | --- | ---: | ---: |')
  rounds.forEach((picked, index) => picked.forEach((source, at) => console.log(`| ${index + 1} | ${source.file} | ${source.messages} | ${at === picked.length - 1 ? picked.reduce((sum, one) => sum + one.messages, 0) : ''} |`)))
  if (!rounds.length) console.log('No source file is left for a round.')
}

function start(roundDir, named) {
  if (existsSync(join(roundDir, 'files.json'))) { console.error(`${roundDir} is a round already: its files are in files.json.`); process.exit(1) }
  const where = places(named), minMessages = Number(named['min-messages'] ?? 500), order = typeof named.order === 'string' ? named.order : 'size'
  const sources = readSources(where.semantic).map(({file, content}) => ({file, content, list: messagesOfFile(content), records: messagesOfCsv(content).length}))
  const {taken, claimed} = takenFiles(sources, where.syntactic, dirname(roundDir), roundDir)
  let picked
  try {
    picked = pickFiles(sources.map(({file, list}) => ({file, messages: list.length})), {taken, minMessages, order, files: typeof named.files === 'string' ? named.files.split(',').map(name => name.trim()).filter(Boolean) : null})
  } catch (error) { console.error(error.message + (claimed.size ? ` Rounds in progress hold: ${[...claimed].map(([file, folder]) => `${file} (${folder})`).join(', ')}.` : '')); process.exit(1) }
  if (!picked.length) { console.log('Every source file has a syntactic file or belongs to a round in progress: nothing to start.'); return }
  const chosen = picked.map(({file}) => sources.find(source => source.file === file))
  const sample = chosen.flatMap(source => source.list.map(({record, text}) => ({id: source.file + '#' + record, text})))
  mkdirSync(roundDir, {recursive: true})
  writeJson(join(roundDir, 'files.json'), {round: basename(roundDir), dataset: where.dataset, order: named.files ? 'chosen' : order, minMessages, messages: sample.length,
    files: chosen.map(source => ({file: source.file, records: source.records, messages: source.list.length, sha256: digest(source.content)}))})
  writeFileSync(join(roundDir, 'sample.json'), JSON.stringify(sample) + '\n')
  console.log('| File | Records | Messages |\n| --- | ---: | ---: |')
  for (const source of chosen) console.log(`| ${source.file} | ${source.records} | ${source.list.length} |`)
  console.log(`The round has ${sample.length} messages` + (sample.length < minMessages ? `, fewer than the ${minMessages} asked for` : '') + `. Written: ${relative(process.cwd(), join(roundDir, 'files.json'))} and sample.json`)
  console.log(`Next: node tests/benchmark/syntax/run.mjs ${relative(process.cwd(), roundDir)} --sample ${relative(process.cwd(), join(roundDir, 'sample.json'))}`)
}

async function settle(roundDir, named) {
  const files = roundFiles(roundDir), where = places(named, files)
  const outputs = readOutputs(roundDir)
  if (!outputs.length) { console.error(`No strategy file in ${roundDir}: run run.mjs first.`); process.exit(1) }
  // the families: those of strategies.mjs, or those of the strategies file the round was run with
  const declared = await import(pathToFileURL(join(here, 'strategies.mjs')).href)
  const given = typeof named.strategies === 'string' ? await import(pathToFileURL(resolve(named.strategies)).href) : {}
  const familyOf = declared.familyFinder(given.families ?? declared.families)
  const registry = readRegistry(where.registryDir)
  keepLabelsBefore(roundDir, where.labelsFile)
  const audit = Number(named.audit ?? 0.05), seed = typeof named.seed === 'string' ? named.seed : files.round
  const key = circuit => circuit.text + '\0' + circuit.core
  const earlier = readItems(roundDir)
  // what an earlier call settled by agreement stays settled, also when the registry has taken it up since
  // three families by default: on the first judged sample, circuits that only two families wrote alike were
  // rejected by the judge far more often than those of three
  const minFamilies = Number(named.families ?? 3)
  const found = agreedCircuits(outputs, registry, familyOf, minFamilies), foundKeys = new Set(found.map(key))
  const agreed = [...readAgreement(roundDir).filter(circuit => !foundKeys.has(key(circuit))).map(({audit: _, ...circuit}) => circuit), ...found]
  const audited = chooseAudit(agreed, audit, seed), agreedKeys = new Set(agreed.map(key))
  const {items, added} = collectItems(outputs, registry, {earlier, skip: (text, core) => agreedKeys.has(text + '\0' + core) && !audited.has(text + '\0' + core)})
  // an agreed circuit that a judge reads, whatever sent it there, is part of the audit
  const read = new Set(items.map(key))
  for (const item of items) if (agreedKeys.has(key(item))) item.audit = true
  const packets = writeJudging(roundDir, items, added, Number(named.size ?? 200))
  writeJsonl(agreementFile(roundDir), agreed.map(circuit => ({...circuit, audit: read.has(key(circuit))})))

  const texts = [...new Set(outputs.flatMap(output => output.rows.map(row => row.text)))]
  const judgedBefore = text => [...registry.byText.get(text)?.values() ?? []]
  const agreedTexts = new Set(agreed.map(circuit => circuit.text))
  const acceptedBefore = text => judgedBefore(text).some(row => row.verdict === 'accepted')
  const valid = new Set(outputs.flatMap(output => output.rows.filter(row => row.core).map(row => row.text)))
  const settled = {round: files.round, audit, seed, strategies: outputs.map(output => ({strategy: output.strategy, family: familyOf(output.strategy)})),
    messages: texts.length,
    circuits: {
      distinct: new Set(outputs.flatMap(output => output.rows.filter(row => row.core).map(key))).size,
      alreadyAcceptedInTheRegistry: texts.reduce((sum, text) => sum + judgedBefore(text).filter(row => row.verdict === 'accepted').length, 0),
      alreadyRejectedInTheRegistry: texts.reduce((sum, text) => sum + judgedBefore(text).filter(row => row.verdict === 'rejected').length, 0),
      settledByAgreement: agreed.length, agreedAndSentToAJudge: agreed.filter(circuit => read.has(key(circuit))).length,
      sentToAJudge: items.length, newPackets: packets.length},
    messagesWith: {
      aCircuitSettledByAgreement: agreedTexts.size,
      anAcceptedCircuitInTheRegistry: texts.filter(acceptedBefore).length,
      noSettledCircuitYet: texts.filter(text => !agreedTexts.has(text) && !acceptedBefore(text)).length,
      noValidCircuitFromAnyStrategy: texts.filter(text => !valid.has(text)).length}}
  writeJson(join(roundDir, 'settle.json'), settled)

  console.log(`${texts.length} messages, ${outputs.length} strategies of ${new Set(settled.strategies.map(one => one.family)).size} families: ${settled.strategies.map(one => `${one.strategy} (${one.family})`).join(', ')}.`)
  console.log(`Settled by agreement of at least ${minFamilies} families: ${agreed.length} circuits, for ${agreedTexts.size} messages (${share(agreedTexts.size, texts.length)}). ${settled.circuits.agreedAndSentToAJudge} of them go to a judge all the same, to measure how often agreement is right.`)
  console.log(`Already in the registry: ${settled.circuits.alreadyAcceptedInTheRegistry} accepted and ${settled.circuits.alreadyRejectedInTheRegistry} rejected circuits of these messages; ${settled.messagesWith.anAcceptedCircuitInTheRegistry} messages have an accepted circuit there.`)
  console.log(`For a judge: ${items.length} circuits (${earlier.length} prepared before, ${added.length} new). ${settled.messagesWith.noSettledCircuitYet} messages have no settled circuit yet; for ${settled.messagesWith.noValidCircuitFromAnyStrategy} messages no strategy wrote a valid circuit.`)
  console.log(packets.length ? `New packets: ${packets.map(([name, lines]) => `${name} (${lines})`).join(', ')} in ${relative(process.cwd(), judgingDir(roundDir))}` : 'No new packet.')
  if (items.length) console.log(`A judge reads RULES.md and one packet, writes verdicts-<k>.jsonl beside it, and checks it with: node ${relative(process.cwd(), join(judgingDir(roundDir), 'check.mjs'))} <k>`)
}

function rewritePrepare(roundDir, named) {
  const round = readRound(roundDir, named), state = round.state(), folder = rewritingDir(roundDir)
  const earlier = existsSync(rewriteItemsFile(roundDir)) ? readJsonl(rewriteItemsFile(roundDir)) : []
  const known = new Set(earlier.map(item => item.text)), added = []
  let waiting = 0
  for (const text of round.texts) {
    const circuits = state.get(text)
    if (circuits.some(circuit => circuit.status === 'accepted') || known.has(text)) continue
    // a circuit no judge has read yet may still be accepted: the message is not for rewriting now
    if (circuits.some(circuit => circuit.status === 'waiting')) { waiting++; continue }
    added.push({n: earlier.length + added.length + 1, text, rejected: circuits.filter(circuit => circuit.status === 'rejected').map(circuit => ({sop: circuit.sop, note: circuit.note}))})
  }
  mkdirSync(folder, {recursive: true})
  writeJsonl(rewriteItemsFile(roundDir), [...earlier, ...added.map(({n, text}) => ({n, text}))])
  const size = Number(named.size ?? 100), first = Math.max(0, ...rewritingPackets(folder)) + 1, packets = []
  for (let at = 0; at < added.length; at += size) { packets.push(`packet-${first + packets.length}.jsonl (${added.slice(at, at + size).length})`); writeJsonl(join(folder, `packet-${first + packets.length - 1}.jsonl`), added.slice(at, at + size)) }
  copyFileSync(join(here, 'rules.md'), join(folder, 'RULES.md'))
  writeFileSync(join(folder, 'REWRITE.md'), readFileSync(join(here, 'rewrite.md'), 'utf8')
    .replace('{{SCHEMA}}', join(packageRoot, 'schemas/syntax/schema.sop')).replace('{{SPECIFICATION}}', join(packageRoot, 'docs/syntax-schema.md')))
  writeFileSync(join(folder, 'check.mjs'), `// Checks written-<k>.jsonl against packet-<k>.jsonl:  node check.mjs <k>\n// Every circuit is checked against the syntax schema and against its message.\nimport {main} from ${JSON.stringify(pathToFileURL(join(here, 'rewrite-check.mjs')).href)}\nimport {fileURLToPath} from 'node:url'\nmain(fileURLToPath(new URL('.', import.meta.url)), process.argv.slice(2))\n`)
  console.log(`${round.texts.length} messages: ${earlier.length + added.length} have no accepted circuit and are for a judge to write (${earlier.length} prepared before, ${added.length} new).`)
  if (waiting) console.log(`${waiting} more messages have no accepted circuit yet, and a circuit that still waits for a judge: they are left out until it is judged. Call this again then.`)
  console.log(packets.length ? `New packets: ${packets.join(', ')} in ${relative(process.cwd(), folder)}` : 'No new packet.')
  if (earlier.length + added.length) console.log(`A judge reads REWRITE.md and one packet, writes written-<k>.jsonl beside it, and checks it with: node ${relative(process.cwd(), join(folder, 'check.mjs'))} <k>`)
}

function write(roundDir, named) {
  if (typeof named.tag !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(named.tag)) { console.error('Usage: node tests/benchmark/syntax/round.mjs write <round> --tag <name> [--judge <model>] [--allow-open]\nA tag is made of letters, digits, ".", "_" and "-".'); process.exit(2) }
  const round = readRound(roundDir, named), {where, registry} = round
  const registryFile = join(where.registryDir, named.tag + '.jsonl')
  if (existsSync(registryFile)) { console.error(`The registry already holds ${registryFile}: choose another --tag.`); process.exit(1) }
  const problems = [...round.run.problems, ...round.written.problems]
  for (const problem of problems) console.error(problem)
  if (problems.length) { console.error(`${problems.length} format problems in the files the judges wrote: nothing written. Correct the lines and call again.`); process.exit(1) }

  // what this round adds to the registry: the judge's verdicts, the circuits settled by agreement, the written circuits
  const judge = typeof named.judge === 'string' ? named.judge : 'unknown', rows = [], accepted = []
  const add = (item, {verdict, grade, note, judge: by, source}) => {
    rows.push({text: item.text, sop: item.sop, core: coreOf(item.text, item.sop), verdict, grade, note, judge: by, run: named.tag, source})
    if (verdict === 'accepted') accepted.push(item)
  }
  const fresh = item => !lookup(registry, item.text, item.core)
  const judged = new Set()
  for (const item of round.run.items) {
    const verdict = round.run.verdicts.get(item.text)?.get(item.core)
    if (verdict?.by !== 'judge') continue
    judged.add(item.text + '\0' + item.core)
    if (fresh(item)) add(item, {verdict: verdict.grade === 'L8' ? 'accepted' : 'rejected', grade: verdict.grade, note: verdict.note, judge, source: item.sources.join('+')})
  }
  const agreed = readAgreement(roundDir).filter(circuit => !judged.has(circuit.text + '\0' + circuit.core) && fresh(circuit))
  agreed.forEach((circuit, index) => add({...circuit, n: 1e9 + index}, {verdict: 'accepted', grade: 'L8', judge: 'agreement', source: circuit.sources.join('+'),
    note: `written alike by ${circuit.sources.length} formalizers of ${circuit.families.length} families (${circuit.families.join(', ')}); no judge has read it`}))
  const written = round.written.circuits.filter(circuit => !judged.has(circuit.text + '\0' + circuit.core) && fresh(circuit))
  written.forEach((circuit, index) => add({...circuit, n: 2e9 + index, sources: ['judge']}, {verdict: 'accepted', grade: 'L8', judge, source: 'judge',
    note: 'written by the judge: no circuit of a formalizer was accepted for this message'}))

  // the registry and the labels as they will be, and from them the circuit of every message
  for (const row of rows) addToRegistry(registry, row)
  const labels = readLabels(where.labelsFile)
  const change = updateLabels(labels, accepted, named.tag)
  const state = roundState({texts: round.texts, outputs: round.outputs, registry, verdicts: round.run.verdicts, written: round.written.circuits})
  const targets = round.files.files.map(({file, sha256}) => {
    const content = readFileSync(join(where.semantic, file), 'utf8'), messages = messagesOfFile(content)
    // a message added to the source file after the round started is known by what the registry holds of it
    const known = roundState({texts: messages.map(message => message.text).filter(text => !state.has(text)), outputs: [], registry})
    return {file, target: join(where.syntactic, file), exists: existsSync(join(where.syntactic, file)), changed: digest(content) !== sha256, newline: content.includes('\r\n') ? '\r\n' : '\n',
      ...syntacticRows(messages, new Map([...state, ...known]), labels)}
  })
  const open = targets.filter(target => !target.exists && target.open.length)
  if (open.length && !named['allow-open']) {
    for (const target of open) {
      console.error(`${target.file}: ${target.open.length} messages have no circuit${target.changed ? ' (the source file changed since the round started)' : ''}:`)
      for (const text of target.open.slice(0, 40)) console.error('  ' + JSON.stringify(text))
      if (target.open.length > 40) console.error(`  … and ${target.open.length - 40} more`)
    }
    console.error('Nothing was written. Have the open circuits judged (round.mjs settle) and the remaining messages written (round.mjs rewrite-prepare), or pass --allow-open to leave their cells empty.')
    process.exit(1)
  }

  const unread = round.run.items.filter(item => round.run.verdicts.get(item.text)?.get(item.core)?.by !== 'judge' && fresh(item)).length
  if (unread) console.log(`${unread} circuits of the round still wait for a judge and are not published.`)
  keepLabelsBefore(roundDir, where.labelsFile)
  if (rows.length) writeJsonl(registryFile, rows)
  if (change.set) writeLabels(where.labelsFile, labels)
  const kinds = {judgeAccepted: rows.filter(row => row.verdict === 'accepted' && row.judge !== 'agreement' && row.source !== 'judge').length, judgeRejected: rows.filter(row => row.verdict === 'rejected').length, agreement: agreed.length, written: written.length}
  console.log(rows.length ? `Registry: ${rows.length} circuits published to ${registryFile}: ${kinds.judgeAccepted} accepted and ${kinds.judgeRejected} rejected by the judge (${judge}), ${kinds.agreement} settled by agreement, ${kinds.written} written by the judge.` : 'Registry: nothing new to publish.')
  console.log(`Labels: ${change.set} messages got a label from this round (${change.first} had none, ${change.replaced} had another one). ${where.labelsFile} holds ${labels.size} labels.`)
  console.log('| Syntactic file | Messages | By agreement | By a judge | Written by a judge | Open | |\n| --- | ---: | ---: | ---: | ---: | ---: | --- |')
  const report = []
  for (const target of targets) {
    const status = target.exists ? 'exists already: not written' : 'written'
    if (!target.exists) { mkdirSync(dirname(target.target), {recursive: true}); writeFileSync(target.target, writeCsv(SYNTACTIC_HEADER, target.rows, target.newline), {flag: 'wx'}) }
    console.log(`| ${relative(where.dataset, target.target)} | ${target.rows.length} | ${target.counts.agreement} | ${target.counts.judge} | ${target.counts.written} | ${target.counts.open} | ${status}${target.changed ? '; the source file changed since the round started' : ''} |`)
    report.push({file: target.file, target: target.target, status, messages: target.rows.length, ...target.counts, sourceChangedSinceStart: target.changed})
  }
  writeJson(join(roundDir, 'written.json'), {round: round.files.round, tag: named.tag, judge, registryFile: rows.length ? registryFile : null, published: {circuits: rows.length, ...kinds}, labels: change, files: report})
}

function report(roundDir, named) {
  const round = readRound(roundDir, named), state = round.state()
  if (!round.outputs.length) { console.error(`No strategy file in ${roundDir}: run run.mjs first.`); process.exit(1) }
  const labelsBefore = readLabelsBefore(roundDir, round.where.labelsFile), labels = readLabels(round.where.labelsFile)
  const table = tableOf(round.outputs, round.registry, round.run.verdicts, labelsBefore)
  const summary = {messages: round.texts.length, agreement: 0, judge: 0, written: 0, open: 0, openWaitingForAJudge: 0, openToBeWritten: 0}
  for (const text of round.texts) {
    const circuits = state.get(text), chosen = chooseCircuit(circuits, labels.get(text))
    if (chosen) { summary[chosen.by]++; continue }
    summary.open++
    if (circuits.some(circuit => circuit.status === 'waiting')) summary.openWaitingForAJudge++; else summary.openToBeWritten++
  }
  const agreed = readAgreement(roundDir), audited = agreed.filter(circuit => circuit.audit)
  const verdictOf = circuit => { const verdict = round.run.verdicts.get(circuit.text)?.get(circuit.core); return verdict?.by === 'judge' ? verdict.grade : null }
  const audit = {agreedCircuits: agreed.length, sentToAJudge: audited.length, judged: audited.filter(verdictOf).length, accepted: audited.filter(circuit => verdictOf(circuit) === 'L8').length}
  const line = (name, count) => `| ${name} | ${count} | ${share(count, summary.messages)} |`
  const text = [`# The round ${round.files.round}`, '',
    `Files: ${round.files.files.map(file => `${file.file} (${file.messages})`).join(', ')}.`, '',
    '## How the messages are settled', '',
    'Each message is counted once, by the circuit that stands for it: its label, or else the accepted circuit most strategies wrote.', '',
    '| Messages | Count | Share |', '| --- | ---: | ---: |',
    line('All', summary.messages), line('Settled by agreement of several families', summary.agreement), line('Accepted by a judge', summary.judge),
    line('Written by a judge', summary.written), line('Still open', summary.open), '',
    summary.open ? `Of the open messages, ${summary.openWaitingForAJudge} have a circuit that waits for a judge and ${summary.openToBeWritten} need a judge to write the circuit.\n` : '',
    '## How often agreement is right', '',
    audit.sentToAJudge
      ? `${audit.agreedCircuits} circuits were written alike by strategies of several families and settled without a judge. ${audit.sentToAJudge} of them were sent to a judge, ${audit.judged} are judged, and the judge accepted ${audit.accepted}` + (audit.judged ? ` (${share(audit.accepted, audit.judged)}).` : '.')
      : `${audit.agreedCircuits} circuits were written alike by strategies of several families and settled without a judge. None was sent to a judge.`, '',
    '## Levels per strategy', '',
    'A circuit settled by agreement counts as accepted for the strategies that wrote it.', '',
    renderTable(table)].join('\n')
  writeFileSync(join(roundDir, 'report.md'), text)
  writeJson(join(roundDir, 'report.json'), {round: round.files.round, summary, audit, strategies: table})
  console.log(text)
  for (const problem of [...round.run.problems, ...round.written.problems]) console.log(problem)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const {words, named} = readArguments(process.argv.slice(2))
  const [command, folder] = words
  const commands = {start, settle, 'rewrite-prepare': rewritePrepare, write, report}
  if (command === 'plan') plan(named)
  else if (commands[command] && folder) await commands[command](resolve(folder), named)
  else { console.error('Usage: node tests/benchmark/syntax/round.mjs plan | start <round> | settle <round> | rewrite-prepare <round> | write <round> --tag <name> | report <round>'); process.exit(2) }
}
