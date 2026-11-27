// Evaluate a trained parser: the dev split against its labels (and VSS on the same split), and the
// benchmark's 1,831 messages by the verdicts known.   node evaluate.mjs [model.json.gz] [--tag name]
import {readFileSync, writeFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {Parser} from './parser.mjs'
import {treeToCircuit} from './tree.mjs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {normalForm, relaxedCore, readLabels} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const sourceOf = new Map([...readLabels()].map(([t, l]) => [t, l.source]))
const {createVssReader} = await import(root + 'strategies/hmm-rules/src/reader.mjs')
const {openVerdicts, runDir} = await import('./verdicts.mjs')
const modelFile = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'model.json.gz'
const tag = process.argv.includes('--tag') ? process.argv[process.argv.indexOf('--tag') + 1] : 'parser'
const t0 = performance.now()
const parser = Parser.fromJSON(JSON.parse(gunzipSync(readFileSync(modelFile))))
const loadMs = performance.now() - t0
const data = JSON.parse(gunzipSync(readFileSync(process.argv.includes('--data') ? process.argv[process.argv.indexOf('--data') + 1] : 'data.json.gz')))
const vss = createVssReader(JSON.parse(readFileSync(root + 'strategies/hmm-rules/model/model.json', 'utf8')), {schema: 'syntax'})

function circuitOf(x) {
  const {heads, labels} = parser.parse(x)
  let sop = null, error = null
  try { sop = treeToCircuit(x.text, heads, labels) } catch (e) { error = e.message }
  return {sop, error, heads, labels}
}
// ---- dev
const dev = data.filter(x => x.split === 'dev')
const tally = () => ({n: 0, parser: 0, vss: 0, both: 0, parserOnly: 0, vssOnly: 0, invalid: 0, uas: 0, las: 0, words: 0, parserLoose: 0, vssLoose: 0})
const dt = {gold: tally(), 'gold, VSS not a writer': tally(), 'gold, VSS a writer': tally(), silver: tally(), all: tally()}
const devRows = []
let parseMs = 0
for (const x of dev) {
  const label = normalForm(x.text, x.label)?.core
  const t = performance.now()
  const p = circuitOf(x)
  parseMs += performance.now() - t
  const pc = p.sop ? normalForm(x.text, p.sop)?.core : null
  let vsop = null
  try { vsop = vss.analyse(x.text).analyses[0]?.sop } catch {}
  const vc = vsop ? normalForm(x.text, vsop)?.core : null
  const groups = [x.gold ? dt.gold : dt.silver, dt.all]
  if (x.gold) groups.push(dt[/(^|\+)vss(\+|$)/u.test(sourceOf.get(x.text) ?? '') ? 'gold, VSS a writer' : 'gold, VSS not a writer'])
  for (const g of groups) {
    g.n++
    if (!pc) g.invalid++
    const a = pc === label, b = vc === label
    if (pc && relaxedCore(pc) === relaxedCore(label)) g.parserLoose++
    if (vc && relaxedCore(vc) === relaxedCore(label)) g.vssLoose++
    if (a) g.parser++; if (b) g.vss++; if (a && b) g.both++; if (a && !b) g.parserOnly++; if (b && !a) g.vssOnly++
    if (x.heads) for (let k = 0; k < x.heads.length; k++) { g.words++; if (p.heads[k] === x.heads[k]) { g.uas++; if (p.labels[k] === x.labels[k]) g.las++ } }
  }
  devRows.push({text: x.text, gold: x.gold, label: x.label, parser: p.sop, vss: vsop, parserOk: pc === label, vssOk: vc === label, error: p.error})
}
const pct = (a, b) => (100 * a / b).toFixed(2) + '%'
console.log('DEV (share of messages whose circuit equals the label)')
for (const [name, g] of Object.entries(dt)) console.log(`  ${name.padEnd(24)} n=${String(g.n).padStart(4)}  parser ${pct(g.parser, g.n)}  vss ${pct(g.vss, g.n)} | relation starts ignored: parser ${pct(g.parserLoose, g.n)}  vss ${pct(g.vssLoose, g.n)} | both ${g.both}  parser-only ${g.parserOnly}  vss-only ${g.vssOnly}  invalid ${g.invalid}  UAS ${pct(g.uas, g.words)}  LAS ${pct(g.las, g.words)}`)
// ---- benchmark
const {verdictOf} = openVerdicts()
const vssRun = new Map(readFileSync(runDir + 'vss.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).map(r => [r.text, r]))
const bench = data.filter(x => x.split === 'bench')
const bt = {parser: {}, vss: {}}
const count = (t, k) => t[k] = (t[k] ?? 0) + 1
const benchRows = []
const times = []
for (const x of bench) {
  const t = performance.now()
  const p = circuitOf(x)
  times.push(performance.now() - t)
  const pc = p.sop ? normalForm(x.text, p.sop)?.core : null
  const v = vssRun.get(x.text)
  const vc = v?.sop ? normalForm(x.text, v.sop)?.core : null
  const pv = verdictOf(x.text, pc), vv = verdictOf(x.text, vc)
  count(bt.parser, pv.verdict); count(bt.vss, vv.verdict)
  if (pv.verdict === 'unjudged' && pv.labelNow) count(bt.parser, 'unjudged=labelNow')
  if (vv.verdict === 'unjudged' && vv.labelNow) count(bt.vss, 'unjudged=labelNow')
  if (pv.verdict === 'unjudged') count(bt.parser, 'relaxed-' + pv.relaxed)
  if (vv.verdict === 'unjudged') count(bt.vss, 'relaxed-' + vv.relaxed)
  count(bt.parser, 'pair ' + pv.verdict + '/' + vv.verdict)
  benchRows.push({id: x.id, text: x.text, sop: p.sop, error: p.error, ms: times.at(-1), verdict: pv, vssSop: v?.sop ?? null, vssVerdict: vv, same: pc === vc})
}
times.sort((a, b) => a - b)
console.log('vss.jsonl as of', (await import('node:fs')).statSync(runDir + 'vss.jsonl').mtime.toISOString())
console.log('BENCHMARK (1,831 messages; verdicts by core: judged in the run, registry, label before the run)')
for (const name of ['parser', 'vss']) {
  const t = bt[name]
  console.log(`  ${name.padEnd(6)} accepted ${t.accepted ?? 0} (${pct(t.accepted ?? 0, bench.length)})  rejected ${t.rejected ?? 0} (${pct(t.rejected ?? 0, bench.length)})  unjudged ${t.unjudged ?? 0} (equal to the label now ${t['unjudged=labelNow'] ?? 0}; up to relation starts equal to an accepted circuit ${t['relaxed-accepted'] ?? 0}, to a rejected one ${t['relaxed-rejected'] ?? 0}, to none ${t['relaxed-unknown'] ?? 0})  invalid ${t.invalid ?? 0}`)
}
console.log('  pairs parser/vss:', Object.entries(bt.parser).filter(([k]) => k.startsWith('pair')).map(([k, v]) => k.slice(5) + '=' + v).join('  '))
console.log('  same core as vss:', benchRows.filter(r => r.same).length)
console.log(`SPEED: model load ${loadMs.toFixed(0)} ms; dev ${(parseMs / dev.length).toFixed(3)} ms/message (parse + circuit); benchmark median ${times[times.length >> 1].toFixed(3)} ms, mean ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(3)} ms (VSS observations precomputed)`)
writeFileSync(`bench-${tag}.jsonl`, benchRows.map(r => JSON.stringify(r)).join('\n') + '\n')
writeFileSync(`dev-${tag}.jsonl`, devRows.map(r => JSON.stringify(r)).join('\n') + '\n')
