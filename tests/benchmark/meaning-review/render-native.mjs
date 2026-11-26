import {readFileSync,writeFileSync} from 'node:fs'
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
const reviewText = readFileSync(new URL('./native-legend.md',import.meta.url),'utf8')
const legend = reviewText.slice(reviewText.indexOf('| Level |'), reviewText.indexOf('\n\n',reviewText.indexOf('| Level |')))
const report = [
  '# Native NLU paired benchmark',
  'The three strategies read the same '+env.sample+' frozen text records from WebMeet dataset revision `'+env.revision.slice(0,12)+'`. Generation used '+env.workers+' workers per strategy. Percentages below have one denominator per strategy and are rounded by largest remainder so each column totals 100.0%.',
  [table(['Level',...display]),table(['---','---:','---:','---:']),...levelRows,table(['**Total**',...names.map(()=>'100.0%')])].join('\n'),
  legend,
  'Green levels meet the acceptance threshold. The model judge reads the source and the eligible native circuits. Semantic keys are optional. The frozen CSV references use w.request and provide no directly comparable native gold, so L9 and L10 are unavailable on this run.',
  '## Timing and structural checks',
  [table(['Strategy','Wall time','Median request','p95 request','Valid, fully accounted reading','Fully accounted without unresolved text']),table(['---','---:','---:','---:','---:','---:']),
    ...timings.map((t,i)=>table([display[i],(t.wallMs/1000).toFixed(2)+' s',t.medianMs.toFixed(2)+' ms',t.p95Ms.toFixed(2)+' ms',pct(100*t.withFullyAccountedReading/env.sample),pct(100*t.withAllWordsAssignedRoles/env.sample)]))].join('\n'),
  'Generation wall time includes worker startup and shutdown. The transfer training split took '+(training.splitMs/1000).toFixed(2)+' s and induction took '+(training.trainingMs/1000).toFixed(2)+' s before generation. Corpus review is timed separately. A fully accounted circuit can still contain a wrong predicate or attachment. Filler counts as accounted in the structural metrics.',
  '[Frozen sample](sample.json.gz) · [Environment and revisions](environment.json)'
]
writeFileSync(join(run,'README.md'),report.join('\n\n')+'\n')
