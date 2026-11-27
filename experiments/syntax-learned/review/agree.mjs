import {readFileSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const S = '/tmp/claude-1000/-home-salboaie-work-sopworlds/e235462f-8553-42ea-b357-85307b023a32/scratchpad/learned/'
const {normalForm} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const lines = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
// verdicts of VSS from the parser's own bench file (it carries vss verdict?) -> recompute via recompute's logic is heavy; reuse breakdown: parser row has verdict and vssSop
const rows = lines(S + 'parser/bench-x-e15-g3.jsonl')
console.log(Object.keys(rows[0]))
const t = {}
for (const r of rows) { const same = normalForm(r.text, r.sop)?.core === normalForm(r.text, r.vssSop)?.core; const k = (same ? 'identical' : 'different') + ' parser:' + r.verdict?.verdict; t[k] = (t[k] ?? 0) + 1 }
console.log(t)
