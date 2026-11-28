// Plan B for the hard half (rows of the -advanced side: spaCy and hmm-rules disagree),.
//   node tests/benchmark/syntax/vibe/tiers.mjs build [--refresh <dir>] [--out <dir>]   levels, level-1 parts, Opus packets
//   node tests/benchmark/syntax/vibe/tiers.mjs merge [--out <dir>]                      cheap verdicts -> accepted / escalated, final file
//   node tests/benchmark/syntax/vibe/tiers.mjs spotcheck [--size 300] [--seed <text>]   a random sample of the rows both cheap models accepted, as Opus packets
//
// build: every row of <refresh>/advanced/<file>.csv (refresh.mjs) gets a suspicion level 1..4 (suspicion.mjs; the audit's own
// score from .local-data/rvss/silver-audit/scores.jsonl stands for a row whose spaCy circuit did not change since, the weights
// applied to the signals computed again for the others). Output (default eval-results/2026-11-28-hard-half/):
//   levels.jsonl.gz                          {file, row, level, score, from}
//   level1/glm/ and level1/deepseek/         the same parts twice (<area>__<name>-advanced.pNN.csv, at most 150 rows, n = the dataset row),
//                                            so that the verdict files of the two models do not collide; run.mjs judges them
//   opus/packet-NN.csv (+ .key.jsonl)        levels 2-4 (and rows with no spaCy circuit), most suspicious first, columns n,text,sop,alt,label_state;
//                                            n counts the packet; the key gives {n, file, row, level}
//   index.json, tiers.json                   part -> file; counts
// File names and row numbers here are those of the batches (the dataset's split when they were made); every join with other
// data (audit scores, the dataset) is by text, which is unique. A consumer of merged/final.jsonl must also match by text.
// merge: reads the verdicts of the parts (valid lines only). A row is accepted by the cheap models when both accept; a rejection by
//   either sends it to opus-escalated/packet-eNN.csv (rows already in a packet stay there, new ones go to new packets). Opus verdicts
//   (packet-*.verdicts.jsonl in opus/, opus-escalated/, opus-spotcheck/) override the cheap ones. Writes merged/final.jsonl: {file, row,
//   text, sop, source, accepted_by, judge, grade} for every row with a final circuit (accepted spaCy circuit or Opus's correction), and
//   merged/summary.json (counts, agreement of the two models, pending rows).
import {readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync} from 'node:fs'
import {gunzipSync, gzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {join, resolve, dirname} from 'node:path'
import {readCsv, writeCsv, packageRoot, normalForm, GRADES} from '../lib.mjs'
import {validateSyntax} from '../../../../lib/syntax.mjs'
import {quotesTheMessage} from '../check.mjs'

const args = process.argv.slice(2)
const command = args[0]
const opt = (name, fallback) => { const at = args.indexOf('--' + name); return at >= 0 ? args[at + 1] : fallback }
const out = resolve(packageRoot, opt('out', 'eval-results/2026-11-28-hard-half'))
const batches = join(packageRoot, 'eval-results/2026-11-28-vibe-batches')
const PART = 150
const flat = file => file.replace(/\.csv$/u, '').replace('/', '__')
const unflat = name => name.replace('__', '/') + '.csv'
const partName = (file, p) => `${flat(file)}-advanced.p${String(p).padStart(2, '0')}.csv`
const walk = dir => readdirSync(dir, {withFileTypes: true}).flatMap(e => e.isDirectory() ? walk(join(dir, e.name)).map(f => e.name + '/' + f) : e.name.endsWith('.csv') ? [e.name] : [])
const writeText = (file, text) => { mkdirSync(dirname(file), {recursive: true}); writeFileSync(file, text) }
const rules = join(packageRoot, 'tests/benchmark/syntax/rules.md')
const withRules = dir => { mkdirSync(dir, {recursive: true}); copyFileSync(rules, join(dir, 'RULES.md')) }
const packetsOf = (rows, dir, prefix, first = 1) => {
  // rows: [{file, row, level, text, sop, alt, labelState}] -> packet-<prefix><NN>.csv and .key.jsonl of at most 150 rows
  withRules(dir)
  const names = []
  for (let i = 0, k = first; i < rows.length; i += PART, k++) {
    const chunk = rows.slice(i, i + PART), name = `packet-${prefix}${String(k).padStart(2, '0')}`
    writeText(join(dir, name + '.csv'), writeCsv(['n', 'text', 'sop', 'alt', 'label_state'], chunk.map((r, j) => [j + 1, r.text, r.sop, r.alt, r.labelState])))
    writeText(join(dir, name + '.key.jsonl'), chunk.map((r, j) => JSON.stringify({n: j + 1, file: r.file, row: r.row, level: r.level ?? null})).join('\n') + '\n')
    names.push(name)
  }
  return names
}

/** The valid verdict lines of a part or packet CSV: Map n -> {grade, sop, note}; `bad` counts the lines that fail the checker's rules. */
function readVerdicts(csv) {
  const file = csv.replace(/\.csv$/u, '.verdicts.jsonl'), verdicts = new Map()
  let bad = 0
  if (!existsSync(file)) return {verdicts, bad, exists: false}
  const texts = new Map(readCsv(readFileSync(csv, 'utf8')).slice(1).map(c => [Number(c[0]), c[1]]))
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let v
    try { v = JSON.parse(line) } catch { bad++; continue }
    const text = texts.get(v?.n)
    if (text === undefined || verdicts.has(v.n) || !GRADES.includes(v.grade) || typeof v.note !== 'string') { bad++; continue }
    if (v.grade !== 'L8') {
      if (!quotesTheMessage(v.note, text) || typeof v.sop !== 'string' || !validateSyntax(text, v.sop).valid) { bad++; continue }
    }
    verdicts.set(v.n, {grade: v.grade, sop: v.sop ?? null, note: v.note})
  }
  return {verdicts, bad, exists: true}
}

