// rvss data, step 2: the spaCy silver circuits and the two training sets, with the split by file and the benchmark
// left out.
//
//   node strategies/rvss/data/build-sets.mjs --run <run.jsonl | rewritten.jsonl> --commit <spaCy commit>
//        [--dataset <webmeet-dataset>] [--out <folder>] [--parses [<run.jsonl the parses come from>]]
//
// Writes into <out> (default .local-data/rvss):
//   spacy-silver.jsonl.gz   every message: {text, file, row, sop, error, ms}; sop null where the strategy gave none
//   spacy-parses.jsonl.gz   (--parses) the parser's output per message {file, row, parse} (see run-spacy.mjs)
//   distill.jsonl.gz        every message outside the benchmark with a spaCy circuit:
//                           {text, file, row, split, sop, origin: "spacy", source: "spacy@<commit>", judged}
//                           judged = the registry's decision on that very circuit (newest line): accepted, rejected, null
//   mixed.jsonl.gz          every message outside the benchmark: its accepted label where it has one
//                           {origin: judge|agreement|written, source (who wrote it), accepted_by, spacySame: the label
//                           and spaCy's circuit have one normal-form core}, else
//                           spaCy's circuit as in distill; messages with neither are left out (counted)
//   excluded.jsonl.gz       the messages left out of both: {file, row, text, why, benchId, benchText}
//                           why = benchmark (the text of a message of the sample), copy (the same text up to case
//                           and spaces),
//                           near-copy (one character inserted, deleted or replaced, after lowering case and
//                           collapsing spaces)
//   splits.json             the dev-B files (10% of the files: the round(files/10) with the smallest sha1 of their
//                           path) and the counts
//   build.json              commits, inputs, counts
import {createHash} from 'node:crypto'
import {createReadStream, readFileSync, writeFileSync, mkdirSync} from 'node:fs'
import {createInterface} from 'node:readline'
import {createGunzip, gzipSync, gunzipSync} from 'node:zlib'
import {execFileSync} from 'node:child_process'
import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {messagesOf, csvFilesOf} from './run-spacy.mjs'

const repo = resolve(fileURLToPath(import.meta.url), '../../../..')
const args = process.argv.slice(2)
const opt = (name, fallback) => { const at = args.indexOf('--' + name); return at >= 0 ? args[at + 1] : fallback }
const runFile = resolve(opt('run')), commit = opt('commit')
if (!runFile || !commit) { console.error('--run and --commit are required'); process.exit(2) }
const dataset = resolve(opt('dataset', join(repo, '../webmeet-dataset')))
const out = resolve(opt('out', join(repo, '.local-data/rvss')))
const benchDir = join(repo, 'eval-results/2026-11-27-syntax-benchmark-random')
const {readRegistry, lookup, normalForm} = await import(join(repo, 'tests/benchmark/syntax/lib.mjs'))
mkdirSync(out, {recursive: true})
const t0 = performance.now()
const git = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], {encoding: 'utf8'}).trim()
const datasetCommit = git(dataset, 'rev-parse', '--short', 'HEAD')
const datasetDirty = git(dataset, 'status', '--porcelain', '--', 'semantic', 'syntactic', 'annotations/syntax').length > 0
const codeCommit = git(repo, 'rev-parse', '--short', 'HEAD')
const gz = (file, lines) => writeFileSync(join(out, file), gzipSync(lines.map(line => JSON.stringify(line)).join('\n') + (lines.length ? '\n' : '')))

// ---- the messages and their labels
const messages = messagesOf(join(dataset, 'semantic'))
const syntactic = messagesOf(join(dataset, 'syntactic'), true)
if (syntactic.length !== messages.length) throw Error('semantic and syntactic differ in their number of rows')
const key = m => m.file + '#' + m.row
const labelOf = new Map()
let textMismatch = 0
for (const [i, m] of syntactic.entries()) {
  if (m.text !== messages[i].text || key(m) !== key(messages[i])) { textMismatch++; continue }
  const [, sop = '', source = '', accepted_by = ''] = m.cells
  if (sop) labelOf.set(key(m), {sop, source, accepted_by})
}
syntactic.length = 0

