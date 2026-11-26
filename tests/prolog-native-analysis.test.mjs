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

test('Prolog segments detached gratitude and preserves nominal or quoted mentions', {skip}, async () => {
  const reader = await createReader({strategy:prolog, knowledgeDir, swipl})
  try {
    const cases = [
      ['Give me an alligator, thanks', [
        /form=imperative predicate="Give" direct_object=\$e1 indirect_object=\$e2/u,
        /form=fragment expression="thanks" speech_act=gratitude separator=","/u
      ], [/act=send/u, /filler=","/u]],
      ['THX, move it.', [
        /@c1 nlu.clause form=fragment expression="THX" speech_act=gratitude separator=","/u,
        /@c2 nlu.clause form=imperative predicate="move"/u
      ], [/filler=","/u]],
      ['Can you draw a box?. Thanks!', [
        /form=interrogative .*terminator="\?\."/u,
        /@c2 nlu.clause form=fragment expression="Thanks" speech_act=gratitude terminator="!"/u
      ], [/filler=/u, /@c3 /u]],
      ['Move it!?! Thanks!!', [
        /terminator="!\?!"/u, /expression="Thanks" speech_act=gratitude terminator="!!"/u
      ], [/filler=/u, /@c3 /u]],
      ['thanks for sorting the calendar!', [
        /expression="thanks" speech_act=gratitude terminator="!" unresolved="for sorting the calendar"/u
      ], [/filler=/u]],
      ['Thank-you!', [/form=fragment expression="Thank-you" speech_act=gratitude terminator="!"/u], [/nlu.entity/u]],
      ['Move it — thank you.', [/form=fragment expression="thank you" speech_act=gratitude separator="—" terminator="\."/u], []],
      ['Move it thanks', [/form=imperative predicate="Move"/u, /expression="thanks" speech_act=gratitude/u],
        [/separator=/u]],
      ['Thanks for your help', [
        /head="help" determiner="your"/u, /kind=reason from=\$c1 to=\$e1 cue="for"/u,
        /expression="Thanks" speech_act=gratitude/u
      ], [/unresolved=/u]],
      ['Thanks to you for the help.', [
        /kind=recipient from=\$c1 to=\$e1 cue="to"/u, /kind=reason from=\$c1 to=\$e2 cue="for"/u
      ], [/unresolved=/u]],
      ['She thanks him', [
        /pronoun="She"/u, /pronoun="him"/u, /form=declarative predicate="thanks" subject=\$e1 direct_object=\$e2/u
      ], [/speech_act=gratitude/u]],
      ['Give thanks.', [/head="thanks"/u, /predicate="Give" direct_object=/u], [/speech_act=gratitude/u, /act=send/u]],
      ['Give them thanks.', [/predicate="Give"/u], [/speech_act=gratitude/u]],
      ['Send my thanks.', [/head="thanks" determiner="my"/u, /predicate="Send"/u], [/speech_act=gratitude/u]],
      ['Write "thanks".', [/name="thanks"/u, /predicate="Write"/u], [/speech_act=gratitude/u]],
      ['"thanks"', [/name="thanks"/u], [/speech_act=gratitude/u]],
      ['Give me a box.', [/predicate="Give" direct_object=\$e1 indirect_object=\$e2/u], [/act=send/u]]
    ]
    for (const [text, expected, excluded] of cases) {
      const result=await reader.propose(text)
      assert.equal(result.error,null)
      const [candidate]=result.candidates
      assert.ok(candidate?.check.valid, JSON.stringify(candidate?.check?.findings))
      assert.ok(candidate.check.coverage.allAccountedFor, text)
      for (const expression of expected) assert.match(candidate.sop,expression)
      for (const expression of excluded) assert.doesNotMatch(candidate.sop,expression)
    }
  } finally {
    await reader.close()
  }
})

