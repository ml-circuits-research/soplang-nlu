import assert from 'node:assert/strict'
import test from 'node:test'
import {openDependencies} from '../strategies/neural-dependencies/index.mjs'

test('alternate dependency providers receive model options and retain exact token evidence', async () => {
  let closed = false
  const token = {i:0,start:0,end:2,text:'🙂',head:0,pos:'INTJ',tag:'UH',dep:'ROOT',lemma:'🙂'}
  const syntaxModel = {async open(options) {
    assert.deepEqual(options,{model:'fixture'})
    return {metadata:{version:'one'},parse:async () => [token],close:async () => {closed = true}}
  }}
  const engine = await openDependencies({syntaxModel,model:'fixture'})
  try {
    assert.deepEqual(await engine.parse('🙂'),[token])
    await assert.rejects(engine.parse('x'),/Invalid dependency token/)
  } finally {await engine.close()}
  assert.equal(closed,true)
})
