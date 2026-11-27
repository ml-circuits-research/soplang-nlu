// The status page of the syntax work, built from the real data.
//   node docs/status/build.mjs
// Writes docs/status.html (one self-contained page, made for a phone first) and the same content in
// GitHub-flavoured Markdown: docs/STATUS.md, a short page with the main figures of every section, and
// one page per section under docs/status/ (benchmark.md, progress.md, speed.md, dataset.md,
// agreement.md, journal.md, commits.md) with the full tables, which STATUS.md links. It reads the
// repositories and changes nothing else, except docs/status/last-build.json, where it keeps the
// numbers of the last build that changed, so that the next page can say what moved since. It can run
// after every step.
//
// Written by hand, and shown as they are:
//   docs/status/now.md         the latest steps and what comes next, with no scores (they would age)
//   docs/status/history.json   benchmark measurements over time:
//                              [{time, strategy, goal (share L8+L9+L10 in %), commit, note, sample, trial?}]
// Computed here, every time:
//   the levels of the benchmark run (with the functions of tests/benchmark/syntax/lib.mjs that table.mjs
//   uses), the speed of each strategy (the milliseconds recorded for every message in the strategy
//   files of the run; start-up from summary.json), the size of the model files, the labels of the
//   dataset (webmeet-dataset/syntactic), the agreement between hmm-rules and spaCy, the audit of the batch
//   conversion, the journal (improvements-ideas.md) and the recent commits of both repositories.
// A section that cannot be computed says so on the page, and the other sections are still written.
import {readFileSync, writeFileSync, existsSync, readdirSync, lstatSync, statSync} from 'node:fs'
import {dirname, join, resolve, relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
import {availableParallelism} from 'node:os'

delete process.env.SOP_KNOWLEDGE_DIR
const startedAt = performance.now()
const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const docsDir = resolve(here, '..')
const datasetRoot = resolve(root, '../webmeet-dataset')
const syntacticDir = join(datasetRoot, 'syntactic')
const runName = '2026-11-27-syntax-benchmark-random'
const runDir = join(root, 'eval-results', runName)
const conversionDir = join(root, 'eval-results/conversion')
const snapshotFile = join(here, 'last-build.json')
const lib = await import(new URL('../../tests/benchmark/syntax/lib.mjs', import.meta.url).href)

// ---- small helpers
const esc = value => String(value ?? '').replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;')
const num = value => value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toLocaleString('en-US')
const pct = (part, whole, digits = 1) => whole ? (100 * part / whole).toFixed(digits) + '%' : '—'
const share = (value, digits = 1) => value === null || value === undefined || !Number.isFinite(value) ? '—' : (100 * value).toFixed(digits) + '%'
const readJson = file => JSON.parse(readFileSync(file, 'utf8'))
const readJsonl = file => readFileSync(file, 'utf8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line))
const git = (repo, ...args) => execFileSync('git', ['--no-optional-locks', '-C', repo, ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim()
const pad = value => String(value).padStart(2, '0')
const quantile = (values, q) => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); return sorted.length ? sorted[Math.floor((sorted.length - 1) * q)] : null }
const mean = values => { const kept = values.filter(Number.isFinite); return kept.length ? kept.reduce((a, b) => a + b, 0) / kept.length : null }
// sizes in decimal units: 1 MB = 1,000,000 bytes
const bytes = size => size === null ? 'not found' : size >= 1e9 ? (size / 1e9).toFixed(2) + ' GB' : size >= 1e6 ? (size / 1e6).toFixed(1) + ' MB' : size >= 1e3 ? Math.round(size / 1e3) + ' KB' : size + ' bytes'
const duration = seconds => seconds === null ? '—' : seconds < 90 ? Math.round(seconds) + ' s' : seconds < 5400 ? Math.round(seconds / 60) + ' min' : (seconds / 3600).toFixed(1) + ' h'
const rel = path => relative(root, path) || '.'
const localTime = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
/** Bytes of a file, or of every file under a folder; symbolic links are not followed. null when absent. */
function sizeOf(path) {
  if (!existsSync(path)) return null
  const stat = lstatSync(path)
  if (!stat.isDirectory()) return stat.size
  return readdirSync(path).reduce((sum, name) => sum + (sizeOf(join(path, name)) ?? 0), 0)
}
const sizes = new Map()
const sized = path => { if (!sizes.has(path)) sizes.set(path, sizeOf(path)); return sizes.get(path) }
const memo = compute => { let done = false, value; return () => { if (!done) { value = compute(); done = true } return value } }
/** The 95% Wilson score interval of k successes in n, as [low, high] shares. */
function wilson(k, n, z = 1.96) {
  if (!n) return null
  const p = k / n, d = 1 + z * z / n, centre = (p + z * z / (2 * n)) / d, half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
  return [centre - half, centre + half]
}
const interval = (k, n) => { const range = wilson(k, n); return range ? `${(100 * range[0]).toFixed(1)}–${(100 * range[1]).toFixed(1)}` : '—' }
const slug = title => title.toLowerCase().replace(/[^a-z0-9 -]/gu, '').replace(/ /gu, '-')

const now = new Date()
const offset = -now.getTimezoneOffset()
const stamp = `${localTime(now)} (UTC${offset >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)})`

// ---- the repositories
function repository(path) {
  const info = {path, name: path.split('/').pop(), head: null, web: null, changed: null, newest: null}
  try { info.head = git(path, 'rev-parse', '--short', 'HEAD') } catch { return info }
  try { info.newest = new Date(Number(git(path, 'log', '-1', '--format=%ct')) * 1000) } catch { /* unknown */ }
  try { const url = git(path, 'remote', 'get-url', 'origin'); const found = /github\.com[:/](.+?)(?:\.git)?$/u.exec(url); if (found) info.web = 'https://github.com/' + found[1] } catch { /* no remote */ }
  try { info.changed = git(path, 'status', '--porcelain').split('\n').filter(Boolean).length } catch { /* unknown */ }
  return info
}
const nlu = repository(root), dataset = repository(datasetRoot)
// only a commit hash is linked; a name such as a checkpoint ("syntax-v3") is shown as code
const commitLink = (hash, repo = nlu) => repo.web && /^[0-9a-f]{7,40}$/u.test(hash)
  ?{html: `<a href="${repo.web}/commit/${esc(hash)}"><code>${esc(hash)}</code></a>`, md: `[\`${hash}\`](${repo.web}/commit/${hash})`}
  : {html: `<code>${esc(hash)}</code>`, md: `\`${hash}\``}
/** When a file of soplang-nlu was last written: its commit time when it is committed and unchanged, else the time it was saved. */
function lastWritten(file) {
  const path = relative(root, file)
  let changed = true, committed = null
  try { changed = git(root, 'status', '--porcelain', '--', path) !== '' } catch { /* treated as changed */ }
  try { const time = git(root, 'log', '-1', '--format=%ct', '--', path); if (time) committed = new Date(Number(time) * 1000) } catch { /* not committed */ }
  return !changed && committed ? {date: committed, how: 'committed'} : {date: statSync(file).mtime, how: 'saved'}
}

// ---- the strategies: colour slot (fixed order) and what each one is
const ACTIVE = ['hmm-rules', 'spacy', 'distilbert', 'prolog', 'z3']
const colour = name => ACTIVE.includes(name) ? name : 'other'
const dot = name => `<span class="dot s-${colour(name)}" aria-hidden="true"></span>`
// the states of tests/benchmark/syntax/strategies.mjs (strategyStatus): spacy is the one active strategy; the others are
// experimental (measured, kept runnable, not improved for now). rvss, the vector-symbolic reader, is being built.
const ABOUT = {
  'hmm-rules': {state: 'experimental', line: 'our own reader so far, called vss until 2026-11-27. A hidden Markov model learned from raw text with no labels tags each word with a class (a station); hand-written rules about English, which name only function words, then build the circuit. Node.js only.'},
  spacy: {state: 'active', line: 'an outside dependency parser (spaCy\'s English transformer, trained by its makers on large treebanks) plus our layer that turns its parse into a circuit. Python.'},
  distilbert: {state: 'experimental', line: 'a small transformer (DistilBERT, pretrained on English text) fine-tuned on our circuits. Python with PyTorch.'},
  prolog: {state: 'experimental', line: 'a hand-written grammar in Prolog.'},
  z3: {state: 'experimental', line: 'a hand-written grammar written as constraints and solved by the Z3 solver.'}
}
const experimental = name => ABOUT[name]?.state === 'experimental'
const nameCell = (name, {chip = true} = {}) => ({
  html: dot(name) + esc(name) + (chip && experimental(name) ? ' <span class="chip">experimental</span>' : ''),
  md: name + (chip && experimental(name) ? ' (experimental)' : '')
})

// ---- Markdown, a small subset: headings, paragraphs, lists, tables, code blocks, code spans, bold, links
function inline(text) {
  // code spans are kept aside first, so that bold or italics may contain them
  const codes = []
  const html = esc(String(text).replace(/`([^`]+)`/gu, (_, code) => `\u0000${codes.push(code) - 1}\u0000`))
    .replace(/\*\*(.+?)\*\*/gu, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*(?!\s)([^*]+?)(?<!\s)\*(?=[\s).,;:!?]|$)/gu, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/gu, (_, label, url) => `<a href="${url}">${label}</a>`)
  return html.replace(/\u0000(\d+)\u0000/gu, (_, at) => '<code>' + esc(codes[Number(at)]) + '</code>')
}
/**
 * An HTML table; cells are HTML already. The documentation's rule is at most two columns, the first one short
 * (docs/README.md): a two-column table keeps its first column as narrow as its words allow and wraps the second.
 * A wider table (none is written by this page) scrolls sideways inside its frame.
 */
function htmlTable(head, rows, align = [], {foot = [], sticky = false} = {}) {
  const text = cell => String(cell).replace(/<[^>]*>/gu, '')
  const two = head.length <= 2
  // number headers wrap; a long one gets some room so that it does not wrap word by word.
  // In a wider table a cell of long text gets room too, so that the table scrolls sideways instead of growing very tall;
  // not the first column of a table whose first column stays in place, which wraps instead.
  const cls = (index, cell, tag) => align[index] === 'r' ? (tag === 'th' && text(cell).length > 14 ? ' class="n nw"' : ' class="n"')
    : !two && tag === 'td' && !(sticky && index === 0) && text(cell).length > 40 ? ' class="long"' : ''
  const row = (cells, tag) => '<tr>' + cells.map((cell, index) => `<${tag}${cls(index, cell, tag)}>${cell}</${tag}>`).join('') + '</tr>'
  const hint = head.length >= 6 ? `<p class="swipe" aria-hidden="true">Swipe the table sideways: ${head.length} columns.</p>` : ''
  const classes = [two ? 'two' : '', sticky && !two ? 'sticky' : ''].filter(Boolean).join(' ')
  return `${hint}<div class="tw"><table${classes ? ` class="${classes}"` : ''}><thead>${row(head, 'th')}</thead><tbody>${rows.map(cells => row(cells, 'td')).join('')}</tbody>` +
    (foot.length ? `<tfoot>${foot.map(cells => row(cells, 'td')).join('')}</tfoot>` : '') + '</table></div>'
}
/**
 * Markdown with every table of more than two columns written as a list, one item per row:
 * "- **first cell**: header 2: cell 2; header 3: cell 3 …". Used for the hand-written files the page embeds
 * (the journal, now.md), so that the page keeps the documentation's rule of at most two columns.
 */
function narrowTables(source) {
  const lines = source.split('\n'), out = []
  const cellsOf = row => row.trim().replace(/^\|/u, '').replace(/(?<!\\)\|$/u, '').split(/(?<!\\)\|/u).map(cell => cell.trim())
  const delimiter = line => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(line ?? '')
  let fenced = false
  for (let at = 0; at < lines.length; at++) {
    const line = lines[at]
    if (FENCE.test(line)) fenced = !fenced
    if (!fenced && line.includes('|') && delimiter(lines[at + 1])) {
      const head = cellsOf(line)
      if (head.length > 2) {
        let next = at + 2
        const items = []
        while (next < lines.length && lines[next].includes('|') && lines[next].trim()) {
          const cells = cellsOf(lines[next++])
          const first = cells[0].includes('**') ? cells[0] : `**${cells[0]}**`
          items.push(`- ${first}: ` + cells.slice(1).map((cell, index) => `${head[index + 1] ? head[index + 1] + ': ' : ''}${cell || '—'}`).join('; '))
        }
        if (out.length && out.at(-1).trim()) out.push('')
        out.push(...items, '')
        at = next - 1
        continue
      }
    }
    out.push(line)
  }
  return out.join('\n')
}
const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/u
const FENCE = /^\s*```/u
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/u
function renderList(items) {
  let at = 0
  const level = () => {
    const first = items[at], indent = first.indent
    let html = first.ordered ? `<ol${first.start > 1 ? ` start="${first.start}"` : ''}>` : '<ul>'
    while (at < items.length && items[at].indent >= indent) {
      const item = items[at++]
      html += '<li>' + inline(item.text)
      if (at < items.length && items[at].indent > item.indent) html += level()
      html += '</li>'
    }
    return html + (first.ordered ? '</ol>' : '</ul>')
  }
  let html = ''
  while (at < items.length) html += level()
  return html
}
/**
 * @param shift added to the level of every heading
 * @param dropTitle leaves out the first level-1 heading (the page gives the section its own)
 */
function markdownToHtml(source, {shift = 0, dropTitle = false} = {}) {
  const lines = source.replace(/\r/gu, '').split('\n'), out = []
  const blank = line => !line.trim()
  const tableAt = k => /^\s*\|/u.test(lines[k] ?? '') && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/u.test(lines[k + 1] ?? '')
  const cells = row => row.trim().replace(/^\|/u, '').replace(/(?<!\\)\|$/u, '').split(/(?<!\\)\|/u).map(cell => cell.trim().replaceAll('\\|', '|'))
  let at = 0, dropped = false
  while (at < lines.length) {
    const line = lines[at]
    let found
    if (blank(line)) { at++; continue }
    if ((found = HEADING.exec(line))) {
      at++
      if (dropTitle && !dropped && found[1].length === 1) { dropped = true; continue }
      const level = Math.min(6, found[1].length + shift)
      out.push(`<h${level}>${inline(found[2])}</h${level}>`)
      continue
    }
    if (FENCE.test(line)) {
      const body = []
      at++
      while (at < lines.length && !FENCE.test(lines[at])) body.push(lines[at++])
      at++
      out.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`)
      continue
    }
    if (tableAt(at)) {
      const head = cells(lines[at]), align = cells(lines[at + 1]).map(cell => /^-+:$/u.test(cell.replace(/^:/u, '')) && !cell.startsWith(':') ? 'r' : '')
      at += 2
      const rows = []
      while (at < lines.length && /^\s*\|/u.test(lines[at])) rows.push(cells(lines[at++]).map(inline))
      out.push(htmlTable(head.map(inline), rows, align))
      continue
    }
    if (LIST.test(line)) {
      const items = []
      while (at < lines.length) {
        const current = lines[at], item = LIST.exec(current)
        if (item) { items.push({indent: item[1].length, ordered: /\d/u.test(item[2]), start: parseInt(item[2], 10), text: item[3].trim()}); at++; continue }
        if (blank(current)) {
          let next = at
          while (next < lines.length && blank(lines[next])) next++
          if (next < lines.length && (LIST.test(lines[next]) || /^\s{2,}\S/u.test(lines[next]))) { at = next; continue }
          break
        }
        if (HEADING.test(current) || FENCE.test(current) || tableAt(at)) break
        items.at(-1).text += ' ' + current.trim()
        at++
      }
      out.push(renderList(items))
      continue
    }
    const paragraph = [line.trim()]
    at++
    while (at < lines.length && !blank(lines[at]) && !HEADING.test(lines[at]) && !LIST.test(lines[at]) && !FENCE.test(lines[at]) && !tableAt(at)) paragraph.push(lines[at++].trim())
    out.push(`<p>${inline(paragraph.join(' '))}</p>`)
  }
  return out.join('\n')
}
/** Markdown with every heading moved down by `shift` levels and, when asked, its title left out. */
function shiftMarkdown(source, shift, dropTitle = false) {
  let dropped = false, fenced = false
  return source.split('\n').flatMap(line => {
    if (FENCE.test(line)) fenced = !fenced
    const found = !fenced && /^(#{1,6})(\s.*)$/u.exec(line)
    if (!found) return [line]
    if (dropTitle && !dropped && found[1].length === 1) { dropped = true; return [] }
    return ['#'.repeat(Math.min(6, found[1].length + shift)) + found[2]]
  }).join('\n').trim()
}

// ---- the blocks a section is made of: Markdown text (rendered for the page) or {html, md}
/** A table for both outputs. A cell is text, or {html, md}. align: 'r' for a column of numbers. */
function table(head, rows, align = [], {foot = [], sticky = true} = {}) {
  const html = cell => cell !== null && typeof cell === 'object' ? cell.html : esc(cell)
  const md = cell => (cell !== null && typeof cell === 'object' ? cell.md : String(cell ?? '')).replaceAll('|', '\\|').replace(/\n/gu, ' ')
  const mdRow = cells => '| ' + cells.map(md).join(' | ') + ' |'
  return {
    html: htmlTable(head.map(html), rows.map(cells => cells.map(html)), align, {foot: foot.map(cells => cells.map(html)), sticky}),
    md: [mdRow(head), '| ' + head.map((_, index) => align[index] === 'r' ? '---:' : '---').join(' | ') + ' |', ...rows.map(mdRow), ...foot.map(cells => mdRow(cells.map(cell => cell !== null && typeof cell === 'object' ? cell : {html: '', md: cell === '' ? '' : `**${cell}**`})))].join('\n')
  }
}
/** A table cell written in Markdown: rendered on the page, kept as it is in STATUS.md. */
const rich = markdown => ({html: inline(markdown), md: markdown})
/** The name of a strategy as a line of its own, above its small table: a coloured dot on the page, bold in Markdown. */
const label = (name, extra = '') => ({
  html: `<p class="who">${dot(name)}<strong>${esc(name)}</strong>${experimental(name) ? ' <span class="chip">experimental</span>' : ''}${extra ? ' ' + inline(extra) : ''}</p>`,
  md: `**${name}**${experimental(name) ? ' (experimental)' : ''}${extra ? ' ' + extra : ''}`
})
/** A note in a box on the page; a quoted paragraph in Markdown. */
const box = (markdown, kind = '') => ({html: `<div class="box${kind ? ' ' + kind : ''}">${markdownToHtml(markdown)}</div>`, md: markdown.split('\n').map(line => '> ' + line).join('\n')})
/**
 * Blocks folded away under a summary on the HTML page. In Markdown they stand on a page of their own
 * (docs/status/), under a heading made of the summary, so that a phone reader finds them by the heading.
 */
const folded = (summary, blocks, {open = false} = {}) => ({
  html: `<details${open ? ' open' : ''}><summary>${inline(summary)}</summary>${blocks.filter(Boolean).map(block => typeof block === 'string' ? markdownToHtml(block) : block.html).join('\n')}</details>`,
  md: `### ${summary.replace(/\*\*/gu, '')}\n\n${blocks.filter(Boolean).map(block => typeof block === 'string' ? block : block.md).filter(Boolean).join('\n\n')}`
})
/** A block for the HTML page only, or for the Markdown pages only. */
const htmlOnly = block => ({html: typeof block === 'string' ? markdownToHtml(block) : block.html, md: ''})
const mdOnly = block => ({html: '', md: typeof block === 'string' ? block : block.md})
const render = blocks => ({
  html: blocks.filter(Boolean).map(block => typeof block === 'string' ? markdownToHtml(block) : block.html).filter(Boolean).join('\n'),
  md: blocks.filter(Boolean).map(block => typeof block === 'string' ? block : block.md).filter(Boolean).join('\n\n')
})
const sections = []
/**
 * One section of the status.
 * @param build returns its blocks, or {blocks, more}: `blocks` stand in STATUS.md, `more` on the
 *   Markdown page of the section (docs/status/<page.file>), which STATUS.md links; the HTML page shows both.
 * @param where 'both', or 'html' or 'md' for a section of one output only
 * @param page {file, title, purpose} of the section's own Markdown page
 */
function section(id, title, build, {where = 'both', page = null} = {}) {
  let built
  try { built = build() } catch (error) {
    console.error(`Section "${title}" could not be computed:`, error)
    built = [`**This section could not be computed:** ${String(error?.message ?? error).split('\n')[0]}`]
  }
  const {blocks, more = []} = Array.isArray(built) ? {blocks: built} : built
  const main = render(blocks), extra = render(more)
  sections.push({id, title, where, page, html: [main.html, extra.html].filter(Boolean).join('\n'), md: main.md, moreMd: extra.md})
}

// ---- data read once, used by several sections
const labelsNow = memo(() => lib.readLabels(lib.syntacticDirOf(lib.defaultRegistryDir)))
const bench = memo(() => {
  const outputs = lib.readOutputs(runDir)
  if (!outputs.length) throw new Error(`no strategy file in ${rel(runDir)}`)
  const registry = lib.readRegistry(lib.defaultRegistryDir)
  const labelsBefore = lib.readLabelsBefore(runDir, labelsNow)
  const read = lib.readRunVerdicts(runDir)
  const rows = lib.tableOf(outputs, registry, read.verdicts, labelsBefore, labelsNow)
  const count = by => [...read.verdicts.values()].reduce((sum, circuits) => sum + [...circuits.values()].filter(verdict => verdict.by === by).length, 0)
  const texts = new Set(outputs.flatMap(output => output.rows.map(row => row.text)))
  const judges = {}
  for (const circuits of registry.byText.values()) for (const circuit of circuits.values()) judges[circuit.judge ?? 'unknown'] = (judges[circuit.judge ?? 'unknown'] ?? 0) + 1
  return {outputs, registry, labelsBefore, read, rows, sorted: [...rows].sort((a, b) => (b.goal ?? -1) - (a.goal ?? -1)),
    judgedHere: count('judge'), agreedHere: count('agreement'), messages: texts.size, texts,
    labelled: [...texts].filter(text => labelsBefore.has(text)).length, judges}
})
// a row of an old name of a strategy (vss) counts under its name now (hmm-rules): strategyAliases in tests/benchmark/syntax/lib.mjs
const history = memo(() => readJson(join(here, 'history.json')).map(entry => ({...entry, strategy: lib.strategyName(entry.strategy)})))
/** The DistilBERT checkpoint of the latest DistilBERT row of history.json ("syntax-v3"); syntax-v2 when none is named. */
const distilCheckpoint = memo(() => {
  try {
    const last = history().filter(entry => entry.strategy === 'distilbert' && !entry.trial && entry.sample === 'random 1%').sort((a, b) => a.time < b.time ? -1 : a.time > b.time ? 1 : 0).at(-1)
    const found = /syntax-v\d+/u.exec(`${last?.commit ?? ''} ${last?.note ?? ''}`)
    if (found && existsSync(join(root, '.local-models/distilbert', found[0]))) return found[0]
  } catch { /* the default below */ }
  return 'syntax-v2'
})
const datasetStats = memo(() => {
  const files = []
  const walk = (dir, prefix = '') => {
    for (const entry of readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name < b.name ? -1 : 1)) {
      if (entry.isDirectory()) walk(join(dir, entry.name), prefix + entry.name + '/')
      else if (entry.name.endsWith('.csv')) files.push(prefix + entry.name)
    }
  }
  walk(syntacticDir)
  const areas = new Map(), texts = new Set()
  const tally = () => ({files: 0, messages: 0, circuit: 0, agreement: 0, judge: 0, written: 0, other: 0, open: 0})
  const total = tally()
  for (const file of files) {
    const area = file.includes('/') ? file.split('/')[0] : '(top)'
    const into = areas.get(area) ?? areas.set(area, tally()).get(area)
    const [header, ...records] = lib.readCsv(readFileSync(join(syntacticDir, file), 'utf8'))
    if (header?.[0] !== 'text' || header[1] !== 'sop') continue
    into.files++; total.files++
    for (const [text, sop = '', , acceptedBy = ''] of records) {
      texts.add(text)
      for (const t of [into, total]) {
        t.messages++
        if (!sop) { t.open++; continue }
        t.circuit++
        t[['agreement', 'judge', 'written'].includes(acceptedBy) ? acceptedBy : 'other']++
      }
    }
  }
  return {files: files.length, areas, total, distinct: texts.size}
})
/** Speed of every strategy, from the milliseconds of every message in its file (the run the GOAL is computed from). */
const speed = memo(() => {
  const {outputs, rows} = bench()
  const summaryFile = join(runDir, 'summary.json')
  const summary = existsSync(summaryFile) ? readJson(summaryFile).strategies ?? {} : {}
  let datasetMessages = null
  try { datasetMessages = datasetStats().total.messages } catch { /* shown as unknown */ }
  const order = rows.map(row => row.strategy).sort((a, b) => (ACTIVE.indexOf(a) + 1 || 99) - (ACTIVE.indexOf(b) + 1 || 99))
  const list = order.map(name => {
    const ms = (outputs.find(output => output.strategy === name)?.rows ?? []).map(row => row.ms).filter(Number.isFinite)
    const entry = summary[name] ?? {}
    const median = quantile(ms, 0.5), average = mean(ms)
    // summary.json keeps the entry of the run that wrote it; a strategy run again later has a file it does not describe
    const summaryMatches = Number.isFinite(entry.medianMs) && median ? Math.abs(entry.medianMs - median) / median <= 0.05 : false
    return {name, count: ms.length, median, p90: quantile(ms, 0.9), p99: quantile(ms, 0.99), average,
      startup: summaryMatches ? entry.startupMs ?? null : null, summaryMedian: entry.medianMs ?? null, summaryMatches,
      perSecond: average ? 1000 / average : null, whole: average && datasetMessages ? datasetMessages * average / 1000 : null}
  })
  return {list, by: Object.fromEntries(list.map(row => [row.name, row])), datasetMessages, cores: availableParallelism()}
})
/** What each strategy needs and where its analysis comes from; model sizes measured on disk now. */
const facts = memo(() => {
  let hmmTrained = null, distil = null
  try { hmmTrained = readJson(join(root, 'strategies/hmm-rules/model/model.json')).trained } catch { /* unknown */ }
  const checkpoint = distilCheckpoint()
  try { distil = readJson(join(root, `.local-models/distilbert/${checkpoint}/training-summary.json`)) } catch { /* unknown */ }
  const wasm = join(root, 'strategies/z3/node_modules/z3-solver/build/z3-built.wasm')
  return {
    'hmm-rules': {runtime: 'Node.js', browserShort: 'not yet; needs a small loader', trainingShort: 'about 1 min, CPU', labels: 'no: raw text only',
      runs: 'Node.js only: plain JavaScript in one process, on one CPU core. No GPU, no Python.',
      browser: 'Not yet. The reader is plain JavaScript and the model is one JSON file; Node is used only to read its files, so a browser needs a small loader, which is not built yet.',
      models: [['model.json', join(root, 'strategies/hmm-rules/model/model.json')]],
      training: 'About 60–70 s on the CPU (reported by the training runs, not measured here)' + (hmmTrained ? `, from ${num(hmmTrained.messages)} messages of raw text (${num(hmmTrained.tokens)} words, ${hmmTrained.iterations} rounds of EM). No labels are used. The raw text is the whole dataset, so it includes the benchmark messages, without their labels.` : '.'),
      source: 'Stations (classes of words and their order) learned from raw text with no labels by a hidden Markov model, plus hand-written rules about English that name only function words. Experimental: not improved for now (owner\'s decision).'},
    spacy: {runtime: 'Python with spaCy and spacy-transformers (PyTorch)', browserShort: 'no', trainingShort: 'none by us', labels: 'no: English treebanks, by its makers',
      runs: 'Python with spaCy 3.8 and the transformer pipeline en_core_web_trf 3.8.0, called from Node; on the CPU in the benchmark.',
      browser: 'No: it needs Python and a transformer of about half a gigabyte.',
      models: [['en_core_web_trf', '/tmp/sop-nlu-trf-model/en_core_web_trf']],
      training: 'None by us: a pipeline trained by its makers on large English treebanks. Our part is the layer that writes circuits from its parse.',
      source: 'A transformer dependency parser trained on large English treebanks, plus our rules that turn its parse into a circuit.'},
    distilbert: {runtime: 'Python with PyTorch and Hugging Face transformers; CUDA for the GPU', browserShort: 'not as it is', labels: 'yes: judged labels, and agreement labels at a lower weight',
      trainingShort: distil ? `${Math.round(distil.trainingSeconds / 60)} min, GPU` : 'unknown',
      runs: 'Python with PyTorch, called from Node; the benchmark ran on the GPU' + (distil?.accelerator ? ` (${distil.accelerator})` : '') + '. It can run on a CPU too; how fast is not measured yet.',
      browser: 'Not as it is: it would need an export to ONNX and a web runtime (not done).',
      models: [[`checkpoint ${checkpoint}`, join(root, `.local-models/distilbert/${checkpoint}/checkpoint`)]],
      training: distil ? `Checkpoint ${checkpoint}, the one named by the latest DistilBERT measurement of "Progress over time": ${Math.round(distil.trainingSeconds / 60)} min for ${distil.epochs?.length ?? distil.maximumEpochs} epochs on the ${distil.device === 'cuda' ? 'GPU' : distil.device}, ${num(distil.trainRows)} training circuits ` +
        `(judged labels, and agreement labels at weight ${distil.messages?.agreement?.weight ?? '?'}); benchmark messages held out. ` +
        `On held-out development messages ${share(distil.development?.equalToGoldByCore)} equal the label.` : 'unknown (training-summary.json not found)',
      source: 'A transformer (DistilBERT, pretrained on English text) fine-tuned on our syntax circuits. Experimental: not improved for now (owner\'s decision).'},
    prolog: {runtime: 'SWI-Prolog', browserShort: 'not as it is', trainingShort: 'word counts only', labels: 'no: raw text counts',
      runs: 'SWI-Prolog (a native program), called from Node.',
      browser: 'Not as it is (SWI-Prolog has a WebAssembly build; not tried).',
      models: [['word model', join(root, 'strategies/prolog/model')]],
      training: 'The grammar is hand-written. A small word model counts, in raw text, where each word stands next to function words.',
      source: 'A hand-written grammar. Experimental: not improved for now (owner\'s decision).'},
    z3: {runtime: `Node.js and z3-solver, whose WebAssembly file is ${bytes(sized(wasm))}`, browserShort: 'in principle; large', trainingShort: 'word counts only', labels: 'no: raw text counts',
      runs: 'The Z3 solver compiled to WebAssembly (z3-solver), inside Node.',
      browser: 'In principle: z3-solver has a browser build, but its WebAssembly file is large and needs threads in the browser.',
      models: [['word usage table', join(root, 'strategies/z3/model')]],
      runtimeFiles: [['z3-built.wasm', wasm]],
      training: 'The grammar is hand-written as constraints. A table counts how each word is used in raw text.',
      source: 'A hand-written grammar as constraints, solved by Z3. Experimental.'}
  }
})
const modelSize = name => { const list = facts()[name]?.models ?? []; const found = list.map(([, path]) => sized(path)).filter(size => size !== null); return found.length ? found.reduce((a, b) => a + b, 0) : null }
/** The plain-words reading of a circuit, one line per wire. */
function describeCircuit(sop) {
  const wires = sop.split('\n').map(line => {
    const found = /^@(\S+)\s+syntax\.(\S+)\s*(.*)$/u.exec(line.trim())
    return found ? {id: found[1], type: found[2], pairs: [...found[3].matchAll(/(\w+)=("(?:[^"\\]|\\.)*"|\S+)/gu)].map(([, key, value]) => [key, value])} : null
  }).filter(Boolean)
  const byId = new Map(wires.map(wire => [wire.id, wire]))
  const quoted = value => value.startsWith('"') ? value.slice(1, -1) : null
  const phrase = id => {
    const wire = byId.get(id)
    if (wire?.type === 'nominal') return `"${wire.pairs.map(([, value]) => quoted(value)).filter(word => word !== null).join(' ')}"`
    if (wire?.type === 'clause') { const verb = wire.pairs.find(([key]) => key === 'verb'); return verb ? `the clause of "${quoted(verb[1])}"` : 'a clause' }
    return wire ? `a ${wire.type}` : id
  }
  return wires.map(wire => `\`${wire.id}\` **${wire.type}**: ` + wire.pairs.map(([key, value]) => value.startsWith('$')
    ? `${key} → ${value.slice(1)} (${phrase(value.slice(1))})` : quoted(value) !== null ? `${key} "${quoted(value)}"` : `${key}=${value}`).join('; '))
}

// ================================================================== the sections
// links are relative to docs/, where both STATUS.md and status.html stand
const LINKS = [
  ['README.md', 'The documentation (home)'],
  ['schema/README.md', 'The syntax schema and its rules'],
  ['hmm-rules/README.md', 'hmm-rules in depth'],
  ['evaluation/README.md', 'How circuits are judged and become labels'],
  ['project/reports.md', 'The three full reports (HTML)'],
  ['../improvements-ideas.md', 'The working journal (also below)'],
  [`../eval-results/${runName}/table.md`, 'The benchmark table as table.mjs writes it']
]
const EXAMPLE = 'make a bar chart of the projects by name please'

section('read', 'How to read this page', () => [
  'Every number on this page is computed from the repositories at each build (the first line says when), except two parts written by hand: ' +
  '"Working on now" and the notes of "Progress over time". The other pages of the documentation explain the terms and link here for the numbers.',
  mdOnly('Each section below gives the main figures. Its full tables are on a page of their own, linked at the end of the section as **More**.'),
  '- **Strategy**: the code\'s word for a formalizer, a program that writes one circuit per message ([Formalizers](formalizers/README.md)).\n' +
  '- **Levels L0–L10 and GOAL**: the level of each circuit (accepted, rejected with a grade, or no circuit), and the share of messages at L8, L9 or L10 ([Levels and GOAL](evaluation/levels.md)).\n' +
  '- **The benchmark**: the sample every strategy is measured on, with every circuit judged ([The benchmark](evaluation/benchmark.md)); the **95% interval** after a GOAL says how far the share can move by chance ([How to read a GOAL](evaluation/benchmark.md#how-to-read-a-goal)).\n' +
  '- **Agreement and the audit**: labels settled when strategies from different sources write the same circuit, and the random share a judge still reads ([Agreement](evaluation/agreement.md), [The audit](evaluation/audit.md)).\n' +
  '- **Speed and cost**: what is timed, and which comparisons are not like for like ([Speed and cost](formalizers/speed.md)). **How far to trust the numbers**: [Limits of the measurements](evaluation/validity.md).\n' +
  '- Any other term: the [Glossary](reference/glossary.md) of the documentation.'
])

// STATUS.md only: the three figures a reader looks for first
section('glance', 'At a glance', () => {
  const {sorted, messages} = bench(), best = sorted[0], hmm = sorted.find(row => row.strategy === 'hmm-rules')
  const data = datasetStats().total
  let fastest = null
  try { fastest = speed().list.filter(row => row.median !== null).sort((a, b) => a.median - b.median)[0] ?? null } catch { /* the speed section reports its own error */ }
  return [table(['Measure', 'Now'], [
    ['Highest GOAL', `${share(best.goal)}, ${best.strategy}`],
    ...(hmm && hmm !== best ? [['GOAL of hmm-rules', share(hmm.goal) + (hmm.waiting ? `; ${num(hmm.waiting)} circuits wait for a judge` : '')]] : []),
    ...(fastest ? [['Fastest', `${fastest.name}, ${fastest.median.toFixed(2)} ms per message (median)`]] : []),
    ['Dataset', `${pct(data.circuit, data.messages)} of ${num(data.messages)} messages have a circuit (${num(data.circuit)})`]
  ]),
  `GOAL is the share of the ${num(messages)} benchmark messages whose circuit is accepted ([Levels and GOAL](evaluation/levels.md)). ` +
  'spacy is the one active strategy; hmm-rules (our own reader so far, called vss until 2026-11-27), distilbert, prolog and z3 are [experimental](#g-experimental), and a vector-symbolic reader, rvss, is being built ([Formalizers](formalizers/README.md)). What the project does: [the home page](README.md#what-this-is).']
}, {where: 'md'})

section('about', 'What this project does', () => {
  let messages = null
  try { messages = bench().messages } catch { /* the benchmark section reports its own error */ }
  const blocks = []
  try {
    const {sorted} = bench(), best = sorted[0], hmm = sorted.find(row => row.strategy === 'hmm-rules')
    const data = datasetStats().total
    const tiles = [
      [share(best.goal), `GOAL of the best strategy (${best.strategy}): share of the ${num(messages)} benchmark messages whose circuit a judge accepts`],
      hmm && hmm !== best ? [share(hmm.goal), 'GOAL of hmm-rules, our own reader so far (experimental)' + (hmm.waiting ? `; ${num(hmm.waiting)} of its circuits wait for a judge (at most ${share(hmm.atMost)})` : '')] : null,
      [pct(data.circuit, data.messages), `of the dataset's ${num(data.messages)} messages have a circuit (${num(data.circuit)})`]
    ].filter(Boolean)
    blocks.push({
      html: `<div class="tiles">${tiles.map(([value, label]) => `<div class="tile"><span class="big">${esc(value)}</span><span class="small">${esc(label)}</span></div>`).join('')}</div>`,
      md: '**At a glance:** ' + tiles.map(([value, label]) => `**${value}** ${label}`).join(' · ')
    })
  } catch { /* the tiles are a summary of sections that report their own errors */ }
  blocks.push('A **formalizer** (here called a **[strategy](#g-strategy)**) reads one English message alone, with no context and no knowledge base, and writes its syntactic ' +
    '**[circuit](#g-circuit)** in the `syntax` schema: the clauses, the nominals (the words that describe one thing), the relations ' +
    'between them and the coordinations, with every word of the message in exactly one place. The strategies are compared on one ' +
    `**[benchmark](#g-benchmark)**: ${messages ? num(messages) + ' messages, ' : ''}1% of the dataset, drawn at random. A **[judge](#g-judge)** reads every circuit without knowing which strategy wrote it, ` +
    'and accepts or rejects it. **GOAL** is the share of messages whose circuit is accepted (levels L8, L9 and L10, [below](#benchmark)); the aim is over 99%. ' +
    'Accepted circuits become the **[labels](#g-label)** of the dataset, which the strategies are measured and trained on. Terms are explained in the [Glossary](#glossary).')
  try {
    const label = labelsNow().get(EXAMPLE)
    if (label) {
      const how = {judge: 'accepted by a judge', written: 'written by a judge', agreement: 'settled by agreement'}[label.accepted_by] ?? 'its label'
      blocks.push(`**An example.** The message *${EXAMPLE}* has this circuit as its label (${how}), taken from the dataset now:`)
      blocks.push('```sop\n' + label.label + '\n```')
      blocks.push('Read line by line, each line one wire:\n\n' + describeCircuit(label.label).map(line => '- ' + line).join('\n') +
        (/attachment=ambiguous/u.test(label.label) ? '\n\n`attachment=ambiguous` marks a phrase whose place the words do not settle' +
          (/attachment=ambiguous marker="by"/u.test(label.label) ? ' (here, whether "by name" goes with the making or with the projects)' : '') + '; the judges accept either place.' : ''))
    }
  } catch { /* no example; the rest of the section stands */ }
  blocks.push('**The five strategies.** One is worked on, spacy; four are [experimental](#g-experimental) (still measured and kept runnable, not improved for now, owner\'s decision). ' +
    'A vector-symbolic reader of our own, rvss, is being built (`strategies/rvss/`) and is not measured yet:\n\n' +
    ACTIVE.map(name => `- **${name}**${ABOUT[name].state !== 'active' ? ` (${ABOUT[name].state})` : ''}: ${ABOUT[name].line}`).join('\n'))
  try {
    const {by} = speed()
    const hmm = by['hmm-rules'], highest = bench().sorted[0]?.strategy === 'spacy'
    if (hmm && by.spacy) blocks.push(`**Why spaCy is the active strategy, and what the experimental ones still give.** ${highest ? 'spaCy has the highest GOAL on the benchmark. ' : ''}` +
      `It needs Python and a transformer of ${bytes(modelSize('spacy'))} and takes ${by.spacy.median.toFixed(0)} ms per message. ` +
      `hmm-rules needs only Node.js, its model is one file of ${bytes(modelSize('hmm-rules'))}, it reads a message in ${hmm.median.toFixed(2)} ms (median) on one CPU core, and it learns from raw text. ` +
      'The experimental strategies stay as voices from other sources: when two strategies that read from different sources write the same circuit, the label is settled with no judge ([Agreement](#agreement)). ' +
      'hmm-rules was called vss until 2026-11-27; it is a hidden Markov model plus rules, and the vector-symbolic reader of the project is rvss, now being built.')
  } catch { /* the speed section reports its own error */ }
  try {
    const judges = Object.entries(bench().judges).filter(([name]) => name !== 'agreement').sort((a, b) => b[1] - a[1])
    blocks.push(`**Who the judges are.** Language-model agents (${judges.map(([name, count]) => `${name}: ${num(count)} circuits`).join(', ')} read so far) that follow written rules ` +
      '(`tests/benchmark/syntax/rules.md`). How often two judges, or a judge and a person, agree on this schema has not been measured yet.')
  } catch { /* the benchmark section reports its own error */ }
  blocks.push('More to read: ' + LINKS.map(([href, label]) => `[${label}](${href})`).join(' · ') + '.')
  return blocks
}, {where: 'html'})

section('now', 'Working on now', () => {
  const file = join(here, 'now.md'), source = narrowTables(readFileSync(file, 'utf8'))
  const written = lastWritten(file)
  const behind = nlu.newest ? (nlu.newest - written.date) / 3600000 : 0
  // measurements recorded after the text was written: its account of the latest results may be older
  let later = 0
  try { later = history().filter(entry => new Date(entry.time.replace(' ', 'T')) > written.date).length } catch { /* not counted */ }
  const line = `Written by hand; last ${written.how} ${localTime(written.date)}.` +
    (later ? ` **It may be behind:** ${later} measurement${later === 1 ? ' was' : 's were'} recorded after it ([Progress over time](#progress)).`
      : behind > 3 ? ` **It may be behind:** the newest commit of ${nlu.name} is ${Math.round(behind)} hours newer.` : '') +
    ' Where it differs from the computed sections, the computed ones are current.'
  return [{html: `<p class="note">${inline(line)}</p>`, md: `*${line.replace(/\*\*/gu, '')}*`},
    {html: markdownToHtml(source, {shift: 1, dropTitle: true}), md: shiftMarkdown(source, 1, true)}]
})

section('benchmark', 'The benchmark, live', () => {
  const {sorted, registry, judgedHere, agreedHere, messages, labelled, read, judges} = bench()
  const summaryFile = join(runDir, 'summary.json')
  const notRun = existsSync(summaryFile) ? Object.entries(readJson(summaryFile).strategies ?? {}).filter(([, entry]) => !entry.file).map(([name, entry]) => `${name} (${entry.status})`) : []
  const accepted = row => row.levels.L8 + row.levels.L9 + row.levels.L10
  const rejected = row => ['L1', 'L2', 'L3', 'L4', 'L5', 'L6'].reduce((sum, level) => sum + row.levels[level], 0)
  const goalCell = row => `${share(row.goal)} (${interval(accepted(row), row.messages)})`
  const bars = sorted.map(row => {
    const width = (100 * (row.goal ?? 0)).toFixed(1), extra = row.waiting ? (100 * (row.atMost - row.goal)).toFixed(1) : null
    return `<div class="bar"><span class="name">${dot(row.strategy)}${esc(row.strategy)}${experimental(row.strategy) ? '<span class="chip">experimental</span>' : ''}</span>` +
      `<span class="track" role="img" aria-label="${esc(row.strategy)}: ${share(row.goal)} of messages accepted"><span class="fill s-${colour(row.strategy)}" style="width:${width}%"></span>` +
      (extra ? `<span class="fill waitfill s-${colour(row.strategy)}" style="left:${width}%;width:${extra}%"></span>` : '') +
      `<span class="aim"></span></span><span class="val">${share(row.goal)}</span></div>`
  }).join('')
  const textBar = goal => { const full = Math.round((goal ?? 0) * 20); return '█'.repeat(full) + '░'.repeat(20 - full) }
  const anyWaiting = sorted.some(row => row.waiting)
  const levelsShort = 'L0 no valid circuit · L1–L6 rejected, with the judge\'s grade · L7 unused · L8 accepted · L9 equal to the label · L10 accepted, replacing the label'
  const levelsLong = '- **L0**: no valid circuit.\n' +
    '- **L1–L6**: the judge rejected the circuit, and the number is the grade: L1 a clause is wrong (its form or its verb); ' +
    'L2 a content word put in the discourse slot (the slot for words such as "please"); L3 words stand in the wrong wire, or a tie is wrong; ' +
    'L4 the circuit states what the message does not say; L5 a clause of the message is not written; L6 something is left untied.\n' +
    '- **L7**: unused, since a strategy returns one circuit.\n' +
    '- **L8**: accepted, but neither L9 nor L10: accepted earlier (in the registry), or accepted in this run for a message that had no label before the run.\n' +
    '- **L9**: equal to the label the message had before the run, so no judge was needed.\n' +
    '- **L10**: accepted in this run for a message that had another label before the run; a benchmark publication makes it the label.\n' +
    '- **waiting**: no judge has read the circuit yet; not counted in GOAL.'
  // where the circuits of each strategy come from: the file of the run and the commit that last changed it
  const versions = sorted.map(row => {
    const file = join(runDir, row.strategy + '.jsonl')
    let commit = null, changed = false
    try { const found = git(root, 'log', '-1', '--format=%h%x1f%ad%x1f%s', '--date=format:%Y-%m-%d %H:%M', '--', rel(file)); if (found) { const [hash, time, subject] = found.split('\x1f'); commit = {hash, time, subject} } } catch { /* not committed */ }
    try { changed = git(root, 'status', '--porcelain', '--', rel(file)) !== '' } catch { /* unknown */ }
    const saved = existsSync(file) ? localTime(statSync(file).mtime) : '?'
    const subject = commit ? (commit.subject.length > 120 ? commit.subject.slice(0, 117) + '…' : commit.subject) : ''
    return {name: row.strategy, saved, commit, changed, subject}
  })
  const versionLine = (v, link) => `- **${v.name}**: file written ${v.saved}` + (v.commit ? `; committed ${v.commit.time.slice(11)} in ${link(v.commit.hash)}: "${v.subject}"` : '; not committed') + (v.changed ? ' (changed since that commit)' : '')
  const judgeList = Object.entries(judges).filter(([name]) => name !== 'agreement').sort((a, b) => b[1] - a[1]).map(([name, count]) => `${num(count)} read by ${name}`)
  // the registry's lines with no judge: agreement circuits kept as accepted readings, by file
  const agreementByFile = {}
  try {
    for (const name of readdirSync(lib.defaultRegistryDir).filter(file => file.endsWith('.jsonl'))) {
      const count = readJsonl(join(lib.defaultRegistryDir, name)).filter(row => row.judge === 'agreement').length
      if (count) agreementByFile[name] = count
    }
  } catch { /* left out */ }
  const why = name => /replaced-agreement/u.test(name) ? 'agreement labels that the benchmark publication replaced, kept as accepted readings'
    : /round-/u.test(name) ? 'second agreed circuits of a conversion round, an open point of the journal' : null
  const agreementText = Object.entries(agreementByFile).map(([name, count]) => `${num(count)} ${why(name) ?? 'circuits'}, in \`${name}\``).join('; ')
  const blocks = [
    `**GOAL** = messages whose circuit is accepted (levels L8 + L9 + L10) ÷ all ${num(messages)} messages of the benchmark. ` +
    `In the tables, the range after a GOAL is its [95% interval](#g-interval): with ${num(messages)} messages, a GOAL is known to about ±2 points.`,
    {html: `<div class="bars" aria-label="GOAL by strategy">${bars}</div><p class="note">Each bar is the GOAL of one strategy. The vertical tick marks the aim, 99%.` +
      (anyWaiting ? ' The pale part is what the share becomes if every circuit still waiting for a judge is accepted.' : '') + '</p>',
    md: table(['Strategy', 'GOAL (each block 5%)'], sorted.map(row => [nameCell(row.strategy), `${share(row.goal)} ${textBar(row.goal)}`])).md},
    {html: `<p class="note">Levels: ${esc(levelsShort)}.</p>`, md: `Levels: ${levelsShort}. The exact definitions: [Levels and GOAL](evaluation/levels.md).`},
    anyWaiting ? box(`**Not final yet:** ${sorted.filter(row => row.waiting).map(row => `${row.strategy} has ${num(row.waiting)} circuits that no judge has read`).join('; ')}. Its GOAL can only rise when they are judged.`, 'warn') : null,
    box('**Not an unseen sample any more.** From commit `dd562c3` on, the rules of hmm-rules (then named vss) were checked against the judged circuits of this benchmark, and the rules of `fa46cb7` include rules found in its rejected circuits; ' +
      'the spaCy repairs of `a55e33f` were measured on its rejected circuits too. Their scores here are therefore likely higher than on messages nobody has looked at. ' +
      'The first DistilBERT checkpoint (71.8% in [Progress](#progress)) had been trained on agreement circuits of 576 of these messages; the later checkpoints hold them out. ' +
      'A fresh sample is planned ([Limits of the measurements](evaluation/validity.md#no-longer-an-unseen-sample)).')
  ]
  const more = [
    htmlOnly(folded('What each level means', [levelsLong])),
    '**Each strategy**, in messages of the benchmark: GOAL with its 95% interval; accepted (L8–L10), rejected (L1–L6), no circuit (L0), waiting for a judge' +
    (anyWaiting ? '; GOAL at most, if every waiting circuit is accepted' : '') + '; and the count at every level.',
    ...sorted.flatMap(row => [label(row.strategy), table(['Measure', 'Value'], [
      ['GOAL', goalCell(row)],
      ['Accepted (L8–L10)', num(accepted(row))],
      ['Rejected (L1–L6)', num(rejected(row))],
      ['No circuit (L0)', num(row.levels.L0)],
      ['Waiting', num(row.waiting)],
      ...(anyWaiting ? [['GOAL at most', row.waiting ? share(row.atMost) : '—']] : []),
      ['Messages', num(row.messages)],
      // a no-break space keeps each level with its count when the line wraps
      ['Every level', lib.LEVELS.map(level => `${level} ${num(row.levels[level])}`).join(' · ')]
    ])]),
    folded('Where each strategy\'s circuits come from (which version the table reads)', [{
      html: '<p>The strategy file of the run, and the commit that last changed it:</p>' +
        markdownToHtml(versions.map(v => versionLine(v, hash => `\`${hash}\``)).join('\n')).replace(/<code>([0-9a-f]{7,})<\/code>/gu, (_, hash) => commitLink(hash).html),
      md: 'The strategy file of the run, and the commit that last changed it:\n\n' + versions.map(v => versionLine(v, hash => commitLink(hash).md)).join('\n')}]),
    folded('Accepted circuits that leave an attachment open', [
      'A circuit may mark a phrase with `attachment=ambiguous` when the words do not say where it hangs. The hand-written grammars do this far more often, which makes their circuits easier to accept. ' +
      'For each strategy, the share of its accepted circuits that carry the mark:',
      sorted.map(row => `- **${row.strategy}**: ${pct(row.ambiguous, row.accepted)}, ${num(row.ambiguous)} of ${num(row.accepted)} accepted circuits.`).join('\n')]),
    `**About this run.** \`${runName}\`: ${num(messages)} messages drawn at random from the whole dataset (seed and method in ` +
    `\`sample.lock.json\`), every circuit of every strategy judged. Judged in this run: ${num(judgedHere)} circuits` +
    (agreedHere ? `; settled by agreement: ${num(agreedHere)}` : '') + `. Before the run, ${num(labelled)} of the ${num(messages)} messages had a label. ` +
    `The [registry](#g-registry) of judged circuits holds ${num(registry.rows)} circuits of ${num(registry.byText.size)} messages: ${judgeList.join(', ')}` +
    (judges.agreement ? `, and ${num(judges.agreement)} agreement circuits recorded with no judge${agreementText ? `: ${agreementText}` : ''}` : '') + '.'
  ]
  if (notRun.length) blocks.push(`Not in the table: ${notRun.join(', ')}.`)
  if (read.problems.length) blocks.push(`${num(read.problems.length)} verdict lines of this run have a format problem and are not counted; their circuits stand under "waiting".`)
  return {blocks, more}
}, {page: {file: 'benchmark.md', title: 'Benchmark in detail', purpose: 'the levels of every strategy on the benchmark, which version of each strategy the table reads, the accepted circuits that leave an attachment open, and the facts of the run.'}})

section('progress', 'Progress over time', () => {
  const entries = history().map((entry, index) => ({...entry, index}))
  const newest = [...entries].sort((a, b) => a.time < b.time ? 1 : a.time > b.time ? -1 : b.index - a.index)
  const chip = (text, kind = '') => ({html: ` <span class="chip${kind ? ' ' + kind : ''}">${esc(text)}</span>`, md: ` *(${text})*`})
  const blocks = [htmlOnly('Each row is one judged measurement, written by hand into `docs/status/history.json` when its verdicts are in. ' +
    'Rows marked *trial* are experiments on a copy of hmm-rules, then named vss (the [lever trials](#g-lever)), not strategies. The oldest row was measured on other messages ' +
    'than the benchmark, so it is not comparable with the others.')]
  const more = [mdOnly('Each item is one judged measurement, written by hand into `docs/status/history.json` when its verdicts are in. ' +
    'Items marked *trial* are experiments on a copy of hmm-rules, then named vss (the [lever trials](#g-lever)), not strategies. The oldest item was measured on other messages ' +
    'than the benchmark, so it is not comparable with the others.')]
  // the chart: first and latest measurement of every strategy on the benchmark
  const series = new Map()
  for (const entry of [...entries].sort((a, b) => a.time < b.time ? -1 : a.time > b.time ? 1 : a.index - b.index)) {
    if (entry.trial || entry.sample !== 'random 1%') continue
    const s = series.get(entry.strategy) ?? series.set(entry.strategy, []).get(entry.strategy)
    s.push(entry)
  }
  const rows = [...series].map(([strategy, list]) => ({strategy, first: list[0], last: list.at(-1)})).sort((a, b) => b.last.goal - a.last.goal)
  const change = row => row.first === row.last ? null : row.last.goal - row.first.goal
  const signed = value => value === null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}`
  if (rows.length) {
    // drawn about as wide as a phone column, so that its text keeps its size
    const W = 330, left = 98, right = 308, top = 28, rowHeight = 44, lo = 50, hi = 100
    const x = value => left + (Math.min(hi, Math.max(lo, value)) - lo) / (hi - lo) * (right - left)
    const H = top + rows.length * rowHeight + 28, axisY = top + rows.length * rowHeight
    let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="First and latest GOAL of each strategy on the benchmark">`
    for (let tick = lo; tick <= hi; tick += 10) svg += `<line class="grid" x1="${x(tick)}" x2="${x(tick)}" y1="${top - 6}" y2="${axisY}"/><text class="tick" x="${x(tick)}" y="${axisY + 18}" text-anchor="middle">${tick}%</text>`
    svg += `<line class="aimline" x1="${x(99)}" x2="${x(99)}" y1="${top - 12}" y2="${axisY}"/><text class="tick" x="${x(99) - 4}" y="${top - 14}" text-anchor="end">aim 99%</text>`
    rows.forEach((row, index) => {
      const cy = top + index * rowHeight + rowHeight / 2
      svg += `<text class="label" x="0" y="${cy - 3}">${esc(row.strategy)}</text>`
      svg += `<text class="sub" x="0" y="${cy + 14}">${row.first === row.last ? row.last.goal.toFixed(1) : `${row.first.goal.toFixed(1)} → ${row.last.goal.toFixed(1)}`}</text>`
      // the first value is a tick taller than the dot, so that it stays visible when the two are close
      if (row.first !== row.last) svg += `<line class="link" x1="${x(row.first.goal)}" x2="${x(row.last.goal)}" y1="${cy}" y2="${cy}"/>` +
        `<line class="first s-${colour(row.strategy)}" x1="${x(row.first.goal)}" x2="${x(row.first.goal)}" y1="${cy - 11}" y2="${cy + 11}"><title>${esc(row.strategy)} ${row.first.goal}% at ${esc(row.first.time)} (${esc(row.first.commit)})</title></line>`
      svg += `<circle class="last s-${colour(row.strategy)}" cx="${x(row.last.goal)}" cy="${cy}" r="6"><title>${esc(row.strategy)} ${row.last.goal}% at ${esc(row.last.time)} (${esc(row.last.commit)})${row.first !== row.last ? `, ${signed(change(row))} points since the first judging` : ''}</title></circle>`
    })
    svg += '</svg>'
    blocks.push({html: `<figure class="fig">${svg}<figcaption>GOAL on the benchmark (share of messages accepted). Vertical tick: the first judged measurement; dot: the latest. The scale starts at 50%.</figcaption></figure>`, md: ''})
    blocks.push('**First and latest GOAL** of each strategy on the benchmark, with the time of day of each measurement and the change in points:')
    blocks.push(table(['Strategy', 'First → latest'], rows.map(row => [nameCell(row.strategy), row.first === row.last
      ? `${row.last.goal.toFixed(1)}% (${row.last.time.slice(11)}); one measurement`
      : `${row.first.goal.toFixed(1)}% (${row.first.time.slice(11)}) → ${row.last.goal.toFixed(1)}% (${row.last.time.slice(11)}); ${signed(change(row))} points`])))
  }
  more.push('**How sure these numbers are.** Each GOAL comes from 1,831 messages, so it is known to about ±2 points (95% interval). ' +
    'A change of 1 or 2 points between two separate measurements can be chance. The trial rows are paired (the same messages and the same copy of hmm-rules, with one aid added), ' +
    'which makes their differences more precise than two separate intervals suggest; a paired test was not run. Their gains of +1.3 and +2.2 points are close to the uncertainty, the +3.9 of the roles less so.')
  more.push('**Every measurement**, newest first:')
  const tagsOf = entry => [entry.trial ? chip('trial: ' + entry.trial, 'trial') : null, entry.sample && entry.sample !== 'random 1%' ? chip(entry.sample) : null].filter(Boolean)
  more.push({
    html: '<ul class="entries">' + newest.map(entry => `<li><div class="head"><span class="goal">${Number(entry.goal).toFixed(1)}%</span>` +
      `<span class="who">${dot(entry.strategy)}${esc(entry.strategy)}${tagsOf(entry).map(tag => tag.html).join('')}</span>` +
      `<span class="when">${esc(entry.time)}${entry.commit ? ' · ' + commitLink(entry.commit).html : ''}</span></div>` +
      (entry.note ? `<div class="text">${inline(entry.note)}</div>` : '') + '</li>').join('') + '</ul>',
    md: newest.map(entry => `- **${Number(entry.goal).toFixed(1)}%** ${entry.strategy}${tagsOf(entry).map(tag => tag.md).join('')} · ${entry.time}` +
      (entry.commit ? ' · ' + commitLink(entry.commit).md : '') + (entry.note ? `. ${entry.note}` : '')).join('\n')
  })
  // the live table against the last recorded measurement of each strategy
  try {
    const live = bench().rows, behind = []
    for (const row of live) {
      const recorded = [...entries].filter(entry => entry.strategy === row.strategy && !entry.trial && entry.sample === 'random 1%').sort((a, b) => a.time < b.time ? -1 : 1).at(-1)
      if (recorded && Math.abs(recorded.goal - 100 * row.goal) >= 0.05) behind.push(`${row.strategy}: live ${share(row.goal)}${row.waiting ? ` with ${num(row.waiting)} circuits waiting` : ''}; last row ${recorded.goal.toFixed(1)}% (${recorded.commit}, ${recorded.time})`)
    }
    if (behind.length) blocks.push(box(`**Not in this list yet.** The live table differs from the last row of ${behind.join('; ')}. ` +
      'The live table reads the circuits in the strategy files of the run now (see "Where each strategy\'s circuits come from" in [the benchmark](#benchmark)); they come from a later version than the row, or some of them still wait for a judge.', 'warn'))
  } catch { /* the benchmark section reports its own error */ }
  return {blocks, more}
}, {page: {file: 'progress.md', title: 'Every measurement', purpose: 'every judged measurement of GOAL over time, newest first, with its commit and what changed, and how sure the numbers are.'}})

section('speed', 'Speed and cost per strategy', () => {
  const {list, by, datasetMessages, cores} = speed()
  const fixed = digits => value => value === null ? '—' : value.toFixed(value < 10 ? digits : 1)
  const startText = row => row.startup === null ? 'not recorded' : row.startup < 1000 ? row.startup + ' ms' : (row.startup / 1000).toFixed(1) + ' s'
  const millisOf = value => value === null ? '—' : value.toFixed(value < 10 ? 2 : 1) + ' ms'
  const sizeOfModels = name => { const found = (facts()[name]?.models ?? []).map(([, path]) => sized(path)).filter(size => size !== null); return found.length ? bytes(found.reduce((a, b) => a + b, 0)) : 'not found' }
  const byMean = [...list].sort((a, b) => (a.average ?? Infinity) - (b.average ?? Infinity))
  // STATUS.md: one line per strategy, fastest first
  const blocks = [mdOnly(table(['Strategy', 'Speed and size'], byMean.map(row => [nameCell(row.name),
      `${millisOf(row.median)} median · ${row.perSecond === null ? '—' : num(Math.round(row.perSecond))} messages/s · whole dataset ${duration(row.whole)} · model files ${sizeOfModels(row.name)}`]))),
    mdOnly('Time per message in one process, from the benchmark run, fastest first by mean time. What is timed, and which comparisons are not like for like: [Speed and cost](formalizers/speed.md).')]
  const more = [
    'Measured while the benchmark ran (`run.mjs`): each strategy in a process of its own, on the same machine, one message at a time. ' +
    'Each figure is the wall-clock time of one call to the strategy\'s `propose` function: from handing over the message until the circuit comes back, ' +
    'including the call into Python or Prolog where there is one, and not including start-up (loading the model, paid once per process). ' +
    'The figures come from the milliseconds recorded for every message in the strategy files of the run, the same files the GOAL is computed from. ' +
    `Every figure is for one process. "Messages per second" and "Whole dataset" (the time for all ${num(datasetMessages)} messages) come from the mean; "90% within" is the time 90% of messages stay under.`,
    'Sizes are measured on disk now, in decimal units (1 MB = 1,000,000 bytes). "Model files" are the files the strategy loads; the runtime it needs (Node.js, Python with PyTorch, SWI-Prolog) is not counted, except where noted. ' +
    'The strategies are listed from the fastest to the slowest by mean time.'
  ]
  const millis = value => value === '—' ? '—' : value + ' ms'
  const sizeOfList = items => { const found = (items ?? []).map(([, path]) => sized(path)).filter(size => size !== null); return found.length ? bytes(found.reduce((a, b) => a + b, 0)) : 'not found' }
  for (const row of byMean) {
    const f = facts()[row.name]
    more.push(label(row.name))
    more.push(table(['Measure', 'Value'], [
      ['Messages per second', row.perSecond === null ? '—' : num(Math.round(row.perSecond))],
      ['Whole dataset', duration(row.whole)],
      ['Median', millis(fixed(2)(row.median))],
      ['90% within', millis(fixed(2)(row.p90))],
      ['99% within', millis(fixed(1)(row.p99))],
      ['Mean', millis(fixed(2)(row.average))],
      ['Start-up', startText(row)],
      ...(f ? [['Model files', sizeOfList(f.models)], ['Runtime', f.runtime], ['In a browser', f.browserShort], ['Training', f.trainingShort], ['Learns from labels', f.labels]] : [])
    ]))
  }
  const stale = list.filter(row => row.summaryMedian !== null && !row.summaryMatches)
  more.push('Start-up comes from `summary.json`, which `run.mjs` writes when it runs a strategy.' + (stale.length
    ? ' ' + stale.map(row => `For ${row.name}, summary.json still describes an earlier run (median ${row.summaryMedian.toFixed(2)} ms there, ${row.median.toFixed(2)} ms in the strategy file)`).join('; ') +
      ', so the start-up of the current run was not recorded and is left out.' : ''))
  const hmm = by['hmm-rules']
  if (hmm && by.spacy) {
    const parallel = hmm.whole / cores
    more.push(`**In practice.** hmm-rules reads about ${num(Math.round(hmm.perSecond))} messages a second in one Node process on one CPU core, so the whole dataset takes about ` +
      `${duration(hmm.whole)}; with ${cores} processes on this machine's ${cores} cores, about ${duration(parallel)} (an estimate, not measured). ` +
      `spaCy takes about ${duration(by.spacy.whole)} for the same work in one process: ${Math.round(by.spacy.average / hmm.average)} times longer per message on average ` +
      `(${Math.round(by.spacy.median / hmm.median)} times at the median). That makes spaCy the slowest step of every rerun over the whole dataset, such as the next one planned in [Working on now](#now)` +
      (by.distilbert ? `. DistilBERT on the GPU takes about ${duration(by.distilbert.whole)}` : '') +
      (by.z3 ? `; Z3 about ${duration(by.z3.whole)}, with a long tail (90% of messages within ${by.z3.p90.toFixed(0)} ms, 99% within ${by.z3.p99.toFixed(0)} ms)` : '') +
      `. For use while someone types: the ${hmm.median.toFixed(1)} ms of hmm-rules is instant, spaCy's ${by.spacy.median.toFixed(0)} ms goes unnoticed` + (by.z3 ? ', and Z3\'s slow messages would be felt.' : '.'))
  }
  more.push({html: markdownToHtml('**Not like for like.** DistilBERT ran on the GPU and spaCy on the CPU. The PyTorch strategies (spaCy\'s transformer and DistilBERT) may use several CPU threads inside their one process, ' +
    'so "one process" favours them. Messages were sent one at a time; spaCy and DistilBERT would be faster on batches of messages (not measured). ' +
    '**Not measured yet:** DistilBERT on a CPU (it decides whether DistilBERT can run where there is no GPU), the CPU time of each strategy, and speed with batches.'),
  md: '**Not like for like, and not measured yet:** GPU against CPU, threads inside one process, single runs, one message at a time ([Speed and cost: not like for like](formalizers/speed.md#not-like-for-like)).'})
  const known = list.map(row => row.name).filter(name => facts()[name])
  const sizeText = items => items.map(([label, path]) => `${label}: ${bytes(sized(path))} (${path.startsWith(root) ? rel(path) : path})`).join('; ')
  const detail = name => {
    const f = facts()[name]
    return [['Runs on', f.runs], ['In a browser', f.browser], ['Model files', sizeText(f.models)], ...(f.runtimeFiles ? [['Runtime files', sizeText(f.runtimeFiles)]] : []),
      ['Training', f.training], ['Source of its analysis', f.source]]
  }
  // the Markdown page keeps the measured facts; what each strategy needs to run is explained once, on formalizers/speed.md
  const measured = name => {
    const f = facts()[name]
    return [['Model files', sizeText(f.models)], ...(f.runtimeFiles ? [['Runtime files', sizeText(f.runtimeFiles)]] : []), ['Training', f.training]]
  }
  more.push({
    html: folded('Each strategy in detail', [{html: '<div class="facts">' + known.map(name => `<section class="fact"><h3>${dot(name)}${esc(name)} <span class="chip">${esc(ABOUT[name]?.state ?? '')}</span></h3><dl>${detail(name).map(([term, text]) => `<dt>${esc(term)}</dt><dd>${esc(text)}</dd>`).join('')}</dl></section>`).join('') + '</div>', md: ''}]).html,
    md: '### Model files and training\n\nWhat each strategy needs to run, and where its analysis comes from: [Speed and cost: what each formalizer needs](formalizers/speed.md#what-each-formalizer-needs).\n\n' +
      known.map(name => `**${name}** (${ABOUT[name]?.state ?? ''})\n\n` + measured(name).map(([term, text]) => `- ${term}: ${text}`).join('\n')).join('\n\n')
  })
  return {blocks, more}
}, {page: {file: 'speed.md', title: 'Speed and cost in detail', purpose: 'the time per message, start-up, model size, runtime and training of every strategy, as measured in the benchmark run.'}})

section('dataset', 'The dataset', () => {
  const {areas, total, files, distinct} = datasetStats()
  const line = t => `**${pct(t.circuit, t.messages)}** have a circuit: ${num(t.circuit)} of ${num(t.messages)} messages in ${num(t.files)} files. ` +
    `By agreement ${num(t.agreement)}; by a judge ${num(t.judge)}; written by a judge ${num(t.written)}` + (total.other ? `; other ${num(t.other)}` : '') +
    `. Open (no circuit): ${num(t.open)}.`
  const all = `${num(total.circuit)} of ${num(total.messages)} messages have a circuit (${pct(total.circuit, total.messages)}): ${num(total.agreement)} by agreement, ` +
    `${num(total.judge)} accepted by a judge, ${num(total.written)} written by a judge. ` + (distinct !== total.messages ? `The files hold ${num(distinct)} distinct texts.` : 'No message appears twice.')
  return {
    blocks: [mdOnly(`Counted now from \`webmeet-dataset/syntactic/\` (commit ${dataset.head ?? '?'}): ` + all +
      ' What the three ways of acceptance mean: [The dataset](evaluation/dataset.md).')],
    more: [
      `Counted now from the ${num(files)} files of \`webmeet-dataset/syntactic/\` (commit ${dataset.head ?? '?'}). Each row of a file is one message with its circuit ` +
      '(the label) in the column `sop`, or an empty cell while no circuit is settled. The column `accepted_by` says how the circuit was accepted: ' +
      '**agreement** (strategies that read the message from different sources wrote the same circuit; no judge read it), **judge** (a judge read and accepted it), ' +
      '**written** (a judge wrote it because no strategy\'s circuit was acceptable). The area is the first folder of the file.',
      table(['Area', 'Messages'], [...areas].map(([name, t]) => [name, rich(line(t))]).concat([[rich('**All**'), rich(line(total))]])),
      all
    ]
  }
}, {page: {file: 'dataset.md', title: 'Dataset labels by area', purpose: 'how many messages of each area of the dataset have a circuit, and how each circuit was accepted.'}})

section('agreement', 'Agreement between hmm-rules and spaCy', () => {
  const {outputs, registry, labelsBefore, texts: benchmarkTexts} = bench()
  // what the judges said of a circuit: a verdict of this run, else the registry, else the label before the run
  const judged = new Map()
  const judging = join(runDir, 'judging')
  for (const name of readdirSync(judging).filter(file => /^verdicts-\d+\.jsonl$/u.test(file))) {
    const packetFile = join(judging, name.replace('verdicts', 'packet'))
    if (!existsSync(packetFile)) continue
    const packet = new Map(readJsonl(packetFile).map(row => [row.n, row]))
    for (const verdict of readJsonl(join(judging, name))) {
      const row = packet.get(verdict.n)
      if (!row) continue
      if (!judged.has(row.text)) judged.set(row.text, new Map())
      judged.get(row.text).set(lib.normalForm(row.text, row.sop)?.core, verdict.grade === 'L8')
    }
  }
  const verdictOf = (text, core) => {
    const now = judged.get(text)?.get(core)
    if (now !== undefined) return now
    const before = lib.lookup(registry, text, core)
    if (before) return before.verdict === 'accepted'
    return labelsBefore.get(text)?.core === core ? true : null
  }
  const coresOf = (rows, computed) => new Map(rows.map(row => [row.text, {id: row.id, core: computed ? row.core : (row.sop ? lib.normalForm(row.text, row.sop)?.core ?? null : null)}]))
  const current = name => outputs.find(output => output.strategy === name)?.rows
  const firstTime = history().filter(entry => !entry.trial && entry.sample === 'random 1%').map(entry => entry.time).sort()[0]
  const versions = []
  // the first run holds the file of hmm-rules under its name then, vss.jsonl (lib.outputFile finds it)
  const firstHmm = lib.outputFile(join(runDir, 'first-run'), 'hmm-rules')
  if (existsSync(firstHmm) && existsSync(join(runDir, 'first-run/spacy.jsonl')))
    versions.push([`first judging${firstTime ? ` (${firstTime.slice(11)})` : ''}`, coresOf(readJsonl(firstHmm), false), coresOf(readJsonl(join(runDir, 'first-run/spacy.jsonl')), false)])
  if (current('hmm-rules') && current('spacy')) versions.push(['now', coresOf(current('hmm-rules'), true), coresOf(current('spacy'), true)])
  if (!versions.length) throw new Error('the run has no circuits of hmm-rules and spaCy')
  const results = versions.map(([label, hmm, spacy]) => {
    const total = {n: 0, strict: 0, relaxed: 0, ok: 0, bad: 0, unknown: 0}, areas = new Map(), split = {}
    for (const [text, a] of hmm) {
      const b = spacy.get(text), area = a.id.split('/')[0]
      const t = areas.get(area) ?? areas.set(area, {n: 0, strict: 0, relaxed: 0}).get(area)
      const x = a.core, y = b?.core ?? null
      t.n++; total.n++
      if (x && x === y) { t.strict++; total.strict++ }
      if (x && y && lib.relaxedCore(x) === lib.relaxedCore(y)) {
        t.relaxed++; total.relaxed++
        const verdict = verdictOf(text, x)
        if (verdict === true) total.ok++; else if (verdict === false) total.bad++; else total.unknown++
      } else if (x && y) {
        const word = verdict => verdict === true ? 'accepted' : verdict === false ? 'rejected' : 'no verdict'
        const key = `${word(verdictOf(text, x))}|${word(verdictOf(text, y))}`
        split[key] = (split[key] ?? 0) + 1
      }
    }
    return {label, total, areas, split}
  })
  const latest = results.at(-1), earlier = results.length > 1 ? results[0] : null
  const differing = Object.values(latest.split).reduce((a, b) => a + b, 0)
  const summaryRows = [
    ['Messages', t => num(t.n)],
    ['Same circuit', t => `${num(t.strict)} (${pct(t.strict, t.n)})`],
    ['Up to attachment', t => `${num(t.relaxed)} (${pct(t.relaxed, t.n)})`],
    ['… accepted', t => num(t.ok)],
    ['… rejected', t => num(t.bad)]
  ].concat(results.some(result => result.total.unknown) ? [['… no verdict yet', t => num(t.unknown)]] : [])
  const capital = text => text.charAt(0).toUpperCase() + text.slice(1)
  const t = latest.total
  // STATUS.md: two lines; the audit line is added below when the conversion folders are there
  const blocks = [mdOnly(`**${capital(latest.label)}, on the ${num(t.n)} benchmark messages**, hmm-rules and spaCy write the same circuit for ${num(t.strict)} (${pct(t.strict, t.n)}), ` +
    `and the same up to attachment (where a phrase with a linking word starts) for ${num(t.relaxed)} (${pct(t.relaxed, t.n)}). ` +
    `The judges accepted ${num(t.ok)} of these and rejected ${num(t.bad)}` + (t.unknown ? `; ${num(t.unknown)} have no verdict yet` : '') +
    '. Why agreement settles labels: [Agreement between formalizers](evaluation/agreement.md).')]
  const more = [
    'Two strategies that read a message from different sources (hmm-rules from raw text, spaCy from a parser trained on treebanks) and write the same circuit are very likely right. ' +
    'This is how most labels of the dataset were made. **Same circuit**: equal after the [normal form](#g-normal) (wire names and order do not matter). ' +
    '**Up to attachment**: the same circuit except where a phrase with a linking word ("on", "of", "for") starts, which the judges\' rules let be the clause or a nominal of it ' +
    '(the journal says "up to the start of marked relations"). Under it: how many of these agreed circuits the judges accepted, rejected, or have not read.',
    ...results.flatMap(result => [`**${capital(result.label)}**, benchmark messages:`,
      table(['Measure', 'Count'], summaryRows.map(([name, value]) => [name, value(result.total)]), ['', 'r'])]),
    `**By area** (${latest.label}${earlier ? `; at the end of each row, the ${earlier.label}` : ''}). Small areas give rough shares: look at the number of messages.`,
    table(['Area', 'Agreement'],
      [...latest.areas].sort((a, b) => b[1].relaxed / b[1].n - a[1].relaxed / a[1].n).map(([area, t]) => [area,
        `${pct(t.relaxed, t.n)} up to attachment, ${pct(t.strict, t.n)} same circuit, of ${num(t.n)} messages` +
        (earlier ? `; ${earlier.label}: ${earlier.areas.get(area) ? pct(earlier.areas.get(area).relaxed, earlier.areas.get(area).n) : '—'} up to attachment` : '')])),
    `Where both wrote a valid circuit and the circuits differ (${num(differing)} messages, ${latest.label}), what the judges said of each:`,
    table(['Messages', 'What the judges said'], Object.entries(latest.split).sort((a, b) => b[1] - a[1]).map(([key, count]) => {
      const [ofHmm, ofSpacy] = key.split('|')
      return [num(count), `circuit of hmm-rules: ${ofHmm}; spaCy's circuit: ${ofSpacy}`]
    }), ['r', ''], {sticky: false}),
    'Where both circuits were accepted, the schema allows more than one reading (which word heads a name, a number after a noun as a dependent or as its own nominal, ' +
    'modifier or discourse word). The tables above compare by the keys `core` and `relaxed`; the wider key `variants` (commit `c8d0a09`) also counts such choices as the same ' +
    '([Agreement: the keys](evaluation/agreement.md)).'
  ]
  // the audit of the batch conversion: agreed circuits a judge read, in every conversion folder
  if (existsSync(conversionDir)) {
    let folders = 0, sent = 0, judgedCount = 0, accepted = 0
    const agreedCircuits = []
    for (const name of readdirSync(conversionDir, {withFileTypes: true}).filter(entry => entry.isDirectory()).map(entry => entry.name)) {
      const folder = join(conversionDir, name), agreementFile = join(folder, 'key/agreement.jsonl')
      if (!existsSync(agreementFile)) continue
      folders++
      const items = existsSync(join(folder, 'key/items.jsonl')) ? readJsonl(join(folder, 'key/items.jsonl')) : []
      const numberOf = new Map(items.map(item => [item.text + '\0' + item.core, item.n]))
      const grades = new Map()
      if (existsSync(join(folder, 'judging'))) for (const file of readdirSync(join(folder, 'judging')).filter(file => /^verdicts-\d+\.jsonl$/u.test(file))) for (const verdict of readJsonl(join(folder, 'judging', file))) grades.set(verdict.n, verdict.grade)
      for (const circuit of readJsonl(agreementFile)) {
        agreedCircuits.push(circuit)
        if (!circuit.audit) continue
        sent++
        const grade = grades.get(numberOf.get(circuit.text + '\0' + circuit.core))
        if (grade) { judgedCount++; if (grade === 'L8') accepted++ }
      }
    }
    const agreed = agreedCircuits.length
    more.push('**Audit of the batch conversion.** When the whole dataset was converted, every circuit that strategies of different [families](#g-families) wrote alike ' +
      'was written into the dataset with no judge; a judge read a random 2% of them as a control (the [audit](#g-audit)). Counted now from the agreement records of the conversion folders:')
    more.push(table(['Audit', 'Count'], [
      ['Conversion folders', num(folders)],
      ['Settled by agreement', num(agreed)],
      ['Read by a judge', `${num(judgedCount)} (${pct(judgedCount, agreed)})`],
      ['… accepted', num(accepted)],
      ['… rejected', `${num(judgedCount - accepted)} (${pct(judgedCount - accepted, judgedCount, 2)})`]
    ], ['', 'r']))
    // the journal (and commit a09047d) gave the audit of the first batch alone: 1,154 read; the records also hold the later refills
    const pools = readdirSync(join(root, 'eval-results')).filter(name => /^conversion-audit/u.test(name)).sort()
    blocks.push(mdOnly(`**Audit of the batch conversion:** a judge read ${num(judgedCount)} of the ${num(agreed)} circuits settled by agreement (${pct(judgedCount, agreed)}) ` +
      `and rejected ${num(judgedCount - accepted)} (${pct(judgedCount - accepted, judgedCount, 2)}). What the audit is: [The audit](evaluation/audit.md).`))
    if (judgedCount !== 1154 || sent !== judgedCount) more.push(`The records count ${num(judgedCount)} audit circuits read (${num(accepted)} accepted, ${num(judgedCount - accepted)} rejected), and these are the figures shown. ` +
      'The journal and commit `a09047d` give 1,154 read and 10 rejected: the audit of the first batch conversion alone. The records also hold the audits of the later refills of the conversion. ' +
      `The judges read the audit circuits in pooled packets (${pools.map(name => '`eval-results/' + name + '`').join(', ')}), together with other circuits of the conversion folders` +
      (sent !== judgedCount ? `; ${num(sent - judgedCount)} sent to a judge still have no verdict` : '') + '. How the counts add up: [The audit: the counts](evaluation/audit.md#the-counts).')
    // where the agreed circuits stand in the dataset now
    try {
      const labels = labelsNow(), where = {agreement: 0, audited: 0, replaced: 0, replacedBenchmark: 0, empty: 0, other: 0}
      for (const circuit of agreedCircuits) {
        const label = labels.get(circuit.text)
        if (!label) { where.empty++; continue }
        if (label.core !== circuit.core) { where.replaced++; if (benchmarkTexts.has(circuit.text)) where.replacedBenchmark++; continue }
        if (label.accepted_by === 'agreement') where.agreement++
        else if (label.accepted_by === 'judge') where.audited++
        else where.other++
      }
      const datasetAgreement = datasetStats().total.agreement
      more.push(`**Why the dataset has ${num(datasetAgreement)} agreement labels, not ${num(agreed)}.** Where the ${num(agreed)} agreed circuits stand in the dataset now:`)
      more.push(table(['Count', 'Where the agreed circuit stands'], [
        [num(where.agreement), 'Still the label, marked as settled by agreement'],
        [num(where.audited), 'Still the label, now marked as accepted by a judge (read in the audit and accepted)'],
        ...(where.other ? [[num(where.other), 'Still the label, marked otherwise']] : []),
        [num(where.replaced), `Replaced by another circuit${!where.replacedBenchmark ? '' : where.replacedBenchmark === where.replaced ? ' (all on benchmark messages, when the benchmark was published)'
          : ` (${num(where.replacedBenchmark)} of them on benchmark messages, when the benchmark was published)`}`],
        [num(where.empty), 'No circuit in the dataset now (the cell was emptied)']
      ], ['r', '']))
      if (datasetAgreement !== where.agreement) more.push(`The other ${num(datasetAgreement - where.agreement)} agreement labels of the dataset were settled outside these folders.`)
    } catch (error) { more.push(`Where the agreed circuits stand in the dataset could not be computed: ${String(error?.message ?? error).split('\n')[0]}`) }
  }
  return {blocks, more}
}, {page: {file: 'agreement.md', title: 'Agreement and audit in detail', purpose: 'how often hmm-rules and spaCy write the same circuit on the benchmark, by area and over time, what the judges said where they differ, the audit of the batch conversion, and where the agreed circuits stand in the dataset.'}})

section('journal', 'Journal', () => {
  const file = join(root, 'improvements-ideas.md')
  const source = readFileSync(file, 'utf8')
  const written = lastWritten(file)
  return {
    blocks: [
      `The working journal, \`improvements-ideas.md\`, written by hand at each stage (last ${written.how} ${localTime(written.date)}): where things stand, what is in progress, ` +
      'the next steps, ideas not yet tried and open points for the owner.',
      mdOnly('The file has wide tables, so it is best read on a computer: [improvements-ideas.md](../improvements-ideas.md). ' +
        'The page linked below is a copy made at every build, with those tables written as lists.')
    ],
    more: [
      box('**Its numbers can be older than the status page.** Parts of the journal, such as the table under "Where things stand", keep the figures of the time they were written. ' +
        'Where they differ from the computed sections of the status page, the computed ones are current.', 'warn'),
      'Here its tables of more than two columns are shown as lists, one item per row; the file itself keeps them as tables.',
      {html: folded(`Open the journal (${num(source.split('\n').length)} lines)`, [{html: `<div class="journal">${markdownToHtml(narrowTables(source), {shift: 1, dropTitle: true})}</div>`, md: ''}]).html,
        md: shiftMarkdown(narrowTables(source), 1, true)}
    ]
  }
}, {page: {file: 'journal.md', title: 'The journal, as lists', purpose: 'a copy of the working journal improvements-ideas.md, made at every build, with its wide tables written as lists so that it reads on a phone.'}})

section('recent', 'Recent work', () => {
  const blocks = [], more = [], shown = 10, first = 3
  for (const repo of [nlu, dataset]) {
    let log = []
    try { log = git(repo.path, 'log', '-30', '--format=%h%x1f%ad%x1f%s', '--date=format:%Y-%m-%d %H:%M').split('\n').filter(Boolean).map(line => line.split('\x1f')) } catch { /* no history */ }
    const list = part => ({
      html: '<ul class="commits">' + part.map(([hash, time, subject]) => `<li><span class="when">${esc(time)} · ${commitLink(hash, repo).html}</span><span class="subject">${esc(subject)}</span></li>`).join('') + '</ul>',
      md: part.map(([hash, time, subject]) => `- ${time} ${commitLink(hash, repo).md} ${subject}`).join('\n')
    })
    // STATUS.md: the newest commits of soplang-nlu; the section's page: both repositories
    if (repo === nlu) blocks.push(mdOnly(`The ${Math.min(first, log.length)} newest commits of **${repo.name}**:`), mdOnly(list(log.slice(0, first))))
    more.push(`**${repo.name}**: the last ${log.length} commits, newest first` + (repo.web ? ` ([all](${repo.web}/commits))` : '') + '.')
    more.push(list(log.slice(0, shown)))
    if (log.length > shown) more.push({html: folded(`${log.length - shown} older commits of ${repo.name}`, [list(log.slice(shown))]).html, md: list(log.slice(shown)).md})
  }
  return {blocks, more}
}, {page: {file: 'commits.md', title: 'Recent commits', purpose: 'the last 30 commits of soplang-nlu and of webmeet-dataset, newest first.'}})

section('glossary', 'Glossary', () => {
  let messages = null
  try { messages = bench().messages } catch { /* unknown */ }
  const terms = [
    ['g-message', 'Message', 'One text a user typed, such as "make a bar chart of the projects by name please". The dataset holds messages to a drawing app, a diagram tool, a calendar and a document editor.'],
    ['g-strategy', 'Strategy (formalizer)', 'A program that reads one message alone, with no context and no knowledge base, and writes its circuit. Five are measured: hmm-rules, spacy, distilbert, prolog, z3 ([what each is](#about)).'],
    ['g-hmm-rules', 'hmm-rules', 'Our own reader so far (`strategies/hmm-rules/`), called vss until 2026-11-27: a [hidden Markov model](https://en.wikipedia.org/wiki/Hidden_Markov_model) learned from raw text tags each word with a station, and general rules over function words build the circuit. It kept the name of the vector-symbolic reader it started as; it was renamed because it is not one. Experimental. The vector-symbolic reader of the project is rvss, being built ([How hmm-rules works](hmm-rules/how-it-works.md)).'],
    ['g-circuit', 'Circuit', 'The syntactic analysis of one message, written as lines of SOP Lang, one line (a wire) per part. Every word of the message has exactly one place in it. There is an example under [What this project does](#about).'],
    ['g-wire', 'Wire', 'One line of a circuit: a name, a type, and keys that hold words of the message or point to other wires. Example: `@n1 syntax.nominal dependent="the" head="box"`.'],
    ['g-wire-types', 'The four wire types', '**clause**: one verb with everything that belongs to it (one command, statement or question). **nominal**: the words that describe one thing ("the two small red boxes"). **relation**: a tie between two wires, usually through a linking word ("on", "of", "next to"). **coordination**: things or clauses put side by side with "and", "or", "but".'],
    ['g-schema', 'Syntax schema', 'The rules that say which wires and keys exist and how to use them: 4 wire types and 18 keys ([The syntax schema](schema/README.md)).'],
    ['g-sop', 'SOP Lang', 'The line language circuits are written in: each line starts with a name such as `@c1`, then a type and keys with their values. The project writes its other declarations in it too, such as the legend of hmm-rules.'],
    ['g-judge', 'Judge', 'A reviewer that reads a message and one circuit, without knowing which strategy wrote it, and accepts it or rejects it with a grade (L1 to L6), following written rules (`tests/benchmark/syntax/rules.md`). Here the judges are language-model agents; the registry names each one. How often two judges, or a judge and a person, agree on this schema has not been measured yet.'],
    ['g-packet', 'Packet', 'A file of up to 200 circuits that one judge reads in one go (`judging/packet-N.jsonl` in a run folder); the verdicts go to `judging/verdicts-N.jsonl`. "Judged in packets 45-46" names two such files.'],
    ['g-label', 'Label', 'The accepted circuit of a message, kept in the `sop` column of the dataset\'s syntactic files. Labels are what strategies are measured against and trained on.'],
    ['g-gold', 'Gold and silver labels', 'Gold: labels a judge accepted or wrote. Silver: labels settled by agreement, which DistilBERT trains on at a lower weight.'],
    ['g-agreement', 'Agreement', 'Two strategies that read from different sources wrote the same circuit for a message. Such a circuit is taken as the label with no judge; a judge reads a random 2% as a control.'],
    ['g-audit', 'Audit', 'The random share (2%) of the circuits settled by agreement that a judge reads all the same, to measure how often agreement is wrong.'],
    ['g-families', 'Families of strategies', 'Strategies that read the same source, for example several variants built on the same spaCy parse, form one family. They agree with each other on 77–100% of messages and repeat the same faults, so agreement counts only between families.'],
    ['g-normal', 'Normal form (core)', 'A circuit rewritten so that the names of its wires and the order of its lines do not matter. Two circuits with the same normal form, called their core, are the same circuit.'],
    ['g-attachment', 'Up to attachment', 'Two circuits that are equal except for where a phrase with a linking word starts (the clause or a nominal of it); the journal calls it "up to the start of marked relations". The judges\' rules allow either place, so such circuits count as agreeing. `attachment=ambiguous` marks a phrase whose place the words do not settle.'],
    ['g-registry', 'Registry', 'Every circuit a judge has read, accepted or rejected, with the reason (`webmeet-dataset/annotations/syntax/v1/judged`). A circuit is judged once. It also keeps a few agreement circuits with no judge, as accepted readings.'],
    ['g-round', 'Round (conversion round)', 'One pass over the next files of the dataset: the strategies write circuits, agreement settles what it can, a judge reads the rest, and the accepted circuits are written into the files.'],
    ['g-benchmark', 'Benchmark', `1% of the dataset's messages drawn at random (${runName}${messages ? `, ${num(messages)} messages` : ''}). Every circuit of every strategy on it is judged. Its messages are held out of training on labels; hmm-rules learns its stations from raw text that includes them, without labels. Some rules were found by reading its rejected circuits, so it is no longer an unseen sample; a fresh sample is planned.`],
    ['g-levels', 'Levels and GOAL', 'L0 no valid circuit; L1–L6 rejected, with the judge\'s grade; L7 unused; L8 accepted; L9 equal to the earlier label; L10 accepted and replacing the earlier label. GOAL is the share of messages at L8, L9 or L10.'],
    ['g-interval', '95% interval', 'The range in which the true share most likely lies, given how many messages were measured (the Wilson score interval). On 1,831 messages it is about ±2 points, so a difference of 1 or 2 points between two separate measurements can be chance.'],
    ['g-station', 'Station (hmm-rules)', 'A class of words that hmm-rules learns from raw text by the company words keep and by their order, with no labels: a hidden state of its hidden Markov model. hmm-rules reads a message as a path through stations; then its rules build the circuit.'],
    ['g-em', 'EM (expectation–maximization)', 'How the station tagger of hmm-rules is trained (Baum–Welch, the EM method for a hidden Markov model): it guesses which station each word stands at, counts, and guesses again, round after round, from raw text with no labels.'],
    ['g-linker', 'Linker (hmm-rules)', 'The part of hmm-rules that builds clauses, relations and coordinations from the words and their stations, by rules with thresholds, in one pass.'],
    ['g-analysis', 'Drawing, diagram and calendar analyses', 'Studies of the faults hmm-rules (then named vss) makes on the files of one area of the dataset: agents read a sample of its circuits and proposed general rules, which were then added to it.'],
    ['g-lever', 'Lever trial', 'An experiment on a copy of hmm-rules (then named vss) that adds one learned aid, judged against the same copy without it on the same benchmark messages. A lever is a change beyond adding single rules.'],
    ['g-prior', 'Station prior', 'A lever trial: the station tagger of hmm-rules trained again with the accepted circuits mapped to stations, as a weighted starting point.'],
    ['g-evidence', 'DistilBERT evidence', 'A lever trial: a per-word table learned from DistilBERT\'s circuits says how a word is used (verb, word of a nominal, modifier, marker, other). Where the table is sure and hmm-rules disagrees, hmm-rules keeps the word off the stations the table rules out. "On the verb" uses it for the verb only; "on roles" for all five uses.'],
    ['g-checkpoint', 'Checkpoint', `The saved weights of a trained model; ${distilCheckpoint()} is the DistilBERT checkpoint of the latest DistilBERT measurement.`],
    ['g-epoch', 'Epoch', 'One pass of training over all training examples.'],
    ['g-development', 'Development messages', 'Labelled messages kept out of training to choose settings and check progress while training. They are not the benchmark.'],
    ['g-held', 'Held out', 'Kept out of training on labels, so that a measurement on those messages is fair.'],
    ['g-experimental', 'Experimental', 'Still measured on the benchmark and kept runnable, and still a voice in agreement for its own family, but not improved for now (owner\'s decision of 2026-11-27): hmm-rules, distilbert, prolog and z3. spacy is the one active strategy; rvss, a vector-symbolic reader, is being built.']
  ]
  return ['The terms of this page, in short. Every term of the project, with the page that explains it: the [Glossary](reference/glossary.md) of the documentation.', {
    html: '<dl class="glossary">' + terms.map(([id, term, text]) => `<dt id="${id}">${esc(term)}</dt><dd>${inline(text)}</dd>`).join('') + '</dl>',
    md: terms.map(([, term, text]) => `- **${term}**: ${text}`).join('\n')
  }]
}, {where: 'html'})

// ================================================================== what changed since the last build
function snapshotNow() {
  const snap = {time: localTime(now), nlu: nlu.head, dataset: dataset.head, strategies: {}, judgedHere: null, registryRows: null, datasetCircuits: null}
  try {
    const b = bench()
    for (const row of [...b.rows].sort((x, y) => x.strategy < y.strategy ? -1 : 1)) snap.strategies[row.strategy] = {accepted: row.accepted, messages: row.messages, waiting: row.waiting}
    snap.judgedHere = b.judgedHere; snap.registryRows = b.registry.rows
  } catch { /* left empty */ }
  try { snap.datasetCircuits = datasetStats().total.circuit } catch { /* left empty */ }
  return snap
}
const sameState = (a, b) => !!a && !!b && JSON.stringify({...a, time: null}) === JSON.stringify({...b, time: null})
function changesSince(base, snap) {
  const parts = []
  for (const [name, b] of Object.entries(snap.strategies)) {
    const a = base.strategies?.[name]
    if (!a) { parts.push(`${name} new in the table at ${pct(b.accepted, b.messages)}`); continue }
    if (a.accepted !== b.accepted || a.messages !== b.messages) parts.push(`${name} ${pct(a.accepted, a.messages)} → ${pct(b.accepted, b.messages)}`)
    if (a.waiting !== b.waiting) parts.push(`${name} circuits waiting for a judge ${num(a.waiting)} → ${num(b.waiting)}`)
  }
  if (base.judgedHere !== snap.judgedHere) parts.push(`circuits judged in the benchmark run ${num(base.judgedHere)} → ${num(snap.judgedHere)}`)
  if (base.registryRows !== snap.registryRows) parts.push(`registry ${num(base.registryRows)} → ${num(snap.registryRows)} circuits`)
  if (base.datasetCircuits !== snap.datasetCircuits) parts.push(`dataset messages with a circuit ${num(base.datasetCircuits)} → ${num(snap.datasetCircuits)}`)
  for (const [repo, before] of [[nlu, base.nlu], [dataset, base.dataset]]) {
    if (!before || before === repo.head) continue
    let count = null
    try { count = Number(git(repo.path, 'rev-list', '--count', `${before}..HEAD`)) } catch { /* unknown */ }
    parts.push(count === null ? `${repo.name} moved from ${before} to ${repo.head}` : `${num(count)} new commit${count === 1 ? '' : 's'} in ${repo.name}`)
  }
  return parts
}
let sinceLine = null
try {
  const snap = snapshotNow()
  let saved = null
  try { saved = readJson(snapshotFile) } catch { /* first build */ }
  // the comparison is with the last build whose numbers differ, so that a rebuild with nothing new keeps the line
  const base = sameState(saved?.current, snap) ? saved.base : saved?.current ?? null
  if (!sameState(saved?.current, snap)) writeFileSync(snapshotFile, JSON.stringify({current: snap, base}, null, 2) + '\n')
  if (base) {
    const parts = changesSince(base, snap)
    sinceLine = parts.length ? `**Since the build of ${base.time}** (${base.nlu ?? '?'}): ${parts.join('; ')}.` : `Nothing in these numbers changed since the build of ${base.time}.`
  } else sinceLine = 'No earlier build is saved; the next build will say what changed since this one.'
} catch (error) { console.error('The comparison with the last build failed:', error) }

// ================================================================== the page
const seconds = ((performance.now() - startedAt) / 1000).toFixed(1)
const repoLine = repo => `${repo.name} ${repo.head ?? '?'}` + (repo.changed ? ` (${repo.changed} uncommitted path${repo.changed === 1 ? '' : 's'})` : '')
const title = 'Syntax work status'
// the page follows the template of the documentation (docs/README.md): a breadcrumb, a purpose line, Next and Up at the end
const purpose = 'This page: the current numbers of the project, computed from the repositories at every build: scores, speed, the dataset, agreement, and what runs now. ' +
  'It is the only page of the documentation that holds current numbers, with the pages under status/ that it links. Kind: Reference.'
const htmlSections = sections.filter(s => s.where !== 'md'), mdSections = sections.filter(s => s.where !== 'html')
const subPages = mdSections.filter(s => s.page)
const NEXT = subPages.length ? [`status/${subPages[0].page.file}`, subPages[0].page.title] : ['evaluation/benchmark.md', 'The benchmark']
const navigation = htmlSections.map(s => `<li><a href="#${s.id}">${esc(s.title)}</a></li>`).join('')

const css = `
/* Layout: one reading column, phone first; wide tables scroll inside their own frame. */
:root {
  --bg: #f4f6f8; --surface: #ffffff; --fg: #18202a; --muted: #55606d; --line: #d8dee5; --track: #e5e9ee;
  --accent: #1c6886; --accent-soft: #e2eff4; --code-bg: #eaeef2; --shade: rgba(16, 24, 32, .18);
  --warn-bg: #fdf4de; --warn-line: #d9a93a;
  --s-hmm-rules: #257de0; --s-spacy: #f47230; --s-distilbert: #00b894; --s-prolog: #f2a600; --s-z3: #ee7fac; --s-other: #6a4ce2;
  --font-body: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #101317; --surface: #181c21; --fg: #e3e7eb; --muted: #9ba5b0; --line: #2c333b; --track: #262c33;
    --accent: #6db8d5; --accent-soft: #19303a; --code-bg: #232931; --shade: rgba(0, 0, 0, .6);
    --warn-bg: #2a2414; --warn-line: #8a6d25;
    --s-hmm-rules: #338ced; --s-spacy: #e76624; --s-distilbert: #00a888; --s-prolog: #d28e05; --s-z3: #e24d8b; --s-other: #9887ef;
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
  --bg: #101317; --surface: #181c21; --fg: #e3e7eb; --muted: #9ba5b0; --line: #2c333b; --track: #262c33;
  --accent: #6db8d5; --accent-soft: #19303a; --code-bg: #232931; --shade: rgba(0, 0, 0, .6);
  --warn-bg: #2a2414; --warn-line: #8a6d25;
  --s-hmm-rules: #338ced; --s-spacy: #e76624; --s-distilbert: #00a888; --s-prolog: #d28e05; --s-z3: #e24d8b; --s-other: #9887ef;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.55 var(--font-body); overflow-wrap: break-word; }
.page { max-width: 54rem; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 20px 56px; }
h1 { font-size: 1.65rem; line-height: 1.2; margin: 0 0 .3rem; text-wrap: balance; }
h2 { font-size: 1.3rem; line-height: 1.25; margin: 2.4rem 0 .7rem; padding-top: .9rem; border-top: 1px solid var(--line); text-wrap: balance; scroll-margin-top: 12px; }
h3 { font-size: 1.08rem; line-height: 1.3; margin: 1.5rem 0 .4rem; text-wrap: balance; }
h4, h5, h6 { font-size: 1rem; margin: 1.2rem 0 .3rem; }
p, li, dd { max-width: 72ch; }
p { margin: .6rem 0; }
ul, ol { padding-left: 1.3rem; margin: .5rem 0; }
li { margin: .3rem 0; }
a { color: var(--accent); text-underline-offset: 2px; }
a:focus-visible, summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }
code { font-family: var(--font-mono); font-size: .86em; background: var(--code-bg); padding: .08em .32em; border-radius: 4px; overflow-wrap: anywhere; }
pre { overflow-x: auto; background: var(--code-bg); padding: .7rem .8rem; border-radius: 6px; font-size: .88rem; line-height: 1.45; }
pre code { background: none; padding: 0; overflow-wrap: normal; }
.meta { color: var(--muted); font-size: .9rem; margin: 0; }
.note { color: var(--muted); font-size: .9rem; }
.box { background: var(--accent-soft); border-left: 3px solid var(--accent); border-radius: 0 6px 6px 0; padding: .1rem .85rem; margin: .9rem 0; font-size: .95rem; }
.box.warn { background: var(--warn-bg); border-left-color: var(--warn-line); }
.box p { margin: .5rem 0; }
.toc ol { display: flex; flex-wrap: wrap; gap: .4rem; list-style: none; padding: 0; margin: 1rem 0 0; }
.toc li { margin: 0; }
.toc a { display: inline-block; padding: .3rem .7rem; border: 1px solid var(--line); border-radius: 999px; background: var(--surface); text-decoration: none; font-size: .88rem; color: var(--fg); }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: .5rem; margin: .8rem 0 1rem; }
.tile { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: .6rem .8rem; display: grid; grid-template-columns: 5.4rem minmax(0, 1fr); align-items: center; gap: .7rem; min-width: 0; }
.tile .big { font-size: 1.5rem; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
.tile .small { color: var(--muted); font-size: .86rem; line-height: 1.35; }
/* a shadow at an edge where the table goes on: the cover layers scroll with the content, the shadows stay at the frame */
.tw { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: .8rem 0 1rem; border: 1px solid var(--line); border-radius: 6px; max-width: 100%;
  background: linear-gradient(to right, var(--surface) 35%, transparent) left center / 2rem 100% no-repeat local,
    linear-gradient(to left, var(--surface) 35%, transparent) right center / 2rem 100% no-repeat local,
    radial-gradient(farthest-side at 0 50%, var(--shade), transparent) left center / .9rem 100% no-repeat scroll,
    radial-gradient(farthest-side at 100% 50%, var(--shade), transparent) right center / .9rem 100% no-repeat scroll,
    var(--surface); }
.swipe { display: none; color: var(--muted); font-size: .8rem; margin: .8rem 0 -.5rem; }
table { border-collapse: separate; border-spacing: 0; width: 100%; font-size: .9rem; line-height: 1.4; }
th, td { padding: .42rem .6rem; text-align: left; vertical-align: top; border-bottom: 1px solid var(--line); }
th { font-weight: 600; color: var(--muted); font-size: .85rem; vertical-align: bottom; }
td.long { min-width: 13rem; }
td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
td.n { white-space: nowrap; }
th.nw { min-width: 5.5rem; }
tbody tr:last-child td { border-bottom: 0; }
tfoot td { font-weight: 600; border-top: 2px solid var(--line); border-bottom: 0; }
/* two columns: the first as narrow as its words allow, the second takes the rest and wraps */
table.two th:first-child, table.two td:first-child { width: 1%; min-width: 4.5rem; color: var(--muted); }
table.two th:first-child { color: var(--muted); }
table.two td.n:first-child { color: var(--fg); }
.crumb { font-size: .88rem; color: var(--muted); margin: 0 0 .4rem; }
.purpose { color: var(--muted); font-size: .95rem; margin: .2rem 0 .5rem; }
.who { margin: 1.1rem 0 -.3rem; font-size: 1rem; }
.next { margin-top: 2rem; padding-top: .8rem; border-top: 1px solid var(--line); font-size: .95rem; }
table.sticky th:first-child, table.sticky td:first-child { position: sticky; left: 0; background: var(--surface); z-index: 1; min-width: 6.5rem; max-width: 11rem; }
.dot { display: inline-block; width: .62em; height: .62em; border-radius: 50%; margin-right: .4em; vertical-align: .05em; }
.s-hmm-rules { background: var(--s-hmm-rules); fill: var(--s-hmm-rules); } .s-spacy { background: var(--s-spacy); fill: var(--s-spacy); }
.s-distilbert { background: var(--s-distilbert); fill: var(--s-distilbert); } .s-prolog { background: var(--s-prolog); fill: var(--s-prolog); }
.s-z3 { background: var(--s-z3); fill: var(--s-z3); } .s-other { background: var(--s-other); fill: var(--s-other); }
.chip { display: inline-block; font-size: .78rem; font-weight: 500; line-height: 1.5; padding: 0 .45rem; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); white-space: nowrap; vertical-align: .1em; }
.chip.trial { border-style: dashed; }
.bars { display: grid; gap: .6rem; margin: 1rem 0 .4rem; }
.bar { display: grid; grid-template-columns: 6.4rem minmax(0, 1fr) 3.6rem; align-items: center; gap: .6rem; }
.bar .name { font-weight: 600; font-size: .95rem; line-height: 1.25; }
.bar .name .chip { display: block; width: max-content; margin-top: .1rem; }
.bar .track { position: relative; height: 14px; background: var(--track); border-radius: 0 4px 4px 0; }
.bar .fill { position: absolute; top: 0; bottom: 0; left: 0; border-radius: 0 4px 4px 0; }
.bar .waitfill { opacity: .35; }
.bar .aim { position: absolute; top: -4px; bottom: -4px; left: 99%; width: 2px; background: var(--fg); }
.bar .val { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }
details { margin: .8rem 0; }
summary { cursor: pointer; color: var(--accent); padding: .2rem 0; }
.fig { margin: 1rem 0; }
.chart { display: block; width: 100%; max-width: 460px; height: auto; }
.chart text { font-family: var(--font-body); fill: var(--muted); }
.chart .label { font-size: 14px; font-weight: 600; fill: var(--fg); }
.chart .sub, .chart .tick { font-size: 12.5px; font-variant-numeric: tabular-nums; }
.chart .grid { stroke: var(--line); stroke-width: 1; }
.chart .aimline { stroke: var(--fg); stroke-width: 1.5; stroke-dasharray: 3 3; }
.chart .link { stroke: var(--muted); stroke-width: 2; opacity: .6; }
.chart .first { stroke-width: 3; stroke-linecap: round; }
.chart .first.s-hmm-rules { stroke: var(--s-hmm-rules); } .chart .first.s-spacy { stroke: var(--s-spacy); } .chart .first.s-distilbert { stroke: var(--s-distilbert); }
.chart .first.s-prolog { stroke: var(--s-prolog); } .chart .first.s-z3 { stroke: var(--s-z3); } .chart .first.s-other { stroke: var(--s-other); }
.chart .last { stroke: var(--surface); stroke-width: 2; }
figcaption { color: var(--muted); font-size: .88rem; margin-top: .3rem; max-width: 72ch; }
.facts { display: grid; gap: .2rem; }
.fact h3 { margin-top: 1.1rem; }
.fact dl { display: grid; grid-template-columns: minmax(7.5rem, max-content) minmax(0, 1fr); gap: .3rem .9rem; margin: .3rem 0 .6rem; font-size: .93rem; }
.fact dt { color: var(--muted); }
.fact dd { margin: 0; min-width: 0; }
.entries { list-style: none; padding: 0; margin: .4rem 0 1.2rem; }
.entries li { padding: .55rem 0; margin: 0; border-bottom: 1px solid var(--line); max-width: none; }
.entries .head { display: flex; flex-wrap: wrap; align-items: baseline; gap: .15rem .6rem; }
.entries .goal { font-weight: 700; font-variant-numeric: tabular-nums; min-width: 3.4rem; }
.entries .who { font-weight: 600; }
.entries .when { color: var(--muted); font-size: .82rem; font-variant-numeric: tabular-nums; }
.entries .text { font-size: .92rem; margin-top: .15rem; max-width: 72ch; }
.commits { list-style: none; padding: 0; margin: .4rem 0 1rem; }
.commits li { display: grid; gap: .1rem; padding: .45rem 0; margin: 0; border-bottom: 1px solid var(--line); max-width: none; }
.commits .when { color: var(--muted); font-size: .82rem; font-variant-numeric: tabular-nums; }
.commits .subject { font-size: .93rem; overflow-wrap: anywhere; }
.glossary dt { font-weight: 600; margin-top: .8rem; scroll-margin-top: 12px; }
.glossary dt:target { color: var(--accent); }
.glossary dd { margin: .15rem 0 0; }
.journal h3 { font-size: 1.12rem; } .journal h4 { font-size: 1.02rem; }
.top { font-size: .85rem; margin: 1.2rem 0 0; }
footer { margin-top: 2.5rem; padding-top: .9rem; border-top: 1px solid var(--line); color: var(--muted); font-size: .85rem; }
@media (max-width: 600px) { .swipe { display: block; } }
@media (max-width: 480px) {
  body { font-size: 15.5px; }
  .fact dl { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .fact dd { margin-bottom: .45rem; }
  .bar { grid-template-columns: 5.6rem minmax(0, 1fr) 3.3rem; gap: .45rem; }
}
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
`

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Status of the syntax-schema work of soplang-nlu: benchmark levels per strategy, progress, speed, dataset labels, agreement, journal and recent commits, generated from the data.">
<style>${css}</style>
</head>
<body>
<div class="page">
<header>
<p class="crumb"><a href="README.md">Home</a> › Status</p>
<h1>${title}</h1>
<p class="purpose">${inline(purpose)}</p>
<p class="meta">Generated ${esc(stamp)} by <code>node docs/status/build.mjs</code> · ${esc(repoLine(nlu))} · ${esc(repoLine(dataset))}</p>
${sinceLine ? `<div class="box">${markdownToHtml(sinceLine)}</div>` : ''}
<nav class="toc" id="contents" aria-label="Contents"><ol>${navigation}</ol></nav>
</header>
<main>
${htmlSections.map(s => `<section id="${s.id}" aria-labelledby="${s.id}-title">\n<h2 id="${s.id}-title">${esc(s.title)}</h2>\n${s.html}\n<p class="top"><a href="#contents">Back to contents</a></p>\n</section>`).join('\n')}
</main>
<nav class="next" aria-label="Next and up">Next: <a href="${NEXT[0]}">${esc(NEXT[1])}</a> · Up: <a href="README.md">Home</a></nav>
<footer>Built in ${seconds} s from the repositories as they are: <code>eval-results/${runName}</code>, the registry and the syntactic files of webmeet-dataset, <code>improvements-ideas.md</code>, git, and the two hand-written files <code>docs/status/now.md</code> and <code>docs/status/history.json</code>. "Uncommitted paths" counts the entries of <code>git status</code>, where a new folder counts once. The Markdown version is <a href="STATUS.md">STATUS.md</a>.</footer>
</div>
</body>
</html>
`

// the group of the documentation's Glossary (docs/reference/glossary.md) that defines a term of this page
const GLOSSARY_GROUP = {
  'g-lever': 'trials-and-training', 'g-prior': 'trials-and-training', 'g-evidence': 'trials-and-training', 'g-epoch': 'trials-and-training',
  'g-development': 'trials-and-training', 'g-interval': 'nlp-and-statistics', 'g-em': 'nlp-and-statistics',
  'g-station': 'hmm-rules-own-names', 'g-linker': 'hmm-rules-own-names', 'g-sop': 'notation-terms', 'g-wire': 'notation-terms', 'g-wire-types': 'grammar-terms'
}
/**
 * The links of a Markdown text written relative to docs/, made right for a page at `depth` folders below docs/.
 * A link to a section (#id) goes to its heading in STATUS.md; a glossary term (#g-…) to the Glossary of the
 * documentation; a section that STATUS.md does not show ("about") to the home page.
 */
function relink(md, depth) {
  const up = '../'.repeat(depth), status = depth ? `${up}STATUS.md` : ''
  return md.replace(/\]\(([^)\s]+)\)/gu, (whole, target) => {
    if (/^[a-z][a-z0-9+.-]*:/iu.test(target) || target.startsWith('//')) return whole
    if (target.startsWith('#')) {
      const id = target.slice(1)
      if (id.startsWith('g-')) return `](${up}reference/glossary.md#${GLOSSARY_GROUP[id] ?? 'project-terms'})`
      const found = sections.find(s => s.id === id)
      if (!found) return whole
      if (found.where === 'html') return `](${up}README.md#what-this-is)`
      return `](${status}#${slug(found.title)})`
    }
    return depth ? `](${up}${target})` : whole
  })
}
const generatedLine = `Generated ${stamp} by \`node docs/status/build.mjs\` · ${repoLine(nlu)} · ${repoLine(dataset)}.`
const builtLine = `Built in ${seconds} s from the repositories as they are, and from the hand-written files \`docs/status/now.md\` and \`docs/status/history.json\`; ` +
  '"uncommitted paths" counts the entries of `git status`, where a new folder counts once.'
