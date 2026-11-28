// The neural strategies (distilbert, neuro-selector, selector-distilbert) as formalizers of the
// `syntax` schema. Run with no knowledge repository:
//   env -u SOP_KNOWLEDGE_DIR node --test tests/neural-syntax.test.mjs
// The messages are the examples of docs/syntax-schema.md and sentences written for this test;
// none is taken from the dataset.
// The models are not part of the package. Each is found through the environment variable of its
// strategy or, when that is not set, at the place where it is installed on the development
// machine. A test whose model or interpreter is not there is skipped and says what is missing.
import test from 'node:test'
import assert from 'node:assert/strict'
import {existsSync} from 'node:fs'
import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {homedir, tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createReader, validateSyntax, parseCircuit, coreOf, wordsOf} from '../lib/index.mjs'
import {distilBert} from '../strategies/distilbert/index.mjs'
import {modelTokens, encodeCircuit, certainPrediction, modelSchema} from '../strategies/distilbert/targets.mjs'
import {writeSyntaxCircuit} from '../strategies/distilbert/circuit.mjs'
import {normalForm} from './benchmark/syntax/lib.mjs'
import {neuroSelector} from '../strategies/neuro-selector/index.mjs'
import {settleAttachments} from '../strategies/neuro-selector/attachments.mjs'
import {selectorDistilBert, pairCircuits} from '../strategies/selector-distilbert/index.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const found = (variable, ...places) => process.env[variable] ?? places.find(place => existsSync(place))
const settings = {
  distilbertPython: found('SOP_NLU_DISTILBERT_PYTHON', join(homedir(), 'nlp-venv/bin/python')),
  distilbertModel: found('SOP_NLU_DISTILBERT_MODEL', join(root, '.local-models/distilbert/syntax-v1/checkpoint')),
  python: found('SOP_NLU_SYNTAX_PYTHON', join(homedir(), 'models/sop-nlu-trf/python-trf-one')),
  model: found('SOP_NLU_SYNTAX_MODEL', join(homedir(), 'models/sop-nlu-trf/venv/lib/python3.12/site-packages/en_core_web_trf/en_core_web_trf-3.8.0')),
  adaptedModel: found('SOP_NLU_ADAPTED_TRF_MODEL', '/tmp/wm-spacy-trf-heads/adapted-model'),
  compactPython: found('SOP_NLU_COMPACT_PYTHON', join(homedir(), 'spacy-venv/bin/python')),
  compactModel: found('SOP_NLU_COMPACT_MODEL', '/tmp/wm-spacy-adaptation/adapted-model'),
  swipl: found('SWIPL', join(root, '../prolog-formaliser/tools/swipl'))
}
const missing = names => { const absent = names.filter(name => !settings[name]); return absent.length ? 'Not found on this machine: ' + absent.join(', ') : false }
const graphOptions = {python: settings.distilbertPython, modelPath: settings.distilbertModel, device: 'cpu'}
const poolOptions = () => ({python: settings.python, model: settings.model, adaptedModel: settings.adaptedModel,
  compactPython: settings.compactPython, compactModel: settings.compactModel, swipl: settings.swipl, families: ported})
const withoutGraph = missing(['distilbertPython', 'distilbertModel'])
// The pool of the selectors is made of four other strategies. A family takes part in these tests
// once its strategy writes the syntax schema; the tests say which families ran.
const ported = []
for (const [family, file, name] of [['base-beam', 'spacy-beam', 'spacyBeam'], ['adapted-beam', 'spacy-beam', 'spacyBeam'],
  ['adapted-compact', 'spacy-direct', 'spacyDirect'], ['neuro-prolog', 'neuro-prolog', 'neuroProlog']]) {
  const strategy = await import(`../strategies/${file}/index.mjs`).then(module => module[name], () => null)
  if (strategy?.schema === 'syntax') ported.push(family)
}
const withoutPool = missing(['python', 'model', 'adaptedModel', 'compactPython', 'compactModel', 'swipl']) ||
  (ported.length < 2 && 'Fewer than two strategies of the pool write the syntax schema yet: ' + (ported.join(', ') || 'none'))
const poolNote = 'families of the pool in this run: ' + ported.join(', ') + (ported.length < 4 ? ' (the others are not ported to the syntax schema yet)' : '')

