// Prepares the circuits of a run for a judge.
//   node tests/benchmark/syntax/judge-prepare.mjs <run-folder> [--size 200] [--audit-references] [--registry <folder>]
// Every circuit of every strategy file is looked up in the registry by its message and its core.
// A circuit the registry already holds is settled. The others are collected once per message and
// core, whatever number of strategies wrote them, and written for the judge:
//   <run-folder>/judging/packet-<k>.jsonl   lines {n, text, sop}: nothing tells which strategy wrote a circuit
//   <run-folder>/judging/RULES.md           the rules the judge follows
//   <run-folder>/judging/check.mjs          checks the judge's verdicts-<k>.jsonl
//   <run-folder>/key/items.jsonl            not for the judge: which strategies wrote circuit n
// Calling it again keeps the numbers already given and adds new packets for circuits that are new.
// --audit-references also sends the reference circuits rewritten from older `nlu` references, for
// the messages that have a circuit to judge. Until a judge has read them in this schema they count
// as accepted; a judge who rejects one opens level L10 for the strategies that got the message right.
import {copyFileSync, existsSync, mkdirSync} from 'node:fs'
import {join, resolve, relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {readArguments, readOutputs, readRegistry, collectItems, packetsOf, lookup, readItems, writeJsonl, itemsFile, judgingDir, defaultRegistryDir} from './lib.mjs'
import {packetNumbers} from './check.mjs'

const {words, named} = readArguments(process.argv.slice(2))
if (!words[0]) { console.error('Usage: node tests/benchmark/syntax/judge-prepare.mjs <run-folder> [--size 200] [--audit-references]'); process.exit(2) }
const runDir = resolve(words[0]), folder = judgingDir(runDir), size = Number(named.size ?? 200)
const registry = readRegistry(resolve(named.registry ?? defaultRegistryDir))
const outputs = readOutputs(runDir)
if (!outputs.length) { console.error(`No strategy file in ${runDir}: run run.mjs first.`); process.exit(1) }

const earlier = readItems(runDir)
const {items, added} = collectItems(outputs, registry, {earlier, auditReferences: Boolean(named['audit-references'])})
mkdirSync(folder, {recursive: true})
writeJsonl(itemsFile(runDir), items)
const firstPacket = Math.max(0, ...packetNumbers(folder)) + 1
const packets = packetsOf(added, size)
packets.forEach((packet, index) => writeJsonl(join(folder, `packet-${firstPacket + index}.jsonl`), packet))
copyFileSync(fileURLToPath(new URL('./rules.md', import.meta.url)), join(folder, 'RULES.md'))
copyFileSync(fileURLToPath(new URL('./check.mjs', import.meta.url)), join(folder, 'check.mjs'))

console.log(`Registry: ${registry.rows} judged circuits of ${registry.byText.size} messages, in ${registry.files.length} files` + (registry.ignored ? `; ${registry.ignored} lines ignored (no valid circuit or no verdict)` : ''))
console.log('| Strategy | Messages | No valid circuit | Settled: accepted | Settled: rejected | Needs a judge |\n| --- | ---: | ---: | ---: | ---: | ---: |')
for (const {strategy, rows} of outputs) {
  const count = {none: 0, accepted: 0, rejected: 0, judge: 0}
  for (const row of rows) count[!row.core ? 'none' : lookup(registry, row.text, row.core)?.verdict ?? 'judge']++
  console.log(`| ${strategy} | ${rows.length} | ${count.none} | ${count.accepted} | ${count.rejected} | ${count.judge} |`)
}
const references = added.filter(item => item.sources.includes('reference')).length
console.log(`${items.length} distinct circuits need a judge in this run: ${earlier.length} were prepared before, ${added.length} are new` + (references ? ` (${references} of them reference circuits to audit)` : '') + '.')
console.log(packets.length ? `New packets: ${packets.map((packet, index) => `packet-${firstPacket + index}.jsonl (${packet.length})`).join(', ')} in ${relative(process.cwd(), folder)}` : 'No new packet.')
if (existsSync(folder) && items.length) console.log(`A judge reads RULES.md and one packet, writes verdicts-<k>.jsonl beside it, and checks it with: node ${relative(process.cwd(), join(folder, 'check.mjs'))} <k>`)
