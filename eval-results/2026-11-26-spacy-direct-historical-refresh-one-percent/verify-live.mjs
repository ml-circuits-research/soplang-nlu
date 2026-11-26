import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
const [run,baseline,preview] = process.argv.slice(2)
const bytes=(dir,file)=>readFileSync(join(dir,file))
const load=(dir,file)=>gunzipSync(bytes(dir,file)).toString().trim().split('\n').map(JSON.parse)
const digest = v=>createHash('sha256').update(v).digest('hex')
const sample=bytes(run,'sample.json.gz')
if (!sample.equals(bytes(baseline,'sample.json.gz'))) throw Error('Frozen sample has changed')
const texts=JSON.parse(gunzipSync(sample))
const graph=load(run,'model-evidence.jsonl.gz')
const priorGraph=load(baseline,'model-evidence.jsonl.gz')
const rows=load(run,'spacy-direct.jsonl.gz')
if (rows.length!==1861 || graph.length!==texts.length || rows.length!==texts.length || graph.length!==priorGraph.length ||
    !texts.every(({id,text},i)=>rows[i].id===id && rows[i].candidates.length===1 && graph[i].id===id &&
      graph[i].sourceSha256===digest(text) && ['id','sourceSha256','graphSha256'].every(key=>graph[i][key]===priorGraph[i][key]))) {
  throw Error('Live inputs, graphs, or returned candidate cardinality differ')
}
if (preview) {
  const rawGraph=load(preview,'model-evidence.jsonl.gz')
  const earlier=load(preview,'spacy-direct.jsonl.gz')
  if (rows.length!==earlier.length || graph.length!==rawGraph.length || !rows.every((row,i)=>
    row.id===earlier[i].id && JSON.stringify(row.candidates)===JSON.stringify(earlier[i].candidates) &&
    graph[i].graphSha256===rawGraph[i].graphSha256)) {
    throw Error('Early review replay disagrees with public CLI')
  }
}
console.log('Verified '+rows.length+' exact rows and dependency hashes for '+run)
