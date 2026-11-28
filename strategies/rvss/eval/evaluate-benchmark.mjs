// Measures one strategy's circuits on the 1,831 messages of the 1% benchmark
// (eval-results/2026-11-27-syntax-benchmark-random), the same way for every run of rvss and for the baselines.
//
//   node strategies/rvss/eval/evaluate-benchmark.mjs <outputs.jsonl> [--name <name>] [--reference <file>]
//        [--out-dir <folder>] [--registry <folder>] [--syntactic <folder>] [--quiet]
//
// <outputs.jsonl>: one line per message {id?, text, sop, error?, ms?}, as tests/benchmark/syntax/run.mjs writes it
// (gzipped or not). Lines are matched to the sample by id when the id and the text agree, else by text. A message
// of the sample with no line, or with no valid circuit, counts as "no valid circuit".
//
// What it reports (every count names the dataset commit it was computed on):
//   1. validity: validateSyntax of lib/syntax.mjs, and the kinds of errors;
//   2. equality with spaCy's benchmark circuits (--reference, default the run's spacy.jsonl): exact core, equal up to
//      the start of every relation with a marker (relaxedCore), and equal up to what the judges' rules let pass
//      either way (key `variants`: relaxedCore or agreementKey); all from tests/benchmark/syntax/lib.mjs;
//   3. known accepted / known rejected / unjudged / no valid circuit, by the review procedure of
//      experiments/syntax-learned/review/: the verdict of the run's judge (judging/verdicts-*.jsonl, the newest verdict
//      counting, runVerdicts), else the registry's newest decision (readRegistry/lookup, `supersedes` honoured), else
//      the label the message had before the run (key/labels-before.jsonl), else unjudged. The share known accepted of
//      all 1,831 messages is the GOAL-like figure; lower bound = known accepted, upper bound = known accepted + unjudged.
//      Beside it: the same with the label of now as a fourth source, and the levels of table.mjs (levelOf) with GOAL;
//   4. the same counts for the messages that had a label before the run (593) and those without (1,238), by area and by
//      length; and against the reference strategy on the messages where both circuits have a verdict;
//   5. the unjudged circuits, each distinct (message, core) once, in normal form, as packet lines {n, text, sop}
//      for judges: <out-dir>/unjudged.jsonl.
// Writes <out-dir>/summary.json and <out-dir>/summary.md (default out-dir: .local-data/rvss/eval/benchmark/<name>/).
// Reads only; nothing in the benchmark folder or the dataset is written.
import {mkdirSync, writeFileSync} from 'node:fs'
import {basename, join, resolve} from 'node:path'
import {readSample, readRegistry, lookup, readRunVerdicts, readLabels, readLabelsBefore, levelOf, GOAL_LEVELS, defaultRegistryDir, syntacticDirOf, outputFile}
  from '../../../tests/benchmark/syntax/lib.mjs'
import {readRows, datasetState, circuitOf, compare, benchmarkDir, localData, areaOf, lengthBucket, wordCount, LENGTH_BUCKETS, percent, share, parseArguments}
  from './common.mjs'