test('Prolog keeps clock and decimal evidence indivisible', {skip}, async () => {
  const reader = await createReader({strategy:prolog, knowledgeDir, swipl})
  try {
    const cases = [
      ['Please, book Focus room for Planning on 2026-12-03 from 11:00 UTC for 45 minutes. Thanks!', [
        /head="11:00" modifier="UTC"/u, /kind=start_time .*cue="from"/u,
        /expression="Thanks" speech_act=gratitude/u
      ]],
      ['1.2', [/form=fragment unresolved="1\.2"/u]],
      ['Set width to -1.2. Thanks!', [/head="-1\.2"/u, /cue="to"/u, /expression="Thanks" speech_act=gratitude/u]],
      ['Draw 1.2 circles.', [/head="circles" quantity="1\.2"/u]]
    ]
    for (const [text, expected] of cases) {
      const result=await reader.propose(text)
      assert.equal(result.error,null)
      const [candidate]=result.candidates
      assert.ok(candidate?.check.valid, JSON.stringify(candidate?.check?.findings))
      assert.ok(candidate.check.coverage.allAccountedFor, text)
      for (const expression of expected) assert.match(candidate.sop,expression)
    }
  } finally {
    await reader.close()
  }
})

test('Prolog composes noun phrases, lists and nested prepositional relations', {skip}, async () => {
  const reader = await createReader({strategy:prolog, knowledgeDir, swipl})
  try {
    const cases = [
      ['Hide the sales chart.', [/head="chart" determiner="the" compound="sales"/u]],
      ['Draw a blue wug.', [/head="wug" determiner="a" modifier="blue" color=blue/u], [/kind=/u]],
      ['Draw the brick wall of the house.', [/compound="brick"/u, /kind=of from=\$e1 to=\$e2/u]],
      ['Draw the cat at the bottom of the picture.', [
        /kind=at from=\$c1 to=\$e2/u, /kind=of from=\$e2 to=\$e3/u
      ]],
      ['Move the ball to the right by one spot.', [/head="right"/u, /kind=measure from=\$c1 to=\$e3 cue="by"/u]],
      ['The dog and the cat moved.', [/form=declarative predicate="moved" subject=\$g1/u]],
      ['Draw a cat, a dog, and a bird.', [/member=\$e1 member=\$e2 member=\$e3 cue="," cue=", and"/u]]
    ]
    for (const [text, expected, excluded=[]] of cases) {
      const result=await reader.propose(text)
      assert.equal(result.error,null)
      assert.ok(result.candidates.length >= 1 && result.candidates.length <= 3)
      const [candidate]=result.candidates
      assert.ok(candidate?.check.valid, JSON.stringify(candidate?.check?.findings))
      assert.equal(candidate.check.sourceGaps.materialUnresolved,0,text)
      for (const expression of expected) assert.match(candidate.sop,expression)
      for (const expression of excluded) assert.doesNotMatch(candidate.sop,expression)
    }
  } finally {
    await reader.close()
  }
})

test('Prolog uses lexical valency to compose finite and nonfinite clauses', {skip}, async () => {
  const reader = await createReader({strategy:prolog, knowledgeDir, swipl})
  try {
    const cases = [
      ['I want you to draw a circle.', [
        /predicate="want" subject=\$e1 direct_object=\$e2 clausal_complement=\$c2/u,
        /form=nonfinite predicate="draw" direct_object=\$e3 marker="to"/u
      ]],
      ['Let us draw a circle.', [/predicate="Let" direct_object=\$e1 clausal_complement=\$c2/u,
        /form=nonfinite predicate="draw" direct_object=\$e2/u]],
      ['I think that she moved the box.', [
        /predicate="think" subject=\$e1 clausal_complement=\$c2/u,
        /form=declarative predicate="moved" subject=\$e2 direct_object=\$e3 marker="that"/u
      ]],
      ['I want you to try to draw it.', [
        /form=nonfinite predicate="try" clausal_complement=\$c3 marker="to"/u,
        /form=nonfinite predicate="draw" direct_object=\$e3 marker="to"/u
      ]],
      ['Start on 2027-02-19.', [/kind=time from=\$c1 to=\$e1 cue="on"/u, /predicate="Start" terminator=/u]],
      ['She arrives at 11:00.', [/kind=time from=\$c1 to=\$e2 cue="at"/u]]
    ]
    for (const [text, expected] of cases) {
      const result=await reader.propose(text)
      assert.equal(result.error,null)
      const [candidate]=result.candidates
      assert.ok(candidate?.check.valid, JSON.stringify(candidate?.check?.findings))
      assert.equal(candidate.check.sourceGaps.materialUnresolved,0,text)
      for (const expression of expected) assert.match(candidate.sop,expression)
    }
  } finally {
    await reader.close()
  }
})