// ---- reading a circuit in a test
/** The wires of a valid circuit: [{id, type, form, words: {key: [text]}, to: {key: [wire]}}]. */
function shape(text, sop) {
  const check = validateSyntax(text, sop)
  assert.deepEqual(check.findings, [], 'the circuit is valid for: ' + text)
  const words = wordsOf(text)
  const wires = parseCircuit(sop).map(wire => ({id: wire.id, type: wire.type.slice(7), form: wire.slots.find(slot => slot[0] === 'form')?.[1],
    ambiguous: wire.slots.some(slot => slot[0] === 'attachment'), words: {}, to: {}, slots: wire.slots}))
  const byId = new Map(wires.map(wire => [wire.id, wire]))
  for (const {wire, key, first, last} of check.placements) (byId.get(wire).words[key] ??= []).push(words.slice(first, last + 1).map(word => word.text).join(' '))
  for (const wire of wires) for (const [key, raw] of wire.slots) if (raw.startsWith('$')) (wire.to[key] ??= []).push(byId.get(raw.slice(1)))
  return wires
}
const clauseOf = (wires, verb) => wires.find(wire => wire.type === 'clause' && wire.words.verb?.[0] === verb)
const nominalOf = (wires, head) => wires.find(wire => wire.type === 'nominal' && wire.words.head?.[0] === head)
const relationOf = (wires, marker) => wires.find(wire => wire.type === 'relation' && wire.words.marker?.[0] === marker)
const sameCircuit = (text, sop, expected) => assert.equal(coreOf(text, sop), coreOf(text, expected), sop)

const messages = [
  'delete the last row',
  'do not move it, please',
  'I want to delete it',
  'put the lamp two inches from the edge',
  'what colour is the castle?',
  'Thanks!',
  'to fix the details, edit the members',
  'a blanket, a basket and a boy',
  'the box was moved by Ana',
  'Could you move it?',
  'where is it?',
  'give the avatar a hat',
  'move the blue box next to the red circle, and make it bigger.',
  'Hey, could you rename the second column? That would help.',
  'add a short note under the title, facing the margin, and keep it small.',
  'I\'d like you to sort the rows by date, and hide the totals.'
]

test('the tests run with no knowledge repository', () => {
  assert.equal(process.env.SOP_KNOWLEDGE_DIR, undefined, 'run this test with SOP_KNOWLEDGE_DIR unset')
  for (const strategy of [distilBert, neuroSelector, selectorDistilBert]) assert.equal(strategy.schema, 'syntax')
})

// ---- the targets of the DistilBERT model and its output stage (no model needed)
const sameAsWritten = (text, sop, expected) => assert.equal(normalForm(text, sop).core, normalForm(text, expected).core, sop)
const specCircuits = [
  ['move the blue box next to the red circle, and make it bigger.', `@c1 syntax.clause form=imperative verb="move" complement=$n1
@n1 syntax.nominal dependent="the" dependent="blue" head="box"
@r1 syntax.relation from=$c1 to=$n2 marker="next to" attachment=ambiguous
@n2 syntax.nominal dependent="the" dependent="red" head="circle"
@c2 syntax.clause form=imperative verb="make" complement=$n3 modifier="bigger"
@n3 syntax.nominal head="it"
@k1 syntax.coordination conjunct=$c1 conjunct=$c2 conjunction="and"`],
  ['make A blue and B green', `@c1 syntax.clause form=imperative verb="make" complement=$n1 modifier="blue"
@n1 syntax.nominal head="A"
@c2 syntax.clause form=fragment complement=$n2 modifier="green" ellipsis=$c1
@n2 syntax.nominal head="B"
@k1 syntax.coordination conjunct=$c1 conjunct=$c2 conjunction="and"`],
  ['put the lamp two inches from the edge', `@c1 syntax.clause form=imperative verb="put" complement=$n1 complement=$n2
@n1 syntax.nominal dependent="the" head="lamp"
@n2 syntax.nominal dependent="two" head="inches"
@r1 syntax.relation from=$n2 to=$n3 marker="from"
@n3 syntax.nominal dependent="the" head="edge"`],
  ['put it near Ben but not behind Jo', `@c1 syntax.clause form=imperative verb="put" complement=$n1
@n1 syntax.nominal head="it"
@r1 syntax.relation from=$c1 to=$n2 marker="near"
@n2 syntax.nominal head="Ben"
@r2 syntax.relation from=$c1 to=$n3 marker="behind" negation="not"
@n3 syntax.nominal head="Jo"
@k1 syntax.coordination conjunct=$r1 conjunct=$r2 conjunction="but"`],
  ['a bird facing left', `@c1 syntax.clause form=fragment complement=$n1
@n1 syntax.nominal dependent="a" head="bird"
@c2 syntax.clause form=nonfinite verb="facing" modifier="left"
@r1 syntax.relation from=$n1 to=$c2`],
  ['put the box on the box', `@c1 syntax.clause form=imperative verb="put" complement=$n1
@n1 syntax.nominal dependent="the" head="box"
@r1 syntax.relation from=$c1 to=$n2 marker="on" attachment=ambiguous
@n2 syntax.nominal dependent="the" head="box"`],
  ['I want to delete it', `@c1 syntax.clause form=declarative verb="want" subject=$n1
@n1 syntax.nominal head="I"
@c2 syntax.clause form=nonfinite verb="delete" complement=$n2
@n2 syntax.nominal head="it"
@r1 syntax.relation from=$c1 to=$c2 marker="to"`]
]

