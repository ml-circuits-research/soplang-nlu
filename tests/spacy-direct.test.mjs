import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {test} from 'node:test'
import {createReader} from '../lib/index.mjs'
import {createAnalysisValidator, hasCompleteSource} from '../lib/check-analysis.mjs'
import {projectDependencies} from '../strategies/spacy-direct/project.mjs'
import {spacyDirect} from '../strategies/spacy-direct/index.mjs'

const knowledgeDir = process.env.SOP_KNOWLEDGE_DIR ??
  fileURLToPath(new URL('../../sop-knowledge-worlds', import.meta.url))

test('spacy-direct projects one reading through the public adapter', {
  skip: !process.env.SOP_NLU_SYNTAX_MODEL && 'Set SOP_NLU_SYNTAX_MODEL to test the optional spaCy model'
}, async () => {
  const reader = await createReader({strategy: spacyDirect, knowledgeDir})
  async function reading(text, complete = true) {
    const result = await reader.propose(text)
    assert.equal(result.analysisDiagnostics.projector, 'spacy-direct')
    assert.equal(result.candidates.length, 1, JSON.stringify(result.rejected))
    const [candidate] = result.candidates
    assert.equal(hasCompleteSource(candidate.check), complete, candidate.sop)
    return candidate.sop
  }
  try {
    const fragment = await reading('a bar chart of roles per role')
    assert.match(fragment, /nlu.clause form=fragment topic=\$n2/)
    assert.match(fragment, /kind=of from=\$n2/)
    const compound = await reading('Give me a greenhouse next to the house.')
    assert.match(compound, /kind=next_to .* cue="next to"/)
    assert.match(compound, /indirect_object=\$n\d+/)
    const embedded = await reading('I think the dog runs.')
    assert.match(embedded, /predicate="think".*clausal_complement=\$n2/)
    assert.match(embedded, /@n2 nlu.clause form=declarative predicate="runs"/)
    const coordinated = await reading('Move it beside the tree, the square, and the house, thanks!')
    assert.match(coordinated, /kind=additive member=\$n\d+ member=\$n\d+ member=\$n\d+/)
    assert.match(coordinated, /speech_act=gratitude expression="thanks" separator="," terminator="!"/)
    const contraction = await reading('I’ll move it.')
    assert.match(contraction, /auxiliary="’ll"/)
    assert.match(contraction, /pronoun="I"/)
    assert.match(await reading('Say "Order confirmed".'), /literal="\\"Order confirmed\\""/)
    const calendar = await reading('Meet on 2026-12-07 at 11:00 UTC.')
    assert.match(calendar, /literal="2026-12-07"/)
    assert.match(calendar, /literal="11:00" modifier="UTC"/)
    const partial = await reading('Move it toward.', false)
    assert.match(partial, /unresolved="toward"/)
    assert.doesNotMatch(partial, /kind=toward/)
  } finally {
    await reader.close()
  }
})

test('spacy-direct grounds result clauses and recursively visits prepositional landmarks', async () => {
  const text = 'Make the caps right above the bars bigger.'
  // A dependency analysis with an overt subject of the adjectival clause
  // and an adverb attached inside the preposition phrase.
  const grammar = [
    ['VERB', 'VB', 'ROOT', 0], ['DET', 'DT', 'det', 2], ['NOUN', 'NNS', 'nsubj', 7],
    ['ADV', 'RB', 'advmod', 4], ['ADP', 'IN', 'prep', 2], ['DET', 'DT', 'det', 6],
    ['NOUN', 'NNS', 'pobj', 4], ['ADJ', 'JJR', 'ccomp', 0], ['PUNCT', '.', 'punct', 0]
  ]
  const dependencies = [...text.matchAll(/[A-Za-z]+|[.]/gu)].map((match, i) => {
    const [word] = match
    const [pos, tag, dep, head] = grammar[i]
    return {i, text: word, start: match.index, end: match.index + word.length, pos, tag, dep, head, lemma: word.toLowerCase()}
  })
  const {sop} = projectDependencies(text, dependencies)
  const validate = await createAnalysisValidator({knowledgeDir})
  assert.ok(hasCompleteSource(validate(text, sop)), sop)
  assert.match(sop, /predicate="Make".*direct_object=\$n2 result_complement="bigger"/)
  assert.match(sop, /@n2 nlu.entity head="caps"/)
  assert.match(sop, /kind=above from=\$n2 to=\$n3 cue="above" adverb="right"/)
})

test('a capitalized workflow label used as a landmark retains its source spelling', async () => {
  const text = 'Route it around Verify.'
  const rows = [
    ['Route','VERB','VB','ROOT',0], ['it','PRON','PRP','dobj',0],
    ['around','ADP','IN','prep',0], ['Verify','VERB','VB','pobj',2],
    ['.','PUNCT','.','punct',0]
  ]
  let offset = 0
  const tokens = rows.map(([word,pos,tag,dep,head], i) => {
    const start = text.indexOf(word, offset)
    offset = start + word.length
    return {i,text:word,lemma:word.toLowerCase(),pos,tag,dep,head,start,end:offset}
  })
  const {sop} = projectDependencies(text,tokens)
  const validate = await createAnalysisValidator({knowledgeDir})
  assert.ok(hasCompleteSource(validate(text,sop)), sop)
  assert.match(sop,/kind=around /)
  assert.match(sop,/name="Verify"/)
  assert.doesNotMatch(sop,/predicate="Verify"/)
})