// ---- the spaCy circuits
const silver = new Map()
// --parses [<run.jsonl>]: the parser's output, from the run file or from the run a rewritten file was written from
const keepParses = args.includes('--parses')
const parsesSource = (v => v && !v.startsWith('--') ? resolve(v) : runFile)(opt('parses'))
const parses = []
const linesOf = file => { const input = createReadStream(file); return createInterface({input: file.endsWith('.gz') ? input.pipe(createGunzip()) : input, crlfDelay: Infinity}) }
for await (const line of linesOf(runFile)) {
  if (!line) continue
  const row = JSON.parse(line)
  silver.set(row.file + '#' + row.row, {text: row.text, file: row.file, row: row.row, sop: row.sop, error: row.error, ms: row.ms ?? null})
  if (keepParses && row.parse && parsesSource === runFile) parses.push({file: row.file, row: row.row, parse: row.parse})
}
if (keepParses && parsesSource !== runFile) for await (const line of linesOf(parsesSource)) {
  if (!line) continue
  const row = JSON.parse(line)
  if (row.parse && silver.get(row.file + '#' + row.row)?.text === row.text) parses.push({file: row.file, row: row.row, parse: row.parse})
}
const missing = messages.filter(m => !silver.has(key(m)))
const silverLines = messages.filter(m => silver.has(key(m))).map(m => silver.get(key(m)))
const silverTextMismatch = messages.filter(m => silver.has(key(m)) && silver.get(key(m)).text !== m.text).length
if (silverTextMismatch) throw Error(silverTextMismatch + ' messages have another text in the run than in the dataset: run the strategy again')
gz('spacy-silver.jsonl.gz', silverLines)
if (keepParses) gz('spacy-parses.jsonl.gz', parses)
const msValues = silverLines.map(s => s.ms).filter(Number.isFinite).sort((a, b) => a - b)
const q = p => msValues[Math.min(msValues.length - 1, Math.floor(p * (msValues.length - 1)))]
const errors = {}
for (const s of silverLines) if (s.sop === null) { const e = String(s.error).replace(/:.*$/u, '') ; errors[e] = (errors[e] ?? 0) + 1 }
const silverStats = {lines: silverLines.length, textMismatch: silverTextMismatch, missing: missing.length, withCircuit: silverLines.filter(s => s.sop !== null).length,
  noCircuit: silverLines.filter(s => s.sop === null).length, errors,
  ms: {median: q(0.5), mean: +(msValues.reduce((a, b) => a + b, 0) / msValues.length).toFixed(3), p90: q(0.9), p99: q(0.99), max: msValues.at(-1)}}
console.error('silver', JSON.stringify(silverStats), ((performance.now() - t0) / 1000).toFixed(0) + ' s')

// ---- the benchmark and its copies
const squash = t => t.toLowerCase().replace(/\s+/gu, ' ').trim()
const bench = JSON.parse(gunzipSync(readFileSync(join(benchDir, 'sample.json.gz')))).map(({id, text}) => ({id, text}))
const benchIds = new Map(bench.map(b => [b.id, b]))
const benchBySquash = new Map(bench.map(b => [squash(b.text), b]))
const benchByText = new Map(bench.map(b => [b.text, b]))
const del1 = s => { const v = [s]; for (let i = 0; i < s.length; i++) v.push(s.slice(0, i) + s.slice(i + 1)); return v }
const variants = new Map()
for (const b of bench) for (const v of new Set(del1(squash(b.text)))) (variants.get(v) ?? variants.set(v, []).get(v)).push(b)
/** at most one character inserted, deleted or replaced */
const withinOne = (a, b) => {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++
  let j = 0; while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++
  return a.length - i - j <= 1 && b.length - i - j <= 1
}
const excluded = new Map()
const benchFound = {sameIdAndText: 0, idTextDiffers: 0, idMissing: 0}
const messageByKey = new Map(messages.map(m => [key(m), m]))
for (const b of bench) {
  const m = messageByKey.get(b.id)
  if (!m) benchFound.idMissing++; else if (m.text === b.text) benchFound.sameIdAndText++; else benchFound.idTextDiffers++
}
for (const m of messages) {
  const s = squash(m.text)
  // the sample names its messages by file#row at the time it was drawn; rows have moved since, so the text decides
  const exact = benchByText.get(m.text)
  if (exact) { excluded.set(key(m), {file: m.file, row: m.row, text: m.text, why: 'benchmark', benchId: exact.id, benchText: exact.text, sameId: exact.id === key(m)}); continue }
  const same = benchBySquash.get(s)
  if (same) { excluded.set(key(m), {file: m.file, row: m.row, text: m.text, why: 'copy', benchId: same.id, benchText: same.text}); continue }
  let near = null
  for (const v of new Set(del1(s))) { for (const b of variants.get(v) ?? []) if (withinOne(s, squash(b.text))) { near = b; break } if (near) break }
  if (near) excluded.set(key(m), {file: m.file, row: m.row, text: m.text, why: 'near-copy', benchId: near.id, benchText: near.text})
}
const excludedLines = [...excluded.values()]
gz('excluded.jsonl.gz', excludedLines)
const whyCount = {}
for (const e of excludedLines) whyCount[e.why] = (whyCount[e.why] ?? 0) + 1
console.error('excluded', JSON.stringify(whyCount), JSON.stringify(benchFound), ((performance.now() - t0) / 1000).toFixed(0) + ' s')

