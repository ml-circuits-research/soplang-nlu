// Measures one strategy's circuits against development targets (held-out messages with spaCy's circuit or a label),
// the same way for every run of rvss.
//
//   node strategies/rvss/eval/evaluate-dev.mjs <outputs.jsonl> <targets.jsonl.gz> [--split <name>] [--only-outputs]
//        [--name <name>] [--json <file>] [--quiet]
//
// <outputs.jsonl> (gzipped or not): one line per message {id?, text, sop, error?, placements?}.
// <targets.jsonl.gz> (gzipped or not): one line per message
//   {id?, text, sop (or target): the target circuit, origin: "spacy" or a label kind, accepted_by?, area? or file?,
//    split?, placements?, spacy?: spaCy's circuit, label?: the label}
//   origin: a value containing "spacy" makes the target spaCy's circuit; any other value (label, judge, agreement,
//   written, ...) makes it a label. Without origin, accepted_by present makes it a label, else it is "unknown".
//   The area is `area`, else the first folder of `file`, else the part of `id` before "/".
//   `spacy` and `label`, when a line carries them beside its target, are compared as well, on the lines that have them.
// Lines are matched by id, or by file and row (when both have them and the texts agree), else by text, else by the text
// compared without case and runs of spaces. Targets marked `judged` (the registry's decision on a spaCy target) or
// `spacySame` (a label equal to spaCy's circuit), as strategies/rvss/data/build-sets.mjs writes them, are also counted
// by those marks. A target with no output line counts as "no output" (wrong under every key).
// --split keeps the targets whose `split` is that value; --only-outputs keeps the targets that have an output line.
//
// Reported, overall and by origin, by origin and accepted_by, by split, by length bucket and by area:
//   exact: equal core (normalForm of tests/benchmark/syntax/lib.mjs);
//   relaxed: equal up to the start of every relation with a marker (relaxedCore);
//   variants: equal up to what the judges' rules let pass either way (relaxedCore or agreementKey: writtenAlike's key
//     `variants`);
//   valid: the output passes validateSyntax.
// Per-word placement accuracy: read from the two cores (the key that holds the word, the wire it stands in as coreOf
// names wires, whether its value starts there) and, more loosely, the key alone; over every word of the targets
// (a message with no valid output counts all its words wrong) and over the messages with a valid output. When both
// lines carry `placements` arrays (one entry per word), their element-wise equality is reported too ("carried").
// It also counts targets that are benchmark messages (case- and space-insensitive) or within one character edit of
// one: the benchmark must be held out, and such targets are named.
import {mkdirSync, writeFileSync} from 'node:fs'
import {basename, dirname, join, resolve} from 'node:path'
import {readSample} from '../../../tests/benchmark/syntax/lib.mjs'
import {readRows, datasetState, circuitOf, compare, squash, areaOf, lengthBucket, wordCount, LENGTH_BUCKETS, placementsOf, nearIndex, nearMatch,
  benchmarkDir, localData, percent, parseArguments} from './common.mjs'

export function originOf(target) {
  const raw = target.origin ?? target.target_origin ?? target.kind
  if (typeof raw === 'string' && /spacy/iu.test(raw)) return 'spacy'
  if (typeof raw === 'string' && raw) return 'label'
  return typeof target.accepted_by === 'string' && target.accepted_by ? 'label' : 'unknown'
}
const detailOf = target => {
  const origin = originOf(target)
  if (origin !== 'label') return origin
  const kind = target.accepted_by || (typeof target.origin === 'string' && !/^label$/iu.test(target.origin) ? target.origin : '')
  return kind ? `label (${kind})` : 'label'
}

