// What the rvss evaluation scripts share: reading files, the keys under which two circuits count as equal, the
// buckets, and the dataset commit every count must name. The comparison keys are those of
// tests/benchmark/syntax/lib.mjs (normalForm -> core, relaxedCore, agreementKey); nothing here redefines them.
import {readFileSync, existsSync, statSync, readdirSync, lstatSync, realpathSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {execFileSync} from 'node:child_process'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {normalForm, relaxedCore, agreementKey} from '../../../tests/benchmark/syntax/lib.mjs'
import {validateSyntax, wordsOf} from '../../../lib/syntax.mjs'

const here = dirname(fileURLToPath(import.meta.url))
export const packageRoot = resolve(here, '../../..')
export const datasetRoot = resolve(packageRoot, '../webmeet-dataset')
export const benchmarkDir = join(packageRoot, 'eval-results/2026-11-27-syntax-benchmark-random')
export const localData = join(packageRoot, '.local-data/rvss')

/** Rows of a .jsonl, .jsonl.gz, .json or .json.gz file (gzip is recognised by its magic bytes, not by the name). */
export function readRows(file) {
  let buffer = readFileSync(file)
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) buffer = gunzipSync(buffer)
  const text = buffer.toString('utf8')
  const first = text.trimStart()[0]
  if (first === '[') return JSON.parse(text)
  return text.split('\n').filter(line => line.trim()).map((line, index) => {
    try { return JSON.parse(line) } catch (error) { throw new Error(`${file} line ${index + 1}: ${error.message}`) }
  })
}

/** The dataset commit and whether the files the labels and the registry are read from differ from it. */
export function datasetState() {
  const git = (...args) => execFileSync('git', ['-C', datasetRoot, ...args], {encoding: 'utf8'}).trim()
  try {
    const commit = git('rev-parse', '--short', 'HEAD')
    const changed = git('status', '--porcelain', '--', 'syntactic', 'annotations/syntax').split('\n').filter(Boolean).length
    return {commit, changedFiles: changed, text: changed ? `dataset ${commit} plus ${changed} changed or new files under syntactic/ and annotations/syntax/ (read as they are on disk)` : `dataset ${commit} (syntactic/ and annotations/syntax/ as committed)`}
  } catch (error) { return {commit: null, changedFiles: null, text: 'dataset commit unknown: ' + error.message} }
}

/** Case- and space-insensitive form of a text: how the benchmark is held out of training. */
export const squash = text => String(text).toLowerCase().replace(/\s+/gu, ' ').trim()

/**
 * The circuit of a message under the comparison keys of lib.mjs. `valid` is validateSyntax; `core` the core of the
 * normal form (null when invalid); `relaxed` relaxedCore; `variants` agreementKey, computed on demand.
 */
export function circuitOf(text, sop) {
  if (typeof sop !== 'string' || !sop.trim() || typeof text !== 'string') return {valid: false, core: null, normal: null, relaxed: null, variants: () => null, findings: ['no circuit']}
  let check
  try { check = validateSyntax(text, sop) } catch (error) { check = {valid: false, findings: [{code: 'crash: ' + error.message}]} }
  if (!check.valid) return {valid: false, core: null, normal: null, relaxed: null, variants: () => null, findings: [...new Set(check.findings.map(finding => finding.code))]}
  const normal = normalForm(text, sop)
  const core = normal?.core ?? null
  let variants
  return {valid: true, core, normal: normal?.sop ?? sop, relaxed: relaxedCore(core), findings: [],
    variants: () => variants === undefined ? (variants = safeAgreementKey(text, normal?.sop ?? sop)) : variants}
}
function safeAgreementKey(text, sop) { try { return agreementKey(text, sop) } catch { return null } }

/**
 * How two circuits of one message compare: exact (equal core), relaxed (equal relaxedCore: up to the start of
 * every relation with a marker) and variants (equal relaxedCore or equal agreementKey: the key `variants` of
 * writtenAlike in lib.mjs). Each later key holds whenever an earlier one does.
 */
export function compare(a, b) {
  if (!a.core || !b.core) return {exact: false, relaxed: false, variants: false}
  const exact = a.core === b.core
  const relaxed = exact || a.relaxed === b.relaxed
  let variants = relaxed
  if (!variants) { const x = a.variants(), y = b.variants(); variants = x !== null && x === y }
  return {exact, relaxed, variants}
}

