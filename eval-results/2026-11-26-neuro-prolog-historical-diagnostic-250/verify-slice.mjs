import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'

const file=name=>readFileSync(new URL(name,import.meta.url))
const plain=name=>gunzipSync(file(name)).toString()
const sha=text=>createHash('sha256').update(text).digest('hex')
const selection=JSON.parse(file('selection.json'))
const sample=JSON.parse(plain('inference/sample.json.gz'))
const evidence=plain('inference/model-evidence.jsonl.gz').trim().split('\n').map(JSON.parse)
const raw=JSON.parse(plain('diagnostic-raw-graphs.json.gz'))
const byId=new Map(raw.predictions.map(row=>[row.id,row]))
const order=selection.rows.map(row=>row.sha256)
if (raw.model.model!=='core_web_trf' || byId.size!==250 ||
    sample.length!==250 || evidence.length!==250 || !order.every((rank,i)=>!i || order[i-1]<rank) ||
    !sample.every(({id,text},i)=>{
      const declared=selection.rows[i]
      const graph=byId.get(id)
      return declared.id===id && declared.sha256===sha(selection.seed+'\0'+id) &&
        graph?.text===text && evidence[i].id===id && evidence[i].sourceSha256===sha(text) &&
        evidence[i].graphSha256===sha(JSON.stringify(graph.tokens))
    })) {
  throw Error('Diagnostic slice identity, rank, or frozen graph mismatch')
}
console.log('Matched every diagnostic source, graph digest and SHA selection rank')