test('targets: the keys of the model are those of the schema', () => {
  const types = modelSchema()
  assert.deepEqual(Object.keys(types), ['clause', 'nominal', 'relation', 'coordination'])
  assert.deepEqual(types.clause.words, ['verb', 'auxiliary', 'negation', 'modifier', 'discourse'])
  assert.deepEqual(Object.keys(types.clause.edges), ['subject', 'complement', 'ellipsis'])
  assert.deepEqual(types.relation.edges.from, {targets: ['clause', 'nominal', 'coordination'], many: false, required: true})
  assert.deepEqual(types.clause.atoms.form.options, ['imperative', 'declarative', 'interrogative', 'fragment', 'nonfinite'])
  const names = [...Object.values(types).flatMap(type => [...type.words, ...Object.keys(type.edges), ...Object.keys(type.atoms)])]
  assert.equal(new Set(names).size, 17)   // the 18 keys of the schema; `negation` stands on two wire types
})

test('targets: a circuit encoded for the model and written back says the same', () => {
  for (const [text, sop] of specCircuits) {
    const targets = encodeCircuit(text, sop)
    assert.equal(targets.owners.filter(Boolean).length, wordsOf(text).length, 'every word has one owner: ' + text)
    sameAsWritten(text, writeSyntaxCircuit(text, targets.tokens, certainPrediction(targets)), sop)
  }
  // a wire stands at the word that names it: the clause at its verb, the relation at its marker
  const {nodes, tokens, owners} = encodeCircuit(...specCircuits[0])
  assert.deepEqual(nodes.map(node => node.type + '@' + tokens[node.anchor].text), ['clause@move', 'nominal@box', 'relation@next', 'nominal@circle', 'coordination@and', 'clause@make', 'nominal@it'])
  assert.equal(owners[tokens.findIndex(token => token.text === ',')], null)
  assert.throws(() => encodeCircuit('move it', '@c1 syntax.clause form=imperative verb="move"'), /not valid/u)
})

// a prediction written by hand: wires, then for every token its ranked places
const wire = (type, anchor, edges = {}, atoms = {}) => ({type, anchor, p: 1, edges, atoms})
const places = (text, list) => modelTokens(text).map((_, token) => list[token] ?? [])
const cat = 'put the cat on the table'
const catWires = (relation, clause = {}) => [
  wire('clause', 0, {subject: [], complement: [[1, .9]], ellipsis: [], ...clause.edges}, {form: clause.form ?? {imperative: .9, fragment: .1}}),
  wire('nominal', 2), wire('relation', 3, relation.edges, {attachment: {ambiguous: relation.ambiguous ?? 0}}), wire('nominal', 5)]
const catPlaces = [[[0, 'verb', 1]], [[1, 'dependent', 1]], [[1, 'head', 1]], [[2, 'marker', .6], [0, 'modifier', .3]], [[3, 'dependent', 1]], [[3, 'head', 1]]]
const onVerbCircuit = `@c1 syntax.clause form=imperative verb="put" complement=$n1
@n1 syntax.nominal dependent="the" head="cat"
@r1 syntax.relation from=$c1 to=$n2 marker="on"
@n2 syntax.nominal dependent="the" head="table"`

