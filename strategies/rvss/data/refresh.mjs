// rvss data: the training sets with the circuits of a newer spaCy writer, keeping every message, split and
// benchmark exclusion of the sets as they are (build-sets.mjs is not run again, so a dataset that moved since does
// not move the split or the exclusions).
//
//   node strategies/rvss/data/refresh.mjs --rewritten <rewritten-<commit>.jsonl> --commit <commit>
//        [--in <folder with distill/mixed.jsonl.gz>] [--out <folder>] [--dataset <webmeet-dataset>]
//
// For every line of <in>/distill.jsonl.gz: the circuit of the same message in the rewritten file replaces `sop`. Messages
// are found by their text only (texts are unique in the dataset; after the re-split of 2026-11-28 file names and rows
// changed, so they are never used as keys); `file` and `row` stay as the sets hold them, as information; `source` becomes spacy@<commit>; `judged` is the registry's newest decision on the new circuit
// (dataset at HEAD). A message whose new circuit is missing (the writer fails) is dropped and counted. The spaCy lines
// of mixed.jsonl.gz (origin spacy) are replaced the same way; label lines stay as they are and their `spacySame` is
// recomputed against the new circuit. Writes <out>/distill.jsonl.gz, mixed.jsonl.gz, spacy-silver.jsonl.gz and
// refresh.json (counts: lines whose circuit changed as written and in the normal-form core, by split and length).
import {createReadStream, writeFileSync, mkdirSync, readFileSync} from 'node:fs'
import {createInterface} from 'node:readline'
import {createGunzip, gzipSync} from 'node:zlib'
import {execFileSync} from 'node:child_process'
import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const repo = resolve(fileURLToPath(import.meta.url), '../../../..')
const args = process.argv.slice(2)
const opt = (name, fallback) => { const at = args.indexOf('--' + name); return at >= 0 ? args[at + 1] : fallback }
const rewritten = resolve(opt('rewritten')), commit = opt('commit')
const input = resolve(opt('in', join(repo, '.local-data/rvss')))
const out = resolve(opt('out', join(repo, '.local-data/rvss/at-' + commit)))
const dataset = resolve(opt('dataset', join(repo, '../webmeet-dataset')))
const {readRegistry, lookup, normalForm} = await import(join(repo, 'tests/benchmark/syntax/lib.mjs'))
const {wordsOf} = await import(join(repo, 'lib/syntax.mjs'))
mkdirSync(out, {recursive: true})
const datasetCommit = execFileSync('git', ['-C', dataset, 'rev-parse', '--short', 'HEAD'], {encoding: 'utf8'}).trim()
const linesOf = file => { const s = createReadStream(file); return createInterface({input: file.endsWith('.gz') ? s.pipe(createGunzip()) : s, crlfDelay: Infinity}) }
const gz = (file, lines) => writeFileSync(join(out, file), gzipSync(lines.map(l => JSON.stringify(l)).join('\n') + '\n'))

const now = new Map(); const silver = []
for await (const line of linesOf(rewritten)) {
  if (!line) continue
  const r = JSON.parse(line)
  now.set(r.text, r); silver.push({text: r.text, file: r.file, row: r.row, sop: r.sop, error: r.error, ms: r.ms ?? null})
}
gz('spacy-silver.jsonl.gz', silver); silver.length = 0
const registry = readRegistry(join(dataset, 'annotations/syntax/v1/judged'))
const core = (text, sop) => { try { return normalForm(text, sop)?.core ?? null } catch { return null } }
const bucket = n => n < 10 ? '<10' : n < 25 ? '10-24' : n < 40 ? '25-39' : '40+'
const count = {lines: 0, dropped: 0, droppedExamples: [], written: {}, core: {}, total: {}, judged: {}}
const inc = (o, k) => { o[k] = (o[k] ?? 0) + 1 }
const coreCache = new Map()
const distill = []
for await (const line of linesOf(join(input, 'distill.jsonl.gz'))) {
  const o = JSON.parse(line); count.lines++
  const r = now.get(o.text)
  if (!r?.sop) { count.dropped++; if (count.droppedExamples.length < 5) count.droppedExamples.push({file: o.file, row: o.row, error: r?.error}); continue }
  const k = o.split + ' ' + bucket(wordsOf(o.text).length)
  inc(count.total, k)
  const cNew = core(o.text, r.sop)
  coreCache.set(o.text, cNew)
  if (r.sop !== o.sop) { inc(count.written, k); if (cNew !== core(o.text, o.sop)) inc(count.core, k) }
  const decided = lookup(registry, o.text, cNew)
  const n = {...o, sop: r.sop, source: 'spacy@' + commit, judged: decided?.verdict ?? null}
  inc(count.judged, o.split + ' ' + (n.judged ?? 'unjudged'))
  distill.push(n)
}
gz('distill.jsonl.gz', distill)
const byKey = new Map(distill.map(d => [d.text, d])); distill.length = 0
const mixed = []; const mcount = {lines: 0, spacyReplaced: 0, spacyDropped: 0, labels: 0, spacySameBefore: 0, spacySameNow: 0}
for await (const line of linesOf(join(input, 'mixed.jsonl.gz'))) {
  const o = JSON.parse(line); mcount.lines++
  const d = byKey.get(o.text)
  if (o.origin === 'spacy') { if (d) { mixed.push(d); mcount.spacyReplaced++ } else mcount.spacyDropped++; continue }
  mcount.labels++; if (o.spacySame) mcount.spacySameBefore++
  const spacySame = d ? coreCache.get(o.text) === core(o.text, o.sop) : false
  if (spacySame) mcount.spacySameNow++
  mixed.push({...o, spacySame})
}
gz('mixed.jsonl.gz', mixed)
const sum = o => Object.values(o).reduce((a, b) => a + b, 0)
const result = {built: new Date().toISOString(), commit, datasetCommit, rewritten, input, distill: {...count, writtenAll: sum(count.written), coreAll: sum(count.core), kept: sum(count.total)}, mixed: mcount}
writeFileSync(join(out, 'refresh.json'), JSON.stringify(result, null, 1) + '\n')
console.log(JSON.stringify(result, null, 1))
