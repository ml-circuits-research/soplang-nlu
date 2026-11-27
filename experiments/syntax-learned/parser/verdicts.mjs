// What is known of a circuit of a benchmark message, by its core (the logic of vss-registry.mjs):
// accepted if it matches a circuit the run's judge graded L8, a registry line accepted, or the label
// the message had before the run; rejected if it matches a judged non-L8 circuit or a registry line
// rejected; otherwise unjudged. `labelNow` says whether it equals the label the message has now
// (set after the run, by a judge or by agreement), reported apart.
import {readFileSync, readdirSync, existsSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {normalForm, readRegistry, lookup, readLabels, readLabelsBefore, relaxedCore} = await import(root + 'tests/benchmark/syntax/lib.mjs')
export const runDir = root + 'eval-results/2026-11-27-syntax-benchmark-random/'
const lines = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))

export function openVerdicts() {
  const registry = readRegistry()
  const before = readLabelsBefore(runDir, new Map())
  const now = readLabels()
  const judged = new Map()
  const dir = runDir + 'judging/'
  if (existsSync(dir)) for (const name of readdirSync(dir).filter(name => /^verdicts-\d+\.jsonl$/u.test(name))) {
    const packet = new Map(lines(dir + name.replace('verdicts', 'packet')).map(row => [row.n, row]))
    for (const verdict of lines(dir + name)) {
      const row = packet.get(verdict.n)
      if (!row) continue
      if (!judged.has(row.text)) judged.set(row.text, new Map())
      judged.get(row.text).set(normalForm(row.text, row.sop)?.core, verdict)
    }
  }
  const verdictOf = (text, core) => {
    if (!core) return {verdict: 'invalid'}
    const here = judged.get(text)?.get(core)
    if (here) return {verdict: here.grade === 'L8' ? 'accepted' : 'rejected', by: 'judge', grade: here.grade, note: here.note}
    const known = lookup(registry, text, core)
    if (known) return {verdict: known.verdict, by: 'registry', grade: known.grade, note: known.note}
    if (before.get(text)?.core === core) return {verdict: 'accepted', by: 'label-before'}
    // up to the start of marked relations (relaxedCore): the judging rules let the start be the clause or a nominal of it
    const loose = relaxedCore(core)
    const seen = [...(judged.get(text) ?? new Map())].map(([c, v]) => [c, v.grade === 'L8' ? 'accepted' : 'rejected'])
      .concat([...(registry.byText.get(text) ?? new Map())].map(([c, v]) => [c, v.verdict]))
      .concat(before.get(text)?.core ? [[before.get(text).core, 'accepted']] : [])
    const near = seen.filter(([c]) => c && relaxedCore(c) === loose).map(([, v]) => v)
    const relaxed = near.includes('accepted') ? 'accepted' : near.includes('rejected') ? 'rejected' : 'unknown'
    return {verdict: 'unjudged', labelNow: now.get(text)?.core === core, relaxed}
  }
  return {verdictOf, labelsNow: now, registry, judged}
}
