// Pin the source corpus once. Legacy application circuits never appear in a teacher packet.
import {createHash} from 'node:crypto'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {gzipSync,gunzipSync} from 'node:zlib'
import {readCommittedRows} from '../../tests/benchmark/train-split.mjs'
import {readNativeReferences} from '../../tests/benchmark/native-references.mjs'
import {selectorChoices} from '../../strategies/neuro-selector/features.mjs'
import {selectReadings} from '../../strategies/neuro-selector/score.mjs'

const [out,tranche]=process.argv.slice(2)
if (!out||!tranche)throw Error('Expected new inventory and frozen initial tranche directory')
const root=fileURLToPath(new URL('../../',import.meta.url))
const lockDir=join(root,'tests/benchmark/next-evaluation')
const protocol=JSON.parse(readFileSync(join(lockDir,'protocol.json')))
const reserved=new Set(JSON.parse(gunzipSync(readFileSync(join(lockDir,protocol.reservedExactTextDigests)))))
const dataset=resolve(process.env.SOP_WORKSPACE ?? join(root,'..'),'webmeet-dataset')
const hash=text=>createHash('sha256').update(text).digest('hex')
const unzip=path=>gunzipSync(readFileSync(path)).toString()
const lines=path=>unzip(path).trim().split('\n').filter(Boolean).map(JSON.parse)
const prefix=JSON.parse(unzip(join(tranche,'sample.json.gz')))
const priority=new Map(prefix.map((row,i)=>[row.text,i]))
const support=new Map()
const {parse}=await import(pathToFileURL(resolve(process.env.SOP_KNOWLEDGE_DIR ?? join(root,'../sop-knowledge-worlds'),'tools/sopworld/sopworld.mjs')))
const model=JSON.parse(readFileSync(join(root,'strategies/neuro-selector/model.json')))
for(let shard=0;shard<6;shard++){
  const path=join(tranche,'part-'+shard,'pool.jsonl.gz')
  const meta=JSON.parse(readFileSync(path+'.timing.json'))
  const records=lines(path)
  if(meta.rows!==records.length)throw Error('Unsealed tranche')
  for(const row of records){
    const choices=selectorChoices(row.text,row.candidates,parse)
    const picked=selectReadings(choices,model).slice(0,2).map(c=>({sop:choices.candidates[c.index].sop}))
    if(!picked.length && row.candidates.length)picked.push({sop:row.candidates[0].sop,partial:true})
    support.set(row.text,picked)
  }
}
if(support.size!==priority.size)throw Error('Incomplete initial draft selection')
const corpus=[]
const unique=new Set()
let population=0
for await (const {id,text} of readCommittedRows(dataset,protocol.datasetRevision)){
  population++
  if(!text.trim()||unique.has(text))continue
  unique.add(text)
  corpus.push({id,text,priority:priority.get(text) ?? Infinity,key:hash(text)})
}
const historical=readNativeReferences(dataset,protocol.datasetRevision,[...unique])
const existing=new Map(historical.map(r=>[r.text,r.references]))
const first=corpus.filter(r=>!reserved.has(r.key))
first.sort((a,b)=>a.priority-b.priority || a.key.localeCompare(b.key))
const held=corpus.filter(r=>reserved.has(r.key)).sort((a,b)=>a.key.localeCompare(b.key))
if(held.length!==reserved.size)throw Error('Changed prospective holdout')
const groups=[]
mkdirSync(out,{recursive:true})
mkdirSync(join(out,'batches'))
for(const [usage,rows] of [['development',first],['reserved-evaluation',held]]) {
  for(let i=0;i<rows.length;i+=500){
    const number=String(groups.length+1).padStart(6,'0')
    const records=rows.slice(i,i+500).map(({id,text})=>{
      const candidates=[...support.get(text) ?? []]
      for(const sop of existing.get(text) ?? []){
        if(!candidates.some(c=>c.sop===sop))candidates.push({sop,priorNative:true})
      }
      return {id,text,candidates}
    })
    const bytes=gzipSync(records.map(r=>JSON.stringify(r)).join('\n')+'\n')
    const file='batches/'+number+'.jsonl.gz'
    writeFileSync(join(out,file),bytes,{flag:'wx'})
    groups.push({number,usage,file,rows:records.length,withDraft:records.filter(r=>r.candidates.length).length,sha256:hash(bytes)})
  }
}
const manifest={sourceRevision:protocol.datasetRevision,population,uniqueNonemptySources:unique.size,
  reservedExactSources:held.length,batchSize:500,groups}
writeFileSync(join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({population,unique:unique.size,batches:groups.length,first:groups[0],last:groups.at(-1)}))
