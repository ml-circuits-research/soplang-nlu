// rvss data: a training set whose targets are the verified labels where they exist, spaCy's circuit only where
// nothing better exists (sprint 4, 2026-11-28). Every message of the dataset as it is now (syntactic/**, webmeet and
// general), found by text.
//
//   node strategies/rvss/data/build-labels.mjs --spacy <run or rewritten .jsonl>... [--sets <folder with distill.jsonl.gz>]
//        [--out <folder>] [--dataset <webmeet-dataset>] [--missing <out.jsonl>] [--all]
//
// --all (owner, 2026-11-28: VSS learns the roles of words, not each word, so nothing is held out): every message is
//   split train, the old benchmark's messages and their corrections included; `held` keeps what the message was
//   (dev-B, dev-G, benchmark), so dev-B / dev-G numbers can still be read as a diagnostic of fit on seen data.
//
// --missing: only write the messages that have no spaCy circuit in the --spacy files ({file, row, text}, for
//   run-spacy.mjs --messages), and stop.
//
// The target of a message, in this order (the first that exists and that no judge rejected):
//   1. its label when a judge accepted it or wrote it (accepted_by judge / written): origin judge / written
//   2. a circuit the registry (annotations/syntax/v1/judged) holds as accepted for the message, also the circuits
//      judges wrote for rejected ones (several: the one equal to spaCy's, else the newest): origin judge
//   3. its agreement label: origin agreement
//   4. a plausible label (syntactic/general/odd-sentences, real-word-variants): origin plausible
//   5. spaCy's circuit (writer of the --spacy files): origin spacy (general for syntactic/general)
//   A message whose only target is a circuit a judge rejected is left out (counted).
// The split is the one the --sets lines give the same text (train, dev-B, dev-G): dev-B and dev-G stay the same texts,
// less those no longer in the dataset (counted). A text new since (a spelling correction, a new folder) is train, unless
// it corrects a text of dev-B, dev-G, the old benchmark or its copies (then it is left out); a training text within one
// character edit of a benchmark, dev-B or dev-G text is left out too.
// Writes <out>/distill.jsonl.gz and mixed.jsonl.gz (the same lines, for moves.mjs):
//   {text, file, row, area, split, sop, origin, accepted_by, spacy, spacySame, judged}
// (spacy = spaCy's circuit; spacySame = the target has spaCy's normal-form core; judged = the registry's decision on the
// target), excluded-labels.jsonl.gz, build-labels.json (counts).
import {createReadStream, readFileSync, writeFileSync, mkdirSync} from 'node:fs'
import {createInterface} from 'node:readline'
import {createGunzip, gzipSync, gunzipSync} from 'node:zlib'
import {execFileSync} from 'node:child_process'
import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const repo = resolve(fileURLToPath(import.meta.url), '../../../..')
const args = process.argv.slice(2)
const opt = (name, fallback) => { const at = args.indexOf('--' + name); return at >= 0 ? args[at + 1] : fallback }
const many = name => args.flatMap((a, i) => a === '--' + name ? [args[i + 1]] : [])
const dataset = resolve(opt('dataset', join(repo, '../webmeet-dataset')))
const setsDir = resolve(opt('sets', join(repo, '.local-data/rvss')))
const out = resolve(opt('out', join(repo, '.local-data/rvss/at-labels')))
const ALL = args.includes('--all')
const {readRegistry, normalForm, readSample} = await import(join(repo, 'tests/benchmark/syntax/lib.mjs'))
const {messagesOf} = await import(join(repo, 'strategies/rvss/data/run-spacy.mjs'))
const {wordsOf} = await import(join(repo, 'lib/syntax.mjs'))
const {nearIndex, nearMatch, squash, benchmarkDir} = await import(join(repo, 'strategies/rvss/eval/common.mjs'))
const linesOf = file => { const s = createReadStream(file); return createInterface({input: file.endsWith('.gz') ? s.pipe(createGunzip()) : s, crlfDelay: Infinity}) }
const inc = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n }

// every message of the dataset now, with its label
const messages = messagesOf(join(dataset, 'syntactic'), true).map(({file, row, text, cells}) => ({file, row, text, label: cells[1] || null, accepted_by: cells[3] || null}))
const seen = new Set(); const all = []
for (const m of messages) if (!seen.has(m.text)) { seen.add(m.text); all.push(m) }
const spacy = new Map()
for (const f of many('spacy')) for await (const l of linesOf(resolve(f))) { if (!l) continue; const r = JSON.parse(l); if (r.sop) spacy.set(r.text, r.sop); else if (!spacy.has(r.text)) spacy.set(r.text, null) }
if (opt('missing')) {
  const missing = all.filter(m => !spacy.has(m.text))
  writeFileSync(resolve(opt('missing')), missing.map(m => JSON.stringify({file: m.file, row: m.row, text: m.text})).join('\n') + '\n')
  console.log(`${all.length} messages, ${missing.length} without a spaCy circuit -> ${opt('missing')}`); process.exit(0)
}
mkdirSync(out, {recursive: true})
const datasetCommit = execFileSync('git', ['-C', dataset, 'rev-parse', '--short', 'HEAD'], {encoding: 'utf8'}).trim()

