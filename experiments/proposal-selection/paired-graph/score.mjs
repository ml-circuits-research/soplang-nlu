import {readFileSync,writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {gunzipSync} from 'node:zlib'
const [dir]=process.argv.slice(2)
const read=name=>gunzipSync(readFileSync(join(dir,name+'.jsonl.gz'))).toString().trim().split('\n').filter(Boolean).map(JSON.parse)
const voteKey=(id,sop)=>JSON.stringify([id,sop])
const votes=new Map(read('votes').map(v=>[voteKey(v.id,v.sop),v.accepted]))
const stats=Object.fromEntries(['base','extra','combined'].map(f=>[f,{none:0,mixed:0,all:0,any:0}]))
const changes={gained:[],lost:[]}
const rows=read('pool')
for(const row of rows){
  const passed={}
  for(const family of Object.keys(stats)){
    const candidates=row.candidates.filter(c=>c.family===family)
    if(candidates.length>2)throw Error('Public budget exceeded')
    const n=candidates.filter(c=>{
      if(!c.eligible)return false
      const v=votes.get(voteKey(row.id,c.sop))
      if(typeof v!=='boolean')throw Error('Missing independent vote for '+row.id)
      return v
    }).length
    passed[family]=n>0
    stats[family].any+=Number(n>0)
    stats[family][!n?'none':n===candidates.length?'all':'mixed']++
  }
  if(passed.combined&&!passed.base)changes.gained.push(row.id)
  if(!passed.combined&&passed.base)changes.lost.push(row.id)
}
writeFileSync(join(dir,'comparison.json'),JSON.stringify({texts:rows.length,stats,changes},null,2)+'\n',{flag:'wx'})
