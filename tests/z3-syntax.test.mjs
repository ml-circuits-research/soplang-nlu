// The Z3 strategies write the `syntax` schema: one circuit per message, read from the text
// alone, checked by the common reader with no knowledge repository.
// Run with: env -u SOP_KNOWLEDGE_DIR node --test tests/z3-syntax.test.mjs
// The part on the real dependency parser of neuro-z3 runs when SOP_NLU_SYNTAX_PYTHON and
// SOP_NLU_SYNTAX_MODEL name a Python with spaCy and an English model; otherwise it is skipped.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync, readdirSync} from 'node:fs'
import {createReader, parseCircuit, wordsOf} from '../lib/index.mjs'
import {z3} from '../strategies/z3/index.mjs'
import {neuroZ3} from '../strategies/neuro-z3/index.mjs'

const messages = [
  'move the blue box next to the red circle, and make it bigger.',
  'Could you move it?',
  'do not move it, please',
  'the box was moved by Ana',
  'I want to delete it',
  'put the lamp two inches from the edge',
  'make A blue and B green',
  'a blanket, a basket and a boy',
  'what colour is the castle?',
  'move it if it fits',
  'give the avatar a hat',
  'put it near Ben but not behind Jo',
  'the title is too long',
  'to fix the details, edit the members',
  'Thanks!',
  'I need you to add a flower called House; then put House below Smoke. I appreciate it.'
]

/** One valid circuit for the message, as wires: [{id, type, form, values(key), refs(key)}]. */
async function circuitOf(reader, text) {
  const result = await reader.propose(text)
  assert.equal(result.schema, 'syntax')
  assert.equal(result.candidates.length, 1, `${text}: ${result.error} ${JSON.stringify(result.rejected?.[0]?.check.findings ?? [])}`)
  const [{sop, check}] = result.candidates
  assert.equal(check.valid, true)
  assert.equal(check.placements.reduce((sum, place) => sum + place.last - place.first + 1, 0), wordsOf(text).length, 'every word once')
  assert.doesNotMatch(sop, /\b(?:nlu|w\.request)\./u)
  const wires = parseCircuit(sop).map((wire) => ({
    id: wire.id, type: wire.type.slice(7),
    form: wire.slots.find(([key]) => key === 'form')?.[1],
    values: (key) => wire.slots.filter(([name, raw]) => name === key && raw.startsWith('"')).map(([, raw]) => JSON.parse(raw)),
    refs: (key) => wire.slots.filter(([name, raw]) => name === key && raw.startsWith('$')).map(([, raw]) => raw.slice(1)),
    has: (key, value) => wire.slots.some(([name, raw]) => name === key && raw === value)
  }))
  const byId = new Map(wires.map((wire) => [wire.id, wire]))
  const of = (type) => wires.filter((wire) => wire.type === type)
  return {sop, wires, byId, clauses: of('clause'), nominals: of('nominal'), relations: of('relation'), coordinations: of('coordination'),
    clause: (verb) => wires.find((wire) => wire.type === 'clause' && wire.values('verb').includes(verb)),
    relation: (marker) => wires.find((wire) => wire.type === 'relation' && wire.values('marker').includes(marker))}
}

test('no knowledge repository is configured', () => {
  assert.equal(process.env.SOP_KNOWLEDGE_DIR, undefined, 'run this test with SOP_KNOWLEDGE_DIR unset')
  assert.equal(z3.schema, 'syntax')
  assert.equal(neuroZ3.schema, 'syntax')
})

test('the syntax path of both strategies reads no knowledge world and no older schema', () => {
  const files = [...readdirSync(new URL('../strategies/z3/src/syntax/', import.meta.url)).map((name) => '../strategies/z3/src/syntax/' + name),
    '../strategies/z3/index.mjs', '../strategies/neuro-z3/index.mjs', '../strategies/neuro-z3/evidence.mjs']
  for (const file of files) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /knowledgeDir|sop-knowledge-worlds|SOP_KNOWLEDGE_DIR|sopworld|nlu\.|w\.request|worlds\//u, file)
    for (const [, target] of source.matchAll(/^import .* from '([^']+)'/gmu)) {
      assert.match(target, /^(?:node:|\.\/|\.\.\/z3\/src\/syntax\/|\.\.\/neural-dependencies\/index\.mjs$|\.\/src\/syntax\/|(?:\.\.\/){4}lib\/syntax\.mjs$)/u, `${file} imports ${target}`)
    }
  }
})

