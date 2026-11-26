import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'

const levels = Array.from({length: 11}, (_, index) => `L${index}`)
const template = new URL('./legend.md', import.meta.url)
const method = 'Percentages use finalized strategy–message judgments. The denominator is the number of reviewed messages for each strategy. The accepted percentage sums the displayed L8–L10 values. The table uses the largest remainder method to display one decimal place and total 100.0% per strategy.'

const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0
const byLevel = (values) => Object.fromEntries(levels.map((level, index) => [level, values[index]]))
const countEntries = (counts) => Object.fromEntries([...counts.entries()].sort(([a], [b]) => compareText(a, b)))

export function gradeBand(grade) {
  if (!Number.isInteger(grade) || grade < 0 || grade > 10) {
    throw new RangeError(`Invalid semantic grade ${grade}`)
  }
  if (grade <= 4) return 'red'
  if (grade <= 7) return 'orange'
  return 'green'
}

export function summarizeReview(rows) {
  const engines = new Map()
  const allMessages = new Set()
  for (const {id, engine, grade, diagnostics} of rows) {
    gradeBand(grade)
    if (typeof id !== 'string' || !id.trim() || typeof engine !== 'string' || !engine.trim()) {
      throw new TypeError('Each judgment requires a message ID and strategy name')
    }
    if (!Array.isArray(diagnostics) || diagnostics.some((label) => typeof label !== 'string' || !label.trim())) {
      throw new TypeError(`Expected diagnostic labels for ${engine} / ${id}`)
    }
    if (!engines.has(engine)) {
      engines.set(engine, {
        ids: new Set(), counts: levels.map(() => 0),
        diagnostics: new Map(), diagnosticsByLevel: levels.map(() => new Map())
      })
    }
    const stats = engines.get(engine)
    if (stats.ids.has(id)) throw new Error(`Duplicate judgment for ${engine} / ${id}`)
    stats.ids.add(id)
    allMessages.add(id)
    stats.counts[grade]++
    for (const label of new Set(diagnostics)) {
      const gradeCounts = stats.diagnosticsByLevel[grade]
      gradeCounts.set(label, (gradeCounts.get(label) ?? 0) + 1)
      stats.diagnostics.set(label, (stats.diagnostics.get(label) ?? 0) + 1)
    }
  }
  if (!engines.size) throw new Error('No finalized judgments found')
  return {
    rubric: 'NLU semantic review v1',
    gradeBands: byLevel(levels.map((_, grade) => gradeBand(grade))),
    totalMessages: allMessages.size,
    engines: Object.fromEntries([...engines.entries()].sort(([a], [b]) => compareText(a, b)).map(([name, stats]) => {
      const total = stats.ids.size
      const accepted = stats.counts.slice(8).reduce((sum, count) => sum + count, 0)
      const tenths = stats.counts.map((count) => Math.floor(count * 1000 / total))
      const unallocated = 1000 - tenths.reduce((sum, share) => sum + share, 0)
      const remainders = stats.counts.map((count, grade) => ({grade, remainder: count * 1000 % total}))
      remainders.sort((a, b) => b.remainder - a.remainder || a.grade - b.grade)
      for (const {grade} of remainders.slice(0, unallocated)) tenths[grade]++
      return [name, {
        total,
        counts: byLevel(stats.counts),
        percentages: byLevel(stats.counts.map((count) => count * 100 / total)),
        roundedPercentages: byLevel(tenths.map((share) => share / 10)),
        accepted: {
          count: accepted,
          percentage: accepted * 100 / total,
          roundedPercentage: tenths.slice(8).reduce((sum, share) => sum + share, 0) / 10
        },
        diagnostics: countEntries(stats.diagnostics),
        diagnosticsByLevel: byLevel(stats.diagnosticsByLevel.map(countEntries))
      }]
    }))
  }
}

const tableRow = (cells) => `| ${cells.join(' | ')} |`
const tableCell = (value) => value.replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ')
const icons = {red: '🔴', orange: '🟠', green: '🟢'}

export async function renderReview(summary) {
  const engines = Object.entries(summary.engines)
  const percent = (share) => `${share.toFixed(1)}%`
  const table = [tableRow(['Level', ...engines.map(([name]) => tableCell(name))]),
    tableRow(['---', ...engines.map(() => '---:')])]
  for (const level of levels) {
    table.push(tableRow([`${icons[summary.gradeBands[level]]} ${level}`,
      ...engines.map(([, stats]) => percent(stats.roundedPercentages[level]))]))
  }
  table.push(
    tableRow(['**Total**', ...engines.map(() => '**100.0%**')]),
    tableRow(['**Accepted (L8–L10)**', ...engines.map(([, stats]) => `**${percent(stats.accepted.roundedPercentage)}**`)])
  )
  const bands = '🔴 L0–L4 Wrong or unusable · 🟠 L5–L7 Incomplete · 🟢 L8–L10 Accepted'
  const rubric = (await readFile(template, 'utf8')).replace(/^#[^\n]*\n+/, '').trim()
  const denominators = [
    tableRow(['Strategy', 'Reviewed messages']), tableRow(['---', '---:']),
    ...engines.map(([name, stats]) => tableRow([tableCell(name), String(stats.total)]))
  ].join('\n')
  const diagnosticRows = []
  for (const [engine, stats] of engines) {
    for (const level of levels) {
      for (const [label, count] of Object.entries(stats.diagnosticsByLevel[level])) {
        diagnosticRows.push(tableRow([tableCell(engine), level, tableCell(label), String(count)]))
      }
    }
  }
  const diagnostics = diagnosticRows.length
    ? [tableRow(['Strategy', 'Level', 'Diagnostic', 'Count']), tableRow(['---', '---', '---', '---:']), ...diagnosticRows].join('\n')
    : 'The finalized judgments contain no secondary diagnostics.'
  return [
    '# NLU semantic review v1', table.join('\n'), bands,
    '## Grading rubric', rubric, '## Reviewed messages', method, denominators,
    '## Secondary diagnostics by level', diagnostics, ''
  ].join('\n\n')
}

export async function writeReviewReport(inputFile, outputDir = dirname(resolve(inputFile))) {
  const contents = await readFile(inputFile)
  const input = (inputFile.endsWith('.gz') ? gunzipSync(contents) : contents).toString('utf8')
  const rows = input.split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return []
    try {
      return [JSON.parse(line)]
    } catch (cause) {
      throw new Error(`Invalid JSON on line ${index + 1} of ${inputFile}`, {cause})
    }
  })
  const summary = summarizeReview(rows)
  const report = await renderReview(summary)
  await mkdir(outputDir, {recursive: true})
  await Promise.all([
    writeFile(join(outputDir, 'report.md'), report),
    writeFile(join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
  ])
  return summary
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [inputFile, outputDir] = process.argv.slice(2)
  if (!inputFile) {
    console.error('Usage: node report.mjs FINALIZED_JUDGMENTS.jsonl[.gz] [OUTPUT_DIR]')
    process.exitCode = 1
  } else {
    await writeReviewReport(inputFile, outputDir)
  }
}
