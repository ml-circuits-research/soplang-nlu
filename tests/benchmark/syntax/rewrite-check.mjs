// Checks the circuits a judge wrote for one rewriting packet of a conversion round.
// A written line is {"n": <number of the packet line>, "sop": "<the circuit, one wire per line>"}.
// Every circuit is checked against the `syntax` schema and against its message with validateSyntax;
// what is wrong is said in words, so that the judge can correct the line. A line with a problem
// does not count. round.mjs rewrite-prepare puts a check.mjs beside the packets that calls this file.
import {readFileSync, existsSync, readdirSync} from 'node:fs'
import {join} from 'node:path'
import {validateSyntax} from '../../../lib/syntax.mjs'
import {normalForm} from './lib.mjs'

const at = finding => finding.wire ? `@${finding.wire}: ` : ''
const SAID = {
  'not-a-circuit': finding => finding.message,
  'empty-circuit': () => 'the circuit has no wire',
  'duplicate-id': finding => `two wires are named @${finding.wire}`,
  'unknown-type': finding => `${at(finding)}there is no wire type ${finding.type}`,
  'unknown-key': finding => `${at(finding)}"${finding.key}" is no key of this wire type`,
  'repeated-key': finding => `${at(finding)}the key "${finding.key}" may stand once`,
  'unknown-value': finding => `${at(finding)}${finding.key}=${finding.value} is no value of this key`,
  'missing-wire': finding => `${at(finding)}${finding.key}=${finding.value} names a wire that is not in the circuit`,
  'wrong-wire-type': finding => `${at(finding)}${finding.key}=${finding.value} names a wire of a type this key does not take`,
  'refers-to-itself': finding => `${at(finding)}"${finding.key}" names the wire itself`,
  'expected-quoted-words': finding => `${at(finding)}"${finding.key}" takes words of the message in double quotes`,
  'missing-key': finding => `${at(finding)}the key "${finding.key}" is missing`,
  'fragment-with-verb': finding => `${at(finding)}a fragment has no verb; a clause with a verb has another form`,
  'clause-without-verb': finding => `${at(finding)}this form needs a verb; a clause with no verb is form=fragment`,
  'ellipsis-outside-fragment': finding => `${at(finding)}only a fragment can carry "ellipsis"`,
  'ellipsis-of-a-clause-without-verb': finding => `${at(finding)}"ellipsis" must name a clause that has a verb`,
  'coordination-needs-two-conjuncts': finding => `${at(finding)}a coordination joins at least two different wires`,
  'mixed-conjuncts': finding => `${at(finding)}the conjuncts of one coordination are of one type`,
  'no-clause': () => 'the circuit has no clause; a message with no verb is one clause with form=fragment',
  'bad-quote': finding => `${at(finding)}the value of "${finding.key}" is not well quoted`,
  'value-without-words': finding => `${at(finding)}${finding.key}=${JSON.stringify(finding.value)} holds no word; punctuation stands in no value`,
  'words-not-in-message': finding => `${at(finding)}${finding.key}=${JSON.stringify(finding.value)}: these words are not in the message, or an earlier value has taken them (values take the words in the order the circuit is written)`,
  'uncovered-words': finding => `these words of the message stand in no value: ${finding.words.map(word => JSON.stringify(word)).join(', ')}`
}
/** One finding of validateSyntax in words. */
export const describeFinding = finding => (SAID[finding.code] ?? (other => `${other.code} ${JSON.stringify(other)}`))(finding)

/**
 * @param packet the lines of rewriting/packet-<k>.jsonl as objects {n, text, rejected: [{sop, note}]}
 * @param lines the lines of rewriting/written-<k>.jsonl as text
 * @returns {rows, written, missing: [n], problems: [text], circuits}: `circuits` are the lines that
 *   are right, as {n, text, sop, core} with the circuit in normal form; only these count
 */
