// node showfail.mjs <fail.jsonl> [key] [skip] [count]
import {readFileSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {normalForm} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const lines = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const [file, key = 'C', skip = 0, count = 8] = process.argv.slice(2)
for (const row of lines(file).slice(+skip, +skip + +count)) {
  const t = row.tried.find(t => t.key === key) ?? row.tried.at(-1)
  console.log('TEXT ' + row.text + '   [' + t.key + ']' + (t.error ? ' ERROR ' + t.error : ''))
  if (!t.sop) continue
  const g = normalForm(row.text, row.gold).sop.split('\n'), c = normalForm(row.text, t.sop).sop.split('\n')
  for (const l of g) if (!c.includes(l)) console.log('   - ' + l.replace('syntax.', ''))
  for (const l of c) if (!g.includes(l)) console.log('   + ' + l.replace('syntax.', ''))
}
