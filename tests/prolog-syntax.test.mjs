// The three Prolog strategies in the `syntax` schema, through the common reader.
// Run with no knowledge repository:
//   env -u SOP_KNOWLEDGE_DIR node --test tests/prolog-syntax.test.mjs
// SWI-Prolog is found through SWIPL, the path, or the workspace copy. Neuro-Prolog also needs
// a dependency parser: SOP_NLU_SYNTAX_PYTHON and SOP_NLU_SYNTAX_MODEL name a Python with spaCy
// and an English model. Without them its projection is tested on recorded parses.
import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {readFileSync, readdirSync} from 'node:fs'
import {createReader, validateSyntax, parseCircuit} from '../lib/index.mjs'
import {prolog, findSwipl} from '../strategies/prolog/index.mjs'
import {prologExampleTransfer, trainSyntaxTransfer} from '../strategies/prolog-example-transfer/index.mjs'
import {neuroProlog} from '../strategies/neuro-prolog/index.mjs'

const swipl = findSwipl()
const skip = spawnSync(swipl, ['--version']).status !== 0 ? 'SWI-Prolog is not available: set SWIPL' : false
const python = process.env.SOP_NLU_SYNTAX_PYTHON, model = process.env.SOP_NLU_SYNTAX_MODEL

// The wires of a circuit, by type, with their slots as [key, value].
const wiresOf = sop => parseCircuit(sop).map(wire => ({...wire, text: `${wire.type} ${wire.slots.map(([key, raw]) => `${key}=${raw}`).join(' ')}`}))
const has = (sop, type, ...parts) => wiresOf(sop).some(wire => wire.type === 'syntax.' + type && parts.every(part => wire.text.includes(part)))

async function circuits(reader, messages) {
  const found = new Map()
  for (const text of messages) {
    const result = await reader.propose(text)
    assert.equal(result.schema, 'syntax')
    assert.equal(result.candidates.length, 1, `${text}: ${result.error} ${JSON.stringify(result.rejected?.[0]?.check?.findings ?? '')}`)
    assert.equal(validateSyntax(text, result.candidates[0].sop).valid, true, text)
    assert.doesNotMatch(result.candidates[0].sop, /nlu\.|w\.request/u)
    found.set(text, result.candidates[0].sop)
  }
  return found
}

const messages = [
  'move the blue box next to the red circle, and make it bigger.',
  'delete the last row',
  'Could you move it?',
  'the title is too long',
  'do not move it, please',
  'the box was moved by Ana',
  'what colour is the castle?',
  'I want to delete it',
  'a bird facing left',
  'put it near Ben but not behind Jo',
  'make A blue and B green',
  'move the box, and thanks',
  'put the lamp two inches from the edge',
  'give the avatar a hat',
  'to fix the details, edit the members',
  'move it if it fits',
  'Please, add a diamond labelled Rain; then connect Rain to Station. Thanks!',
  'I\'d like you to place Check midway between the Review box and the Draft box',
  'draw four sandboxes, four kids, a coach, and a dog',
  'replace Team offsite with "Please check the final figures.".'
]

test('no knowledge repository is configured', () => {
  assert.equal(process.env.SOP_KNOWLEDGE_DIR, undefined, 'run this test with SOP_KNOWLEDGE_DIR unset')
  for (const strategy of [prolog, prologExampleTransfer, neuroProlog]) assert.equal(strategy.schema, 'syntax')
})

test('the three strategies read nothing from a knowledge repository', () => {
  const sources = ['../strategies/prolog/index.mjs', '../strategies/prolog/src/english.mjs', '../strategies/prolog/src/syntax-input.mjs',
    '../strategies/prolog/src/write-wires.mjs', '../strategies/prolog-example-transfer/index.mjs',
    '../strategies/prolog-example-transfer/syntax-train.mjs', '../strategies/neuro-prolog/index.mjs']
  for (const source of sources) {
    const text = readFileSync(new URL(source, import.meta.url), 'utf8')
    assert.doesNotMatch(text, /knowledgeDir|SOP_KNOWLEDGE_DIR|sop-knowledge-worlds|loadWorlds|openKnowledge|nlu\./u, source)
  }
})

