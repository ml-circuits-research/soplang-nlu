import assert from 'node:assert/strict'
import test from 'node:test'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {createAnalysisValidator, hasCompleteSource} from '../lib/check-analysis.mjs'

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
  assert.equal(world.tell('@bare nlu.clause').ok, false)
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
    await writeFile(schema, '@x core.slot of=nlu.clause key=aspect_marker kind=string\n')
    const validateExtension = await createAnalysisValidator({knowledgeDir, schemaPaths: [schema]})
    const sop = '@c nlu.clause form=imperative predicate="Move" aspect_marker="now"'
    assert.equal(validate('Move now', sop).schemaValid, false)
    assert.equal(validateExtension('Move now', sop).valid, true)
    await writeFile(schema, '@x core.slot of=nlu.clause key=predicate kind=atom\n')
    await assert.rejects(createAnalysisValidator({knowledgeDir, schemaPaths: [schema]}), /Duplicate analysis slot/)
  } finally {
    await rm(directory, {recursive: true, force: true})
  }
})

test('only permits explicitly accounted incidental commas and final full stops', () => {
  const source = 'Hey, move it.'
  const marks = '@c nlu.clause form=imperative filler="Hey" predicate="move" direct_object=$x'
  const entity = '@x nlu.entity pronoun="it"'
  const explicit = validate(source, lines(marks + ' unresolved="," unresolved="."', entity))
  assert.equal(explicit.valid, true)
  assert.equal(explicit.coverage.unresolved, 2)
  assert.equal(hasCompleteSource(explicit), true)
  assert.deepEqual(explicit.sourceGaps.incidentalPunctuation, [
    {text: ',', category: 'unresolved'}, {text: '.', category: 'unresolved'}
  ])
  const missingComma = validate(source, lines(marks + ' unresolved="."', entity))
  assert.equal(missingComma.valid, true)
  assert.equal(hasCompleteSource(missingComma), false)
  for (const mark of ['?', ';', ':', '—', 'now']) {
    const gap = validate('move it ' + mark, lines(
      '@c nlu.clause form=imperative predicate="move" direct_object=$x unresolved=' + JSON.stringify(mark),
      entity
    ))
    assert.equal(gap.sourceGaps.materialUnresolved, 1, mark)
    assert.equal(hasCompleteSource(gap), false, mark)
  }
  for (const input of ['1,2', '1, 2']) {
    const gap = validate(input, '@c nlu.clause form=fragment filler="1" unresolved="," filler="2"')
    assert.equal(gap.valid, true)
    assert.equal(hasCompleteSource(gap), false, input)
  }
  const internalPeriod = validate('Move. Stop', lines(
    '@c nlu.clause form=imperative predicate="Move" unresolved="."',
    '@d nlu.clause form=imperative predicate="Stop"'
  ))
  assert.equal(hasCompleteSource(internalPeriod), false)
})

test('preserves decimal numbers and clock readings as whole source tokens', () => {
  const decimal = validate('Scale it by 1.2.', lines(
    '@c nlu.clause form=imperative predicate="Scale" direct_object=$x unresolved="by" unresolved="1" terminator="."',
    '@x nlu.entity pronoun="it"',
    '@d nlu.clause form=fragment unresolved="2"'
  ))
  assert.equal(decimal.schemaValid, true)
  assert.equal(decimal.sourceValid, false)
  assert.ok(decimal.findings.some(({code,text}) => code === 'source-quote-not-found' && text === '1'))
  const clock = validate('Move it to 10:00', lines(
    '@c nlu.clause form=imperative predicate="Move" direct_object=$x unresolved="to" unresolved="10" terminator=":"',
    '@x nlu.entity pronoun="it"',
    '@d nlu.clause form=fragment unresolved="00"'
  ))
  assert.equal(clock.sourceValid, false)
  const whole = validate('At 10:00 scale to +1.2.', lines(
    '@c nlu.clause form=imperative predicate="scale" unresolved="At 10:00" unresolved="to +1.2" terminator="."'
  ))
  assert.equal(whole.valid, true)
  assert.equal(whole.sourceGaps.materialUnresolved, 4)
  assert.equal(hasCompleteSource(whole), false)
})

test('grounds a possessive clitic and preserves the full written form when quoted whole', () => {
  for (const marker of ["'s", '’s']) {
    const text = 'Move ' + 'Jan' + marker + ' office chair.'
    const split = lines(
      '@c nlu.clause form=imperative predicate="Move" direct_object=$chair terminator="."',
      '@chair nlu.entity compound="office" head="chair" possessor=$jan possessive_marker="' + marker + '"',
      '@jan nlu.entity name="Jan"'
    )
    assert.equal(hasCompleteSource(validate(text, split)), true)
    assert.equal(validate(text, split.replace('name="Jan"', 'name="Jan' + marker + '"')).valid, false)
    assert.equal(hasCompleteSource(validate('Jan' + marker, lines(
      '@c nlu.clause form=fragment topic=$n',
      '@n nlu.entity name="Jan' + marker + '"'
    ))), true)
  }
})

test('represents nonfinite modification and degree on a qualified lookup', () => {
  const sop = lines(
    '@c nlu.clause form=imperative predicate="Find" direct_object=$bird',
    '@bird nlu.entity determiner="the" degree="very" modifier="small" head="bird"',
    '@f nlu.clause form=nonfinite predicate="facing" adverb="left"',
    '@r nlu.relation kind=modifier from=$bird to=$f'
  )
  assert.equal(hasCompleteSource(validate('Find the very small bird facing left', sop)), true)
})
