import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {gzipSync,gunzipSync} from 'node:zlib'
import {createAnalysisValidator,hasCompleteSource} from '../../../lib/check-analysis.mjs'
import {describeGraph} from './describe.mjs'
const [base,extra,out]=process.argv.slice(2)
if(!out)throw Error('Expected BASE_LABEL_DIR EXPANSION_DIR NEW_OUTPUT')
const root=fileURLToPath(new URL('../../../',import.meta.url))
const archive=join(root,'eval-results')
const kd=resolve(process.env.SOP_KNOWLEDGE_DIR??join(root,'../sop-knowledge-worlds'))
const validate=await createAnalysisValidator({knowledgeDir:kd})
const {parse}=await import(pathToFileURL(join(kd,'tools/sopworld/sopworld.mjs')))
const sha=s=>createHash('sha256').update(s).digest('hex')
const rows=p=>gunzipSync(readFileSync(p)).toString().trim().split('\n').filter(Boolean).map(JSON.parse)
const denied=new Set(JSON.parse(gunzipSync(readFileSync(join(root,'tests/benchmark/next-evaluation/reserved-exact-texts.json.gz')))))
const selector=join(archive,'2026-11-26-neuro-selector-proposal-pools')
for(const f of [join(base,'dev.jsonl.gz'),join(base,'study.jsonl.gz'),join(base,'curated-calibration.jsonl.gz'),join(selector,'diagnostic/sources.jsonl.gz')])
  for(const {text} of rows(f))denied.add(sha(text))
const examples=new Map(),conflicts=new Set(),sources=[]
function collect(path,voteFile,kind){
  const decisions=new Map(rows(voteFile).map(d=>[d.fingerprint,d]))
  let pairs=0
  for(const r of rows(path)){
    if(denied.has(sha(r.text)))continue
    const proposals=kind==='historical'?r.publicCandidateSops:kind==='curation'?r.readings?.map(c=>c.sop):r.candidates.map(c=>c.sop)
    for(const sop of proposals??[]){
      const id=sha(JSON.stringify([r.text,sop]))
      const d=decisions.get(id)
      if(!d||conflicts.has(id))continue
      const accepted=d.grade===8
      if(d.audit&&((d.audit.grade===8)!==accepted) ||
        [d.primary,d.independent,d.audit].filter(v=>v&&((v.grade===8)===accepted)).length<2)continue
      if(examples.has(id)){
        if(examples.get(id).accepted!==accepted){examples.delete(id);conflicts.add(id)}
        continue
      }
      if(!hasCompleteSource(validate(r.text,sop)))continue
      examples.set(id,{id,text:r.text,graph:describeGraph(parse(sop)),accepted})
      pairs++
    }
  }
  sources.push({set:path.split('/').slice(-3).join('/'),pairs,sha256:sha(readFileSync(path)),votes:sha(readFileSync(voteFile))})
}
for(const name of ['2026-11-26-fresh-locked-one-percent/source-review',
  '2026-11-26-spacy-direct-historical-refresh-one-percent/transformer/review',
  '2026-11-26-spacy-direct-historical-refresh-one-percent/compact/review']){
  collect(join(archive,name,'public-set-judgments.jsonl.gz'),join(archive,name,'candidate-decisions.jsonl.gz'),'historical')
}
for(const dir of [join(selector,'train'),extra]){
  collect(join(dir,'pool.jsonl.gz'),join(dir,'review/candidate-decisions.jsonl.gz'),'pool')
}
for(let i=1;i<=12;i++){
  const dir=join(archive,'2026-11-26-sol-native-curation',String(i).padStart(6,'0'))
  collect(join(dir,'records.jsonl.gz'),join(dir,'candidate-decisions.jsonl.gz'),'curation')
}
mkdirSync(out)
const splits={train:[],dev:[]}
for(const row of examples.values()){
  const split=parseInt(sha('native-verifier-v1\0'+row.text).slice(0,8),16)%10===0?'dev':'train'
  splits[split].push(row)
}
const summary={conflicts:conflicts.size,sources}
for(const [name,items] of Object.entries(splits)){
  const bytes=gzipSync(items.map(i=>JSON.stringify(i)).join('\n')+'\n')
  writeFileSync(join(out,name+'.jsonl.gz'),bytes,{flag:'wx'})
  summary[name]={pairs:items.length,texts:new Set(items.map(i=>i.text)).size,
    positive:items.filter(i=>i.accepted).length,sha256:sha(bytes)}
}
writeFileSync(join(out,'manifest.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(summary))