export function checkWritten(packet, lines) {
  const byNumber = new Map(packet.map(row => [row.n, row])), seen = new Map(), problems = []
  lines.forEach((line, index) => {
    if (!line.trim()) return
    const where = `line ${index + 1}`
    let written
    try { written = JSON.parse(line) } catch { problems.push(`${where}: not a JSON object`); return }
    if (!written || typeof written !== 'object' || Array.isArray(written)) { problems.push(`${where}: not a JSON object`); return }
    const row = byNumber.get(written.n)
    if (!row) { problems.push(`${where}: n=${JSON.stringify(written.n)} is no line of this packet`); return }
    if (seen.has(written.n)) { problems.push(`${where}: n=${written.n} is written twice`); return }
    const extra = Object.keys(written).filter(key => !['n', 'sop'].includes(key))
    if (extra.length) { problems.push(`${where}: n=${written.n} has the unknown key ${extra.join(', ')}; a line has n and sop`); return }
    if (typeof written.sop !== 'string' || !written.sop.trim()) { problems.push(`${where}: n=${written.n} needs the circuit as text in "sop"`); return }
    const check = validateSyntax(row.text, written.sop)
    if (!check.valid) { for (const finding of check.findings) problems.push(`${where}: n=${written.n}: ${describeFinding(finding)}`); return }
    const normal = normalForm(row.text, written.sop)
    if ((row.rejected ?? []).some(other => normalForm(row.text, other.sop)?.core === normal.core)) { problems.push(`${where}: n=${written.n} is the same circuit as one that was rejected for this message`); return }
    seen.set(written.n, {n: written.n, text: row.text, sop: normal.sop, core: normal.core})
  })
  return {rows: packet.length, written: seen.size, missing: packet.map(row => row.n).filter(n => !seen.has(n)), problems, circuits: [...seen.values()]}
}

const linesOf = file => readFileSync(file, 'utf8').split('\n')
/** Checks packet k of a rewriting folder; a missing file of written circuits counts as nothing written yet. */
export function checkWrittenPacket(folder, k) {
  const packetFile = join(folder, `packet-${k}.jsonl`), writtenFile = join(folder, `written-${k}.jsonl`)
  if (!existsSync(packetFile)) return {rows: 0, written: 0, missing: [], problems: [`there is no packet-${k}.jsonl`], circuits: []}
  const packet = linesOf(packetFile).filter(line => line.trim()).map(line => JSON.parse(line))
  return checkWritten(packet, existsSync(writtenFile) ? linesOf(writtenFile) : [])
}
export function rewritingPackets(folder) {
  return existsSync(folder) ? readdirSync(folder).map(file => /^packet-(\d+)\.jsonl$/u.exec(file)?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b) : []
}
/** Every written circuit of a rewriting folder that passes the check: {circuits, problems}. */
export function readWritten(folder) {
  const circuits = [], problems = []
  for (const k of rewritingPackets(folder)) {
    const result = checkWrittenPacket(folder, k)
    circuits.push(...result.circuits)
    problems.push(...result.problems.map(problem => `written-${k}.jsonl ${problem}`))
  }
  return {circuits, problems}
}

/** `node check.mjs [k]` in a rewriting folder. */
export function main(folder, argv) {
  const wanted = argv.map(Number).filter(Number.isInteger)
  let failed = false, rows = 0, written = 0
  for (const k of wanted.length ? wanted : rewritingPackets(folder)) {
    const result = checkWrittenPacket(folder, k)
    rows += result.rows; written += result.written
    console.log(`packet ${k}: ${result.rows} messages, ${result.written} with a circuit that is right in form, ${result.missing.length} still to write` +
      (result.missing.length && result.missing.length <= 20 ? ': n=' + result.missing.join(', ') : ''))
    for (const problem of result.problems) console.log('  ' + problem)
    if (result.problems.length) failed = true
  }
  if (wanted.length !== 1) console.log(`all packets: ${written} of ${rows} messages have a circuit`)
  console.log(failed ? 'Some circuits have problems: correct the lines named above.' : 'Every written circuit fits the schema and its message.')
  process.exit(failed ? 1 : 0)
}
