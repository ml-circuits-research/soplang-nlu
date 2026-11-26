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