test('prolog writes one valid syntax circuit from its own grammar', {skip}, async () => {
  const reader = await createReader({strategy: prolog})
  try {
    const found = await circuits(reader, messages)
    const of = text => found.get(text)
    // the verb, the form and a complement
    assert.ok(has(of('delete the last row'), 'clause', 'form=imperative', 'verb="delete"', 'complement=$'))
    assert.ok(has(of('delete the last row'), 'nominal', 'dependent="the"', 'dependent="last"', 'head="row"'))
    assert.ok(has(of('Could you move it?'), 'clause', 'form=interrogative', 'auxiliary="Could"', 'verb="move"', 'subject=$'))
    assert.ok(has(of('the title is too long'), 'clause', 'form=declarative', 'verb="is"', 'modifier="too"', 'modifier="long"'))
    assert.ok(has(of('do not move it, please'), 'clause', 'auxiliary="do"', 'negation="not"', 'discourse="please"'))
    assert.ok(has(of('the box was moved by Ana'), 'clause', 'auxiliary="was"', 'verb="moved"'))
    assert.ok(has(of('the box was moved by Ana'), 'relation', 'marker="by"'))
    // a question word stands where its grammar puts it
    assert.ok(has(of('what colour is the castle?'), 'nominal', 'dependent="what"', 'head="colour"'))
    // "to" of an infinitive marks a relation between two clauses
    assert.ok(has(of('I want to delete it'), 'relation', 'marker="to"'))
    assert.ok(has(of('I want to delete it'), 'clause', 'form=nonfinite', 'verb="delete"'))
    assert.ok(has(of('to fix the details, edit the members'), 'relation', 'marker="to"'))
    assert.ok(has(of('a bird facing left'), 'clause', 'form=nonfinite', 'verb="facing"', 'modifier="left"'))
    // an unsettled attachment is marked; one that the words settle is not
    assert.ok(has(of('move the blue box next to the red circle, and make it bigger.'), 'relation', 'marker="next to"', 'attachment=ambiguous'))
    assert.ok(has(of('move the blue box next to the red circle, and make it bigger.'), 'coordination', 'conjunction="and"'))
    assert.ok(has(of('put it near Ben but not behind Jo'), 'relation', 'marker="behind"', 'negation="not"'))
    assert.ok(has(of('put it near Ben but not behind Jo'), 'coordination', 'conjunction="but"'))
    assert.ok(!/attachment/u.test(of('put it near Ben but not behind Jo')))
    // a shared verb is stated; a fragment that shares nothing has no ellipsis
    assert.ok(has(of('make A blue and B green'), 'clause', 'form=fragment', 'modifier="green"', 'ellipsis=$'))
    assert.ok(has(of('move the box, and thanks'), 'clause', 'form=fragment', 'discourse="thanks"'))
    assert.ok(!/ellipsis/u.test(of('move the box, and thanks')))
    // the measure is a nominal and the relation starts at it
    const lamp = wiresOf(of('put the lamp two inches from the edge'))
    const measure = lamp.find(wire => wire.text.includes('head="inches"'))
    assert.ok(lamp.some(wire => wire.type === 'syntax.relation' && wire.text.includes(`from=$${measure.id}`) && wire.text.includes('marker="from"')))
    assert.equal(wiresOf(of('give the avatar a hat')).find(wire => wire.type === 'syntax.clause').slots.filter(slot => slot[0] === 'complement').length, 2)
    assert.ok(has(of('move it if it fits'), 'relation', 'marker="if"'))
    assert.ok(has(of('replace Team offsite with "Please check the final figures.".'), 'nominal', 'head="Please check the final figures"'))
    // a message with no word, and one that the grammar cannot place, give an error and no circuit
    const empty = await reader.propose('?!')
    assert.equal(empty.candidates.length, 0)
    assert.ok(empty.error)
  } finally { await reader.close() }
})

