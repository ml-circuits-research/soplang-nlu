// Render a scored prospective run from the frozen public lists and their reviewed verdicts.
import {readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {gunzipSync} from 'node:zlib'

const [run,primary,comparison,output]=process.argv.slice(2)
if(!output)throw Error('Expected RUN PRIMARY_STRATEGY COMPARISON_STRATEGY NEW_REPORT_PATH')
const review=join(run,'source-review')
const summary=JSON.parse(readFileSync(join(review,'candidate-review-summary.json')))
const environment=JSON.parse(readFileSync(join(run,'environment.json')))
const entries=Object.entries(summary.engines)
const results=gunzipSync(readFileSync(join(review,'public-set-judgments.jsonl.gz'))).toString().trim()
  .split('\n').map(JSON.parse)
if(summary.sampleSha256!==environment.sampleSha256||!summary.engines[primary]||!summary.engines[comparison])
  throw Error('Unmatched benchmark inputs or strategies')
const forms=new Map()
for(const row of results){
  if(!forms.has(row.engine))forms.set(row.engine,new Map())
  const indexed=forms.get(row.engine)
  if(indexed.has(row.id))throw Error('Repeated strategy/source judgment')
  indexed.set(row.id,row)
}
for(const [engine,{outcomes,grades,timing}] of entries){
  if(forms.get(engine)?.size!==summary.sample || timing.requests!==summary.sample ||
    [outcomes,grades].some(d=>Object.values(d.counts).reduce((a,b)=>a+b,0)!==summary.sample))
    throw Error('Missing whole-source judgments or timings for '+engine)
}
const pct=n=>n.toFixed(2)+'%'
const table=(headers,rows)=>[headers,headers.map(()=>'---'),...rows].map(c=>'| '+c.join(' | ')+' |').join('\n')
const any=o=>o.counts.some+o.counts.all
const outcomes=summary.engines[primary].outcomes
const minimum=Math.ceil(.80*summary.sample)
const levels=Array.from({length:11},(_,i)=>'L'+i)
const legend=readFileSync(new URL('./native-v3-legend.md',import.meta.url),'utf8')
const legendTable=legend.split('\n').filter(l=>l.startsWith('|')).join('\n')
const content=['# Prospective public-reading results',
  `**${primary} produced at least one plausible circuit on ${any(outcomes)} of ${summary.sample} texts (${pct(100*any(outcomes)/summary.sample)}).** The 80% target requires ${minimum} texts. Library revision \`${summary.libraryRevision}\` generated the predictions.`,
  '## Outcome percentages by strategy',
  table(['Strategy','None','Some','All','At least one'],entries.map(([name,{outcomes:o}])=>[name,
    ...['none','some','all'].map(k=>pct(o.percentages[k])),pct(100*any(o)/summary.sample)])),
  'None, Some and All partition each sample. At least one combines Some and All.',
  '## Grade percentages',
  table(['Strategy',...levels.map((k,i)=>i>=7?'🟢 '+k:k)],entries.map(([name,{grades}])=>[name,...levels.map(k=>pct(grades.percentages[k]))])),
  legendTable,'Green levels satisfy the primary criterion. The distribution uses largest-remainder rounding.',
  '## CPU timing',
  table(['Strategy','Wall seconds','Median request ms','95th percentile ms'],entries.map(([name,{timing:t}])=>[
    name,(t.wallMs/1000).toFixed(2),t.medianMs?.toFixed(2)??'unavailable',t.p95Ms?.toFixed(2)??'unavailable'])),
  `The run used ${environment.activeWorkers} worker(s) per strategy. The audit adjudicated ${summary.audit.thresholdDisagreements} threshold disagreements and found ${summary.audit.agreementAuditContradictions} contradictions in ${summary.audit.agreementAuditCount} agreement checks. Frozen native references covered ${summary.frozenNativeReferenceTexts} texts.`,
  '## Paired examples']
const pairs=[...forms.get(primary).values()].map(a=>[a,forms.get(comparison).get(a.id)])
if(pairs.some(([a,b])=>!b||a.text!==b.text))throw Error('Comparators used different inputs')
for(const [label,match] of [
  ['Primary strategy succeeds',([a,b])=>a.outcome!=='none'&&b.outcome==='none'],
  ['Comparator succeeds',([a,b])=>a.outcome==='none'&&b.outcome!=='none'],
  ['Both strategies miss',([a,b])=>a.outcome==='none'&&b.outcome==='none']
]){
  const pair=pairs.find(match)
  if(!pair)continue
  content.push('### '+label,JSON.stringify(pair[0].text))
  for(const r of pair){
    const c=r.candidates.find(c=>c.grade===8)??r.candidates[0]
    content.push('**'+r.engine+'** · L'+r.grade,c?.reason??r.reason)
    if(c)content.push('~~~~sop\n'+c.sop+'\n~~~~')
  }
}
writeFileSync(output,content.join('\n\n')+'\n',{flag:'wx'})
