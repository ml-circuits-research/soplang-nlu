// For each labelled training message: the current strategy's circuit (base parse, greedy + beam) and what the registry
// knows of it.  node basejudged.mjs <labels.jsonl> <base-parses-with-beam.jsonl> <out.jsonl>
import {readFileSync, writeFileSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {beamCircuit} = await import(root + 'strategies/spacy-beam/index.mjs')
const {normalForm, readRegistry, lookup} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const lines = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const [labelsFile, parsesFile, outFile] = process.argv.slice(2)
const registry = readRegistry()
const parses = new Map(lines(parsesFile).map(r => [r.text, r]))
const count = {}, out = []
for (const label of lines(labelsFile)) {
  const p = parses.get(label.text)
  let sop = null
  try { sop = beamCircuit(label.text, p.tokens, p.alternatives ?? []).sop } catch {}
  const core = sop ? normalForm(label.text, sop)?.core : null
  const verdict = core === normalForm(label.text, label.sop).core ? 'label' : lookup(registry, label.text, core)?.verdict ?? 'unknown'
  count[verdict] = (count[verdict] ?? 0) + 1
  out.push({text: label.text, verdict})
}
writeFileSync(outFile, out.map(r => JSON.stringify(r)).join('\n') + '\n')
console.log(JSON.stringify(count))
