// Refreshes the ADVANCED side of the vibe batches with the spaCy circuits of a newer writer commit.
//   node tests/benchmark/syntax/vibe/refresh.mjs --commit <sha> [--out eval-results/2026-11-28-hard-half/refresh-<sha>] [--force]
// 1. a copy of the spaCy strategy's code at <sha> (git archive, which changes nothing) in .local-data/rvss/code/spacy-<sha>;
// 2. strategies/rvss/data/rewrite.mjs writes the circuits of every message from the recorded parses (the parser does not
//    run again) into .local-data/rvss/spacy-run-0f20f16/rewritten-<sha>.jsonl (skipped when it exists; --force again);
// 3. for every row of every <file>-advanced.csv of eval-results/2026-11-28-vibe-batches (hmm-rules' circuit `alt`
//    stays as it was made, .local-data/rvss/hmm-rules-all.jsonl.gz): the new circuit is put in its normal form and the
//    row is sorted again by the rule of prepare.mjs (writtenAlike with 'variants'):
//      - rows that are now simple go to <file>-simple2.csv (+ .pNN.csv parts of at most 150 rows) in the batches folder; the
//        -simple files and their verdicts are not touched;
//      - the rest stays advanced: <out>/advanced/<file>.csv (columns n,text,sop,alt,label_state), n = the dataset row;
//      - left out: rows that already have a judgment: a verdict file of an advanced part (batches or the pilot's Opus
//        verdicts), a registry judgment that is not an agreement on the message's circuit, or an accepted one on another circuit.
// Writes <out>/refresh.json with the counts.
import {readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {execFileSync, spawnSync} from 'node:child_process'
import {join, dirname, resolve} from 'node:path'
import {readCsv, writeCsv, packageRoot, normalForm, writtenAlike, readRegistry, lookup} from '../lib.mjs'

const args = process.argv.slice(2)
const opt = (name, fallback) => { const at = args.indexOf('--' + name); return at >= 0 ? args[at + 1] : fallback }
const commit = opt('commit')
if (!commit) { console.error('Usage: node refresh.mjs --commit <sha> [--out <dir>] [--force]'); process.exit(2) }
const outDir = resolve(packageRoot, opt('out', `eval-results/2026-11-28-hard-half/refresh-${commit}`))
const batches = join(packageRoot, 'eval-results/2026-11-28-vibe-batches')
const rvss = join(packageRoot, '.local-data/rvss')
const code = join(rvss, 'code/spacy-' + commit)
const rewritten = join(rvss, `spacy-run-0f20f16/rewritten-${commit}.jsonl`)
const force = args.includes('--force')

// ---- 1 and 2: the code at the commit, the circuits from the recorded parses
if (!existsSync(join(code, 'strategies/spacy-beam/index.mjs'))) {
  mkdirSync(code, {recursive: true})
  const tar = execFileSync('git', ['-C', packageRoot, 'archive', commit, 'lib', 'schemas', 'worlds', 'package.json', 'strategies/spacy', 'strategies/spacy-beam', 'strategies/spacy-direct', 'strategies/neural-dependencies'], {maxBuffer: 1 << 30})
  const r = spawnSync('tar', ['-x', '-C', code], {input: tar})
  if (r.status) throw new Error('tar failed')
}
if (force || !existsSync(rewritten)) {
  const r = spawnSync('node', ['--max-old-space-size=8000', join(packageRoot, 'strategies/rvss/data/rewrite.mjs'), join(rvss, 'spacy-run-0f20f16/run.jsonl'), '--code', code, '--out', rewritten], {stdio: 'inherit', cwd: packageRoot})
  if (r.status) throw new Error('rewrite.mjs failed')
}

// ---- 3: the sorting again
const jsonl = file => gunzipSync(readFileSync(file)).toString('utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
// Every row is found by its text (unique in the dataset): the file names and row numbers of the recorded files and of the
// batches may be those of an older split of the dataset.
const now = new Map()
for (const l of readFileSync(rewritten, 'utf8').split('\n')) { if (!l) continue; const r = JSON.parse(l); now.set(r.text, r) }
const hmm = new Map(jsonl(join(rvss, 'hmm-rules-all.jsonl.gz')).map(r => [r.text, r]))
const registry = readRegistry()

const walk = dir => readdirSync(dir).flatMap(name => { const p = join(dir, name); return statSync(p).isDirectory() ? (name.startsWith('.') ? [] : walk(p)) : [p] })
// texts of the rows with a verdict file of an advanced part
const judgedParts = new Set()
const advancedParts = walk(batches).filter(p => /-advanced\.p\d+\.verdicts\.jsonl$/u.test(p))
for (const vf of advancedParts) {
  const csv = vf.replace(/\.verdicts\.jsonl$/u, '.csv')
  if (!existsSync(csv)) continue
  const file = csv.slice(batches.length + 1).replace(/-advanced\.p\d+\.csv$/u, '.csv')
  const numbers = new Map(readCsv(readFileSync(csv, 'utf8')).slice(1).map(c => [Number(c[0]), c[1]]))
  for (const l of readFileSync(vf, 'utf8').split('\n')) { if (!l.trim()) continue; try { const v = JSON.parse(l); if (numbers.has(v.n)) judgedParts.add(numbers.get(v.n)) } catch {} }
}
const pilot = join(packageRoot, 'eval-results/2026-11-28-vibe-advanced-pilot/opus')
const pilotTexts = new Set()
if (existsSync(pilot)) for (const f of readdirSync(pilot).filter(f => /-advanced\.p\d+\.csv$/u.test(f)))
  for (const c of readCsv(readFileSync(join(pilot, f), 'utf8')).slice(1)) pilotTexts.add(c[1])

const count = {files: 0, advancedBefore: 0, judgedVerdictFile: 0, judgedPilot: 0, judgedRegistry: 0, left: 0, nowSimple: 0, stillAdvanced: 0, circuitChanged: 0, coreChanged: 0, noCircuitBefore: 0, noCircuitNow: 0, noCircuitNowButHadOne: 0, gainedCircuit: 0, hmmMissing: 0}
const changedByArea = {}
const files = walk(batches).filter(p => p.endsWith('-advanced.csv')).sort()
mkdirSync(join(outDir, 'advanced'), {recursive: true})
const N = 150
for (const path of files) {
  const file = path.slice(batches.length + 1).replace(/-advanced\.csv$/u, '.csv')
  const [, ...rows] = readCsv(readFileSync(path, 'utf8'))
  const simple = [], advanced = []
  count.files++; count.advancedBefore += rows.length
  for (const [n, text, oldSop, , labelState] of rows) {
    const s = now.get(text), h = hmm.get(text)
    if (!s || !h) throw new Error('no recorded circuit for ' + JSON.stringify(text))
    if (judgedParts.has(text)) { count.judgedVerdictFile++; continue }
    if (pilotTexts.has(text)) { count.judgedPilot++; continue }
    const a = s.sop ? normalForm(text, s.sop) : null, b = h.sop ? normalForm(text, h.sop) : null
    const circuit = a?.sop ?? ''
    const entries = registry.byText.get(text)
    if (entries) {
      const own = a?.core ? lookup(registry, text, a.core) : undefined
      if ((own && own.judge !== 'agreement') || [...entries.values()].some(e => e.verdict === 'accepted' && e.judge !== 'agreement')) { count.judgedRegistry++; continue }
    }
    if (!oldSop) count.noCircuitBefore++
    if (!circuit) { count.noCircuitNow++; if (oldSop) count.noCircuitNowButHadOne++ }
    else if (!oldSop) count.gainedCircuit++
    if (circuit !== oldSop) {
      count.circuitChanged++
      const oldCore = oldSop ? normalForm(text, oldSop)?.core : null
      if (a?.core !== oldCore) { count.coreChanged++; const area = file.split('/')[0]; changedByArea[area] = (changedByArea[area] ?? 0) + 1 }
    }
    if (!h.sop) count.hmmMissing++
    if (a && b && writtenAlike(text, a, b, 'variants')) simple.push([n, text, circuit, labelState])
    else advanced.push([n, text, circuit, b?.sop ?? '', labelState])
  }
  count.nowSimple += simple.length; count.stillAdvanced += advanced.length
  const base = path.replace(/-advanced\.csv$/u, '-simple2')
  if (simple.length) {
    writeFileSync(base + '.csv', writeCsv(['n', 'text', 'sop', 'label_state'], simple))
    for (let i = 0, p = 1; i < simple.length; i += N, p++) writeFileSync(base + `.p${String(p).padStart(2, '0')}.csv`, writeCsv(['n', 'text', 'sop', 'label_state'], simple.slice(i, i + N)))
  }
  const dest = join(outDir, 'advanced', file)
  mkdirSync(dirname(dest), {recursive: true})
  writeFileSync(dest, writeCsv(['n', 'text', 'sop', 'alt', 'label_state'], advanced))
}
count.left = count.judgedVerdictFile + count.judgedPilot + count.judgedRegistry
const result = {built: new Date().toISOString(), commit, rewritten, ...count, changedByArea}
writeFileSync(join(outDir, 'refresh.json'), JSON.stringify(result, null, 1) + '\n')
console.log(JSON.stringify(result, null, 1))
