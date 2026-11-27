// The table of levels of a run: one row per strategy, the columns L0 to L10, the messages still
// waiting for a judge, and GOAL.
//   node tests/benchmark/syntax/table.mjs <run-folder> [--registry <folder>]
// Prints the table and writes <run-folder>/table.md and <run-folder>/table.json.
// A circuit judged in this run (a line in judging/verdicts-<k>.jsonl) counts by that verdict;
// any other circuit counts by what the registry says of it; a circuit neither has seen is waiting.
import {existsSync, writeFileSync} from 'node:fs'
import {join, resolve, basename} from 'node:path'
import {readArguments, readOutputs, readRegistry, readItems, readVerdictFiles, runVerdicts, tableOf, renderTable, readJson, writeJson, defaultRegistryDir} from './lib.mjs'

const {words, named} = readArguments(process.argv.slice(2))
if (!words[0]) { console.error('Usage: node tests/benchmark/syntax/table.mjs <run-folder>'); process.exit(2) }
const runDir = resolve(words[0])
const outputs = readOutputs(runDir)
if (!outputs.length) { console.error(`No strategy file in ${runDir}: run run.mjs first.`); process.exit(1) }
const registry = readRegistry(resolve(named.registry ?? defaultRegistryDir))
const read = readVerdictFiles(runDir)
const verdicts = runVerdicts(readItems(runDir), read.verdicts)
const table = tableOf(outputs, registry, verdicts)
const summaryFile = join(runDir, 'summary.json')
const notRun = existsSync(summaryFile) ? Object.entries(readJson(summaryFile).strategies ?? {}).filter(([, entry]) => !entry.file).map(([name, entry]) => [name, entry.status]) : []
const judgedHere = [...verdicts.values()].reduce((sum, circuits) => sum + circuits.size, 0)
const text = `# Levels of the run ${basename(runDir)}\n\n` +
  `Registry: ${registry.rows} judged circuits of ${registry.byText.size} messages. Judged in this run: ${judgedHere} circuits.\n\n` + renderTable(table, {notRun}) +
  (read.problems.length ? `\n${read.problems.length} verdict lines of this run have a format problem and are not counted: their circuits stand under "waiting". Run judging/check.mjs to see them.\n` : '')
writeFileSync(join(runDir, 'table.md'), text)
writeJson(join(runDir, 'table.json'), {run: basename(runDir), registryCircuits: registry.rows, judgedInThisRun: judgedHere, strategies: table, notRun: Object.fromEntries(notRun)})
console.log(text)
