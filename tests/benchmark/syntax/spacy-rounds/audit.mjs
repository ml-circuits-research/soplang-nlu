// Checks for a round of repairs in the spaCy writer, from the parser's recorded output (no parser, no Python).
// Run from the folder soplang-nlu, with SOP_KNOWLEDGE_DIR unset.
//
//   node audit.mjs cache <dir>                                   parses and known verdicts of the four sets, into <dir>
//   node audit.mjs write <dir> <set> <out.jsonl> [--code <tree>] the circuits of a writer (default: this checkout)
//   node audit.mjs still <dir> <set> <circuits.jsonl> [--full]   the rejections that still stand in those circuits
//   node audit.mjs changed <dir> <set> <before.jsonl> <after.jsonl> [--which rejected|accepted|unknown|all] [--brief]
//   node audit.mjs show <dir> <set> <n | part of a text> [--beam]
//   node audit.mjs units <dir> <set> <n>                         the units of a message after the word and clause repairs
//   node audit.mjs record <dir> <file of texts>                  lines for the table of recorded parses of the tests
//   node audit.mjs conflict <dir> <set> <circuits.jsonl> <n> --reason <why> [--case <settled case>]
//                                                                a label the circuit of message n changes, written to
//                                                                label-conflicts.jsonl for the judges (a label is a judged
//                                                                circuit, not the truth: one that contradicts a settled case
//                                                                or the judges' consistent verdicts is judged again)
//
// The sets:
//   audit  the silver audit (eval-results/2026-11-27-silver-audit): 1,800 judged spaCy circuits, by suspicion level
//   fresh  the fresh benchmark (eval-results/2026-11-28-syntax-benchmark-fresh): its 2,225 messages; a circuit judged
//          there, or equal to the label known before the run (L9)
//   freshb the second fresh benchmark (eval-results/2026-11-28-syntax-benchmark-fresh-b, seed 2026-11-28-b), read the same way
//   bench  the two earlier benchmark samples (fixed and random, 2026-11-26/27): their messages
//   wide   every 60th message of the dataset, in the order of the recorded parses
//   vibe   the pilot of file-level judging on the hard half (eval-results/2026-11-28-vibe-advanced-pilot/opus): spaCy
//          circuits judged by Opus, every rejection with a corrected circuit (known as acceptable, L10)
// What is known of a circuit (its message and core): the verdict of the set, the label of the message (L9), a
// line of the registry of judged circuits, or nothing ('?'). A circuit is acceptable at L8, L9 or L10.
import {readFileSync, writeFileSync, mkdirSync, readdirSync, createReadStream} from 'node:fs'
import {createInterface} from 'node:readline'
import {createGunzip} from 'node:zlib'
import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

const root = resolve(new URL('../../../..', import.meta.url).pathname)
const at = path => join(root, path)
const {normalForm, readJsonl, readSample, readRegistry, readLabels, readCsv} = await import(pathToFileURL(at('tests/benchmark/syntax/lib.mjs')).href)
const {unpackParse} = await import(pathToFileURL(at('strategies/rvss/data/run-spacy.mjs')).href)

