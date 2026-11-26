import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createReader} from '../../lib/reader.mjs'
import {hasCompleteSource} from '../../lib/check-analysis.mjs'
import {directedGraph,sameDirectedGraph} from '../../lib/directed-graph.mjs'
import {neuroSelector} from '../neuro-selector/index.mjs'
import {distilBert} from '../distilbert/index.mjs'

export function combineReadings(base,additional,parse,isComplete=c=>hasCompleteSource(c.check)){
  const graphs=base.map(c=>directedGraph(parse(c.sop),'strict'))
  const distinct=additional.find(c=>isComplete(c)&&
    graphs.every(g=>!sameDirectedGraph(g,directedGraph(parse(c.sop),'strict'))))
  return distinct ? [base[0],distinct].filter(Boolean) : base.slice(0,2)
}

export async function pairProviderReadings(text,selector,graph,parse){
  const results=await Promise.allSettled([selector,graph].map(async reader=>reader.propose(text)))
  const errors=[]
  const [base,extra]=results.map((result,index)=>{
    const provider=index===0?'neuro-selector':'distilbert'
    if(result.status==='rejected'){
      errors.push({provider,message:result.reason?.message??String(result.reason)})
      return []
    }
    if(result.value.error)errors.push({provider,message:result.value.error})
    return result.value.candidates
  })
  const combined=combineReadings(base,extra,parse)
  return {base,extra,combined,errors}
}

async function open({knowledgeDir=process.env.SOP_KNOWLEDGE_DIR,graphOptions={},...options}={}){
  const {parse}=await import(pathToFileURL(join(resolve(knowledgeDir),'tools/sopworld/sopworld.mjs')))
  const selector=await createReader({strategy:neuroSelector,knowledgeDir,...options})
  let graph
  try{
    graph=await createReader({strategy:distilBert,knowledgeDir,...graphOptions})
  }catch(error){await selector.close();throw error}
  const paired=text=>pairProviderReadings(text,selector,graph,parse)
  return {paired,async analyse(text){
    const {combined,errors}=await paired(text)
    return {analyses:combined.map(({sop})=>({sop})),...(errors.length?{
      analysisDiagnostics:{providerErrors:errors,
        ...(!combined.length?{error:errors.map(e=>e.provider+': '+e.message).join(', ')}:{})}
    }:{})}
  },close:()=>Promise.all([selector.close(),graph.close()])}
}
export const selectorDistilBert={name:'selector-distilbert',open}
