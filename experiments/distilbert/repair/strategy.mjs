// Experimental two-reading strategy. No supervision or stored source lookup at runtime.
import {resolve,join} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createReader} from '../../../lib/reader.mjs'
import {createAnalysisValidator,hasCompleteSource} from '../../../lib/check-analysis.mjs'
import {neuroSelector} from '../../../strategies/neuro-selector/index.mjs'
import {openGraphWorker} from '../../../strategies/distilbert/index.mjs'
import {encodeGraph} from '../../../strategies/distilbert/graph.mjs'
import {directedGraph,sameDirectedGraph} from '../../../lib/directed-graph.mjs'

async function open({knowledgeDir,python,modelPath,device='cpu',...options}) {
  const {parse}=await import(pathToFileURL(join(resolve(knowledgeDir),'tools/sopworld/sopworld.mjs')))
  const validate=await createAnalysisValidator({knowledgeDir})
  const baseline=await createReader({strategy:neuroSelector,knowledgeDir,...options})
  let editor
  try {
    editor=await openGraphWorker({python,modelPath,device,workerPath:fileURLToPath(new URL('./infer.py',import.meta.url))},{modelFlag:null})
  } catch(error) {
    await baseline.close()
    throw error
  }
  async function analyse(text) {
    const original=await baseline.propose(text)
    if(original.error) throw Error(original.error)
    const [first]=original.candidates
    let draftNodes=[]
    if(first) {
      try {
        draftNodes=encodeGraph(text,first.sop,parse,validate(text,first.sop,{alignSource:true})).nodes
      } catch(error) {
        if(error.message!=='Unanchored graph component') throw error
      }
    }
    const edit=await editor.analyse(text,draftNodes)
    const sop=edit.analyses[0]?.sop
    if(edit.analysisDiagnostics.status==='error') throw Error(edit.analysisDiagnostics.error)
    let analyses=original.candidates.map(({sop})=>({sop}))
    let selected=false
    if(sop && hasCompleteSource(validate(text,sop))) {
      const graph=directedGraph(parse(sop),'strict')
      if(!analyses.some(item=>sameDirectedGraph(graph,directedGraph(parse(item.sop),'strict')))) {
        analyses=first && hasCompleteSource(first.check) ? [analyses[0],{sop}] : [{sop},...analyses].slice(0,2)
        selected=true
      }
    }
    return {analyses,analysisDiagnostics:{...edit.analysisDiagnostics,projector:'selector-repair',selected}}
  }
  return {analyse,close:()=>Promise.all([editor.close(),baseline.close()])}
}
export const selectorRepair={name:'selector-repair',open}