// read once per process: the registry and the labels of now, by folder
const registries = new Map(), labelSets = new Map()
export function evaluateBenchmark(outputsFile, options = {}) {
  const runDir = resolve(options.benchmark ?? benchmarkDir)
  const name = options.name ?? basename(outputsFile).replace(/\.jsonl(\.gz)?$|\.json(\.gz)?$/u, '')
  const referenceFile = resolve(options.reference ?? outputFile(runDir, 'spacy'))
  const registryDir = resolve(options.registry ?? defaultRegistryDir)
  const dataset = datasetState()
  const sample = readSample(join(runDir, 'sample.json.gz'))
  const registry = registries.get(registryDir) ?? registries.set(registryDir, readRegistry(registryDir)).get(registryDir)
  const {verdicts: runVerdicts, problems} = readRunVerdicts(runDir)
  const syntacticDir = syntacticDirOf(registryDir, options.syntactic)
  const labelsNow = () => labelSets.get(syntacticDir) ?? labelSets.set(syntacticDir, readLabels(syntacticDir)).get(syntacticDir)
  const labelsBefore = readLabelsBefore(runDir, labelsNow)

  const align = rows => {
    const byId = new Map(), byText = new Map()
    for (const row of rows) { if (row?.id !== undefined) byId.set(row.id, row); if (typeof row?.text === 'string' && !byText.has(row.text)) byText.set(row.text, row) }
    const sampleTexts = new Set(sample.map(message => message.text))
    const extra = rows.filter(row => !sampleTexts.has(row?.text)).length
    return {rows: sample.map(({id, text}) => { const row = byId.get(id); return row && row.text === text ? row : byText.get(text) ?? null }), extra}
  }
  const outputs = align(readRows(outputsFile)), reference = align(readRows(referenceFile))

  // the review procedure's verdict of one circuit
  const verdictOf = (text, circuit) => {
    if (!circuit.core) return {verdict: 'invalid', by: null}
    const run = runVerdicts.get(text)?.get(circuit.core)
    const registered = lookup(registry, text, circuit.core)
    const conflict = Boolean(run && registered && (run.grade === 'L8') !== (registered.verdict === 'accepted'))
    if (run) return {verdict: run.grade === 'L8' ? 'accepted' : 'rejected', grade: run.grade, by: 'run judge', conflict}
    if (registered) return {verdict: registered.verdict, grade: registered.verdict === 'accepted' ? 'L8' : registered.grade, by: 'registry'}
    if (labelsBefore.get(text)?.core === circuit.core) return {verdict: 'accepted', grade: 'L8', by: 'label before'}
    return {verdict: 'unjudged', by: null, labelNow: labelsNow().get(text)?.core === circuit.core}
  }

  const tally = () => ({messages: 0, valid: 0, accepted: 0, rejected: 0, unjudged: 0, invalid: 0, acceptedWithLabelNow: 0, exact: 0, relaxed: 0, variants: 0})
  const add = (into, row) => {
    into.messages++
    if (row.valid) into.valid++
    into[row.verdict]++
    if (row.verdict === 'accepted' || row.labelNow) into.acceptedWithLabelNow++
    for (const key of ['exact', 'relaxed', 'variants']) if (row.equal[key]) into[key]++
  }
  const all = tally(), bySplit = {}, byArea = {}, byLength = {}, byAcceptedSource = {}, grades = {}, errors = {}
  const levels = {}, perMessage = []
  let conflicts = 0, referenceValid = 0
  const ms = []
  for (let index = 0; index < sample.length; index++) {
    const {id, text} = sample[index]
    const out = outputs.rows[index], ref = reference.rows[index]
    const mine = circuitOf(text, out?.sop), theirs = circuitOf(text, ref?.sop)
    if (theirs.valid) referenceValid++
    if (Number.isFinite(out?.ms)) ms.push(out.ms)
    if (!mine.valid) { const kind = !out ? 'no line in the outputs' : typeof out.sop !== 'string' ? (String(out.error ?? 'no circuit').split(':')[0] || 'no circuit') : 'invalid circuit: ' + mine.findings.join(', '); errors[kind] = (errors[kind] ?? 0) + 1 }
    const decision = verdictOf(text, mine)
    if (decision.conflict) conflicts++
    const equal = compare(mine, theirs)
    const level = levelOf({text, core: mine.core}, registry, runVerdicts, labelsBefore, labelsNow)
    levels[level] = (levels[level] ?? 0) + 1
    const row = {id, text, valid: mine.valid, core: mine.core, normal: mine.normal, verdict: decision.verdict, by: decision.by, grade: decision.grade, labelNow: Boolean(decision.labelNow), equal,
      referenceVerdict: verdictOf(text, theirs).verdict}
    perMessage.push(row)
    add(all, row)
    const split = labelsBefore.has(text) ? 'had a label before the run' : 'had no label before the run'
    add(bySplit[split] ??= tally(), row)
    add(byArea[areaOf({id})] ??= tally(), row)
    add(byLength[lengthBucket(wordCount(text))] ??= tally(), row)
    if (row.verdict === 'accepted') byAcceptedSource[row.by] = (byAcceptedSource[row.by] ?? 0) + 1
    if (row.verdict === 'rejected') grades[row.grade] = (grades[row.grade] ?? 0) + 1
  }
  // against the reference on the messages where both circuits have a verdict
  const versus = {messages: 0, accepted: 0, referenceAccepted: 0, both: 0, onlyThis: 0, onlyReference: 0, neither: 0}
  const cross = {}
  for (const row of perMessage) {
    const key = row.verdict + ' / ' + row.referenceVerdict
    cross[key] = (cross[key] ?? 0) + 1
    if (!['accepted', 'rejected'].includes(row.verdict) || !['accepted', 'rejected'].includes(row.referenceVerdict)) continue
    versus.messages++
    const a = row.verdict === 'accepted', b = row.referenceVerdict === 'accepted'
    versus.accepted += a; versus.referenceAccepted += b
    versus[a && b ? 'both' : a ? 'onlyThis' : b ? 'onlyReference' : 'neither']++
  }
  // the unjudged circuits for judges, each distinct (message, core) once
  const seen = new Set(), unjudged = []
  for (const row of perMessage) {
    if (row.verdict !== 'unjudged' || seen.has(row.text + '\0' + row.core)) continue
    seen.add(row.text + '\0' + row.core)
    unjudged.push({n: unjudged.length + 1, text: row.text, sop: row.normal})
  }
  const sorted = [...ms].sort((a, b) => a - b), at = p => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] : null
  const goal = GOAL_LEVELS.reduce((sum, level) => sum + (levels[level] ?? 0), 0)
  return {
    name, outputs: resolve(outputsFile), reference: referenceFile, benchmark: runDir, dataset, registry: {dir: registryDir, files: registry.files.length, lines: registry.rows},
    runVerdictProblems: problems.length, messages: sample.length, linesNotInSample: outputs.extra, referenceValid,
    all, lowerBound: share(all.accepted, all.messages), upperBound: share(all.accepted + all.unjudged, all.messages),
    knownAcceptedShare: share(all.accepted, all.messages), byAcceptedSource, rejectedGrades: grades, errors,
    tableLevels: levels, tableGoal: share(goal, sample.length), tableGoalCount: goal,
    conflictsRunVsRegistry: conflicts, bySplit, byArea, byLength, versusReference: versus, verdictCross: cross,
    msInFile: ms.length ? {messages: ms.length, median: at(0.5), p90: at(0.9)} : null,
    unjudged
  }
}

