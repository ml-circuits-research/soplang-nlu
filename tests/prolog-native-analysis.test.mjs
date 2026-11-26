import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {test} from 'node:test'
import {createReader} from '../lib/reader.mjs'
import {prolog} from '../strategies/prolog/index.mjs'

const knowledgeDir = process.env.SOP_KNOWLEDGE_DIR
const swipl = process.env.SWIPL || 'swipl'
const skip = !knowledgeDir ? 'Set SOP_KNOWLEDGE_DIR to run the Prolog integration test' :
  spawnSync(swipl, ['--version']).status !== 0 ? 'Set SWIPL to an available SWI-Prolog executable' : false

test('native Prolog represents clauses, entities, relations, and uncertainty with exact evidence', {skip}, async () => {
  const reader = await createReader({strategy:prolog, knowledgeDir, swipl})
  try {
    const cases = [
      ['Can you move the blue box under the bench?', [/form=interrogative predicate="move"/u,
        /pronoun="you"/u, /head="box" determiner="the" modifier="blue" kind=box color=blue/u,
        /nlu.relation kind=below from=\$c1 to=\$e3 cue="under"/u, /auxiliary="Can"/u]],
      ["Don't move it.", [
        /form=imperative predicate="move"/u, /pronoun="it"/u, /negation="Don't"/u, /polarity=negative/u
      ]],
      ['The box is not red.', [
        /form=declarative predicate="is" subject=\$e1/u, /result_complement="red"/u, /result_color=red/u
      ]],
      ['Move A below B, then erase it.', [
        /name="A"/u, /name="B"/u, /kind=sequence member=\$c1 member=\$c2 cue=", then"/u
      ]],
      ['Pick two red cats.', [/head="cats" quantity="two"/u, /color=red/u]],
      ['If the box is blue, move it.', [/nlu.relation kind=condition from=\$c2 to=\$c1 cue="If"/u]],
      ['Nothing!', [/pronoun="Nothing"/u, /form=fragment topic=\$e1/u]],
      ['Flormg 🪐', [/form=fragment unresolved="Flormg" unresolved="🪐"/u]]
    ]
    for (const [text, expected] of cases) {
      const result=await reader.propose(text)
      assert.equal(result.error,null)
      assert.equal(result.analysisDiagnostics.solver,'swipl')
      assert.ok(!result.legacy, 'Public native analysis must not depend on legacy candidate generation')
      const [candidate]=result.candidates
      assert.ok(candidate?.check?.valid, JSON.stringify(candidate?.check?.findings))
      assert.ok(candidate.check.coverage.allAccountedFor, text)
      for (const expression of expected) assert.match(candidate.sop,expression)
    }

    const attachment = await reader.propose('I saw the man with a telescope.')
    assert.equal(attachment.candidates.length, 2)
    assert.ok(attachment.candidates.every(candidate=>candidate.check.valid))
    assert.match(attachment.candidates[0].sop,/kind=with from=\$c1 to=\$e3/u)
    assert.match(attachment.candidates[1].sop,/kind=with from=\$e2 to=\$e3/u)
  } finally {
    await reader.close()
  }
})

test('Prolog dual proposals retain their legacy circuits and supply native analysis independently', {skip}, async () => {
  const engine = await prolog.open({knowledgeDir,swipl})
  try {
    const known = await engine.propose('Move the blue box under the bench.')
    assert.ok(known.candidates.length)
    assert.ok(known.candidates.every(({sop,analysisSop})=>sop.includes('w.request.') && analysisSop.includes('nlu.clause')))
    const unknown = await engine.propose('flormg')
    assert.deepEqual(unknown.candidates,[])
    assert.match(unknown.analyses[0].sop,/unresolved="flormg"/u)
  } finally {
    await engine.close()
  }
})
