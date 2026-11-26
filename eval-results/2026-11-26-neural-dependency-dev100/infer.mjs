import {openDependencies} from '../../strategies/neural-dependencies/index.mjs'
import {writeFileSync,readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {performance} from 'node:perf_hooks'
const [input,out,...models]=process.argv.slice(2)
const hash = input => createHash('sha256').update(input).digest('hex')
const bytes=readFileSync(input)
const rows=JSON.parse(gunzipSync(bytes))
const results=await Promise.all(models.map(async model=>{
 const start=performance.now()
 const parser=await openDependencies({python:process.env.SOP_NLU_SYNTAX_PYTHON || 'python3',model})
 const startupMs=performance.now()-start
 const predictions=[]
 try {
  for(const {id,text} of rows) predictions.push({id,text,tokens:await parser.parse(text)})
 } finally { await parser.close() }
 return {model,metadata:parser.metadata,startupMs,wallMs:performance.now()-start,predictions}
}))
const groups=new Map()
for(const [engine,{predictions}] of results.entries()) for(const row of predictions){
 const edges=row.tokens.map(({i,text,pos,tag,dep,head})=>[i,text,pos,tag,dep,head])
 const key=hash(JSON.stringify([row.text,edges]))
 const packet=groups.get(key) ?? {key,text:row.text,edges,memberships:[]}
 packet.memberships.push({engine,id:row.id})
 groups.set(key,packet)
}
writeFileSync(out,JSON.stringify({sourceSha256:hash(bytes),results,groups:[...groups.values()].sort((a,b)=>a.key.localeCompare(b.key))},null,2)+'\n')
console.log(results.map(({metadata,startupMs,wallMs})=>({model:metadata.model,startupMs,wallMs})),groups.size)
