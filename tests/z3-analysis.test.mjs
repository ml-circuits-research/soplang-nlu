import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createAnalysisValidator, hasCompleteSource } from '../lib/check-analysis.mjs'
import { z3 } from '../strategies/z3/index.mjs'

const knowledgeDir = process.env.SOP_KNOWLEDGE_DIR ??
  fileURLToPath(new URL('../../sop-knowledge-worlds', import.meta.url))
const require = createRequire(new URL('../strategies/z3/index.mjs', import.meta.url))
let skip = !existsSync(join(knowledgeDir, 'tools/sopworld/sopworld.mjs')) && 'Requires the SOP knowledge checkout'
try { require.resolve('z3-solver') } catch { skip ||= 'Requires npm ci --prefix strategies/z3' }

test('Z3 solves integrated roles independently of archived formalisation', {skip}, async (t) => {
  const reader = await z3.open({knowledgeDir})
  const validate = await createAnalysisValidator({knowledgeDir})
  const analyse = async (text) => {
    const result = await reader.analyse(text)
    assert.equal(result.analysisDiagnostics.solver, 'z3')
    assert.equal(result.analysisDiagnostics.status, 'sat')
    assert.ok(result.analyses.length, text)
    for (const {sop, tokens, objective} of result.analyses) {
      const check = validate(text, sop)
      assert.equal(check.valid, true, JSON.stringify(check.findings))
      assert.equal(check.coverage.uncovered, 0, text)
      assert.equal(typeof objective, 'number')
      for (const token of tokens) assert.equal(text.slice(token.start, token.end), token.text)
    }
    return result.analyses
  }

  try {
    await t.test('separates prenominal modifiers and result complements', async () => {
      const [described] = await analyse('Move the red circle.')
      assert.match(described.sop, /modifier="red" color=red head="circle"/)
      assert.doesNotMatch(described.sop, /result_complement=/)
      const [result] = await analyse('Paint the circle red.')
      assert.match(result.sop, /predicate="Paint".*direct_object=\$e1 result_complement="red" result_color=red/)
      assert.deepEqual(result.semanticEvidence.find(({key}) => key === 'result_color'), {
        wire: 'c1', key: 'result_color', value: 'red',
        source: [{slot: 'result_complement', text: 'red'}], binding: 'Z3 colour vocabulary'
      })
      assert.doesNotMatch(result.sop, /modifier="red"/)
      assert.equal(result.tokens.find(({text}) => text === 'Paint').pos, 'verb')
      assert.equal(result.tokens.find(({text}) => text === 'red').pos, 'adjective')
    })

    await t.test('preserves PP attachment ambiguity', async () => {
      const analyses = await analyse('Put the box on the table by the door.')
      const nearHosts = new Set(analyses.map(({sop}) => /kind=near from=([^ ]+)/.exec(sop)?.[1]))
      assert.deepEqual(nearHosts, new Set(['$c1', '$e2']))
      assert.equal(new Set(analyses.map(({objective}) => objective)).size, 1)
    })

    await t.test('solves both scopes of shared negation and keeps independent clause coordination', async () => {
      const analyses = await analyse('Do not move the circle and paint it.')
      const secondPolarities = new Set(analyses.map(({sop}) => /predicate="paint".*polarity=(\w+)/.exec(sop)?.[1]))
      assert.deepEqual(secondPolarities, new Set(['positive', 'negative']))
      for (const {sop} of analyses) {
        assert.match(sop, /auxiliary="Do" negation="not" polarity=negative/)
        assert.equal((sop.match(/negation="not"/g) ?? []).length, 1)
        assert.match(sop, /nlu.coordination kind=additive member=\$c1 member=\$c2 cue="and"/)
        assert.match(sop, /nlu.entity pronoun="it"/)
      }
    })

    await t.test('keeps explicit recipients, quantities, entity coordination and fragment topics', async () => {
      const [transfer] = await analyse('She gave him two apples.')
      assert.match(transfer.sop, /quantity="two" head="apples"/)
      assert.match(transfer.sop, /subject=\$e1 direct_object=\$e3 indirect_object=\$e2/)
      assert.doesNotMatch(transfer.sop, /act=/)
      const [list] = await analyse('Add a blue circle and a red square.')
      assert.match(list.sop, /nlu.coordination kind=additive member=\$e1 member=\$e2 cue="and"/)
      assert.match(list.sop, /head="square"/)
      const [fragment] = await analyse('Nothing!')
      assert.match(fragment.sop, /pronoun="Nothing"/)
      assert.match(fragment.sop, /form=fragment terminator="!" topic=\$e1/)
      assert.doesNotMatch(fragment.sop, /predicate=|direct_object=/)
    })

    await t.test('keeps exact question evidence and Unicode names', async () => {
      const [question] = await analyse('Which charts are visible?')
      assert.match(question.sop, /form=interrogative predicate="are".*question="Which".*result_complement="visible"/)
      const [declaration] = await analyse('I like Zürich.')
      assert.match(declaration.sop, /name="Zürich"/)
      assert.match(declaration.sop, /form=declarative predicate="like"/)
    })

    await t.test('separates finite adjuncts from argument complements and nominal PPs', async () => {
      const [condition] = await analyse('If the lamp fades, close the window.')
      assert.equal(hasCompleteSource(validate('If the lamp fades, close the window.', condition.sop)), true)
      assert.match(condition.sop, /kind=condition from=\$c2 to=\$c1 cue="If"/)
      assert.match(condition.sop, /@c1 nlu.clause form=declarative predicate="fades".*subject=\$e1/)
      assert.match(condition.sop, /@c2 nlu.clause form=imperative predicate="close".*separator=","/)
      const [purpose] = await analyse('Keep the gate open so that the dog can run.')
      assert.match(purpose.sop, /kind=purpose from=\$c1 to=\$c2 cue="so that"/)
      assert.match(purpose.sop, /direct_object=\$e1 result_complement="open"/)
      assert.match(purpose.sop, /predicate="run" auxiliary="can".*subject=\$e2/)
      assert.deepEqual(purpose.unresolved, [])
      const [question] = await analyse('Can you leave before the train arrives?')
      assert.match(question.sop, /kind=time from=\$c1 to=\$c2 cue="before"/)
      assert.match(question.sop, /@c1 nlu.clause form=interrogative predicate="leave".*terminator="\?"/)
      assert.match(question.sop, /@c2 nlu.clause form=declarative predicate="arrives"/)
      const [content] = await analyse('She asked if the train stops.')
      assert.match(content.sop, /kind=complement from=\$c1 to=\$c2 cue="if"/)
      assert.match(content.sop, /predicate="asked".*clausal_complement=\$c2/)
      const [landmark] = await analyse('Move the box before the window.')
      assert.match(landmark.sop, /kind=before.*to=\$e2 cue="before"/)
      assert.doesNotMatch(landmark.sop, /@c2 nlu.clause/)
    })

    await t.test('grounds genitive owners as separate entities with exact source evidence', async () => {
      const [common] = await analyse("Move the old teacher's desk.")
      assert.match(common.sop, /@p1 nlu.entity determiner="the" modifier="old" head="teacher's"/)
      assert.match(common.sop, /@e1 nlu.entity possessor=\$p1 head="desk"/)
      assert.match(common.sop, /predicate="Move".*direct_object=\$e1/)
      assert.deepEqual(common.unresolved, [])
      const [proper] = await analyse('Find Alice’s red notebook.')
      assert.match(proper.sop, /@p1 nlu.entity name="Alice’s"/)
      assert.match(proper.sop, /@e1 nlu.entity possessor=\$p1 modifier="red".*head="notebook"/)
      assert.deepEqual(proper.unresolved, [])
      const [ordinary] = await analyse("Let's change the chart.")
      assert.doesNotMatch(ordinary.sop, /possessor=/)
    })

    await t.test('uses high-confidence lexical evidence for otherwise unknown adjectives', async () => {
      const [reading] = await analyse('Because she was unhappy, I changed the plan.')
      assert.match(reading.sop, /predicate="was".*result_complement="unhappy"/)
      assert.deepEqual(reading.unresolved, [])
    })

    await t.test('grounds licensed particles and embedded clause heads', async () => {
      const [phrasal] = await analyse('Take it apart.')
      assert.match(phrasal.sop, /predicate="Take" act=take_apart.*particle="apart"/)
      assert.deepEqual(phrasal.semanticEvidence.find(({key}) => key === 'act').source, [
        {slot: 'predicate', text: 'Take'}, {slot: 'particle', text: 'apart'}
      ])
      const [embedded] = await analyse('I think the dog runs.')
      assert.match(embedded.sop, /predicate="think".*clausal_complement=\$c2/)
      assert.match(embedded.sop, /@c2 nlu.clause form=declarative predicate="runs".*subject=\$e2/)
      const [temporal] = await analyse('Move the chair now.')
      assert.match(temporal.sop, /adverb="now"/)
    })

    await t.test('composes compounds, modal inversion, and separately grounded degree', async () => {
      const [analysis] = await analyse('Could you move the office chair much closer')
      assert.match(analysis.sop, /determiner="the" compound="office" head="chair"/)
      assert.match(analysis.sop, /form=interrogative predicate="move".*auxiliary="Could".*subject=\$e1 direct_object=\$e2 degree="much" result_complement="closer"/)
      assert.deepEqual(analysis.unresolved, [])
      const [statement] = await analyse('The dog and the cat ran.')
      assert.match(statement.sop, /kind=additive member=\$e1 member=\$e2 cue="and"/)
      assert.match(statement.sop, /form=declarative predicate="ran".*subject=\$coord1/)
      assert.doesNotMatch(statement.sop, /act=place/)
    })

    await t.test('grounds marked and bare nonfinite complements', async () => {
      const [marked] = await analyse('I need you to pack the seat cushion.')
      assert.match(marked.sop, /predicate="need".*clausal_complement=\$c2 subject=\$e1 direct_object=\$e2/)
      assert.match(marked.sop, /form=nonfinite marker="to" predicate="pack".*direct_object=\$e3/)
      assert.match(marked.sop, /compound="seat" head="cushion"/)
      assert.deepEqual(marked.unresolved, [])
      const [bare] = await analyse('Make the lamp glow.')
      assert.match(bare.sop, /predicate="Make".*clausal_complement=\$c2 direct_object=\$e1/)
      assert.match(bare.sop, /form=nonfinite predicate="glow"/)
      assert.deepEqual(bare.unresolved, [])
    })

    await t.test('distinguishes nominal predication from receiving a theme', async () => {
      const [copula] = await analyse('It is a large circle.')
      assert.match(copula.sop, /modifier="large" head="circle".*\n@c1.*subject=\$e1 predicative_entity=\$e2/)
      assert.doesNotMatch(copula.sop, /direct_object=/)
      const [result] = await analyse('Can you make it a straight shot?')
      assert.match(result.sop, /form=interrogative predicate="make".*direct_object=\$e2 predicative_entity=\$e3/)
      const [theme] = await analyse('She made me a sandwich.')
      assert.match(theme.sop, /direct_object=\$e3 indirect_object=\$e2/)
    })

    await t.test('keeps relative attachments and measured complements compositional', async () => {
      const [relative] = await analyse('The old man saw the girl who carried a bag.')
      assert.match(relative.sop, /kind=subject_relative from=\$e2 to=\$c2 cue="who"/)
      assert.match(relative.sop, /form=declarative predicate="carried".*direct_object=\$e3/)
      assert.doesNotMatch(relative.sop, /form=interrogative|clausal_complement=/)
      assert.deepEqual(relative.unresolved, [])
      const [measured] = await analyse('Make his moustache thirty percent bigger.')
      assert.match(measured.sop, /determiner="his" head="moustache"/)
      assert.match(measured.sop, /direct_object=\$e1 degree="thirty percent" result_complement="bigger"/)
      assert.deepEqual(measured.unresolved, [])
    })

    await t.test('separates coordinated attachments and reserves compound preposition evidence', async () => {
      const [sequence] = await analyse('Add a circle, and then make it red.')
      assert.match(sequence.sop, /kind=sequence member=\$c1 member=\$c2 cue="," cue="and" cue="then"/)
      assert.deepEqual(sequence.unresolved, [])
      const [landmarks] = await analyse('Move the circle beside the square and the triangle.')
      assert.match(landmarks.sop, /kind=additive member=\$e2 member=\$e3 cue="and"/)
      assert.match(landmarks.sop, /kind=near from=\$c1 to=\$coord1 cue="beside"/)
      assert.deepEqual(landmarks.unresolved, [])
      const readings = await analyse('Take the circle out of the picture.')
      assert.ok(readings.length <= 3)
      assert.ok(readings.some(({sop}) => sop.includes('cue="out of"')))
      for (const {sop} of readings) {
        if (sop.includes('cue="out of"')) assert.doesNotMatch(sop, /particle="out"/)
      }
    })

    await t.test('chooses clause or phrase coordination from competing source roles', async () => {
      const [numbered] = await analyse('March gets 40 and April gets 32')
      assert.match(numbered.sop, /name="March".*\n@e2 nlu.entity head="40"/)
      assert.match(numbered.sop, /name="April".*\n@e4 nlu.entity head="32"/)
      assert.match(numbered.sop, /member=\$c1 member=\$c2 cue="and"/)
      assert.equal((numbered.sop.match(/form=declarative predicate="gets"/g) ?? []).length, 2)
      const [fragment] = await analyse('a bar chart of roles per role')
      assert.match(fragment.sop, /compound="bar" head="chart"/)
      assert.match(fragment.sop, /form=fragment topic=\$e1/)
      assert.doesNotMatch(fragment.sop, /predicate=/)
      assert.deepEqual(fragment.unresolved, [])
      const [listed] = await analyse('Move it beside the tree, the square, and the house.')
      assert.match(listed.sop, /member=\$e2 member=\$e3 member=\$e4 cue="," cue="," cue="and"/)
      assert.match(listed.sop, /kind=near from=\$c1 to=\$coord1/)
      assert.deepEqual(listed.unresolved, [])
    })

    await t.test('separates initial, final and standalone gratitude from argument roles', async () => {
      for (const [text, phrase, separated] of [
        ['Thanks, move it.', 'Thanks', true],
        ['Move it, thanks.', 'thanks', true],
        ['Move it thanks', 'thanks', false],
        ['Thank  you!', 'Thank  you', false],
        ['Thx.', 'Thx', false]
      ]) {
        const [analysis] = await analyse(text)
        const gratitude = analysis.sop.split('\n').find((line) => line.includes('speech_act=gratitude'))
        assert.ok(gratitude, text)
        assert.ok(gratitude.includes('form=fragment expression=' + JSON.stringify(phrase)), text)
        assert.equal(gratitude.includes('separator=","'), separated, text)
        assert.doesNotMatch(gratitude, /predicate=|direct_object=|topic=|filler=/)
        assert.doesNotMatch(analysis.sop, /nlu.coordination/)
      }
      for (const text of ['Thanks for your help', 'Thanks for your help.']) {
        const [reason] = await analyse(text)
        assert.match(reason.sop, /determiner="your" head="help"/)
        assert.match(reason.sop, /kind=reason from=\$c1 to=\$e1 cue="for"/)
        assert.match(reason.sop, /expression="Thanks" speech_act=gratitude/)
        assert.equal(reason.sop.includes('terminator="."'), text.endsWith('.'))
      }
    })

    await t.test('keeps literal gratitude lexemes as finite predicates or nominal arguments', async () => {
      for (const [text, expected] of [
        ['She thanks him.', /form=declarative predicate="thanks".*subject=\$e1 direct_object=\$e2/],
        ['Give thanks.', /nlu.entity head="thanks"/],
        ['Send my thanks.', /determiner="my" head="thanks"/],
        ['Send Mia thanks.', /direct_object=\$e2 indirect_object=\$e1/],
        ['Print "thanks".', /nlu.entity name="\\"thanks\\""/],
        ["Print 'thanks'.", /nlu.entity name="'thanks'"/]
      ]) {
        const [analysis] = await analyse(text)
        assert.match(analysis.sop, expected, text)
        assert.doesNotMatch(analysis.sop, /speech_act=gratitude|form=fragment/, text)
      }
    })

    await t.test('preserves calendar clock literals and their trailing gratitude', async () => {
      const text = 'Could you book Hall C for Planning on 2026-12-03 from 11:00 UTC for 45 minutes. Thanks!'
      const [booking] = await analyse(text)
      assert.match(booking.sop, /head="11:00" modifier="UTC"/)
      assert.match(booking.sop, /kind=from from=\$c1 to=\$e\d+ cue="from"/)
      assert.match(booking.sop, /expression="Thanks" speech_act=gratitude terminator="!"/)
      assert.doesNotMatch(booking.sop, /terminator=":"|head="00"|unresolved="11"/)
      assert.equal(booking.tokens.filter(({text}) => text === '11:00').length, 1)
      const [schedule] = await analyse('Schedule Review at 11:00:30 UTC.')
      assert.match(schedule.sop, /head="11:00:30" modifier="UTC"/)
      assert.match(schedule.sop, /kind=time from=\$c1 to=\$e\d+ cue="at"/)
      assert.deepEqual(schedule.unresolved, [])
    })

    await t.test('binds a whole decimal as a factor or target value and keeps a real terminator', async () => {
      const [scaled] = await analyse('Scale it by 1.2.')
      assert.match(scaled.sop, /nlu.entity head="1\.2"/)
      assert.match(scaled.sop, /kind=factor from=\$c1 to=\$e2 cue="by"/)
      assert.equal((scaled.sop.match(/terminator="\."/g) ?? []).length, 1)
      assert.deepEqual(scaled.unresolved, [])
      const [measured] = await analyse('Scale it by 1.2 inches.')
      assert.doesNotMatch(measured.sop, /kind=factor/)
      assert.ok(measured.tokens.some(({text}) => text === '1.2'))
      const [assigned] = await analyse('Set it to +1.2.')
      assert.match(assigned.sop, /head="\+1\.2"/)
      assert.match(assigned.sop, /kind=target_value .* cue="to"/)
      const [opaque] = await analyse('Wait 1.2.')
      assert.match(opaque.sop, /unresolved="1\.2"/)
      assert.equal((opaque.sop.match(/terminator="\."/g) ?? []).length, 1)
    })

    await t.test('leaves the independently available legacy benchmark path intact', async () => {
      const result = await reader.propose('Draw a blue circle.')
      assert.ok(result.candidates[0]?.sop.startsWith('@r1 w.request.request'))
      assert.deepEqual((await reader.analyse('')).analyses, [])
    })
  } finally {
    await reader.close()
  }
})
