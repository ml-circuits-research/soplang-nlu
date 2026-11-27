// Checks the Markdown documentation: docs/**/*.md and the repository's README.md.
//   node docs/tools/check-docs.mjs            short report
//   node docs/tools/check-docs.mjs --verbose  every warning too
// Node.js only, no dependencies. Exit code 1 when a fault is found, else 0.
//
// Faults (the rules of this documentation, see docs/README.md):
//   - a relative link to a file that does not exist, or to a heading anchor that is not there
//     (anchors are computed as GitHub computes them; in an .html file, an id or name attribute);
//   - a table with more than 2 columns;
//   - a page under docs/ whose first line is not a breadcrumb that starts with [Home](…README.md);
//   - a page under docs/ with no "Next:" or no "Up:" link in its last lines;
//   - a page under docs/ that cannot be reached from docs/README.md by following links.
//   The home page docs/README.md needs no breadcrumb and no Up link.
// Warnings:
//   - a table whose first column holds more than 20 characters of visible text;
//   - no "This page: … Kind: …" line near the top;
//   - a page shorter than 60 or longer than 180 lines (pointer pages, the generated copy of the journal
//     docs/status/journal.md and the short generated status pages exempt);
//   - a line of a code block longer than 70 characters (a circuit copied from the code may be).
// Not checked: links to web sites, and files outside the repository.
// docs/status/now.md is skipped: it is an input of docs/status/build.mjs, embedded in STATUS.md.
// STATUS.md and the pages under docs/status/ are written by docs/status/build.mjs: a fault there is
// mended in the generator (or in now.md), and the pages built again.
import {readFileSync, readdirSync, existsSync, statSync} from 'node:fs'
import {dirname, join, relative, resolve, sep} from 'node:path'
import {fileURLToPath} from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const docs = resolve(here, '..')
const root = resolve(docs, '..')
const home = join(docs, 'README.md')
const verbose = process.argv.includes('--verbose')
const SKIP = new Set([join(docs, 'status/now.md')])
// generated pages whose length follows the data, not the writer: a copy of the journal, and one-table pages
const GENERATED = new Set(['journal.md', 'dataset.md', 'progress.md'].map(name => join(docs, 'status', name)))
const FIRST_COLUMN = 20, CODE_LINE = 70, SHORT = 60, LONG = 180

const rel = path => relative(root, path).split(sep).join('/')
function markdownFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...markdownFiles(path))
    else if (entry.name.endsWith('.md') && !SKIP.has(path)) found.push(path)
  }
  return found.sort()
}

