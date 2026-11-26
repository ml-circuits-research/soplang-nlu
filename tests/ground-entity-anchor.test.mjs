import test from 'node:test'
import assert from 'node:assert/strict'
import {groundEntityAnchor} from '../experiments/native-teacher/ground-entity-anchor.mjs'

test('anchors standalone source numbers without removing a real noun quantity',()=>{
  const input='@a nlu.entity quantity="two"\n@b nlu.entity head="pages" quantity="two"'
  assert.equal(groundEntityAnchor(input),'@a nlu.entity literal="two"\n@b nlu.entity head="pages" quantity="two"')
})

test('anchors a standalone demonstrative and preserves a determiner with its noun',()=>{
  const input='@a nlu.entity determiner="those"\n@b nlu.entity determiner="those" head="signs"\n'+
    '@c nlu.entity determiner="the"'
  assert.equal(groundEntityAnchor(input),
    '@a nlu.entity pronoun="those"\n@b nlu.entity determiner="those" head="signs"\n@c nlu.entity determiner="the"')
})
