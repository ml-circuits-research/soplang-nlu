// Suspicion score of spaCy's circuit of one message, with the weights of strategies/rvss/data/silver-audit/score.py
// (eval-results/2026-11-27-silver-audit/key/summary.json: the logistic fit on 3,115 judged circuits), and its level 1..4
// (the cut points of that audit, quantiles .50/.80/.95 of the frame).
// The signals that need the circuit and the text (text, spaCy's circuit, hmm-rules' circuit) are computed here again with
// the code of features.mjs; the signals that need old runs of other strategies (earlier hmm-rules runs, spacy-direct, the
// earlier spaCy circuit, distilbert, the time of spaCy) are not available for a refreshed circuit and stand at the mean
// of the calibration circuits, so they add nothing. The weight of 'differs from both earlier hmm-rules runs' (+.125 per sd)
// and of distilbert's signals are thus lost for the rows that are scored here; see tiers.mjs, which keeps the audit's own
// score for a row whose circuit did not change.
import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {normalForm, agreementKeysOf, relaxedCore, packageRoot} from '../lib.mjs'
import {parseCircuit, wordsOf} from '../../../../lib/syntax.mjs'

const summary = JSON.parse(readFileSync(join(packageRoot, 'eval-results/2026-11-27-silver-audit/key/summary.json'), 'utf8'))
export const model = summary.model
export const boundaries = summary.boundaries

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
function lineKind(line) {
  let m = /^\d+-\d+ (\w+) @/u.exec(line)
  if (m) return ['head', 'dependent', 'verb', 'marker', 'conjunction'].includes(m[1]) ? m[1] : 'modifier-like'
  m = /^clause \S+ (\w+)/u.exec(line)
  if (m) return m[1] === 'form' ? 'form' : 'clause-tie'
  m = /^relation \S+ (\w+)/u.exec(line)
  if (m) return 'relation-' + m[1]
  return /^coordination/u.test(line) ? 'coordination' : 'other'
}
function diffKinds(a, b) {
  const A = new Set(a.split('\n')), B = new Set(b.split('\n')), out = {}
  for (const x of A) if (!B.has(x)) out[lineKind(x)] = (out[lineKind(x)] ?? 0) + 1
  for (const x of B) if (!A.has(x)) out[lineKind(x)] = (out[lineKind(x)] ?? 0) + 1
  return out
}
function compare(sp, other) {
  if (!other) return {v: 0}
  const keys = new Set(sp.keys)
  return {v: 1, core: +(sp.core === other.core), var: +other.keys.some(key => keys.has(key)),
    dist: jaccard(sp.core, other.core), rdist: jaccard(sp.relaxed, other.relaxed), kinds: diffKinds(sp.relaxed, other.relaxed)}
}
function structure(text, c) {
  const wires = parseCircuit(c.sop)
  const s = {clauses: 0, nominals: 0, relations: 0, coords: 0, ambiguous: 0, relNoMarker: 0, relFromNominal: 0, subjects: 0, ellipsis: 0, discourse: 0,
    negation: 0, maxDeps: 0, maxConjuncts: 0, clauseCoords: 0, declarative: 0, interrogative: 0, fragment: 0, otherForm: 0}
  const type = new Map(wires.map(w => [w.id, w.type]))
  for (const w of wires) {
    const keys = w.slots.map(([k]) => k)
    const count = k => keys.filter(x => x === k).length
    if (w.type === 'syntax.clause') {
      s.clauses++; s.subjects += count('subject'); s.ellipsis += count('ellipsis'); s.discourse += count('discourse'); s.negation += count('negation')
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
    let run = 0
    for (const part of parts) {
      const n = (part.match(/[\p{L}\p{N}]+/gu) ?? []).length
      if (n >= 1 && n <= 3) { run++; longestList = Math.max(longestList, run) } else run = n >= 1 && n <= 5 && /\b(and|or)\b/iu.test(part) ? run + 1 : 0
      longestList = Math.max(longestList, run)
    }
  }
  const t = {words: words.length, commas: (text.match(/,/gu) ?? []).length, maxCommas, longestList: longestList >= 2 ? longestList : 0,
    sentences: sentences.length, question: +text.includes('?'), quotes: (text.match(/["“”]|(?<!\p{L})'|'(?!\p{L})/gu) ?? []).length,
    parens: (text.match(/[()[\]]/gu) ?? []).length, colons: (text.match(/(?<!\d):(?!\d)|;/gu) ?? []).length, slashes: (text.match(/\//gu) ?? []).length,
    digits: words.filter(w => /\p{N}/u.test(w.text)).length,
    capsMid: words.filter((w, i) => i > 0 && /^\p{Lu}/u.test(w.text) && !/[.!?]\s*$/u.test(text.slice(0, w.start))).length,
    allCaps: words.filter(w => w.text.length > 1 && /^\p{Lu}+$/u.test(w.text)).length,
    nonAscii: (text.match(/[^\x00-\x7f]/gu) ?? []).length,
    lowerStart: +/^\p{Ll}/u.test(text.trim()), noFinalPunct: +!/[.!?]\s*$/u.test(text)}
  for (const w of FUNCTION_WORDS) t['fw_' + w] = low.filter(x => x === w).length
  return t
}

const KINDS = ['head', 'dependent', 'verb', 'marker', 'conjunction', 'modifier-like', 'form', 'clause-tie', 'relation-to', 'relation-from', 'coordination']
const areaOf = file => { const [area, rest] = file.split('/'); return area + '/' + rest.replace(/\.csv$/u, '').replace(/-[\d.]+$/u, '') }

/** The signals of score.py's features(), by name; null for one that cannot be computed (it then stands at its mean). */
export function signals(file, text, spSop, hmmSop) {
  const c = circuitOf(text, spSop)
  if (!c) return null
  const hc = circuitOf(text, hmmSop)
  const t = textFeatures(text), s = structure(text, c), os = hc ? structure(text, hc) : null
  const hm = compare(c, hc), words = Math.max(1, t.words)
  const g = (d, k, def = 0) => d ? (d[k] ?? def) : def
  const x = {
    'differs from hmm-rules (variants key)': 1 - g(hm, 'var', 0),
    'differs from hmm-rules (core)': 1 - g(hm, 'core', 0),
    'distance to hmm-rules (core lines)': g(hm, 'dist', 1.0),
    'distance to hmm-rules (relaxed core lines)': g(hm, 'rdist', 1.0),
    'log words': Math.log(1 + t.words),
    'commas': t.commas, 'most commas in one sentence': t.maxCommas, 'longest comma list': t.longestList,
    'sentences': t.sentences, 'question mark': t.question, 'quotes': Math.min(1, t.quotes), 'brackets': Math.min(1, t.parens),
    'colon or semicolon': Math.min(1, t.colons), 'slash': Math.min(1, t.slashes), 'words with digits': t.digits / words,
    'capitalised words inside': t.capsMid / words, 'all-caps words': Math.min(1, t.allCaps), 'non-ASCII': Math.min(1, t.nonAscii),
    'starts lower-case': t.lowerStart, 'no final punctuation': t.noFinalPunct,
    'and': t.fw_and, 'or': t.fw_or, 'but': t.fw_but, 'then': t.fw_then, 'so': t.fw_so,
    'if/when/while/because/after/before/until/unless': ['if', 'when', 'while', 'because', 'after', 'before', 'until', 'unless'].reduce((a, w) => a + t['fw_' + w], 0),
    'that/which/who/where': ['that', 'which', 'who', 'where'].reduce((a, w) => a + t['fw_' + w], 0),
    'with': t.fw_with, 'of': t.fw_of, 'to': t.fw_to,
    'clauses': s.clauses, 'coordinations': s.coords, 'coordinations of clauses': s.clauseCoords, 'most conjuncts': s.maxConjuncts,
    'relations per word': s.relations / words, 'nominals per word': s.nominals / words,
    'ambiguous attachments': s.ambiguous, 'relations without marker': s.relNoMarker, 'relations from a nominal': s.relFromNominal,
    'subjects': s.subjects, 'ellipsis': s.ellipsis, 'discourse words': s.discourse, 'negations': s.negation,
    'fragment clauses': s.fragment, 'interrogative clauses': s.interrogative, 'declarative clauses': s.declarative,
    'other clause forms': s.otherForm, 'words in no wire': s.uncovered, 'heads of several words': s.multiHead, 'most dependents of a nominal': s.maxDeps,
    'clauses differ from hmm-rules': Math.abs(s.clauses - (os ? os.clauses : s.clauses)),
    'relations differ from hmm-rules': Math.abs(s.relations - (os ? os.relations : s.relations)),
    'nominals differ from hmm-rules': Math.abs(s.nominals - (os ? os.nominals : s.nominals)),
    'coordinations differ from hmm-rules': Math.abs(s.coords - (os ? os.coords : s.coords)),
  }
  for (const k of KINDS) x[`hmm-rules differs: ${k} lines`] = g(hm.kinds, k, 0)
  x['area ' + areaOf(file)] = 1
  return x
}

/** Probability of rejection (logistic) and level 1..4. A signal that is not computed stands at its mean (no effect). */
export function score(file, text, spSop, hmmSop) {
  const x = signals(file, text, spSop, hmmSop)
  if (!x) return null
  let z = model.intercept
  for (const [name, w] of Object.entries(model.weights)) {
    const v = x[name]
    if (v === undefined) continue
    z += w.perSd * (v - w.mean) / w.sd
  }
  // area weights of the areas the signals() did not set are 0-valued: (0 - mean) / sd still counts, as in score.py
  for (const [name, w] of Object.entries(model.weights)) if (name.startsWith('area ') && x[name] === undefined) z += w.perSd * (0 - w.mean) / w.sd
  const p = 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))))
  return {p, level: 1 + boundaries.filter(c => p > c).length}
}
export const levelOfProbability = p => 1 + boundaries.filter(c => p > c).length
