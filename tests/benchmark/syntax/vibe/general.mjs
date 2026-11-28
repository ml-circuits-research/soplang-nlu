// Judging material for the general messages of the syntactic layer (syntactic/general/<name>/NNNN.csv, no semantic file).
//   . ~/models/sop-nlu-trf/env.sh
//   node tests/benchmark/syntax/vibe/general.mjs [<name> …] [--date 2026-11-28] [--jobs 4] [--limit n] [--out <folder>] [--dataset <folder>]
// For each folder (all of syntactic/general/ when none is named) it takes the messages without a label (empty `sop`, not
// accepted by a judge), runs the strategies spacy and hmm-rules on them (CPU only: CUDA_VISIBLE_DEVICES is emptied; at most
// 4 processes: the messages go to --jobs/2 shards, each shard runs the two strategies side by side with run.mjs), and writes
// into eval-results/<date>-general-batches/<name>/:
//   <name>-simple.pNN.csv     n,text,sop,label_state    the two strategies write the same circuit ('variants' key of writtenAlike)
//   <name>-advanced.pNN.csv   n,text,sop,alt,label_state they differ, or one has no circuit (sop = spacy's, alt = hmm-rules')
//   <name>-simple.pNN.key.jsonl, -advanced.pNN.key.jsonl   {n, file, row}: the dataset file and row (1-based data row) of each part row
//   RULES.md, index.json, summary.md, runs/ (the raw strategy output, reusable)
// A part holds at most 150 rows; n counts the part. Nothing is judged and the dataset is not written. The verdicts are
// judged with vibe/run.mjs (the names -simple.pNN.csv / -advanced.pNN.csv are the ones it knows) and published, matched by
// text (unique in the dataset), through the label tools (readLabels/writeLabels find the files under syntactic/general/).
import {readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync, rmSync} from 'node:fs'
import {spawn} from 'node:child_process'
import {join, resolve, dirname} from 'node:path'
import {gzipSync} from 'node:zlib'
import {readCsv, writeCsv, packageRoot, normalForm, writtenAlike, readJsonl, defaultSyntacticDir} from '../lib.mjs'

const args = process.argv.slice(2), named = {}, names = []
for (let i = 0; i < args.length; i++) { if (args[i].startsWith('--')) named[args[i].slice(2)] = args[++i]; else names.push(args[i]) }
const date = named.date ?? new Date().toISOString().slice(0, 10)
const jobs = Math.min(4, Math.max(2, Number(named.jobs ?? 4))), shards = Math.floor(jobs / 2), PART = 150, limit = Number(named.limit ?? Infinity)
const syntactic = named.dataset ? resolve(named.dataset, 'syntactic') : defaultSyntacticDir
const generalDir = join(syntactic, 'general')
const outRoot = resolve(packageRoot, named.out ?? `eval-results/${date}-general-batches`)
const scratch = join(packageRoot, '.local-data/general-runs')
const folders = names.length ? names : readdirSync(generalDir, {withFileTypes: true}).filter(e => e.isDirectory()).map(e => e.name).sort()

const runShard = (runDir, sample) => new Promise(done => {
  const child = spawn('node', [join(packageRoot, 'tests/benchmark/syntax/run.mjs'), runDir, '--sample', sample, '--only', 'spacy,hmm-rules', '--jobs', '2', '--timeout', '60'],
    {stdio: ['ignore', 'inherit', 'inherit'], env: {...process.env, CUDA_VISIBLE_DEVICES: ''}})
  child.on('exit', code => done(code))
})
const parts = (rows, header, base, keys) => {
  const written = []
  for (let i = 0, k = 1; i < rows.length; i += PART, k++) {
    const chunk = rows.slice(i, i + PART), name = `${base}.p${String(k).padStart(2, '0')}`
    writeFileSync(name + '.csv', writeCsv(header, chunk.map((r, j) => [j + 1, ...r.cells]), '\n'))
    writeFileSync(name + '.key.jsonl', chunk.map((r, j) => JSON.stringify({n: j + 1, file: r.file, row: r.row})).join('\n') + '\n')
    written.push(name)
  }
  return written
}

