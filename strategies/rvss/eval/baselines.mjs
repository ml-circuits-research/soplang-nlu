// The baseline tables of BASELINES.md: evaluate-benchmark on the strategy files of the 1% benchmark, and the speed
// files that speed.mjs wrote. Prints Markdown; writes nothing but the per-strategy summaries of evaluate-benchmark
// (in .local-data/rvss/eval/benchmark/<name>/).
//   node strategies/rvss/eval/baselines.mjs [--strategies spacy,hmm-rules,distilbert,prolog,z3] [--extra <name>=<outputs.jsonl>]...
// --extra adds a row for any other outputs file (an rvss run, for example).
import {existsSync, readFileSync, mkdirSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {outputFile} from '../../../tests/benchmark/syntax/lib.mjs'
import {evaluateBenchmark, renderBenchmark} from './evaluate-benchmark.mjs'
import {benchmarkDir, localData, percent, parseArguments, listOf, datasetState} from './common.mjs'

const {named} = parseArguments(process.argv.slice(2))
const names = named.strategies ? listOf(named.strategies) : ['spacy', 'hmm-rules', 'distilbert', 'prolog', 'z3']
const files = names.map(name => [name, outputFile(benchmarkDir, name)])
for (const extra of listOf(named.extra)) { const [name, file] = extra.split('='); files.push([name, file]) }
const results = []
for (const [name, file] of files) {
  if (!existsSync(file)) { console.error(`No outputs for ${name}: ${file}`); continue }
  const result = evaluateBenchmark(file, {name})
  const outDir = join(localData, 'eval/benchmark', name)
  mkdirSync(outDir, {recursive: true})
  result.unjudgedFile = join(outDir, 'unjudged.jsonl')
  writeFileSync(result.unjudgedFile, result.unjudged.map(row => JSON.stringify(row)).join('\n') + (result.unjudged.length ? '\n' : ''))
  const {unjudged, ...summary} = result
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({...summary, unjudgedCount: unjudged.length}, null, 2) + '\n')
  writeFileSync(join(outDir, 'summary.md'), renderBenchmark(result))
  results.push(result)
}
const fileOf = r => r.outputs.replace(benchmarkDir + '/', '')
console.log(`Computed on ${datasetState().text}, ${new Date().toISOString()}.\n`)
console.log('| Strategy (file) | Valid | Known accepted | Known rejected | Unjudged | No valid circuit | Lower – upper bound | table.mjs GOAL | Run judge vs registry conflicts | = spaCy exact | = spaCy relaxed | = spaCy variants |')
console.log('| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |')
for (const r of results) {
  const a = r.all
  console.log(`| ${r.name} (\`${fileOf(r)}\`) | ${a.valid} | ${a.accepted} (${percent(a.accepted, a.messages)}) | ${a.rejected} | ${a.unjudged} | ${a.invalid} | ${percent(a.accepted, a.messages)} – ${percent(a.accepted + a.unjudged, a.messages)} | ${r.tableGoalCount} (${percent(r.tableGoalCount, r.messages)}) | ${r.conflictsRunVsRegistry} | ${a.exact} (${percent(a.exact, a.messages)}) | ${a.relaxed} (${percent(a.relaxed, a.messages)}) | ${a.variants} (${percent(a.variants, a.messages)}) |`)
}
console.log('\nKnown accepted by group (count / messages):\n')
const groups = [...new Set(results.flatMap(r => [...Object.keys(r.bySplit), ...Object.keys(r.byArea).map(k => 'area ' + k), ...Object.keys(r.byLength).map(k => 'length ' + k)]))]
const orderOf = g => g.startsWith('had a') ? 0 : g.startsWith('had no') ? 1 : g.startsWith('area') ? 2 : 3
const lengthOrder = ['<10', '10-24', '25-39', '40+']
groups.sort((x, y) => orderOf(x) - orderOf(y) || (orderOf(x) === 3 ? lengthOrder.indexOf(x.slice(7)) - lengthOrder.indexOf(y.slice(7)) : x.localeCompare(y)))
console.log('| Group | ' + results.map(r => r.name).join(' | ') + ' |')
console.log('| --- | ' + results.map(() => '---:').join(' | ') + ' |')
const pick = (r, g) => g.startsWith('area ') ? r.byArea[g.slice(5)] : g.startsWith('length ') ? r.byLength[g.slice(7)] : r.bySplit[g]
for (const g of groups) console.log(`| ${g} | ` + results.map(r => { const t = pick(r, g); return t ? `${t.accepted} / ${t.messages} (${percent(t.accepted, t.messages)})` : '—' }).join(' | ') + ' |')
console.log('\nAgainst spaCy on the messages where both circuits have a verdict:\n')
console.log('| Strategy | Messages | Accepted | spaCy accepted | Both | Only this | Only spaCy | Neither |')
console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
for (const r of results) { const v = r.versusReference; console.log(`| ${r.name} | ${v.messages} | ${v.accepted} | ${v.referenceAccepted} | ${v.both} | ${v.onlyThis} | ${v.onlyReference} | ${v.neither} |`) }
console.log('\nRejected grades and where the acceptance comes from:\n')
console.log('| Strategy | Rejected grades | Accepted by | Milliseconds in the outputs file (median / p90) |')
console.log('| --- | --- | --- | --- |')
for (const r of results) console.log(`| ${r.name} | ${Object.entries(r.rejectedGrades).sort().map(([k, n]) => `${k} ${n}`).join(', ')} | ${Object.entries(r.byAcceptedSource).map(([k, n]) => `${k} ${n}`).join(', ')} | ${r.msInFile ? `${r.msInFile.median} / ${r.msInFile.p90}` : '—'} |`)
const speedDir = join(localData, 'eval/speed')
const speeds = names.flatMap(name => ['cpu', 'cpu-1thread'].map(tag => join(speedDir, `${name}-${tag}.json`))).filter(existsSync).map(file => JSON.parse(readFileSync(file, 'utf8')))
if (speeds.length) {
  console.log('\nSpeed and size (speed.mjs, through createReader, one message after the other):\n')
  console.log('| Strategy | Device | Messages | Start-up ms (import + open) | Median ms | p90 ms | p99 ms | Mean ms | Model MB on disk | RSS MB after the run | Load average (1 min) before / after, of CPUs | Measured |')
  console.log('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |')
  for (const s of speeds) console.log(`| ${s.name} | ${s.device}${s.environment?.OMP_NUM_THREADS ? ', OMP_NUM_THREADS=' + s.environment.OMP_NUM_THREADS : ''} | ${s.messages} | ${s.startupMs} (${s.importMs} + ${s.openMs}) | ${s.perMessageMs.median} | ${s.perMessageMs.p90} | ${s.perMessageMs.p99} | ${s.perMessageMs.mean} | ${s.size.modelMB} | ${s.rssAfterRun.MB} (${s.rssAfterRun.processes} processes) | ${s.machine.loadBefore[0]} / ${s.machine.loadAfter[0]} of ${s.machine.cpus} | ${s.measuredAt} |`)
}
