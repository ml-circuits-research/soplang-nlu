// The table of levels of a run: one row per strategy, the columns L0 to L10, the messages still
// waiting for a judge, and GOAL.
//   node tests/benchmark/syntax/table.mjs <run-folder> [--registry <folder>] [--syntactic <folder>]
// Prints the table and writes <run-folder>/table.md and <run-folder>/table.json.
// A circuit equal to the label its message had before the run is at L9. A circuit judged in this run
// (a line in judging/verdicts-<k>.jsonl) counts by that verdict; a circuit that round.mjs settled by
// agreement counts as accepted; any other circuit counts by what the registry says of it; a circuit
// none of them has seen is waiting.
// The labels before the run are those in <run-folder>/key/labels-before.jsonl, taken when the run
// was first prepared or published; a run that has no such file yet is compared with the labels of
// now, which are the circuits in the syntactic files of the dataset.
import {existsSync, writeFileSync} from 'node:fs'
import {join, resolve, basename} from 'node:path'
import {readArguments, readOutputs, readRegistry, readRunVerdicts, readLabels, readLabelsBefore, tableOf, renderTable, readJson, writeJson,
  defaultRegistryDir, syntacticDirOf} from './lib.mjs'

const {words, named} = readArguments(process.argv.slice(2))
if (!words[0]) { console.error('Usage: node tests/benchmark/syntax/table.mjs <run-folder>'); process.exit(2) }
const runDir = resolve(words[0])
const outputs = readOutputs(runDir)
if (!outputs.length) { console.error(`No strategy file in ${runDir}: run run.mjs first.`); process.exit(1) }
const registryDir = resolve(named.registry ?? defaultRegistryDir)
const registry = readRegistry(registryDir)
// the labels of now are read once, and only when they are needed: for a run that has no labels of its own
// yet, or for a circuit that nothing else knows
let present = null
const labelsNow = () => present ??= readLabels(syntacticDirOf(registryDir, named.syntactic))
const labels = readLabelsBefore(runDir, labelsNow)
const read = readRunVerdicts(runDir), verdicts = read.verdicts
const table = tableOf(outputs, registry, verdicts, labels, labelsNow)
const summaryFile = join(runDir, 'summary.json')
const notRun = existsSync(summaryFile) ? Object.entries(readJson(summaryFile).strategies ?? {}).filter(([, entry]) => !entry.file).map(([name, entry]) => [name, entry.status]) : []
const count = by => [...verdicts.values()].reduce((sum, circuits) => sum + [...circuits.values()].filter(verdict => verdict.by === by).length, 0)
const judgedHere = count('judge'), agreedHere = count('agreement')
const texts = new Set(outputs.flatMap(output => output.rows.map(row => row.text)))
const labelled = [...texts].filter(text => labels.has(text)).length
const text = `# Levels of the run ${basename(runDir)}\n\n` +
  `Registry: ${registry.rows} judged circuits of ${registry.byText.size} messages. Judged in this run: ${judgedHere} circuits. ` +
  (agreedHere ? `Settled in this run by agreement between strategies of different families, and counted as accepted: ${agreedHere} circuits. ` : '') +
  `Before the run, ${labelled} of the ${texts.size} messages had a label.\n\n` + renderTable(table, {notRun}) +
  (read.problems.length ? `\n${read.problems.length} verdict lines of this run have a format problem and are not counted: their circuits stand under "waiting". Run judging/check.mjs to see them.\n` : '')
writeFileSync(join(runDir, 'table.md'), text)
writeJson(join(runDir, 'table.json'), {run: basename(runDir), registryCircuits: registry.rows, judgedInThisRun: judgedHere, settledByAgreementInThisRun: agreedHere, labelledBefore: labelled, strategies: table, notRun: Object.fromEntries(notRun)})
console.log(text)
