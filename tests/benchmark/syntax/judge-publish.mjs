// Merges the verdicts of a run into the dataset: the registry of judged circuits and the labels.
//   node tests/benchmark/syntax/judge-publish.mjs <run-folder> --tag <name> [--judge <model>] [--registry <folder>] [--labels <file>]
// Registry: writes one new file <registry>/<tag>.jsonl and refuses to overwrite an existing one. A
// line is one judged circuit: {text, sop, core, verdict, grade, note, judge, run, source}. `sop` is
// the circuit as the judge read it and `core` is coreOf(text, sop).
// Labels: every circuit accepted in this run becomes the label of its message in labels.jsonl,
// whatever label the message had. One label per message: when the judge accepted several circuits
// of a message, the one most strategies wrote, then the first.
// The labels file is labels.jsonl beside the registry folder, unless --labels names another.
// Verdict files with format problems are not published: check.mjs names the lines to correct.
// A circuit that the registry already holds, from an earlier call or from another run, is left as it is.
import {existsSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {coreOf} from '../../../lib/syntax.mjs'
import {readArguments, readRegistry, readItems, readVerdictFiles, lookup, writeJsonl, readLabels, writeLabels, updateLabels, keepLabelsBefore,
  defaultRegistryDir, labelsFileOf} from './lib.mjs'

const {words, named} = readArguments(process.argv.slice(2))
if (!words[0] || typeof named.tag !== 'string') { console.error('Usage: node tests/benchmark/syntax/judge-publish.mjs <run-folder> --tag <name> [--judge <model>]'); process.exit(2) }
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(named.tag)) { console.error('A tag is made of letters, digits, ".", "_" and "-".'); process.exit(2) }
const runDir = resolve(words[0]), registryDir = resolve(named.registry ?? defaultRegistryDir), labelsFile = labelsFileOf(registryDir, named.labels)
const file = join(registryDir, named.tag + '.jsonl')
if (existsSync(file)) { console.error(`The registry already holds ${file}: choose another --tag.`); process.exit(1) }
const items = readItems(runDir)
if (!items.length) { console.error(`No prepared circuits in ${runDir}: run judge-prepare.mjs first.`); process.exit(1) }

const read = readVerdictFiles(runDir)
for (const problem of read.problems) console.error(problem)
if (read.problems.length) { console.error(`${read.problems.length} format problems: nothing published. Correct the lines and call again.`); process.exit(1) }

const verdicts = new Map(read.verdicts.map(verdict => [verdict.n, verdict]))
const registry = readRegistry(registryDir)
const judge = typeof named.judge === 'string' ? named.judge : 'unknown'
const rows = [], accepted = []
let waiting = 0, alreadySame = 0, alreadyOther = 0
for (const item of items) {
  const verdict = verdicts.get(item.n)
  if (!verdict) { waiting++; continue }
  const good = verdict.grade === 'L8'
  const known = lookup(registry, item.text, item.core)
  if (known) { if ((known.verdict === 'accepted') === good) alreadySame++; else alreadyOther++; continue }
  rows.push({text: item.text, sop: item.sop, core: coreOf(item.text, item.sop), verdict: good ? 'accepted' : 'rejected', grade: verdict.grade, note: verdict.note,
    judge, run: named.tag, source: item.sources.join('+')})
  if (good) accepted.push(item)
}
console.log(`${items.length} prepared circuits: ${verdicts.size} judged, ${waiting} still waiting for a judge.`)
if (alreadySame + alreadyOther) console.log(`${alreadySame + alreadyOther} are already in the registry and are left as they are (${alreadySame} with the same verdict, ${alreadyOther} with the other one).`)
if (!rows.length) { console.log('Nothing new to publish.'); process.exit(0) }
// the labels as they were before this run are kept in the run folder: the table of the run needs them
keepLabelsBefore(runDir, labelsFile)
writeJsonl(file, rows)
console.log(`Published ${rows.length} circuits to ${file}: ${accepted.length} accepted, ${rows.length - accepted.length} rejected. Judge: ${judge}.`)
if (judge === 'unknown') console.log('No --judge was given: the lines say "judge": "unknown".')

const labels = readLabels(labelsFile)
const change = updateLabels(labels, accepted, named.tag)
if (change.set) writeLabels(labelsFile, labels)
console.log(`Labels: ${change.set} messages got the circuit accepted in this run as their label (${change.first} had no label, ${change.replaced} had another one). ${labelsFile} now holds ${labels.size} labels.`)