test('Prolog keeps explicitly introduced labels and literals attached to their nouns', {skip}, async () => {
  const reader = await createReader({strategy:prolog, knowledgeDir, swipl})
  try {
    const cases = [
      ['Make a diamond labelled Home.', [/head="diamond"/u, /name="Home"/u,
        /kind=label from=\$e1 to=\$e2 cue="labelled"/u]],
      ['The chart called Sales is red.', [/kind=label from=\$e1 to=\$e2 cue="called"/u,
        /predicate="is" subject=\$e1 result_complement="red"/u]],
      ['Create a document titled Exam guidance containing "The delivery arrived this morning."',
        [/name="Exam guidance"/u, /kind=label from=\$e1 to=\$e2 cue="titled"/u,
          /literal="\\"The delivery arrived this morning\.\\""/u,
          /kind=content from=\$e1 to=\$e3 cue="containing"/u]],
      ['Select the word "deadline" in the Background paragraph.', [
        /head="word"/u, /literal="\\"deadline\\""/u, /kind=content from=\$e1 to=\$e2/u
      ]]
    ]
    for (const [text, expected] of cases) {
      const result=await reader.propose(text)
      assert.equal(result.error,null)
      const [candidate]=result.candidates
      assert.ok(candidate?.check.valid, JSON.stringify(candidate?.check?.findings))
      assert.equal(candidate.check.sourceGaps.materialUnresolved,0,text)
      for (const expression of expected) assert.match(candidate.sop,expression)
    }
  } finally {
    await reader.close()
  }
})

test('Prolog grounds wh slots, inversion without punctuation and passive auxiliaries', {skip}, async () => {
  const reader = await createReader({strategy:prolog, knowledgeDir, swipl})
  try {
    const cases = [
      ['Which chart did you update?', [/head="chart"/u, /pronoun="you"/u,
        /form=interrogative predicate="update" subject=\$e1 direct_object=\$e2 auxiliary="did" question="Which"/u]],
      ['Which events are on Work 7 on 2026-12-07?.', [
        /head="events"/u, /form=interrogative predicate="are" subject=\$e1 question="Which"/u
      ]],
      ['What colour are the hearts?', [
        /form=interrogative predicate="are" subject=\$e1 result_complement="colour" question="What"/u
      ]],
      ['Should the report be moved to 2026-11-18?', [
        /form=interrogative predicate="moved" subject=\$e1 auxiliary="Should" auxiliary="be"/u, /kind=time/u
      ]],
      ['Would you move the cat', [/form=interrogative predicate="move" subject=\$e1/u]],
      ["Let's finish the chart.", [/form=imperative predicate="finish" direct_object=\$e1 auxiliary="Let's"/u]]
    ]
    for (const [text, expected] of cases) {
      const result=await reader.propose(text)
      assert.equal(result.error,null)
      const [candidate]=result.candidates
      assert.ok(candidate?.check.valid, JSON.stringify(candidate?.check?.findings))
      assert.equal(candidate.check.sourceGaps.materialUnresolved,0,text)
      for (const expression of expected) assert.match(candidate.sop,expression)
    }
  } finally {
    await reader.close()
  }
})
