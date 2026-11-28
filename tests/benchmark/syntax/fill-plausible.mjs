// Gives the messages of a tolerant folder of the syntactic layer a plausible circuit, without a language model.
//   . ~/models/sop-nlu-trf/env.sh
//   node tests/benchmark/syntax/fill-plausible.mjs <name> [--strategy spacy] [--jobs 2] [--dry]
// Tolerant folders (owner, 2026-11-28) hold deliberately odd messages: no subject, no verb, broken-off sentences,
// agreement mismatches, scrambled order, repeated or missing words, real-word slips (syntactic/general/odd-sentences/,
// syntactic/general/real-word-variants/). Garbage in is garbage out, but people are flexible and later layers may use
// semi-garbage wires; at this level the only criterion is plausibility: every word of the message is placed on a
// syntactic key of some wire, the circuit is valid (validateSyntax) and its wires follow the message. So the circuit the
// strategy writes becomes the label when it is valid, with accepted_by "plausible"; a judge may still replace it. Rows
// that already have a label are left alone. The strategy runs through tests/benchmark/syntax/run.mjs, CPU only.
import {readFileSync, writeFileSync, mkdirSync, existsSync, rmSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {join} from 'node:path'
import {gzipSync} from 'node:zlib'
import {readCsv, packageRoot, readJsonl, readLabels, writeLabels, defaultSyntacticDir} from './lib.mjs'
import {validateSyntax} from '../../../lib/syntax.mjs'

const args = process.argv.slice(2), named = {}, names = []
for (let i = 0; i < args.length; i++) { if (args[i].startsWith('--')) named[args[i].slice(2)] = args[i + 1]?.startsWith('--') || args[i + 1] === undefined ? true : args[++i]; else names.push(args[i]) }
const [name] = names, strategy = named.strategy ?? 'spacy', jobs = Math.min(4, Number(named.jobs ?? 2))
if (!name) { console.error('Usage: node tests/benchmark/syntax/fill-plausible.mjs <name> [--strategy spacy] [--jobs 2] [--dry]'); process.exit(2) }

const labels = readLabels(defaultSyntacticDir)
const prefix = `general/${name}/`
// a message is open when its row of the folder has no sop (readLabels keeps only messages with a label)
const rows = [...labels.files.entries()].filter(([text, file]) => file.startsWith(prefix) && !labels.has(text)).map(([text]) => text)
if (!rows.length) { console.log(`${name}: no message without a label`); process.exit(0) }

const runDir = join(packageRoot, '.local-data/plausible-runs', name)
rmSync(runDir, {recursive: true, force: true}); mkdirSync(runDir, {recursive: true})
const sample = join(runDir, 'sample.json.gz')
writeFileSync(sample, gzipSync(JSON.stringify(rows.map((text, k) => ({id: `${prefix}#${k + 1}`, text})))))
const run = spawnSync('node', [join(packageRoot, 'tests/benchmark/syntax/run.mjs'), runDir, '--sample', sample, '--only', strategy, '--jobs', String(jobs), '--timeout', '60'],
  {stdio: 'inherit', env: {...process.env, CUDA_VISIBLE_DEVICES: ''}})
if (run.status !== 0) { console.error('run.mjs failed'); process.exit(1) }

const changes = new Map(), invalid = []
for (const row of readJsonl(join(runDir, `${strategy}.jsonl`))) {
  const problems = row.sop ? validateSyntax(row.text, row.sop) : [{code: 'no-circuit'}]
  if (problems.length) { invalid.push({text: row.text, problems: problems.slice(0, 3)}); continue }
  changes.set(row.text, {label: row.sop, source: strategy, accepted_by: 'plausible'})
}
writeFileSync(join(runDir, 'invalid.jsonl'), invalid.map(x => JSON.stringify(x)).join('\n') + (invalid.length ? '\n' : ''))
if (named.dry) { console.log(`${name}: ${changes.size} plausible circuits, ${invalid.length} invalid (dry run: nothing written)`); process.exit(0) }
const result = writeLabels(labels, changes)
console.log(`${name}: ${result.rows} rows labelled "plausible" in ${result.files.length} files; ${invalid.length} without a valid circuit (listed in ${join(runDir, 'invalid.jsonl')}); ${result.missing.length} not found`)
