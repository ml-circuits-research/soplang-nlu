import assert from 'node:assert/strict'
import {existsSync, readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {test} from 'node:test'
import {createReader} from '../lib/index.mjs'
import {hasCompleteSource} from '../lib/check-analysis.mjs'
import {vss, createVssReader} from '../strategies/vss/index.mjs'
import {readLegend, admitted} from '../strategies/vss/src/legend.mjs'
import {observe} from '../strategies/vss/src/observe.mjs'

const knowledgeDir = process.env.SOP_KNOWLEDGE_DIR ??
  fileURLToPath(new URL('../../sop-knowledge-worlds', import.meta.url))
const legendSource = readFileSync(new URL('../strategies/vss/legend.sop', import.meta.url), 'utf8')
const model = JSON.parse(readFileSync(new URL('../strategies/vss/model/model.json', import.meta.url), 'utf8'))

test('the legend confines grammar words and leaves the others open', () => {
  const legend = readLegend(legendSource)
  const places = (word, shape = 'lower') => [...admitted(legend, word, shape)].map((on, k) => on ? legend.stations[k].name : null).filter(Boolean)
  assert.deepEqual(places('the'), ['determiner'])
  assert.ok(places('circle').includes('noun') && places('circle').includes('predicate'))
  assert.ok(!places('circle').includes('determiner') && !places('circle').includes('cue'))
  assert.deepEqual(places('', 'quote'), ['literal'])
  assert.ok(places('to').includes('cue') && places('to').includes('infinitive'))
})

test('compounds, hyphenated words and quoted passages are single observations', () => {
  const legend = readLegend(legendSource)
  const words = text => observe(text, legend.compounds).map(token => token.word)
  assert.deepEqual(words('move it next to the soft-focus blur'), ['move', 'it', 'next to', 'the', 'soft-focus', 'blur'])
  assert.deepEqual(observe('write "open the window" here', legend.compounds).map(token => token.shape), ['lower', 'quote', 'lower'])
  assert.deepEqual(words('to 260,180'), ['to', '260,180'])
})

test('the reader cuts a message into wires and links them', () => {
  const reader = createVssReader(model)
  const sop = text => reader.analyse(text).analyses[0].sop
  const move = sop('Move the blue box towards the yellow circle.')
  assert.match(move, /nlu\.clause form=imperative predicate="Move" direct_object=\$e1 terminator="\."/)
  assert.match(move, /@e1 nlu\.entity determiner="the" modifier="blue" head="box"/)
  assert.match(move, /nlu\.relation kind=towards from=\$c1 to=\$e2 cue="towards"/)
  // a word read as a verb or as a thing by its place alone
  const chart = sop('chart the flights by destination as a bar chart')
  assert.match(chart, /predicate="chart"/)
  assert.match(chart, /head="chart"/)
  // a question with the helping verb before its subject
  assert.match(sop('could you increase the mouth by 10 percent?'), /form=interrogative predicate="increase" auxiliary="could" subject=\$e1/)
  // a participle after a thing opens a clause about that thing
  const cat = sop('a small grey cat sitting in the corner')
  assert.match(cat, /form=fragment topic=\$e1/)
  assert.match(cat, /form=nonfinite predicate="sitting"/)
  assert.match(cat, /kind=nominal_clause from=\$e1 to=\$c2/)
})

test('a doubtful attachment gives two readings', () => {
  // with every attachment held doubtful, the relation is read from the clause and from the entity
  const reader = createVssReader(model, {ambiguous: Infinity})
  const {analyses} = reader.analyse('put a hat on the man')
  assert.equal(analyses.length, 2)
  const starts = analyses.map(({sop}) => /kind=on from=\$(\w)/u.exec(sop)[1]).sort()
  assert.deepEqual(starts, ['c', 'e'])
  // with none held doubtful there is one reading
  assert.equal(createVssReader(model, {ambiguous: 0}).analyse('put a hat on the man').analyses.length, 1)
})

test('a segment built like the one before it is a clause that shares the verb', () => {
  const read = text => createVssReader(model).analyse(text).analyses[0].sop
  const pairs = read('Make the second box blue and the first one green')
  assert.match(pairs, /predicate="Make" direct_object=\$e1 result_complement="blue"/)
  assert.match(pairs, /form=fragment direct_object=\$e2 result_complement="green"/)
  assert.match(pairs, /nlu\.coordination kind=additive member=\$c1 member=\$c2 cue="and"/)
  assert.match(pairs, /@e2 nlu\.entity determiner="the" modifier="first" head="one"/)
  // two things with nothing of their own are one object
  assert.match(read('Move the red circle and the blue square'), /direct_object=\$k1/)
  // a second verb is a second clause
  assert.match(read('Move the red circle and thank Sam'), /predicate="thank" direct_object=\$e2/)
  // a participle describes the thing that was placed, not the place
  assert.match(read('put a man on the path wearing a blue cap'), /kind=nominal_clause from=\$e1 to=\$c2/)
})

test('pairs that differ in one point of structure are read differently', () => {
  const read = text => createVssReader(model).analyse(text).analyses[0].sop
  // each measure keeps its own direction; swapping the directions swaps the pairs
  const first = read('move it 520 across and 410 down'), swapped = read('move it 520 down and 410 across')
  assert.match(first, /literal="520" adverb="across"/)
  assert.match(first, /literal="410" adverb="down"/)
  assert.match(swapped, /literal="520" adverb="down"/)
  assert.match(swapped, /literal="410" adverb="across"/)
  // two bare things after a verb: given to someone, or made into something
  assert.match(read('Give the snowman a smile'), /indirect_object=\$e1 direct_object=\$e2/)
  assert.match(read('Make the snowman a hero'), /direct_object=\$e1 predicative_entity=\$e2/)
  // "if" after a verb that takes questions is what is asked; elsewhere it is a condition
  assert.match(read('tell me if the box is red'), /clausal_complement=\$c2/)
  assert.match(read('move it if it fits'), /nlu\.relation kind=condition from=\$c1 to=\$c2 cue="if"/)
  // an opening clause hangs on the instruction that follows it; a bare mention stays on its own
  assert.match(read("while you're there, thin the lines"), /nlu\.relation kind=time from=\$c2 to=\$c1 cue="while"/)
  const mention = read('before I forget, a fireplace')
  assert.match(mention, /form=fragment topic=\$e2/)
  assert.doesNotMatch(mention, /direct_object/)
  // a number placed against a number is one measure
  assert.match(read('resize it to 240 by 160'), /kind=by from=\$e2 to=\$e3/)
})

test('a person given something is the indirect object', () => {
  const sop = createVssReader(model).analyse('give me a red circle').analyses[0].sop
  assert.match(sop, /indirect_object=\$e1 direct_object=\$e2/)
  assert.match(sop, /@e1 nlu\.entity pronoun="me"/)
})

test('vss readings pass the public adapter with every word accounted for', {skip: !existsSync(knowledgeDir) && 'needs a knowledge checkout'}, async () => {
  const reader = await createReader({strategy: vss, knowledgeDir})
  try {
    for (const text of [
      'Draw a picture, now!',
      'put a beanie on the avatar',
      'I need you to make a yellow triangle labelled Sales. I appreciate it.',
      'Hey, create a ellipse labelled Budget split; then connect Budget split to Rent. That would help.',
      'everything should be linked, I want to join each circle',
      'the dog by the trunk should be turned towards the left',
      'book Room 7 for Planning on 2026-12-19 from 11:00 UTC for 45 minutes.'
    ]) {
      const result = await reader.propose(text)
      assert.ok(result.candidates.length >= 1, text + ' ' + JSON.stringify(result.rejected))
      for (const candidate of result.candidates) assert.ok(hasCompleteSource(candidate.check), text + '\n' + candidate.sop)
    }
    assert.equal((await reader.propose('')).candidates.length, 0)
  } finally {
    await reader.close()
  }
})
