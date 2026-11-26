import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {test} from 'node:test'
import {createReader} from '../lib/index.mjs'
import {hasCompleteSource} from '../lib/check-analysis.mjs'
import {spacyBeam} from '../strategies/spacy-beam/index.mjs'

const knowledgeDir = process.env.SOP_KNOWLEDGE_DIR ??
  fileURLToPath(new URL('../../sop-knowledge-worlds', import.meta.url))
const source = 'Add the box.'
const lexical = [
  ['Add', 0, 'VERB', 'VB'], ['the', 4, 'DET', 'DT'],
  ['box', 8, 'NOUN', 'NN'], ['.', 11, 'PUNCT', '.']
]
function tokens(arcs) {
  return lexical.map(([text, start, pos, tag], i) => ({
    i, text, start, end: start + text.length, pos, tag, lemma: text.toLowerCase(),
    dep: arcs[i][0], head: arcs[i][1]
  }))
}
const greedyPartial = tokens([['dep', 2], ['det', 2], ['ROOT', 2], ['punct', 2]])
const reading = role => tokens([['ROOT', 0], ['det', 2], [role, 0], ['punct', 0]])
const provider = (tokens, alternatives) => ({async open() {
  return {
    async parseBeam(text) {
      assert.equal(text, source)
      return {tokens, alternatives}
    },
    async close() {}
  }
}})
async function propose(tokens, alternatives) {
  const reader = await createReader({strategy: spacyBeam, knowledgeDir, syntaxModel: provider(tokens, alternatives)})
  try {
    return await reader.propose(source)
  } finally {
    await reader.close()
  }
}
const alternatives = [
  {score: 0.1, tokens: reading('attr')},
  {score: 0.8, tokens: reading('dobj')},
  {score: 0.4, tokens: reading('dative')}
]

test('spacy-beam keeps complete greedy first and caps distinct alternatives', async () => {
  const result = await propose(reading('attr'), alternatives)
  assert.equal(result.engine, 'spacy-beam')
  assert.equal(result.candidateCount, 3)
  assert.ok(result.candidates.every(candidate => hasCompleteSource(candidate.check)))
  assert.match(result.candidates[0].sop, /predicative_entity=/)
  assert.match(result.candidates[1].sop, /direct_object=/)
  assert.match(result.candidates[2].sop, /indirect_object=/)
  assert.deepEqual(result.candidates.map(candidate => candidate.beamScore), [undefined, 0.8, 0.4])
})

test('spacy-beam replaces a partial greedy only with complete alternatives', async () => {
  const replacement = await propose(greedyPartial, alternatives)
  assert.equal(replacement.candidateCount, 2)
  assert.ok(replacement.candidates.every(candidate => hasCompleteSource(candidate.check)))
  const fallback = await propose(greedyPartial, [{score: 0.1, tokens: greedyPartial}])
  assert.equal(fallback.candidateCount, 1)
  assert.ok(fallback.candidates[0].check.valid)
  assert.equal(hasCompleteSource(fallback.candidates[0].check), false)
  assert.match(fallback.candidates[0].sop, /unresolved="Add"/)
})

test('spacy-beam requires shared lexical evidence across hypotheses', async () => {
  const altered = reading('dobj')
  altered[2].pos = 'PROPN'
  const result = await propose(reading('attr'), [{score: 0.8, tokens: altered}])
  assert.equal(result.candidateCount, 0)
  assert.match(result.error, /share the source and lexical evidence/)
})
