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
import {homedir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createReader, validateSyntax, parseCircuit, coreOf, wordsOf} from '../lib/index.mjs'
import {distilBert} from '../strategies/distilbert/index.mjs'
import {modelTokens, writeSyntax} from '../strategies/distilbert/syntax.mjs'
import {neuroSelector} from '../strategies/neuro-selector/index.mjs'
import {settleAttachments} from '../strategies/neuro-selector/attachments.mjs'
import {selectorDistilBert, pairCircuits} from '../strategies/selector-distilbert/index.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const found = (variable, ...places) => process.env[variable] ?? places.find(place => existsSync(place))
const settings = {
  distilbertPython: found('SOP_NLU_DISTILBERT_PYTHON', join(homedir(), 'nlp-venv/bin/python')),
  distilbertModel: found('SOP_NLU_DISTILBERT_MODEL', join(root, '.local-models/distilbert/curated-ownership-v2/checkpoint')),
  python: found('SOP_NLU_SYNTAX_PYTHON', '/tmp/sop-nlu-trf-model/python-trf-one'),
  model: found('SOP_NLU_SYNTAX_MODEL', '/tmp/sop-nlu-trf-model/en_core_web_trf/en_core_web_trf-3.8.0'),
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

// ---- the output stage of the DistilBERT strategy, on predictions written by hand (no model needed)
const entity = (anchor, ...attrs) => ({anchor, type: 'nlu.entity', attrs})
const clause = (anchor, form, ...attrs) => ({anchor, type: 'nlu.clause', attrs: [{key: 'form', atom: form}, ...attrs]})
const relation = (anchor, ...attrs) => ({anchor, type: 'nlu.relation', attrs})
const span = (key, start, end = start + 1) => ({key, start, end})
const to = (key, target, ranked) => ({key, target, ...(ranked ? {ranked} : {})})
const written = (text, nodes, owners) => writeSyntax(text, modelTokens(text), {nodes, owners})

test('output stage: a measure before a marker is a nominal and the relation starts at it (Rule 4)', () => {
  const text = 'put the lamp two inches from the edge.'
  const sop = written(text, [
    clause(0, 'imperative', span('predicate', 0), to('direct_object', 1), span('terminator', 8)),
    entity(2, span('determiner', 1), span('head', 2)),
    entity(4, span('quantity', 3), span('head', 4)),
    relation(4, to('from', 0), {key: 'kind', atom: 'extent'}, to('to', 2)),
    relation(5, to('from', 0), {key: 'kind', atom: 'from'}, to('measure', 2), to('to', 5), span('cue', 5)),
    entity(7, span('determiner', 6), span('head', 7))])
  sameCircuit(text, sop, `@c1 syntax.clause form=imperative verb="put" complement=$n1 complement=$n2
@n1 syntax.nominal dependent="the" head="lamp"
@n2 syntax.nominal dependent="two" head="inches"
@r1 syntax.relation from=$n2 to=$n3 marker="from"
@n3 syntax.nominal dependent="the" head="edge"`)
})

test('output stage: the "to" of an infinitive marks the relation between the two clauses (Rule 5.4)', () => {
  const text = 'I want to delete it'
  const sop = written(text, [entity(0, span('pronoun', 0)),
    clause(1, 'declarative', span('predicate', 1), to('subject', 0), to('clausal_complement', 2)),
    clause(3, 'nonfinite', span('predicate', 3), span('marker', 2), to('direct_object', 3)),
    entity(4, span('pronoun', 4))])
  sameCircuit(text, sop, `@c1 syntax.clause form=declarative verb="want" subject=$n1
@n1 syntax.nominal head="I"
@c2 syntax.clause form=nonfinite verb="delete" complement=$n2
@n2 syntax.nominal head="it"
@r1 syntax.relation from=$c1 to=$c2 marker="to"`)
  // nothing stands before the marker: the relation starts at the main clause
  const fronted = 'to fix the details, edit the members'
  const wires = shape(fronted, written(fronted, [
    clause(1, 'nonfinite', span('predicate', 1), span('marker', 0), to('direct_object', 1)), entity(3, span('determiner', 2), span('head', 3)),
    clause(5, 'imperative', span('predicate', 5), to('direct_object', 3)), entity(7, span('determiner', 6), span('head', 7))]))
  assert.equal(relationOf(wires, 'to').to.from[0], clauseOf(wires, 'edit'))
  assert.equal(relationOf(wires, 'to').to.to[0], clauseOf(wires, 'fix'))
})

test('output stage: a conjunct without a verb names the clause whose verb it shares (Rule 3)', () => {
  const gapped = 'make A blue and B green'
  sameCircuit(gapped, written(gapped, [
    clause(0, 'imperative', span('predicate', 0), to('direct_object', 1), span('result_complement', 2)), entity(1, span('head', 1)),
    {anchor: 3, type: 'nlu.coordination', attrs: [to('member', 0), to('member', 3), span('cue', 3)]},
    clause(4, 'fragment', to('topic', 4), span('result_complement', 5)), entity(4, span('head', 4))]),
  `@c1 syntax.clause form=imperative verb="make" complement=$n1 modifier="blue"
@n1 syntax.nominal head="A"
@c2 syntax.clause form=fragment complement=$n2 modifier="green" ellipsis=$c1
@n2 syntax.nominal head="B"
@k1 syntax.coordination conjunct=$c1 conjunct=$c2 conjunction="and"`)
  // a conjunct that holds a discourse word only shares nothing
  const thanks = 'move the box, and thanks'
  const wires = shape(thanks, written(thanks, [
    clause(0, 'imperative', span('predicate', 0), to('direct_object', 1)), entity(2, span('determiner', 1), span('head', 2)),
    {anchor: 4, type: 'nlu.coordination', attrs: [to('member', 0), to('member', 3), span('cue', 3), span('cue', 4)]},
    clause(5, 'fragment', span('expression', 5))]))
  assert.equal(wires.some(wire => wire.to.ellipsis), false)
  assert.deepEqual(wires.find(wire => wire.type === 'coordination').words.conjunction, ['and'])
})

test('output stage: an attachment the model hesitates on is left unsettled (Rule 2)', () => {
  const text = 'put the cat on the table'
  const nodes = ranked => [clause(0, 'imperative', span('predicate', 0), to('direct_object', 1)), entity(2, span('determiner', 1), span('head', 2)),
    relation(3, to('from', ranked[0].target, ranked), to('to', 3), span('cue', 3)), entity(5, span('determiner', 4), span('head', 5))]
  const unsettled = `@c1 syntax.clause form=imperative verb="put" complement=$n1
@n1 syntax.nominal dependent="the" head="cat"
@r1 syntax.relation from=$c1 to=$n2 marker="on" attachment=ambiguous
@n2 syntax.nominal dependent="the" head="table"`
  sameCircuit(text, written(text, nodes([{target: 0, p: .55}, {target: 1, p: .45}])), unsettled)
  sameCircuit(text, written(text, nodes([{target: 1, p: .6}, {target: 0, p: .4}])), unsettled)
  sameCircuit(text, written(text, nodes([{target: 0, p: .95}, {target: 1, p: .05}])), unsettled.replace(' attachment=ambiguous', ''))
  sameCircuit(text, written(text, nodes([{target: 1, p: .95}, {target: 0, p: .05}])), unsettled.replace(' attachment=ambiguous', '').replace('from=$c1', 'from=$n1'))
})

test('output stage: every word gets one place and punctuation none', () => {
  // the model left "red" and "now" without a slot; its ownership head names where they belong
  const text = 'move the red box, now.'
  const owners = modelTokens(text).map(() => [])
  owners[2] = [{node: 1, key: 'modifier', inside: false, p: .4}]
  owners[5] = [{node: 0, key: 'adverb', inside: false, p: .3}]
  sameCircuit(text, written(text, [clause(0, 'imperative', span('predicate', 0), to('direct_object', 1), span('separator', 4), span('terminator', 6)),
    entity(3, span('determiner', 1), span('head', 3))], owners),
  `@c1 syntax.clause form=imperative verb="move" modifier="now" complement=$n1
@n1 syntax.nominal dependent="the" dependent="red" head="box"`)
  // with no clause from the model, the nominal stands in a fragment
  const bare = 'the level of Intro'
  sameCircuit(bare, written(bare, [entity(1, span('determiner', 0), span('head', 1)), relation(2, to('from', 0), to('to', 2), span('cue', 2)), entity(3, span('name', 3))]),
    `@c1 syntax.clause form=fragment complement=$n1
@n1 syntax.nominal dependent="the" head="level"
@n2 syntax.nominal head="Intro"
@r1 syntax.relation from=$n1 to=$n2 marker="of"`)
  assert.throws(() => written('move it', []), /no node/u)
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

test('distilbert: opens with no knowledge directory and reports a worker that cannot start', async () => {
  await assert.rejects(createReader({strategy: distilBert, modelPath: undefined}), /SOP_NLU_DISTILBERT_MODEL|modelPath/u)
  await assert.rejects(createReader({strategy: distilBert, python: 'node', modelPath: root, workerPath: join(root, 'package.json')}), /DistilBERT/u)
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
