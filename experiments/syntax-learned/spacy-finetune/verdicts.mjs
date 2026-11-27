// Known verdicts for circuits of the benchmark run 2026-11-27-syntax-benchmark-random, as in
// scratchpad/vss-registry.mjs: a circuit is accepted or rejected when its core matches a circuit judged in
// the run (L8 = accepted), a line of the registry, or the label of the message (now, or before the run).
import {readFileSync, readdirSync, existsSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {normalForm, readRegistry, lookup, readLabels, readLabelsBefore} = await import(root + 'tests/benchmark/syntax/lib.mjs')
export {normalForm}
const round = 'eval-results/2026-11-27-syntax-benchmark-random'
const lines = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))

export function openVerdicts() {
  const registry = readRegistry()
  const labels = readLabels()
  const before = readLabelsBefore(root + round, new Map())
  const judged = new Map()
  const dir = root + round + '/judging/'
  if (existsSync(dir)) for (const name of readdirSync(dir).filter(name => /^verdicts-\d+\.jsonl$/u.test(name))) {
    const packet = new Map(lines(dir + name.replace('verdicts', 'packet')).map(row => [row.n, row]))
    for (const verdict of lines(dir + name)) {
      const row = packet.get(verdict.n)
      if (!row) continue
      if (!judged.has(row.text)) judged.set(row.text, new Map())
      judged.get(row.text).set(normalForm(row.text, row.sop)?.core, {...verdict, sop: row.sop})
    }
  }
  /** 'accepted' | 'rejected' | 'unjudged' | 'invalid', and the judge's note when there is one */
  function verdictOf(text, core) {
    if (!core) return {verdict: 'invalid'}
    const here = judged.get(text)?.get(core)
    if (here) return {verdict: here.grade === 'L8' ? 'accepted' : 'rejected', grade: here.grade, note: here.note, by: 'run'}
    const known = lookup(registry, text, core)
    if (known?.verdict) return {verdict: known.verdict, grade: known.grade, note: known.note, by: 'registry'}
    if (labels.get(text)?.core === core) return {verdict: 'accepted', by: 'label'}
    if (before.get(text)?.core === core) return {verdict: 'accepted', by: 'label-before'}
    return {verdict: 'unjudged'}
  }
  /**
   * For a circuit with no known verdict: is it equal, up to the readings the rules let pass (attachment mark,
   * start of a marked relation among the clause and its nominals, Rule 5.5), to a circuit known accepted, or only to
   * known rejected ones? An estimate, not a verdict.
   */
  const relaxedCache = new Map()
  function relaxedVerdictOf(text, sop, relaxedCore) {
    if (!relaxedCache.has(text)) {
      const known = []
      for (const [, v] of judged.get(text) ?? []) known.push({sop: v.sop, verdict: v.grade === 'L8' ? 'accepted' : 'rejected'})
      for (const [, row] of registry.byText.get(text) ?? []) known.push({sop: row.sop, verdict: row.verdict})
      if (labels.get(text)) known.push({sop: labels.get(text).label, verdict: 'accepted'})
      if (before.get(text)) known.push({sop: before.get(text).label, verdict: 'accepted'})
      relaxedCache.set(text, known.map(k => ({...k, relaxed: relaxedCore(text, k.sop)})))
    }
    const mine = relaxedCore(text, sop)
    const hits = relaxedCache.get(text).filter(k => k.relaxed && k.relaxed === mine)
    return hits.some(k => k.verdict === 'accepted') ? 'like-accepted' : hits.length ? 'like-rejected' : 'unlike'
  }
  return {verdictOf, relaxedVerdictOf, labels}
}
export const benchmarkRows = () => lines(root + round + '/spacy.jsonl')
