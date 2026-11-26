import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {createAnalysisValidator} from '../lib/check-analysis.mjs'

const knowledgeDir = process.env.SOP_KNOWLEDGE_DIR ?? fileURLToPath(new URL('../../sop-knowledge-worlds', import.meta.url))
const validate = await createAnalysisValidator({knowledgeDir})
const lines = (...wires) => wires.join('\n')

test('checks typed clause arguments, prepositional relations and repeated exact words', () => {
  const report = validate('Move the red circle beside the red square.', lines(
    '@c nlu.clause form=imperative predicate="Move" direct_object=$e1 terminator="." act=place',
    '@e1 nlu.entity head="circle" determiner="the" modifier="red" kind=circle color=red',
    '@e2 nlu.entity head="square" determiner="the" modifier="red" kind=square color=red',
    '@r nlu.relation kind=beside from=$e1 to=$e2 cue="beside"'
  ))
  assert.equal(report.valid, true)
  assert.equal(report.coverage.understood, 9)
  assert.equal(report.coverage.uncovered, 0)
  assert.equal(report.coverage.allAccountedFor, true)
  assert.deepEqual(report.coverage.ambiguous, [
    {text: 'the', claimed: 2, occurrences: 2},
    {text: 'red', claimed: 2, occurrences: 2}
  ])
})

test('validates a question and negation with coordinated name arguments and a second fragment', () => {
  const report = validate('Can you not move A and B? All done.', lines(
    '@c nlu.clause form=interrogative auxiliary="Can" subject=$you negation="not" polarity=negative predicate="move" direct_object=$both terminator="?"',
    '@you nlu.entity pronoun="you"',
    '@a nlu.entity name="A"',
    '@b nlu.entity name="B"',
    '@both nlu.coordination kind=and member=$a member=$b cue="and"',
    '@confirmation nlu.clause form=fragment unresolved="All done" terminator="."'
  ))
  assert.equal(report.valid, true)
  assert.equal(report.coverage.unresolved, 2)
  assert.equal(report.coverage.allAccountedFor, true)
})

test('keeps filler, unresolved and uncovered distinct from understood', () => {
  const report = validate('Please draw a cat beside the wall.', lines(
    '@c nlu.clause form=imperative predicate="draw" direct_object=$cat filler="Please" unresolved="beside the" terminator="."',
    '@cat nlu.entity head="cat" determiner="a"'
  ))
  assert.equal(report.valid, true)
  assert.deepEqual(report.coverage, {
    words: 8, understood: 4, filler: 1, unresolved: 2, uncovered: 1,
    allAccountedFor: false, ambiguous: []
  })
})

test('uses a second occurrence when a longer phrase competes for the first', () => {
  const report = validate('blue circle, blue', lines(
    '@c nlu.clause form=fragment subject=$circle result_complement="blue" unresolved=","',
    '@circle nlu.entity name="blue circle"'
  ))
  assert.equal(report.valid, true)
  assert.equal(report.coverage.uncovered, 0)
})

test('rejects duplicate claims, subwords, wrong casing and overlapping evidence', () => {
  const repeats = validate('red circle', lines(
    '@c nlu.clause form=fragment result_complement="red" subject=$circle',
    '@circle nlu.entity head="circle" modifier="red"'
  ))
  const subword = validate('red circle', '@c nlu.clause form=fragment predicate="cir"')
  const wrongCase = validate('Move', '@c nlu.clause form=imperative predicate="move"')
  const overlap = validate('red circle blue', lines(
    '@c nlu.clause form=fragment subject=$circle result_complement="red"',
    '@circle nlu.entity name="red circle"'
  ))
  assert.equal(repeats.schemaValid, true)
  assert.equal(repeats.sourceValid, false)
  assert.ok(repeats.findings.some(finding => finding.code === 'insufficient-source-occurrences'))
  for (const report of [subword, wrongCase, overlap]) assert.equal(report.sourceValid, false)
  assert.ok(overlap.findings.some(finding => finding.code === 'overlapping-source-quotes'))
})

test('rejects absent or wrongly typed references, duplicates and legacy wire types', () => {
  const invalid = [
    '',
    '@c nlu.clause form=fragment direct_object=$missing',
    '@c nlu.clause form=fragment direct_object=$c',
    '@c nlu.clause form=fragment form=imperative',
    '@c nlu.clause form=fragment start=0',
    '@c nlu.clause form=fragment predicate=move',
    '@x w.request.request act=move',
    '@c nlu.clause form=fragment\n@c nlu.clause form=fragment',
    '@c nlu.clause form=fragment direct_object=$co\n@co nlu.coordination kind=and member=$c member=$d\n@d nlu.clause form=fragment'
  ]
  for (const circuit of invalid) assert.equal(validate('move', circuit).schemaValid, false, circuit)
})

test('the native SOP runtime loads the schema and accepts typed reference unions', async () => {
  const {World} = await import(pathToFileURL(join(knowledgeDir, 'tools/sopworld/sopworld.mjs')))
  const schema = await readFile(new URL('../schemas/nlu/schema.sop', import.meta.url), 'utf8')
  const world = new World({library: {nlu: schema}})
  assert.equal(world.use('nlu').ok, true)
  const sop = lines(
    '@c nlu.clause form=imperative predicate="Put" direct_object=$both',
    '@a nlu.entity name="A"',
    '@b nlu.entity name="B"',
    '@both nlu.coordination kind=and member=$a member=$b cue="and"',
    '@r nlu.relation kind=near from=$c to=$place cue="near"',
    '@place nlu.entity head="wall"',
  )
  const native = world.tell(sop)
  assert.equal(native.ok, true, JSON.stringify(native.violations))
  assert.equal(validate('Put A and B near wall', sop).valid, true)
  const malformed = world.tell('@bad nlu.relation kind=near from=$r to=$place')
  assert.equal(malformed.ok, false)
})

test('checks long unambiguous evidence without exhausting the allocation search', () => {
  const words = Array.from({length: 1050}, (_, index) => 'w' + index)
  const sop = '@c nlu.clause form=fragment ' + words.map(word => 'unresolved="' + word + '"').join(' ')
  const report = validate(words.join(' '), sop)
  assert.equal(report.valid, true)
  assert.equal(report.coverage.unresolved, words.length)
})

test('loads explicitly installed analysis extensions without permitting slot overrides', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'nlu-schema-'))
  try {
    const schema = join(directory, 'extension.sop')
    await writeFile(schema, '@x core.slot of=nlu.clause key=adverb kind=string\n')
    const validateExtension = await createAnalysisValidator({knowledgeDir, schemaPaths: [schema]})
    const sop = '@c nlu.clause form=imperative predicate="Move" adverb="slowly"'
    assert.equal(validate('Move slowly', sop).schemaValid, false)
    assert.equal(validateExtension('Move slowly', sop).valid, true)
    await writeFile(schema, '@x core.slot of=nlu.clause key=predicate kind=atom\n')
    await assert.rejects(createAnalysisValidator({knowledgeDir, schemaPaths: [schema]}), /Duplicate analysis slot/)
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
})
