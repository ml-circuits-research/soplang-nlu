// Not used by the strategy any more. This is the pairing policy of the time when a strategy
// returned up to two circuits of the old `nlu` schema: the first reading of the selector, and a
// distinct complete DistilBERT graph beside it. It is kept, unchanged, for the experiments that
// replay that policy. A strategy of the `syntax` schema returns one circuit (see index.mjs).
import {hasCompleteSource} from '../../lib/check-analysis.mjs'
import {directedGraph,sameDirectedGraph} from '../../lib/directed-graph.mjs'

function hasDetachedComponent(wires){
  const links=new Map(wires.map(wire=>[wire.id,new Set()]))
  for(const wire of wires){
    for(const value of Object.values(wire.attrs).flat()){
      if(!value.startsWith('$'))continue
      const target=value.slice(1)
      links.get(wire.id).add(target)
      links.get(target)?.add(wire.id)
    }
  }
  const attached=new Set(wires.filter(wire=>wire.type==='nlu.clause').map(wire=>wire.id))
  for(const id of attached)for(const neighbor of links.get(id)??[])attached.add(neighbor)
  return wires.some(wire=>!attached.has(wire.id))
}

export function combineReadings(base,additional,parse,isComplete=c=>hasCompleteSource(c.check)){
  const originals=base.map(c=>parse(c.sop))
  const graphs=originals.map(wires=>directedGraph(wires,'strict'))
  const hasConnectedSecond=base[1]&&isComplete(base[1])&&!hasDetachedComponent(originals[1])
  const distinct=additional.find(candidate=>{
    if(!isComplete(candidate))return false
    const wires=parse(candidate.sop)
    if(hasConnectedSecond&&hasDetachedComponent(wires))return false
    const graph=directedGraph(wires,'strict')
    return graphs.every(g=>!sameDirectedGraph(g,graph))
  })
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
