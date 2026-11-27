import {readFileSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {normalForm} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const [file, skip = 0, count = 40] = process.argv.slice(2)
const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
rows.slice(+skip, +skip + +count).forEach((row, k) => {
  console.log(`#${+skip + k} [${row.baseVerdict}] ${row.text}` + (row.baseNote ? "\n   BASE NOTE: " + row.baseNote : ""))
  const g = normalForm(row.text, row.baseSop).sop.split('\n'), c = normalForm(row.text, row.sop).sop.split('\n')
  for (const l of g) if (!c.includes(l)) console.log('   - ' + l.replace('syntax.', ''))
  for (const l of c) if (!g.includes(l)) console.log('   + ' + l.replace('syntax.', ''))
})
