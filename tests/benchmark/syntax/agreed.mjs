// The circuits that given strategies wrote alike, over any number of run folders.
//   node tests/benchmark/syntax/agreed.mjs <out.jsonl> --strategies hmm-rules,spacy-direct [--key core|relaxed|variants] <run-folder…>
// A run folder holds <strategy>.jsonl files as run.mjs writes them. For every message on which all
// the named strategies wrote the same circuit, one line {text, sop, folder} is written, with the
// circuit of the first strategy in its normal form. No judge is involved: such a line is agreement,
// not a verdict. On the judged rounds of 2026-11-27, 483 of 483 circuits that hmm-rules (then named vss) and
// spacy-direct wrote alike were accepted on the first round and 28 of 29 on the second.
// --key says what "the same circuit" is: core (the default) the same core; relaxed the same core up to
// the start of marked relations (relaxedCore); variants also up to the other choices the judges' rules
// let pass either way (agreementKey in lib.mjs). Every strategy must write a circuit alike to the
// first strategy's. A strategy may be named by an old name (strategyAliases in lib.mjs), and an old run folder's
// file of an old name (vss.jsonl) stands for the strategy it is now (hmm-rules).
import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {basename, resolve} from 'node:path'
import {normalForm, readArguments, writtenAlike, AGREEMENT_KEYS, strategyName, outputFile} from './lib.mjs'

const {words, named} = readArguments(process.argv.slice(2))
const [outFile, ...folders] = words
const strategies = typeof named.strategies === 'string' ? named.strategies.split(',').map(name => strategyName(name.trim())) : []
const key = typeof named.key === 'string' ? named.key : 'core'
if (!outFile || !folders.length || strategies.length < 2 || !AGREEMENT_KEYS.includes(key)) {
  console.error(`Usage: node tests/benchmark/syntax/agreed.mjs <out.jsonl> --strategies a,b[,c] [--key ${AGREEMENT_KEYS.join('|')}] <run-folder…>`)
  process.exit(2)
}
const lines = file => readFileSync(file, 'utf8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line))
const out = []
let messages = 0, skipped = 0
for (const folder of folders.map(folder => resolve(folder))) {
  const files = strategies.map(name => outputFile(folder, name))
  if (!files.every(existsSync)) { skipped++; continue }
  const runs = files.map(file => new Map(lines(file).map(row => [row.text, row.sop ? normalForm(row.text, row.sop) : null])))
  for (const [text, first] of runs[0]) {
    messages++
    if (!first?.core || !runs.slice(1).every(run => run.get(text)?.core && writtenAlike(text, first, run.get(text), key))) continue
    out.push({text, sop: first.sop, folder: basename(folder)})
  }
}
writeFileSync(resolve(outFile), out.map(row => JSON.stringify(row)).join('\n') + (out.length ? '\n' : ''))
console.log(`${folders.length - skipped} run folders, ${messages} messages: ${strategies.join(' and ')} wrote ${key === 'core' ? 'the same circuit' : `circuits alike by the key ${key}`} for ${out.length} (${messages ? (100 * out.length / messages).toFixed(1) : '0.0'}%). ${skipped ? skipped + ' folders lack a file of one of the strategies and were left out. ' : ''}Written: ${outFile}`)
