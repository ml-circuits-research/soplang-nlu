// Draws a benchmark sample at the level of dataset files, anew for every seed.
//   node tests/benchmark/syntax/draw-sample.mjs <out-file> --seed <text> [--share 0.01] [--dataset <folder>] [--revision HEAD]
// Per area (the folder of a file under semantic/: calendar, diagram, document, drawing) it picks whole files
// at random, smaller files likelier (weight 1/messages, so the sample spreads over many files), until the
// area holds at least share x (the area's messages). The areas thus count in proportion to their sizes.
// No message is excluded: judged or worked-on messages stay eligible. Each distinct text is kept once.
// Writes <out-file> (gzipped JSON array of {id, text}) and beside it sample.lock.json with the seed, the
// commit, the files chosen and the counts per area. An existing sample is replaced only with --overwrite.
import {createHash} from 'node:crypto'
import {existsSync, mkdirSync, writeFileSync} from 'node:fs'
import {basename, dirname, join, resolve} from 'node:path'
import {gzipSync} from 'node:zlib'
import {readArguments, messagesOfCsv, packageRoot} from './lib.mjs'
import {readDataset} from './sample.mjs'

const {words, named} = readArguments(process.argv.slice(2), [])
if (!words[0] || typeof named.seed !== 'string') { console.error('Usage: node tests/benchmark/syntax/draw-sample.mjs <out-file> --seed <text> [--share 0.01]'); process.exit(2) }
const out = resolve(words[0]), share = Number(named.share ?? 0.01), seed = named.seed
const {commit, files} = readDataset(resolve(named.dataset ?? join(packageRoot, '../webmeet-dataset')), typeof named.revision === 'string' ? named.revision : 'HEAD')
const digest = s => createHash('sha256').update(s).digest()
const uniform = s => (digest(s).readUIntBE(0, 6) + 0.5) / 2 ** 48
const seen = new Set(), byArea = {}
for (const {file, content} of files) {
  const messages = []
  for (const {record, text} of messagesOfCsv(content)) { if (!text.trim() || seen.has(text)) continue; seen.add(text); messages.push({id: file + '#' + record, text}) }
  ;(byArea[file.split('/')[0]] ??= []).push({file, messages})
}
const sample = [], chosen = {}, perArea = {}, totals = {}
for (const area of Object.keys(byArea).sort()) {
  const list = byArea[area], total = list.reduce((n, f) => n + f.messages.length, 0), target = Math.ceil(share * total)
  const order = list.filter(f => f.messages.length).map(f => ({f, key: -Math.log(uniform(seed + '\0' + f.file)) * f.messages.length})).sort((a, b) => a.key - b.key)
  let n = 0; chosen[area] = []
  // in the random order, take a file when the area stays within 10% above the target; if the target is still not reached, take the smallest file left
  const take = f => { n += f.messages.length; chosen[area].push(`${f.file} (${f.messages.length})`); sample.push(...f.messages) }
  const rest = []
  for (const {f} of order) { if (n >= target) break; if (n + f.messages.length <= target * 1.1) take(f); else rest.push(f) }
  if (n < target && rest.length) take(rest.reduce((a, b) => b.messages.length < a.messages.length ? b : a))
  perArea[area] = n; totals[area] = total
}
const json = JSON.stringify(sample)
if (existsSync(out) && !named.overwrite) { console.error(out + ' exists'); process.exit(1) }
mkdirSync(dirname(out), {recursive: true})
writeFileSync(out, gzipSync(json))
const lock = {sample: basename(out), seed, share, count: sample.length, dataset: {commit, distinctTexts: seen.size}, areaTotals: totals, areaCounts: perArea, files: chosen,
  sampleSha256: createHash('sha256').update(json).digest('hex'), tool: 'tests/benchmark/syntax/draw-sample.mjs'}
writeFileSync(join(dirname(out), 'sample.lock.json'), JSON.stringify(lock, null, 2) + '\n')
console.log(JSON.stringify({count: sample.length, areaTotals: totals, areaCounts: perArea, files: chosen}, null, 1))
