import test from 'node:test'
import assert from 'node:assert/strict'
import {measureStrategy} from '../lib/measure-strategy.mjs'

test('times every input including unknown readings and closes the shared reader', async () => {
  let closed = false
  const create = async () => ({
    propose: async text => ({text, candidates: []}),
    close: async () => { closed = true }
  })
  const {timing, latencies, results} = await measureStrategy(create, ['a','b'])
  assert.equal(closed, true)
  assert.deepEqual(results.map(r => r.text), ['a','b'])
  assert.equal(timing.requests, 2)
  assert.equal(timing.p95Ms, Math.max(...latencies))
  assert.ok(timing.totalMs >= timing.proposalMs)
})