// ---- reading a page: its lines outside code blocks, its anchors, links and tables
const FENCE = /^\s{0,3}(`{3,}|~{3,})/u
/** Lines of a page, each with whether it lies inside a fenced code block. */
function linesOf(text) {
  const out = []
  let fence = null
  text.replace(/\r/gu, '').split('\n').forEach((line, index) => {
    const found = FENCE.exec(line)
    if (found && !fence) { fence = found[1][0]; out.push({line, number: index + 1, code: true, fenceLine: true}); return }
    if (found && fence && found[1][0] === fence && /^\s{0,3}(`{3,}|~{3,})\s*$/u.test(line)) { fence = null; out.push({line, number: index + 1, code: true, fenceLine: true}); return }
    out.push({line, number: index + 1, code: !!fence, fenceLine: false})
  })
  return out
}
/** The text a reader sees: no links' targets, no code marks, no emphasis marks, no HTML tags. */
const visible = text => text
  .replace(/!?\[([^\]]*)\]\([^)]*\)/gu, '$1')
  .replace(/<[^>]+>/gu, '')
  .replace(/\\\|/gu, '|')
  .replace(/[`*]/gu, '')
  .trim()
/** The anchor GitHub gives a heading. */
const slug = text => visible(text).toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /gu, '-')
const cache = new Map()
function page(path) {
  if (cache.has(path)) return cache.get(path)
  const text = readFileSync(path, 'utf8')
  const lines = linesOf(text)
  const anchors = new Set(), seen = new Map()
  for (const {line, code} of lines) {
    if (code) continue
    const heading = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/u.exec(line)
    if (heading) {
      const base = slug(heading[1]), count = seen.get(base) ?? 0
      seen.set(base, count + 1)
      anchors.add(count ? `${base}-${count}` : base)
    }
    for (const found of line.matchAll(/\b(?:id|name)\s*=\s*["']([^"']+)["']/gu)) anchors.add(found[1])
  }
  const result = {path, text, lines, anchors, count: text.replace(/\n$/u, '').split('\n').length}
  cache.set(path, result)
  return result
}
const htmlAnchors = new Map()
function anchorsOfHtml(path) {
  if (!htmlAnchors.has(path)) htmlAnchors.set(path, new Set([...readFileSync(path, 'utf8').matchAll(/\b(?:id|name)\s*=\s*["']([^"']+)["']/gu)].map(found => found[1])))
  return htmlAnchors.get(path)
}
/** Every link of a page outside code: inline links, images, reference definitions, href attributes. */
function linksOf(lines) {
  const links = []
  for (const {line, number, code} of lines) {
    if (code) continue
    const plain = line.replace(/`[^`]*`/gu, match => ' '.repeat(match.length))
    for (const found of plain.matchAll(/!?\[(?:[^\][]|\[[^\]]*\])*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/gu)) links.push({target: found[1], number})
    const definition = /^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+.*)?$/u.exec(plain)
    if (definition) links.push({target: definition[1], number})
    for (const found of plain.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gu)) links.push({target: found[1], number})
  }
  return links
}
const DELIMITER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/u
const cellsOf = row => {
  const cells = row.trim().replace(/^\|/u, '').replace(/(?<!\\)\|$/u, '').split(/(?<!\\)\|/u)
  return cells.map(cell => cell.trim())
}
/** Every table of a page: its first line, its number of columns, its rows. */
function tablesOf(lines) {
  const tables = []
  for (let at = 1; at < lines.length; at++) {
    const {line, code} = lines[at]
    if (code || !DELIMITER.test(line) || lines[at - 1].code || !lines[at - 1].line.includes('|')) continue
    const rows = [{cells: cellsOf(lines[at - 1].line), number: lines[at - 1].number}]
    let next = at + 1
    while (next < lines.length && !lines[next].code && lines[next].line.includes('|') && lines[next].line.trim()) {
      rows.push({cells: cellsOf(lines[next].line), number: lines[next].number}); next++
    }
    tables.push({number: lines[at - 1].number, columns: cellsOf(line).length, rows})
    at = next - 1
  }
  return tables
}

