// Merges the verdicts of a run into the dataset: the registry of judged circuits and the labels.
//   node tests/benchmark/syntax/judge-publish.mjs <run-folder> --tag <name> [--judge <model>] [--rejudged-only] [--registry <folder>] [--syntactic <folder>]
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
// A circuit that the registry already holds, from an earlier call or from another run, is left as it is,
// unless it was judged again:
// Circuits judged again (rejudge.mjs prepare): of the items of one circuit the newest counts, and its verdict is
// published once it is written. A line that replaces the registry's earlier decision on the circuit names that
// line's file in `supersedes`. The labels change only where they must (rejudgedLabelChanges in lib.mjs): a label
// the judge now rejects is replaced by another accepted circuit of the message, or emptied when there is none; a
// message with no label gets the circuit the judge now accepts; a label settled by agreement that the judge now
// accepts becomes accepted_by "judge". --rejudged-only publishes the circuits judged again and nothing else.
import {existsSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {readArguments, readRegistry, addToRegistry, readItems, readVerdictFiles, readAgreement, runVerdicts, publication, lookup, writeJsonl, readJsonl, readJson,
  readLabels, writeLabels, labelChanges, labelLine, rejudgedLabelChanges, acceptedCircuitsOf, keepLabelsBefore, defaultRegistryDir, syntacticDirOf} from './lib.mjs'

const {words, named} = readArguments(process.argv.slice(2))
if (!words[0] || typeof named.tag !== 'string') { console.error('Usage: node tests/benchmark/syntax/judge-publish.mjs <run-folder> --tag <name> [--judge <model>] [--rejudged-only]'); process.exit(2) }
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(named.tag)) { console.error('A tag is made of letters, digits, ".", "_" and "-".'); process.exit(2) }
const runDir = resolve(words[0]), registryDir = resolve(named.registry ?? defaultRegistryDir), syntacticDir = syntacticDirOf(registryDir, named.syntactic)
const fileName = named.tag + '.jsonl', file = join(registryDir, fileName)
if (existsSync(file)) { console.error(`The registry already holds ${file}: choose another --tag.`); process.exit(1) }
const items = readItems(runDir)
if (!items.length) { console.error(`No prepared circuits in ${runDir}: run judge-prepare.mjs first.`); process.exit(1) }

const read = readVerdictFiles(runDir)
for (const problem of read.problems) console.error(problem)
if (read.problems.length) { console.error(`${read.problems.length} format problems: nothing published. Correct the lines and call again.`); process.exit(1) }

// the newest verdict of every circuit of the run; the circuits settled by agreement only serve to find another label
const verdicts = runVerdicts(items, read.verdicts, readAgreement(runDir))
const registry = readRegistry(registryDir)
const judge = typeof named.judge === 'string' ? named.judge : 'unknown'
const {rows, accepted, rejudged, counts} = publication(items, verdicts, registry, {tag: named.tag, judge, rejudgedOnly: Boolean(named['rejudged-only'])})
const circuits = new Set(items.map(item => item.text + '\0' + item.core)).size
console.log(`${circuits} prepared circuits: ${counts.judged} judged, ${counts.waiting + counts.waitingAgain} still waiting for a judge` +
  (counts.waitingAgain ? ` (${counts.waitingAgain} of them judged again, whose new verdict is not written yet: the earlier verdict is not published meanwhile)` : '') + '.' +
  (counts.left ? ` --rejudged-only: ${counts.left} circuits that were not judged again are left out.` : ''))
