const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {readRegistry, readSample} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const norm = t => t.toLowerCase().replace(/\s+/gu, ' ').trim()
const bench = new Set(readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz').map(r => norm(r.text)))
const reg = readRegistry()
const c = {inBench: {accepted: 0, rejected: 0}, outside: {accepted: 0, rejected: 0}}, msgs = {inBench: new Set(), outside: new Set()}, both = new Set()
for (const [text, m] of reg.byText) {
  const where = bench.has(norm(text)) ? 'inBench' : 'outside'; msgs[where].add(text)
  const vs = new Set(); for (const [, row] of m) { c[where][row.verdict] = (c[where][row.verdict] ?? 0) + 1; vs.add(row.verdict) }
  if (where === 'outside' && vs.has('accepted') && vs.has('rejected')) both.add(text)
}
console.log(c, {inBenchMsgs: msgs.inBench.size, outsideMsgs: msgs.outside.size, outsideWithAcceptedAndRejected: both.size})
