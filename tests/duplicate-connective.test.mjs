import test from 'node:test'
import assert from 'node:assert/strict'
import {removeRedundantConnective} from '../experiments/native-teacher/duplicate-connective.mjs'

const readings=[
  '@open nlu.clause form=imperative predicate="Open"',
  '@save nlu.clause form=imperative predicate="save" connective="and"',
  '@group nlu.coordination kind=additive member=$open member=$save cue="and"'
].join('\n')

test('removes only the duplicate from the connected member',()=>{
  assert.equal(removeRedundantConnective('Open and save',readings),
    readings.replace(' connective="and"',''))
})

test('preserves two written conjunctions and claims on unrelated clauses',()=>{
  assert.equal(removeRedundantConnective('Open and save and exit',readings),readings)
  const unrelated=readings.replace('member=$save','member=$other')
  assert.equal(removeRedundantConnective('Open and save',unrelated),unrelated)
})
