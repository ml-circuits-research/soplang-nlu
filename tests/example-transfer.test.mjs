import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'
import {prologExampleTransfer, trainExampleTransfer} from '../strategies/prolog-example-transfer/index.mjs'

const knowledgeDir = process.env.SOP_KNOWLEDGE_DIR
const swipl = process.env.SWIPL || 'swipl'
const utterance = (anchor, value) => `Make ${anchor} mystery chart say "${value}".`
const example = (anchor, value, key) => ({
  text: utterance(anchor, value),
  references: [
    '@r w.request.request act=make mood=do predicate=Make\n' +
    '@t w.request.target request=$r family=chart mode=new family_words=chart\n' +
    `@c w.request.constraint request=$r on=attribute operator=eq phase=result attribute=${key} value="${value}" words="${value}"`
  ]
})

test('example transfer keeps case and Unicode spellings distinct during training and matching', {
  skip: !knowledgeDir ? 'Set SOP_KNOWLEDGE_DIR to run the integration test' :
    spawnSync(swipl, ['--version']).status !== 0 ? 'Set SWIPL to an available SWI-Prolog executable' : false
}, async t => {
  const decomposed = 'Cafe\u0301'
  const cases = [['Rose', 'chart.title'], ['rose', 'chart.measure'],
    ['Café', 'chart.title'], [decomposed, 'chart.measure']]
  const rows = cases.flatMap(([anchor, key]) =>
    ['Seed Planet', 'Sprout Planet'].map(value => example(anchor, value, key)))
  const model = await trainExampleTransfer([...rows, rows[0]], {knowledgeDir})
  assert.equal(model.training.distinctTexts, rows.length)
  assert.equal(model.templates.length, cases.length)
  assert.deepEqual(model.templates.map(({pattern, support}) => [pattern[1], support]),
    cases.map(([anchor]) => [anchor, 2]))

  const directory = await mkdtemp(join(tmpdir(), 'sop-example-case-'))
  t.after(() => rm(directory, {recursive: true, force: true}))
  const modelPath = join(directory, 'model.json')
  await writeFile(modelPath, JSON.stringify(model))
  const reader = await prologExampleTransfer.open({knowledgeDir, swipl, modelPath})
  try {
    const value = 'MiXeD 🪐 Étoile'
    for (const [anchor, key] of cases) {
      const text = utterance(anchor, value)
      const result = await reader.propose(text)
      assert.equal(result.error, null)
      const transfers = result.candidates.filter(candidate => candidate.source === 'prolog-example-transfer')
      assert.equal(transfers.length, 1)
      assert.ok(transfers[0].sop.includes(`attribute=${key} value="${value}"`))
      const [slot] = transfers[0].transfer.slots
      assert.equal(slot.text, value)
      assert.equal(Array.from(text).slice(slot.start, slot.end).join(''), value)
    }
    const unseen = await reader.propose(utterance('ROSE', value))
    assert.equal(unseen.error, null)
    assert.ok(unseen.candidates.every(candidate => candidate.source !== 'prolog-example-transfer'))
  } finally {
    await reader.close()
  }
})
