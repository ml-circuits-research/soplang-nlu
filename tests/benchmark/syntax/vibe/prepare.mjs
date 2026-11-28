// Splits the dataset's syntactic files into batches for the judge.
//   node tests/benchmark/syntax/vibe/prepare.mjs [--out eval-results/2026-11-28-vibe-batches]
// For each file F (a/b.csv) it writes a/b-simple.csv (spaCy and hmm-rules agree under 'variants': n,text,sop,label_state)
// and a/b-advanced.csv (they disagree or one has none: n,text,sop,alt,label_state), index.json and summary.md.
// Left out: rows already judged (accepted_by judge or written) and the benchmark messages (excluded.jsonl.gz).
import {readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {join, dirname, resolve} from 'node:path'
import {readCsv, writeCsv, defaultSyntacticDir, packageRoot, normalForm, writtenAlike} from '../lib.mjs'

const arg = process.argv.indexOf('--out')
const outDir = resolve(packageRoot, arg > 0 ? process.argv[arg + 1] : 'eval-results/2026-11-28-vibe-batches')
const rvss = join(packageRoot, '.local-data/rvss')
const jsonl = f => gunzipSync(readFileSync(join(rvss, f))).toString('utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
// The recorded files (and the dataset's files and rows) are matched by text, which is unique in the dataset: their file
// names and rows may be those of an older split.
const spacy = new Map(jsonl('spacy-silver.jsonl.gz').map(r => [r.text, r]))
const hmm = new Map(jsonl('hmm-rules-all.jsonl.gz').map(r => [r.text, r]))
const excluded = new Set(jsonl('excluded.jsonl.gz').map(r => r.text))
const files = dir => readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name < b.name ? -1 : 1)
  .flatMap(e => e.isDirectory() ? files(join(dir, e.name)).map(f => e.name + '/' + f) : e.name.endsWith('.csv') ? [e.name] : [])

if (existsSync(join(outDir, 'index.json'))) { console.error(outDir + ' already holds batches (index.json): choose another --out; nothing is overwritten.'); process.exit(1) }
const index = {}, total = {files: 0, simple: 0, advanced: 0, judged: 0, benchmark: 0, mismatch: 0, noCircuitSpacy: 0, noCircuitHmm: 0}
for (const file of files(defaultSyntacticDir)) {
  const [, ...rows] = readCsv(readFileSync(join(defaultSyntacticDir, file), 'utf8'))
  const simple = [], advanced = []
  let judged = 0, benchmark = 0
  rows.forEach(([text, , , accepted = ''], i) => {
    const row = i + 1
    if (accepted === 'judge' || accepted === 'written') { judged++; return }
    if (excluded.has(text)) { benchmark++; return }
    const s = spacy.get(text), h = hmm.get(text)
    if (!s || !h) { total.mismatch++; return }
    const a = s.sop ? normalForm(text, s.sop) : null, b = h.sop ? normalForm(text, h.sop) : null
    if (!a) total.noCircuitSpacy++
    if (!b) total.noCircuitHmm++
    if (a && b && writtenAlike(text, a, b, 'variants')) simple.push([row, text, a.sop, accepted])
    else advanced.push([row, text, a?.sop ?? '', b?.sop ?? '', accepted])
  })
  const base = join(outDir, file.replace(/\.csv$/u, ''))
  mkdirSync(dirname(base), {recursive: true})
  writeFileSync(base + '-simple.csv', writeCsv(['n', 'text', 'sop', 'label_state'], simple))
  writeFileSync(base + '-advanced.csv', writeCsv(['n', 'text', 'sop', 'alt', 'label_state'], advanced))
  copyFileSync(join(packageRoot, 'tests/benchmark/syntax/rules.md'), join(dirname(base), 'RULES.md'))
  index[file] = {simple: simple.length, advanced: advanced.length, judged, benchmark}
  total.files++; total.simple += simple.length; total.advanced += advanced.length; total.judged += judged; total.benchmark += benchmark
}
writeFileSync(join(outDir, 'index.json'), JSON.stringify({total, files: index}, null, 1) + '\n')
writeFileSync(join(outDir, 'summary.md'), `# Vibe batches\n\n| What | Count |\n| --- | --- |\n${Object.entries(total).map(([k, v]) => `| ${k} | ${v} |`).join('\n')}\n`)
console.log(total)
