// node showbench.mjs <results.jsonl> <baseVerdict> <verdict> [like] [skip] [count]
import {readFileSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {normalForm} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const lines = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const [file, was, now, like = 'any', skip = 0, count = 10] = process.argv.slice(2)
const rows = lines(file).filter(r => !r.same && r.baseVerdict === was && r.verdict === now && (like === 'any' || r.like === like))
console.log(rows.length + ' rows')
for (const row of rows.slice(+skip, +skip + +count)) {
  console.log('TEXT ' + row.text + (row.note ? '\n  NOTE ' + row.note : ''))
  const g = normalForm(row.text, row.baseSop).sop.split('\n'), c = normalForm(row.text, row.sop).sop.split('\n')
  for (const l of g) if (!c.includes(l)) console.log('   - ' + l.replace('syntax.', ''))
  for (const l of c) if (!g.includes(l)) console.log('   + ' + l.replace('syntax.', ''))
}