// ------------------------------------------------------------------------------------------------ build
if (command === 'build') {
  const {score} = await import('./suspicion.mjs')
  const refresh = resolve(packageRoot, opt('refresh', 'eval-results/2026-11-28-hard-half/refresh-45d48a3'))
  const refreshInfo = JSON.parse(readFileSync(join(refresh, 'refresh.json'), 'utf8'))
  const stored = new Map()
  for (const l of readFileSync(join(packageRoot, '.local-data/rvss/silver-audit/scores.jsonl'), 'utf8').split('\n')) { if (!l) continue; const r = JSON.parse(l); stored.set(r.text, r) }
  const levels = [], byFile = new Map(), count = {rows: 0, noCircuit: 0, fromAudit: 0, fromPort: 0, levels: {1: 0, 2: 0, 3: 0, 4: 0}}
  const check = {n: 0, same: 0, a: [], b: []}
  for (const file of walk(join(refresh, 'advanced')).sort()) {
    const oldRows = new Map(readCsv(readFileSync(join(batches, file.replace(/\.csv$/u, '-advanced.csv')), 'utf8')).slice(1).map(c => [Number(c[0]), c[2]]))
    const rows = []
    for (const [n, text, sop, alt, labelState] of readCsv(readFileSync(join(refresh, 'advanced', file), 'utf8')).slice(1)) {
      const row = Number(n), s = stored.get(text)
      let level, p, from
      if (!sop) { level = 4; p = null; from = 'no-circuit'; count.noCircuit++ }
      else {
        const unchanged = oldRows.get(row) === sop && s
        const port = unchanged && check.n < 4000 && row % 23 === 0 ? score(file, text, sop, alt) : null
        if (unchanged) {
          level = s.bucket; p = s.score; from = 'audit'; count.fromAudit++
          if (port) { check.n++; check.same += port.level === level; check.a.push(p); check.b.push(port.p) }
        } else { const r = score(file, text, sop, alt); p = r?.p ?? null; level = r ? r.level : 4; from = 'port'; count.fromPort++ }
      }
      count.rows++; count.levels[level]++
      levels.push({file, row, level, score: p === null ? null : Math.round(p * 1e6) / 1e6, from})
      rows.push({file, row, level, text, sop, alt, labelState})
    }
    byFile.set(file, rows)
  }
  writeText(join(out, 'levels.jsonl.gz'), '')
  writeFileSync(join(out, 'levels.jsonl.gz'), gzipSync(levels.map(l => JSON.stringify(l)).join('\n') + '\n'))
  // level-1 parts, twice
  const index = {commit: refreshInfo.commit, parts: {}}
  let level1Parts = 0, level1Rows = 0
  for (const dir of ['level1/glm', 'level1/deepseek']) withRules(join(out, dir))
  for (const [file, rows] of byFile) {
    const one = rows.filter(r => r.level === 1)
    for (let i = 0, p = 1; i < one.length; i += PART, p++) {
      const text = writeCsv(['n', 'text', 'sop', 'alt', 'label_state'], one.slice(i, i + PART).map(r => [r.row, r.text, r.sop, r.alt, r.labelState]))
      for (const dir of ['level1/glm', 'level1/deepseek']) writeText(join(out, dir, partName(file, p)), text)
      index.parts[partName(file, p)] = file
      level1Parts++
    }
    level1Rows += one.length
  }
  // Opus packets: levels 2-4 and rows without a circuit, most suspicious first
  const opus = [...byFile.values()].flat().filter(r => r.level > 1).sort((a, b) => b.level - a.level || (a.file < b.file ? -1 : a.file > b.file ? 1 : a.row - b.row))
  const names = packetsOf(opus, join(out, 'opus'), '')
  writeText(join(out, 'index.json'), JSON.stringify(index, null, 1) + '\n')
  const rho = (() => { // Spearman of the port against the audit's score on a sample of unchanged rows
    const rank = v => { const o = v.map((x, i) => [x, i]).sort((u, w) => u[0] - w[0]), r = new Array(v.length); o.forEach(([, i], k) => { r[i] = k }); return r }
    const ra = rank(check.a), rb = rank(check.b), n = ra.length, m = (n - 1) / 2
    let sab = 0, saa = 0, sbb = 0
    for (let i = 0; i < n; i++) { sab += (ra[i] - m) * (rb[i] - m); saa += (ra[i] - m) ** 2; sbb += (rb[i] - m) ** 2 }
    return n ? sab / Math.sqrt(saa * sbb) : null
  })()
  const tiers = {built: new Date().toISOString(), commit: refreshInfo.commit, rows: count.rows, files: byFile.size, noCircuit: count.noCircuit, scoreFromAudit: count.fromAudit, scoreFromPort: count.fromPort,
    levels: count.levels, level1: {rows: level1Rows, parts: level1Parts, perModel: level1Parts}, opus: {rows: opus.length, packets: names.length},
    portCheck: {sampled: check.n, sameLevel: check.same, spearman: rho}}
  writeText(join(out, 'tiers.json'), JSON.stringify(tiers, null, 1) + '\n')
  console.log(JSON.stringify(tiers, null, 1))
}

