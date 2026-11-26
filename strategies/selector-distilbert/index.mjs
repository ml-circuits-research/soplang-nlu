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

async function open({knowledgeDir=process.env.SOP_KNOWLEDGE_DIR,graphOptions={},...options}={}){
  const {parse}=await import(pathToFileURL(join(resolve(knowledgeDir),'tools/sopworld/sopworld.mjs')))
  const selector=await createReader({strategy:neuroSelector,knowledgeDir,...options})
  let graph
  try{
    graph=await createReader({strategy:distilBert,knowledgeDir,...graphOptions})
  }catch(error){await selector.close();throw error}
  async function paired(text){
    const [base,extra]=await Promise.all([selector.propose(text),graph.propose(text)])
    if(base.error||extra.error)throw Error(base.error||extra.error)
    return {base:base.candidates,extra:extra.candidates,combined:combineReadings(base.candidates,extra.candidates,parse)}
  }
  return {paired,async analyse(text){
    const {combined}=await paired(text)
    return {analyses:combined.map(({sop})=>({sop}))}
  },close:()=>Promise.all([selector.close(),graph.close()])}
}
export const selectorDistilBert={name:'selector-distilbert',open}
