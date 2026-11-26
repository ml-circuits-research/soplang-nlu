// Compare public graph structure with available accepted alternatives on the
// study texts. Whole-reading acceptance is measured separately by blind review.
import {readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {gunzipSync} from 'node:zlib'
import {createAnalysisValidator} from '../../lib/check-analysis.mjs'
import {encodeGraph} from '../../strategies/distilbert/graph.mjs'

const [prediction,output]=process.argv.slice(2)
if(!output)throw Error('Expected DISTILBERT_POOL_JSONL_GZ OUTPUT_JSON')
const root=fileURLToPath(new URL('../../',import.meta.url))
const archives=join(root,'eval-results')
const dir=join(archives,'2026-11-26-property-result-projector-pilot/validation')
const readRows=p=>gunzipSync(readFileSync(p)).toString().trim().split('\n').filter(Boolean).map(JSON.parse)
const known=readRows(join(dir,'baseline-pool.jsonl.gz'))
const accepted=new Set(readRows(join(dir,'votes.jsonl.gz')).filter(v=>v.accepted).map(v=>JSON.stringify([v.id,v.sop])))
const study=Object.fromEntries(known.map(r=>[r.id,r]))
const knowledgeDir=resolve(process.env.SOP_KNOWLEDGE_DIR ?? join(root,'../sop-knowledge-worlds'))
const {parse}=await import(pathToFileURL(join(knowledgeDir,'tools/sopworld/sopworld.mjs')))
const validate=await createAnalysisValidator({knowledgeDir})
const labels=['clauseAnchors','typedWireAnchors','roleSpans','directedEdges','atomValues']
function facts(text,sop) {
  const out=Object.fromEntries(labels.map(k=>[k,new Map()]))
  function add(k,...parts){
    const key=JSON.stringify(parts)
    out[k].set(key,(out[k].get(key) ?? 0)+1)
  }
  if (!sop)return out
  const check=validate(text,sop,{alignSource:true})
  if(!check.valid)return out
  const {nodes}=encodeGraph(text,sop,parse,check)
  for(const {type,anchor,attrs} of nodes){
    add('typedWireAnchors',type,anchor)
    if(type==='nlu.clause')add('clauseAnchors',anchor)
    for(const attr of attrs) {
      if(attr.start!==undefined)add('roleSpans',type,anchor,attr.key,attr.start,attr.end)
      else if(attr.target!==undefined){
        const target=nodes[attr.target]
        add('directedEdges',type,anchor,attr.key,target.type,target.anchor)
      } else add('atomValues',type,anchor,attr.key,attr.atom)
    }
  }
  return out
}
function counts(predicted,reference){
  const sum=arr=>[...arr].reduce((a,b)=>a+b,0)
  return {hits:sum([...predicted].map(([f,n])=>Math.min(n,reference.get(f) ?? 0))),
    predicted:sum(predicted.values()),expected:sum(reference.values())}
}
function metrics({hits,predicted,expected}){
  return {hits,predicted,expected,precision:predicted ? hits/predicted:null,recall:expected ? hits/expected:null,
    f1:predicted+expected ? 2*hits/(predicted+expected):null}
}
const knownFacts=new Map()
for(const r of known) {
  const sops=[...new Set(r.candidates.map(c=>c.sop))].filter(s=>accepted.has(JSON.stringify([r.id,s])))
  if(sops.length)knownFacts.set(r.id,sops.map(s=>facts(r.text,s)))
}
const summaries={}
for(const [name,path] of [['spacy-direct',join(dir,'baseline-direct.jsonl.gz')],['distilbert',prediction]]) {
  const rows=readRows(path)
  if(rows.length!==known.length||new Set(rows.map(r=>r.id)).size!==known.length)throw Error('Incomplete study')
  const totals=Object.fromEntries(labels.map(k=>[k,{hits:0,predicted:0,expected:0}]))
  for(const r of rows){
    if(!study[r.id]||r.text!==study[r.id].text)throw Error('Study source mismatch')
    const alternatives=knownFacts.get(r.id)
    if(!alternatives)continue
    if(r.candidates.length>1)throw Error('Expected a singleton public strategy')
    const result=facts(r.text,r.candidates[0]?.sop)
    let best,bestScore=-1
    for(const alt of alternatives) {
      const scores=Object.fromEntries(labels.map(k=>[k,counts(result[k],alt[k])]))
      const v=Object.values(scores)
      const denominator=v.reduce((n,x)=>n+x.predicted+x.expected,0)
      const score=v.reduce((n,x)=>n+2*x.hits,0)/Math.max(denominator,1)
      if(score>bestScore){best=scores;bestScore=score}
    }
    for(const key of labels)for(const field of ['hits','predicted','expected'])totals[key][field]+=best[key][field]
  }
  summaries[name]=Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,metrics(v)]))
}
writeFileSync(output,JSON.stringify({studyRows:known.length,rowsWithAnAcceptedReference:knownFacts.size,
  reference:'Closest available accepted four-provider graph, selected once per source by combined fact F1.',
  summaries},null,2)+'\n',{flag:'wx'})