test('output stage: the ties and the marks are those the model names', () => {
  const write = relation => writeSyntaxCircuit(cat, modelTokens(cat), {nodes: catWires(relation), owners: places(cat, catPlaces)})
  sameAsWritten(cat, write({edges: {from: [[0, .9], [1, .1]], to: [[3, 1]]}}), onVerbCircuit)
  sameAsWritten(cat, write({edges: {from: [[1, .9], [0, .1]], to: [[3, 1]]}}), onVerbCircuit.replace('from=$c1', 'from=$n1'))
  sameAsWritten(cat, write({edges: {from: [[0, .9]], to: [[3, 1]]}, ambiguous: .8}), onVerbCircuit.replace('marker="on"', 'marker="on" attachment=ambiguous'))
  // the mark says "this clause": it is not written on a relation that starts at a nominal
  sameAsWritten(cat, write({edges: {from: [[1, .9]], to: [[3, 1]]}, ambiguous: .8}), onVerbCircuit.replace('from=$c1', 'from=$n1'))
})

test('output stage: where first choices do not fit together, the next choice of the model is taken', () => {
  const tokens = modelTokens(cat)
  // one wire at both ends of a relation: the best pair of different ends
  sameAsWritten(cat, writeSyntaxCircuit(cat, tokens, {nodes: catWires({edges: {from: [[1, .9], [0, .2]], to: [[1, .8], [3, .7]]}}), owners: places(cat, catPlaces)}),
    onVerbCircuit.replace('from=$c1', 'from=$n1'))
  // a relation with no end does not stand: its word takes its next place, and the nominal left
  // alone takes the tie the model ranks highest for it
  const alone = catWires({edges: {from: [], to: []}}, {edges: {complement: [[1, .9], [3, .2]]}})
  sameAsWritten(cat, writeSyntaxCircuit(cat, tokens, {nodes: alone, owners: places(cat, catPlaces)}),
    `@c1 syntax.clause form=imperative verb="put" modifier="on" complement=$n1 complement=$n2
@n1 syntax.nominal dependent="the" head="cat"
@n2 syntax.nominal dependent="the" head="table"`)
  // a nominal whose words were all named dependents: the word the model ranks highest as its head
  const headless = catPlaces.with(2, [[1, 'dependent', .5], [1, 'head', .4]])
  sameAsWritten(cat, writeSyntaxCircuit(cat, tokens, {nodes: catWires({edges: {from: [[0, .9]], to: [[3, 1]]}}), owners: places(cat, headless)}), onVerbCircuit)
  // the form of a clause agrees with whether it has a verb
  const asFragment = catWires({edges: {from: [[0, .9]], to: [[3, 1]]}}, {form: {fragment: .6, imperative: .3, declarative: .1}})
  sameAsWritten(cat, writeSyntaxCircuit(cat, tokens, {nodes: asFragment, owners: places(cat, catPlaces)}), onVerbCircuit)
  const verbless = catPlaces.with(0, [[0, 'discourse', 1]])
  assert.match(writeSyntaxCircuit(cat, tokens, {nodes: catWires({edges: {from: [[0, .9]], to: [[3, 1]]}}), owners: places(cat, verbless)}), /form=fragment discourse="put"/u)
})

test('output stage: a coordination has two conjuncts of one type, and every word one place', () => {
  const text = 'move it, and delete the row now.'
  const tokens = modelTokens(text)   // move it , and delete the row now .
  const nodes = conjunct => [
    wire('clause', 0, {complement: [[1, .9]]}, {form: {imperative: 1}}), wire('nominal', 1),
    wire('coordination', 3, {conjunct}), wire('clause', 4, {complement: [[4, .9]]}, {form: {imperative: 1}}), wire('nominal', 6)]
  const owners = places(text, [[[0, 'verb', 1]], [[1, 'head', 1]], [], [[2, 'conjunction', .7], [3, 'discourse', .2]], [[3, 'verb', 1]], [[4, 'dependent', 1]], [[4, 'head', 1]], []])
  const both = `@c1 syntax.clause form=imperative verb="move" complement=$n1
@n1 syntax.nominal head="it"
@k1 syntax.coordination conjunction="and" conjunct=$c1 conjunct=$c2
@c2 syntax.clause form=imperative verb="delete" discourse="now" complement=$n2
@n2 syntax.nominal dependent="the" head="row"`
  // "now" has no place from the model: it is a word of the clause in which it stands; the marks have no place at all
  sameAsWritten(text, writeSyntaxCircuit(text, tokens, {nodes: nodes([[0, .9], [3, .8]]), owners}), both)
  // the model is sure of one conjunct only: its best two; a conjunct of another type is left out
  sameAsWritten(text, writeSyntaxCircuit(text, tokens, {nodes: nodes([[0, .9], [1, .45], [3, .4]]), owners}), both)
  // a coordination with one possible conjunct does not stand, and its word takes its next place
  assert.match(writeSyntaxCircuit(text, tokens, {nodes: nodes([[0, .9]]), owners}), /verb="delete" discourse="and" discourse="now"|discourse="and" verb="delete" discourse="now"/u)
  assert.throws(() => writeSyntaxCircuit(text, tokens, {nodes: [], owners}), /no wire/u)
})

