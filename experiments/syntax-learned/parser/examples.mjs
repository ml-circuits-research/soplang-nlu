// Benchmark messages where the parser and VSS differ in verdict, with the judge's notes.
//   node examples.mjs <tag> [count]
import {readFileSync} from 'node:fs'
const tag = process.argv[2], count = Number(process.argv[3] ?? 6)
const rows = readFileSync(`bench-${tag}.jsonl`, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
const short = sop => (sop ?? '').split('\n').map(l => '      ' + l.replace(' syntax.', ' ')).join('\n')
const diff = (a, b) => { const A = new Set((a ?? '').split('\n')), B = new Set((b ?? '').split('\n')); return [...[...A].filter(l => !B.has(l)).map(l => '      - ' + l.replace(' syntax.', ' ')), ...[...B].filter(l => !A.has(l)).map(l => '      + ' + l.replace(' syntax.', ' '))].join('\n') }
const groups = {
  'parser accepted, VSS rejected': r => r.verdict.verdict === 'accepted' && r.vssVerdict.verdict === 'rejected',
  'parser rejected, VSS accepted': r => r.verdict.verdict === 'rejected' && r.vssVerdict.verdict === 'accepted',
  'parser rejected, VSS rejected': r => r.verdict.verdict === 'rejected' && r.vssVerdict.verdict === 'rejected' && !r.same,
}
for (const [name, test] of Object.entries(groups)) {
  const found = rows.filter(test)
  console.log(`\n## ${name}: ${found.length}`)
  // the judge's grades of the losing side
  const grades = {}
  for (const r of found) { const g = (name.startsWith('parser accepted') ? r.vssVerdict : r.verdict).grade; grades[g] = (grades[g] ?? 0) + 1 }
  console.log('grades of the rejected side:', JSON.stringify(grades))
  for (const r of found.slice(0, count)) {
    console.log(`\n* ${r.text}`)
    if (r.verdict.note) console.log(`    parser: ${r.verdict.grade} ${r.verdict.note}`)
    if (r.vssVerdict.note) console.log(`    vss:    ${r.vssVerdict.grade} ${r.vssVerdict.note}`)
    console.log('    vss -> parser:\n' + diff(r.vssSop, r.sop))
  }
}
// the notes of the parser's rejections, by first words
const notes = rows.filter(r => r.verdict.verdict === 'rejected').map(r => r.verdict.grade + ' ' + (r.verdict.note ?? ''))
console.log('\n## all parser rejections: grades', JSON.stringify(notes.reduce((o, n) => (o[n.slice(0, 2)] = (o[n.slice(0, 2)] ?? 0) + 1, o), {})))
for (const n of notes.slice(0, Number(process.argv[4] ?? 0))) console.log('  ' + n.slice(0, 220))