if (counts.alreadySame + counts.alreadyOther) console.log(`${counts.alreadySame + counts.alreadyOther} are already in the registry and are left as they are (${counts.alreadySame} with the same verdict, ${counts.alreadyOther} with the other one).`)
if (counts.newer) console.log(`${counts.newer} circuits judged again have a later decision in the registry than the one they were judged again against, and are left as they are.`)
if (!rows.length) { console.log('Nothing new to publish.'); process.exit(0) }
// the labels the messages of this run had before it are kept in the run folder: the table of the run needs them
const labels = readLabels(syntacticDir)
keepLabelsBefore(runDir, labels, () => {
  const summary = join(runDir, 'summary.json')
  const files = existsSync(summary) ? Object.values(readJson(summary).strategies ?? {}).map(entry => entry.file).filter(Boolean) : []
  return [...items.map(item => item.text), ...files.filter(name => existsSync(join(runDir, name))).flatMap(name => readJsonl(join(runDir, name)).map(row => row.text))]
})
writeJsonl(file, rows)
console.log(`Published ${rows.length} circuits to ${file}: ${rows.filter(row => row.verdict === 'accepted').length} accepted, ${rows.filter(row => row.verdict === 'rejected').length} rejected. Judge: ${judge}.`)
if (rejudged.length) console.log(`Of them, ${rejudged.length} were judged again: ${rejudged.filter(item => item.grade === 'L8').length} accepted, ${rejudged.filter(item => item.grade !== 'L8').length} rejected; ${counts.superseding} lines supersede the registry's earlier decision.`)
if (judge === 'unknown') console.log('No --judge was given: the lines say "judge": "unknown".')

const {changes, first, replaced} = labelChanges(labels, accepted)
const agreed = [...changes.keys()].filter(text => labels.get(text)?.accepted_by === 'agreement').length
// A circuit settled by agreement that another accepted circuit replaces as the label is still an accepted reading,
// and no other file holds it once the syntactic cell changes: it goes to the registry, marked as agreement.
// One this run's judge rejected is not kept: the rejection is the newer decision.
const rejectedNow = new Set(rows.filter(row => row.verdict === 'rejected').map(row => row.text + '\u0000' + row.core))
const kept = [...changes.keys()].map(text => labels.get(text))
  .filter(old => old?.accepted_by === 'agreement' && !lookup(registry, old.text, old.core) && !rejectedNow.has(old.text + '\u0000' + old.core))
  .map(old => ({text: old.text, sop: old.label, core: old.core, verdict: 'accepted', grade: 'L8', judge: 'agreement', run: named.tag, source: old.source,
    note: 'settled by agreement and written as the label without a judge; replaced as the label by a circuit a judge accepted in ' + named.tag}))
if (kept.length) {
  const keptFile = join(dirname(file), named.tag + '-replaced-agreement.jsonl')
  writeJsonl(keptFile, kept)
  console.log(`${kept.length} circuits settled by agreement were replaced as labels; they are kept as accepted readings in ${keptFile}.`)
}
// the circuits judged again change the labels as they stand after the circuits accepted the first time, with the
// registry as this publication leaves it
for (const row of rows) addToRegistry(registry, row, fileName)
const afterFirst = new Map(labels)
for (const [text, line] of changes) afterFirst.set(text, labelLine(line))
const again = rejudgedLabelChanges(afterFirst, rejudged, text => acceptedCircuitsOf(text, verdicts, registry))
const all = new Map([...changes, ...again.changes])
const written = writeLabels(labels, all)
const missing = new Set(written.missing)
const set = [...changes.keys()].filter(text => !missing.has(text)).length
const sentences = []
if (changes.size || !again.changes.size) sentences.push(`Labels: ${set} messages got the circuit accepted in this run as their label (${first - [...changes.keys()].filter(text => missing.has(text)).length} had no label, ${replaced} had another one` +
  (agreed ? `, of which ${agreed} a circuit settled by agreement` : '') + `).`)
if (again.changes.size) sentences.push(`Labels after judging again: ${again.replaced} labels the judge now rejects were replaced by another accepted circuit, ${again.cleared} were emptied (no accepted circuit is left, so the message is open again), ` +
  `${again.confirmed} labels settled by agreement were accepted by the judge, ${again.filled} messages with no label got the circuit the judge now accepts.`)
console.log(`${sentences.join(' ')} ${written.files.length} files of ${syntacticDir} were written.`)
if (written.missing.length) console.log(`${written.missing.length} messages with an accepted circuit have no row in the syntactic files, so they have no label: ${written.missing.slice(0, 5).map(text => JSON.stringify(text)).join(', ')}${written.missing.length > 5 ? ', …' : ''}`)
