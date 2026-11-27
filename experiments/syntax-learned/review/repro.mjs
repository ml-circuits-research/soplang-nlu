// Re-run the parser strategy now (VSS model as it is on disk now) over the benchmark and compare with its saved output.
import {readFileSync, statSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const S = '/tmp/claude-1000/-home-salboaie-work-sopworlds/e235462f-8553-42ea-b357-85307b023a32/scratchpad/learned/'
const {normalForm} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {vssParser} = await import(S + 'parser/strategy.mjs')
const lines = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
console.log('vss model mtime', statSync(root + 'strategies/vss/model/model.json').mtime.toISOString(), 'parser model mtime', statSync(S + 'parser/model.json.gz').mtime.toISOString())
const r = await vssParser.open()
let same = 0, n = 0
for (const row of lines(S + 'parser/bench-x-e15-g3.jsonl')) {
  const out = await r.analyse(row.text)
  const sop = out.analyses[0]?.sop
  n++; if (sop && normalForm(row.text, sop)?.core === normalForm(row.text, row.sop)?.core) same++
}
console.log('parser now vs saved output: same core', same, '/', n)