const total = {}
for (const name of folders) {
  const dir = join(generalDir, name)
  if (!existsSync(dir)) { console.error(`${dir} does not exist`); process.exit(2) }
  const out = join(outRoot, name)
  if (existsSync(join(out, 'index.json'))) { console.error(`${out} already holds batches (index.json): choose another --date or --out; nothing is overwritten.`); process.exit(1) }
  // the messages without a label, in the order of the files
  const todo = []; let labelled = 0
  for (const f of readdirSync(dir).filter(f => f.endsWith('.csv')).sort()) {
    const [, ...rows] = readCsv(readFileSync(join(dir, f), 'utf8'))
    rows.forEach(([text, sop = '', , accepted = ''], i) => { if (sop || accepted === 'judge') labelled++; else if (todo.length < limit) todo.push({file: `general/${name}/${f}`, row: i + 1, text}) })
  }
  mkdirSync(join(out, 'runs'), {recursive: true}); mkdirSync(scratch, {recursive: true})
  const started = performance.now()
  const sizes = Array.from({length: shards}, (_, k) => todo.filter((_, i) => i % shards === k))
  const dirs = sizes.map((_, k) => join(out, 'runs', `shard-${k + 1}`))
  await Promise.all(sizes.map(async (list, k) => {
    const sample = join(scratch, `${name}-shard-${k + 1}.json`)
    writeFileSync(sample, JSON.stringify(list.map(m => ({id: m.file + '#' + m.row, text: m.text}))))
    const code = await runShard(dirs[k], sample)
    rmSync(sample, {force: true})
    if (code) console.error(`shard ${k + 1} of ${name}: run.mjs exited with ${code}`)
  }))
  const wall = (performance.now() - started) / 1000
  const byText = {spacy: new Map(), 'hmm-rules': new Map()}, ms = {spacy: [], 'hmm-rules': []}
  for (const d of dirs) for (const s of Object.keys(byText)) for (const r of readJsonl(join(d, s + '.jsonl'))) { byText[s].set(r.text, r); if (Number.isFinite(r.ms)) ms[s].push(r.ms) }
  const simple = [], advanced = [], noCircuit = {spacy: 0, 'hmm-rules': 0}
  for (const m of todo) {
    const s = byText.spacy.get(m.text), h = byText['hmm-rules'].get(m.text)
    const a = s?.sop ? normalForm(m.text, s.sop) : null, b = h?.sop ? normalForm(m.text, h.sop) : null
    if (!a) noCircuit.spacy++
    if (!b) noCircuit['hmm-rules']++
    if (a && b && writtenAlike(m.text, a, b, 'variants')) simple.push({...m, cells: [m.text, a.sop, '']})
    else advanced.push({...m, cells: [m.text, a?.sop ?? '', b?.sop ?? '', '']})
  }
  const p1 = parts(simple, ['n', 'text', 'sop', 'label_state'], join(out, `${name}-simple`)), p2 = parts(advanced, ['n', 'text', 'sop', 'alt', 'label_state'], join(out, `${name}-advanced`))
  copyFileSync(join(packageRoot, 'tests/benchmark/syntax/rules.md'), join(out, 'RULES.md'))
  const sum = a => a.reduce((x, y) => x + y, 0), mean = a => a.length ? sum(a) / a.length : null
  const stats = {messages: todo.length, alreadyLabelled: labelled, simple: simple.length, advanced: advanced.length, simpleParts: p1.length, advancedParts: p2.length, noCircuit,
    wallSeconds: Math.round(wall), wallMsPerMessage: todo.length ? Math.round(wall * 1000 / todo.length) : null, jobs: shards * 2,
    meanMsPerMessage: {spacy: Math.round(mean(ms.spacy)), 'hmm-rules': Math.round(mean(ms['hmm-rules']) * 10) / 10}}
  writeFileSync(join(out, 'index.json'), JSON.stringify(stats, null, 1) + '\n')
  writeFileSync(join(out, 'summary.md'), `# General batches: ${name}\n\n| What | Count |\n| --- | --- |\n${Object.entries(stats).map(([k, v]) => `| ${k} | ${typeof v === 'object' ? JSON.stringify(v) : v} |`).join('\n')}\n`)
  total[name] = stats
  console.log(name, JSON.stringify(stats))
}
