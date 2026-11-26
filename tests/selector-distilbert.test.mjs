import test from 'node:test'
import assert from 'node:assert/strict'
import {combineReadings,pairProviderReadings} from '../strategies/selector-distilbert/index.mjs'

const parse=sop=>[{id:'n',type:'nlu.clause',attrs:{predicate:[JSON.stringify(sop)]}}]
const candidate={sop:'show',check:{valid:true,coverage:{allAccountedFor:true},sourceGaps:{materialUnresolved:0,materialUncovered:0}}}
const available={async propose(){return {candidates:[candidate]}}}

test('the paired strategy keeps a valid reading when either provider fails',async()=>{
  const unavailable={async propose(){return {candidates:[],error:'unavailable'}}}
  const crashed={async propose(){throw Error('crashed')}}
  const withoutGraph=await pairProviderReadings('show',available,unavailable,parse)
  assert.deepEqual(withoutGraph.combined,[candidate])
  assert.deepEqual(withoutGraph.errors,[{provider:'distilbert',message:'unavailable'}])
  const withoutSelector=await pairProviderReadings('show',crashed,available,parse)
  assert.deepEqual(withoutSelector.combined,[candidate])
  assert.deepEqual(withoutSelector.errors,[{provider:'neuro-selector',message:'crashed'}])
})

test('a detached entity does not displace a complete connected alternative',()=>{
  const second={...candidate,sop:'open'}
  const disconnected={...candidate,sop:'close'}
  const parseWithEntity=sop=>[
    ...parse(sop),
    ...(sop===disconnected.sop?[{id:'e',type:'nlu.entity',attrs:{head:['"chart"']}}]:[])
  ]
  assert.deepEqual(combineReadings([candidate,second],[disconnected],parseWithEntity),[candidate,second])
  assert.deepEqual(combineReadings([candidate],[disconnected],parseWithEntity),[candidate,disconnected])
})
