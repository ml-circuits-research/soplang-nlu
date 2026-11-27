// The VSS strategy end to end through the common reader, in the syntax schema.
// Run with SOP_KNOWLEDGE_DIR unset: nothing here may need a knowledge repository.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync, readdirSync} from 'node:fs'
import {createReader, validateSyntax} from '../lib/index.mjs'
import {vss} from '../strategies/vss/index.mjs'

const reader = await createReader({strategy: vss})
const read = async text => {
  const result = await reader.propose(text)
  assert.equal(result.candidates.length, 1, `${text}: ${result.error} ${JSON.stringify(result.rejected?.[0]?.check.findings)}`)
  return result.candidates[0].sop
}

test('the strategy declares the syntax schema and needs no knowledge repository', () => {
  assert.equal(vss.schema, 'syntax')
  assert.equal(process.env.SOP_KNOWLEDGE_DIR, undefined, 'run this test with SOP_KNOWLEDGE_DIR unset')
  const folder = new URL('../strategies/vss/src/', import.meta.url)
  for (const name of ['reader.mjs', 'emit-syntax.mjs', 'links.mjs', 'units.mjs', 'routes.mjs', 'observe.mjs', 'legend.mjs']) {
    assert.doesNotMatch(readFileSync(new URL(name, folder), 'utf8'), /knowledgeDir|sop-knowledge-worlds|SOP_KNOWLEDGE_DIR|sopworld/u, name)
  }
  assert.ok(readdirSync(folder).includes('emit-syntax.mjs'))
})

test('varied messages get one valid circuit each', async () => {
  const messages = ['Move the blue box towards the yellow circle.', 'Draw a picture, now!', 'what colour is the castle?', 'I want to delete it',
    'Could you move it, please?', "put Jan's chair next to the table", "don't move it", 'a small grey cat sitting in the bottom left corner',
    'make it slightly smaller and move it next to the red square', 'pie radius smaller', 'thanks', 'does this diagram make sense?',
    'set the level of Intro to 3', 'draw a riverside picnic spot in the afternoon: a blanket, a basket, a boy, and three ducks']
  for (const text of messages) assert.equal(validateSyntax(text, await read(text)).valid, true, text)
})

test('the verb, the form and the complement of a command', async () => {
  const sop = await read('Move the blue box towards the yellow circle.')
  assert.match(sop, /syntax\.clause form=imperative verb="Move" complement=\$n1/)
  assert.match(sop, /@n1 syntax\.nominal dependent="the" dependent="blue" head="box"/)
  assert.match(sop, /syntax\.relation marker="towards" from=\$c1 to=\$n2/)
  assert.doesNotMatch(sop, /nlu\./)
})

test('a question, an auxiliary, a negation and a discourse word', async () => {
  assert.match(await read('Could you move it, please?'), /form=interrogative auxiliary="Could" verb="move" discourse="please" subject=\$n1 complement=\$n2/)
  assert.match(await read("don't move it"), /auxiliary="do" negation="n't" verb="move"/)
  assert.match(await read('what colour is the castle?'), /syntax\.nominal dependent="what" head="colour"/)
})

test('the "to" of an infinitive marks the relation between the two clauses', async () => {
  const sop = await read('I want to delete it')
  assert.match(sop, /syntax\.relation marker="to" from=\$c1 to=\$c2/)
  assert.match(sop, /@c2 syntax\.clause form=nonfinite verb="delete"/)
})

test('a possessive is a relation marked by the clitic, and "of" starts at the thing before it', async () => {
  assert.match(await read("put Jan's chair next to the table"), /syntax\.relation marker="'s" from=\$n1 to=\$n2/)
  assert.match(await read('set the level of Intro to 3'), /syntax\.relation marker="of" from=\$n1 to=\$n2/)
})

test('a message with no verb is a fragment', async () => {
  const sop = await read('pie radius smaller')
  assert.match(sop, /syntax\.clause form=fragment/)
  assert.doesNotMatch(sop, /verb=/)
})
