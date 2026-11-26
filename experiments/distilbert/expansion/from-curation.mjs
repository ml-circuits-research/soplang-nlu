// Build a reproducible training snapshot from published, independently reviewed native shards.
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {copyFileSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {gunzipSync,gzipSync} from 'node:zlib'
import {createAnalysisValidator,hasCompleteSource} from '../../../lib/check-analysis.mjs'
import {encodeGraph,renderGraph} from '../../../strategies/distilbert/graph.mjs'

const [base,dataset,revision,out]=process.argv.slice(2)
if(!out)throw Error('Expected BASELINE DATASET COMMIT NEW_OUTPUT')
const root=fileURLToPath(new URL('../../../',import.meta.url))
const knowledgeDir=resolve(process.env.SOP_KNOWLEDGE_DIR ?? join(root,'../sop-knowledge-worlds'))
const validate=await createAnalysisValidator({knowledgeDir})
const {parse}=await import(pathToFileURL(join(knowledgeDir,'tools/sopworld/sopworld.mjs')))
const git=(dir,...args)=>execFileSync('git',['-C',dir,...args],{maxBuffer:64*1024*1024})
const sha=x=>createHash('sha256').update(x).digest('hex')
const lines=bytes=>bytes.toString().trim().split('\n').filter(Boolean).map(JSON.parse)
const unpack=p=>lines(gunzipSync(readFileSync(p)))
const pinned=git(dataset,'rev-parse','--verify',revision+'^{commit}').toString().trim()
const train=unpack(join(base,'train.jsonl.gz'))
const byText=new Map(train.map(row=>[row.text,row]))
const deny=new Set(JSON.parse(gunzipSync(readFileSync(join(root,'tests/benchmark/next-evaluation/reserved-exact-texts.json.gz')))))
for(const file of [join(base,'dev.jsonl.gz'),join(base,'study.jsonl.gz'),
  join(root,'eval-results/2026-11-26-neuro-selector-proposal-pools/diagnostic/sources.jsonl.gz')]){
  for(const row of unpack(file))deny.add(sha(row.text))
}
if(byText.size!==train.length||train.some(row=>deny.has(sha(row.text))))throw Error('Invalid baseline split')
const decisions=new Map()
for(const filename of git(root,'ls-files','eval-results/**/candidate-decisions.jsonl.gz').toString().trim().split('\n')){
  const path=join(root,filename)
  decisions.set(sha(readFileSync(path)),path)
}
const voteCache=new Map()
function confirm(text,{sop,review}){
  const identity=sha(JSON.stringify([text,sop]))
  if(identity!==review.identity||!decisions.has(review.auditSha256))throw Error('Unverified evidence for '+review.sourceId)
  if(!voteCache.has(review.auditSha256)){
    voteCache.set(review.auditSha256,new Map(unpack(decisions.get(review.auditSha256)).map(row=>[row.fingerprint,row])))
  }
  const vote=voteCache.get(review.auditSha256).get(identity)
  if(vote?.grade!==8||vote.audit&&vote.audit.grade!==8||
    [vote.primary,vote.independent,vote.audit].filter(d=>d?.grade===8).length<2)throw Error('Missing approval for '+review.sourceId)
}
const observed=new Set(),calibration=[],alternatives=[]
const stats={dataset:pinned,base:byText.size,protected:0,unanchorable:0,overlapping:0,added:0,calibration:0,shards:0}
const shardDir='annotations/nlu/v1/batches'
for(const path of git(dataset,'ls-tree','-r','--name-only',pinned,'--',shardDir).toString().trim().split('\n').filter(p=>p.endsWith('.jsonl'))){
  stats.shards++
  for(const {text,readings} of lines(git(dataset,'show',pinned+':'+path))){
    if(observed.has(text))throw Error('Duplicate published source in '+path)
    observed.add(text)
    if(deny.has(sha(text))){stats.protected++;continue}
    const encoded=[]
    for(const reading of readings){
      confirm(text,reading)
      const check=validate(text,reading.sop,{alignSource:true})
      if(!hasCompleteSource(check))throw Error('Published graph failed current static gate in '+path)
      try{
        const graph=encodeGraph(text,reading.sop,parse,check)
        if(!hasCompleteSource(validate(text,renderGraph(text,graph.tokens,graph.nodes))))throw Error('Graph round trip failed')
        encoded.push(graph)
      }catch(error){
        if(error.message!=='Unanchored graph component')throw error
        stats.unanchorable++
      }
    }
    if(!encoded.length)continue
    const previous=byText.get(text)
    const id=previous?.id ?? 'native-'+sha(text)
    const record={id,text,...encoded[0]}
    const isCalibration=!previous && parseInt(sha('curated-calibration-v1\0'+text).slice(0,8),16)%20===0
    if(isCalibration){calibration.push(record);stats.calibration++;continue}
    if(previous)stats.overlapping++
    else stats.added++
    byText.set(text,record)
    if(encoded.length>1)alternatives.push({id,text,graphs:encoded.map(g=>g.nodes)})
  }
}
mkdirSync(out)
const packed=(name,rows)=>{
  const bytes=gzipSync(rows.map(row=>JSON.stringify(row)+'\n').join(''))
  writeFileSync(join(out,name),bytes,{flag:'wx'})
  return {rows:rows.length,sha256:sha(bytes)}
}
stats.train=packed('train.jsonl.gz',[...byText.values()])
stats.nativeCalibration=packed('curated-calibration.jsonl.gz',calibration)
stats.nativeAlternatives=packed('alternatives.jsonl.gz',alternatives)
for(const name of ['dev','study']){
  const filename=name+'.jsonl.gz'
  copyFileSync(join(base,filename),join(out,filename))
  stats[name+'Sha256']=sha(readFileSync(join(out,filename)))
}
stats.baseTrainSha256=sha(readFileSync(join(base,'train.jsonl.gz')))
writeFileSync(join(out,'manifest.json'),JSON.stringify(stats,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(stats))