const AUDIT = 'eval-results/2026-11-27-silver-audit/'
const FRESH = {fresh: 'eval-results/2026-11-28-syntax-benchmark-fresh/', freshb: 'eval-results/2026-11-28-syntax-benchmark-fresh-b/'}
const BENCH = ['eval-results/2026-11-26-fresh-locked-one-percent/sample.json.gz', 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz']
const VIBE = 'eval-results/2026-11-28-vibe-advanced-pilot/opus/'
const SETS = ['audit', 'fresh', 'freshb', 'bench', 'wide', 'vibe']
const WIDE_STRIDE = 60
const [command, dirArg, ...rest] = process.argv.slice(2)
const VALUED = ['--code', '--which', '--reason', '--case']
const flags = rest.filter(arg => arg.startsWith('--')), args = rest.filter((arg, i) => !arg.startsWith('--') && !VALUED.includes(rest[i - 1]))
const option = name => { const i = rest.indexOf('--' + name); return i >= 0 ? rest[i + 1] : undefined }
const dir = resolve(dirArg ?? '.')
const core = (text, sop) => sop ? normalForm(text, sop)?.core ?? null : null
const show = sop => (sop ?? '(none)').replaceAll('syntax.', '').replaceAll('\n', '\n          ')
const ok = grade => ['L8', 'L9', 'L10'].includes(grade)

/** The judged items of a run folder, with their verdicts: [{n, text, core, grade, note}] */
function judgedItems(folder) {
  const verdicts = new Map()
  for (const file of readdirSync(at(folder + 'judging')).filter(name => /^verdicts-\d+\.jsonl$/u.test(name))) for (const v of readJsonl(at(folder + 'judging/' + file))) verdicts.set(v.n, v)
  return readJsonl(at(folder + 'key/items.jsonl')).map(item => ({...item, grade: verdicts.get(item.n)?.grade, note: verdicts.get(item.n)?.note ?? ''}))
}

if (command === 'cache') {
  mkdirSync(dir, {recursive: true})
  // the messages of each set: {key, n, text, bucket?}, and what is known of their circuits
  const sets = Object.fromEntries(SETS.map(set => [set, []]))
  const known = new Map()   // text -> {core -> {grade, note, from}}
  const know = (text, c, grade, note, from) => { if (!c) return; const k = known.get(text) ?? known.set(text, {}).get(text); if (!k[c] || from === 'set') k[c] = {grade, note, from} }
  for (const item of judgedItems(AUDIT)) {
    sets.audit.push({key: 'audit:' + item.n, n: item.n, text: item.text, bucket: item.bucket, core: item.core})
    know(item.text, item.core, item.grade, item.note, 'set')
  }
  for (const [set, folder] of Object.entries(FRESH)) {
    const freshItems = judgedItems(folder).filter(item => item.sources.includes('spacy'))
    const freshN = new Map(freshItems.map(item => [item.text, item.n]))
    for (const item of freshItems) know(item.text, item.core, item.grade, item.note, 'set')
    for (const line of readJsonl(at(folder + 'key/labels-before.jsonl'))) know(line.text, line.core ?? core(line.text, line.label), 'L9', 'label before the run', 'set')
    let extra = 100000
    for (const row of readJsonl(at(folder + 'spacy.jsonl'))) sets[set].push({key: set + ':' + row.id, n: freshN.get(row.text) ?? extra++, text: row.text, id: row.id, core: core(row.text, row.sop)})
  }
  let v = 0
  for (const name of readdirSync(at(VIBE)).filter(file => file.endsWith('.csv')).sort()) {
    const [header, ...rows] = readCsv(readFileSync(at(VIBE + name), 'utf8'))
    const verdicts = new Map(readJsonl(at(VIBE + name.replace(/\.csv$/u, '.verdicts.jsonl'))).map(row => [String(row.n), row]))
    for (const row of rows) {
      const cell = key => row[header.indexOf(key)], text = cell('text'), verdict = verdicts.get(cell('n'))
      if (!verdict) continue
      sets.vibe.push({key: 'vibe:' + name + '#' + cell('n'), n: ++v, text, file: name})
      know(text, core(text, cell('sop')), verdict.grade, verdict.note, 'set')
      if (verdict.sop) know(text, core(text, verdict.sop), 'L10', 'corrected by the judge', 'set')
    }
  }
  const benchTexts = new Set()
  let b = 0
  for (const file of BENCH) for (const {id, text} of readSample(at(file))) if (!benchTexts.has(text)) { benchTexts.add(text); sets.bench.push({key: 'bench:' + id, n: ++b, text, id}) }
  // the parses: by text (the parse depends on the text only)
  const want = new Set(Object.values(sets).flat().map(m => m.text))
  const textOf = new Map()   // file#row -> text, for the messages wanted and the wide set
  let line = 0
  const silver = createInterface({input: createReadStream(at('.local-data/rvss/spacy-silver.jsonl.gz')).pipe(createGunzip()), crlfDelay: Infinity})
  for await (const raw of silver) { if (!raw) continue; const r = JSON.parse(raw); textOf.set(r.file + '#' + r.row, r.text) }
  const parses = {}
  const recorded = createInterface({input: createReadStream(at('.local-data/rvss/spacy-parses.jsonl.gz')).pipe(createGunzip()), crlfDelay: Infinity})
  let w = 0
  for await (const raw of recorded) {
    if (!raw) continue
    const r = JSON.parse(raw), text = textOf.get(r.file + '#' + r.row)
    const wide = line++ % WIDE_STRIDE === 0
    if (wide && text) { sets.wide.push({key: 'wide:' + r.file + '#' + r.row, n: ++w, text, id: r.file + '#' + r.row}); want.add(text) }
    if (text && want.has(text) && r.parse && !parses[text]) parses[text] = r.parse
  }
  // labels and the registry, for the texts of the sets
  const texts = new Set(Object.values(sets).flat().map(m => m.text))
  const labels = readLabels()
  for (const text of texts) { const label = labels.get(text); if (label) know(text, label.core, 'L9', 'label', 'label') }
  const registry = readRegistry()
  for (const text of texts) for (const [c, entry] of registry.byText.get(text) ?? []) know(text, c, entry.verdict === 'accepted' ? (entry.grade === 'L9' ? 'L9' : 'L8') : entry.grade ?? 'L1', entry.note ?? '', 'registry')
  for (const set of SETS) sets[set] = sets[set].filter(m => { if (!parses[m.text]) console.error(`${set}: no recorded parse for ${m.text}`); return parses[m.text] })
  writeFileSync(join(dir, 'sets.json'), JSON.stringify(sets))
  writeFileSync(join(dir, 'parses.json'), JSON.stringify(parses))
  writeFileSync(join(dir, 'known.json'), JSON.stringify(Object.fromEntries([...known].filter(([text]) => texts.has(text)))))
  console.log(Object.fromEntries(SETS.map(set => [set, sets[set].length])), {parses: Object.keys(parses).length})
  process.exit(0)
}

if (command === 'record') {
  const parses = JSON.parse(readFileSync(join(dir, 'parses.json'), 'utf8'))
  const arcs = tokens => tokens.map(t => `${t.dep}>${t.head}`).join(' ')
  for (const text of readFileSync(args[0], 'utf8').split('\n').filter(Boolean)) {
    if (!parses[text]) { console.error('no recorded parse: ' + text); continue }
    const p = unpackParse(parses[text])
    console.log('  ' + JSON.stringify(text) + ': ' + JSON.stringify({tokens: p.tokens.map(t => [t.text, t.start, t.pos, t.tag, t.dep, t.head, t.lemma]),
      beam: p.alternatives.map(a => [Math.round(a.score * 10000) / 10000, arcs(a.tokens)])}) + ',')
  }
  process.exit(0)
}

const [set] = args
if (!SETS.includes(set)) { console.error('a set: ' + SETS.join(', ')); process.exit(2) }
const messages = JSON.parse(readFileSync(join(dir, 'sets.json'), 'utf8'))[set]
const known = JSON.parse(readFileSync(join(dir, 'known.json'), 'utf8'))
const gradeOf = (text, c) => !c ? 'L0' : known[text]?.[c]?.grade ?? '?'
const noteOf = (text, c) => known[text]?.[c]?.note ?? ''
const readCircuits = file => new Map(readJsonl(file).map(row => [row.key, row]))

if (command === 'units') {
  const {unitsOf} = await import(pathToFileURL(at('strategies/neural-dependencies/syntax-circuit.mjs')).href)
  const {repairWords} = await import(pathToFileURL(at('strategies/spacy-direct/word-repairs.mjs')).href)
  const {repairClauses} = await import(pathToFileURL(at('strategies/spacy-direct/clause-repairs.mjs')).href)
  const m = messages.find(message => message.n === +args[1])
  const units = unitsOf(m.text, unpackParse(JSON.parse(readFileSync(join(dir, 'parses.json'), 'utf8'))[m.text]).tokens)
  const line = label => console.log(label + ': ' + units.filter(u => u.word).map(u => `${u.index}:${u.value}/${u.pos}/${u.dep}>${u.head}`).join(' '))
  line('parse'); repairWords(units); line('words'); repairClauses(units); line('clauses')
  process.exit(0)
}

if (command === 'write' || command === 'show') {
  const code = resolve(option('code') ?? root)
  const {beamCircuit} = await import(pathToFileURL(join(code, 'strategies/spacy-beam/index.mjs')).href)
  const {validateSyntax} = await import(pathToFileURL(join(code, 'lib/syntax.mjs')).href)
  const parses = JSON.parse(readFileSync(join(dir, 'parses.json'), 'utf8'))
  const circuit = (text, parse) => {
    try {
      const result = beamCircuit(text, ...Object.values(parse))
      const check = validateSyntax(text, result.sop)
      return check.valid ? {sop: result.sop, error: null, source: result.source} : {sop: null, error: 'invalid circuit: ' + check.findings.map(f => f.code).join(', ')}
    } catch (error) { return {sop: null, error: 'no circuit: ' + error.message} }
  }
  if (command === 'write') {
    let errors = 0
    const out = messages.map(m => { const c = circuit(m.text, unpackParse(parses[m.text])); if (c.error) errors++; return JSON.stringify({key: m.key, n: m.n, text: m.text, sop: c.sop, error: c.error, core: core(m.text, c.sop)}) })
    writeFileSync(args[1], out.join('\n') + '\n')
    console.log(JSON.stringify({set, messages: out.length, errors}))
  } else {
    const needle = args[1]
    for (const m of messages) {
      if (/^\d+$/.test(needle) ? m.n !== +needle : !m.text.includes(needle)) continue
      const p = unpackParse(parses[m.text]), c = circuit(m.text, p)
      console.log(`\n# ${m.n} ${m.text}`)
      console.log(p.tokens.map(t => `${t.i}:${t.text}/${t.pos}/${t.tag}/${t.dep}>${t.head}`).join('  '))
      if (flags.includes('--beam')) for (const alt of p.alternatives) console.log('  ' + alt.score.toFixed(3) + ' ' + alt.tokens.map(t => `${t.dep}>${t.head}`).join(' '))
      const c0 = core(m.text, c.sop)
      console.log(`  [${c.source ?? ''} ${gradeOf(m.text, c0)}] ${noteOf(m.text, c0)}\n          ` + (c.error ?? show(c.sop)))
    }
  }
  process.exit(0)
}

if (command === 'still') {
  const now = readCircuits(args[1])
  const count = {messages: 0, still: 0, acceptable: 0, unknown: 0}
  for (const m of messages) {
    count.messages++
    const c = now.get(m.key)?.core ?? null, grade = gradeOf(m.text, c)
    if (ok(grade)) { count.acceptable++; continue }
    if (grade === '?') { count.unknown++; continue }
    count.still++
    console.log(`\n## ${m.n}${m.bucket !== undefined ? ' b' + m.bucket : ''} ${grade} ${m.text}\n   ${noteOf(m.text, c)}`)
    if (flags.includes('--full')) console.log('          ' + show(now.get(m.key).sop))
  }
  console.log(JSON.stringify(count))
  process.exit(0)
}

if (command === 'changed') {
  const before = readCircuits(args[1]), after = readCircuits(args[2])
  const which = option('which') ?? 'all'
  const count = {messages: 0, changed: 0, rejected: 0, accepted: 0, unknown: 0, toAcceptable: 0, toRejected: 0, toUnknown: 0, labelChanged: 0}
  for (const m of messages) {
    count.messages++
    const b = before.get(m.key), a = after.get(m.key)
    if (b.core === a.core) continue
    count.changed++
    const was = gradeOf(m.text, b.core), now = gradeOf(m.text, a.core)
    const status = ok(was) ? 'accepted' : was === '?' ? 'unknown' : 'rejected'
    count[status]++
    count[ok(now) ? 'toAcceptable' : now === '?' ? 'toUnknown' : 'toRejected']++
    if (was === 'L9') count.labelChanged++
    if (which !== 'all' && which !== status) continue
    console.log(`\n## ${m.n} [${status} ${was} -> ${now}] ${m.text}` + (status === 'rejected' ? `\n   was: ${noteOf(m.text, b.core)}` : '') + (now !== '?' && !ok(now) ? `\n   now: ${noteOf(m.text, a.core)}` : '') + (a.error ? '\n   ERROR ' + a.error : ''))
    if (!flags.includes('--brief')) console.log('  before: ' + show(b.sop) + '\n  after:  ' + show(a.sop))
  }
  console.log(JSON.stringify(count))
  process.exit(0)
}
if (command === 'conflict') {
  // (several messages: n1,n2,…)
  const labels = readLabels(), before = Object.values(FRESH).flatMap(folder => readJsonl(at(folder + 'key/labels-before.jsonl')))
  const out = join(root, 'tests/benchmark/syntax/spacy-rounds/label-conflicts.jsonl')
  for (const n of args[2].split(',')) {
  const m = messages.find(message => message.n === +n)
  const row = readCircuits(args[1]).get(m.key)
  // the label: the one known before the run of a fresh set, else the label of the dataset now
  let label = before.find(line => line.text === m.text)?.label ?? null
  label ??= labels.get(m.text)?.label ?? null
  // the file and row of the message: from its id, else the syntactic file that holds it
  let [file, rowNumber] = (m.id ?? '').includes('#') ? m.id.split('#') : [labels.files.get(m.text) ?? null, null]
  if (file && !rowNumber) {
    const [, ...rows] = readCsv(readFileSync(join(labels.dir, file), 'utf8'))
    rowNumber = rows.findIndex(r => r[0] === m.text) + 1 || null
  }
  const entry = {file, row: rowNumber === null ? null : +rowNumber, text: m.text, label, proposed: row.sop, reason: option('reason'), settledCase: option('case') ?? null}
  let lines = []
  try { lines = readFileSync(out, 'utf8').split('\n').filter(Boolean) } catch {}
  lines = lines.filter(line => JSON.parse(line).text !== m.text)
  writeFileSync(out, [...lines, JSON.stringify(entry)].join('\n') + '\n')
  console.log(JSON.stringify({file: entry.file, row: entry.row, text: entry.text}))
  }
  process.exit(0)
}
console.error('commands: cache, write, still, changed, show, record, units, conflict'); process.exit(2)
