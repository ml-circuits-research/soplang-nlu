// Reserve a representative training tranche from original texts only.
import {createHash} from 'node:crypto'
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {gunzipSync,gzipSync} from 'node:zlib'
import {readCommittedRows} from '../../../tests/benchmark/train-split.mjs'

const [output,countArgument='6000']=process.argv.slice(2)
const count=Number(countArgument)
if(!output||!Number.isSafeInteger(count)||count<=0)throw Error('Expected OUTPUT [COUNT]')
const root=fileURLToPath(new URL('../../../',import.meta.url))
const held=join(root,'tests/benchmark/next-evaluation')
const protocol=JSON.parse(readFileSync(join(held,'protocol.json')))
const sha=value=>createHash('sha256').update(value).digest('hex')
const excluded=new Set(JSON.parse(gunzipSync(readFileSync(join(held,protocol.reservedExactTextDigests)))))
for(const {file,sha256} of protocol.previouslyExposed){
  const bytes=readFileSync(join(root,file))
  if(sha(bytes)!==sha256)throw Error('Exclusion archive changed')
  for(const row of JSON.parse(gunzipSync(bytes)))excluded.add(sha(row.text))
}
const seed='distilbert-native-expansion-uniform-v1'
const next=[]
const seen=new Set()
const dataset=resolve(process.env.SOP_WORKSPACE ?? join(root,'..'),'webmeet-dataset')
for await(const {id,text} of readCommittedRows(dataset,protocol.datasetRevision)){
  if(!text.trim()||excluded.has(sha(text))||seen.has(text))continue
  seen.add(text)
  next.push({id,text,key:sha(seed+'\0'+id)})
}
next.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0)
if(count>next.length)throw Error('Insufficient eligible texts')
const sample=next.slice(0,count).map(({id,text})=>({id,text}))
mkdirSync(output)
const encoded=gzipSync(JSON.stringify(sample))
writeFileSync(join(output,'sample.json.gz'),encoded,{flag:'wx'})
const manifest={seed,datasetRevision:protocol.datasetRevision,eligibleUnique:next.length,count,
  historicalAndHeldOutExcluded:excluded.size,exactTextOverlap:0,sampleSha256:sha(encoded)}
writeFileSync(join(output,'selection.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(manifest))