// ---- the split by file
const files = csvFilesOf(join(dataset, 'semantic'))
const hashOf = file => createHash('sha1').update(file).digest('hex')
const devFiles = [...files].sort((a, b) => hashOf(a) < hashOf(b) ? -1 : 1).slice(0, Math.round(files.length / 10)).sort()
const devSet = new Set(devFiles)
const splitOf = file => devSet.has(file) ? 'dev-B' : 'train'

// ---- the registry: the decision on spaCy's own circuit, where a judge or an agreement run decided it
const registry = readRegistry(join(dataset, 'annotations/syntax/v1/judged'))
console.error('registry', registry.files.length, 'files', registry.rows, 'lines', ((performance.now() - t0) / 1000).toFixed(0) + ' s')

// ---- the sets
const distill = [], mixed = []
const count = {}
const add = (set, split, origin) => { const k = set + ' ' + split + ' ' + origin; count[k] = (count[k] ?? 0) + 1 }
let neither = 0
for (const m of messages) {
  const k = key(m)
  if (excluded.has(k)) continue
  const split = splitOf(m.file), s = silver.get(k), label = labelOf.get(k)
  let spacyLine = null
  if (s?.sop) {
    const decided = lookup(registry, m.text, normalForm(m.text, s.sop)?.core)
    spacyLine = {text: m.text, file: m.file, row: m.row, split, sop: s.sop, origin: 'spacy', source: 'spacy@' + commit, judged: decided?.verdict ?? null}
    distill.push(spacyLine); add('distill', split, 'spacy')
  }
  if (label) {
    const origin = ['judge', 'agreement', 'written'].includes(label.accepted_by) ? label.accepted_by : 'label:' + (label.accepted_by || 'unknown')
    // the same circuit in the benchmark's normal form (wire names, order, one word per dependent value...)
    const spacySame = s?.sop ? normalForm(m.text, s.sop)?.core === normalForm(m.text, label.sop)?.core : false
    mixed.push({text: m.text, file: m.file, row: m.row, split, sop: label.sop, origin, source: label.source, accepted_by: label.accepted_by, spacySame})
    add('mixed', split, origin); if (spacySame) add('mixed-label-equals-spacy', split, origin)
  } else if (spacyLine) { mixed.push(spacyLine); add('mixed', split, 'spacy') }
  else neither++
}
gz('distill.jsonl.gz', distill)
gz('mixed.jsonl.gz', mixed)
const judgedSpacy = {}
for (const d of distill) { const k = d.split + ' ' + (d.judged ?? 'unjudged'); judgedSpacy[k] = (judgedSpacy[k] ?? 0) + 1 }
const filesBySplit = {train: files.filter(f => !devSet.has(f)).length, 'dev-B': devFiles.length}
const messagesBySplit = {}
for (const m of messages) if (!excluded.has(key(m))) messagesBySplit[splitOf(m.file)] = (messagesBySplit[splitOf(m.file)] ?? 0) + 1
writeFileSync(join(out, 'splits.json'), JSON.stringify({rule: 'dev-B = the round(files/10) files of semantic/ with the smallest sha1(path), path as "folder/name.csv"', devB: devFiles, filesBySplit, messagesBySplit}, null, 1) + '\n')
const build = {built: new Date().toISOString(), parses: keepParses ? {from: parsesSource, lines: parses.length} : null, seconds: Math.round((performance.now() - t0) / 1000), datasetCommit, datasetDirty, codeCommit, spacyCommit: commit, runFile,
  messages: messages.length, textMismatch, labels: labelOf.size, silver: silverStats, benchmark: {messages: bench.length, ...benchFound}, excluded: whyCount,
  registry: {files: registry.files.length, lines: registry.rows}, filesBySplit, messagesBySplit, sets: Object.fromEntries(Object.entries(count).sort()),
  distillJudged: judgedSpacy, mixedNeither: neither, distillLines: distill.length, mixedLines: mixed.length}
writeFileSync(join(out, 'build.json'), JSON.stringify(build, null, 1) + '\n')
console.log(JSON.stringify(build, null, 1))