export function renderBenchmark(result) {
  const r = result, a = r.all
  const head = '| | Messages | Valid | Known accepted | Known rejected | Unjudged | No valid circuit | Accepted with the label of now | = spaCy exact | = spaCy relaxed | = spaCy variants |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'
  const line = (label, t) => `| ${label} | ${t.messages} | ${t.valid} | ${t.accepted} (${percent(t.accepted, t.messages)}) | ${t.rejected} | ${t.unjudged} | ${t.invalid} | ${t.acceptedWithLabelNow} | ${t.exact} (${percent(t.exact, t.messages)}) | ${t.relaxed} (${percent(t.relaxed, t.messages)}) | ${t.variants} (${percent(t.variants, t.messages)}) |`
  const v = r.versusReference
  const out = [
    `# Benchmark: ${r.name}`, '',
    `Outputs: \`${r.outputs}\`. Reference: \`${r.reference}\` (${r.referenceValid} valid circuits). ${r.dataset.text}; registry ${r.registry.lines} lines in ${r.registry.files} files.` +
      (r.linesNotInSample ? ` ${r.linesNotInSample} lines of the outputs are not benchmark messages and are ignored.` : '') +
      (r.runVerdictProblems ? ` ${r.runVerdictProblems} verdict lines of the run have a format problem and are not counted.` : ''), '',
    `Known accepted ${a.accepted} of ${a.messages} = **${percent(a.accepted, a.messages)}** (lower bound); with every unjudged circuit accepted ${a.accepted + a.unjudged} = ${percent(a.accepted + a.unjudged, a.messages)} (upper bound). ` +
      `Levels of table.mjs (registry as it is now): GOAL ${r.tableGoalCount} = ${percent(r.tableGoalCount, r.messages)}.`, '',
    head, line('all', a),
    ...Object.entries(r.bySplit).sort().map(([k, t]) => line(k, t)), '',
    'By area:', '', head, ...Object.entries(r.byArea).sort().map(([k, t]) => line(k, t)), '',
    'By length (words):', '', head, ...LENGTH_BUCKETS.filter(k => r.byLength[k]).map(k => line(k, r.byLength[k])), '',
    `Accepted by: ${Object.entries(r.byAcceptedSource).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}. Rejected grades: ${Object.entries(r.rejectedGrades).sort().map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}.`,
    `No valid circuit: ${Object.entries(r.errors).map(([k, n]) => `${k} ${n}`).join('; ') || 'none'}.`,
    `Levels (table.mjs): ${Object.entries(r.tableLevels).sort((x, y) => x[0].localeCompare(y[0], 'en', {numeric: true})).map(([k, n]) => `${k} ${n}`).join(', ')}.`,
    `Circuits where the run's judge and the registry's newest decision disagree (the run's judge counts): ${r.conflictsRunVsRegistry}.`, '',
    `Against the reference on the ${v.messages} messages where both circuits have a verdict: this ${v.accepted} accepted, reference ${v.referenceAccepted}; both ${v.both}, only this ${v.onlyThis}, only the reference ${v.onlyReference}, neither ${v.neither}.`,
    `Verdict of this / of the reference: ${Object.entries(r.verdictCross).sort().map(([k, n]) => `${k} ${n}`).join('; ')}.`,
    r.msInFile ? `Milliseconds recorded in the outputs file: median ${r.msInFile.median}, p90 ${r.msInFile.p90} (${r.msInFile.messages} lines; measured by whoever wrote the file, not by speed.mjs).` : 'The outputs file records no milliseconds.',
    `Unjudged circuits for judges: ${r.unjudged.length}${r.unjudgedFile ? ` in \`${r.unjudgedFile}\`` : ''}.`
  ]
  return out.join('\n') + '\n'
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const {words, named} = parseArguments(process.argv.slice(2))
  if (!words[0]) { console.error('Usage: node strategies/rvss/eval/evaluate-benchmark.mjs <outputs.jsonl> [--name <name>] [--reference <file>] [--out-dir <folder>]'); process.exit(2) }
  const result = evaluateBenchmark(resolve(words[0]), {name: named.name, reference: named.reference, registry: named.registry, syntactic: named.syntactic, benchmark: named.benchmark})
  const outDir = resolve(named['out-dir'] ?? join(localData, 'eval/benchmark', result.name))
  mkdirSync(outDir, {recursive: true})
  result.unjudgedFile = join(outDir, 'unjudged.jsonl')
  writeFileSync(result.unjudgedFile, result.unjudged.map(row => JSON.stringify(row)).join('\n') + (result.unjudged.length ? '\n' : ''))
  const {unjudged, ...summary} = result
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({...summary, unjudgedCount: unjudged.length}, null, 2) + '\n')
  const text = renderBenchmark(result)
  writeFileSync(join(outDir, 'summary.md'), text)
  if (!named.quiet) console.log(text)
  console.error(`Written: ${join(outDir, 'summary.json')}, ${join(outDir, 'summary.md')}, ${result.unjudgedFile}`)
}
