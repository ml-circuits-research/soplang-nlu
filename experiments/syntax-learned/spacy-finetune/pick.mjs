// Step 3 of the conversion: keep, for every message, the first candidate whose circuit (written by the spacy
// strategy's writer with the repairs of spacy-direct) equals the gold circuit.
//   node pick.mjs <labels.jsonl> <realized.jsonl> <trees.jsonl> [--strict] [--report file]
// Equality: the relaxed core (attachment marks set aside, a marked relation may start at the clause or at a
// nominal of it), as the judge allows; --strict asks the plain core.
import {readFileSync, writeFileSync} from 'node:fs'
import {relaxedCore, tieSentences} from './convert.mjs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {directCircuit} = await import(root + 'strategies/spacy-direct/index.mjs')
const {normalForm} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const lines = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const [labelsFile, realizedFile, outFile] = process.argv.slice(2)
const strict = process.argv.includes('--strict')
const reportFile = process.argv.includes('--report') ? process.argv[process.argv.indexOf('--report') + 1] : null
const byText = Map.groupBy(lines(realizedFile), row => row.text)
const compare = (text, sop) => strict ? normalForm(text, sop)?.core ?? null : relaxedCore(text, sop)
const kept = [], report = [], count = {}
for (const label of lines(labelsFile)) {
  const list = byText.get(label.text) ?? []
  const gold = compare(label.text, tieSentences(label.text, label.sop).sop)
  let chosen = null
  const tried = []
  for (const candidate of list) {
    if (!candidate.ok) { tried.push({key: candidate.key, error: candidate.error}); continue }
    let sop = null
    try { sop = directCircuit(label.text, candidate.tokens).sop } catch (error) { tried.push({key: candidate.key, error: error.message}); continue }
    const core = compare(label.text, sop)
    tried.push({key: candidate.key, sop})
    if (core && core === gold) { chosen = candidate; break }
  }
  const name = chosen?.key ?? 'none'
  count[name] = (count[name] ?? 0) + 1
  if (chosen) kept.push({text: label.text, key: chosen.key, accepted_by: label.accepted_by, tokens: chosen.tokens.map(({i, text, start, end, tag, dep, head, pos, lemma}) => ({i, text, start, end, tag, dep, head, pos, lemma}))})
  else report.push({text: label.text, gold: label.sop, tried})
}
writeFileSync(outFile, kept.map(row => JSON.stringify(row)).join('\n') + '\n')
if (reportFile) writeFileSync(reportFile, report.map(row => JSON.stringify(row)).join('\n') + '\n')
console.log(JSON.stringify({labels: lines(labelsFile).length, chosen: count, kept: kept.length}))
