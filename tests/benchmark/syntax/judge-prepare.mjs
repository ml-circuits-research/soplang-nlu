// Prepares the circuits of a run for a judge.
//   node tests/benchmark/syntax/judge-prepare.mjs <run-folder> [--size 200] [--registry <folder>] [--syntactic <folder>]
// The registry is webmeet-dataset/annotations/syntax/v1/judged/ and the labels are the circuits in
// the syntactic files of that dataset, webmeet-dataset/syntactic/. A registry named for a trial with
// --registry <folder> takes its labels from <folder>/../syntactic.
// Every circuit of every strategy file is looked up by its message and its core. A circuit the
// registry holds is settled, and so is a circuit equal to the label of its message, whether a judge
// accepted that label or formalizers agreed on it. The others are collected once per message and
// core, whatever number of strategies wrote them, and written for the judge:
//   <run-folder>/judging/packet-<k>.jsonl   lines {n, text, sop}: nothing tells which strategy wrote a circuit
//   <run-folder>/judging/RULES.md           the rules the judge follows
//   <run-folder>/judging/check.mjs          checks the judge's verdicts-<k>.jsonl
//   <run-folder>/key/items.jsonl            not for the judge: which strategies wrote circuit n
//   <run-folder>/key/labels-before.jsonl    the labels the messages of this run had before the run
// Calling it again keeps the numbers already given and adds new packets for circuits that are new.
import {join, resolve, relative} from 'node:path'
import {readArguments, readOutputs, readRegistry, collectItems, lookup, readItems, writeJudging, judgingDir,
  readLabels, keepLabelsBefore, defaultRegistryDir, syntacticDirOf} from './lib.mjs'

const {words, named} = readArguments(process.argv.slice(2))
if (!words[0]) { console.error('Usage: node tests/benchmark/syntax/judge-prepare.mjs <run-folder> [--size 200]'); process.exit(2) }
const runDir = resolve(words[0]), folder = judgingDir(runDir), size = Number(named.size ?? 200)
const registryDir = resolve(named.registry ?? defaultRegistryDir)
const registry = readRegistry(registryDir)
const outputs = readOutputs(runDir)
if (!outputs.length) { console.error(`No strategy file in ${runDir}: run run.mjs first.`); process.exit(1) }

const labels = readLabels(syntacticDirOf(registryDir, named.syntactic))
const texts = new Set(outputs.flatMap(output => output.rows.map(row => row.text)))
keepLabelsBefore(runDir, labels, texts)
const earlier = readItems(runDir)
const {items, added} = collectItems(outputs, registry, {earlier, labels})
const packets = writeJudging(runDir, items, added, size)

console.log(`Registry: ${registry.rows} judged circuits of ${registry.byText.size} messages, in ${registry.files.length} files` + (registry.ignored ? `; ${registry.ignored} lines ignored (no valid circuit or no verdict)` : '') + `. ${[...texts].filter(text => labels.has(text)).length} of the ${texts.size} messages of this run have a label.`)
console.log('| Strategy | Messages | No valid circuit | Equal to the label | Already accepted | Already rejected | Needs a judge |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: |')
for (const {strategy, rows} of outputs) {
  const count = {none: 0, label: 0, accepted: 0, rejected: 0, judge: 0}
  for (const row of rows) count[!row.core ? 'none' : labels.get(row.text)?.core === row.core ? 'label' : lookup(registry, row.text, row.core)?.verdict ?? 'judge']++
  console.log(`| ${strategy} | ${rows.length} | ${count.none} | ${count.label} | ${count.accepted} | ${count.rejected} | ${count.judge} |`)
}
console.log(`${items.length} distinct circuits need a judge in this run: ${earlier.length} were prepared before, ${added.length} are new.`)
console.log(packets.length ? `New packets: ${packets.map(([name, lines]) => `${name} (${lines})`).join(', ')} in ${relative(process.cwd(), folder)}` : 'No new packet.')
if (items.length) console.log(`A judge reads RULES.md and one packet, writes verdicts-<k>.jsonl beside it, and checks it with: node ${relative(process.cwd(), join(folder, 'check.mjs'))} <k>`)
