import assert from 'node:assert/strict'
import {existsSync} from 'node:fs'
import {createRequire} from 'node:module'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {test} from 'node:test'
import {createReader} from '../lib/index.mjs'
import {hasCompleteSource} from '../lib/check-analysis.mjs'
import {neuroZ3} from '../strategies/neuro-z3/index.mjs'

const knowledgeDir = process.env.SOP_KNOWLEDGE_DIR ??
  fileURLToPath(new URL('../../sop-knowledge-worlds', import.meta.url))
const require = createRequire(new URL('../strategies/z3/index.mjs', import.meta.url))
let skip = !existsSync(join(knowledgeDir, 'tools/sopworld/sopworld.mjs')) && 'Requires the SOP knowledge checkout'
try { require.resolve('z3-solver') } catch { skip ||= 'Requires npm ci --prefix strategies/z3' }
skip ||= !process.env.SOP_NLU_SYNTAX_MODEL && 'Set SOP_NLU_SYNTAX_MODEL to test the optional dependency parser'

test('neuro-z3 builds source-grounded circuits from the dependency model', {skip}, async (t) => {
  const reader = await createReader({strategy: neuroZ3, knowledgeDir, topK: 3})
  async function propose(text) {
    const result = await reader.propose(text)
    assert.equal(result.analysisDiagnostics.status, 'sat')
    assert.equal(result.analysisDiagnostics.solver, 'z3')
    assert.ok(result.analysisDiagnostics.dependencyProductions > 0)
    assert.ok(result.candidates.length > 0 && result.candidates.length <= 3)
    const complete = result.candidates.find(({check}) => hasCompleteSource(check))
    assert.ok(complete, result.candidates.map(({sop}) => sop).join('\n\n'))
    return complete.sop
  }

  try {
    await t.test('anchors a nominal fragment attachment outside the fragment clause', async () => {
      const sop = await propose('a bar chart of roles per role')
      const topic = /form=fragment topic=\$(\w+)/.exec(sop)?.[1]
      assert.ok(topic)
      assert.match(sop, new RegExp('@' + topic + ' nlu.entity head="chart"'))
      assert.match(sop, new RegExp('kind=of from=\\$' + topic))
    })

    await t.test('distinguishes predicative and object roles', async () => {
      const sop = await propose('Can you make it a straight shot?')
      assert.match(sop, /form=interrogative.*predicate="make".*predicative_entity=\$e\d+.*direct_object=\$e\d+/)
      assert.match(sop, /head="shot" determiner="a" modifier="straight"/)
      assert.match(sop, /pronoun="it"/)
      assert.doesNotMatch(sop, /indirect_object=/)
    })

    await t.test('keeps multiword calendar labels, dates and clocks exact', async () => {
      const sop = await propose('Schedule Hall C on 2026-12-07 at 11:00 UTC.')
      assert.match(sop, /form=imperative.*predicate="Schedule"/)
      assert.match(sop, /name="Hall C"/)
      assert.match(sop, /literal="2026-12-07"/)
      assert.match(sop, /literal="11:00" modifier="UTC"/)
      assert.match(sop, /kind=date .* cue="on"/)
      assert.match(sop, /kind=time .* cue="at"/)
    })

    await t.test('composes a coordinated PP landmark and detached gratitude', async () => {
      const sop = await propose('Move it beside the tree, the square, and the house, thanks!')
      assert.match(sop, /nlu.coordination kind=additive member=\$e\d+ member=\$e\d+ member=\$e\d+ cue="," cue="," cue="and"/)
      assert.match(sop, /nlu.relation kind=near from=\$c\d+ to=\$c\d+ cue="beside"/)
      assert.match(sop, /form=fragment speech_act=gratitude expression="thanks"/)
    })

    await t.test('grounds relative links and compound prepositions with exact cues', async () => {
      const relative = await propose('The old man saw the girl who carried a bag.')
      assert.match(relative, /kind=subject_relative .* cue="who"/)
      const compound = await propose('Give me a greenhouse next to the house.')
      assert.match(compound, /kind=near .* cue="next to"/)
      assert.match(compound, /indirect_object=\$e\d+/)
    })
  } finally {
    await reader.close()
  }
})
