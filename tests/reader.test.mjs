import assert from 'node:assert/strict'
import test from 'node:test'
import {createReader} from '../lib/reader.mjs'

test('preserves native candidates and attaches syntax to the original text', async () => {
  const candidates = [{sop:'example',confidence:0.8}]
  const strategy = {name:'fixture',open:async () => ({
    propose:async text => ({text,candidates,status:'partial'}),close:async () => {}
  })}
  const reader = await createReader({strategy,analyseSyntax:text=>({text})})
  try {
    assert.ok((await reader.propose({context:[]})).error)
    const result = await reader.propose('Nothing!')
    assert.deepEqual(result,{text:'Nothing!',candidates,status:'partial',syntax:{text:'Nothing!'}})
  } finally {
    await reader.close()
  }
})
