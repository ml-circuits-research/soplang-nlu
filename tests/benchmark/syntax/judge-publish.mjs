// Merges the verdicts of a run into the dataset: the registry of judged circuits and the labels.
//   node tests/benchmark/syntax/judge-publish.mjs <run-folder> --tag <name> [--judge <model>] [--registry <folder>] [--syntactic <folder>]
// Registry: writes one new file <registry>/<tag>.jsonl and refuses to overwrite an existing one. A
// line is one judged circuit: {text, sop, core, verdict, grade, note, judge, run, source}. `sop` is
// the circuit as the judge read it and `core` is coreOf(text, sop).
// Labels: the label of a message is the circuit in its row of the dataset's syntactic files. Every
// circuit accepted in this run is written there: the cells sop, source (the strategies that wrote
// it, joined by +) and accepted_by "judge" of the message's row. It replaces whatever the row held,
// also a circuit settled by agreement. One label per message: when the judge accepted several
// circuits of a message, the one most strategies wrote, then the first. Only the files that change
// are written, and in them only the rows of these messages.
// The syntactic files are those of the dataset the registry stands in; a registry named for a trial
// takes <registry>/../syntactic, unless --syntactic names another folder.
// Verdict files with format problems are not published: check.mjs names the lines to correct.
// A circuit that the registry already holds, from an earlier call or from another run, is left as it is.
import {existsSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {coreOf} from '../../../lib/syntax.mjs'
import {readArguments, readRegistry, readItems, readVerdictFiles, lookup, writeJsonl, readJsonl, readJson, readLabels, writeLabels, labelChanges, keepLabelsBefore,
  defaultRegistryDir, syntacticDirOf} from './lib.mjs'

const {words, named} = readArguments(process.argv.slice(2))
if (!words[0] || typeof named.tag !== 'string') { console.error('Usage: node tests/benchmark/syntax/judge-publish.mjs <run-folder> --tag <name> [--judge <model>]'); process.exit(2) }
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(named.tag)) { console.error('A tag is made of letters, digits, ".", "_" and "-".'); process.exit(2) }
const runDir = resolve(words[0]), registryDir = resolve(named.registry ?? defaultRegistryDir), syntacticDir = syntacticDirOf(registryDir, named.syntactic)
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
// the labels the messages of this run had before it are kept in the run folder: the table of the run needs them
const labels = readLabels(syntacticDir)
keepLabelsBefore(runDir, labels, () => {
  const summary = join(runDir, 'summary.json')
  const files = existsSync(summary) ? Object.values(readJson(summary).strategies ?? {}).map(entry => entry.file).filter(Boolean) : []
  return [...items.map(item => item.text), ...files.filter(name => existsSync(join(runDir, name))).flatMap(name => readJsonl(join(runDir, name)).map(row => row.text))]
})
writeJsonl(file, rows)
console.log(`Published ${rows.length} circuits to ${file}: ${accepted.length} accepted, ${rows.length - accepted.length} rejected. Judge: ${judge}.`)
if (judge === 'unknown') console.log('No --judge was given: the lines say "judge": "unknown".')

const {changes, first, replaced} = labelChanges(labels, accepted)
const agreed = [...changes.keys()].filter(text => labels.get(text)?.accepted_by === 'agreement').length
const written = writeLabels(labels, changes)
const set = changes.size - written.missing.length
console.log(`Labels: ${set} messages got the circuit accepted in this run as their label (${first - written.missing.length} had no label, ${replaced} had another one` +
  (agreed ? `, of which ${agreed} a circuit settled by agreement` : '') + `). ${written.files.length} files of ${syntacticDir} were written.`)
if (written.missing.length) console.log(`${written.missing.length} messages with an accepted circuit have no row in the syntactic files, so they have no label: ${written.missing.slice(0, 5).map(text => JSON.stringify(text)).join(', ')}${written.missing.length > 5 ? ', …' : ''}`)