const markdown = relink(['[Home](README.md) › Status', '', `# ${title}`, '', purpose, '',
  generatedLine + ' The phone page with charts is [status.html](status.html); on GitHub that link shows its HTML source, so open the file in a browser to see the page.', '',
  ...(sinceLine ? ['> ' + sinceLine, ''] : []),
  mdSections.map((s, index) => `${index + 1}. [${s.title}](#${slug(s.title)})`).join('\n'), '',
  ...mdSections.flatMap(s => [`## ${s.title}`, '', s.md, '', ...(s.page ? [`**More:** [${s.page.title}](status/${s.page.file}): ${s.page.purpose}`, ''] : [])]),
  builtLine, '', `---`, '', `Next: [${NEXT[1]}](${NEXT[0]}) · Up: [Home](README.md)`, ''].join('\n'), 0)
// one page per section with a page, in the order of the sections; each follows the template of the documentation
const pages = subPages.map((s, index) => {
  const next = subPages[index + 1]
  const text = [`[Home](../README.md) › [Status](../STATUS.md) › ${s.page.title}`, '', `# ${s.page.title}`, '',
    `This page: ${s.page.purpose} Kind: Reference.`, '',
    `${generatedLine} The main figures are in [${s.title}](../STATUS.md#${slug(s.title)}) on the status page; the terms are explained in the [Glossary](../reference/glossary.md).`, '',
    relink(s.moreMd, 1), '', '---', '',
    `Next: ${next ? `[${next.page.title}](${next.page.file})` : '[Home](../README.md)'} · Up: [Status](../STATUS.md)`, ''].join('\n')
  return {file: join(here, s.page.file), text}
})

writeFileSync(join(docsDir, 'status.html'), html)
writeFileSync(join(docsDir, 'STATUS.md'), markdown)
for (const {file, text} of pages) writeFileSync(file, text)
console.log(`Written docs/status.html (${bytes(Buffer.byteLength(html))}), docs/STATUS.md (${bytes(Buffer.byteLength(markdown))}) and ${pages.length} pages under docs/status/ ` +
  `(${pages.map(({file}) => relative(here, file)).join(', ')}) in ${((performance.now() - startedAt) / 1000).toFixed(1)} s.`)
