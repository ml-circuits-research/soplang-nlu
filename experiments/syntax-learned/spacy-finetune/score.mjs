// Write the spacy strategy's circuits from parses made by parse.py (greedy + beam, worker format), and score them.
//   node score.mjs dev <parses.jsonl> <labels.jsonl> [--out file]     share equal to the label (core, and core without attachment marks)
//   node score.mjs bench <parses.jsonl> [--out file] [--base file]     known accepted / rejected / unjudged, compared with spacy.jsonl
//   node score.mjs run <strategy-output.jsonl> [--out file]           the same for circuits the strategy itself wrote (run-strategy.mjs)
import {readFileSync, writeFileSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {beamCircuit} = await import(root + 'strategies/spacy-beam/index.mjs')
const {normalForm} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {relaxedCore} = await import('./convert.mjs')
const lines = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const [mode, parsesFile, labelsFile] = process.argv.slice(2)
const arg = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null
// the core with `attachment=ambiguous` set aside: the judge lets a relation start at the clause with or without it
export const loose = core => core?.split('\n').filter(line => !/ attachment ambiguous$/u.test(line)).join('\n') ?? null
const write = row => {
  if (mode === 'run') return row.sop ?? null
  try { return beamCircuit(row.text, row.tokens, row.alternatives ?? []).sop } catch (error) { return null }
}
const parses = lines(parsesFile)
const out = []
if (mode === 'dev') {
  const labels = new Map(lines(labelsFile).map(row => [row.text, row]))
  let same = 0, sameLoose = 0, invalid = 0, sameRelaxed = 0
  for (const row of parses) {
    const sop = write(row)
    const core = sop ? normalForm(row.text, sop)?.core : null
    const label = labels.get(row.text)
    const gold = normalForm(row.text, label.sop).core
    if (!core) invalid++
    const equal = core === gold, equalLoose = loose(core) === loose(gold)
    const equalRelaxed = Boolean(sop) && relaxedCore(row.text, sop) === relaxedCore(row.text, label.sop)
    same += equal; sameLoose += equalLoose; sameRelaxed += equalRelaxed
    out.push({text: row.text, sop, gold: label.sop, equal, equalLoose, equalRelaxed})
  }
  const n = parses.length
  console.log(JSON.stringify({messages: n, equalToLabel: same, share: +(100 * same / n).toFixed(1), equalWithoutAttachmentMark: sameLoose, shareLoose: +(100 * sameLoose / n).toFixed(1), equalRelaxed: sameRelaxed, shareRelaxed: +(100 * sameRelaxed / n).toFixed(1), invalid}))
} else {
  const {openVerdicts, benchmarkRows} = await import('./verdicts.mjs')
  const {verdictOf, relaxedVerdictOf} = openVerdicts()
  const unjudgedLike = {'like-accepted': 0, 'like-rejected': 0, unlike: 0}
  const base = new Map((arg('--base') ? lines(arg('--base')) : benchmarkRows()).map(row => [row.text, row]))
  const count = {accepted: 0, rejected: 0, unjudged: 0, invalid: 0}, baseCount = {accepted: 0, rejected: 0, unjudged: 0, invalid: 0}
  const moves = {}
  let same = 0
  for (const row of parses) {
    const sop = write(row)
    const core = sop ? normalForm(row.text, sop)?.core : null
    const old = base.get(row.text)
    const oldCore = old?.sop ? normalForm(row.text, old.sop)?.core : null
    const now = verdictOf(row.text, core), was = verdictOf(row.text, oldCore)
    count[now.verdict]++; baseCount[was.verdict]++
    const like = now.verdict === 'unjudged' ? relaxedVerdictOf(row.text, sop, relaxedCore) : null
    if (like) unjudgedLike[like]++
    const kind = core === oldCore ? 'same' : was.verdict + '->' + now.verdict
    moves[kind] = (moves[kind] ?? 0) + 1
    same += core === oldCore
    out.push({id: old?.id, text: row.text, sop, verdict: now.verdict, by: now.by ?? null, grade: now.grade ?? null, note: now.note ?? null, like, baseVerdict: was.verdict, baseSop: old?.sop ?? null, same: core === oldCore})
  }
  const n = parses.length, pct = value => +(100 * value / n).toFixed(1)
  console.log(JSON.stringify({messages: n, now: count, nowShare: {accepted: pct(count.accepted), rejected: pct(count.rejected), unjudged: pct(count.unjudged)},
    base: baseCount, baseShare: {accepted: pct(baseCount.accepted), rejected: pct(baseCount.rejected)}, sameCircuitAsBase: same, moves, unjudgedLike}))
}
if (arg('--out')) writeFileSync(arg('--out'), out.map(row => JSON.stringify(row)).join('\n') + '\n')
