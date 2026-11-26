import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {gzipSync,gunzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {createReader} from '../../lib/reader.mjs'
import {spacyDirect} from '../../strategies/spacy-direct/index.mjs'
import {createRecordWriter} from '../../tests/benchmark/record.mjs'
const [input,out]=process.argv.slice(2)
const load=n=>JSON.parse(gunzipSync(readFileSync(join(input,n+'.json.gz'))))
const teacher=load('corrected-graphs').filter(r=>r.split==='validation')
const base=load('teacher-graphs')
const rawById=new Map(base.graphs.map(r=>[r.id,r]))
const knowledgeDir=process.env.SOP_KNOWLEDGE_DIR ?? '../sop-knowledge-worlds'
let current
const reader=await createReader({strategy:spacyDirect,knowledgeDir,syntaxModel:{async open(){return {metadata:base.model,parse:async t=>{if(t!==current.text)throw Error('source mismatch');return current.tokens},close:async()=>{}}}}})
const record=await createRecordWriter(knowledgeDir)
const sample=[], predictions=[]
for (const corrected of teacher){
 for(const side of ['raw','corrected']){
   current=side==='raw'?rawById.get(corrected.id):corrected
   const id=corrected.id+'::'+side
   sample.push({id,text:current.text,references:[]})
   predictions.push({id,...record(current.text,await reader.propose(current.text))})
 }
}
await reader.close()
mkdirSync(out,{recursive:true})
const bytes=gzipSync(JSON.stringify(sample))
writeFileSync(join(out,'environment.json'),JSON.stringify({sample:sample.length,seed:'teacher-validation',revision:'38ae0b563db2392bd7bfc5d11f6c2e9f4a0339bf',libraryRevision:'0b955a1',sampleSha256:createHash('sha256').update(bytes).digest('hex'),strategies:['spacy-direct']}))
writeFileSync(join(out,'sample.json.gz'),bytes)
writeFileSync(join(out,'spacy-direct.json'),JSON.stringify({timed:false,mode:'cached graph review diagnostic'}))
writeFileSync(join(out,'spacy-direct.jsonl.gz'),gzipSync(predictions.map(r=>JSON.stringify(r)).join('\n')+'\n'))
