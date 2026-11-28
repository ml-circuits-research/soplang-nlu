// Cheap signals of how likely spaCy's circuit of a message is wrong, for every message of the batch conversion
// (eval-results/conversion/<folder>/), with every judged verdict that exists for that circuit. No language model.
//   node features.mjs <out-dir> <folder> [<folder> ...]
// Writes <out-dir>/<folder>.jsonl, one line per message of the folder's spacy.jsonl (the current spaCy strategy).
// The other circuits compared with spaCy's, each by core, by relaxedCore and by the 'variants' agreement key
// (tests/benchmark/syntax/lib.mjs agreementKeysOf):
//   hmm      <folder>/vss.jsonl            hmm-rules, the run the folder was settled with
//   hmm2     <folder>/run2/vss.jsonl       hmm-rules, an earlier run
//   hmm1     <folder>/first-run/vss.jsonl  hmm-rules, the first run
//   sp2      <folder>/run2/spacy.jsonl     spaCy, an earlier run
//   spd      <folder>/first-run/spacy-direct.jsonl
//   db       <folder>/first-run/distilbert.jsonl (6 calendar folders only), else the benchmark's distilbert.jsonl
//            for a benchmark message
// Verdicts of spaCy's circuit: the registry (newest line counts, lookup), the judge verdicts of the folder's own
// run (judging/verdicts-k.jsonl) and of the benchmark run.
import {readFileSync, existsSync, mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {gunzipSync} from 'node:zlib'

const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const lib = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {normalForm, agreementKeysOf, relaxedCore, readRegistry, lookup, readLabels, readRunVerdicts, readLabelsBefore, levelOf} = lib
const {parseCircuit, wordsOf} = await import(root + 'lib/syntax.mjs')

const conversion = root + 'eval-results/conversion/'
const benchDir = root + 'eval-results/2026-11-27-syntax-benchmark-random'
const [outDir, ...folders] = process.argv.slice(2)
mkdirSync(outDir, {recursive: true})

const lines = file => existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : null
const byId = rows => rows ? new Map(rows.map(row => [row.id ?? row.text, row])) : null

// ---- shared context, read once per process
const registry = readRegistry()
const labels = readLabels()
const benchSample = JSON.parse(gunzipSync(readFileSync(join(benchDir, 'sample.json.gz'))))
const benchTexts = benchSample.map(row => row.text)
const benchRun = readRunVerdicts(benchDir).verdicts
const benchBefore = readLabelsBefore(benchDir, new Map())
const benchOut = name => new Map((lines(join(benchDir, name + '.jsonl')) ?? []).map(row => [row.text, row]))
const benchSpacy = benchOut('spacy'), benchDistil = benchOut('distilbert')

// near-copies of benchmark messages (the levels of experiments/syntax-learned/review/leak.mjs, up to one edit)
const squash = t => t.toLowerCase().replace(/\s+/gu, ' ').trim()
const alnum = t => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
const wordsLow = t => t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
const del1 = s => { const out = new Set([s]); for (let i = 0; i < s.length; i++) out.add(s.slice(0, i) + s.slice(i + 1)); return out }
const wdel1 = ws => { const out = new Set([ws.join(' ')]); for (let i = 0; i < ws.length; i++) out.add(ws.slice(0, i).concat(ws.slice(i + 1)).join(' ')); return out }
const ix = {exact: new Set(), squash: new Set(), alnum: new Set(), char1: new Set(), word1: new Set()}
for (const t of benchTexts) {
  ix.exact.add(t); ix.squash.add(squash(t)); const a = alnum(t); ix.alnum.add(a)
  if (a.length >= 12) for (const k of del1(a)) ix.char1.add(k)
  const ws = wordsLow(t); if (ws.length >= 5) for (const k of wdel1(ws)) ix.word1.add(k)
}
function benchLevel(t) {
  if (ix.exact.has(t)) return 'exact'
  if (ix.squash.has(squash(t))) return 'case-space'
  const a = alnum(t)
  if (ix.alnum.has(a)) return 'punct-space'
  if (a.length >= 12) for (const k of del1(a)) if (ix.char1.has(k)) return 'one-char-edit'
  const ws = wordsLow(t)
  if (ws.length >= 5) for (const k of wdel1(ws)) if (ix.word1.has(k)) return 'one-word-edit'
  return null
}

// ---- features of one circuit and of the text
const circuitOf = (text, sop) => {
  if (!sop) return null
  const normal = normalForm(text, sop)
  if (!normal?.core) return null
  return {sop: normal.sop, core: normal.core, keys: agreementKeysOf(text, {sop: normal.sop, core: normal.core}, 'variants'), relaxed: relaxedCore(normal.core)}
}
const jaccard = (a, b) => {
  const A = new Set(a.split('\n')), B = new Set(b.split('\n'))
  let both = 0
  for (const x of A) if (B.has(x)) both++
  return 1 - both / (A.size + B.size - both || 1)
}
// the kind of a line of a (relaxed) core: a span with its key, a tie of a clause, its form, a relation's end, a conjunct
export function lineKind(line) {
  let m = /^\d+-\d+ (\w+) @/u.exec(line)
  if (m) return ['head', 'dependent', 'verb', 'marker', 'conjunction'].includes(m[1]) ? m[1] : 'modifier-like'
  m = /^clause \S+ (\w+)/u.exec(line)
  if (m) return m[1] === 'form' ? 'form' : 'clause-tie'
  m = /^relation \S+ (\w+)/u.exec(line)
  if (m) return 'relation-' + m[1]
  return /^coordination/u.test(line) ? 'coordination' : 'other'
}
export function diffKinds(a, b) {
  const A = new Set(a.split('\n')), B = new Set(b.split('\n')), out = {}
  for (const x of A) if (!B.has(x)) out[lineKind(x)] = (out[lineKind(x)] ?? 0) + 1
  for (const x of B) if (!A.has(x)) out[lineKind(x)] = (out[lineKind(x)] ?? 0) + 1
  return out
}
function compare(sp, other, kinds = false) {
  if (!other) return {v: 0}
  const keys = new Set(sp.keys)
  return {v: 1, core: +(sp.core === other.core), rel: +(sp.relaxed === other.relaxed), var: +other.keys.some(key => keys.has(key)),
    dist: +jaccard(sp.core, other.core).toFixed(4), rdist: +jaccard(sp.relaxed, other.relaxed).toFixed(4), ...kinds ? {kinds: diffKinds(sp.relaxed, other.relaxed)} : {}}
}
function structure(text, c) {
  const wires = parseCircuit(c.sop)
  const s = {clauses: 0, nominals: 0, relations: 0, coords: 0, ambiguous: 0, relNoMarker: 0, relFromNominal: 0, subjects: 0, complements: 0,
    ellipsis: 0, discourse: 0, negation: 0, auxiliary: 0, modifier: 0, maxDeps: 0, maxConjuncts: 0, clauseCoords: 0,
    imperative: 0, declarative: 0, interrogative: 0, fragment: 0, otherForm: 0}
  const type = new Map(wires.map(w => [w.id, w.type]))
  for (const w of wires) {
    const keys = w.slots.map(([k]) => k)
    const count = k => keys.filter(x => x === k).length
    if (w.type === 'syntax.clause') {
      s.clauses++; s.subjects += count('subject'); s.complements += count('complement'); s.ellipsis += count('ellipsis')
      s.discourse += count('discourse'); s.negation += count('negation'); s.auxiliary += count('auxiliary'); s.modifier += count('modifier')
      const form = w.slots.find(([k]) => k === 'form')?.[1]
      if (['imperative', 'declarative', 'interrogative', 'fragment'].includes(form)) s[form]++; else s.otherForm++
    } else if (w.type === 'syntax.nominal') {
      s.nominals++; s.maxDeps = Math.max(s.maxDeps, count('dependent'))
    } else if (w.type === 'syntax.relation') {
      s.relations++
      if (w.slots.some(([k, v]) => k === 'attachment' && v === 'ambiguous')) s.ambiguous++
      if (!keys.includes('marker')) s.relNoMarker++
      const from = w.slots.find(([k]) => k === 'from')?.[1]?.slice(1)
      if (from && type.get(from) === 'syntax.nominal') s.relFromNominal++
    } else if (w.type === 'syntax.coordination') {
      s.coords++; const conj = w.slots.filter(([k]) => k === 'conjunct').map(([, v]) => type.get(v.slice(1)))
      s.maxConjuncts = Math.max(s.maxConjuncts, conj.length)
      if (conj.includes('syntax.clause')) s.clauseCoords++
    }
  }
  // words of the message in no wire, and heads of several words, from the core's spans
  const words = wordsOf(text), covered = new Set()
  let multiHead = 0
  for (const m of c.core.matchAll(/^(\d+)-(\d+) (\w+) @/gmu)) {
    const a = +m[1], b = +m[2]
    for (let i = a; i <= b; i++) covered.add(i)
    if (m[3] === 'head' && b > a) multiHead++
  }
  s.uncovered = words.length - covered.size
  s.multiHead = multiHead
  return s
}
const FUNCTION_WORDS = ['and', 'or', 'but', 'then', 'so', 'if', 'when', 'while', 'because', 'after', 'before', 'until', 'unless', 'that', 'which', 'who', 'where', 'with', 'of', 'to']
function textFeatures(text) {
  const words = wordsOf(text), low = words.map(w => w.text.toLowerCase())
  const sentences = text.split(/(?<=[.!?])\s+/u).filter(s => s.trim())
  let maxCommas = 0, longestList = 0
  for (const sentence of sentences) {
    const parts = sentence.split(',')
    maxCommas = Math.max(maxCommas, parts.length - 1)
    // a run of comma-separated short segments (at most three words each) is a list
    let run = 0
    for (const part of parts) {
      const n = (part.match(/[\p{L}\p{N}]+/gu) ?? []).length
      if (n >= 1 && n <= 3) { run++; longestList = Math.max(longestList, run) } else run = n >= 1 && n <= 5 && /\b(and|or)\b/iu.test(part) ? run + 1 : 0
      longestList = Math.max(longestList, run)
    }
  }
  const t = {words: words.length, chars: text.length, commas: (text.match(/,/gu) ?? []).length, maxCommas, longestList: longestList >= 2 ? longestList : 0,
    sentences: sentences.length, question: +text.includes('?'), quotes: (text.match(/["“”]|(?<!\p{L})'|'(?!\p{L})/gu) ?? []).length,
    parens: (text.match(/[()[\]]/gu) ?? []).length, colons: (text.match(/(?<!\d):(?!\d)|;/gu) ?? []).length, slashes: (text.match(/\//gu) ?? []).length,
    digits: words.filter(w => /\p{N}/u.test(w.text)).length,
    capsMid: words.filter((w, i) => i > 0 && /^\p{Lu}/u.test(w.text) && !/[.!?]\s*$/u.test(text.slice(0, w.start))).length,
    allCaps: words.filter(w => w.text.length > 1 && /^\p{Lu}+$/u.test(w.text)).length,
    nonAscii: (text.match(/[^\x00-\x7f]/gu) ?? []).length, newline: +/\n/u.test(text),
    lowerStart: +/^\p{Ll}/u.test(text.trim()), noFinalPunct: +!/[.!?]\s*$/u.test(text)}
  for (const w of FUNCTION_WORDS) t['fw_' + w] = low.filter(x => x === w).length
  return t
}
const verdictOfRun = (run, text, core) => {
  const v = run.get(text)?.get(core)
  return v && v.by === 'judge' ? {verdict: v.grade === 'L8' ? 'accepted' : 'rejected', grade: v.grade} : null
}

for (const folder of folders) {
  const dir = join(conversion, folder)
  const sp = lines(join(dir, 'spacy.jsonl'))
  const others = {hmm: byId(lines(join(dir, 'vss.jsonl'))), hmm2: byId(lines(join(dir, 'run2/vss.jsonl'))), hmm1: byId(lines(join(dir, 'first-run/vss.jsonl'))),
    sp2: byId(lines(join(dir, 'run2/spacy.jsonl'))), spd: byId(lines(join(dir, 'first-run/spacy-direct.jsonl'))), dbfr: byId(lines(join(dir, 'first-run/distilbert.jsonl')))}
  const run = readRunVerdicts(dir).verdicts
  const out = []
  for (const row of sp) {
    const text = row.text, c = circuitOf(text, row.sop)
    const area = folder.split('__')[0], sub = folder.split('__')[1].replace(/-[\d.]+$/u, '')
    const rec = {id: row.id, folder, area, sub, text, ms: row.ms, error: row.error ?? null, bench: benchLevel(text), valid: +Boolean(c), sop: c?.sop ?? row.sop ?? null}
    rec.t = textFeatures(text)
    const label = labels.get(text)
    rec.label = label ? {by: label.accepted_by, source: label.source} : null
    if (c) {
      rec.s = structure(text, c)
      rec.cmp = {}, rec.os = {}
      for (const [name, map] of Object.entries(others)) {
        if (!map) continue
        const o = map.get(row.id)
        const oc = o && o.text === text ? circuitOf(text, o.sop) : null
        rec.cmp[name] = compare(c, oc, name === 'hmm')
        if (name === 'hmm' && oc) { const os = structure(text, oc); rec.os = {clauses: os.clauses, relations: os.relations, nominals: os.nominals, coords: os.coords, uncovered: os.uncovered} }
      }
      if (!others.dbfr && benchDistil.has(text)) rec.cmp.dbb = compare(c, circuitOf(text, benchDistil.get(text).sop), true)
      if (label) { const lc = label.core; rec.label.core = +(lc === c.core); const lk = lc ? agreementKeysOf(text, {sop: label.label, core: lc}, 'variants') : []; rec.label.var = +lk.some(k => c.keys.includes(k)) }
      const reg = lookup(registry, text, c.core)
      rec.reg = reg ? {verdict: reg.verdict, grade: reg.grade ?? null, judge: reg.judge ?? null, run: reg.run ?? null} : null
      rec.run = verdictOfRun(run, text, c.core)
      rec.benchRun = verdictOfRun(benchRun, text, c.core)
      // other circuits of the message the registry knows (newest line), not written alike with spaCy's
      let acceptedOther = 0, rejectedOther = 0
      for (const [core, line] of registry.byText.get(text) ?? []) {
        if (core === c.core || line.judge === 'agreement') continue
        const lk = agreementKeysOf(text, {sop: line.sop, core}, 'variants')
        if (lk.some(k => c.keys.includes(k))) continue
        if (line.verdict === 'accepted') acceptedOther++; else rejectedOther++
      }
      rec.regOther = {accepted: acceptedOther, rejected: rejectedOther}
      if (benchSpacy.has(text)) {
        const b = benchSpacy.get(text), bc = circuitOf(text, b.sop)
        rec.benchSpacySame = +(bc?.core === c.core)
        if (bc) rec.benchLevelOfSpacy = levelOf({text, core: bc.core}, registry, benchRun, benchBefore, labels)
      }
    }
    out.push(rec)
  }
  writeFileSync(join(outDir, folder + '.jsonl'), out.map(r => JSON.stringify(r)).join('\n') + '\n')
  console.log(folder, out.length)
}
