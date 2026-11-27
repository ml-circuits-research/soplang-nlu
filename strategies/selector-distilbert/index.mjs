// selector-distilbert: the circuit of the neuro-selector, read once more against the circuit of
// the DistilBERT strategy. Both write the `syntax` schema; no knowledge repository is read.
//
// While a strategy could return two readings, this one returned the selector's first reading and
// a different DistilBERT graph beside it. A strategy now returns one circuit, so the two are
// combined in the only way one circuit can hold two readings (Rule 2 of the schema):
//   - the circuit of the selector is the circuit returned;
//   - where the DistilBERT circuit starts one of its phrases at another wire of the same clause,
//     that relation is started at the clause and marked attachment=ambiguous;
//   - when the selector has no valid circuit, the DistilBERT circuit is returned.
import {createReader} from '../../lib/reader.mjs'
import {neuroSelector} from '../neuro-selector/index.mjs'
import {settleAttachments} from '../neuro-selector/attachments.mjs'
import {distilBert} from '../distilbert/index.mjs'

/**
 * One circuit from the two providers.
 * @param selector, graph readers of the two strategies ({propose(text)})
 * @returns {sop, origin, errors}: sop is null when neither gave a valid circuit
 */
export async function pairCircuits(text,selector,graph){
  const results=await Promise.allSettled([selector,graph].map(async reader=>reader.propose(text)))
  const errors=[]
  const [base,extra]=results.map((result,index)=>{
    const provider=index===0?'neuro-selector':'distilbert'
    if(result.status==='rejected'){
      errors.push({provider,message:result.reason?.message??String(result.reason)})
      return null
    }
    const circuit=result.value.candidates?.[0]?.sop
    if(typeof circuit!=='string')errors.push({provider,message:result.value.error??'The strategy returned no circuit.'})
    return typeof circuit==='string'?circuit:null
  })
  if(base&&extra)return {sop:settleAttachments(text,base,[base,extra]),origin:'neuro-selector',errors}
  return {sop:base??extra,origin:base?'neuro-selector':extra?'distilbert':null,errors}
}

/**
 * `open` takes the options of the neuro-selector, and `graphOptions` for the DistilBERT strategy
 * ({python, modelPath, device}); the environment variables of the two strategies also apply.
 * `analyse(text)` returns {analyses: [{sop, origin}]} with one circuit, or {analyses: [], error}.
 */
async function open({graphOptions={},...options}={}){
  const selector=await createReader({strategy:neuroSelector,...options})
  let graph
  try{
    graph=await createReader({strategy:distilBert,...graphOptions})
  }catch(error){await selector.close();throw error}
  return {async analyse(text){
    const {sop,origin,errors}=await pairCircuits(text,selector,graph)
    const diagnostics=errors.length?{analysisDiagnostics:{providerErrors:errors}}:{}
    if(sop===null)return {analyses:[],error:errors.map(e=>e.provider+': '+e.message).join(' | '),...diagnostics}
    return {analyses:[{sop,origin}],...diagnostics}
  },close:()=>Promise.all([selector.close(),graph.close()])}
}
export const selectorDistilBert={name:'selector-distilbert',schema:'syntax',open}
