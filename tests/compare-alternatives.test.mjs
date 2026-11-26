import test from 'node:test'
import assert from 'node:assert/strict'
import { compareAlternatives } from '../lib/compare-alternatives.mjs'

test('counts exact alternatives independently of order, duplicates and empty cells', () => {
  const expected = { references: 3, proposals: 3, matched: 2, missing: 1, unlisted: 1 }
  assert.deepEqual(compareAlternatives(['A\nB', 'C', '', 'D'], ['E', 'C', ' A\r\nB ', 'C']), expected)
  assert.deepEqual(compareAlternatives(['D', 'C', 'A\nB'], ['A\nB', 'C', 'E']), expected)
})