export function evaluateDev(outputsFile, targetsFile, options = {}) {
  const dataset = datasetState()
  let targets = readRows(targetsFile)
  if (options.split) targets = targets.filter(target => target.split === options.split)
  const outputs = readRows(outputsFile)
  const byId = new Map(), byText = new Map(), bySquash = new Map(), byPlace = new Map()
  const placeOf = row => typeof row?.file === 'string' && row.row !== undefined ? row.file + '#' + row.row : null
  for (const row of outputs) {
    if (row?.id !== undefined) byId.set(String(row.id), row)
    if (placeOf(row)) byPlace.set(placeOf(row), row)
    if (typeof row?.text === 'string') { if (!byText.has(row.text)) byText.set(row.text, row); const s = squash(row.text); if (!bySquash.has(s)) bySquash.set(s, row) }
  }
  const outputOf = target => {
    const row = target.id !== undefined ? byId.get(String(target.id)) : placeOf(target) ? byPlace.get(placeOf(target)) : undefined
    if (row && row.text === target.text) return row
    return byText.get(target.text) ?? bySquash.get(squash(target.text)) ?? null
  }
  const benchmark = nearIndex(readSample(join(options.benchmark ?? benchmarkDir, 'sample.json.gz')).map(message => message.text))

  const tally = () => ({messages: 0, noOutput: 0, valid: 0, exact: 0, relaxed: 0, variants: 0, words: 0, place: 0, role: 0, validWords: 0, validPlace: 0, validRole: 0, carriedWords: 0, carried: 0})
  const groups = {all: tally()}, byOrigin = {}, byDetail = {}, bySplit = {}, byLength = {}, byArea = {}, byMark = {}
  const secondary = {spacy: {messages: 0, exact: 0, relaxed: 0, variants: 0}, label: {messages: 0, exact: 0, relaxed: 0, variants: 0}}
  let targetInvalid = 0, used = 0, unmatchedOutputs = 0
  const leaks = {exact: 0, 'one-edit': 0, examples: []}
  const matched = new Set()
  for (const target of targets) {
    const text = target.text
    if (typeof text !== 'string') continue
    const leak = nearMatch(benchmark, text)
    if (leak) { leaks[leak]++; if (leaks.examples.length < 10) leaks.examples.push({text, match: leak}) }
    const goal = circuitOf(text, target.sop ?? target.target)
    if (!goal.valid) { targetInvalid++; continue }
    const out = outputOf(target)
    if (!out && options.onlyOutputs) continue
    if (out) matched.add(out)
    used++
    const mine = circuitOf(text, out?.sop)
    const equal = compare(mine, goal)
    const words = wordCount(text)
    const a = placementsOf(mine.core, words), b = placementsOf(goal.core, words)
    let place = 0, role = 0
    for (let w = 0; w < words; w++) { if (a.place[w] !== null && a.place[w] === b.place[w]) place++; if (a.role[w] !== null && a.role[w] === b.role[w]) role++ }
    let carriedWords = 0, carried = 0
    if (Array.isArray(out?.placements) && Array.isArray(target.placements)) {
      carriedWords = target.placements.length
      for (let w = 0; w < carriedWords; w++) if (JSON.stringify(out.placements[w]) === JSON.stringify(target.placements[w])) carried++
    }
    const add = into => {
      into.messages++
      if (!out) into.noOutput++
      if (mine.valid) { into.valid++; into.validWords += words; into.validPlace += place; into.validRole += role }
      for (const key of ['exact', 'relaxed', 'variants']) if (equal[key]) into[key]++
      into.words += words; into.place += place; into.role += role
      into.carriedWords += carriedWords; into.carried += carried
    }
    add(groups.all)
    add(byOrigin[originOf(target)] ??= tally())
    add(byDetail[detailOf(target)] ??= tally())
    if (target.split !== undefined) add(bySplit[String(target.split)] ??= tally())
    add(byLength[lengthBucket(words)] ??= tally())
    add(byArea[areaOf(target)] ??= tally())
    // what the data marks on a target: the registry's decision on a spaCy target (judged), a label equal to spaCy's circuit (spacySame)
    if ('judged' in target) add(byMark[`${originOf(target)} target, judged ${target.judged ?? 'no decision'}`] ??= tally())
    if ('spacySame' in target) add(byMark[`${originOf(target)} target, ${target.spacySame ? 'equal to' : 'not equal to'} spaCy's circuit`] ??= tally())
    for (const [field, into] of [['spacy', secondary.spacy], ['label', secondary.label]]) {
      if (typeof target[field] !== 'string' || !target[field]) continue
      const other = circuitOf(text, target[field])
      if (!other.valid) continue
      into.messages++
      const same = compare(mine, other)
      for (const key of ['exact', 'relaxed', 'variants']) if (same[key]) into[key]++
    }
  }
  unmatchedOutputs = outputs.filter(row => !matched.has(row)).length
  return {
    name: options.name ?? basename(outputsFile).replace(/\.jsonl(\.gz)?$/u, ''), outputs: resolve(outputsFile), targets: resolve(targetsFile), split: options.split ?? null,
    onlyOutputs: Boolean(options.onlyOutputs), dataset, targetLines: targets.length, targetInvalid, evaluated: used, outputLines: outputs.length, outputsNotMatched: unmatchedOutputs,
    all: groups.all, byOrigin, byDetail, bySplit, byLength, byArea, byMark, againstFields: secondary, benchmarkNearCopies: leaks
  }
}