// ---- the DistilBERT strategy with its model
test('distilbert: one valid circuit for every message, through the common reader', {skip: withoutGraph}, async () => {
  const reader = await createReader({strategy: distilBert, ...graphOptions})
  try {
    const circuits = new Map()
    for (const text of messages) {
      const result = await reader.propose(text)
      assert.equal(result.schema, 'syntax')
      assert.equal(result.error, null, text)
      assert.equal(result.candidates.length, 1, text)
      assert.equal(result.candidates[0].check.valid, true, text)
      circuits.set(text, shape(text, result.candidates[0].sop))
      assert.doesNotMatch(result.candidates[0].sop, /nlu\./u)
    }
    const wires = text => circuits.get(text)
    sameCircuit(messages[0], (await reader.propose(messages[0])).candidates[0].sop,
      '@c1 syntax.clause form=imperative verb="delete" complement=$n1\n@n1 syntax.nominal dependent="the" dependent="last" head="row"')
    const order = clauseOf(wires('do not move it, please'), 'move')
    assert.deepEqual([order.form, order.words.auxiliary, order.words.negation, order.words.discourse], ['imperative', ['do'], ['not'], ['please']])
    const want = wires('I want to delete it')
    assert.equal(relationOf(want, 'to').to.from[0], clauseOf(want, 'want'))
    assert.equal(relationOf(want, 'to').to.to[0], clauseOf(want, 'delete'))
    assert.equal(clauseOf(want, 'delete').form, 'nonfinite')
    const lamp = wires('put the lamp two inches from the edge')
    assert.equal(relationOf(lamp, 'from').to.from[0], nominalOf(lamp, 'inches'))
    assert.deepEqual(clauseOf(lamp, 'put').to.complement, [nominalOf(lamp, 'lamp'), nominalOf(lamp, 'inches')])
    const castle = wires('what colour is the castle?')
    assert.deepEqual(nominalOf(castle, 'colour').words.dependent, ['what'])
    assert.equal(clauseOf(castle, 'is').form, 'interrogative')
    assert.deepEqual(wires('Thanks!').map(wire => [wire.type, wire.form, wire.words.discourse]), [['clause', 'fragment', ['Thanks']]])
    const fix = wires('to fix the details, edit the members')
    assert.equal(relationOf(fix, 'to').to.from[0], clauseOf(fix, 'edit'))
    assert.equal(relationOf(fix, 'to').to.to[0], clauseOf(fix, 'fix'))
    const list = wires('a blanket, a basket and a boy')
    const group = list.find(wire => wire.type === 'coordination')
    assert.deepEqual(group.to.conjunct.map(wire => wire.words.head[0]), ['blanket', 'basket', 'boy'])
    assert.deepEqual(group.words.conjunction, ['and'])
    assert.deepEqual(list.find(wire => wire.type === 'clause').to.complement, [group])
    const moved = wires('the box was moved by Ana')
    assert.deepEqual(clauseOf(moved, 'moved').to.subject, [nominalOf(moved, 'box')])
    assert.deepEqual(clauseOf(moved, 'moved').words.auxiliary, ['was'])
    assert.equal(relationOf(moved, 'by').to.to[0], nominalOf(moved, 'Ana'))
    assert.equal(clauseOf(wires('Could you move it?'), 'move').form, 'interrogative')
    assert.deepEqual(clauseOf(wires('where is it?'), 'is').words.modifier, ['where'])
    assert.equal(clauseOf(wires('give the avatar a hat'), 'give').to.complement.length, 2)
    // input that is no message
    assert.match((await reader.propose('   ')).error, /nonempty/u)
  } finally {
    await reader.close()
  }
})

