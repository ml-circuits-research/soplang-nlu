import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createAnalysisValidator } from '../lib/check-analysis.mjs'
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

    await t.test('leaves the independently available legacy benchmark path intact', async () => {
      const result = await reader.propose('Draw a blue circle.')
      assert.ok(result.candidates[0]?.sop.startsWith('@r1 w.request.request'))
      assert.deepEqual((await reader.analyse('')).analyses, [])
    })
  } finally {
    await reader.close()
  }
})
