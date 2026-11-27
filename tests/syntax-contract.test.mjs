// The contract every formalizer of the `syntax` schema is held to. It must pass with no
// knowledge repository: run with SOP_KNOWLEDGE_DIR unset.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createReader, validateSyntax, writeCircuit, coreOf} from '../lib/index.mjs'

const codes = (text, sop) => validateSyntax(text, sop).findings.map(finding => finding.code)
const whole = `@c1 syntax.clause form=imperative verb="move" complement=$n1
@n1 syntax.nominal dependent="the" dependent="blue" head="box"
@r1 syntax.relation from=$c1 to=$n2 marker="next to" attachment=ambiguous
@n2 syntax.nominal dependent="the" dependent="red" head="circle"
@c2 syntax.clause form=imperative verb="make" complement=$n3 modifier="bigger"
@n3 syntax.nominal head="it"
@k1 syntax.coordination conjunct=$c1 conjunct=$c2 conjunction="and"`

test('a correct circuit passes and punctuation needs no wire', () => {
  assert.deepEqual(codes('move the blue box next to the red circle, and make it bigger.', whole), [])
})

test('a circuit that leaves a word out is rejected', () => {
  const sop = '@c1 syntax.clause form=imperative verb="move" complement=$n1\n@n1 syntax.nominal head="box"'
  assert.deepEqual(codes('move the box', sop), ['uncovered-words'])
  assert.equal(validateSyntax('move the box', sop).valid, false)
})

test('the schema is closed: unknown keys, values and wires are rejected', () => {
  assert.deepEqual(codes('move it', '@c1 syntax.clause form=command verb="move" complement=$n1\n@n1 syntax.nominal head="it"'), ['unknown-value'])
  assert.deepEqual(codes('move it', '@c1 syntax.clause form=imperative verb="move" object=$n1\n@n1 syntax.nominal head="it"'), ['unknown-key'])
  assert.deepEqual(codes('move it', '@c1 syntax.clause form=imperative verb="move" complement=$n2\n@n1 syntax.nominal head="it"'), ['missing-wire'])
  assert.deepEqual(codes('move it', '@c1 syntax.clause form=fragment verb="move" complement=$n1\n@n1 syntax.nominal head="it"'), ['fragment-with-verb'])
  assert.deepEqual(codes('it', '@n1 syntax.nominal head="it"'), ['no-clause'])
  assert.deepEqual(codes('move it now', '@c1 syntax.clause form=imperative verb="move" complement=$n1 modifier="later"\n@n1 syntax.nominal head="it"'), ['words-not-in-message', 'uncovered-words'])
})

test('repeated words are claimed in the order the circuit is written', () => {
  const text = 'put the box on the box'
  const sop = `@c1 syntax.clause form=imperative verb="put" complement=$n1
@n1 syntax.nominal dependent="the" head="box"
@r1 syntax.relation from=$c1 to=$n2 marker="on" attachment=ambiguous
@n2 syntax.nominal dependent="the" head="box"`
  const check = validateSyntax(text, sop)
  assert.equal(check.valid, true)
  assert.deepEqual(check.placements.filter(place => place.key === 'head').map(place => [place.wire, place.first]), [['n1', 2], ['n2', 5]])
  // the other order of the two nominals is another reading
  const swapped = sop.split('\n'); [swapped[1], swapped[3]] = [swapped[3], swapped[1]]
  assert.notEqual(coreOf(text, swapped.join('\n')), coreOf(text, sop))
})

test('a shared verb is stated with ellipsis; a fragment without it shares nothing', () => {
  const gapped = `@c1 syntax.clause form=imperative verb="make" complement=$n1 modifier="blue"
@n1 syntax.nominal head="A"
@c2 syntax.clause form=fragment complement=$n2 modifier="green" ellipsis=$c1
@n2 syntax.nominal head="B"
@k1 syntax.coordination conjunct=$c1 conjunct=$c2 conjunction="and"`
  assert.deepEqual(codes('make A blue and B green', gapped), [])
  const thanks = `@c1 syntax.clause form=imperative verb="move" complement=$n1
@n1 syntax.nominal dependent="the" head="box"
@c2 syntax.clause form=fragment discourse="thanks"
@k1 syntax.coordination conjunct=$c1 conjunct=$c2 conjunction="and"`
  assert.deepEqual(codes('move the box, and thanks', thanks), [])
  assert.deepEqual(codes('move the box, and thanks', thanks.replace('discourse="thanks"', 'discourse="thanks" ellipsis=$c2')), ['refers-to-itself', 'ellipsis-of-a-clause-without-verb'])
})

test('relations can be coordinated and a negation stays on its own relation', () => {
  const sop = `@c1 syntax.clause form=imperative verb="put" complement=$n1
@n1 syntax.nominal head="it"
@r1 syntax.relation from=$c1 to=$n2 marker="near"
@n2 syntax.nominal head="Ben"
@r2 syntax.relation from=$c1 to=$n3 marker="behind" negation="not"
@n3 syntax.nominal head="Jo"
@k1 syntax.coordination conjunct=$r1 conjunct=$r2 conjunction="but"`
  assert.deepEqual(codes('put it near Ben but not behind Jo', sop), [])
})

test('the writer orders wires so that every value gets its own words back', () => {
  const text = 'make the red box red.'
  const wires = [
    {id: 'c1', type: 'syntax.clause', slots: [{key: 'form', value: 'imperative'}, {key: 'verb', span: [0, 0]}, {key: 'modifier', span: [4, 4]}, {key: 'complement', ref: 'n1'}]},
    {id: 'n1', type: 'syntax.nominal', slots: [{key: 'dependent', span: [1, 1]}, {key: 'dependent', span: [2, 2]}, {key: 'head', span: [3, 3]}]}
  ]
  const sop = writeCircuit(text, wires)
  const check = validateSyntax(text, sop)
  assert.equal(check.valid, true)
  assert.deepEqual(check.placements.find(place => place.key === 'modifier'), {wire: 'c1', key: 'modifier', first: 4, last: 4})
  assert.throws(() => writeCircuit(text, [wires[0]]), /not covered/)
  assert.throws(() => writeCircuit(text, [wires[0], {...wires[1], slots: [...wires[1].slots, {key: 'dependent', span: [4, 4]}]}]), /claimed twice/)
})

test('the common reader checks a syntax strategy with no knowledge repository', async () => {
  assert.equal(process.env.SOP_KNOWLEDGE_DIR, undefined, 'run this test with SOP_KNOWLEDGE_DIR unset')
  const good = '@c1 syntax.clause form=imperative verb="move" complement=$n1\n@n1 syntax.nominal head="it"'
  const strategy = sop => ({name: 'stub', schema: 'syntax', open: async () => ({analyse: async () => ({analyses: [{sop}]}), close() {}})})
  const reader = await createReader({strategy: strategy(good)})
  const passed = await reader.propose('move it')
  assert.equal(passed.candidates.length, 1)
  assert.equal(passed.candidates[0].check.valid, true)
  const lacking = await (await createReader({strategy: strategy('@c1 syntax.clause form=imperative verb="move"')})).propose('move it')
  assert.equal(lacking.candidates.length, 0)
  assert.equal(lacking.rejected.length, 1)
  assert.match(lacking.error, /failed the syntax check/)
})

test('the contract reads nothing outside this package', () => {
  const source = readFileSync(new URL('../lib/syntax.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /knowledgeDir|sop-knowledge-worlds|sopworld|SOP_KNOWLEDGE_DIR/u)
  assert.deepEqual([...source.matchAll(/^import .* from '([^']+)'/gmu)].map(match => match[1]), ['node:fs'])
})