test('distilbert: refuses a checkpoint of the older model and reports a worker that cannot start', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'sop-distilbert-'))
  try {
    await assert.rejects(createReader({strategy: distilBert, modelPath: folder}), /no manifest/u)
    // a checkpoint that was trained on the older nlu annotations is not read
    await writeFile(join(folder, 'manifest.json'), JSON.stringify({format: 'native-distilbert-v2'}))
    await assert.rejects(createReader({strategy: distilBert, modelPath: folder}), /is no syntax model.*older nlu annotations/su)
    await assert.rejects(createReader({strategy: distilBert, python: 'node', modelPath: folder, workerPath: join(root, 'package.json')}), /DistilBERT/u)
  } finally {
    await rm(folder, {recursive: true, force: true})
  }
})

// ---- the selector on fixed circuits (no model needed)
const stub = (name, circuits) => ({name, schema: 'syntax', open: async () => ({
  analyse: async text => circuits[text] ? {analyses: [{sop: circuits[text]}]} : {analyses: [], error: name + ' has no circuit'}, close() {}})})
const onVerb = `@c1 syntax.clause form=imperative verb="put" complement=$n1
@n1 syntax.nominal dependent="the" head="cat"
@r1 syntax.relation from=$c1 to=$n2 marker="on"
@n2 syntax.nominal dependent="the" head="table"`
const onCat = onVerb.replace('from=$c1', 'from=$n1')
const unsettledCat = onVerb.replace('marker="on"', 'marker="on" attachment=ambiguous')

test('neuro-selector: returns one circuit of its pool and leaves open what the pool does not settle', async () => {
  const text = 'put the cat on the table', other = 'delete it'
  const deleteIt = '@c1 syntax.clause form=imperative verb="delete" complement=$n1\n@n1 syntax.nominal head="it"'
  const providers = [
    {family: 'base-beam', strategy: stub('one', {[text]: onVerb, [other]: deleteIt})},
    {family: 'adapted-beam', strategy: stub('two', {[text]: onCat, [other]: deleteIt.replaceAll('n1', 'thing')})},
    {family: 'adapted-compact', strategy: stub('three', {})}]
  const reader = await createReader({strategy: neuroSelector, providers})
  try {
    // two circuits that say the same are one candidate, whatever their wire names
    const same = await reader.propose(other)
    assert.equal(same.candidates.length, 1)
    assert.deepEqual(same.candidates[0].families, ['base-beam', 'adapted-beam'])
    sameCircuit(other, same.candidates[0].sop, deleteIt)
    // the two circuits differ only in the start of "on the table": one circuit, marked ambiguous
    const open = await reader.propose(text)
    assert.equal(open.candidates.length, 1)
    sameCircuit(text, open.candidates[0].sop, unsettledCat)
    // no provider has a circuit
    const none = await reader.propose('hello there')
    assert.equal(none.candidates.length, 0)
    assert.match(none.error, /No strategy of the pool returned a valid circuit: base-beam: one has no circuit/u)
  } finally {
    await reader.close()
  }
  // a strategy that does not answer in time proposes nothing; the others still do
  const silent = {name: 'silent', schema: 'syntax', open: async () => ({analyse: () => new Promise(() => {}), close() {}})}
  const patient = await createReader({strategy: neuroSelector, familyTimeoutMs: 50, providers: [{family: 'base-beam', strategy: silent}, {family: 'adapted-beam', strategy: stub('two', {[text]: onCat})}]})
  try {
    const answered = await patient.propose(text)
    sameCircuit(text, answered.candidates[0].sop, onCat)
    assert.deepEqual(answered.candidates[0].families, ['adapted-beam'])
  } finally {
    await patient.close()
  }
  // a strategy of the pool that does not write the syntax schema is refused
  await assert.rejects(createReader({strategy: neuroSelector, providers: [{family: 'base-beam', strategy: {name: 'old', open: async () => ({})}}]}), /do not write the syntax schema: old/u)
  await assert.rejects(createReader({strategy: neuroSelector, providers: [{family: 'fifth', strategy: stub('x', {})}]}), /knows no family named fifth/u)
})