// ---- the checks
const faults = [], warnings = []
const fault = (path, number, text) => faults.push({path, number, text})
const warn = (path, number, kind, text) => warnings.push({path, number, kind, text})
const files = [...markdownFiles(docs), join(root, 'README.md')]
const linksTo = new Map()
let linkCount = 0
for (const path of files) {
  const {lines, count} = page(path)
  const inDocs = path.startsWith(docs + sep)
  const targets = new Set()
  // links
  for (const {target, number} of linksOf(lines)) {
    if (/^[a-z][a-z0-9+.-]*:/iu.test(target) || target.startsWith('//')) continue
    linkCount++
    const hash = target.indexOf('#')
    let file = hash < 0 ? target : target.slice(0, hash)
    const anchor = hash < 0 ? '' : decodeURIComponent(target.slice(hash + 1))
    try { file = decodeURIComponent(file) } catch { /* kept as written */ }
    const resolved = file ? resolve(dirname(path), file) : path
    if (!existsSync(resolved)) { fault(path, number, `broken link: ${target} (no file ${rel(resolved)})`); continue }
    if (resolved.endsWith('.md')) targets.add(resolved)
    if (!anchor || statSync(resolved).isDirectory()) continue
    if (resolved.endsWith('.md')) {
      if (!page(resolved).anchors.has(anchor)) fault(path, number, `broken anchor: ${target} (no heading "#${anchor}" in ${rel(resolved)})`)
    } else if (/\.html?$/u.test(resolved)) {
      if (!anchorsOfHtml(resolved).has(anchor)) fault(path, number, `broken anchor: ${target} (no id "${anchor}" in ${rel(resolved)})`)
    }
  }
  linksTo.set(path, targets)
  // tables
  for (const table of tablesOf(lines)) {
    if (table.columns > 2) fault(path, table.number, `table with ${table.columns} columns (at most 2)`)
    for (const row of table.rows) {
      const first = visible(row.cells[0] ?? '')
      if (first.length > FIRST_COLUMN) warn(path, row.number, 'first column', `first column has ${first.length} characters: "${first.length > 40 ? first.slice(0, 37) + '…' : first}"`)
    }
  }
  // code lines
  let language = ''
  for (const {line, number, code, fenceLine} of lines) {
    if (fenceLine) { language = FENCE.exec(line) && /^\s*(`{3,}|~{3,})\s*(\S*)/u.exec(line)[2]; continue }
    if (code && language !== 'sop' && [...line].length > CODE_LINE) warn(path, number, 'code line', `code line of ${[...line].length} characters`)
  }
  if (!inDocs) continue
  // the page template
  const pointer = /^This page: a pointer/mu.test(page(path).text)
  if (path !== home) {
    const first = lines[0]?.line ?? ''
    const crumb = /^\[Home\]\(([^)#\s]+)\)/u.exec(first)
    if (!crumb || resolve(dirname(path), crumb[1]) !== home) fault(path, 1, 'first line is not a breadcrumb that starts with [Home](…README.md)')
    const tail = lines.filter(item => !item.code && item.line.trim()).slice(-10).map(item => item.line).join('\n')
    if (!/\bNext:\s*\[/u.test(tail)) fault(path, count, 'no "Next:" link in the last lines')
    if (!/\bUp:\s*\[/u.test(tail)) fault(path, count, 'no "Up:" link in the last lines')
  }
  const head = lines.slice(0, 12).filter(item => !item.code).map(item => item.line).join('\n')
  if (!/^This page:.*\bKind:/msu.test(head)) warn(path, 1, 'purpose line', 'no "This page: … Kind: …" line near the top')
  if (!pointer && !GENERATED.has(path) && path !== home && (count < SHORT || count > LONG)) warn(path, count, 'length', `${count} lines (aim: ${SHORT}–${LONG})`)
}
// reachability from the home page
const reached = new Set([home]), queue = [home]
while (queue.length) for (const next of linksTo.get(queue.shift()) ?? []) {
  if (!next.startsWith(docs + sep) || reached.has(next) || !linksTo.has(next)) continue
  reached.add(next); queue.push(next)
}
for (const path of files) if (path.startsWith(docs + sep) && !reached.has(path)) fault(path, 1, 'not reachable from docs/README.md by links')

// ---- the report
const byFile = list => {
  const map = new Map()
  for (const item of list) (map.get(item.path) ?? map.set(item.path, []).get(item.path)).push(item)
  return [...map].sort((a, b) => a[0] < b[0] ? -1 : 1)
}
console.log(`Checked ${files.length} Markdown files and ${linkCount} relative links.`)
if (faults.length) {
  console.log(`\n${faults.length} fault${faults.length === 1 ? '' : 's'}:`)
  for (const [path, list] of byFile(faults)) for (const item of list.sort((a, b) => a.number - b.number)) console.log(`  ${rel(path)}:${item.number}  ${item.text}`)
} else console.log('No faults.')
if (warnings.length) {
  const kinds = new Map()
  for (const item of warnings) kinds.set(item.kind, (kinds.get(item.kind) ?? 0) + 1)
  console.log(`\n${warnings.length} warning${warnings.length === 1 ? '' : 's'}: ` + [...kinds].map(([kind, n]) => `${n} ${kind}`).join(', ') + (verbose ? ':' : ' (--verbose lists them).'))
  if (verbose) for (const [path, list] of byFile(warnings)) for (const item of list.sort((a, b) => a.number - b.number)) console.log(`  ${rel(path)}:${item.number}  ${item.text}`)
}
process.exitCode = faults.length ? 1 : 0