/** Length buckets of DESIGN.md (words of wordsOf, punctuation left out). */
export const LENGTH_BUCKETS = ['<10', '10-24', '25-39', '40+']
export const lengthBucket = words => words < 10 ? '<10' : words < 25 ? '10-24' : words < 40 ? '25-39' : '40+'
export const wordCount = text => wordsOf(String(text)).length

/** The area (tab) of a message: `area`, else the first folder of `file`, else the part of `id` before the first "/". */
export function areaOf(row) {
  if (typeof row.area === 'string' && row.area) return row.area
  for (const field of [row.file, row.id]) if (typeof field === 'string' && field.includes('/')) return field.split('/')[0]
  return 'unknown'
}

/**
 * Per-word placement read from a core: for every word, the key that holds it, the wire it stands in (as coreOf names
 * wires: the first word of a clause or nominal, the ties of a relation or coordination) and whether the value starts
 * at it. `role` is the key alone. Words no value covers (impossible in a valid circuit) get null.
 */
export function placementsOf(core, words) {
  const place = new Array(words).fill(null), role = new Array(words).fill(null)
  if (!core) return {place, role}
  for (const line of core.split('\n')) {
    const match = /^(\d+)-(\d+) (\S+) @(.+)$/u.exec(line)
    if (!match) continue
    const first = Number(match[1]), last = Number(match[2])
    for (let word = first; word <= last && word < words; word++) {
      place[word] = `${match[3]} @${match[4]} ${word === first ? 'B' : 'I'}`
      role[word] = match[3]
    }
  }
  return {place, role}
}

/** A percentage with one decimal, or "—". */
export const percent = (count, total) => total ? (100 * count / total).toFixed(1) + '%' : '—'
export const share = (count, total) => total ? +(count / total).toFixed(4) : null

/** Near-copies within one edit: an index of texts by their squashed form and every one-character deletion of it. */
export function nearIndex(texts) {
  const exact = new Set(), deletions = new Map()
  for (const text of texts) {
    const s = squash(text)
    exact.add(s)
    for (const key of deletionsOf(s)) { const list = deletions.get(key); if (list) list.push(s); else deletions.set(key, [s]) }
  }
  return {exact, deletions}
}
function deletionsOf(s) { const out = new Set([s]); for (let i = 0; i < s.length; i++) out.add(s.slice(0, i) + s.slice(i + 1)); return out }
function withinOneEdit(a, b) {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  if (a.length === b.length) { let diff = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++diff > 1) return false; return true }
  const [short, long] = a.length < b.length ? [a, b] : [b, a]
  let i = 0
  while (i < short.length && short[i] === long[i]) i++
  return short.slice(i) === long.slice(i + 1)
}
/** 'exact' (case- and space-insensitive), 'one-edit' (one character inserted, deleted or replaced) or null. */
export function nearMatch(index, text) {
  const s = squash(text)
  if (index.exact.has(s)) return 'exact'
  for (const key of deletionsOf(s)) for (const other of index.deletions.get(key) ?? []) if (withinOneEdit(s, other)) return 'one-edit'
  return null
}

/**
 * Total size in bytes of a file or a folder. The path itself may be a symbolic link (it is resolved); links inside a
 * folder are not followed and not counted. Folders named __pycache__ or node_modules are left out.
 */
export function sizeOnDisk(path) {
  const walk = at => {
    const stat = lstatSync(at)
    if (stat.isFile()) return stat.size
    if (!stat.isDirectory()) return 0
    let total = 0
    for (const name of readdirSync(at)) if (name !== '__pycache__' && name !== 'node_modules') total += walk(join(at, name))
    return total
  }
  return walk(realpathSync(path))
}
export const megabytes = bytes => +(bytes / 1048576).toFixed(1)

/** Reads `--name value` and `--flag` options; the other words stay in order. */
export function parseArguments(argv) {
  const words = [], named = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) { words.push(arg); continue }
    const [key, inline] = arg.slice(2).split(/=(.*)/su)
    const value = inline ?? (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true)
    named[key] = named[key] === undefined ? value : [].concat(named[key], value)
  }
  return {words, named}
}
export const listOf = value => value === undefined ? [] : [].concat(value).flatMap(item => String(item).split(',')).filter(Boolean)
export {existsSync, statSync}
