// How often the strategies of a run write the same circuit.
//   node tests/benchmark/syntax/agree.mjs <run-folder> [--registry <folder>]
// For every message the strategies are grouped by the core of their circuit. The report says how
// often all of them agree, how often more than half agree, and for each pair of strategies the
// share of messages with the same circuit. Where a judge has read the shared circuit (in this run
// or in the registry) it also says how often the judge accepted it: that is the figure which shows
// whether agreement can stand in for a judge.
// Prints the report and writes <run-folder>/agreement.md and <run-folder>/agreement.json.
import {writeFileSync} from 'node:fs'
import {join, resolve, basename} from 'node:path'
import {readArguments, readOutputs, readRegistry, readItems, readVerdictFiles, runVerdicts, lookup, agreementOf, renderAgreement, writeJson, defaultRegistryDir} from './lib.mjs'
// Only what a judge said counts here as a verdict: a circuit that round.mjs settled by agreement has
// none, since this report asks how far agreement can be trusted.

const {words, named} = readArguments(process.argv.slice(2))
if (!words[0]) { console.error('Usage: node tests/benchmark/syntax/agree.mjs <run-folder>'); process.exit(2) }
const runDir = resolve(words[0])
const outputs = readOutputs(runDir)
if (!outputs.length) { console.error(`No strategy file in ${runDir}: run run.mjs first.`); process.exit(1) }
const registry = readRegistry(resolve(named.registry ?? defaultRegistryDir))
const verdicts = runVerdicts(readItems(runDir), readVerdictFiles(runDir).verdicts)
const verdictOf = (text, core) => {
  const now = verdicts.get(text)?.get(core)
  if (now) return now.grade === 'L8' ? 'accepted' : 'rejected'
  const known = lookup(registry, text, core)
  return known && known.judge !== 'agreement' ? known.verdict : undefined
}
const result = agreementOf(outputs, verdictOf)
const text = `# Agreement between strategies in the run ${basename(runDir)}\n\n` + renderAgreement(result)
writeFileSync(join(runDir, 'agreement.md'), text)
writeJson(join(runDir, 'agreement.json'), {run: basename(runDir), ...result})
console.log(text)
