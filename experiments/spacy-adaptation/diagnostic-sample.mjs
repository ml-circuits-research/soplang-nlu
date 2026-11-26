import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {gunzipSync,gzipSync} from 'node:zlib'
import {join} from 'node:path'

const [selection,historical,output] = process.argv.slice(2)
if (!output) throw Error('Usage: diagnostic-sample.mjs SELECTION_JSON HISTORICAL_RUN OUTPUT')
const lock=JSON.parse(readFileSync(selection))
const all=JSON.parse(gunzipSync(readFileSync(join(historical,'sample.json.gz'))))
const byId=new Map(all.map(row=>[row.id,row]))
const hash=x=>createHash('sha256').update(x).digest('hex')
const rows=lock.rows.map(({id,sha256})=>{
  const row=byId.get(id)
  if (!row||hash(lock.seed+'\0'+id)!==sha256) throw Error('Diagnostic rank digest mismatch '+id)
  return {id,text:row.text,references:[]}
})
if (rows.length!==250 || new Set(rows.map(row=>row.id)).size!==250) throw Error('Diagnostic selection differs')
const historicalEnvironment=JSON.parse(readFileSync(join(historical,'environment.json')))
const bytes=gzipSync(JSON.stringify(rows))
mkdirSync(output)
writeFileSync(join(output,'sample.json.gz'),bytes,{flag:'wx'})
writeFileSync(join(output,'environment.json'),JSON.stringify({
  revision:historicalEnvironment.revision,seed:lock.seed,population:lock.eligiblePopulation,sample:rows.length,
  sampleSha256:hash(bytes),nativeReferenceRevision:historicalEnvironment.revision,nativeReferenceTexts:0,
  nativeReferenceSha256:hash('[]')
},null,2)+'\n',{flag:'wx'})
