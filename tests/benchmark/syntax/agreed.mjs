// The circuits that given strategies wrote alike, over any number of run folders.
//   node tests/benchmark/syntax/agreed.mjs <out.jsonl> --strategies vss,spacy-direct <run-folder…>
// A run folder holds <strategy>.jsonl files as run.mjs writes them. For every message on which all
// the named strategies wrote the same circuit (the same core), one line {text, sop, folder} is
// written, with the circuit in its normal form. No judge is involved: such a line is agreement,
// not a verdict. On the judged rounds of 2026-11-27, 483 of 483 circuits that VSS and
// spacy-direct wrote alike were accepted on the first round and 28 of 29 on the second.
import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {basename, join, resolve} from 'node:path'
import {normalForm, readArguments} from './lib.mjs'

const {words, named} = readArguments(process.argv.slice(2))
const [outFile, ...folders] = words
const strategies = typeof named.strategies === 'string' ? named.strategies.split(',').map(name => name.trim()) : []
if (!outFile || !folders.length || strategies.length < 2) {
  console.error('Usage: node tests/benchmark/syntax/agreed.mjs <out.jsonl> --strategies a,b[,c] <run-folder…>')
  process.exit(2)
}
const lines = file => readFileSync(file, 'utf8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line))
const out = []
let messages = 0, skipped = 0
for (const folder of folders.map(folder => resolve(folder))) {
  const files = strategies.map(name => join(folder, name + '.jsonl'))
  if (!files.every(existsSync)) { skipped++; continue }
  const runs = files.map(file => new Map(lines(file).map(row => [row.text, row.sop ? normalForm(row.text, row.sop) : null])))
  for (const [text, first] of runs[0]) {
    messages++
    if (!first?.core || !runs.slice(1).every(run => run.get(text)?.core === first.core)) continue
    out.push({text, sop: first.sop, folder: basename(folder)})
  }
}
writeFileSync(resolve(outFile), out.map(row => JSON.stringify(row)).join('\n') + (out.length ? '\n' : ''))
console.log(`${folders.length - skipped} run folders, ${messages} messages: ${strategies.join(' and ')} wrote the same circuit for ${out.length} (${messages ? (100 * out.length / messages).toFixed(1) : '0.0'}%). ${skipped ? skipped + ' folders lack a file of one of the strategies and were left out. ' : ''}Written: ${outFile}`)