// the held-out sets as they were (by text)
const oldSplit = new Map()
for await (const l of linesOf(join(setsDir, 'distill.jsonl.gz'))) { const o = JSON.parse(l); oldSplit.set(o.text, o.split) }
const oldExcluded = new Set()
for (const f of ['excluded.jsonl.gz', 'excluded-general.jsonl.gz']) for await (const l of linesOf(join(setsDir, f))) { if (l) oldExcluded.add(JSON.parse(l).text) }
const bench = readSample(join(benchmarkDir, 'sample.json.gz')).map(m => m.text)
const benchSet = new Set(bench.map(squash))
// spelling corrections: new text -> old text
const corrected = new Map()
for (const f of ['2026-11-28-corrections.jsonl', '2026-11-28-real-word.jsonl']) {
  for (const l of readFileSync(join(dataset, 'tools/spelling', f), 'utf8').split('\n')) { if (!l) continue; const o = JSON.parse(l); corrected.set(o.new, o.old) }
}
const heldOld = text => { const s = oldSplit.get(text); return s === 'dev-B' || s === 'dev-G' || oldExcluded.has(text) || benchSet.has(squash(text)) }

const registry = readRegistry(join(dataset, 'annotations/syntax/v1/judged'))
const coreOf = (text, sop) => { if (!sop) return null; try { return normalForm(text, sop)?.core ?? null } catch { return null } }
const verdict = (text, core) => core ? registry.byText.get(text)?.get(core)?.verdict ?? null : null

const count = {messages: all.length, duplicateRows: messages.length - all.length, split: {}, excluded: {}, origin: {}, differsFromSpacy: {},
  noTarget: {}, heldOutGone: {}, byLength: {}}
const lines = [], excluded = []
for (const m of all) {
  const area = m.file.startsWith('general/') ? m.file.split('/').slice(0, 2).join('/') : m.file.split('/')[0]
  let split = oldSplit.get(m.text), why = null
  if (!split) {
    if (oldExcluded.has(m.text) || benchSet.has(squash(m.text))) why = 'benchmark or its copy'
    else if (corrected.has(m.text) && heldOld(corrected.get(m.text))) why = 'corrects a held-out text'
    split = 'train'
  }
  let held = null
  if (ALL) { held = why ? (why.startsWith('benchmark') ? 'benchmark' : 'corrects a held-out text') : split !== 'train' ? split : null; split = 'train'; why = null }
  if (why) { excluded.push({text: m.text, file: m.file, why}); inc(count.excluded, why); continue }
  const sp = spacy.get(m.text) ?? null, spCore = coreOf(m.text, sp)
  const labCore = coreOf(m.text, m.label)
  let target = null, origin = null
  if (m.label && labCore && (m.accepted_by === 'judge' || m.accepted_by === 'written') && verdict(m.text, labCore) !== 'rejected') { target = m.label; origin = m.accepted_by }
  if (!target) {
    const accepted = [...(registry.byText.get(m.text)?.values() ?? [])].filter(r => r.verdict === 'accepted' && r.sop)
    if (accepted.length) { const r = accepted.find(r => r.core === spCore) ?? accepted[accepted.length - 1]; target = r.sop; origin = 'judge' }
  }
  if (!target && m.label && labCore && m.accepted_by === 'agreement' && verdict(m.text, labCore) !== 'rejected') { target = m.label; origin = 'agreement' }
  if (!target && m.label && labCore && m.accepted_by === 'plausible' && verdict(m.text, labCore) !== 'rejected') { target = m.label; origin = 'plausible' }
  if (!target && sp && spCore && verdict(m.text, spCore) !== 'rejected') { target = sp; origin = area.startsWith('general') ? 'general' : 'spacy' }
  if (!target) { inc(count.noTarget, split + ' ' + (sp ? (spCore && verdict(m.text, spCore) === 'rejected' ? 'spaCy rejected' : 'spaCy invalid') : 'no spaCy circuit')); continue }
  const tCore = coreOf(m.text, target)
  const spacySame = tCore !== null && tCore === spCore
  inc(count.split, split); inc(count.origin, split + ' ' + origin); if (!spacySame) inc(count.differsFromSpacy, split + ' ' + origin)
  const n = wordsOf(m.text).length; inc(count.byLength, split + ' ' + (n < 10 ? '<10' : n < 25 ? '10-24' : n < 40 ? '25-39' : '40+'))
  if (held) inc(count.split, 'held before: ' + held)
  lines.push({text: m.text, file: m.file, row: m.row, area, split, ...(held ? {held} : {}), sop: target, origin, accepted_by: m.accepted_by, spacy: sp, spacySame, judged: verdict(m.text, tCore)})
}
// training texts too close to a held-out text
const held = nearIndex([...bench, ...lines.filter(l => l.split !== 'train').map(l => l.text)])
const heldText = new Set(lines.filter(l => l.split !== 'train').map(l => l.text))
const kept = lines.filter(l => {
  if (ALL || l.split !== 'train' || !nearMatch(held, l.text)) return true
  excluded.push({text: l.text, file: l.file, why: 'one edit from a held-out text'}); inc(count.excluded, 'one edit from a held-out text'); inc(count.split, 'train', -1); return false
})
const nowTexts = new Set(all.map(m => m.text))
for (const [text, s] of oldSplit) if ((s === 'dev-B' || s === 'dev-G') && !nowTexts.has(text)) inc(count.heldOutGone, s)
count.benchmarkGone = bench.filter(t => !nowTexts.has(t)).length
const gz = (file, rows) => writeFileSync(join(out, file), gzipSync(rows.map(l => JSON.stringify(l)).join('\n') + '\n'))
gz('distill.jsonl.gz', kept); gz('mixed.jsonl.gz', kept); gz('excluded-labels.jsonl.gz', excluded)
const result = {built: new Date().toISOString(), datasetCommit, spacy: many('spacy'), sets: setsDir, lines: kept.length, ...count}
writeFileSync(join(out, 'build-labels.json'), JSON.stringify(result, null, 1) + '\n')
console.log(JSON.stringify(result, null, 1))
