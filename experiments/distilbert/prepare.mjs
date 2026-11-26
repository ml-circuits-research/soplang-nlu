// Build native structured labels only from source-grounded, independently
// accepted readings. Keep all study/test texts out before selecting a graph.
import {createHash} from 'node:crypto'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {gunzipSync,gzipSync} from 'node:zlib'
import {createAnalysisValidator,hasCompleteSource} from '../../lib/check-analysis.mjs'
import {encodeGraph,renderGraph} from '../../strategies/distilbert/graph.mjs'

const [out] = process.argv.slice(2)
if(!out)throw Error('Expected new output directory')
const root=fileURLToPath(new URL('../../',import.meta.url))
const archives=join(root,'eval-results')
const knowledge=resolve(process.env.SOP_KNOWLEDGE_DIR ?? join(root,'../sop-knowledge-worlds'))
const {parse}=await import(pathToFileURL(join(knowledge,'tools/sopworld/sopworld.mjs')))
const validate=await createAnalysisValidator({knowledgeDir:knowledge})
const hash=s=>createHash('sha256').update(s).digest('hex')
const unpack=p=>gunzipSync(readFileSync(p)).toString()
const rows=p=>unpack(p).trim().split('\n').filter(Boolean).map(JSON.parse)
const pool=join(archives,'2026-11-26-neuro-selector-proposal-pools')
const heldIds=new Set(JSON.parse(readFileSync(join(pool,'train/split.json'))).validationIds)
const study=rows(join(pool,'train/sources.jsonl.gz')).filter(r=>heldIds.has(r.id))
const reserved=JSON.parse(unpack(join(root,'tests/benchmark/next-evaluation/reserved-exact-texts.json.gz')))
const excluded=new Set([...reserved,...[...study,...rows(join(pool,'diagnostic/sources.jsonl.gz'))].map(r=>hash(r.text))])
const bank=new Map()
function add(id,text,sop,vote) {
  if(excluded.has(hash(text)) || vote?.grade!==8 || vote.audit&&vote.audit.grade!==8)return
  const support=[vote.primary,vote.independent,vote.audit].filter(v=>v?.grade===8).length
  if(support<2)return
  if(!bank.has(text))bank.set(text,{id,readings:new Map()})
  bank.get(text).readings.set(sop,support)
}
const reviewDirs=[
 '2026-11-26-fresh-locked-one-percent/source-review',
 '2026-11-26-spacy-direct-historical-refresh-one-percent/transformer/review',
 '2026-11-26-spacy-direct-historical-refresh-one-percent/compact/review'
]
const votesFor=dir=>new Map(rows(join(dir,'candidate-decisions.jsonl.gz')).map(v=>[v.fingerprint,v]))
const identity=(text,sop)=>hash(JSON.stringify([text,sop]))
for(const rel of reviewDirs){
  const dir=join(archives,rel),votes=votesFor(dir)
  for(const row of rows(join(dir,'public-set-judgments.jsonl.gz')))
    for(const sop of row.acceptedCandidateSops)add(row.id,row.text,sop,votes.get(identity(row.text,sop)))
}
const poolVotes=votesFor(join(pool,'train/review'))
for(const row of rows(join(pool,'train/pool.jsonl.gz')))for(const c of row.candidates)
  if(c.eligible)add(row.id,row.text,c.sop,poolVotes.get(identity(row.text,c.sop)))
const examples=[]
let examined=0
for(const [text,{id,readings}] of bank){
  // Prefer corroboration. Ties use a deterministic hash independent of model family and wire count.
  const ordered=[...readings].sort(([a,n],[b,m])=>m-n||hash(a).localeCompare(hash(b)))
  for(const [sop] of ordered){
    examined++
    const check=validate(text,sop,{alignSource:true})
    if(!hasCompleteSource(check))continue
    const graph=encodeGraph(text,sop,parse,check)
    if(!hasCompleteSource(validate(text,renderGraph(text,graph.tokens,graph.nodes))))throw Error('Round-trip failed at '+id)
    examples.push({id,text,...graph})
    break
  }
}
examples.sort((a,b)=>hash('distilbert-structure-v1\0'+a.text).localeCompare(hash('distilbert-structure-v1\0'+b.text)))
const devCount=Math.max(1,Math.round(examples.length*.1))
mkdirSync(out)
function save(split,data){
  const bytes=gzipSync(data.map(r=>JSON.stringify(r)).join('\n')+'\n')
  writeFileSync(join(out,split+'.jsonl.gz'),bytes,{flag:'wx'})
  return {rows:data.length,sha256:hash(bytes)}
}
const report={sources:reviewDirs,acceptedSources:bank.size,examined,heldBackExactSources:excluded.size,
  officialReserved:reserved.length,studyRows:study.length,train:save('train',examples.slice(devCount)),
  dev:save('dev',examples.slice(0,devCount)),study:save('study',study)}
writeFileSync(join(out,'manifest.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(report))
