import {test} from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {createReader} from '../lib/reader.mjs'
import {hasCompleteSource} from '../lib/check-analysis.mjs'
import {neuroProlog} from '../strategies/neuro-prolog/index.mjs'

const knowledgeDir=process.env.SOP_KNOWLEDGE_DIR
const swipl=process.env.SWIPL || 'swipl'
const python=process.env.SOP_NLU_SYNTAX_PYTHON
const model=process.env.SOP_NLU_SYNTAX_MODEL
const skip=!knowledgeDir || !python || !model ? 'Set SOP_KNOWLEDGE_DIR and the Python dependency model options' :
  spawnSync(swipl,['--version']).status!==0 ? 'Set SWIPL to an available SWI-Prolog executable' : false

test('neuro-Prolog projects dependency evidence into independent, source-grounded SOP', {skip}, async () => {
  const reader=await createReader({strategy:neuroProlog,knowledgeDir,swipl,python,model,dependencyOnly:true})
  try {
    const cases=[
      ['I want you to draw a circle.', [
        /predicate="want" subject=\$e0 clausal_complement=\$c4/u,
        /form=nonfinite predicate="draw" subject=\$e2 marker="to" direct_object=\$e6/u
      ]],
      ['Can you make the box red?', [
        /form=interrogative predicate="make" auxiliary="Can" subject=\$e1 direct_object=\$e4 result_complement="red"/u
      ]],
      ['Don’t move it.', [/negation="Don’t" polarity=negative/u]],
      ['Give me an alligator, thanks', [
        /predicate="Give" indirect_object=\$e1 direct_object=\$e3/u,
        /expression="thanks" speech_act=gratitude separator=","/u
      ]],
      ['The dog’s collar is blue.', [/head="collar" possessor=\$e1 possessive_marker="’s"/u]],
      ['Move the cat by the bench, then add a box.', [
        /kind=sequence member=\$c0 member=\$c8 cue=", then"/u, /predicate="add" direct_object=\$e10/u
      ]],
      ['Give me a greenhouse next to the house.', [/kind=near .*cue="next to"/u]],
      ['Start on 2027-02-19.', [/kind=time .*cue="on"/u, /head="2027-02-19"/u]],
      ['Thanks for sorting the calendar!', [
        /expression="Thanks" speech_act=gratitude/u, /kind=reason .*cue="for"/u,
        /form=nonfinite predicate="sorting" direct_object=/u
      ]]
    ]
    for (const [text,expected] of cases) {
      const result=await reader.propose(text)
      assert.equal(result.error,null)
      assert.equal(result.analysisDiagnostics.model.library,'spacy')
      const [candidate]=result.candidates
      assert.equal(candidate?.origin,'dependency-prolog')
      assert.ok(hasCompleteSource(candidate.check),JSON.stringify(candidate.check))
      for (const pattern of expected) assert.match(candidate.sop,pattern)
    }
  } finally {
    await reader.close()
  }
})

test('neuro-Prolog ranks at most three distinct complete public analyses when available', {skip}, async () => {
  const reader=await createReader({strategy:neuroProlog,knowledgeDir,swipl,python,model})
  try {
    const result=await reader.propose('I saw the child with a toy on a bench.')
    assert.equal(result.error,null)
    assert.ok(result.candidates.length>=1 && result.candidates.length<=3)
    assert.ok(result.candidates.every(candidate=>hasCompleteSource(candidate.check)))
    assert.equal(new Set(result.candidates.map(candidate=>candidate.sop)).size,result.candidates.length)
  } finally {
    await reader.close()
  }
})
