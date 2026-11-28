// Draws a random sample of the messages of the dataset.
//   node tests/benchmark/syntax/sample.mjs <out-file> [--share 0.01] [--seed <text>] [--exclude <sample files…>]
//        [--dataset <folder>] [--revision HEAD]
// It reads the `text` column of every CSV file under `semantic/` of the dataset, as committed at the
// revision, and keeps each distinct text once, under the id of its first record
// (`<tab>/<file>#<record>`, the id the earlier samples use). The files under `syntactic/` hold the
// same messages with other circuits and are never read as a source. The distinct texts are put in a
// random order fixed by the seed; the sample
// is the first share of them, counted on all distinct texts, that stand in no excluded sample file.
// Writes <out-file>, a gzipped JSON array of {id, text} in the order drawn, and beside it a
// .lock.json with the seed, the share, the dataset commit and the count.
// An existing sample is never replaced by another one.
// The dataset is read through git (`rev-parse`, `ls-tree`, `show`), which changes nothing: the
// working files of the dataset can hold edits that are not committed.
import {execFileSync} from 'node:child_process'
import {createHash, randomBytes} from 'node:crypto'
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {basename, dirname, join, relative, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {gzipSync} from 'node:zlib'
import {readArguments, readSample, readJson, writeJson, messagesOfCsv, packageRoot} from './lib.mjs'

export {messagesOfCsv}

const digest = value => createHash('sha256').update(value).digest('hex')

/**
 * Every distinct text once, under the id of its first record.
 * @param files [{file, content}] in the order of their names
 * @returns {messages: [{id, text}], rows}
 */
export function distinctMessages(files) {
  const seen = new Set(), messages = []
  let rows = 0
  for (const {file, content} of files) for (const {record, text} of messagesOfCsv(content)) {
    rows++
    if (!text.trim() || seen.has(text)) continue
    seen.add(text)
    messages.push({id: file + '#' + record, text})
  }
  return {messages, rows}
}

/**
 * @param messages distinct messages [{id, text}]
 * @param excluded a Set of texts that must not be drawn
 * @returns the sample: the first round(share × messages) of the seeded order that are not excluded
 */
export function drawSample(messages, {seed, share, excluded = new Set()}) {
  if (!(share > 0 && share <= 1)) throw new RangeError('The share is a number above 0 and at most 1.')
  const count = Math.round(messages.length * share)
  const ordered = messages.map(message => ({message, place: digest(seed + '\0' + message.text)})).sort((a, b) => a.place < b.place ? -1 : a.place > b.place ? 1 : 0)
  const sample = []
  for (const {message} of ordered) {
    if (sample.length === count) break
    if (!excluded.has(message.text)) sample.push(message)
  }
  if (sample.length < count) throw new Error(`Only ${sample.length} messages are left after the exclusions; the share asks for ${count}.`)
  return sample
}

/**
 * The message files among the files of a commit, as [path in the commit, name used in ids].
 * The messages are the CSV files under `semantic/`, and under `syntactic/general/` (area "general", no semantic file); an id names a file without the first folder. A commit
 * from before the dataset had the folder holds the message files at its root.
 */
export function messageFiles(paths) {
  const csv = paths.filter(path => path.endsWith('.csv')).sort()
  const semantic = csv.filter(path => path.startsWith('semantic/'))
  // the general messages (since 2026-11-28) stand in the syntactic layer only: syntactic/general/<name>/NNNN.csv is the area "general"
  const general = csv.filter(path => path.startsWith('syntactic/general/')).map(path => [path, path.slice('syntactic/'.length)])
  if (semantic.length) return [...semantic.map(path => [path, path.slice('semantic/'.length)]), ...general]
  return csv.filter(path => !/^(syntactic|annotations|tools)\//u.test(path)).map(path => [path, path])
}
/** The message files of the dataset as committed at a revision: {commit, files: [{file, content}]}. */
export function readDataset(dataset, revision = 'HEAD') {
  const git = (...args) => execFileSync('git', ['-C', dataset, ...args], {encoding: 'utf8', maxBuffer: 512 * 1024 * 1024})
  const commit = git('rev-parse', '--verify', revision + '^{commit}').trim()
  const files = messageFiles(git('ls-tree', '-r', '--name-only', '-z', commit).split('\0'))
  return {commit, files: files.map(([path, file]) => ({file, content: git('show', commit + ':' + path)}))}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const {words, named} = readArguments(process.argv.slice(2), ['exclude'])
  if (!words[0]) { console.error('Usage: node tests/benchmark/syntax/sample.mjs <out-file> [--share 0.01] [--seed <text>] [--exclude <sample files…>]'); process.exit(2) }
  const outFile = resolve(words[0]), lockFile = join(dirname(outFile), basename(outFile).replace(/(\.json)?(\.gz)?$/u, '') + '.lock.json')
  const share = Number(named.share ?? 0.01), seed = typeof named.seed === 'string' ? named.seed : randomBytes(12).toString('hex')
  const datasetDir = resolve(named.dataset ?? join(packageRoot, '../webmeet-dataset'))
  const {commit, files} = readDataset(datasetDir, typeof named.revision === 'string' ? named.revision : 'HEAD')
  const {messages, rows} = distinctMessages(files)
  const inDataset = new Set(messages.map(message => message.text)), excluded = new Set(), exclusions = []
  for (const name of named.exclude ?? []) {
    const texts = new Set(readSample(resolve(name)).map(row => row.text))
    for (const text of texts) excluded.add(text)
    exclusions.push({file: relative(packageRoot, resolve(name)), sha256: digest(readFileSync(resolve(name))), messages: texts.size, inTheDataset: [...texts].filter(text => inDataset.has(text)).length})
  }
  const sample = drawSample(messages, {seed, share, excluded})
  const json = JSON.stringify(sample)
  const lock = {sample: basename(outFile), seed, share, count: sample.length,
    dataset: {commit, csvFiles: files.length, records: rows, distinctTexts: messages.length},
    excluded: exclusions, sampleSha256: digest(json),
    method: 'The distinct texts of the dataset are ordered by sha256(seed + "\\0" + text). The sample is the first round(share × distinct texts) of them that stand in no excluded file. A text carries the id of its first record.',
    tool: 'tests/benchmark/syntax/sample.mjs'}
  if (existsSync(outFile)) {
    if (JSON.stringify(readSample(outFile)) !== json) { console.error(`${outFile} already holds another sample: choose another file.`); process.exit(1) }
    if (!existsSync(lockFile) || JSON.stringify(readJson(lockFile)) !== JSON.stringify(lock)) writeJson(lockFile, lock)
    console.log(`${outFile} already holds this sample: ${sample.length} messages.`)
  } else {
    mkdirSync(dirname(outFile), {recursive: true})
    writeFileSync(outFile, gzipSync(json))
    writeJson(lockFile, lock)
    console.log(`Dataset commit ${commit}: ${files.length} CSV files, ${rows} records, ${messages.length} distinct texts.`)
    for (const exclusion of exclusions) console.log(`Excluded: ${exclusion.file}, ${exclusion.messages} messages, ${exclusion.inTheDataset} of them among the distinct texts.`)
    console.log(`Sample: ${sample.length} messages (share ${share}, seed ${JSON.stringify(seed)}), written to ${outFile} and ${lockFile}`)
  }
}
