// A test of evaluate-dev.mjs and evaluate-benchmark.mjs on small fake outputs whose answers are known by
// construction, and a check that the two scripts count alike. Writes only into .local-data/rvss/eval/selftest/.
//   node strategies/rvss/eval/selftest.mjs        (about 45 s)
import assert from 'node:assert/strict'
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {gzipSync} from 'node:zlib'
import {join, resolve, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {readLabels, readSample, normalForm} from '../../../tests/benchmark/syntax/lib.mjs'
import {parseCircuit} from '../../../lib/syntax.mjs'
import {evaluateDev} from './evaluate-dev.mjs'
import {evaluateBenchmark} from './evaluate-benchmark.mjs'
import {benchmarkDir, localData, circuitOf, readRows, squash} from './common.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const dir = join(localData, 'eval/selftest')
mkdirSync(dir, {recursive: true})
const writeJsonl = (file, rows, gzip = false) => { const text = rows.map(row => JSON.stringify(row)).join('\n') + '\n'; writeFileSync(file, gzip ? gzipSync(text) : text); return file }

/** The same circuit with other wire names (the order of the wires is kept: with repeated words it decides the alignment). */
function renamed(sop) {
  const names = new Map(parseCircuit(sop).map((wire, index) => [wire.id, 'w' + (97 - index)]))
  return sop.split('\n').map(line => line.replace(/^@([\w.-]+)/u, (_, id) => '@' + names.get(id)).replace(/\$([\w.-]+)/gu, (_, id) => '$' + names.get(id))).join('\n')
}
/** The circuit with the start of one relation with a marker moved to another clause or nominal, or null. */
function moveStart(text, sop) {
  const wires = parseCircuit(sop), base = circuitOf(text, sop)
  for (const wire of wires) {
    if (wire.type !== 'syntax.relation' || !wire.slots.some(([key]) => key === 'marker')) continue
    const from = wire.slots.find(([key]) => key === 'from')?.[1], to = wire.slots.find(([key]) => key === 'to')?.[1]
    for (const other of wires) {
      if (!['syntax.clause', 'syntax.nominal'].includes(other.type) || '$' + other.id === from || '$' + other.id === to) continue
      const lines = sop.split('\n').map(line => line.startsWith('@' + wire.id + ' ') ? line.replace('from=' + from, 'from=$' + other.id) : line)
      const moved = lines.join('\n'), check = circuitOf(text, moved)
      if (check.valid && check.core !== base.core) return moved
    }
  }
  return null
}

// ---- development set
const bench = readSample(join(benchmarkDir, 'sample.json.gz'))
const benchSquash = new Set(bench.map(message => squash(message.text)))
const labels = readLabels(undefined, ['drawing/style-01.csv', 'diagram/charts-02.01.csv', 'calendar/meetings-03.csv'])
const pool = [...labels.values()].filter(line => !benchSquash.has(squash(line.text)) && circuitOf(line.text, line.label).valid)
assert.ok(pool.length >= 80, 'enough labels for the test: ' + pool.length)
const targets = [], outputs = []
const expected = {exact: 0, relaxedOnly: 0, invalid: 0, missing: 0, carriedWords: 0, carried: 0}
for (let i = 0; i < 80; i++) {
  const line = pool[i]
  const file = labels.files.get(line.text)
  const target = {id: 'dev#' + i, text: line.text, sop: line.label, origin: i % 2 ? 'spacy' : 'label', accepted_by: i % 2 ? undefined : line.accepted_by, file, split: i < 60 ? 'dev-B' : 'dev-A'}
  targets.push(target)
  const group = i % 4
  if (group === 0) { // exact, ids renamed; carried placements equal except one word in the first row
    const words = circuitOf(line.text, line.label).core.split('\n').filter(l => /^\d+-\d+ /u.test(l)).length
    target.placements = Array.from({length: words}, (_, w) => 'p' + w)
    const placements = [...target.placements]
    if (i === 0) placements[0] = 'wrong'
    expected.carriedWords += words; expected.carried += words - (i === 0 ? 1 : 0)
    outputs.push({id: i % 8 === 0 ? undefined : 'dev#' + i, text: line.text, sop: renamed(line.label), placements}); expected.exact++
  } else if (group === 1) {
    const moved = moveStart(line.text, line.label)
    if (moved) { outputs.push({id: 'dev#' + i, text: line.text, sop: moved}); expected.relaxedOnly++ }
    else { outputs.push({id: 'dev#' + i, text: line.text, sop: line.label}); expected.exact++ }
  } else if (group === 2) { outputs.push({id: 'dev#' + i, text: line.text, sop: '@c1 syntax.clause verb="nothing"', error: null}); expected.invalid++ }
  else expected.missing++
}
// two targets that are benchmark messages: one with other case and spaces, one a character away
const leakA = bench[5], leakB = bench[6]
targets.push({id: 'leak#1', text: '  ' + leakA.text.toUpperCase() + ' ', sop: null, origin: 'label'})
const devTargets = writeJsonl(join(dir, 'dev-targets.jsonl.gz'), targets, true)
const devOutputs = writeJsonl(join(dir, 'dev-outputs.jsonl'), outputs)
const dev = evaluateDev(devOutputs, devTargets, {})
assert.equal(dev.targetInvalid, 1, 'the leak target has no circuit and is left out')
assert.equal(dev.all.messages, 80)
assert.equal(dev.all.exact, expected.exact, 'exact')
assert.equal(dev.all.relaxed, expected.exact + expected.relaxedOnly, 'relaxed')
assert.ok(dev.all.variants >= dev.all.relaxed, 'variants never below relaxed')
assert.equal(dev.all.noOutput, expected.missing, 'no output')
assert.equal(dev.all.valid, 80 - expected.missing - expected.invalid, 'valid')
assert.equal(dev.all.carriedWords, expected.carriedWords); assert.equal(dev.all.carried, expected.carried)
assert.equal(dev.byOrigin.spacy.messages + dev.byOrigin.label.messages, 80)
assert.equal(dev.bySplit['dev-B'].messages, 60)
assert.equal(Object.values(dev.byLength).reduce((s, t) => s + t.messages, 0), 80)
assert.ok(dev.byArea.drawing || dev.byArea.diagram || dev.byArea.calendar, 'areas from the file field')
// word placement: an exact output places every word alike
const exactOnly = evaluateDev(writeJsonl(join(dir, 'dev-outputs-exact.jsonl'), targets.slice(0, 80).map(t => ({text: t.text, sop: renamed(t.sop)}))), devTargets, {})
assert.equal(exactOnly.all.exact, 80); assert.equal(exactOnly.all.place, exactOnly.all.words); assert.equal(exactOnly.all.role, exactOnly.all.words)
// leak counting: a target set made of a benchmark message (case, spaces) and one a character away
const leakTargets = writeJsonl(join(dir, 'dev-targets-leak.jsonl'), [
  {text: '  ' + leakA.text.toUpperCase() + ' ', sop: readRows(join(benchmarkDir, 'spacy.jsonl')).find(r => r.text === leakA.text).sop.replaceAll(/"([^"]*)"/gu, (m, w) => JSON.stringify(w.toUpperCase())), origin: 'spacy'},
  {text: leakB.text + 'x', sop: null, origin: 'spacy'}])
const leak = evaluateDev(devOutputs, leakTargets, {})
assert.equal(leak.benchmarkNearCopies.exact, 1, 'case and space copy found')
assert.equal(leak.benchmarkNearCopies['one-edit'], 1, 'one-character copy found')
assert.equal(dev.benchmarkNearCopies.exact, 1, 'the leak target of the main set is counted although it has no circuit')
console.log('evaluate-dev: all assertions hold', JSON.stringify({exact: dev.all.exact, relaxed: dev.all.relaxed, variants: dev.all.variants, valid: dev.all.valid, noOutput: dev.all.noOutput, place: dev.all.place + '/' + dev.all.words}))

// ---- benchmark
const spacyRows = readRows(join(benchmarkDir, 'spacy.jsonl')), hmmRows = readRows(join(benchmarkDir, 'vss.jsonl'))
const fake = [], spacyPart = [], hmmPart = []
let moved = 0
for (let i = 0; i < bench.length; i++) {
  const s = spacyRows[i], h = hmmRows[i]
  assert.equal(s.text, bench[i].text); assert.equal(h.text, bench[i].text)
  if (i < 100) { const row = {id: i < 50 ? undefined : s.id, text: s.text, sop: renamed(s.sop)}; fake.push(row); spacyPart.push(row) }
  else if (i < 150) fake.push({id: s.id, text: s.text, sop: 'not a circuit', error: null})
  else if (i < 200) { /* missing */ }
  else if (i < 220) { const m = moveStart(s.text, s.sop); if (m) { moved++; fake.push({id: s.id, text: s.text, sop: m}) } else fake.push({id: s.id, text: s.text, sop: s.sop}) }
  else { fake.push(h); hmmPart.push(h) }
}
const fakeFile = writeJsonl(join(dir, 'bench-fake.jsonl'), fake)
const result = evaluateBenchmark(fakeFile, {name: 'selftest'})
const partS = evaluateBenchmark(writeJsonl(join(dir, 'bench-spacy-part.jsonl'), spacyPart), {name: 'selftest-spacy-part'})
const partH = evaluateBenchmark(writeJsonl(join(dir, 'bench-hmm-part.jsonl'), hmmPart), {name: 'selftest-hmm-part'})
const a = result.all
assert.equal(a.messages, 1831)
assert.equal(a.accepted + a.rejected + a.unjudged + a.invalid, 1831)
assert.equal(a.invalid, 100, '50 invalid + 50 missing')
assert.equal(a.valid, 1731)
// spaCy's own circuits, renamed, are equal to spaCy under every key; the moved starts are equal relaxed only
const sameCore = (i, rows) => { const x = normalForm(rows[i].text, rows[i].sop)?.core, y = normalForm(spacyRows[i].text, spacyRows[i].sop)?.core; return x && x === y }
const hmmExact = hmmRows.slice(220).filter((_, k) => sameCore(220 + k, hmmRows)).length
assert.equal(a.exact, 100 + (20 - moved) + hmmExact, 'exact equality with spaCy')
assert.ok(a.relaxed >= 120 + hmmExact)
// verdicts add up: the fake is the union of the parts plus 20 moved or copied spaCy circuits
const partMoved = evaluateBenchmark(writeJsonl(join(dir, 'bench-moved-part.jsonl'), fake.filter(row => spacyRows.findIndex(s => s.text === row.text) >= 200 && spacyRows.findIndex(s => s.text === row.text) < 220)), {name: 'selftest-moved-part'})
assert.equal(a.accepted, partS.all.accepted + partH.all.accepted + partMoved.all.accepted, 'accepted adds up')
assert.equal(a.rejected, partS.all.rejected + partH.all.rejected + partMoved.all.rejected, 'rejected adds up')
assert.equal(a.unjudged, partS.all.unjudged + partH.all.unjudged + partMoved.all.unjudged, 'unjudged adds up')
assert.equal(result.unjudged.length, new Set(result.unjudged.map(row => row.text + '\0' + normalForm(row.text, row.sop).core)).size, 'unjudged listed once each')
assert.equal(result.unjudged.length, a.unjudged)
for (const row of result.unjudged) assert.equal(row.sop, normalForm(row.text, row.sop).sop, 'unjudged circuits are in normal form')
// spaCy's renamed circuits get spaCy's verdicts
const spacyFull = evaluateBenchmark(join(benchmarkDir, 'spacy.jsonl'), {name: 'spacy'})
if (spacyFull.dataset.commit === 'c6b11f6' && !spacyFull.dataset.changedFiles) assert.equal(spacyFull.all.accepted, 1732, 'spaCy known accepted as in the published table (94.6%)')
else console.log(`spaCy known accepted ${spacyFull.all.accepted} on ${spacyFull.dataset.text} (1732 on c6b11f6)`)
// the two scripts compare alike: hmm-rules against spaCy's circuits as development targets, and on the benchmark
const hmmBench = evaluateBenchmark(join(benchmarkDir, 'vss.jsonl'), {name: 'hmm-rules'})
const asTargets = writeJsonl(join(dir, 'bench-as-targets.jsonl'), spacyRows.map(row => ({id: row.id, text: row.text, sop: row.sop, origin: 'spacy'})))
const hmmDev = evaluateDev(join(benchmarkDir, 'vss.jsonl'), asTargets, {})
for (const key of ['exact', 'relaxed', 'variants', 'valid']) assert.equal(hmmDev.all[key], hmmBench.all[key], 'the same count from both scripts: ' + key)
assert.equal(hmmDev.benchmarkNearCopies.exact, 1831, 'every benchmark message is found as a copy')
console.log('evaluate-benchmark: all assertions hold', JSON.stringify({accepted: a.accepted, rejected: a.rejected, unjudged: a.unjudged, invalid: a.invalid, exact: a.exact, relaxed: a.relaxed, variants: a.variants, moved}))

// ---- the command lines run and write their files
const node = process.execPath
execFileSync(node, [join(here, 'evaluate-dev.mjs'), devOutputs, devTargets, '--json', join(dir, 'cli-dev.json'), '--quiet'], {stdio: 'pipe'})
execFileSync(node, [join(here, 'evaluate-benchmark.mjs'), fakeFile, '--name', 'selftest', '--out-dir', join(dir, 'cli-bench'), '--quiet'], {stdio: 'pipe'})
assert.equal(JSON.parse(readFileSync(join(dir, 'cli-dev.json'), 'utf8')).all.exact, expected.exact)
const cli = JSON.parse(readFileSync(join(dir, 'cli-bench/summary.json'), 'utf8'))
assert.equal(cli.all.accepted, a.accepted); assert.equal(cli.unjudgedCount, readRows(join(dir, 'cli-bench/unjudged.jsonl')).length)
console.log('command lines: all assertions hold; files in ' + dir)