test('the attachment vote changes a start only when most circuits do not share it', () => {
  const text = 'put the cat on the table'
  sameCircuit(text, settleAttachments(text, onVerb, [onVerb, onVerb, onCat]), onVerb)
  sameCircuit(text, settleAttachments(text, onCat, [onCat, onVerb]), unsettledCat)
  sameCircuit(text, settleAttachments(text, onVerb, [onVerb, unsettledCat]), unsettledCat)
  sameCircuit(text, settleAttachments(text, onVerb, [onVerb]), onVerb)
  // a start that the chosen circuit does not have as a wire is no rival: here the other circuit heads the nominal at "the"
  const odd = onCat.replace('dependent="the" head="cat"', 'head="the" dependent="cat"')
  assert.equal(validateSyntax(text, odd).valid, true)
  sameCircuit(text, settleAttachments(text, onVerb, [onVerb, odd]), onVerb)
})

test('selector-distilbert: the selector\'s circuit, the DistilBERT circuit as second voice and as fallback', async () => {
  const text = 'put the cat on the table'
  const gives = sop => ({propose: async () => ({candidates: [{sop}]})})
  const fails = message => ({propose: async () => ({candidates: [], error: message})})
  assert.deepEqual(await pairCircuits(text, gives(onVerb), gives(onVerb)), {sop: onVerb, origin: 'neuro-selector', errors: []})
  const differ = await pairCircuits(text, gives(onVerb), gives(onCat))
  sameCircuit(text, differ.sop, unsettledCat)
  assert.deepEqual(await pairCircuits(text, fails('no pool'), gives(onCat)), {sop: onCat, origin: 'distilbert', errors: [{provider: 'neuro-selector', message: 'no pool'}]})
  const crashed = {propose: async () => { throw Error('crashed') }}
  assert.deepEqual(await pairCircuits(text, crashed, fails('no model')), {sop: null, origin: null,
    errors: [{provider: 'neuro-selector', message: 'crashed'}, {provider: 'distilbert', message: 'no model'}]})
})

// ---- the selectors with their models
test('neuro-selector: one valid circuit for every message, through the common reader', {skip: withoutPool}, async t => {
  t.diagnostic(poolNote)
  const reader = await createReader({strategy: neuroSelector, ...poolOptions()})
  try {
    for (const text of messages) {
      const result = await reader.propose(text)
      assert.equal(result.error, null, text)
      assert.equal(result.candidates.length, 1, text)
      const [{sop, families, selectorScore}] = result.candidates
      shape(text, sop)
      assert.ok(families.length >= 1 && selectorScore >= 0 && selectorScore <= 1, text)
    }
    const row = shape(messages[0], (await reader.propose(messages[0])).candidates[0].sop)
    assert.deepEqual(clauseOf(row, 'delete').to.complement, [nominalOf(row, 'row')])
    assert.deepEqual(nominalOf(row, 'row').words.dependent, ['the', 'last'])
    const move = shape('Could you move it?', (await reader.propose('Could you move it?')).candidates[0].sop)
    assert.equal(clauseOf(move, 'move').form, 'interrogative')
    assert.deepEqual(clauseOf(move, 'move').to.subject, [nominalOf(move, 'you')])
  } finally {
    await reader.close()
  }
})

test('selector-distilbert: one valid circuit for every message, through the common reader', {skip: withoutPool || withoutGraph}, async t => {
  t.diagnostic(poolNote)
  const reader = await createReader({strategy: selectorDistilBert, ...poolOptions(), graphOptions})
  try {
    for (const text of messages) {
      const result = await reader.propose(text)
      assert.equal(result.error, null, text)
      assert.equal(result.candidates.length, 1, text)
      shape(text, result.candidates[0].sop)
      assert.ok(['neuro-selector', 'distilbert'].includes(result.candidates[0].origin), text)
    }
    const row = shape(messages[0], (await reader.propose(messages[0])).candidates[0].sop)
    assert.deepEqual(clauseOf(row, 'delete').to.complement, [nominalOf(row, 'row')])
    const please = shape(messages[1], (await reader.propose(messages[1])).candidates[0].sop)
    assert.deepEqual(clauseOf(please, 'move').words.negation, ['not'])
  } finally {
    await reader.close()
  }
})
