import test from 'node:test'
import assert from 'node:assert/strict'
import {createSyntaxReader} from '../lib/syntax.mjs'
const facts = [
  ['w.lang.en.closed',{text:['nothing'],class:['pronoun']}],
  ['w.lang.en.neg',{text:['nothing']}],
  ['w.lang.en.closed',{text:['the'],class:['determiner']}],
  ['k.words.sense',{word:['red'],pos:['adjective']}],
  ['k.words.sense',{word:['circle'],pos:['noun']}],
  ['w.lang.en.skip',{text:['"thank you"'],class:['politeness']}]
].map(([type,attrs]) => ({type,attrs}))
const analyse = createSyntaxReader(facts)
test('grounds an autonomous pronoun and punctuation without inventing an action', () => {
  const {sop} = analyse('nothing!')
  assert.match(sop,/start=0 end=7 text="nothing" cue="negative" pos="pronoun"/)
  assert.match(sop,/start=7 end=8 text="!" pos="punctuation"/)
  assert.match(sop,/form=nominal head=\$s1/)
})
test('preserves exact offsets, multiword cues, unknowns and phrase attachments', () => {
  const {sop} = analyse('🟠 the red circle, thank  you')
  assert.match(sop,/start=0 end=2 text="🟠" cue="unclassified"/)
  assert.match(sop,/start=3 end=17 text="the red circle" form=nominal head=\$s4 determiner=\$s2 modifier=\$s3/)
  assert.match(sop,/text="thank  you" cue="politeness"/)
})
