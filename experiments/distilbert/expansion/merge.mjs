// Keep the entire first development and study splits unchanged. Add verified
// training rows once per exact source, with their source and decision digests.
import {createHash} from 'node:crypto'
import {copyFileSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {gunzipSync,gzipSync} from 'node:zlib'
import {createAnalysisValidator,hasCompleteSource} from '../../../lib/check-analysis.mjs'
import {encodeGraph,renderGraph} from '../../../strategies/distilbert/graph.mjs'
const [baseline,extra,out,hard]=process.argv.slice(2)
if(!out)throw Error('Expected BASELINE EXPANSION OUTPUT [HARD_TEACHER_DIR]')
const root=fileURLToPath(new URL('../../../',import.meta.url))
const knowledgeDir=resolve(process.env.SOP_KNOWLEDGE_DIR ?? join(root,'../sop-knowledge-worlds'))
const validate=await createAnalysisValidator({knowledgeDir})
const {parse}=await import(pathToFileURL(join(knowledgeDir,'tools/sopworld/sopworld.mjs')))
const sha=v=>createHash('sha256').update(v).digest('hex')
const rows=path=>gunzipSync(readFileSync(path)).toString().trim().split('\n').filter(Boolean).map(JSON.parse)
const data=rows(join(baseline,'train.jsonl.gz'))
const seen=new Set(data.map(x=>x.text))
const seenIds=new Set()
const denied=new Set(JSON.parse(gunzipSync(readFileSync(join(root,'tests/benchmark/next-evaluation/reserved-exact-texts.json.gz')))))
for(const file of [join(baseline,'dev.jsonl.gz'),join(baseline,'study.jsonl.gz'),
  join(root,'eval-results/2026-11-26-neuro-selector-proposal-pools/diagnostic/sources.jsonl.gz')])
  for(const row of rows(file))denied.add(sha(row.text))
const origin=new Map(rows(join(extra,'sources.jsonl.gz')).map(r=>[r.id,r.text]))
const manifest={baseTrain:data.length,inputs:[],acceptedAdded:0,identifierAliases:[]}
// Row ordinals can be reused by distinct texts across dataset revisions.
// Keep the labels and make only the internal training identifier unique.
function reserveId(id,text,origin){
  let result=id
  if(seenIds.has(id)){
    const sourceSha256=sha(text)
    result=id+'@'+sourceSha256
    if(seenIds.has(result))throw Error('Repeated source alias across training: '+id)
    manifest.identifierAliases.push({id,trainingId:result,sourceSha256,origin})
  }
  seenIds.add(result)
  return result
}
for(const row of data)row.id=reserveId(row.id,row.text,'baseline')
for(const source of [extra,...hard?[hard]:[]]){
  const packet=join(source,'pool.jsonl.gz'),proof=join(source,'review/candidate-decisions.jsonl.gz')
  const byPair=new Map(rows(proof).map(d=>[d.fingerprint,d]))
  let n=0
  const unanchored=[]
  for(const {id,text,candidates} of rows(packet)){
    if(origin.get(id)!==text || denied.has(sha(text)))throw Error('Unverified or reserved input: '+id)
    if(seen.has(text))continue
    for(const {sop,eligible} of candidates){
      if(!eligible)continue
      const v=byPair.get(sha(JSON.stringify([text,sop])))
      if(!v)throw Error('Missing exact judgment for '+id)
      if(v.grade!==8 || v.audit&&v.audit.grade!==8 || [v.primary,v.independent,v.audit].filter(x=>x?.grade===8).length<2)continue
      const check=validate(text,sop,{alignSource:true})
      if(!hasCompleteSource(check))throw Error('Invalid label at '+id)
      let graph
      try {
        graph=encodeGraph(text,sop,parse,check)
      } catch (error) {
        if(error.message!=='Unanchored graph component')throw error
        unanchored.push({id,circuitSha256:sha(sop)})
        continue
      }
      if(!hasCompleteSource(validate(text,renderGraph(text,graph.tokens,graph.nodes))))throw Error('Invalid round trip')
      data.push({id:reserveId(id,text,source===extra?'expansion':'hard'),text,...graph})
      seen.add(text)
      n++
      break
    }
  }
  manifest.inputs.push({poolSha256:sha(readFileSync(packet)),decisionsSha256:sha(readFileSync(proof)),added:n,unanchored})
  manifest.acceptedAdded+=n
}
if(new Set(data.map(r=>r.id)).size!==data.length)throw Error('Repeated source ID across training')
mkdirSync(out)
const bytes=gzipSync(data.map(r=>JSON.stringify(r)).join('\n')+'\n')
writeFileSync(join(out,'train.jsonl.gz'),bytes,{flag:'wx'})
for(const name of ['dev','study'])copyFileSync(join(baseline,name+'.jsonl.gz'),join(out,name+'.jsonl.gz'))
Object.assign(manifest,{trainRows:data.length,trainSha256:sha(bytes),devSha256:sha(readFileSync(join(out,'dev.jsonl.gz'))),
  studySha256:sha(readFileSync(join(out,'study.jsonl.gz'))),overlap:0})
writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n')
console.log(JSON.stringify(manifest))
