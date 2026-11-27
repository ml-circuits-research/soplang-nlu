// Removes from the dataset what its syntactic files already hold. The syntactic files are the only
// store of labels; the registry keeps only what a judge decided.
//   node tests/benchmark/syntax/drop-duplicates.mjs [--dataset <folder>] [--apply] [--report <file>]
// Without --apply it checks and reports, and changes nothing.
//
// 1. annotations/syntax/v1/labels.jsonl repeated the labels. It is removed when every line of it is
//    the circuit of its message in the syntactic files (the same text, the same circuit). When a line
//    differs, the lines that differ are listed and the file stays.
// 2. annotations/syntax/v1/judged/*.jsonl: a line with judge "agreement" says that formalizers wrote
//    a circuit alike. The accepted_by cell of the syntactic file says the same. Such a line is
//    removed when the cell of its message holds that circuit with accepted_by "agreement", or holds
//    a circuit that a judge accepted or wrote later. Any other agreement line stays and is listed:
//    removing it would lose something. A registry file left with no line is removed.
// Nothing here changes a syntactic file.
import {existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync} from 'node:fs'
import {join, relative, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {readArguments, readJsonl, writeJsonl, readLabels, normalForm, packageRoot} from './lib.mjs'

const sameCircuit = (text, one, other) => one === other || (normalForm(text, one)?.core ?? 1) === (normalForm(text, other)?.core ?? 2)

/**
 * The lines of a labels file against the labels of the syntactic files.
 * @returns {lines, same, differ: [{text, why, label, cell}]}
 */
export function checkLabelsFile(lines, labels) {
  const differ = []
  for (const line of lines) {
    const cell = labels.get(line.text)
    if (!labels.files.has(line.text)) differ.push({text: line.text, why: 'the message has no row in the syntactic files', label: line.label})
    else if (!cell) differ.push({text: line.text, why: 'the cell of the message is empty', label: line.label})
    else if (!sameCircuit(line.text, line.label, cell.label)) differ.push({text: line.text, why: 'the cell holds another circuit', label: line.label, cell: cell.label})
  }
  return {lines: lines.length, same: lines.length - differ.length, differ}
}
/**
 * The lines of one registry file: which to keep.
 * @returns {kept: [line], removed, judged, stay: [{text, why, sop, cell}]}: `kept` are the lines of
 *   the file as it is to be; `stay` are the agreement lines among them
 */
export function checkRegistryLines(lines, labels) {
  const kept = [], stay = []
  let removed = 0, judged = 0
  for (const line of lines) {
    if (line.judge !== 'agreement') { kept.push(line); judged++; continue }
    const cell = labels.get(line.text)
    const said = cell && (cell.accepted_by === 'agreement' ? sameCircuit(line.text, line.sop, cell.label) : ['judge', 'written'].includes(cell.accepted_by))
    if (said) { removed++; continue }
    kept.push(line)
    stay.push({text: line.text, why: !labels.files.has(line.text) ? 'the message has no row in the syntactic files' : !cell ? 'the cell of the message is empty' : 'the cell holds another circuit settled by agreement', sop: line.sop, cell: cell?.label ?? null})
  }
  return {kept, removed, judged, stay}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const {named} = readArguments(process.argv.slice(2))
  const dataset = resolve(typeof named.dataset === 'string' ? named.dataset : join(packageRoot, '../webmeet-dataset')), apply = Boolean(named.apply)
  const labelsFile = join(dataset, 'annotations/syntax/v1/labels.jsonl'), registryDir = join(dataset, 'annotations/syntax/v1/judged')
  const labels = readLabels(join(dataset, 'syntactic'))
  const megabytes = bytes => (bytes / 1e6).toFixed(1) + ' MB'
  const report = {dataset, applied: apply, syntactic: {messages: labels.files.size, withACircuit: labels.size}}
  console.log(`Syntactic files: ${labels.files.size} messages, ${labels.size} with a circuit.`)

  // 1. the labels file
  if (existsSync(labelsFile)) {
    const size = statSync(labelsFile).size, check = checkLabelsFile(readJsonl(labelsFile), labels)
    const onlyThere = labels.size - new Set(readJsonl(labelsFile).map(line => line.text).filter(text => labels.has(text))).size
    report.labelsFile = {bytes: size, lines: check.lines, sameAsTheSyntacticFiles: check.same, differ: check.differ, circuitsOfTheSyntacticFilesNotInIt: onlyThere, removed: false}
    console.log(`labels.jsonl: ${check.lines} lines, ${megabytes(size)}. ${check.same} are the circuit of their message in the syntactic files; ${check.differ.length} differ.`)
    for (const line of check.differ.slice(0, 20)) console.log(`  ${JSON.stringify(line.text)}: ${line.why}`)
    if (check.differ.length) console.log('  The file stays: removing it would lose these labels.')
    else if (apply) { unlinkSync(labelsFile); report.labelsFile.removed = true; console.log('  Removed.') }
    else console.log('  It can be removed (--apply).')
  } else console.log('labels.jsonl: there is no such file.')

  // 2. the registry
  const names = existsSync(registryDir) ? readdirSync(registryDir).filter(name => name.endsWith('.jsonl')).sort() : []
  const registry = {files: names.length, bytes: 0, lines: 0, judgeLines: 0, agreementLines: 0, removedLines: 0, stay: [], filesRewritten: 0, filesRemoved: 0, bytesAfter: 0}
  for (const name of names) {
    const file = join(registryDir, name), lines = readJsonl(file), check = checkRegistryLines(lines, labels)
    registry.bytes += statSync(file).size
    registry.lines += lines.length; registry.judgeLines += check.judged; registry.agreementLines += lines.length - check.judged; registry.removedLines += check.removed
    registry.stay.push(...check.stay.map(line => ({file: name, ...line})))
    if (!check.removed) { registry.bytesAfter += statSync(file).size; continue }
    if (!check.kept.length) { registry.filesRemoved++; if (apply) unlinkSync(file); continue }
    registry.filesRewritten++
    const content = check.kept.map(line => JSON.stringify(line)).join('\n') + '\n'
    registry.bytesAfter += Buffer.byteLength(content)
    if (apply) writeFileSync(file, content)
  }
  report.registry = registry
  console.log(`Registry: ${registry.files} files, ${registry.lines} lines, ${megabytes(registry.bytes)}: ${registry.judgeLines} lines of a judge, ${registry.agreementLines} with judge "agreement".`)
  console.log(`  ${registry.removedLines} agreement lines repeat the syntactic files and ${apply ? 'were' : 'can be'} removed: ${registry.filesRewritten} files rewritten, ${registry.filesRemoved} files left with no line and removed. The registry ${apply ? 'now takes' : 'would take'} ${megabytes(registry.bytesAfter)}.`)
  if (registry.stay.length) {
    console.log(`  ${registry.stay.length} agreement lines stay, because the syntactic files do not say the same:`)
    for (const line of registry.stay) console.log(`    ${line.file}: ${JSON.stringify(line.text)}: ${line.why}`)
  }
  if (typeof named.report === 'string') { writeJsonl(resolve(named.report), [report]); console.log(`Report: ${relative(process.cwd(), resolve(named.report))}`) }
}
