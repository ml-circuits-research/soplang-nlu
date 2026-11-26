import assert from 'node:assert/strict'
import {test} from 'node:test'
import {setImmediate} from 'node:timers/promises'
import {createZ3Runner} from '../strategies/z3/src/smt/z3-runner.mjs'

test('retains the UTF-8 SMT script until asynchronous WASM evaluation completes', async () => {
  const bytes = new Uint8Array(64 * 1024)
  const pointer = 16
  const submitted = []
  let allocated = 0
  let releases = 0
  const em = {
    HEAPU8: bytes,
    _malloc(size) {
      assert.equal(allocated, 0)
      allocated = size
      return pointer
    },
    _free(received) {
      assert.equal(received, pointer)
      assert.ok(allocated)
      bytes.fill(255, pointer, pointer + allocated)
      allocated = 0
      releases++
    },
    async_call: (fn, ...args) => fn(...args),
    async _async_Z3_eval_smtlib2_string(context, input) {
      assert.equal(context, 1)
      assert.equal(input, pointer)
      await setImmediate()
      assert.ok(allocated)
      assert.equal(bytes[input + allocated - 1], 0)
      const script = new TextDecoder('utf-8', {fatal: true}).decode(bytes.subarray(input, input + allocated - 1))
      submitted.push(script)
      return script.includes('(check-sat)') ? 'sat\n((x true))' : ''
    }
  }
  const runner = await createZ3Runner({module: {init: async () => ({
    Context: class {ptr = 1},
    Z3: {eval_smtlib2_string() { assert.fail('temporary stack string wrapper used') }},
    em
  })}})

  try {
    const body = '; Ä, 中文\n(declare-const x Bool)\n(assert x)'
    const result = await runner.solve(body, ['x'])
    assert.ok(result.ok)
    assert.equal(result.solutions[0].get('x'), true)
    assert.ok(submitted[1].includes(body))
    assert.equal(releases, 2)
  } finally {
    await runner.close()
  }
})
