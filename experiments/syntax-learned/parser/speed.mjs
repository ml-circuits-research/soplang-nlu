// End-to-end speed through the common reader: VSS's routes for the stations, the habits, the parser,
// the circuit, and the validator of createReader.   node speed.mjs model.json.gz
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {createReader} = await import(root + 'lib/index.mjs')
const {readSample} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {vssParser} = await import('./strategy.mjs')
const {vss} = await import(root + 'strategies/vss/index.mjs')
const model = new URL(process.argv[2] ?? 'model.json.gz', import.meta.url)
const bench = readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz')
for (const [name, strategy, options] of [['vss-parser', vssParser, {model}], ['vss', vss, {}]]) {
  const t0 = performance.now()
  const opened = await strategy.open(options)
  const openMs = performance.now() - t0
  const reader = await createReader({strategy: {...strategy, open: () => opened}})
  const times = []
  let valid = 0
  for (const {text} of bench) {
    const t = performance.now()
    const result = await reader.propose(text)
    times.push(performance.now() - t)
    if (result.candidates?.[0]?.sop) valid++
  }
  times.sort((a, b) => a - b)
  console.log(`${name}: open ${openMs.toFixed(0)} ms; ${bench.length} messages, valid ${valid}; median ${times[times.length >> 1].toFixed(2)} ms, mean ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(2)} ms, p95 ${times[Math.floor(times.length * 0.95)].toFixed(2)} ms; heap ${(process.memoryUsage().heapUsed / 1e6).toFixed(0)} MB`)
  await reader.close?.()
}
