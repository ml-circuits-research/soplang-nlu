import assert from 'node:assert/strict'
import {fileURLToPath} from 'node:url'
import {test} from 'node:test'
import {createReader} from '../lib/index.mjs'
import {hasCompleteSource} from '../lib/check-analysis.mjs'
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
