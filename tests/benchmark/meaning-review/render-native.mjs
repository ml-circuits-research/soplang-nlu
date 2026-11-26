import {existsSync,readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {gunzipSync} from 'node:zlib'
import {summarizeReview} from './report.mjs'

const [runArg,reviewArg] = process.argv.slice(2)
if (!runArg || !reviewArg) throw Error('Expected a native run directory and a finalized review directory.')
const run = resolve(runArg), review = resolve(reviewArg)
const json = path => JSON.parse(readFileSync(path,'utf8'))
const env = json(join(run,'environment.json'))
if (env.evaluatedSchema !== 'nlu') throw Error('Native predictions required.')
const rows = gunzipSync(readFileSync(join(review,'native-judgments.jsonl.gz'))).toString().trim().split('\n').map(line => JSON.parse(line))
if (rows.some(row=>!['all','mixed','none'].includes(row.outcome))) throw Error('Expected a native v3 whole-set evaluation.')
const referenceFile = join(run,'native-references.json.gz')
const adjudication = json(join(run,'source-review-v2','native-summary.json'))
const {engines} = summarizeReview(rows.map(row => ({...row,diagnostics:[]})))
const names = ['z3','prolog-worlds','prolog-example-transfer']
const display = ['Z3','Symbolic Prolog','Prolog example transfer']
const timings = names.map(name=>json(join(run,name+'.json')))
const training = json(join(run,'prolog-example-transfer-training.json'))
if (!names.every(name => engines[name]?.total === env.sample)) throw Error('Incomplete native review.')
const pct = n => n.toFixed(1)+'%'
const table = cells => '| '+cells.join(' | ')+' |'
const levelRows = Array.from({length:11}, (_,i) => {
  const level = 'L'+i
  return table([(i<5?'🔴 ':i<8?'🟠 ':'🟢 ')+level,...names.map(name=>pct(engines[name].roundedPercentages[level]))])
})
const outcomeSummary = json(join(review,'native-summary.json'))
const reviewText = readFileSync(new URL('./native-v3-legend.md',import.meta.url),'utf8')
const legend = reviewText.slice(reviewText.indexOf('| Level |'), reviewText.indexOf('\n\n',reviewText.indexOf('| Level |')))
const report = [
  '# Native NLU paired benchmark',
  'The three strategies read the same '+env.sample+' frozen text records from WebMeet dataset revision `'+env.revision.slice(0,12)+'`. Generation used '+env.workers+' workers per strategy. Each column has one denominator. The level percentages use largest-remainder rounding.',
  [table(['Candidate-set outcome',...display]),table(['---','---:','---:','---:']),
    ...[['none','None acceptable'],['mixed','Some acceptable'],['all','All acceptable']].map(([key,label]) =>
      table([label,...names.map(name=>outcomeSummary.engines[name].outcomes.percentages[key].toFixed(2)+'%')]))].join('\n'),
  [table(['Level',...display]),table(['---','---:','---:','---:']),...levelRows,table(['**Total**',...names.map(()=>'100.0%')])].join('\n'),
  legend,
  'L7 denotes a mixture of acceptable and unacceptable candidates. Green levels require every public candidate to be acceptable. An empty set is L0. Optional semantic keys are judged when emitted. '+(existsSync(referenceFile) ? 'L9 requires the entire acceptable set to match the frozen native references, independently of order.' : 'The frozen CSV references use w.request and provide no directly comparable native gold, so L9 and L10 are unavailable on this run.'),
  '## Timing and structural checks',
  [table(['Strategy','Wall time','Median request','p95 request','Passed final prefilter']),table(['---','---:','---:','---:','---:','---:']),
    ...timings.map((t,i)=>table([display[i],(t.wallMs/1000).toFixed(2)+' s',t.medianMs.toFixed(2)+' ms',t.p95Ms.toFixed(2)+' ms',pct(100*adjudication.engines[names[i]].modelReviewed/env.sample)]))].join('\n'),
  'Generation wall time includes worker startup and shutdown. The transfer training split took '+(training.splitMs/1000).toFixed(2)+' s and induction took '+(training.trainingMs/1000).toFixed(2)+' s before generation. Corpus review is timed separately. The prefilter percentages use the final offline validation of the frozen generation. A fully accounted circuit can still contain a wrong predicate or attachment.',
  '[Failure examples](failure-examples.md) · [Frozen sample](sample.json.gz) · [Environment and revisions](environment.json) · [Independent schema check](native-schema-audit.json)'
]
if (existsSync(join(run,'candidate-audit/top1-vs-any-summary.json'))) {
  report.push('## Alternatives and independent checks',
    'The [v3 set evaluation](source-review-v3/README.md) classifies every message as none, some or all acceptable. The [cross-strategy comparison](symbolic-agreement.md) checks graphs up to local identifiers and ordering, and reports the effect of optional semantic enrichment.',
    'The [blinded reviewer comparison](source-review-v2/terra-comparison/README.md) measures agreement over the same complete candidate groups. The [preliminary filter audit](preliminary-filter-audit.md) replays the source checks on all generated circuits. The [candidate inventory](candidate-audit/candidate-inventory-summary.json) records the stricter independent checks used for native annotation publication.')
}
writeFileSync(join(run,'README.md'),report.join('\n\n')+'\n')
