// Merges the verdicts of a run into the registry of judged syntax circuits.
//   node tests/benchmark/syntax/judge-publish.mjs <run-folder> --tag <name> [--judge <model>] [--registry <folder>]
// Writes one new file <registry>/<tag>.jsonl and refuses to overwrite an existing one. A line is one
// judged circuit: {text, sop, core, verdict, grade, note, judge, run, source}. `sop` is the circuit
// as the judge read it and `core` is coreOf(text, sop).
// Verdict files with format problems are not published: check.mjs names the lines to correct.
// A circuit that a judge of another run has judged in the meantime is left as it is in the registry.
import {existsSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {coreOf} from '../../../lib/syntax.mjs'
import {readArguments, readRegistry, readItems, readVerdictFiles, lookup, isConverted, writeJsonl, defaultRegistryDir} from './lib.mjs'

const {words, named} = readArguments(process.argv.slice(2))
if (!words[0] || typeof named.tag !== 'string') { console.error('Usage: node tests/benchmark/syntax/judge-publish.mjs <run-folder> --tag <name> [--judge <model>]'); process.exit(2) }
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(named.tag) || named.tag.startsWith('convert-nlu')) { console.error('A tag is made of letters, digits, ".", "_" and "-", and does not start with "convert-nlu".'); process.exit(2) }
const runDir = resolve(words[0]), registryDir = resolve(named.registry ?? defaultRegistryDir)
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
const rows = []
let waiting = 0, alreadySame = 0, alreadyOther = 0, replaced = 0
for (const item of items) {
  const verdict = verdicts.get(item.n)
  if (!verdict) { waiting++; continue }
  const accepted = verdict.grade === 'L8'
  const known = lookup(registry, item.text, item.core)
  if (known && !isConverted(known)) { if ((known.verdict === 'accepted') === accepted) alreadySame++; else alreadyOther++; continue }
  if (known) replaced++
  rows.push({text: item.text, sop: item.sop, core: coreOf(item.text, item.sop), verdict: accepted ? 'accepted' : 'rejected', grade: verdict.grade, note: verdict.note,
    judge, run: named.tag, source: item.sources.includes('reference') ? 'reference' : item.sources.join('+')})
}
console.log(`${items.length} prepared circuits: ${verdicts.size} judged, ${waiting} still waiting for a judge.`)
if (alreadySame + alreadyOther) console.log(`${alreadySame + alreadyOther} were judged by another run in the meantime and are left as they are (${alreadySame} with the same verdict, ${alreadyOther} with the other one).`)
if (!rows.length) { console.log('Nothing new to publish.'); process.exit(0) }
writeJsonl(file, rows)
const accepted = rows.filter(row => row.verdict === 'accepted').length
console.log(`Published ${rows.length} circuits to ${file}: ${accepted} accepted, ${rows.length - accepted} rejected` + (replaced ? `; ${replaced} of them are reference circuits now read by a judge` : '') + `. Judge: ${judge}.`)
if (judge === 'unknown') console.log('No --judge was given: the lines say "judge": "unknown".')
