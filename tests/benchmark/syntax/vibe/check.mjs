// Checks the verdicts a judge wrote for one batch CSV.
//   node check.mjs <batch.csv>        (F-simple.csv or F-advanced.csv; verdicts are F-simple.verdicts.jsonl / F-advanced.verdicts.jsonl)
// A line is {"n", "grade": "L8"|"L1".."L6", "note"}; an L8 accepts. A rejection's note quotes the message in single
// quotes; in an advanced file a rejection also carries "sop", a corrected circuit that passes validateSyntax.
import {readFileSync, existsSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
import {readCsv} from '../lib.mjs'
import {validateSyntax} from '../../../../lib/syntax.mjs'
import {GRADES, quotesTheMessage} from '../check.mjs'

export const verdictsFileOf = csv => csv.replace(/\.csv$/u, '.verdicts.jsonl')

/** @returns {rows, judged, accepted, rejected, missing, problems} */
export function checkBatch(csv) {
  const advanced = /(-advanced(\.p\d+)?|packet-[a-z]?\d+)\.csv$/u.test(csv)
  const [, ...rows] = readCsv(readFileSync(csv, 'utf8'))
  const byNumber = new Map(rows.map(([n, text]) => [Number(n), text]))
  const file = verdictsFileOf(csv), problems = [], seen = new Set()
  let accepted = 0
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split('\n') : []
  if (!existsSync(file)) problems.push(`there is no ${file.split('/').at(-1)}`)
  const allowed = new Set(['n', 'grade', 'note', ...advanced ? ['sop'] : []])
  lines.forEach((line, index) => {
    if (!line.trim()) return
    const where = `line ${index + 1}`
    let v
    try { v = JSON.parse(line) } catch { problems.push(`${where}: not a JSON object`); return }
    if (!v || typeof v !== 'object' || Array.isArray(v)) { problems.push(`${where}: not a JSON object`); return }
    const extra = Object.keys(v).filter(k => !allowed.has(k))
    if (extra.length) problems.push(`${where}: unknown key ${extra.join(', ')}`)
    const text = byNumber.get(v.n)
    if (text === undefined) { problems.push(`${where}: n=${JSON.stringify(v.n)} is no row of the CSV`); return }
    if (seen.has(v.n)) { problems.push(`${where}: n=${v.n} is judged twice`); return }
    let ok = true
    if (!GRADES.includes(v.grade)) { problems.push(`${where}: n=${v.n} has the grade ${JSON.stringify(v.grade)}; use L8, or L1 to L6`); ok = false }
    if (typeof v.note !== 'string') { problems.push(`${where}: n=${v.n} needs a note that is a text (may be empty for L8)`); ok = false }
    else if (ok && v.grade !== 'L8' && !quotesTheMessage(v.note, text)) { problems.push(`${where}: n=${v.n} is rejected, so its note must quote words of the message in single quotes`); ok = false }
    if (ok && advanced && v.grade !== 'L8') {
      if (typeof v.sop !== 'string') { problems.push(`${where}: n=${v.n} is rejected, so the line needs "sop": a corrected circuit`); ok = false }
      else { const c = validateSyntax(text, v.sop); if (!c.valid) { problems.push(`${where}: n=${v.n}: the corrected sop is not valid for the message: ${JSON.stringify(c.findings ?? c).slice(0, 300)}`); ok = false } }
    }
    if (ok) { seen.add(v.n); if (v.grade === 'L8') accepted++ }
  })
  const missing = [...byNumber.keys()].filter(n => !seen.has(n))
  if (missing.length) problems.push(`${missing.length} rows have no valid verdict yet: n=${missing.slice(0, 30).join(', ')}${missing.length > 30 ? ', …' : ''}`)
  return {rows: rows.length, judged: seen.size, accepted, rejected: seen.size - accepted, missing, problems}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkBatch(process.argv[2])
  console.log(`${result.rows} rows, ${result.judged} judged (${result.accepted} accepted, ${result.rejected} rejected)`)
  for (const p of result.problems) console.log('  ' + p)
  console.log(result.problems.length ? 'The verdict file has problems: write it again, whole, with them corrected.' : 'The format is right.')
  process.exit(result.problems.length ? 1 : 0)
}
