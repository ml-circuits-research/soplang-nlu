import {readFileSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const S = '/tmp/claude-1000/-home-salboaie-work-sopworlds/e235462f-8553-42ea-b357-85307b023a32/scratchpad/learned/'
const {normalForm, relaxedCore} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const lines = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const coreMap = (rows, key = 'sop') => new Map(rows.map(r => [r.text, r[key] ? normalForm(r.text, r[key])?.core : null]))
const cmp = (a, b, label) => { let same = 0, n = 0; for (const [t, c] of a) { n++; if (c && c === b.get(t)) same++ } console.log(label, same, '/', n) }
const run = 'eval-results/2026-11-27-syntax-benchmark-random/'
const spacyRun = coreMap(lines(root + run + 'spacy.jsonl'))
cmp(coreMap(lines(S + 'spacy-finetune/results/base-bench-gpu.jsonl')), spacyRun, 'ft base GPU parse+beamCircuit vs spacy.jsonl:')
cmp(coreMap(lines(S + 'spacy-finetune/results/gold2-bench.jsonl')), coreMap(lines(S + 'spacy-finetune/runs/gold2-bench-cpu.jsonl')), 'ft gold2 GPU vs CPU strategy run:')
cmp(coreMap(lines(S + 'spacy-finetune/results/silver-bench.jsonl')), coreMap(lines(S + 'spacy-finetune/runs/silver-bench-cpu.jsonl')), 'ft silver GPU vs CPU strategy run:')
// ft dev recount
for (const m of ['base', 'gold2', 'silver']) {
  const rows = lines(S + `spacy-finetune/results/${m}-gold-dev.jsonl`)
  console.log('ft dev', m, rows.length, 'equal', rows.filter(r => r.equal).length, 'loose', rows.filter(r => r.equalLoose).length, 'relaxed(own)', rows.filter(r => r.equalRelaxed).length,
    'lib relaxedCore', rows.filter(r => r.sop && relaxedCore(normalForm(r.text, r.sop)?.core) === relaxedCore(normalForm(r.text, r.gold).core)).length)
}
// parser dev recount
const dev = lines(S + 'parser/dev-x-e15-g3.jsonl')
console.log('parser dev keys', Object.keys(dev[0]))
