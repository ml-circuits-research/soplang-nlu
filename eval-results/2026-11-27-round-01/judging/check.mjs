// Checks the verdicts a judge wrote for one packet.
//   node check.mjs <k>     checks verdicts-<k>.jsonl against packet-<k>.jsonl, in the folder of this file
//   node check.mjs         checks every packet of the folder
// A verdict line is {"n": <number of the packet line>, "grade": "L8" | "L1" … "L6", "note": "<one sentence>"}.
// L8 accepts the circuit. L1 to L6 reject it, and the note must then quote, in single quotes, the
// words of the message the rejection is about.
// This file needs nothing but Node: judge-prepare.mjs copies it next to the packets.
import {readFileSync, existsSync, readdirSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

export const GRADES = ['L8', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6']
const QUOTE = /['‘’]/gu
const plain = text => text.toLowerCase().replace(/[‘’]/gu, "'").replace(/\s+/gu, ' ').trim()

/** Does the note quote, between single quotes, words that stand in the message? */
export function quotesTheMessage(note, text) {
  const marks = [...note.matchAll(QUOTE)].map(match => match.index), message = plain(text)
  for (let a = 0; a < marks.length; a++) for (let b = a + 1; b < marks.length; b++) {
    const quoted = plain(note.slice(marks[a] + 1, marks[b]))
    if (/[\p{L}\p{N}]/u.test(quoted) && message.includes(quoted)) return true
  }
  return false
}

/**
 * @param packet the lines of packet-<k>.jsonl as objects {n, text, sop}
 * @param lines the lines of verdicts-<k>.jsonl as text
 * @returns {rows, judged, accepted, rejected, missing: [n], problems: [text], verdicts}: `verdicts`
 *   are the lines that are right, as {n, grade, note}; only these count
 */
export function checkVerdicts(packet, lines) {
  const byNumber = new Map(packet.map(row => [row.n, row])), seen = new Map(), problems = []
  lines.forEach((line, index) => {
    if (!line.trim()) return
    const where = `line ${index + 1}`
    let verdict
    try { verdict = JSON.parse(line) } catch { problems.push(`${where}: not a JSON object`); return }
    if (!verdict || typeof verdict !== 'object' || Array.isArray(verdict)) { problems.push(`${where}: not a JSON object`); return }
    const extra = Object.keys(verdict).filter(key => !['n', 'grade', 'note'].includes(key))
    if (extra.length) problems.push(`${where}: unknown key ${extra.join(', ')}; a verdict has n, grade and note`)
    const row = byNumber.get(verdict.n)
    if (!row) { problems.push(`${where}: n=${JSON.stringify(verdict.n)} is no line of this packet`); return }
    if (seen.has(verdict.n)) { problems.push(`${where}: n=${verdict.n} is judged twice`); return }
    seen.set(verdict.n, null)
    let sound = true
    if (!GRADES.includes(verdict.grade)) { problems.push(`${where}: n=${verdict.n} has the grade ${JSON.stringify(verdict.grade)}; a judge gives L8, or L1 to L6`); sound = false }
    if (typeof verdict.note !== 'string') { problems.push(`${where}: n=${verdict.n} needs a note that is a text (it may be empty for L8)`); sound = false }
    else if (sound && verdict.grade !== 'L8' && !quotesTheMessage(verdict.note, row.text)) {
      problems.push(`${where}: n=${verdict.n} is rejected, so its note must quote words of the message in single quotes`); sound = false
    }
    if (!sound) seen.delete(verdict.n)
    else seen.set(verdict.n, {n: verdict.n, grade: verdict.grade, note: verdict.note})
  })
  const verdicts = [...seen.values()], accepted = verdicts.filter(verdict => verdict.grade === 'L8').length
  return {rows: packet.length, judged: verdicts.length, accepted, rejected: verdicts.length - accepted, missing: packet.map(row => row.n).filter(n => !seen.has(n)), problems, verdicts}
}

const lines = file => readFileSync(file, 'utf8').split('\n')
/** Checks packet k of a folder; a missing verdict file counts as nothing judged yet. */
export function checkPacket(folder, k) {
  const packetFile = join(folder, `packet-${k}.jsonl`), verdictFile = join(folder, `verdicts-${k}.jsonl`)
  if (!existsSync(packetFile)) return {rows: 0, judged: 0, accepted: 0, rejected: 0, missing: [], problems: [`there is no packet-${k}.jsonl`], verdicts: []}
  const packet = lines(packetFile).filter(line => line.trim()).map(line => JSON.parse(line))
  return checkVerdicts(packet, existsSync(verdictFile) ? lines(verdictFile) : [])
}
export function packetNumbers(folder) {
  return readdirSync(folder).map(file => /^packet-(\d+)\.jsonl$/u.exec(file)?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const folder = dirname(fileURLToPath(import.meta.url))
  const wanted = process.argv.slice(2).map(Number).filter(Number.isInteger)
  let failed = false, rows = 0, judged = 0
  for (const k of wanted.length ? wanted : packetNumbers(folder)) {
    const result = checkPacket(folder, k)
    rows += result.rows; judged += result.judged
    console.log(`packet ${k}: ${result.rows} rows, ${result.judged} judged (${result.accepted} accepted, ${result.rejected} rejected), ${result.missing.length} still to judge` +
      (result.missing.length && result.missing.length <= 20 ? ': n=' + result.missing.join(', ') : ''))
    for (const problem of result.problems) console.log('  ' + problem)
    if (result.problems.length) failed = true
  }
  if (wanted.length !== 1) console.log(`all packets: ${judged} of ${rows} rows judged`)
  console.log(failed ? 'The verdict file has problems: correct the lines named above.' : 'The format is right.')
  process.exit(failed ? 1 : 0)
}