test('prolog-example-transfer falls back to the grammar and transfers a learned template', {skip}, async () => {
  // with no model there is no template: every message is read by the grammar of prolog
  const plain = await createReader({strategy: prologExampleTransfer})
  try {
    const found = await circuits(plain, messages)
    assert.ok(has(found.get('delete the last row'), 'clause', 'form=imperative', 'verb="delete"'))
    assert.equal((await plain.propose('delete the last row')).candidates[0].source, 'prolog')
  } finally { await plain.close() }
  // with examples in the syntax schema, a message of the same build gets the circuit of the example
  const circuit = (shape, name, other) => `@c1 syntax.clause form=imperative discourse="Please" verb="add" complement=$n1
@n1 syntax.nominal dependent="a" head="${shape}"
@c2 syntax.clause form=nonfinite verb="labelled" complement=$n2
@n2 syntax.nominal head="${name}"
@r1 syntax.relation from=$n1 to=$c2
@c3 syntax.clause form=imperative modifier="then" verb="connect" complement=$n3
@n3 syntax.nominal head="${name}"
@r2 syntax.relation marker="to" from=$c3 to=$n4
@n4 syntax.nominal head="${other}"
@c4 syntax.clause form=fragment discourse="Thanks"`
  const text = (name, other) => `Please, add a diamond labelled ${name}; then connect ${name} to ${other}. Thanks!`
  const trained = trainSyntaxTransfer([
    {text: text('Rain', 'Station'), sop: circuit('diamond', 'Rain', 'Station')},
    {text: text('Budget', 'Start'), sop: circuit('diamond', 'Budget', 'Start')},
    {text: 'move it', sop: '@c1 syntax.clause form=imperative verb="move"'} // not a valid circuit: left out
  ])
  assert.equal(trained.training.invalidCircuit, 1)
  assert.equal(trained.templates.length, 1)
  assert.equal(trained.templates[0].support, 2)
  const reader = await createReader({strategy: prologExampleTransfer, model: trained})
  try {
    const transferred = await reader.propose(text('Sun', 'Billing'))
    assert.equal(transferred.candidates.length, 1)
    assert.equal(transferred.candidates[0].source, 'prolog-example-transfer')
    assert.ok(has(transferred.candidates[0].sop, 'nominal', 'head="Sun"'))
    assert.ok(has(transferred.candidates[0].sop, 'relation', 'marker="to"'))
    assert.ok(!/attachment/u.test(transferred.candidates[0].sop), 'the circuit of the example, not of the grammar')
    const other = await reader.propose('delete the last row')
    assert.equal(other.candidates[0].source, 'prolog')
  } finally { await reader.close() }
})

// Recorded parses: what spaCy en_core_web_trf 3.8.0 returned for each message.
const recorded = JSON.parse(readFileSync(new URL('../strategies/neuro-prolog/recorded-parses.json', import.meta.url), 'utf8'))
const replay = {name: 'recorded', open: async () => ({metadata: {library: 'recorded'}, parse: async text => {
  if (!recorded[text]) throw new Error('No recorded parse for: ' + text)
  return recorded[text]
}, close: async () => {}})}

async function neuroChecks(reader) {
  const found = await circuits(reader, messages)
  const of = text => found.get(text)
  assert.ok(has(of('delete the last row'), 'clause', 'form=imperative', 'verb="delete"', 'complement=$'))
  assert.ok(has(of('Could you move it?'), 'clause', 'form=interrogative', 'auxiliary="Could"', 'verb="move"', 'subject=$'))
  assert.ok(has(of('the title is too long'), 'clause', 'verb="is"', 'modifier="long"'))
  assert.ok(has(of('do not move it, please'), 'clause', 'auxiliary="do"', 'negation="not"', 'discourse="please"'))
  assert.ok(has(of('the box was moved by Ana'), 'relation', 'marker="by"'))
  assert.ok(has(of('I want to delete it'), 'relation', 'marker="to"'))
  assert.ok(has(of('I want to delete it'), 'clause', 'form=nonfinite', 'verb="delete"'))
  assert.ok(has(of('move the blue box next to the red circle, and make it bigger.'), 'relation', 'marker="next to"'))
  assert.ok(has(of('move it if it fits'), 'relation', 'marker="if"'))
  assert.ok(has(of('what colour is the castle?'), 'nominal', 'dependent="what"', 'head="colour"'))
}

test('neuro-prolog projects recorded dependency parses into valid syntax circuits', {skip}, async () => {
  const reader = await createReader({strategy: neuroProlog, syntaxModel: replay})
  try { await neuroChecks(reader) } finally { await reader.close() }
})

test('neuro-prolog reads messages with a live dependency parser', {skip: skip || (!python || !model ? 'set SOP_NLU_SYNTAX_PYTHON and SOP_NLU_SYNTAX_MODEL' : false)}, async () => {
  const reader = await createReader({strategy: neuroProlog, python, model})
  try { await neuroChecks(reader) } finally { await reader.close() }
})

test('the public strategies import no code that writes the old schemas', () => {
  const imports = file => [...readFileSync(new URL(file, import.meta.url), 'utf8').matchAll(/from '([^']+)'/gu)].map(match => match[1])
  assert.deepEqual(imports('../strategies/prolog/index.mjs').filter(name => name.startsWith('.')).sort(),
    ['./src/prolog-worker.mjs', './src/syntax-input.mjs', './src/write-wires.mjs'])
  assert.ok(!imports('../strategies/prolog-example-transfer/index.mjs').some(name => /train\.mjs$|worlds|knowledge|evidence|catalog/u.test(name) && !name.includes('syntax-train')))
  assert.ok(!imports('../strategies/neuro-prolog/index.mjs').some(name => /check-analysis|worlds|knowledge/u.test(name)))
  assert.ok(readdirSync(new URL('../strategies/prolog/src/', import.meta.url)).includes('formaliser.mjs'), 'old code stays in place')
})