// ------------------------------------------------------------------------------------------------ spotcheck, merge
const keyOf = (dir, name) => existsSync(join(dir, name + '.key.jsonl')) ? readFileSync(join(dir, name + '.key.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : []
const rowKey = (file, row) => file + '#' + row

/** Every part with its CSV rows and the two models' verdicts. */
function cheapRows() {
  const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
  const rows = new Map(), stats = {parts: 0, partsBoth: 0, bad: {glm: 0, deepseek: 0}}
  for (const [name, file] of Object.entries(index.parts)) {
    stats.parts++
    const table = readCsv(readFileSync(join(out, 'level1/glm', name), 'utf8')).slice(1)
    const g = readVerdicts(join(out, 'level1/glm', name)), d = readVerdicts(join(out, 'level1/deepseek', name))
    stats.bad.glm += g.bad; stats.bad.deepseek += d.bad
    if (g.verdicts.size && d.verdicts.size) stats.partsBoth++
    for (const [n, text, sop, alt, labelState] of table) {
      rows.set(rowKey(file, Number(n)), {file, row: Number(n), text, sop, alt, labelState, glm: g.verdicts.get(Number(n)), deepseek: d.verdicts.get(Number(n))})
    }
  }
  return {rows, stats, index}
}
const opusDirs = ['opus', 'opus-escalated', 'opus-spotcheck']
function opusVerdicts() {
  const byRow = new Map(), perDir = {}
  for (const dir of opusDirs) {
    const full = join(out, dir)
    if (!existsSync(full)) continue
    perDir[dir] = {packets: 0, judged: 0, accepted: 0}
    for (const name of readdirSync(full).filter(f => /^packet-.*\d+\.csv$/u.test(f)).map(f => f.replace(/\.csv$/u, '')).sort()) {
      perDir[dir].packets++
      const {verdicts} = readVerdicts(join(full, name + '.csv'))
      const key = keyOf(full, name)
      for (const k of key) {
        const v = verdicts.get(k.n)
        if (!v) continue
        perDir[dir].judged++; if (v.grade === 'L8') perDir[dir].accepted++
        byRow.set(rowKey(k.file, k.row), {...v, dir})
      }
    }
  }
  return {byRow, perDir}
}

if (command === 'merge' || command === 'spotcheck') {
  const {rows, stats} = cheapRows()
  const info = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))
  const opus = opusVerdicts()
  const ag = {both: 0, bothAccept: 0, bothReject: 0, glmOnlyRejects: 0, deepseekOnlyRejects: 0, glmOnly: 0, deepseekOnly: 0, neither: 0}
  const accepted = [], escalate = [], pending = []
  for (const r of rows.values()) {
    const g = r.glm, d = r.deepseek
    if (g && d) { ag.both++; if (g.grade === 'L8' && d.grade === 'L8') ag.bothAccept++; else if (g.grade !== 'L8' && d.grade !== 'L8') ag.bothReject++; else if (g.grade !== 'L8') ag.glmOnlyRejects++; else ag.deepseekOnlyRejects++ }
    else if (g) ag.glmOnly++; else if (d) ag.deepseekOnly++; else ag.neither++
    const rejected = (g && g.grade !== 'L8') || (d && d.grade !== 'L8')
    if (rejected) escalate.push(r)
    else if (g && d) accepted.push(r)
    else pending.push(r)
  }
  const sortRows = list => list.sort((a, b) => a.file < b.file ? -1 : a.file > b.file ? 1 : a.row - b.row)

  if (command === 'spotcheck') {
    const size = Number(opt('size', 300)), seed = opt('seed', '2026-11-28-hard-half-spot')
    const pool = sortRows(accepted).filter(r => !opus.byRow.has(rowKey(r.file, r.row)))
    const pick = pool.map(r => [createHash('sha1').update(seed + '\0' + r.file + '#' + r.row).digest('hex'), r]).sort((a, b) => a[0] < b[0] ? -1 : 1).slice(0, size).map(x => x[1])
    const dir = join(out, 'opus-spotcheck')
    if (existsSync(dir) && readdirSync(dir).some(f => f.endsWith('.key.jsonl'))) { console.error('opus-spotcheck/ already holds packets; delete them on purpose to draw again'); process.exit(1) }
    const names = packetsOf(pick.map(r => ({...r, labelState: r.labelState, level: 1})), dir, 's')
    console.log(`spot check: ${pick.length} of ${pool.length} rows both models accepted, in ${names.length} packets: ${names.join(', ')}`)
  } else {
    // escalated rows: rows already in an escalated packet keep it, new rows go to new packets
    const dir = join(out, 'opus-escalated')
    const existing = existsSync(dir) ? readdirSync(dir).filter(f => /^packet-e\d+\.key\.jsonl$/u.test(f)).map(f => f.replace('.key.jsonl', '')).sort() : []
    const inPacket = new Set(existing.flatMap(name => keyOf(dir, name).map(k => rowKey(k.file, k.row))))
    const fresh = sortRows(escalate.filter(r => !inPacket.has(rowKey(r.file, r.row)))).map(r => ({...r, level: 1}))
    const first = existing.length ? Math.max(...existing.map(n => Number(n.slice('packet-e'.length)))) + 1 : 1
    const names = fresh.length ? packetsOf(fresh, dir, 'e', first) : []
    // the final file
    const final = [], counts = {cheapAccepted: 0, opusAccepted: 0, opusCorrected: 0, opusPending: 0}
    const commit = info.commit
    // levels 2-4 rows live in the packets: read them with their key
    const packetRows = new Map()
    for (const d of opusDirs) {
      const full = join(out, d)
      if (!existsSync(full)) continue
      for (const name of readdirSync(full).filter(f => /^packet-.*\d+\.key\.jsonl$/u.test(f)).map(f => f.replace('.key.jsonl', ''))) {
        const table = new Map(readCsv(readFileSync(join(full, name + '.csv'), 'utf8')).slice(1).map(c => [Number(c[0]), c]))
        for (const k of keyOf(full, name)) { const c = table.get(k.n); packetRows.set(rowKey(k.file, k.row), {file: k.file, row: k.row, text: c[1], sop: c[2]}) }
      }
    }
    for (const [k, v] of opus.byRow) {
      const r = packetRows.get(k)
      if (!r) continue
      if (v.grade === 'L8') { counts.opusAccepted++; final.push({file: r.file, row: r.row, text: r.text, sop: r.sop, source: 'spacy@' + commit, accepted_by: 'judge', judge: 'opus', grade: 'L8'}) }
      else { counts.opusCorrected++; final.push({file: r.file, row: r.row, text: r.text, sop: normalForm(r.text, v.sop)?.sop ?? v.sop, source: 'opus-correction', accepted_by: 'judge', judge: 'opus', grade: v.grade}) }
    }
    for (const r of sortRows(accepted)) {
      if (opus.byRow.has(rowKey(r.file, r.row))) continue
      counts.cheapAccepted++
      final.push({file: r.file, row: r.row, text: r.text, sop: r.sop, source: 'spacy@' + commit, accepted_by: 'judge', judge: 'glm-5.3+deepseek-v4.1-flash', grade: 'L8'})
    }
    const waiting = escalate.filter(r => !opus.byRow.has(rowKey(r.file, r.row))).length
    sortRows(final)
    mkdirSync(join(out, 'merged'), {recursive: true})
    writeFileSync(join(out, 'merged/final.jsonl'), final.map(f => JSON.stringify(f)).join('\n') + (final.length ? '\n' : ''))
    const opusLevels = (() => { const t = {}; for (const [k, v] of opus.byRow) { if (!packetRows.has(k)) continue; t[v.dir] = t[v.dir] ?? {judged: 0, accepted: 0}; t[v.dir].judged++; if (v.grade === 'L8') t[v.dir].accepted++ } return t })()
    const judgedBoth = ag.both, escalatedAll = escalate.length
    const summary = {commit, parts: stats, bad: stats.bad, agreement: ag,
      escalated: {rows: escalatedAll, shareOfRowsJudgedByBoth: judgedBoth ? +(escalate.filter(r => r.glm && r.deepseek).length / judgedBoth).toFixed(4) : null, newPackets: names, waitingForOpus: waiting},
      acceptedByBoth: accepted.length, pendingCheap: pending.length, opusVerdicts: opusLevels, finalRows: counts}
    if (opusLevels['opus-spotcheck']) { const s = opusLevels['opus-spotcheck']; summary.spotCheck = {judged: s.judged, opusRejects: s.judged - s.accepted, slippedThroughRate: +((s.judged - s.accepted) / s.judged).toFixed(4)} }
    writeText(join(out, 'merged/summary.json'), JSON.stringify(summary, null, 1) + '\n')
    console.log(JSON.stringify(summary, null, 1))
  }
}
if (!['build', 'merge', 'spotcheck'].includes(command)) { console.error('Usage: node tiers.mjs build|merge|spotcheck [options]'); process.exit(2) }
