// rvss data: the spaCy strategy's circuits written again from the parser's recorded output, with the writer of
// another commit, without running the parser.
//
//   node strategies/rvss/data/rewrite.mjs <run.jsonl> --code <tree> --out <file.jsonl> [--compare]
//
// The spaCy strategy is: the parser's greedy parse and beam (Python, the slow part) -> beamCircuit (JavaScript)
// -> validateSyntax in lib/reader.mjs. run-spacy.mjs records the parser's output for every message; this script
// runs the last two steps of <tree> (lib/ and strategies/spacy-beam of some commit) on it, as spacy-beam's
// analyse() and the reader do. --compare counts the lines whose circuit (or error) differs from the run's.
// `ms` stays the run's: the time of the parser and of the run's writer (the writer is a small part of it).
// The parser's output depends on the model, worker.py and spaCy, not on the writer; a commit that changes
// strategies/neural-dependencies/worker.py, the model or the spaCy install needs a new run instead.
import {createReadStream, writeFileSync, openSync, writeSync, closeSync} from 'node:fs'
import {createInterface} from 'node:readline'
import {createGunzip} from 'node:zlib'
import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {unpackParse} from './run-spacy.mjs'

const args = process.argv.slice(2)
const opt = name => { const at = args.indexOf('--' + name); return at >= 0 ? args[at + 1] : undefined }
const input = resolve(args[0]), code = resolve(opt('code')), outFile = opt('out') && resolve(opt('out'))
const compare = args.includes('--compare')
const {beamCircuit} = await import(pathToFileURL(join(code, 'strategies/spacy-beam/index.mjs')).href)
const {validateSyntax} = await import(pathToFileURL(join(code, 'lib/syntax.mjs')).href)

/** The circuit the reader returns for a message from its parse, or its error, as run-spacy.mjs records them. */
export function circuitFromParse(text, parse) {
  let sop
  try { sop = beamCircuit(text, ...Object.values(unpackParse(parse))).sop }
  catch (error) { return {sop: null, error: 'no circuit: ' + (error instanceof Error ? error.message : String(error))} }
  const check = validateSyntax(text, sop)
  if (check.valid) return {sop, error: null}
  return {sop: null, error: 'invalid circuit: ' + [...new Set(check.findings.map(finding => finding.code))].join(', ')}
}

const stream = createReadStream(input)
const lines = createInterface({input: input.endsWith('.gz') ? stream.pipe(createGunzip()) : stream, crlfDelay: Infinity})
const fd = outFile ? openSync(outFile, 'w') : null
const count = {lines: 0, noParse: 0, same: 0, differ: 0, differExamples: []}
let buffer = ''
for await (const line of lines) {
  if (!line) continue
  const row = JSON.parse(line)
  count.lines++
  if (!row.parse) { count.noParse++; if (fd !== null) buffer += JSON.stringify({file: row.file, row: row.row, text: row.text, sop: row.sop, error: row.error, ms: row.ms, rewritten: false}) + '\n'; continue }
  const now = circuitFromParse(row.text, row.parse)
  if (compare) {
    if (now.sop === row.sop && (now.sop !== null || now.error === row.error)) count.same++
    else { count.differ++; if (count.differExamples.length < 5) count.differExamples.push({file: row.file, row: row.row, before: row.sop ?? row.error, now: now.sop ?? now.error}) }
  }
  if (fd !== null) { buffer += JSON.stringify({file: row.file, row: row.row, text: row.text, ...now, ms: row.ms, rewritten: true}) + '\n'; if (buffer.length > 1 << 20) { writeSync(fd, buffer); buffer = '' } }
}
if (fd !== null) { writeSync(fd, buffer); closeSync(fd) }
console.log(JSON.stringify({input, code, ...count}, null, 1))
