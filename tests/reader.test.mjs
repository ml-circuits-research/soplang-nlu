import assert from 'node:assert/strict'
import test from 'node:test'
import {createReader} from '../lib/reader.mjs'

test('passes third-party results through without interpreting the text', async () => {
  const candidates = [{sop:'example',confidence:0.8}]
  const strategy = {name:'fixture',open:async () => ({
    propose:async text => ({text,candidates,status:'partial'}),close:async () => {}
  })}
  const reader = await createReader({strategy})
  try {
    assert.ok((await reader.propose({context:[]})).error)
    const result = await reader.propose('Nothing!')
    assert.deepEqual(result,{text:'Nothing!',candidates,status:'partial'})
  } finally {
    await reader.close()
  }
})

import {prolog} from '../strategies/prolog/index.mjs'

test('symbolic Prolog refuses model options before opening the engine', async () => {
  for (const option of [{modelPath:'examples.json'}, {worldsOnly:false}, {model:{examples:[]}}]) {
    await assert.rejects(createReader({strategy:prolog,...option}), /Unsupported symbolic Prolog options/)
  }
})

test('dispatches to the native analysis path and never synthesizes a fallback reading', async () => {
  const source = 'Echo!'
  const sop = '@c nlu.clause form=fragment unresolved="Echo" terminator="!"'
  let called = false
  const strategy = {name: 'native', open: async () => ({
    analyse(text) {
      assert.equal(text, source)
      called = true
      return {analyses: [{sop}], analysisDiagnostics: {solver: 'fixture'}}
    },
    propose() { throw Error('Legacy generator invoked during native inference') },
    close() {}
  })}
  const reader = await createReader({strategy})
  try {
    const result = await reader.propose(source)
    assert.ok(called)
    assert.deepEqual(result.candidates.map(candidate => candidate.sop), [sop])
    assert.equal(result.legacy, undefined)
  } finally { await reader.close() }
})

test('retains a rejected native circuit with its actual source failure', {skip: !process.env.SOP_KNOWLEDGE_DIR}, async () => {
  const knowledgeDir = process.env.SOP_KNOWLEDGE_DIR
  const sop = '@c nlu.clause form=imperative predicate="invented"'
  const strategy = {name:'fixture',open:async () => ({
    analyse:async () => ({analyses:[{sop}]}),close:async () => {}
  })}
  const reader = await createReader({strategy,knowledgeDir})
  try {
    const result = await reader.propose('Move')
    assert.deepEqual(result.candidates, [])
    assert.equal(result.rejected[0].sop,sop)
    assert.equal(result.rejected[0].check.sourceValid,false)
  } finally { await reader.close() }
})