export function renderDev(result) {
  const head = '| | Messages | No output | Valid | Exact | Relaxed | Variants | Word placement | Word key | Word placement (valid outputs) | Carried placements |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
  const line = (label, t) => `| ${label} | ${t.messages} | ${t.noOutput} | ${t.valid} (${percent(t.valid, t.messages)}) | ${t.exact} (${percent(t.exact, t.messages)}) | ${t.relaxed} (${percent(t.relaxed, t.messages)}) | ${t.variants} (${percent(t.variants, t.messages)}) | ${percent(t.place, t.words)} | ${percent(t.role, t.words)} | ${percent(t.validPlace, t.validWords)} | ${t.carriedWords ? percent(t.carried, t.carriedWords) : '—'} |`
  const r = result, s = r.againstFields, leaks = r.benchmarkNearCopies
  const out = [`# Development set: ${r.name}`, '',
    `Outputs \`${r.outputs}\` (${r.outputLines} lines, ${r.outputsNotMatched} not matched to a target). Targets \`${r.targets}\`${r.split ? `, split ${r.split}` : ''}: ${r.targetLines} lines, ${r.targetInvalid} with no valid target circuit (left out), ${r.evaluated} evaluated${r.onlyOutputs ? ' (only targets with an output line)' : ''}. ${r.dataset.text}.`, '',
    head, line('all', r.all), '',
    'By origin of the target:', '', head, ...Object.entries(r.byOrigin).sort().map(([k, t]) => line(k, t)), ...Object.entries(r.byDetail).sort().filter(([k]) => !r.byOrigin[k]).map(([k, t]) => line(k, t)), '',
    ...(Object.keys(r.bySplit).length ? ['By split:', '', head, ...Object.entries(r.bySplit).sort().map(([k, t]) => line(k, t)), ''] : []),
    ...(Object.keys(r.byMark).length ? ['By what the targets mark (`judged`: the registry\'s decision on the target circuit; `spacySame`: the label equals spaCy\'s circuit):', '', head, ...Object.entries(r.byMark).sort().map(([k, t]) => line(k, t)), ''] : []),
    'By length (words):', '', head, ...LENGTH_BUCKETS.filter(k => r.byLength[k]).map(k => line(k, r.byLength[k])), '',
    'By area:', '', head, ...Object.entries(r.byArea).sort().map(([k, t]) => line(k, t)), '',
    ...['spacy', 'label'].filter(k => s[k].messages).map(k => `Against the \`${k}\` field (${s[k].messages} lines): exact ${s[k].exact} (${percent(s[k].exact, s[k].messages)}), relaxed ${s[k].relaxed} (${percent(s[k].relaxed, s[k].messages)}), variants ${s[k].variants} (${percent(s[k].variants, s[k].messages)}).`),
    `Target lines (all, also those left out) that are benchmark messages without case and spaces: ${leaks.exact}; within one character edit of one: ${leaks['one-edit']}${leaks.examples.length ? ' (e.g. ' + leaks.examples.slice(0, 3).map(e => JSON.stringify(e.text)).join(', ') + ')' : ''}.`]
  return out.join('\n') + '\n'
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const {words, named} = parseArguments(process.argv.slice(2))
  if (words.length < 2) { console.error('Usage: node strategies/rvss/eval/evaluate-dev.mjs <outputs.jsonl> <targets.jsonl.gz> [--split <name>] [--only-outputs] [--json <file>]'); process.exit(2) }
  const result = evaluateDev(resolve(words[0]), resolve(words[1]), {split: named.split, onlyOutputs: Boolean(named['only-outputs']), name: named.name})
  const jsonFile = resolve(named.json ?? join(localData, 'eval/dev', result.name + (result.split ? '-' + result.split : '') + '.json'))
  mkdirSync(dirname(jsonFile), {recursive: true})
  writeFileSync(jsonFile, JSON.stringify(result, null, 2) + '\n')
  if (!named.quiet) console.log(renderDev(result))
  console.error(`Written: ${jsonFile}`)
}
