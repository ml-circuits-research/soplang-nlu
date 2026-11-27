// Leakage check: benchmark texts (and near-duplicates) in the training data of the two prototypes.
//   node leak.mjs
import {readFileSync, writeFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const S = '/tmp/claude-1000/-home-salboaie-work-sopworlds/e235462f-8553-42ea-b357-85307b023a32/scratchpad/learned/'
const {readSample, readLabels} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const lines = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const bench = readSample(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz').map(r => r.text)

const squash = t => t.toLowerCase().replace(/\s+/gu, ' ').trim()
const alnum = t => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
const wordsLow = t => t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
const template = t => t.replace(/\d+/gu, '#').replace(/\b\p{Lu}[\p{L}]*/gu, 'X').toLowerCase().replace(/\s+/gu, ' ').trim()
const del1 = s => { const out = new Set([s]); for (let i = 0; i < s.length; i++) out.add(s.slice(0, i) + s.slice(i + 1)); return out }
const wdel1 = ws => { const out = new Set([ws.join(' ')]); for (let i = 0; i < ws.length; i++) out.add(ws.slice(0, i).concat(ws.slice(i + 1)).join(' ')); return out }

function index(texts) {
  const ix = {exact: new Set(), squash: new Set(), alnum: new Set(), char1: new Map(), word1: new Map(), template: new Set()}
  for (const t of texts) {
    ix.exact.add(t); ix.squash.add(squash(t)); const a = alnum(t); ix.alnum.add(a); ix.template.add(template(t))
    if (a.length >= 12) for (const k of del1(a)) { if (!ix.char1.has(k)) ix.char1.set(k, t) }
    const ws = wordsLow(t); if (ws.length >= 5) for (const k of wdel1(ws)) { if (!ix.word1.has(k)) ix.word1.set(k, t) }
  }
  return ix
}
// the strongest level of match of a benchmark text in an index
function level(ix, t) {
  if (ix.exact.has(t)) return {level: 'exact'}
  if (ix.squash.has(squash(t))) return {level: 'case-space'}
  const a = alnum(t)
  if (ix.alnum.has(a)) return {level: 'punct-space'}
  if (a.length >= 12) for (const k of del1(a)) if (ix.char1.has(k)) return {level: 'one-char-edit', with: ix.char1.get(k)}
  const ws = wordsLow(t)
  if (ws.length >= 5) for (const k of wdel1(ws)) if (ix.word1.has(k)) return {level: 'one-word-edit', with: ix.word1.get(k)}
  if (ix.template.has(template(t))) return {level: 'template'}
  return {level: 'none'}
}
const parserData = JSON.parse(gunzipSync(readFileSync(S + 'parser/data2.json.gz')))
const sets = {
  'parser train (used: projective, encodable)': parserData.filter(x => x.split === 'train' && x.heads && x.proj).map(x => x.text),
  'parser train+dev (all rows)': parserData.filter(x => x.split !== 'bench').map(x => x.text),
  'ft gold-train corpus (gold2)': lines(S + 'review/corpus-gold-train.jsonl').map(x => x.text),
  'ft gold+silver corpus (silver)': lines(S + 'review/corpus-gold-plus-silver-train.jsonl').map(x => x.text),
  'ft data/*-train.jsonl': [...lines(S + 'spacy-finetune/data/gold-train.jsonl'), ...lines(S + 'spacy-finetune/data/silver-train.jsonl')].map(x => x.text),
}
// also: parser rows marked bench carry no tree?
console.log('parser bench rows with a tree:', parserData.filter(x => x.split === 'bench' && x.heads).length, 'bench rows', parserData.filter(x => x.split === 'bench').length)
const result = {}, perBench = {}
for (const [name, texts] of Object.entries(sets)) {
  const ix = index(texts)
  const c = {size: texts.length}, examples = {}
  perBench[name] = new Map()
  for (const t of bench) { const l = level(ix, t); c[l.level] = (c[l.level] ?? 0) + 1; perBench[name].set(t, l.level); if (l.with && (examples[l.level]?.length ?? 0) < 4) (examples[l.level] ??= []).push([t, l.with]) }
  result[name] = c
  console.log('\n' + name, JSON.stringify(c))
  for (const [k, ex] of Object.entries(examples)) for (const [a, b] of ex) console.log(`  ${k}: BENCH ${JSON.stringify(a.slice(0, 110))}\n      TRAIN ${JSON.stringify(b.slice(0, 110))}`)
}
// case-space hits for the parser: which ones
const pix = index(sets['parser train (used: projective, encodable)'])
for (const t of bench) { const l = level(pix, t); if (l.level === 'case-space' || l.level === 'punct-space') console.log('parser', l.level, JSON.stringify(t)) }
writeFileSync(S + 'review/leak-levels.json', JSON.stringify(Object.fromEntries(Object.entries(perBench).map(([k, m]) => [k, Object.fromEntries(m)]))))