test('z3 writes one valid syntax circuit per message', async (t) => {
  const reader = await createReader({strategy: z3})
  try {
    const circuits = new Map()
    for (const text of messages) circuits.set(text, await circuitOf(reader, text))
    assert.ok(circuits.size >= 12)
    const circuit = (text) => circuits.get(text)

    await t.test('commands, their complements and an unsettled attachment', () => {
      const {clause, relation, byId, coordinations} = circuit(messages[0])
      assert.equal(clause('move').form, 'imperative')
      assert.deepEqual(byId.get(clause('move').refs('complement')[0]).values('head'), ['box'])
      assert.deepEqual(byId.get(clause('move').refs('complement')[0]).values('dependent'), ['the', 'blue'])
      assert.ok(relation('next to').has('attachment', 'ambiguous'))
      assert.deepEqual(relation('next to').refs('from'), [clause('move').id])
      assert.deepEqual(byId.get(relation('next to').refs('to')[0]).values('head'), ['circle'])
      assert.equal(clause('make').form, 'imperative')
      assert.deepEqual(clause('make').values('modifier'), ['bigger'])
      assert.deepEqual(coordinations[0].values('conjunction'), ['and'])
      assert.deepEqual(coordinations[0].refs('conjunct'), [clause('move').id, clause('make').id])
    })
    await t.test('auxiliaries, negation, subject and form', () => {
      const asked = circuit('Could you move it?')
      assert.equal(asked.clauses.length, 1)
      assert.equal(asked.clause('move').form, 'interrogative')
      assert.deepEqual(asked.clause('move').values('auxiliary'), ['Could'])
      assert.deepEqual(asked.byId.get(asked.clause('move').refs('subject')[0]).values('head'), ['you'])
      const forbidden = circuit('do not move it, please').clause('move')
      assert.equal(forbidden.form, 'imperative')
      assert.deepEqual([forbidden.values('auxiliary'), forbidden.values('negation'), forbidden.values('discourse')], [['do'], ['not'], ['please']])
      const passive = circuit('the box was moved by Ana')
      assert.equal(passive.clause('moved').form, 'declarative')
      assert.deepEqual(passive.clause('moved').values('auxiliary'), ['was'])
      assert.deepEqual(passive.byId.get(passive.clause('moved').refs('subject')[0]).values('head'), ['box'])
      assert.deepEqual(passive.byId.get(passive.relation('by').refs('to')[0]).values('head'), ['Ana'])
      const stated = circuit('the title is too long').clause('is')
      assert.equal(stated.form, 'declarative')
      assert.deepEqual(stated.values('modifier'), ['too', 'long'])
      const question = circuit('what colour is the castle?')
      assert.equal(question.clause('is').form, 'interrogative')
      assert.ok(question.nominals.some((wire) => wire.values('dependent').includes('what') && wire.values('head').includes('colour')))
    })
    await t.test('the "to" of an infinitive and a subordinator are markers of relations', () => {
      const wanted = circuit('I want to delete it')
      assert.equal(wanted.clause('delete').form, 'nonfinite')
      assert.deepEqual([wanted.relation('to').refs('from'), wanted.relation('to').refs('to')], [[wanted.clause('want').id], [wanted.clause('delete').id]])
      const fronted = circuit('to fix the details, edit the members')
      assert.deepEqual([fronted.relation('to').refs('from'), fronted.relation('to').refs('to')], [[fronted.clause('edit').id], [fronted.clause('fix').id]])
      const conditional = circuit('move it if it fits')
      assert.equal(conditional.clause('fits').form, 'declarative')
      assert.deepEqual(conditional.relation('if').refs('to'), [conditional.clause('fits').id])
    })
    await t.test('the measure rule, two complements, a shared verb', () => {
      const measured = circuit('put the lamp two inches from the edge')
      assert.equal(measured.clause('put').refs('complement').length, 2)
      assert.deepEqual(measured.byId.get(measured.relation('from').refs('from')[0]).values('head'), ['inches'])
      assert.equal(circuit('give the avatar a hat').clause('give').refs('complement').length, 2)
      const gapped = circuit('make A blue and B green')
      const fragment = gapped.clauses.find((wire) => wire.form === 'fragment')
      assert.deepEqual(fragment.refs('ellipsis'), [gapped.clause('make').id])
      assert.deepEqual(fragment.values('modifier'), ['green'])
    })
    await t.test('coordinations of nominals and of relations, fragments and discourse', () => {
      const list = circuit('a blanket, a basket and a boy')
      assert.equal(list.clauses[0].form, 'fragment')
      assert.equal(list.coordinations[0].refs('conjunct').length, 3)
      const placed = circuit('put it near Ben but not behind Jo')
      assert.deepEqual(placed.relation('behind').values('negation'), ['not'])
      assert.deepEqual(placed.coordinations[0].refs('conjunct'), [placed.relation('near').id, placed.relation('behind').id])
      assert.ok(!placed.relation('near').has('attachment', 'ambiguous'))
      const thanks = circuit('Thanks!')
      assert.equal(thanks.clauses[0].form, 'fragment')
      assert.deepEqual(thanks.clauses[0].values('discourse'), ['Thanks'])
      const long = circuit(messages.at(-1))
      assert.deepEqual(long.clauses.map((wire) => wire.values('verb')[0]), ['need', 'add', 'called', 'put', 'appreciate'])
      assert.ok(long.coordinations.some((wire) => wire.values('conjunction').includes('then')))
    })
  } finally {
    await reader.close()
  }
})

