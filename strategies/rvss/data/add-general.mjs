// rvss data: the general corpora of the dataset (syntactic/general/<name>/, no semantic file) added to the training
// sets with spaCy's circuits, keeping every webmeet line, split and exclusion as the sets hold them.
//
//   node strategies/rvss/data/add-general.mjs --run <run.jsonl of run-spacy.mjs --dir syntactic/general> --commit <c>
//        [--in <folder with distill/mixed.jsonl.gz>] [--out <folder>] [--share 0.05] [--dataset <webmeet-dataset>]
//
// Every message of the run with a circuit becomes a line {text, file, row, area: general/<folder>, split, sop, origin: "general",
// source: "spacy@<commit>", judged} appended to distill.jsonl.gz and mixed.jsonl.gz (the general corpora have no
// labels yet). split: "dev-G" for the files held out to measure generality outside webmeet, else "train". dev-G is,
// in every folder of syntactic/general, the round(files x share) files (at least one) with the smallest
// sha1("general/<folder>/<file>"): whole files, every corpus represented.
// Left out (excluded-general.jsonl.gz, with why): a text that is, without case and runs of spaces, equal to a text
// already in the sets or within one character edit of a benchmark text (the old benchmark, 1,831 messages) or of a
// dev-B text, so neither held-out set leaks into training. Writes <out>/{distill,mixed}.jsonl.gz,
// excluded-general.jsonl.gz, general.json (counts by folder and split, the dev-G files).
import {createReadStream, writeFileSync, mkdirSync} from 'node:fs'
import {createInterface} from 'node:readline'
import {createGunzip, gzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const repo = resolve(fileURLToPath(import.meta.url), '../../../..')
const args = process.argv.slice(2)
const opt = (name, fallback) => { const at = args.indexOf('--' + name); return at >= 0 ? args[at + 1] : fallback }
const run = resolve(opt('run')), commit = opt('commit')
const input = resolve(opt('in', join(repo, '.local-data/rvss')))
const out = resolve(opt('out', join(repo, '.local-data/rvss/at-' + commit + 'g')))
const share = Number(opt('share', 0.05))
const dataset = resolve(opt('dataset', join(repo, '../webmeet-dataset')))
const {readRegistry, lookup, normalForm, readSample} = await import(join(repo, 'tests/benchmark/syntax/lib.mjs'))
const {wordsOf} = await import(join(repo, 'lib/syntax.mjs'))
const {nearIndex, nearMatch, squash, benchmarkDir} = await import(join(repo, 'strategies/rvss/eval/common.mjs'))
mkdirSync(out, {recursive: true})
const datasetCommit = execFileSync('git', ['-C', dataset, 'rev-parse', '--short', 'HEAD'], {encoding: 'utf8'}).trim()
const linesOf = file => { const s = createReadStream(file); return createInterface({input: file.endsWith('.gz') ? s.pipe(createGunzip()) : s, crlfDelay: Infinity}) }
const readAll = async file => { const all = []; for await (const l of linesOf(file)) if (l) all.push(JSON.parse(l)); return all }
const gz = (file, lines) => writeFileSync(join(out, file), gzipSync(lines.map(l => JSON.stringify(l)).join('\n') + '\n'))

const distill = await readAll(join(input, 'distill.jsonl.gz'))
const mixed = await readAll(join(input, 'mixed.jsonl.gz'))
const seen = new Set(mixed.map(o => squash(o.text)))
const bench = nearIndex(readSample(join(benchmarkDir, 'sample.json.gz')).map(m => m.text))
const devB = nearIndex(distill.filter(o => o.split === 'dev-B').map(o => o.text))
const registry = readRegistry(join(dataset, 'annotations/syntax/v1/judged'))

const general = await readAll(run)
const folderOf = file => file.split('/')[1]
const hashOf = file => createHash('sha1').update(file).digest('hex')
const filesByFolder = {}
for (const m of general) (filesByFolder[folderOf(m.file)] ??= new Set()).add(m.file)
const devFiles = new Set()
for (const [folder, files] of Object.entries(filesByFolder)) {
  const sorted = [...files].sort((a, b) => hashOf(a) < hashOf(b) ? -1 : 1)
  sorted.slice(0, Math.max(1, Math.round(sorted.length * share))).forEach(f => devFiles.add(f))
}
const bucket = n => n < 10 ? '<10' : n < 25 ? '10-24' : n < 40 ? '25-39' : '40+'
const count = {run: general.length, noCircuit: 0, noCircuitExamples: [], excluded: {}, added: {}, byLength: {}, judged: {}}
const inc = (o, k) => { o[k] = (o[k] ?? 0) + 1 }
const excluded = [], added = []
for (const m of general) {
  const folder = folderOf(m.file), split = devFiles.has(m.file) ? 'dev-G' : 'train'
  if (!m.sop) { count.noCircuit++; if (count.noCircuitExamples.length < 10) count.noCircuitExamples.push({file: m.file, row: m.row, text: m.text, error: m.error}); continue }
  const s = squash(m.text)
  const why = seen.has(s) ? 'copy of a line in the sets' : nearMatch(bench, m.text) ? 'benchmark ' + nearMatch(bench, m.text) : nearMatch(devB, m.text) ? 'dev-B ' + nearMatch(devB, m.text) : null
  if (why) { excluded.push({file: m.file, row: m.row, text: m.text, why}); inc(count.excluded, why); continue }
  seen.add(s)
  let core = null; try { core = normalForm(m.text, m.sop)?.core ?? null } catch {}
  const judged = lookup(registry, m.text, core)?.verdict ?? null
  if (judged) inc(count.judged, split + ' ' + judged)
  added.push({text: m.text, file: m.file, row: m.row, area: 'general/' + folder, split, sop: m.sop, origin: 'general', source: 'spacy@' + commit, judged})
  inc(count.added, folder + ' ' + split); inc(count.byLength, split + ' ' + bucket(wordsOf(m.text).length))
}
// how close dev-G stays to the general training lines: dev-G texts within one edit of a general training text
const generalTrain = nearIndex(added.filter(o => o.split === 'train').map(o => o.text))
count.devGNearTrain = added.filter(o => o.split === 'dev-G' && nearMatch(generalTrain, o.text)).length
gz('distill.jsonl.gz', [...distill, ...added])
gz('mixed.jsonl.gz', [...mixed, ...added])
gz('excluded-general.jsonl.gz', excluded)
const result = {built: new Date().toISOString(), commit, datasetCommit, run, input, share,
  rule: 'dev-G = in every folder of syntactic/general, the max(1, round(files x share)) files with the smallest sha1("general/<folder>/<file>")',
  devGFiles: [...devFiles].sort(), filesByFolder: Object.fromEntries(Object.entries(filesByFolder).map(([k, v]) => [k, v.size])),
  ...count, addedAll: added.length, webmeetLines: distill.length}
writeFileSync(join(out, 'general.json'), JSON.stringify(result, null, 1) + '\n')
console.log(JSON.stringify({...result, devGFiles: result.devGFiles.length}, null, 1))
