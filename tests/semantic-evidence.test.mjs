import {test} from 'node:test'
import assert from 'node:assert/strict'
import {alignCircuit} from './benchmark/legacy-evidence.mjs'

test('restricts a repeated quote to its request and refuses embedded word matches', () => {
  const wires = [
    {id:'r2',type:'w.request.request',attrs:{words:['"move it"']}},
    {id:'l',type:'w.request.lookup',attrs:{request:['$r2'], words:['it']}},
    {id:'x',type:'w.request.lookup',attrs:{words:['id']}}
  ]
  const evidence = alignCircuit('paint it then move it to midtown',wires)
  assert.deepEqual(evidence.find(e=>e.wire==='l').ranges,[{start:19,end:21}])
  assert.deepEqual(evidence.find(e=>e.wire==='x').ranges,[])
})
