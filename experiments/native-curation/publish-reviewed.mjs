// Publish a new independently reviewed shard. Preserve pre-existing references
// and report any rows needing a separate, evidence-backed reconciliation.
import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {basename,join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {gunzipSync} from 'node:zlib'
import {createAnalysisValidator,hasCompleteSource} from '../../lib/check-analysis.mjs'
import {datasetRevision,readCommittedRows} from '../../tests/benchmark/train-split.mjs'
import {readNativeReferences} from '../../tests/benchmark/native-references.mjs'

const [dataset,archive,approvedFile,decisionsFile,shard,sourceRevision,curator]=process.argv.slice(2)
if(!curator||!/^[-a-z0-9]+$/u.test(shard))throw Error('Expected DATASET ARCHIVE APPROVED DECISIONS SHARD SOURCE_REVISION CURATOR')
const root=fileURLToPath(new URL('../../',import.meta.url))
const sha=value=>createHash('sha256').update(value).digest('hex')
const lines=path=>gunzipSync(readFileSync(path)).toString().trim().split('\n').filter(Boolean).map(JSON.parse)
const entries=lines(approvedFile)
const decisions=new Map(lines(decisionsFile).map(d=>[d.fingerprint,d]))
const auditSha256=sha(readFileSync(decisionsFile))
const revision=datasetRevision(dataset,sourceRevision)
const current=datasetRevision(dataset)
const git=(...args)=>execFileSync('git',['-C',dataset,...args],{encoding:'utf8'})
if(git('status','--porcelain','--','annotations/nlu/v1').trim())throw Error('Pending native annotation changes; finish their commit before publishing.')
const texts=new Set(entries.map(r=>r.text))
const original=new Map()
for await(const row of readCommittedRows(dataset,revision))if(texts.has(row.text))original.set(row.id,row.text)
const previous=new Set(readNativeReferences(dataset,current,[...texts]).map(r=>r.text))
const reserved=new Set(JSON.parse(gunzipSync(readFileSync(join(root,'tests/benchmark/next-evaluation/reserved-exact-texts.json.gz')))))
const validate=await createAnalysisValidator({knowledgeDir:resolve(process.env.SOP_KNOWLEDGE_DIR ?? join(root,'../sop-knowledge-worlds'))})
const grouped=new Map()
for(const {id,text,sop} of entries){
  if(typeof sop!=='string'||original.get(id)!==text||reserved.has(sha(text)))throw Error('Unverified or reserved source at '+id)
  const identity=sha(JSON.stringify([text,sop]))
  const decision=decisions.get(identity)
  if(decision?.grade!==8||decision.audit&&decision.audit.grade!==8||
     [decision.primary,decision.independent,decision.audit].filter(d=>d?.grade===8).length<2)continue
  if(!hasCompleteSource(validate(text,sop)))throw Error('Invalid or incomplete SOP at '+id)
  if(previous.has(text))continue
  const record=grouped.get(text) ?? {text,readings:[]}
  if(!record.readings.some(r=>r.sop===sop)){
    if(record.readings.length>=2)throw Error('Curator selected over two readings for '+id)
    record.readings.push({sop,engines:[curator],review:{run:basename(archive),sourceRevision:revision,sourceId:id,identity,auditSha256}})
  }
  grouped.set(text,record)
}
const directory=join(dataset,'annotations/nlu/v1/batches')
mkdirSync(directory,{recursive:true})
if(grouped.size){
  const content=[...grouped.values()].sort((a,b)=>a.text<b.text?-1:a.text>b.text?1:0)
  writeFileSync(join(directory,shard+'.jsonl'),content.map(r=>JSON.stringify(r)).join('\n')+'\n',{flag:'wx'})
}
console.log(JSON.stringify({submitted:entries.length,alreadyAnnotated:previous.size,published:grouped.size,auditSha256}))