// A dependency parser for the test: the labels a parser gives, written by hand.
const parses = {
  'delete the last row': 'delete/VERB/VB/ROOT/0 the/DET/DT/det/3 last/ADJ/JJ/amod/3 row/NOUN/NN/dobj/0',
  'make it tidy': 'make/VERB/VB/ROOT/0 it/PRON/PRP/nsubj/2 tidy/ADJ/JJ/ccomp/0',
  'set up the labels': 'set/VERB/VB/ROOT/0 up/ADP/RP/prt/0 the/DET/DT/det/3 labels/NOUN/NNS/dobj/0'
}
const handParser = {name: 'by hand', open: async () => ({
  metadata: {library: 'none'},
  async parse(text) {
    let at = 0
    return parses[text].split(' ').map((item, i) => {
      const [word, pos, tag, dep, head] = item.split('/')
      const start = text.indexOf(word, at)
      at = start + word.length
      return {i, text: word, start, end: at, pos, tag, dep, head: Number(head), lemma: word}
    })
  },
  async close() {}
})}

test('neuro-z3 hears the parser inside the constraint model', async () => {
  const reader = await createReader({strategy: neuroZ3, syntaxModel: handParser})
  try {
    const plain = await circuitOf(reader, 'delete the last row')
    assert.equal(plain.clause('delete').form, 'imperative')
    assert.deepEqual(plain.byId.get(plain.clause('delete').refs('complement')[0]).values('dependent'), ['the', 'last'])
    // the parser says what the usage model does not know: "tidy" describes, "up" is a particle
    const described = await circuitOf(reader, 'make it tidy')
    assert.deepEqual(described.clauses.map((wire) => wire.values('verb')), [['make']])
    assert.deepEqual(described.clause('make').values('modifier'), ['tidy'])
    const particle = await circuitOf(reader, 'set up the labels')
    assert.deepEqual(particle.clause('set').values('modifier'), ['up'])
    assert.equal(particle.relations.length, 0)
    assert.deepEqual(particle.byId.get(particle.clause('set').refs('complement')[0]).values('head'), ['labels'])
  } finally {
    await reader.close()
  }
})

test('neuro-z3 writes one valid syntax circuit per message with the real parser', async (t) => {
  let reader
  try {
    reader = await createReader({strategy: neuroZ3})
  } catch (error) {
    t.skip('no dependency parser: set SOP_NLU_SYNTAX_PYTHON and SOP_NLU_SYNTAX_MODEL (' + error.message.split('\n')[0].slice(0, 80) + ')')
    return
  }
  try {
    const circuits = new Map()
    for (const text of messages) circuits.set(text, await circuitOf(reader, text))
    assert.ok(circuits.size >= 12)
    const first = circuits.get(messages[0])
    assert.equal(first.clause('move').form, 'imperative')
    assert.deepEqual(first.byId.get(first.relation('next to').refs('to')[0]).values('head'), ['circle'])
    assert.deepEqual(first.clause('make').values('modifier'), ['bigger'])
    const asked = circuits.get('Could you move it?')
    assert.equal(asked.clause('move').form, 'interrogative')
    assert.deepEqual(asked.clause('move').values('auxiliary'), ['Could'])
    const wanted = circuits.get('I want to delete it')
    assert.deepEqual(wanted.relation('to').refs('to'), [wanted.clause('delete').id])
    const measured = circuits.get('put the lamp two inches from the edge')
    assert.deepEqual(measured.byId.get(measured.relation('from').refs('from')[0]).values('head'), ['inches'])
    const passive = circuits.get('the box was moved by Ana')
    assert.deepEqual(passive.clause('moved').values('auxiliary'), ['was'])
    assert.deepEqual(passive.byId.get(passive.relation('by').refs('to')[0]).values('head'), ['Ana'])
  } finally {
    await reader.close()
  }
})
