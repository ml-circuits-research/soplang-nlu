// Evaluation only: compare the circuits of a run file with the accepted circuits of the
// dataset (webmeet-dataset/annotations/syntax/v1/judged and .../reference). No strategy reads them.
// Usage: node strategies/z3/tools/compare-references.mjs <run.jsonl> [--show N] [--skip N] [--grep text] [--kind exact|relaxed] [--against other.jsonl]
import {existsSync, readFileSync, readdirSync} from 'node:fs'
import {parseCircuit, validateSyntax, wordsOf} from '../../../lib/syntax.mjs'

const [file, ...rest] = process.argv.slice(2)
const option = (name, fallback) => rest.includes('--' + name) ? rest[rest.indexOf('--' + name) + 1] : fallback
const show = Number(option('show', 0)), grep = option('grep', ''), kind = option('kind', 'relaxed'), skip = Number(option('skip', 0))
const against = option('against', null), differ = option('differ', '')
const readJsonl = (path) => readFileSync(path, 'utf8').split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line))

/**
 * What a circuit states, one line per word and per tie, whatever the wire names and however
 * neighbouring words are grouped into values. Relaxed: the start of a relation, the mark
 * `attachment=ambiguous` and a coordination with no joining word (it only ties clauses that
 * stand side by side) are left out, since several readings pass there.
 */
function statements(text, sop, loose) {
  const check = validateSyntax(text, sop)
  if (!check.valid) return null
  const wires = parseCircuit(sop), byId = new Map(wires.map((wire) => [wire.id, wire]))
  const first = new Map()
  for (const {wire, first: at} of check.placements) first.set(wire, Math.min(first.get(wire) ?? Infinity, at))
  const refs = (wire, keys) => wire.slots.filter(([key, raw]) => raw.startsWith('$') && (!keys || keys.includes(key))).map(([, raw]) => raw.slice(1))
  const name = (id, depth = 0) => {
    const wire = byId.get(id)
    if (depth > 6) return '?'
    if (wire.type === 'syntax.relation') return 'r(' + (loose ? '' : refs(wire, ['from']).map((ref) => name(ref, depth + 1)).join()) + '>' + refs(wire, ['to']).map((ref) => name(ref, depth + 1)).join() + ')'
    if (wire.type === 'syntax.coordination') return 'k[' + refs(wire).map((ref) => name(ref, depth + 1)).sort().join('+') + ']'
    return first.has(id) ? wire.type[7] + first.get(id) : wire.type[7] + '(' + refs(wire).map((ref) => name(ref, depth + 1)).join() + ')'
  }
  const lines = new Set()
  const silent = (wire) => wire.type === 'syntax.coordination' && !wire.slots.some(([key]) => key === 'conjunction')
  for (const {wire, key, first: from, last} of check.placements) for (let word = from; word <= last; word++) lines.add(`${word} ${key} ${name(wire)}`)
  for (const wire of wires) {
    if (loose && silent(wire)) continue
    for (const [key, raw] of wire.slots) {
      if (raw.startsWith('"') || (loose && (key === 'from' || key === 'attachment'))) continue
      lines.add(`${name(wire.id)} ${key} ${raw.startsWith('$') ? name(raw.slice(1)) : raw}`)
    }
  }
  return lines
}
const same = (a, b) => a.size === b.size && [...a].every((line) => b.has(line))

// accepted circuits: what judges accepted, and the references rewritten from accepted `nlu` circuits
const base = new URL('../../../../webmeet-dataset/annotations/syntax/v1/', import.meta.url).pathname
const accepted = new Map()
for (const folder of ['judged', 'reference']) {
  if (!existsSync(base + folder)) continue
  for (const name of readdirSync(base + folder).filter((item) => item.endsWith('.jsonl'))) {
    for (const row of readJsonl(base + folder + '/' + name)) {
      if (row.verdict !== 'accepted' || !validateSyntax(row.text, row.sop).valid) continue
      if (!accepted.has(row.text)) accepted.set(row.text, [])
      accepted.get(row.text).push(row.sop)
    }
  }
}
const rows = readJsonl(file)
const others = against ? readJsonl(against) : null
let withReference = 0, exact = 0, loose = 0, shown = 0, seen = 0, lost = 0, won = 0
const differing = new Map()
const matches = (sop, text, relaxedMode) => {
  const own = sop ? statements(text, sop, relaxedMode) : null
  return Boolean(own && accepted.get(text).some((item) => same(own, statements(text, item, relaxedMode))))
}
for (const [index, row] of rows.entries()) {
  if (!accepted.has(row.text)) continue
  withReference++
  const isExact = matches(row.sop, row.text, false), isLoose = matches(row.sop, row.text, true)
  if (isExact) exact++
  if (isLoose) loose++
  const hit = kind === 'exact' ? isExact : isLoose
  if (others) {
    // against another run of the same sample: what was lost and what was won
    const before = matches(others[index].sop, row.text, kind !== 'exact')
    if (before && !hit) lost++
    if (!before && hit) won++
    if (before && !hit && shown < show) { shown++; console.log(`\n# ${row.text}\n-- before\n${others[index].sop}\n-- now\n${row.sop}`) }
    continue
  }
  if (hit || !row.sop) continue
  const own = statements(row.text, row.sop, true)
  let best = null
  for (const item of accepted.get(row.text)) {
    const other = statements(row.text, item, true)
    const extra = [...own].filter((line) => !other.has(line))
    if (!best || extra.length < best.extra.length) best = {extra, item}
  }
  for (const line of best.extra) { const key = line.replace(/^\d+ /u, '').replace(/[cn]\d+|[rk]?[[(][^ ]*/gu, '#'); differing.set(key, (differing.get(key) ?? 0) + 1) }
  if (shown < show && (!grep || row.text.includes(grep)) && (!differ || best.extra.some((line) => line.includes(differ))) && seen++ >= skip) {
    shown++
    if (rest.includes('--brief')) {
      // only the statements that the nearest accepted circuit does not make, and those it makes instead
      const words = wordsOf(row.text).map((word) => word.text)
      const named = (line) => line.replace(/^(\d+) /u, (_, at) => `"${words[at]}" `).replace(/([cn])(\d+)/gu, (_, kind, at) => `${kind}:${words[at]}`)
      const other = statements(row.text, best.item, true)
      console.log(`\n# ${row.text}\n   mine: ${best.extra.map(named).join(' | ')}\n   accepted: ${[...other].filter((line) => !own.has(line)).map(named).join(' | ')}`)
    } else console.log(`\n# ${row.text}\n-- mine\n${row.sop}\n-- accepted\n${best.item}`)
  }
}
console.log(JSON.stringify({file, messages: rows.length, withReference, exact, exactShare: exact / withReference, relaxed: loose, relaxedShare: loose / withReference,
  ...(others ? {lost, won} : {differingStatements: Object.fromEntries([...differing].sort((a, b) => b[1] - a[1]).slice(0, 16))})}, null, 1))
