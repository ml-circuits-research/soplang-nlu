// The benchmark of the `syntax` schema: the normal form of a circuit, the registry of judged
// circuits, the labels of the messages (the syntactic files), the packets for a judge, the check of verdict files, the
// levels and GOAL, the agreement between strategies, the random sample, runs from start to table
// with stub strategies, and a conversion round from the source file to the syntactic file.
// Run with SOP_KNOWLEDGE_DIR unset: nothing here may need a knowledge repository.
import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, statSync} from 'node:fs'
import {gzipSync} from 'node:zlib'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {coreOf, validateSyntax, writeCircuit} from '../lib/index.mjs'
import {normalForm, withCores, emptyRegistry, addToRegistry, lookup, collectItems, packetsOf, runVerdicts, levelOf, tableOf, renderTable,
  agreementOf, renderAgreement, chooseLabels, labelChanges, readLabels, writeLabels, labelLine, Labels, keepLabelsBefore, readLabelsBefore, readArguments, readSample,
  readJsonl, readJson, LEVELS, defaultSyntacticDir, defaultRegistryDir, syntacticDirOf, readCsv, writeCsv, csvCell, rawRows, agreedCircuits, chooseAudit, packageRoot,
  relaxedCore, agreementKey, agreementKeysOf, writtenAlike, AGREEMENT_KEYS, newestLine, readRegistry, rejudgedLabelChanges, acceptedCircuitsOf, publication,
  readOutputs, readItems, readAgreement, strategyAliases, strategyName, sourceNow, outputFile} from './benchmark/syntax/lib.mjs'
import {rejudgeItems, rulesVersion} from './benchmark/syntax/rejudge.mjs'
import {checkLabelsFile, checkRegistryLines} from './benchmark/syntax/drop-duplicates.mjs'
import {messagesOfCsv, distinctMessages, drawSample, messageFiles} from './benchmark/syntax/sample.mjs'
import {pickFiles, planRounds, messagesOfFile, roundState, chooseCircuit, syntacticRows, SYNTACTIC_HEADER} from './benchmark/syntax/round.mjs'
import {checkWritten, describeFinding} from './benchmark/syntax/rewrite-check.mjs'
import {checkVerdicts, quotesTheMessage} from './benchmark/syntax/check.mjs'
import {errorKind, takeOver} from './benchmark/syntax/run.mjs'
import {convert} from './benchmark/syntax/convert-nlu.mjs'
import {strategyModules as activeModules, retiredModules, families, familyFinder, strategyStatus} from './benchmark/syntax/strategies.mjs'
// the strategies that take part, and those left out of the rounds, which still run by name
const strategyModules = {...retiredModules, ...activeModules}
import {strategyModules as earlierModules} from './benchmark/strategies.mjs'

const tools = fileURLToPath(new URL('./benchmark/syntax/', import.meta.url))
const text = 'put the cat next to the red box'
// one reading, written by two hands: other wire names, another order of wires and keys, "next to" in two values
const verbReading = `@c1 syntax.clause form=imperative verb="put" complement=$n1
@n1 syntax.nominal dependent="the" head="cat"
@r1 syntax.relation from=$c1 to=$n2 marker="next to"
@n2 syntax.nominal dependent="the" dependent="red" head="box"`
const sameByAnotherHand = `@thing syntax.nominal head="cat" dependent="the"
@place syntax.nominal dependent="the red" head="box"
@link syntax.relation marker="next" marker="to" to=$place from=$act
@act syntax.clause complement=$thing verb="put" form=imperative`
const nounReading = verbReading.replace('from=$c1 to=$n2', 'from=$n1 to=$n2')
const openReading = verbReading.replace('marker="next to"', 'marker="next to" attachment=ambiguous')
const broken = verbReading.replace(' dependent="red"', '')
const row = (id, message, sop, error = null) => ({id, text: message, sop, error, ms: 1})
const judged = (message, sop, verdict, more = {}) => ({text: message, sop, core: coreOf(message, sop), verdict, grade: verdict === 'accepted' ? 'L8' : 'L3', note: '', judge: 'test', run: 'earlier', source: 'hmm-rules', ...more})
// the syntactic files of the dataset itself: no test may change them
const datasetFiles = () => existsSync(defaultSyntacticDir) ? readdirSync(defaultSyntacticDir, {recursive: true}).sort().map(name => { const stat = statSync(join(defaultSyntacticDir, name)); return name + ' ' + stat.size + ' ' + stat.mtimeMs }).join('\n') : null

test('the normal form is one text for one circuit, whoever wrote it', () => {
  const one = normalForm(text, verbReading), other = normalForm(text, sameByAnotherHand)
  assert.equal(validateSyntax(text, sameByAnotherHand).valid, true)
  assert.equal(one.sop, other.sop)
  assert.equal(one.core, other.core)
  assert.equal(one.core, coreOf(text, one.sop))
  assert.doesNotMatch(other.sop, /@thing|@place|@link|@act/u)
  assert.match(other.sop, /marker="next to"/u)
  assert.match(other.sop, /dependent="the" dependent="red" head="box"/u)
  // the contract's own core tells these two apart, which is why the benchmark compares normal forms
  assert.notEqual(coreOf(text, verbReading), coreOf(text, sameByAnotherHand))
  // another reading stays another circuit
  assert.notEqual(normalForm(text, nounReading).core, one.core)
  assert.notEqual(normalForm(text, openReading).core, one.core)
  assert.equal(normalForm(text, broken), null)
  assert.equal(normalForm(text, null), null)
})

test('the normal form keeps which of two equal words a wire holds', () => {
  const message = 'put the box on the box'
  const sop = `@c1 syntax.clause form=imperative verb="put" complement=$n1
@n1 syntax.nominal dependent="the" head="box"
@r1 syntax.relation from=$c1 to=$n2 marker="on"
@n2 syntax.nominal dependent="the" head="box"`
  const swapped = sop.split('\n'); [swapped[1], swapped[3]] = [swapped[3], swapped[1]]
  assert.equal(normalForm(message, sop).sop, sop.replace('from=$c1 to=$n2 marker="on"', 'marker="on" from=$c1 to=$n2'))
  assert.notEqual(normalForm(message, swapped.join('\n')).core, normalForm(message, sop).core)
  assert.equal(validateSyntax(message, normalForm(message, swapped.join('\n')).sop).valid, true)
})

test('the registry is looked up by message and core', () => {
  const registry = emptyRegistry()
  assert.equal(addToRegistry(registry, judged(text, verbReading, 'accepted')), true)
  assert.equal(addToRegistry(registry, judged(text, nounReading, 'rejected', {grade: 'L3', note: "'next to' starts at 'cat'"})), true)
  assert.equal(addToRegistry(registry, judged(text, broken, 'accepted')), false, 'a line with no valid circuit is ignored')
  assert.equal(registry.ignored, 1)
  const [mine] = withCores([row('a', text, sameByAnotherHand)])
  assert.equal(lookup(registry, text, mine.core).verdict, 'accepted')
  assert.equal(lookup(registry, text, normalForm(text, nounReading).core).grade, 'L3')
  assert.equal(lookup(registry, text, normalForm(text, openReading).core), undefined)
  assert.equal(lookup(registry, 'another message', mine.core), undefined)
  assert.equal(lookup(registry, text, null), undefined)
})

test('the registry holds only what a judge decided: a line without a verdict is ignored', () => {
  const registry = emptyRegistry()
  // a reference circuit rewritten from the nlu schema has no verdict in this schema
  assert.equal(addToRegistry(registry, {text, sop: verbReading, core: coreOf(text, verbReading), source: 'reference', nlu: {judge: 'x', run: 'y', writtenBy: 'hmm-rules'}}), false)
  assert.equal(lookup(registry, text, normalForm(text, verbReading).core), undefined)
  // the first line read for a circuit counts
  addToRegistry(registry, judged(text, verbReading, 'rejected', {grade: 'L3'}))
  addToRegistry(registry, judged(text, sameByAnotherHand, 'accepted'))
  assert.equal(lookup(registry, text, normalForm(text, verbReading).core).verdict, 'rejected')
  assert.deepEqual([registry.rows, registry.ignored], [2, 1])
})

test('packets hold each unjudged circuit once and hide who wrote it', () => {
  const registry = emptyRegistry()
  addToRegistry(registry, judged('move it', '@c1 syntax.clause form=imperative verb="move" complement=$n1\n@n1 syntax.nominal head="it"', 'accepted'))
  const outputs = [
    {strategy: 'alpha', rows: withCores([row('1', text, verbReading), row('2', 'move it', '@c1 syntax.clause form=imperative verb="move" complement=$n1\n@n1 syntax.nominal head="it"'), row('3', 'thanks', null, 'no circuit')])},
    {strategy: 'beta', rows: withCores([row('1', text, sameByAnotherHand), row('2', 'move it', '@a syntax.clause form=imperative verb="move" modifier="it"'), row('3', 'thanks', '@c1 syntax.clause form=fragment discourse="thanks"')])},
    {strategy: 'gamma', rows: withCores([row('1', text, nounReading), row('2', 'move it', broken), row('3', 'thanks', '@x syntax.clause form=fragment discourse="thanks"')])}
  ]
  const {items, added} = collectItems(outputs, registry)
  assert.equal(items.length, 4)
  assert.deepEqual(added, items)
  assert.deepEqual(items.map(item => item.n), [1, 2, 3, 4])
  // the same circuit from two strategies is one item; the settled circuit of "move it" is not sent
  assert.deepEqual(items.filter(item => item.text === text).map(item => item.sources).sort(), [['alpha', 'beta'], ['gamma']])
  assert.deepEqual(items.filter(item => item.text === 'move it').map(item => item.sources), [['beta']])
  assert.deepEqual(items.find(item => item.text === 'thanks').sources, ['beta', 'gamma'])
  const packets = packetsOf(items, 3)
  assert.deepEqual(packets.map(packet => packet.length), [3, 1])
  for (const line of packets.flat()) {
    assert.deepEqual(Object.keys(line), ['n', 'text', 'sop'])
    assert.doesNotMatch(JSON.stringify(line), /alpha|beta|gamma|@thing|@act|@a |@x /u)
    assert.equal(validateSyntax(line.text, line.sop).valid, true)
  }
  // a second call keeps the numbers and adds only what is new
  const more = [...outputs, {strategy: 'delta', rows: withCores([row('1', text, openReading), row('3', 'thanks', '@c9 syntax.clause form=fragment discourse="thanks"')])}]
  const again = collectItems(more, registry, {earlier: items})
  assert.deepEqual(again.items.slice(0, 4).map(item => [item.n, item.core]), items.map(item => [item.n, item.core]))
  assert.deepEqual(again.added.map(item => [item.n, item.sources]), [[5, ['delta']]])
  assert.deepEqual(again.items.find(item => item.text === 'thanks').sources, ['beta', 'delta', 'gamma'])
})

test('the labels are the circuits in the syntactic files, and a run writes them there', () => {
  const circuit = verb => `@c1 syntax.clause form=imperative verb="${verb}" complement=$n1\n@n1 syntax.nominal head="it"`
  const flat = verb => `@c1 syntax.clause form=imperative verb="${verb}" modifier="it"`
  const item = (n, message, sop, sources, more = {}) => ({n, text: message, sop: normalForm(message, sop).sop, core: normalForm(message, sop).core, sources, ...more})
  // one label per message: the circuit most strategies wrote, then the first
  const accepted = [item(1, 'move it', flat('move'), ['alpha']), item(2, 'move it', circuit('move'), ['beta', 'gamma']),
    item(4, 'drop it', circuit('drop'), ['alpha']), item(3, 'drop it', flat('drop'), ['beta']), item(5, 'lift it', circuit('lift'), ['alpha'])]
  assert.deepEqual([...chooseLabels(accepted)].map(([message, chosen]) => [message, chosen.n]), [['move it', 2], ['drop it', 3], ['lift it', 5]])

  // a dataset of two syntactic files: one with CRLF line ends, a message cell written in quotes
  // though it needs none, a message with a comma and quotes, a last row with no line end
  const dir = join(mkdtempSync(join(tmpdir(), 'syntax-benchmark-')), 'syntactic')
  mkdirSync(join(dir, 'things'), {recursive: true})
  const one = 'text,sop,source,accepted_by\r\n"move it",' + csvCell(circuit('move')) + ',alpha+beta,agreement\r\ndrop it,,,\r\n"say ""hi"", then stop",,,\r\nlift it,' + csvCell(circuit('lift')) + ',alpha,judge\r\n'
  const two = 'text,sop,source,accepted_by\nturn it,,,\nbend it,not a circuit,alpha,agreement\nfold it,,,'
  writeFileSync(join(dir, 'things/one.csv'), one)
  writeFileSync(join(dir, 'things/two.csv'), two)
  const labels = readLabels(dir)
  assert.equal(labels instanceof Labels && labels instanceof Map, true)
  assert.deepEqual([labels.size, labels.files.size, labels.dir], [3, 7, dir])
  assert.deepEqual([...labels.keys()], ['move it', 'lift it', 'bend it'])
  assert.deepEqual({...labels.get('move it')}, {text: 'move it', label: circuit('move'), source: 'alpha+beta', accepted_by: 'agreement'})
  assert.deepEqual([labels.files.get('say "hi", then stop'), labels.files.get('fold it'), labels.get('drop it'), labels.files.get('no such message')], ['things/one.csv', 'things/two.csv', undefined, undefined])
  // the core of a label is computed when it is asked for, not when the files are read
  const core = Object.getOwnPropertyDescriptor(labels.get('move it'), 'core')
  assert.deepEqual([typeof core.get, core.enumerable], ['function', false])
  assert.equal(labels.get('move it').core, coreOf('move it', circuit('move')))
  assert.equal(labels.get('bend it').core, null, 'a cell that holds no valid circuit is a label with no core')
  assert.doesNotMatch(JSON.stringify(labels.get('lift it')), /core/u)
  // only some files, for a tool that needs the labels of a few messages
  assert.deepEqual([...readLabels(dir, ['things/two.csv']).files.keys()], ['turn it', 'bend it', 'fold it'])
  assert.equal(readLabels(join(dir, 'none')).size, 0)
  assert.throws(() => { writeFileSync(join(dir, 'things/bad.csv'), 'sop,text\nx,y\n'); readLabels(dir, ['things/bad.csv']) }, /is no syntactic file/u)

  // what a run changes: every accepted circuit becomes the label, whatever the message had
  const run = [item(1, 'move it', flat('move'), ['delta']),                                   // replaces a circuit settled by agreement
    item(2, 'lift it', circuit('lift'), ['delta']),                                          // the same circuit, accepted by a judge already: nothing to change
    item(3, 'drop it', circuit('drop'), ['alpha', 'delta']), item(4, 'drop it', flat('drop'), ['beta']),
    item(5, 'say "hi", then stop', '@c1 syntax.clause form=imperative verb="say" modifier="hi" modifier="then" modifier="stop"', ['delta']),
    item(6, 'fold it', circuit('fold'), ['judge'], {accepted_by: 'written'}),
    item(7, 'gone from the dataset', '@c1 syntax.clause form=fragment discourse="gone" discourse="from" discourse="the" discourse="dataset"', ['delta'])]
  const {changes, first, replaced} = labelChanges(labels, run)
  assert.deepEqual([first, replaced], [4, 1])
  assert.deepEqual([...changes.values()].map(line => [line.text, line.source, line.accepted_by]), [['move it', 'delta', 'judge'], ['drop it', 'alpha+delta', 'judge'],
    ['say "hi", then stop', 'delta', 'judge'], ['fold it', 'judge', 'written'], ['gone from the dataset', 'delta', 'judge']])
  assert.equal(changes.get('move it').label, flat('move'))
  // the same circuit accepted in another way is a change of accepted_by
  assert.deepEqual([...labelChanges(labels, [item(1, 'move it', circuit('move'), ['alpha', 'beta'])]).changes.values()].map(line => line.accepted_by), ['judge'])
  assert.equal(labelChanges(labels, [item(1, 'move it', circuit('move'), ['alpha', 'beta'], {accepted_by: 'agreement'})]).changes.size, 0)

  const written = writeLabels(labels, changes)
  assert.deepEqual(written, {rows: 4, files: ['things/one.csv', 'things/two.csv'], missing: ['gone from the dataset']})
  const after = [readFileSync(join(dir, 'things/one.csv'), 'utf8'), readFileSync(join(dir, 'things/two.csv'), 'utf8')]
  const rowsOne = rawRows(after[0]), before = rawRows(one)
  assert.equal(rowsOne.length, 5)
  assert.deepEqual([rowsOne[0], rowsOne[4]], [before[0], before[4]], 'the header and the row the run says nothing about are as they were')
  assert.equal(rowsOne[1], '"move it",' + csvCell(flat('move')) + ',delta,judge\r\n', 'the message cell as it was written, the line end of the file')
  assert.equal(rowsOne[2], 'drop it,' + csvCell(circuit('drop')) + ',alpha+delta,judge\r\n')
  assert.equal(rowsOne[3].startsWith('"say ""hi"", then stop","@c1 '), true)
  assert.equal(after[1], 'text,sop,source,accepted_by\nturn it,,,\nbend it,not a circuit,alpha,agreement\nfold it,' + csvCell(circuit('fold')) + ',judge,written', 'no line end is added to the last row')
  assert.deepEqual(messagesOfCsv(after[0]).map(message => message.text), messagesOfCsv(one).map(message => message.text), 'the same messages in the same order')
  const again = readLabels(dir, ['things/one.csv', 'things/two.csv'])
  assert.deepEqual([...again.values()].map(line => [line.text, line.source, line.accepted_by]), [['move it', 'delta', 'judge'], ['drop it', 'alpha+delta', 'judge'], ['say "hi", then stop', 'delta', 'judge'],
    ['lift it', 'alpha', 'judge'], ['bend it', 'alpha', 'agreement'], ['fold it', 'judge', 'written']])
  assert.equal(again.get('move it').core, coreOf('move it', flat('move')))
  // writing the same labels again changes no file
  assert.deepEqual(writeLabels(again, changes), {rows: 0, files: [], missing: ['gone from the dataset']})

  // the labels before a run: kept once, for the messages of the run only
  const runDir = join(dir, '..', 'run')
  assert.equal(readLabelsBefore(runDir, labels), labels, 'a run with no file of its own is compared with the labels of now')
  assert.equal(keepLabelsBefore(runDir, labels, ['move it', 'drop it', 'lift it', 'move it', 'not in the dataset']), true)
  assert.deepEqual(readJsonl(join(runDir, 'key/labels-before.jsonl')), [{text: 'move it', label: circuit('move'), source: 'alpha+beta', accepted_by: 'agreement'}, {text: 'lift it', label: circuit('lift'), source: 'alpha', accepted_by: 'judge'}])
  assert.equal(keepLabelsBefore(runDir, again, () => { throw new Error('a run that has its file keeps it') }), false)
  const frozen = readLabelsBefore(runDir, () => { throw new Error('the labels of now are not read') })
  assert.deepEqual([[...frozen.keys()], frozen.get('move it').core, frozen.get('move it').accepted_by], [['move it', 'lift it'], coreOf('move it', circuit('move')), 'agreement'])
  // a file the earlier tools wrote, with every label of the dataset and other keys, is still read
  const old = join(dir, '..', 'old-run')
  mkdirSync(join(old, 'key'), {recursive: true})
  writeFileSync(join(old, 'key/labels-before.jsonl'), JSON.stringify({text: 'turn it', label: circuit('turn'), core: 'a stored core is not trusted', run: 'earlier', source: 'hmm-rules', previous: null}) + '\n')
  assert.deepEqual([...readLabelsBefore(old, labels)].map(([message, line]) => [message, line.core, line.source, line.accepted_by]), [['turn it', coreOf('turn it', circuit('turn')), 'hmm-rules', '']])

  // the syntactic files that go with a registry: those of its dataset; a registry named for a trial brings its own
  assert.equal(syntacticDirOf(), defaultSyntacticDir)
  assert.equal(syntacticDirOf(defaultRegistryDir), defaultSyntacticDir)
  assert.equal(syntacticDirOf('/tmp/trial/annotations/syntax/v1/judged'), '/tmp/trial/syntactic')
  assert.equal(syntacticDirOf('/tmp/trial/registry'), '/tmp/trial/syntactic')
  assert.equal(syntacticDirOf('/tmp/trial/registry', '/tmp/elsewhere'), '/tmp/elsewhere')
})

test('the check of a verdict file', () => {
  const packet = [{n: 1, text, sop: verbReading}, {n: 2, text, sop: nounReading}, {n: 3, text: "don't move it", sop: ''}, {n: 4, text: 'thanks', sop: ''}]
  const good = checkVerdicts(packet, ['{"n": 1, "grade": "L8", "note": ""}', '', '{"n": 2, "grade": "L3", "note": "\'next to\' cannot start at \'the cat\'"}', '{"n": 3, "grade": "L1", "note": "the negation \'n\'t\' is held as a modifier"}'])
  assert.deepEqual(good.problems, [])
  assert.deepEqual([good.rows, good.judged, good.accepted, good.rejected, good.missing], [4, 3, 1, 2, [4]])
  const bad = checkVerdicts(packet, [
    '{"n": 1, "grade": "L9", "note": ""}',                               // not a grade a judge gives
    '{"n": 2, "grade": "L3", "note": "the relation starts at the cat"}',  // a rejection that quotes nothing
    '{"n": 3, "grade": "L3", "note": "\'verb\' is wrong"}',               // quotes a word that is not in the message
    '{"n": 4, "grade": "L8", "note": "ok"}', '{"n": 4, "grade": "L8", "note": "ok"}',   // judged twice
    '{"n": 9, "grade": "L8", "note": ""}',                               // no line of the packet
    'not json', '{"n": 1, "grade": "L8"}', '{"n": 1, "grade": "L8", "note": "", "strategy": "hmm-rules"}'])
  assert.equal(bad.problems.length, 8)
  assert.match(bad.problems.join('\n'), /L9.*\n.*n=2 is rejected.*\n.*n=3 is rejected.*\n.*judged twice.*\n.*n=9 is no line.*\n.*not a JSON object.*\n.*needs a note.*\n.*unknown key strategy/u)
  assert.deepEqual([bad.judged, bad.accepted, bad.rejected, bad.missing], [2, 2, 0, [2, 3]])
  assert.equal(quotesTheMessage("it isn't right: 'the cat' is split", text), true)
  assert.equal(quotesTheMessage('‘red box’ lost its head', text), true)
  assert.equal(quotesTheMessage("the 'dog' is wrong", text), false)
})

test('levels and GOAL from the labels, the registry and the verdicts of the run', () => {
  const circuit = verb => `@c1 syntax.clause form=imperative verb="${verb}" complement=$n1\n@n1 syntax.nominal head="it"`
  const flat = verb => `@c1 syntax.clause form=imperative verb="${verb}" modifier="it"`
  const label = (message, sop) => [message, labelLine({text: message, label: sop, source: 'hmm-rules', accepted_by: 'judge'})]
  // before the run: three messages have a label; the registry holds what judges decided
  const labels = new Map([label('move it', circuit('move')), label('lift it', circuit('lift')), label('turn it', circuit('turn'))])
  const registry = emptyRegistry()
  for (const [message, line] of labels) addToRegistry(registry, judged(message, line.label, 'accepted'))
  addToRegistry(registry, judged('lift it', flat('lift'), 'accepted'))                    // accepted earlier, not the label
  addToRegistry(registry, judged('drop it', flat('drop'), 'rejected', {grade: 'L3'}))     // rejected earlier
  const rows = withCores([
    row('1', 'move it', circuit('move')),   // equal to the label: L9
    row('2', 'lift it', flat('lift')),      // already accepted, not the label: L8 with no judge
    row('3', 'drop it', flat('drop')),      // already rejected: its grade
    row('4', 'turn it', flat('turn')),      // a judge accepts it in this run and the message had another label: L10
    row('5', 'hide it', circuit('hide')),   // a judge accepts it and the message had no label: L8
    row('6', 'show it', flat('show')),      // a judge rejects it
    row('7', 'bend it', circuit('bend')),   // no judge yet
    row('8', 'fold it', null, 'no circuit'), row('9', 'tear it', broken),
    row('10', text, openReading)])
  const outputs = [{strategy: 'alpha', rows}]
  const {items} = collectItems(outputs, registry)
  assert.deepEqual(items.map(item => item.text), ['turn it', 'hide it', 'show it', 'bend it', text])
  const verdicts = runVerdicts(items, [{n: 1, grade: 'L8', note: ''}, {n: 2, grade: 'L8', note: ''}, {n: 3, grade: 'L5', note: "'it'"}, {n: 5, grade: 'L8', note: ''}, {n: 77, grade: 'L8', note: ''}])
  assert.deepEqual(rows.map(line => levelOf(line, registry, verdicts, labels)), ['L9', 'L8', 'L3', 'L10', 'L8', 'L5', 'waiting', 'L0', 'L0', 'L8'])
  // before any judge has worked
  assert.deepEqual(rows.map(line => levelOf(line, registry, new Map(), labels)), ['L9', 'L8', 'L3', 'waiting', 'waiting', 'waiting', 'waiting', 'L0', 'L0', 'waiting'])
  // a circuit that became the label after the run started, by agreement in a conversion round, is accepted: L8
  const since = new Map([['bend it', labelLine({text: 'bend it', label: circuit('bend'), source: 'hmm-rules+spacy', accepted_by: 'agreement'})]])
  assert.deepEqual([6, 5].map(at => levelOf(rows[at], registry, new Map(), labels, since)), ['L8', 'waiting'])
  assert.equal(levelOf(rows[6], registry, new Map(), labels, () => since), 'L8')
  assert.equal(levelOf(rows[0], registry, new Map(), labels, () => { throw new Error('the labels of now are not read for a circuit that is known') }), 'L9')
  // with no labels, nothing is L9 or L10: what the registry holds as accepted is L8
  assert.deepEqual(rows.map(line => levelOf(line, registry, verdicts)), ['L8', 'L8', 'L3', 'L8', 'L8', 'L5', 'waiting', 'L0', 'L0', 'L8'])
  const [line] = tableOf(outputs, registry, verdicts, labels)
  assert.deepEqual(line.levels, {L0: 2, L1: 0, L2: 0, L3: 1, L4: 0, L5: 1, L6: 0, L7: 0, L8: 3, L9: 1, L10: 1})
  assert.deepEqual([line.messages, line.waiting, line.accepted, line.ambiguous], [10, 1, 5, 1])
  assert.equal(line.goal, 5 / 10)         // of all messages: a waiting message is not counted as accepted
  assert.equal(line.atMost, 6 / 10)       // when the waiting circuit is accepted too
  const shown = renderTable([line], {notRun: [['z3', 'not ported']]})
  assert.match(shown, /\| Strategy \| Messages \| L0 \| L1 \| L2 \| L3 \| L4 \| L5 \| L6 \| L7 \| L8 \| L9 \| L10 \| waiting \| GOAL \|/u)
  assert.match(shown, /\| alpha \| 10 \| 2 \| 0 \| 0 \| 1 \| 0 \| 1 \| 0 \| 0 \| 3 \| 1 \| 1 \| 1 \| 50\.0% \|/u)
  assert.match(shown, /\| alpha \| 1 \| 50\.0% \| 60\.0% \|/u)
  assert.match(shown, /\| alpha \| 5 \| 1 \| 20\.0% \|/u)
  assert.match(shown, /z3 \(not ported\)/u)
  assert.equal(LEVELS.length, 11)
})

test('a random sample of the dataset: distinct texts, a seeded order, exclusions', () => {
  const csv = 'text,sop,sop1\r\nmove it,"@a x\n@b y",\r\n"say ""hi"", then stop",@a x,@b y\r\n\r\n"two\nlines",@a x\r\nmove it,@a x\r\n'
  assert.deepEqual(messagesOfCsv(csv), [{record: 1, text: 'move it'}, {record: 2, text: 'say "hi", then stop'}, {record: 3, text: 'two\nlines'}, {record: 4, text: 'move it'}])
  assert.throws(() => messagesOfCsv('sop,text\nx,y\n'), /first column/u)
  const {messages, rows} = distinctMessages([{file: 'a/one.csv', content: csv}, {file: 'b/two.csv', content: 'text,sop\nmove it,@a x\ndrop it,@a x\n'}])
  assert.equal(rows, 6)
  assert.deepEqual(messages.map(message => message.id), ['a/one.csv#1', 'a/one.csv#2', 'a/one.csv#3', 'b/two.csv#2'])

  const all = Array.from({length: 1000}, (_, index) => ({id: 'f.csv#' + (index + 1), text: 'message ' + index}))
  const sample = drawSample(all, {seed: 'one', share: 0.05})
  assert.equal(sample.length, 50)
  assert.equal(new Set(sample.map(message => message.text)).size, 50)
  assert.deepEqual(drawSample([...all].reverse(), {seed: 'one', share: 0.05}), sample, 'the same seed draws the same sample, whatever the order of the files')
  assert.notDeepEqual(drawSample(all, {seed: 'two', share: 0.05}), sample)
  assert.notDeepEqual(sample.map(message => message.id), [...sample].sort((a, b) => a.id.localeCompare(b.id)).map(message => message.id), 'the order is the order drawn')
  // excluded messages are never drawn, and the sample keeps its size
  const excluded = new Set(sample.slice(0, 20).map(message => message.text))
  const fresh = drawSample(all, {seed: 'one', share: 0.05, excluded})
  assert.equal(fresh.length, 50)
  assert.equal(fresh.some(message => excluded.has(message.text)), false)
  assert.deepEqual(fresh.slice(0, 30), sample.slice(20))
  assert.throws(() => drawSample(all, {seed: 'one', share: 1, excluded}), /Only 980 messages are left/u)
  assert.throws(() => drawSample(all, {seed: 'one', share: 0}), /share/u)
  // several files after --exclude, and a sample file that is not gzipped
  assert.deepEqual(readArguments(['out.gz', '--share', '0.1', '--exclude', 'a.gz', 'b.gz', '--seed', 's'], ['exclude']), {words: ['out.gz'], named: {share: '0.1', exclude: ['a.gz', 'b.gz'], seed: 's'}})
  const folder = mkdtempSync(join(tmpdir(), 'syntax-benchmark-'))
  writeFileSync(join(folder, 'plain.json'), JSON.stringify([{id: '1', text: 'a', references: ['x']}]))
  writeFileSync(join(folder, 'packed.json.gz'), gzipSync(JSON.stringify([{id: '1', text: 'a', references: ['x']}])))
  assert.deepEqual(readSample(join(folder, 'plain.json')), [{id: '1', text: 'a'}])
  assert.deepEqual(readSample(join(folder, 'packed.json.gz')), [{id: '1', text: 'a'}])
})

test('agreement between strategies, by the core of their circuits', () => {
  const thanks = name => `@${name} syntax.clause form=fragment discourse="thanks"`
  const outputs = [
    {strategy: 'alpha', rows: withCores([row('1', text, verbReading), row('2', 'thanks', thanks('c1')), row('3', 'move it', '@c1 syntax.clause form=imperative verb="move" modifier="it"'), row('4', 'hey', null, 'no circuit')])},
    {strategy: 'beta', rows: withCores([row('1', text, sameByAnotherHand), row('2', 'thanks', thanks('x')), row('3', 'move it', '@c1 syntax.clause form=imperative verb="move" complement=$n1\n@n1 syntax.nominal head="it"'), row('4', 'hey', null, 'no circuit')])},
    {strategy: 'gamma', rows: withCores([row('1', text, nounReading), row('2', 'thanks', thanks('k')), row('3', 'move it', '@c1 syntax.clause form=fragment discourse="move" discourse="it"'), row('4', 'hey', null, 'no circuit')])}
  ]
  const accepted = normalForm(text, verbReading).core
  const result = agreementOf(outputs, (message, core) => message === text && core === accepted ? 'accepted' : undefined)
  assert.equal(result.messages, 4)
  assert.deepEqual(result.all, {messages: 1, accepted: 0, rejected: 0, unjudged: 1})          // "thanks"
  assert.deepEqual(result.majority, {messages: 2, accepted: 1, rejected: 0, unjudged: 1})     // "thanks" and the first message
  assert.deepEqual(result.sizes, {1: 1, 2: 1, 3: 1})
  assert.equal(result.noCircuit, 1)
  assert.deepEqual(result.pairs.map(pair => [pair.a, pair.b, pair.same, pair.both]), [['alpha', 'beta', 2, 3], ['alpha', 'gamma', 1, 3], ['beta', 'gamma', 1, 3]])
  const shown = renderAgreement(result)
  assert.match(shown, /All 3 strategies wrote the same circuit \| 1 \| 25\.0%/u)
  assert.match(shown, /More than half of them wrote the same circuit \| 2 \| 50\.0%/u)
  assert.match(shown, /\| alpha \| beta \| 2 \| 50\.0% \| 3 \|/u)
  assert.match(renderAgreement(agreementOf(outputs.slice(0, 1))), /needs at least two strategies/u)
})

test('a reused strategy file is checked again', () => {
  const sample = [{id: '1', text: 'move it'}, {id: '2', text: 'drop it'}, {id: '3', text: 'lift it'}, {id: '4', text: 'turn it'}]
  const good = '@c1 syntax.clause form=imperative verb="move" complement=$n1\n@n1 syntax.nominal head="it"'
  const rows = takeOver([{id: '1', text: 'move it', sop: good, error: null}, {id: '2', text: 'drop it', sop: good, error: null, ms: 3}, {id: '3', text: 'lift something', sop: good}, {id: '9', text: 'x', sop: good}], sample)
  assert.deepEqual(rows[0], {sop: good, error: null, ms: null})
  assert.equal(rows[1].sop, null)
  assert.match(rows[1].error, /^invalid circuit: words-not-in-message/u)
  assert.equal(rows[1].ms, 3)
  assert.match(rows[2].error, /another text/u)
  assert.match(rows[3].error, /no line for this message/u)
  assert.deepEqual(rows.map(line => errorKind(line.error)), [null, 'invalid circuit (words-not-in-message)', 'no circuit', 'no circuit'])
  assert.deepEqual(['crash: boom', 'timeout: no circuit within 5 seconds', 'something else'].map(errorKind), ['crash', 'timeout', 'other'])
})

test('the list of strategies: those of the earlier benchmark, each in one family', () => {
  // the earlier benchmark called the Prolog strategy "prolog-worlds"; neural-dependencies is new
  const earlier = Object.fromEntries(Object.entries(earlierModules).map(([name, entry]) => [name === 'prolog-worlds' ? 'prolog' : name, entry]))
  // `spacy` is the one name of the strategies that read the dependency parse
  assert.deepEqual(Object.keys(strategyModules).filter(name => name !== 'neural-dependencies' && name !== 'spacy').sort(), Object.keys(earlier).sort())
  assert.deepEqual(Object.keys(activeModules), ['hmm-rules', 'spacy', 'distilbert', 'prolog', 'z3'], 'four strategies at most, with two candidates for the fourth place')
  assert.deepEqual(Object.keys(strategyStatus), Object.keys(activeModules), 'every strategy that takes part has a status')
  assert.deepEqual(Object.entries(strategyStatus).filter(([, status]) => status === 'active').map(([name]) => name), ['spacy'], 'spacy is the one active strategy')
  assert.deepEqual(['hmm-rules', 'distilbert', 'prolog', 'z3'].map(name => strategyStatus[name]), Array(4).fill('experimental'))
  for (const [name, [module, exported]] of Object.entries(strategyModules)) {
    if (earlier[name]) assert.equal(exported, earlier[name][1])
    assert.equal(existsSync(new URL(module, new URL('./benchmark/syntax/strategies.mjs', import.meta.url))), true, module)
  }
  const familyOf = familyFinder()
  // a family is the source of the analysis: whatever reads the dependency parse, or chooses among circuits written from it, stands with the parser
  assert.deepEqual(Object.keys(families), ['hmm-rules', 'parser', 'prolog', 'z3', 'distilbert'])
  for (const name of Object.keys(strategyModules)) assert.ok(families[familyOf(name)]?.includes(name), name + ' stands in a family')
  assert.deepEqual(['hmm-rules', 'spacy-direct', 'neural-dependencies', 'prolog', 'neuro-prolog', 'neuro-z3', 'distilbert', 'neuro-selector'].map(familyOf), ['hmm-rules', 'parser', 'parser', 'prolog', 'parser', 'parser', 'distilbert', 'parser'])
  assert.equal(familyOf('vss'), 'hmm-rules', 'the name of hmm-rules before 2026-11-27 stands in its family')
  assert.equal(new Set(Object.values(families).flat()).size, Object.values(families).flat().length, 'no strategy stands in two families')
  assert.equal(familyOf('a-new-strategy'), 'a-new-strategy')
})

test('only the converter of nlu references may read the old checker or the knowledge repository', () => {
  for (const name of readdirSync(tools).filter(file => file.endsWith('.mjs') && file !== 'convert-nlu.mjs')) {
    const source = readFileSync(join(tools, name), 'utf8')
    assert.doesNotMatch(source, /check-analysis|sop-knowledge-worlds|sopworld|schemas\/nlu|annotations\/nlu/u, name)
    // the runner names the knowledge directory only to keep it away from the strategies
    if (name !== 'run.mjs') assert.doesNotMatch(source, /SOP_KNOWLEDGE_DIR|knowledgeDir/u, name)
  }
  const runner = readFileSync(join(tools, 'run.mjs'), 'utf8')
  assert.match(runner, /delete process\.env\.SOP_KNOWLEDGE_DIR/u)
  assert.match(runner, /const \{knowledgeDir, strategy: _, \.\.\.configuration\}/u)
  assert.equal(runner.match(/knowledgeDir/gu).length, 2)
  assert.equal(process.env.SOP_KNOWLEDGE_DIR, undefined, 'run this test with SOP_KNOWLEDGE_DIR unset')
})

test('the rules for judges use the key names of version 3 only', () => {
  const rules = readFileSync(join(tools, 'rules.md'), 'utf8')
  assert.doesNotMatch(rules, /syntax\.(fact|thing|link|list)\b|`(action|helper|doer|describing|cue|member|asks|how|word|kind)`/u)
  for (const key of ['form', 'verb', 'auxiliary', 'negation', 'subject', 'complement', 'modifier', 'discourse', 'ellipsis', 'head', 'dependent', 'from', 'to', 'marker', 'attachment', 'conjunct', 'conjunction']) assert.match(rules, new RegExp('`' + key + '`', 'u'), key)
  for (const grade of ['L8', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6']) assert.match(rules, new RegExp('\\| ' + grade + ' \\|', 'u'))
  // 117 lines since the ten settled cases of the consistency check (7ffdbd4)
  assert.ok(rules.split('\n').length < 120, 'short enough to be read again often')
})

test('an nlu circuit is rewritten by the rules of the specification', () => {
  // the words of each message, by their place: the converter gets the place of every quoted value
  const slot = (key, raw, span) => ({key, raw, ...(span ? {span} : raw.startsWith('"') ? {span: null} : {})})
  const write = (message, wires) => normalForm(message, writeCircuit(message, convert(message, wires))).sop
  // put the lamp two inches from the edge.   Rule 4: the measure is a nominal and the relation starts at it
  assert.equal(write('put the lamp two inches from the edge.', [
    {id: 'c1', type: 'nlu.clause', slots: [slot('form', 'imperative'), slot('predicate', '"put"', [0, 0]), slot('direct_object', '$e1'), slot('terminator', '"."')]},
    {id: 'e1', type: 'nlu.entity', slots: [slot('determiner', '"the"', [1, 1]), slot('head', '"lamp"', [2, 2])]},
    {id: 'e2', type: 'nlu.entity', slots: [slot('quantity', '"two"', [3, 3]), slot('head', '"inches"', [4, 4])]},
    {id: 'e3', type: 'nlu.entity', slots: [slot('determiner', '"the"', [6, 6]), slot('head', '"edge"', [7, 7])]},
    {id: 'r1', type: 'nlu.relation', slots: [slot('kind', 'from'), slot('from', '$c1'), slot('to', '$e3'), slot('cue', '"from"', [5, 5]), slot('measure', '$e2'), slot('attachment', 'open')]}
  ]), `@c1 syntax.clause form=imperative verb="put" complement=$n1 complement=$n2
@n1 syntax.nominal dependent="the" head="lamp"
@n2 syntax.nominal dependent="two" head="inches"
@r1 syntax.relation marker="from" from=$n2 to=$n3
@n3 syntax.nominal dependent="the" head="edge"`)
  // I want to delete Jan's old box right now, please   the infinitive marker, the possessive, the words after the verb
  // the words: I 0, want 1, to 2, delete 3, Jan 4, 's 5, old 6, box 7, right 8, now 9, please 10
  assert.equal(write("I want to delete Jan's old box right now, please", [
    {id: 'c1', type: 'nlu.clause', slots: [slot('form', 'declarative'), slot('predicate', '"want"', [1, 1]), slot('subject', '$e1'), slot('clausal_complement', '$c2')]},
    {id: 'e1', type: 'nlu.entity', slots: [slot('pronoun', '"I"', [0, 0])]},
    {id: 'c2', type: 'nlu.clause', slots: [slot('form', 'nonfinite'), slot('marker', '"to"', [2, 2]), slot('predicate', '"delete"', [3, 3]), slot('direct_object', '$e2'), slot('adverb', '"right now"', [8, 9]), slot('separator', '","'), slot('filler', '"please"', [10, 10]), slot('polarity', 'positive')]},
    {id: 'e2', type: 'nlu.entity', slots: [slot('modifier', '"old"', [6, 6]), slot('head', '"box"', [7, 7]), slot('possessor', '$e3'), slot('possessive_marker', '"\'s"', [5, 5])]},
    {id: 'e3', type: 'nlu.entity', slots: [slot('name', '"Jan"', [4, 4])]}
  ]), `@n1 syntax.nominal head="I"
@c1 syntax.clause form=declarative verb="want" subject=$n1
@r1 syntax.relation marker="to" from=$c1 to=$c2
@c2 syntax.clause form=nonfinite verb="delete" modifier="right" modifier="now" discourse="please" complement=$n3
@n2 syntax.nominal head="Jan"
@r2 syntax.relation marker="'s" from=$n3 to=$n2
@n3 syntax.nominal dependent="old" head="box"`)
  // what colour is block 1?   the question word before a noun, a name after the head
  assert.equal(write('what colour is block 1?', [
    {id: 'c1', type: 'nlu.clause', slots: [slot('form', 'interrogative'), slot('question', '"what"', [0, 0]), slot('predicate', '"is"', [2, 2]), slot('subject', '$e2'), slot('predicative_entity', '$e1'), slot('terminator', '"?"')]},
    {id: 'e1', type: 'nlu.entity', slots: [slot('head', '"colour"', [1, 1])]},
    {id: 'e2', type: 'nlu.entity', slots: [slot('head', '"block"', [3, 3]), slot('name', '"1"', [4, 4])]}
  ]), `@n1 syntax.nominal dependent="what" head="colour"
@c1 syntax.clause form=interrogative verb="is" subject=$n2 complement=$n1
@n2 syntax.nominal head="block"
@n3 syntax.nominal head="1"
@r1 syntax.relation from=$n2 to=$n3`)
  // what the rules do not settle is left out, with the reason
  const reason = wires => { try { convert('make A blue and B green', wires); return null } catch (error) { return error.message } }
  const gapped = [
    {id: 'c1', type: 'nlu.clause', slots: [slot('form', 'imperative'), slot('predicate', '"make"', [0, 0]), slot('direct_object', '$e1'), slot('result_complement', '"blue"', [2, 2])]},
    {id: 'e1', type: 'nlu.entity', slots: [slot('name', '"A"', [1, 1])]},
    {id: 'c2', type: 'nlu.clause', slots: [slot('form', 'fragment'), slot('topic', '$e2'), slot('result_complement', '"green"', [5, 5])]},
    {id: 'e2', type: 'nlu.entity', slots: [slot('name', '"B"', [4, 4])]},
    {id: 'k1', type: 'nlu.coordination', slots: [slot('kind', 'additive'), slot('member', '$c1'), slot('member', '$c2'), slot('cue', '"and"', [3, 3])]}
  ]
  assert.match(reason(gapped), /does not say whether it shares that verb/u)
  assert.match(reason([{id: 'c1', type: 'nlu.clause', slots: [slot('form', 'imperative'), slot('connective', '"and"', [3, 3]), slot('predicate', '"make"', [0, 0])]}]), /connective with no coordination/u)
  assert.match(reason([{id: 'c1', type: 'nlu.clause', slots: [slot('form', 'fragment'), slot('unresolved', '"make"', [0, 0])]}]), /unresolved words/u)
})

test('one run from start to table, with stub strategies and a registry of its own', () => {
  const datasetBefore = datasetFiles()
  const folder = mkdtempSync(join(tmpdir(), 'syntax-benchmark-'))
  // the labels of the trial: the syntactic files beside its registry. No message has a circuit yet;
  // "rest here" is a message of the dataset that is no part of the run.
  const syntactic = join(folder, 'syntactic'), fileA = join(syntactic, 'things/a.csv'), fileB = join(syntactic, 'things/b.csv')
  mkdirSync(join(syntactic, 'things'), {recursive: true})
  writeFileSync(fileA, 'text,sop,source,accepted_by\nmove it,,,\nforget it,,,\nrest here,,,\nthrow it,,,\n')
  writeFileSync(fileB, 'text,sop,source,accepted_by\r\ncrash it,,,\r\nskip it,,,\r\ndrop it,,,\r\n')
  const run = join(folder, 'run'), registry = join(folder, 'registry'), sampleFile = join(folder, 'sample.json.gz'), strategies = join(folder, 'strategies.mjs')
  const sample = ['move it', 'forget it', 'throw it', 'crash it', 'skip it', 'drop it'].map((message, index) => ({id: 'm' + index, text: message, references: ['never read']}))
  writeFileSync(sampleFile, gzipSync(JSON.stringify(sample)))
  writeFileSync(join(folder, 'stub.mjs'), `
const full = (verb, thing) => '@c1 syntax.clause form=imperative verb="' + verb + '" complement=$n1\\n@n1 syntax.nominal head="' + thing + '"'
const flat = (verb, thing) => '@a syntax.clause form=imperative verb="' + verb + '" modifier="' + thing + '"'
const reader = write => ({schema: 'syntax', async open() { return {async analyse(text) {
  const [verb, thing] = text.split(' ')
  if (verb === 'throw') throw new Error('boom')
  if (verb === 'crash') process.exit(3)
  if (verb === 'skip') return {analyses: [], error: 'nothing to say'}
  if (verb === 'forget') return {analyses: [{sop: '@c1 syntax.clause form=imperative verb="forget"'}]}
  return {analyses: [{sop: write(verb, thing)}]}
}, async close() {}}}})
export const careful = {name: 'careful', ...reader(full)}
export const hasty = {name: 'hasty', ...reader((verb, thing) => verb === 'drop' ? flat(verb, thing) : full(verb, thing))}
export const bold = {name: 'bold', ...reader((verb, thing) => verb === 'move' ? flat(verb, thing) : full(verb, thing))}
export const old = {name: 'old', async open() { return {async analyse() { return {analyses: []} }, async close() {}} }}
export const closed = {name: 'closed', schema: 'syntax', async open() { throw new Error('no model') }}
`)
  writeFileSync(strategies, `export const strategyModules = {careful: ['./stub.mjs', 'careful'], hasty: ['./stub.mjs', 'hasty'], old: ['./stub.mjs', 'old'], closed: ['./stub.mjs', 'closed'], missing: ['./none.mjs', 'none']}\n`)
  const node = (tool, ...args) => spawnSync(process.execPath, [join(tools, tool), ...args], {encoding: 'utf8', env: {...process.env, SOP_KNOWLEDGE_DIR: '/nowhere'}})
  const started = node('run.mjs', run, '--strategies', strategies, '--sample', sampleFile)
  assert.equal(started.status, 0, started.stderr)
  const summary = readJson(join(run, 'summary.json'))
  assert.equal(summary.messages, 6)
  assert.deepEqual(Object.fromEntries(Object.entries(summary.strategies).map(([name, entry]) => [name, entry.status])), {careful: 'ran', hasty: 'ran', old: 'not ported', closed: 'failed to start', missing: 'failed to start'})
  assert.match(summary.strategies.closed.error, /no model/u)
  // a strategy that throws, or whose process ends, loses one message and the run goes on
  assert.deepEqual([summary.strategies.careful.messages, summary.strategies.careful.valid, summary.strategies.careful.restarts], [6, 2, 1])
  assert.deepEqual(summary.strategies.careful.errors, {'invalid circuit (uncovered-words)': 1, crash: 2, 'no circuit': 1})
  assert.equal(typeof summary.strategies.careful.medianMs, 'number')
  const lines = readJsonl(join(run, 'careful.jsonl'))
  assert.deepEqual(lines.map(line => Object.keys(line)), Array(6).fill(['id', 'text', 'sop', 'error', 'ms']))
  assert.deepEqual(lines.map(line => line.sop === null ? line.error.split(':')[0] : 'circuit'), ['circuit', 'invalid circuit', 'crash', 'crash', 'no circuit', 'circuit'])
  assert.match(lines[2].error, /boom/u)
  assert.match(lines[3].error, /exit code 3/u)
  assert.match(lines[4].error, /nothing to say/u)
  assert.equal(existsSync(join(run, 'old.jsonl')), false)

  // the judge gets each new circuit once, and nothing that names a strategy
  const prepared = node('judge-prepare.mjs', run, '--registry', registry, '--size', '2')
  assert.equal(prepared.status, 0, prepared.stderr)
  const judging = join(run, 'judging')
  assert.deepEqual(readdirSync(judging).sort(), ['RULES.md', 'check.mjs', 'packet-1.jsonl', 'packet-2.jsonl'])
  const packet = [...readJsonl(join(judging, 'packet-1.jsonl')), ...readJsonl(join(judging, 'packet-2.jsonl'))]
  assert.deepEqual(packet.map(line => [line.n, line.text]), [[1, 'move it'], [2, 'drop it'], [3, 'drop it']])
  assert.doesNotMatch(JSON.stringify(packet), /careful|hasty|@a /u)
  const check = k => spawnSync(process.execPath, [join(judging, 'check.mjs'), String(k)], {encoding: 'utf8'})
  assert.match(check(1).stdout, /packet 1: 2 rows, 0 judged .* 2 still to judge/u)
  const flatNumber = packet.find(line => /modifier/u.test(line.sop)).n, fullNumber = packet.find(line => line.text === 'drop it' && line.n !== flatNumber).n
  const verdict = n => JSON.stringify(n === flatNumber ? {n, grade: 'L3', note: "'it' is held as a modifier"} : {n, grade: 'L8', note: ''})
  writeFileSync(join(judging, 'verdicts-1.jsonl'), [1, 2].map(verdict).join('\n') + '\n')
  assert.equal(check(1).status, 0)
  assert.match(check(1).stdout, /2 judged \(\d accepted, \d rejected\), 0 still to judge[\s\S]*The format is right/u)
  writeFileSync(join(judging, 'verdicts-2.jsonl'), '{"n": 3, "grade": "L3", "note": "no words quoted"}\n')
  assert.equal(check(2).status, 1)
  assert.equal(node('judge-publish.mjs', run, '--tag', 'round-1', '--registry', registry).status, 1, 'a verdict file with problems is not published')
  assert.match(node('table.mjs', run, '--registry', registry).stdout, /1 verdict lines of this run have a format problem and are not counted/u)

  // with one circuit still waiting
  writeFileSync(join(judging, 'verdicts-2.jsonl'), '')
  const before = node('table.mjs', run, '--registry', registry)
  assert.equal(before.status, 0, before.stderr)
  const levels = name => readJson(join(run, 'table.json')).strategies.find(line => line.strategy === name)
  const waitingFor = flatNumber === 3 ? 'hasty' : 'careful'
  assert.equal(levels(waitingFor).waiting, 1)
  assert.match(before.stdout, /old \(not ported\), closed \(failed to start\), missing \(failed to start\)/u)

  writeFileSync(join(judging, 'verdicts-2.jsonl'), verdict(3) + '\n')
  const published = node('judge-publish.mjs', run, '--tag', 'round-1', '--judge', 'test-judge', '--registry', registry)
  assert.equal(published.status, 0, published.stderr)
  const stored = readJsonl(join(registry, 'round-1.jsonl'))
  assert.deepEqual(stored.map(line => Object.keys(line)), Array(3).fill(['text', 'sop', 'core', 'verdict', 'grade', 'note', 'judge', 'run', 'source']))
  assert.deepEqual(stored.map(line => [line.text, line.verdict, line.grade, line.judge, line.run, line.source]).sort(), [
    ['drop it', 'accepted', 'L8', 'test-judge', 'round-1', 'careful'], ['drop it', 'rejected', 'L3', 'test-judge', 'round-1', 'hasty'], ['move it', 'accepted', 'L8', 'test-judge', 'round-1', 'careful+hasty']])
  for (const line of stored) assert.equal(line.core, coreOf(line.text, line.sop))
  assert.equal(node('judge-publish.mjs', run, '--tag', 'round-1', '--registry', registry).status, 1, 'a tag is never overwritten')
  assert.equal(fullNumber !== flatNumber, true)
  // every accepted circuit is now the label of its message: the cell of its row in the syntactic files.
  // The rows the run says nothing about are as they were. The labels before the run are kept in the run folder.
  assert.match(published.stdout, /Labels: 2 messages got the circuit accepted in this run as their label \(2 had no label, 0 had another one\)\. 2 files of /u)
  const acceptedSop = message => stored.find(other => other.text === message && other.verdict === 'accepted').sop
  assert.equal(readFileSync(fileA, 'utf8'), 'text,sop,source,accepted_by\nmove it,' + csvCell(acceptedSop('move it')) + ',careful+hasty,judge\nforget it,,,\nrest here,,,\nthrow it,,,\n')
  assert.equal(readFileSync(fileB, 'utf8'), 'text,sop,source,accepted_by\r\ncrash it,,,\r\nskip it,,,\r\ndrop it,' + csvCell(acceptedSop('drop it')) + ',careful,judge\r\n')
  const labelled = readLabels(syntactic)
  assert.deepEqual([...labelled.values()].map(line => [line.text, line.source, line.accepted_by, line.core === coreOf(line.text, line.label)]), [['move it', 'careful+hasty', 'judge', true], ['drop it', 'careful', 'judge', true]])
  assert.equal(readFileSync(join(run, 'key', 'labels-before.jsonl'), 'utf8'), '', 'no message of the run had a label')

  // judged in this run, and the messages had no label: L8. The table does not change when the verdicts are published.
  const table = node('table.mjs', run, '--registry', registry)
  assert.equal(table.status, 0, table.stderr)
  assert.deepEqual(levels('careful').levels, {L0: 4, L1: 0, L2: 0, L3: 0, L4: 0, L5: 0, L6: 0, L7: 0, L8: 2, L9: 0, L10: 0})
  assert.deepEqual(levels('hasty').levels, {L0: 4, L1: 0, L2: 0, L3: 1, L4: 0, L5: 0, L6: 0, L7: 0, L8: 1, L9: 0, L10: 0})
  assert.equal(levels('careful').goal, 2 / 6)
  assert.match(readFileSync(join(run, 'table.md'), 'utf8'), /\| careful \| 6 \| 4 \| 0 \| 0 \| 0 \| 0 \| 0 \| 0 \| 0 \| 2 \| 0 \| 0 \| 0 \| 33\.3% \|/u)
  const agreement = node('agree.mjs', run, '--registry', registry)
  assert.equal(agreement.status, 0, agreement.stderr)
  assert.match(agreement.stdout, /All 2 strategies wrote the same circuit \| 1 \| 16\.7% \| 1 \| 0 \| 0 \|/u)

  // a later run reuses the files and needs no judge: a circuit equal to the label is L9
  const later = join(folder, 'later')
  assert.equal(node('run.mjs', later, '--strategies', strategies, '--sample', sampleFile, '--reuse', run, '--only', 'careful,hasty').status, 0)
  assert.equal(readJson(join(later, 'summary.json')).strategies.hasty.status, 'reused')
  const again = node('judge-prepare.mjs', later, '--registry', registry)
  assert.match(again.stdout, /0 distinct circuits need a judge/u)
  assert.equal(existsSync(join(later, 'judging', 'packet-1.jsonl')), false)
  assert.equal(node('table.mjs', later, '--registry', registry).status, 0)
  const laterLevels = readJson(join(later, 'table.json')).strategies
  assert.deepEqual(laterLevels.map(line => [line.strategy, line.levels.L9, line.levels.L3, line.levels.L8, line.waiting]), [['careful', 2, 0, 0, 0], ['hasty', 1, 1, 0, 0]])
  assert.match(readFileSync(join(later, 'table.md'), 'utf8'), /Before the run, 2 of the 6 messages had a label/u)
  assert.match(again.stdout, /2 of the 6 messages of this run have a label/u)
  assert.deepEqual(readJsonl(join(later, 'key', 'labels-before.jsonl')).map(line => [Object.keys(line).join(), line.text]), [['text,label,source,accepted_by', 'move it'], ['text,label,source,accepted_by', 'drop it']])

  // a third run: another strategy writes another circuit for "move it", and a judge accepts it
  const third = join(folder, 'third'), onlyBold = join(folder, 'strategies-bold.mjs')
  writeFileSync(onlyBold, `export const strategyModules = {bold: ['./stub.mjs', 'bold']}\n`)
  assert.equal(node('run.mjs', third, '--strategies', onlyBold, '--sample', sampleFile).status, 0)
  const thirdPrepared = node('judge-prepare.mjs', third, '--registry', registry)
  assert.match(thirdPrepared.stdout, /\| bold \| 6 \| 4 \| 1 \| 0 \| 0 \| 1 \|/u)      // one circuit equal to the label, one for the judge
  const [replacing] = readJsonl(join(third, 'judging', 'packet-1.jsonl'))
  assert.deepEqual([replacing.n, replacing.text], [1, 'move it'])
  writeFileSync(join(third, 'judging', 'verdicts-1.jsonl'), '{"n": 1, "grade": "L8", "note": ""}\n')
  assert.equal(node('table.mjs', third, '--registry', registry).status, 0)
  const thirdLevels = () => readJson(join(third, 'table.json')).strategies[0].levels
  assert.deepEqual(thirdLevels(), {L0: 4, L1: 0, L2: 0, L3: 0, L4: 0, L5: 0, L6: 0, L7: 0, L8: 0, L9: 1, L10: 1})
  const replaced = node('judge-publish.mjs', third, '--tag', 'round-2', '--judge', 'test-judge', '--registry', registry)
  assert.equal(replaced.status, 0, replaced.stderr)
  assert.match(replaced.stdout, /Labels: 1 messages got the circuit accepted in this run as their label \(0 had no label, 1 had another one\)\. 1 files of /u)
  assert.equal(readFileSync(fileA, 'utf8'), 'text,sop,source,accepted_by\nmove it,' + csvCell(replacing.sop) + ',bold,judge\nforget it,,,\nrest here,,,\nthrow it,,,\n')
  assert.equal(readFileSync(fileB, 'utf8'), 'text,sop,source,accepted_by\r\ncrash it,,,\r\nskip it,,,\r\ndrop it,' + csvCell(acceptedSop('drop it')) + ',careful,judge\r\n', 'a file with no change is as it was')
  // the tables of the three runs stay as they were: each run is compared with the labels it found
  for (const folderOfRun of [run, later, third]) assert.equal(node('table.mjs', folderOfRun, '--registry', registry).status, 0)
  assert.deepEqual(thirdLevels(), {L0: 4, L1: 0, L2: 0, L3: 0, L4: 0, L5: 0, L6: 0, L7: 0, L8: 0, L9: 1, L10: 1})
  assert.deepEqual([levels('careful').levels.L8, levels('careful').levels.L9, levels('careful').levels.L10], [2, 0, 0])
  assert.deepEqual(readJson(join(later, 'table.json')).strategies.map(line => line.levels.L9), [2, 1])
  // a fourth run finds the new labels: the older accepted circuit of "move it" is still accepted, and is not the label
  const fourth = join(folder, 'fourth')
  assert.equal(node('run.mjs', fourth, '--strategies', strategies, '--sample', sampleFile, '--reuse', run, '--only', 'careful').status, 0)
  assert.equal(node('table.mjs', fourth, '--registry', registry).status, 0)
  assert.deepEqual(readJson(join(fourth, 'table.json')).strategies[0].levels, {L0: 4, L1: 0, L2: 0, L3: 0, L4: 0, L5: 0, L6: 0, L7: 0, L8: 1, L9: 1, L10: 0})

  // none of this touched the syntactic files of the dataset
  assert.equal(datasetFiles(), datasetBefore)
})

test('a strategy that hangs loses one message and the run goes on', () => {
  const folder = mkdtempSync(join(tmpdir(), 'syntax-benchmark-'))
  const sampleFile = join(folder, 'sample.json.gz'), strategies = join(folder, 'strategies.mjs'), run = join(folder, 'run')
  writeFileSync(sampleFile, gzipSync(JSON.stringify(['move it', 'hang it', 'drop it'].map((message, index) => ({id: 'm' + index, text: message})))))
  writeFileSync(join(folder, 'stub.mjs'), `export const slow = {name: 'slow', schema: 'syntax', async open({pace} = {}) { return {async analyse(text) {
  const [verb, thing] = text.split(' ')
  if (verb === 'hang') for (;;) {}
  return {analyses: [{sop: '@c1 syntax.clause form=imperative verb="' + verb + '" complement=$n1\\n@n1 syntax.nominal head="' + thing + '"', pace}]}
}}}}\n`)
  writeFileSync(strategies, `export const strategyModules = {slow: ['./stub.mjs', 'slow']}\n`)
  writeFileSync(join(folder, 'options.json'), JSON.stringify({slow: {pace: 'steady', knowledgeDir: '/nowhere'}}))
  const result = spawnSync(process.execPath, [join(tools, 'run.mjs'), run, '--strategies', strategies, '--sample', sampleFile, '--timeout', '1', '--options', join(folder, 'options.json')], {encoding: 'utf8'})
  assert.equal(result.status, 0, result.stderr)
  const entry = readJson(join(run, 'summary.json')).strategies.slow
  assert.deepEqual([entry.status, entry.messages, entry.valid, entry.restarts, entry.errors], ['ran', 3, 2, 1, {timeout: 1}])
  assert.deepEqual(readJsonl(join(run, 'slow.jsonl')).map(line => line.sop === null ? line.error : 'circuit'), ['circuit', 'timeout: no circuit within 1 seconds', 'circuit'])
})

test('a round takes the next source files that have no syntactic file', () => {
  const sources = [{file: 'a/big.csv', messages: 900}, {file: 'a/small.csv', messages: 40}, {file: 'b/tiny.csv', messages: 3}, {file: 'b/mid.csv', messages: 480}, {file: 'c/mid.csv', messages: 480}]
  const names = picked => picked.map(source => source.file)
  // fewest messages first; a round that caught small files takes another one
  assert.deepEqual(names(pickFiles(sources)), ['b/tiny.csv', 'a/small.csv', 'b/mid.csv'])
  assert.deepEqual(names(pickFiles(sources, {minMessages: 40})), ['b/tiny.csv', 'a/small.csv'])
  assert.deepEqual(names(pickFiles(sources, {minMessages: 1})), ['b/tiny.csv'])
  assert.deepEqual(names(pickFiles(sources, {order: 'name'})), ['a/big.csv'])
  assert.deepEqual(names(pickFiles(sources, {order: 'name', taken: new Set(['a/big.csv'])})), ['a/small.csv', 'b/mid.csv'])
  // a file that has its syntactic file, or belongs to a round in progress, is not taken again
  assert.deepEqual(names(pickFiles(sources, {taken: new Set(['b/tiny.csv', 'b/mid.csv'])})), ['a/small.csv', 'c/mid.csv'])
  assert.deepEqual(pickFiles(sources, {taken: new Set(sources.map(source => source.file))}), [])
  // the last files may leave a round below the minimum
  assert.deepEqual(names(pickFiles(sources, {taken: new Set(['a/big.csv', 'b/mid.csv', 'c/mid.csv'])})), ['b/tiny.csv', 'a/small.csv'])
  // an explicit choice is taken as given
  assert.deepEqual(names(pickFiles(sources, {files: ['a/big.csv', 'b/tiny.csv']})), ['a/big.csv', 'b/tiny.csv'])
  assert.throws(() => pickFiles(sources, {files: ['a/none.csv']}), /no source file/u)
  assert.throws(() => pickFiles(sources, {files: ['a/big.csv'], taken: new Set(['a/big.csv'])}), /has a syntactic file already, or belongs to a round in progress/u)
  assert.throws(() => pickFiles(sources, {order: 'date'}), /"size" or "name"/u)
  assert.deepEqual(planRounds(sources, 5).map(names), [['b/tiny.csv', 'a/small.csv', 'b/mid.csv'], ['c/mid.csv', 'a/big.csv']])
  assert.deepEqual(planRounds(sources, 2, {taken: new Set(['b/tiny.csv']), minMessages: 500}).map(names), [['a/small.csv', 'b/mid.csv'], ['c/mid.csv', 'a/big.csv']])
  // each distinct text of a file once, in the order of the file
  assert.deepEqual(messagesOfFile('text,sop\nmove it,@a\n"drop it, now",@b\nmove it,@c\n ,@d\n'), [{record: 1, text: 'move it'}, {record: 2, text: 'drop it, now'}])
  // only the files under semantic/ hold the messages; a syntactic file is never a source
  assert.deepEqual(messageFiles(['README.md', 'semantic/drawing/style-01.csv', 'syntactic/drawing/style-01.csv', 'semantic/NAMES.md', 'semantic/calendar/meetings-01.csv', 'annotations/x.csv']),
    [['semantic/calendar/meetings-01.csv', 'calendar/meetings-01.csv'], ['semantic/drawing/style-01.csv', 'drawing/style-01.csv']])
  assert.deepEqual(messageFiles(['drawing/style-01.csv', 'syntactic/drawing/style-01.csv', 'tools/fixture.csv', 'README.md']), [['drawing/style-01.csv', 'drawing/style-01.csv']])
})

test('a circuit written alike by strategies of two families is settled by agreement', () => {
  const full = verb => `@c1 syntax.clause form=imperative verb="${verb}" complement=$n1\n@n1 syntax.nominal head="it"`
  const flat = verb => `@c1 syntax.clause form=imperative verb="${verb}" modifier="it"`
  const other = verb => `@x syntax.clause form=imperative verb="${verb}" complement=$y\n@y syntax.nominal head="it"`      // full, by another hand
  const familyOf = familyFinder({one: ['alpha'], two: ['beta', 'gamma'], three: ['delta']})
  const messages = ['move it', 'drop it', 'lift it', 'turn it', 'hide it', 'show it']
  const rowsOf = choose => withCores(messages.map((message, index) => row(String(index), message, choose(message.split(' ')[0]))))
  const outputs = [
    {strategy: 'alpha', rows: rowsOf(verb => verb === 'lift' ? flat(verb) : verb === 'show' ? null : full(verb))},
    {strategy: 'beta', rows: rowsOf(verb => ['drop', 'lift', 'show'].includes(verb) ? flat(verb) : other(verb))},
    {strategy: 'gamma', rows: rowsOf(verb => ['drop', 'show'].includes(verb) ? flat(verb) : verb === 'lift' ? null : other(verb))},
    {strategy: 'delta', rows: rowsOf(verb => verb === 'drop' ? full(verb) : verb === 'move' ? flat(verb) : null)}
  ]
  const registry = emptyRegistry()
  addToRegistry(registry, judged('turn it', full('turn'), 'rejected', {grade: 'L3'}))      // agreed, but a judge rejected it
  addToRegistry(registry, judged('hide it', full('hide'), 'accepted'))                     // agreed, and already accepted
  const agreed = agreedCircuits(outputs, registry, familyOf)
  // move: alpha with beta and gamma. drop: the full circuit by alpha and delta; the flat one by beta and gamma, one family.
  // lift: flat by alpha and beta. show: flat by beta and gamma only. turn and hide keep the verdict of the registry.
  assert.deepEqual(agreed.map(circuit => [circuit.text, circuit.sources, circuit.families]), [
    ['move it', ['alpha', 'beta', 'gamma'], ['one', 'two']], ['drop it', ['alpha', 'delta'], ['one', 'three']], ['lift it', ['alpha', 'beta'], ['one', 'two']]])
  assert.equal(agreed[1].core, normalForm('drop it', full('drop')).core)
  assert.equal(agreed[2].core, normalForm('lift it', flat('lift')).core)
  for (const circuit of agreed) assert.equal(circuit.sop, normalForm(circuit.text, circuit.sop).sop)
  // with one family for all, nothing is settled by agreement
  assert.deepEqual(agreedCircuits(outputs, registry, () => 'same'), [])

  // a share of the agreed circuits goes to a judge all the same; the others need none
  const key = circuit => circuit.text + '\0' + circuit.core
  const audited = chooseAudit(agreed, 1 / 3, 'round-1')
  assert.equal(audited.size, 1)
  assert.deepEqual(chooseAudit([...agreed].reverse(), 1 / 3, 'round-1'), audited)
  assert.equal(chooseAudit(agreed, 0, 'round-1').size, 0)
  assert.equal(chooseAudit(agreed, 1, 'round-1').size, 3)
  const agreedKeys = new Set(agreed.map(key))
  const {items} = collectItems(outputs, registry, {skip: (message, core) => agreedKeys.has(message + '\0' + core) && !audited.has(message + '\0' + core)})
  const sent = items.map(key)
  assert.equal(agreed.filter(circuit => sent.includes(key(circuit))).length, 1)
  // everything else goes to the judge: move flat (delta), drop flat, show flat; not what the registry holds
  assert.deepEqual(items.filter(item => !agreedKeys.has(key(item))).map(item => [item.text, item.sources]), [['move it', ['delta']], ['drop it', ['beta', 'gamma']], ['show it', ['beta', 'gamma']]])

  // levels: a circuit settled by agreement counts as accepted for the strategies that wrote it
  const verdicts = runVerdicts(items, items.filter(item => item.text === 'move it' && !agreedKeys.has(key(item))).map(item => ({n: item.n, grade: 'L3', note: "'it'"})), agreed)
  const labels = new Map([['lift it', {core: normalForm('lift it', full('lift')).core}]])
  assert.deepEqual(outputs[0].rows.map(line => levelOf(line, registry, verdicts, labels)), ['L8', 'L8', 'L10', 'L3', 'L8', 'L0'])     // alpha
  assert.deepEqual(outputs[3].rows.map(line => levelOf(line, registry, verdicts, labels)), ['L3', 'L8', 'L0', 'L0', 'L0', 'L0'])      // delta
  assert.equal(verdicts.get('move it').get(agreed[0].core).by, 'agreement')
  // a judge who read an agreed circuit has the last word
  const audit = runVerdicts([{n: 1, ...agreed[0]}], [{n: 1, grade: 'L1', note: "'move'"}], agreed)
  assert.deepEqual([audit.get('move it').get(agreed[0].core).grade, audit.get('move it').get(agreed[0].core).by], ['L1', 'judge'])

  // Once an agreed circuit is the label of its message (the cell of the syntactic file, accepted_by
  // agreement), no registry line says so. It is still known as accepted: it is not settled again, it
  // is not sent to a judge, and a strategy that writes it is at L9.
  const written = new Map([['move it', labelLine({text: 'move it', label: full('move'), source: 'alpha+beta+gamma', accepted_by: 'agreement'})],
    ['drop it', labelLine({text: 'drop it', label: flat('drop'), source: 'beta+gamma', accepted_by: 'judge'})]])
  assert.deepEqual(agreedCircuits(outputs, registry, familyOf, 2, {labels: written}).map(circuit => circuit.text), ['drop it', 'lift it'])
  const later = collectItems(outputs, registry, {labels: written}).items
  assert.deepEqual(later.map(item => [item.text, item.sources]), [['move it', ['delta']], ['drop it', ['alpha', 'delta']], ['lift it', ['alpha', 'beta']], ['show it', ['beta', 'gamma']]])
  assert.deepEqual(outputs.map(output => levelOf(output.rows[0], registry, new Map(), written)), ['L9', 'L9', 'L9', 'waiting'])
  assert.deepEqual(outputs.map(output => levelOf(output.rows[1], registry, new Map(), written)), ['waiting', 'L9', 'L9', 'waiting'])
})

test('circuits that differ only where the judges\' rules let both ways pass share an agreement key', () => {
  const same = (message, one, other) => {
    const [a, b] = [agreementKey(message, one), agreementKey(message, other)]
    assert.ok(a && b, `both circuits of "${message}" are valid`)
    assert.equal(a, b, message)
  }
  const differ = (message, one, other) => {
    const [a, b] = [agreementKey(message, one), agreementKey(message, other)]
    assert.ok(a && b, `both circuits of "${message}" are valid`)
    assert.notEqual(a, b, message)
  }
  assert.equal(agreementKey('move it', '@c1 syntax.clause form=imperative verb="move"'), null)      // "it" is not covered
  // the start of a marked relation, as relaxedCore
  same(text, verbReading, nounReading); same(text, verbReading, openReading); assert.equal(agreementKey(text, broken), null)
  differ(text, verbReading, verbReading.replace(' dependent="red"', '').replace('verb="put"', 'verb="put" modifier="red"'))
  // which clause holds a discourse word; a fragment of nothing but "Thanks"
  same('Please, make fence purple. Thanks!',
    '@c1 syntax.clause form=imperative discourse="Please" verb="make" modifier="purple" discourse="Thanks" complement=$n1\n@n1 syntax.nominal head="fence"',
    '@c1 syntax.clause form=imperative discourse="Please" verb="make" modifier="purple" complement=$n1\n@n1 syntax.nominal head="fence"\n@c2 syntax.clause form=fragment discourse="Thanks"')
  // a number right after a noun: a dependent, or a nominal of its own tied without a marker; not the head of the noun
  const triangle = 'can you add a triangle 120?'
  const asked = '@c1 syntax.clause form=interrogative auxiliary="can" verb="add" subject=$n1 complement=$n2\n@n1 syntax.nominal head="you"\n'
  same(triangle, asked + '@n2 syntax.nominal dependent="a" head="triangle" dependent="120"',
    asked + '@n2 syntax.nominal dependent="a" head="triangle"\n@n3 syntax.nominal head="120"\n@r1 syntax.relation from=$n2 to=$n3')
  differ(triangle, asked + '@n2 syntax.nominal dependent="a" head="triangle" dependent="120"', asked + '@n2 syntax.nominal dependent="a" dependent="triangle" head="120"')
  // a name of several words: whole in head, its last word as head, or a name and a number tied without a marker
  const book = 'book Review on Work 5'
  const booked = '@c1 syntax.clause form=imperative verb="book" complement=$n1\n@n1 syntax.nominal head="Review"\n@r1 syntax.relation marker="on" from=$c1 to=$n2\n'
  same(book, booked + '@n2 syntax.nominal head="Work 5"', booked + '@n2 syntax.nominal dependent="Work" head="5"')
  same(book, booked + '@n2 syntax.nominal head="Work 5"', booked + '@n2 syntax.nominal head="Work"\n@n3 syntax.nominal head="5"\n@r2 syntax.relation from=$n2 to=$n3')
  // a name split into two nominals is no number after a noun; a head that mixes a noun with part of a name is no name
  differ('add Core Hub', '@c1 syntax.clause form=imperative verb="add" complement=$n1\n@n1 syntax.nominal head="Core Hub"',
    '@c1 syntax.clause form=imperative verb="add" complement=$n1\n@n1 syntax.nominal head="Core"\n@n2 syntax.nominal head="Hub"\n@r1 syntax.relation from=$n1 to=$n2')
  const meeting = '@c1 syntax.clause form=imperative verb="make" complement=$n1\n@n1 syntax.nominal dependent="one" '
  differ('make one meeting Intro Main', meeting + 'head="meeting" dependent="Intro" dependent="Main"', meeting + 'head="meeting Intro" dependent="Main"')
  // a name of its own that is the start of a marked relation is not merged: the start would move to the noun
  const slot = 'book Room 1 from 09:00 UTC for 15 minutes'
  const room = '@c1 syntax.clause form=imperative verb="book" complement=$n1\n@n1 syntax.nominal head="Room 1"\n@r1 syntax.relation marker="from" from=$c1 to=$n2\n'
  differ(slot, room + '@n2 syntax.nominal head="09:00" dependent="UTC"\n@r2 syntax.relation marker="for" from=$c1 to=$n3\n@n3 syntax.nominal dependent="15" head="minutes"',
    room + '@n2 syntax.nominal head="09:00"\n@n4 syntax.nominal head="UTC"\n@r3 syntax.relation from=$n2 to=$n4\n@r2 syntax.relation marker="for" from=$n4 to=$n3\n@n3 syntax.nominal dependent="15" head="minutes"')
  // "a bit": a measure nominal, or modifiers of the clause
  same('make the markers a bit bigger', '@c1 syntax.clause form=imperative verb="make" modifier="bigger" complement=$n1 complement=$n2\n@n1 syntax.nominal dependent="the" head="markers"\n@n2 syntax.nominal dependent="a" head="bit"',
    '@c1 syntax.clause form=imperative verb="make" modifier="a" modifier="bit" modifier="bigger" complement=$n1\n@n1 syntax.nominal dependent="the" head="markers"')
  // a naming participle: a nonfinite clause tied to the thing, or the marker of a relation from the thing; not from another thing
  const heading = '@c1 syntax.clause form=imperative verb="create" complement=$n1\n@n1 syntax.nominal dependent="a" head="heading"\n@n2 syntax.nominal head="Overview"\n'
  same('create a heading named Overview', heading + '@c2 syntax.clause form=nonfinite verb="named" complement=$n2\n@r1 syntax.relation from=$n1 to=$c2', heading + '@r1 syntax.relation marker="named" from=$n1 to=$n2')
  const oak = 'put a box by the tree called Oak'
  const tree = '@c1 syntax.clause form=imperative verb="put" complement=$n1\n@n1 syntax.nominal dependent="a" head="box"\n@r1 syntax.relation marker="by" from=$c1 to=$n2\n@n2 syntax.nominal dependent="the" head="tree"\n@n3 syntax.nominal head="Oak"\n'
  same(oak, tree + '@c2 syntax.clause form=nonfinite verb="called" complement=$n3\n@r2 syntax.relation from=$n2 to=$c2', tree + '@r2 syntax.relation marker="called" from=$n2 to=$n3')
  differ(oak, tree + '@c2 syntax.clause form=nonfinite verb="called" complement=$n3\n@r2 syntax.relation from=$n2 to=$c2', tree + '@r2 syntax.relation marker="called" from=$n1 to=$n3')
  // a quantity phrase before a noun: dependents of the noun, or a nominal with a relation marked "of"
  same('add a pair of small ducks', '@c1 syntax.clause form=imperative verb="add" complement=$n1\n@n1 syntax.nominal dependent="a" dependent="pair" dependent="of" dependent="small" head="ducks"',
    '@c1 syntax.clause form=imperative verb="add" complement=$n1\n@n1 syntax.nominal dependent="a" head="pair"\n@r1 syntax.relation marker="of" from=$n1 to=$n2\n@n2 syntax.nominal dependent="small" head="ducks"')
  // "let's": the clause of "let" with "'s" as the subject of "add" or not, or discourse words of the clause of "add"
  const lets = "let's add a piglet"
  const letClause = '@c1 syntax.clause form=imperative verb="let" complement=$n1\n@n1 syntax.nominal head="\'s"\n@r1 syntax.relation from=$c1 to=$c2\n@n2 syntax.nominal dependent="a" head="piglet"\n'
  same(lets, letClause + '@c2 syntax.clause form=nonfinite verb="add" subject=$n1 complement=$n2', letClause + '@c2 syntax.clause form=nonfinite verb="add" complement=$n2')
  same(lets, letClause + '@c2 syntax.clause form=nonfinite verb="add" complement=$n2', '@c1 syntax.clause form=imperative discourse="let" discourse="\'s" verb="add" complement=$n1\n@n1 syntax.nominal dependent="a" head="piglet"')
  // "left of": one marker, or "left" a modifier of the clause with "of" starting at the clause; not at the thing placed
  const road = 'put the road just left of the lake'
  const placed = '@c1 syntax.clause form=imperative verb="put" modifier="just" complement=$n1\n@n1 syntax.nominal dependent="the" head="road"\n@n2 syntax.nominal dependent="the" head="lake"\n'
  same(road, placed + '@r1 syntax.relation marker="left of" from=$n1 to=$n2', placed.replace('modifier="just"', 'modifier="just" modifier="left"') + '@r1 syntax.relation marker="of" from=$c1 to=$n2')
  differ(road, placed + '@r1 syntax.relation marker="left of" from=$n1 to=$n2', placed.replace('modifier="just"', 'modifier="just" modifier="left"') + '@r1 syntax.relation marker="of" from=$n1 to=$n2')
  // a word that grades a place marker: in the marker, or a modifier of the clause
  const bird = 'add a mockingbird up above the house'
  const added = '@c1 syntax.clause form=imperative verb="add" complement=$n1\n@n1 syntax.nominal dependent="a" head="mockingbird"\n@n2 syntax.nominal dependent="the" head="house"\n'
  same(bird, added + '@r1 syntax.relation marker="up above" from=$c1 to=$n2', added.replace('verb="add"', 'verb="add" modifier="up"') + '@r1 syntax.relation marker="above" from=$n1 to=$n2')
  // coordinated relations: their order does not depend on the starts that are not compared (relaxedCore sorts before it relaxes)
  const window = 'put the old wooden box above the lamp and below the big window'
  const box = '@c1 syntax.clause form=imperative verb="put" complement=$n1\n@n1 syntax.nominal dependent="the" dependent="old" dependent="wooden" head="box"\n@n2 syntax.nominal dependent="the" head="lamp"\n@n3 syntax.nominal dependent="the" dependent="big" head="window"\n@k1 syntax.coordination conjunct=$r1 conjunct=$r2 conjunction="and"\n'
  const fromClause = box + '@r1 syntax.relation marker="above" from=$c1 to=$n2\n@r2 syntax.relation marker="below" from=$n1 to=$n3', fromBox = box + '@r1 syntax.relation marker="above" from=$n1 to=$n2\n@r2 syntax.relation marker="below" from=$n1 to=$n3'
  assert.notEqual(relaxedCore(coreOf(window, fromClause)), relaxedCore(coreOf(window, fromBox)))
  same(window, fromClause, fromBox)
  // what is compared for agreement
  const one = {sop: verbReading, core: normalForm(text, verbReading).core}, other = {sop: nounReading, core: normalForm(text, nounReading).core}
  assert.deepEqual([writtenAlike(text, one, other, 'core'), writtenAlike(text, one, other, 'relaxed'), writtenAlike(text, one, other, 'variants')], [false, true, true])
  assert.equal(agreementKeysOf(text, one, 'variants').length, 2)
  assert.deepEqual(AGREEMENT_KEYS, ['core', 'relaxed', 'variants'])
})

test('circuits written alike up to the choices the rules let pass are settled by agreement with the key "variants"', () => {
  const message = 'Please, make fence purple. Thanks!'
  const inOne = '@c1 syntax.clause form=imperative discourse="Please" verb="make" modifier="purple" discourse="Thanks" complement=$n1\n@n1 syntax.nominal head="fence"'
  const apart = '@c1 syntax.clause form=imperative discourse="Please" verb="make" modifier="purple" complement=$n1\n@n1 syntax.nominal head="fence"\n@c2 syntax.clause form=fragment discourse="Thanks"'
  const outputs = [{strategy: 'hmm-rules', rows: withCores([row('1', message, inOne), row('2', text, verbReading)])}, {strategy: 'spacy', rows: withCores([row('1', message, apart), row('2', text, nounReading)])}]
  const familyOf = familyFinder({own: ['hmm-rules'], parser: ['spacy']})
  // "core": nothing agrees; "relaxed": the start of "next to"; "variants": also the place of "Thanks", and the circuit of hmm-rules stands for both
  assert.deepEqual(agreedCircuits(outputs, emptyRegistry(), familyOf, 2).map(circuit => circuit.text), [])
  assert.deepEqual(agreedCircuits(outputs, emptyRegistry(), familyOf, 2, {relaxed: true, prefer: ['hmm-rules']}).map(circuit => circuit.text), [text])
  assert.deepEqual(agreedCircuits(outputs, emptyRegistry(), familyOf, 2, {key: 'relaxed', prefer: ['hmm-rules']}).map(circuit => circuit.text), [text])
  const agreed = agreedCircuits(outputs, emptyRegistry(), familyOf, 2, {key: 'variants', prefer: ['hmm-rules']})
  assert.deepEqual(agreed.map(circuit => [circuit.text, circuit.sources, circuit.core]), [[message, ['hmm-rules', 'spacy'], normalForm(message, inOne).core], [text, ['hmm-rules', 'spacy'], normalForm(text, verbReading).core]])
  assert.throws(() => agreedCircuits(outputs, emptyRegistry(), familyOf, 2, {key: 'loose'}), /Unknown agreement key/u)

  // agreed.mjs over run folders, with each key
  const dir = mkdtempSync(join(tmpdir(), 'syntax-agreed-'))
  mkdirSync(join(dir, 'run'))
  for (const {strategy, rows} of outputs) writeFileSync(join(dir, 'run', strategy + '.jsonl'), rows.map(({id, text: words, sop}) => JSON.stringify({id, text: words, sop})).join('\n') + '\n')
  const agree = key => {
    const done = spawnSync(process.execPath, [join(tools, 'agreed.mjs'), join(dir, key + '.jsonl'), '--strategies', 'hmm-rules,spacy', ...(key === 'none' ? [] : ['--key', key]), join(dir, 'run')], {encoding: 'utf8'})
    assert.equal(done.status, 0, done.stderr)
    return readJsonl(join(dir, key + '.jsonl')).map(line => line.text)
  }
  assert.deepEqual([agree('none'), agree('core'), agree('relaxed'), agree('variants')], [[], [], [text], [message, text]])
  assert.equal(spawnSync(process.execPath, [join(tools, 'agreed.mjs'), join(dir, 'x.jsonl'), '--strategies', 'hmm-rules,spacy', '--key', 'loose', join(dir, 'run')], {encoding: 'utf8'}).status, 2)
})

test('the circuit of a message, and the refusal of a file with open messages', () => {
  const full = verb => `@c1 syntax.clause form=imperative verb="${verb}" complement=$n1\n@n1 syntax.nominal head="it"`
  const flat = verb => `@c1 syntax.clause form=imperative verb="${verb}" modifier="it"`
  const bare = verb => `@c1 syntax.clause form=fragment discourse="${verb}" discourse="it"`
  const texts = ['move it', 'drop it', 'lift it', 'turn it', 'hide it', 'show it', 'bend it']
  const outputs = [
    {strategy: 'alpha', rows: withCores(texts.map((message, index) => row(String(index), message, message === 'bend it' ? null : full(message.split(' ')[0]))))},
    {strategy: 'beta', rows: withCores(texts.map((message, index) => row(String(index), message, ['move it', 'lift it'].includes(message) ? full(message.split(' ')[0]) : message === 'bend it' ? null : flat(message.split(' ')[0]))))}
  ]
  const registry = emptyRegistry()
  addToRegistry(registry, judged('drop it', bare('drop'), 'accepted', {source: 'old', run: 'earlier'}))                  // the label of "drop it"
  addToRegistry(registry, judged('drop it', flat('drop'), 'accepted', {source: 'old+older', run: 'earlier'}))
  addToRegistry(registry, judged('turn it', full('turn'), 'rejected', {grade: 'L3', note: "'it' is no complement"}))
  addToRegistry(registry, judged('show it', bare('show'), 'accepted', {source: 'judge', run: 'earlier'}))
  // the labels of the messages, from the syntactic files: "show it" has a circuit settled by agreement, which
  // no registry line records; the agreed label of "turn it" was read by a judge later, and rejected
  const cells = new Map([['show it', labelLine({text: 'show it', label: flat('show'), source: 'beta+hmm-rules', accepted_by: 'agreement'})],
    ['turn it', labelLine({text: 'turn it', label: full('turn'), source: 'alpha', accepted_by: 'agreement'})]])
  const core = (message, sop) => normalForm(message, sop).core
  const agreed = [{text: 'move it', core: core('move it', full('move')), sources: ['alpha', 'beta']}, {text: 'lift it', core: core('lift it', full('lift')), sources: ['alpha', 'beta']}]
  const items = [{n: 1, text: 'lift it', core: core('lift it', full('lift')), sources: ['alpha', 'beta']}, {n: 2, text: 'turn it', core: core('turn it', flat('turn')), sources: ['beta']},
    {n: 3, text: 'hide it', core: core('hide it', full('hide')), sources: ['alpha']}]
  const verdicts = runVerdicts(items, [{n: 1, grade: 'L8', note: ''}, {n: 2, grade: 'L2', note: "'it'"}, {n: 3, grade: 'L8', note: ''}], agreed)
  const written = [{text: 'bend it', sop: full('bend'), core: core('bend it', full('bend'))}]
  const state = roundState({texts, outputs, registry, verdicts, written, labels: cells})
  const said = message => state.get(message).map(circuit => [circuit.status, circuit.by, circuit.strategies.join('+')]).sort()
  // without the labels, the agreed circuit of "show it" would be one that still waits for a judge
  assert.deepEqual(roundState({texts, outputs, registry, verdicts, written}).get('show it').map(circuit => [circuit.status, circuit.strategies.join('+')]).sort(), [['accepted', ''], ['waiting', 'alpha'], ['waiting', 'beta']])
  assert.deepEqual(said('move it'), [['accepted', 'agreement', 'alpha+beta']])
  assert.deepEqual(said('lift it'), [['accepted', 'judge', 'alpha+beta']], 'an agreed circuit that a judge read is accepted by the judge')
  assert.deepEqual(said('turn it'), [['rejected', 'judge', 'alpha+hmm-rules'], ['rejected', 'judge', 'beta']], 'a judge who rejected the circuit of a label has the last word')
  assert.deepEqual(said('hide it'), [['accepted', 'judge', 'alpha'], ['waiting', null, 'beta']])
  assert.deepEqual(said('drop it'), [['accepted', 'judge', 'beta+old+older'], ['accepted', 'judge', 'old'], ['waiting', null, 'alpha']])
  assert.deepEqual(said('show it'), [['accepted', 'agreement', 'beta+hmm-rules'], ['accepted', 'written', ''], ['waiting', null, 'alpha']])
  assert.deepEqual(said('bend it'), [['accepted', 'written', '']])

  // the label first; with no label, the accepted circuit most strategies wrote
  const labels = new Map([['drop it', {core: core('drop it', bare('drop'))}]])
  assert.equal(chooseCircuit(state.get('drop it'), labels.get('drop it')).core, core('drop it', bare('drop')))
  assert.equal(chooseCircuit(state.get('drop it'), undefined).core, core('drop it', flat('drop')))
  assert.equal(chooseCircuit(state.get('drop it'), {core: 'a label that is not accepted'}).core, core('drop it', flat('drop')))
  assert.equal(chooseCircuit(state.get('turn it'), undefined), null)

  const messages = texts.map((message, index) => ({record: index + 1, text: message}))
  const {rows, open, counts} = syntacticRows(messages, state, labels)
  assert.deepEqual(open, ['turn it'])
  assert.deepEqual(counts, {agreement: 2, judge: 3, written: 1, open: 1})
  assert.deepEqual(rows.map(([message, sop, source, by]) => [message, sop.split('\n').length, source, by]), [
    ['move it', 2, 'alpha+beta', 'agreement'], ['drop it', 1, 'old', 'judge'], ['lift it', 2, 'alpha+beta', 'judge'], ['turn it', 1, '', ''],
    ['hide it', 2, 'alpha', 'judge'], ['show it', 1, 'beta+hmm-rules', 'agreement'], ['bend it', 2, 'judge', 'written']])
  assert.equal(rows[3][1], '')
  // a message the round does not know is open
  assert.deepEqual(syntacticRows([{record: 1, text: 'a new message'}], state, labels).open, ['a new message'])
})

test('a syntactic file: cells with several lines, commas and quotes', () => {
  assert.deepEqual(SYNTACTIC_HEADER, ['text', 'sop', 'source', 'accepted_by'])
  assert.deepEqual(['plain', 'a, b', 'say "hi"', 'two\nlines', ' edge', '', null].map(csvCell), ['plain', '"a, b"', '"say ""hi"""', '"two\nlines"', '" edge"', '', ''])
  const circuit = '@c1 syntax.clause form=imperative verb="put" complement=$n1\n@n1 syntax.nominal dependent="the" head="box"\n@r1 syntax.relation marker="next to" from=$c1 to=$n2\n@n2 syntax.nominal head="it"'
  const rows = [['put the box next to it', circuit, 'hmm-rules+z3', 'agreement'], ['say "hi", then stop', '@c1 syntax.clause form=fragment discourse="say"', 'judge', 'written'], ['an open one', '', '', '']]
  for (const newline of ['\n', '\r\n']) {
    const content = writeCsv(SYNTACTIC_HEADER, rows, newline)
    assert.equal(content.split(newline)[0], 'text,sop,source,accepted_by')
    assert.equal(content.endsWith(newline), true)
    assert.deepEqual(readCsv(content), [SYNTACTIC_HEADER, ...rows])
    // the file is one that the readers of the dataset understand: the first column is the message
    assert.deepEqual(messagesOfCsv(content).map(message => message.text), rows.map(cells => cells[0]))
    assert.equal(validateSyntax(rows[0][0], readCsv(content)[1][1]).valid, true)
  }
  assert.match(writeCsv(SYNTACTIC_HEADER, rows), /^put the box next to it,"@c1 syntax\.clause form=imperative verb=""put"" complement=\$n1\n@n1 /mu)
  assert.match(writeCsv(SYNTACTIC_HEADER, rows), /\nan open one,,,\n$/u)
})

test('the check of the circuits a judge wrote', () => {
  const flat = '@c1 syntax.clause form=imperative verb="move" modifier="it"'
  const packet = [{n: 1, text: 'move it', rejected: [{sop: flat, note: "'it' is a complement"}]}, {n: 2, text: 'hide it, please', rejected: []}, {n: 3, text: 'drop the box', rejected: []}]
  const line = (n, sop) => JSON.stringify({n, sop})
  const good = checkWritten(packet, [line(1, '@a syntax.clause form=imperative verb="move" complement=$b\n@b syntax.nominal head="it"'), '',
    line(2, '@c1 syntax.clause form=imperative verb="hide" discourse="please" complement=$n1\n@n1 syntax.nominal head="it"')])
  assert.deepEqual(good.problems, [])
  assert.deepEqual([good.rows, good.written, good.missing], [3, 2, [3]])
  assert.deepEqual(good.circuits[0], {n: 1, text: 'move it', sop: '@c1 syntax.clause form=imperative verb="move" complement=$n1\n@n1 syntax.nominal head="it"', core: coreOf('move it', good.circuits[0].sop)})
  const bad = checkWritten(packet, [
    line(1, '@x syntax.clause form=imperative modifier="it" verb="move"'),                                       // the rejected circuit again
    line(2, '@c1 syntax.clause form=imperative verb="hide" complement=$n1\n@n1 syntax.nominal head="it"'),      // "please" stands nowhere
    line(3, '@c1 syntax.clause form=command verb="drop" object=$n1\n@n1 syntax.nominal head="crate" dependent="the"'),
    line(3, '@c1 syntax.clause form=imperative verb="drop"'), line(9, flat), 'not json', '{"n": 3}', '{"n": 3, "sop": "x", "note": "y"}'])
  assert.deepEqual([bad.written, bad.missing], [0, [1, 2, 3]])
  assert.match(bad.problems.join('\n'), /n=1 is the same circuit as one that was rejected/u)
  assert.match(bad.problems.join('\n'), /n=2: these words of the message stand in no value: "please"/u)
  assert.match(bad.problems.join('\n'), /n=3: @c1: form=command is no value of this key/u)
  assert.match(bad.problems.join('\n'), /n=3: @c1: "object" is no key of this wire type/u)
  assert.match(bad.problems.join('\n'), /n=3: @n1: head="crate": these words are not in the message/u)
  assert.match(bad.problems.join('\n'), /n=9 is no line of this packet[\s\S]*not a JSON object[\s\S]*needs the circuit as text[\s\S]*unknown key note/u)
  assert.match(describeFinding({code: 'clause-without-verb', wire: 'c2'}), /@c2: this form needs a verb/u)
  // the example of the instructions for the judge is itself a right circuit
  const instructions = readFileSync(join(tools, 'rewrite.md'), 'utf8')
  const example = JSON.parse(/^\{"n": 12, "sop".*$/mu.exec(instructions)[0])
  assert.equal(validateSyntax('make the box red and the circle blue', example.sop).valid, true)
  assert.doesNotMatch(instructions.replaceAll('{{SCHEMA}}', '').replaceAll('{{SPECIFICATION}}', ''), /\{\{/u)
})

test('a conversion round from the source files to the syntactic files, with a dataset of its own', () => {
  const datasetBefore = datasetFiles()
  const folder = mkdtempSync(join(tmpdir(), 'syntax-round-'))
  const dataset = join(folder, 'dataset'), rounds = join(folder, 'rounds'), strategies = join(folder, 'strategies.mjs')
  const registry = join(dataset, 'annotations/syntax/v1/judged'), syntactic = join(dataset, 'syntactic')
  const full = verb => `@c1 syntax.clause form=imperative verb="${verb}" complement=$n1\n@n1 syntax.nominal head="it"`
  const source = (name, texts, newline = '\n') => { mkdirSync(join(dataset, 'semantic/things'), {recursive: true}); writeFileSync(join(dataset, 'semantic/things', name), ['text,sop', ...texts.map(message => `${csvCell(message)},"@r1 w.request.request act=make\n@r2 w.request.target request=$r1"`)].join(newline) + newline) }
  source('tiny.csv', ['push it'])
  source('small.csv', ['move it', 'drop it', 'lift it', 'show it', 'hide it, please', 'turn it', 'move it'], '\r\n')
  source('other.csv', ['bend it', 'fold it', 'tear it', 'wrap it', 'tilt it', 'spin it', 'flip it', 'lock it'])
  mkdirSync(join(dataset, 'syntactic'), {recursive: true})
  // a judge accepted a circuit of "show it" in an earlier run; its file is not written yet, so it has no label
  mkdirSync(registry, {recursive: true})
  const earlierLine = {text: 'show it', sop: full('show'), core: coreOf('show it', full('show')), verdict: 'accepted', grade: 'L8', note: '', judge: 'earlier-judge', run: 'earlier', source: 'old'}
  writeFileSync(join(registry, 'earlier.jsonl'), JSON.stringify(earlierLine) + '\n')
  writeFileSync(join(folder, 'stub.mjs'), `
const full = (verb, thing) => '@c1 syntax.clause form=imperative verb="' + verb + '" complement=$n1\\n@n1 syntax.nominal head="' + thing + '"'
const flat = (verb, thing) => '@a syntax.clause form=imperative verb="' + verb + '" modifier="' + thing + '"'
const reader = (name, flatFor, silentFor) => ({name, schema: 'syntax', async open() { return {async analyse(text) {
  const [verb, thing] = text.split(' ')
  if (silentFor.includes(verb)) return {analyses: []}
  return {analyses: [{sop: (flatFor.includes(verb) ? flat : full)(verb, thing)}]}
}, async close() {}}}})
export const alpha = reader('alpha', ['lift', 'show'], [])
export const beta = reader('beta', ['drop'], ['lift', 'show'])
export const gamma = reader('gamma', ['drop', 'push'], ['lift', 'show'])
`)
  writeFileSync(strategies, `export const strategyModules = {alpha: ['./stub.mjs', 'alpha'], beta: ['./stub.mjs', 'beta'], gamma: ['./stub.mjs', 'gamma']}\nexport const families = {one: ['alpha'], two: ['beta', 'gamma']}\n`)
  const node = (tool, ...args) => spawnSync(process.execPath, [join(tools, tool), ...args], {encoding: 'utf8', env: {...process.env, SOP_KNOWLEDGE_DIR: '/nowhere'}})
  const round = (...args) => node('round.mjs', ...args, '--dataset', dataset)

  // the plan and the start: fewest messages first, until the round has enough
  const planned = round('plan', '--rounds', '3', '--min-messages', '5', '--rounds-dir', rounds)
  assert.equal(planned.status, 0, planned.stderr)
  assert.match(planned.stdout, /\| 1 \| things\/tiny\.csv \| 1 \|  \|\n\| 1 \| things\/small\.csv \| 6 \| 7 \|\n\| 2 \| things\/other\.csv \| 8 \| 8 \|\n$/u)
  assert.equal(existsSync(rounds), false, 'the plan writes nothing')
  const first = join(rounds, 'round-1')
  const started = round('start', first, '--min-messages', '5')
  assert.equal(started.status, 0, started.stderr)
  const files = readJson(join(first, 'files.json'))
  assert.deepEqual(files.files.map(file => [file.file, file.records, file.messages]), [['things/tiny.csv', 1, 1], ['things/small.csv', 7, 6]])
  assert.deepEqual([files.messages, files.dataset, files.order], [7, dataset, 'size'])
  const sample = readJson(join(first, 'sample.json'))
  assert.deepEqual(sample.map(message => message.id), ['things/tiny.csv#1', 'things/small.csv#1', 'things/small.csv#2', 'things/small.csv#3', 'things/small.csv#4', 'things/small.csv#5', 'things/small.csv#6'])
  assert.deepEqual(sample[5], {id: 'things/small.csv#5', text: 'hide it, please'})
  assert.equal(round('start', first).status, 1, 'a round is started once')
  // a second round takes what the first left; a third finds nothing; an explicit choice of a taken file is refused
  const second = join(rounds, 'round-2')
  assert.equal(round('start', second, '--min-messages', '5').status, 0)
  assert.deepEqual(readJson(join(second, 'files.json')).files.map(file => file.file), ['things/other.csv'])
  assert.match(round('start', join(rounds, 'round-3')).stdout, /nothing to start/u)
  assert.equal(existsSync(join(rounds, 'round-3')), false)
  const taken = round('start', join(rounds, 'round-3'), '--files', 'things/small.csv')
  assert.equal(taken.status, 1)
  assert.match(taken.stderr, /things\/small\.csv has a syntactic file already, or belongs to a round in progress.*things\/small\.csv \(round-1\)/u)

  // the strategies run on the sample of the round
  assert.equal(node('run.mjs', first, '--sample', join(first, 'sample.json'), '--strategies', strategies).status, 0)
  assert.deepEqual(Object.values(readJson(join(first, 'summary.json')).strategies).map(entry => [entry.status, entry.messages, entry.valid]), [['ran', 7, 6], ['ran', 7, 4], ['ran', 7, 4]])

  // settle: agreement of two families, the rest to the judge, with one agreed circuit in three for the audit
  const unknownKey = round('settle', first, '--key', 'loose', '--strategies', strategies)
  assert.deepEqual([unknownKey.status, existsSync(join(first, 'key'))], [2, false])
  const settled = round('settle', first, '--audit', '0.34', '--families', '2', '--strategies', strategies)
  assert.equal(settled.status, 0, settled.stderr)
  const counts = readJson(join(first, 'settle.json'))
  assert.equal(counts.key, 'core')
  assert.deepEqual(counts.strategies, [{strategy: 'alpha', family: 'one'}, {strategy: 'beta', family: 'two'}, {strategy: 'gamma', family: 'two'}])
  assert.deepEqual(counts.circuits, {distinct: 8, alreadyAcceptedInTheRegistry: 1, alreadyRejectedInTheRegistry: 0, settledByAgreement: 3, agreedAndSentToAJudge: 1, sentToAJudge: 6, newPackets: 1})
  assert.deepEqual(counts.messagesWith, {aLabel: 0, aCircuitSettledByAgreement: 3, anAcceptedCircuitAlready: 1, noSettledCircuitYet: 3, noValidCircuitFromAnyStrategy: 1})
  const agreement = readJsonl(join(first, 'key', 'agreement.jsonl'))
  assert.deepEqual(agreement.map(circuit => [circuit.text, circuit.sources.join('+'), circuit.families.join('+')]), [['push it', 'alpha+beta', 'one+two'], ['move it', 'alpha+beta+gamma', 'one+two'], ['turn it', 'alpha+beta+gamma', 'one+two']])
  assert.equal(agreement.filter(circuit => circuit.audit).length, 1)
  const audited = agreement.find(circuit => circuit.audit).text
  const packet = readJsonl(join(first, 'judging', 'packet-1.jsonl'))
  assert.deepEqual(packet.map(line => Object.keys(line)), Array(6).fill(['n', 'text', 'sop']))
  assert.deepEqual(packet.map(line => line.text).sort(), ['drop it', 'drop it', 'lift it', 'push it', 'show it', audited].sort())
  assert.doesNotMatch(JSON.stringify(packet), /alpha|beta|gamma|audit|@a /u)
  assert.equal(readFileSync(join(first, 'key', 'labels-before.jsonl'), 'utf8'), '', 'no message of the round had a label')

  // before any judge: the three agreed circuits count as accepted, also the one sent to the judge for the audit;
  // "show it" has the circuit a judge accepted earlier; two messages wait for the judge and one has no circuit at all
  const early = round('report', first)
  assert.equal(early.status, 0, early.stderr)
  assert.deepEqual(readJson(join(first, 'report.json')).summary, {messages: 7, agreement: 3, judge: 1, written: 0, open: 3, openWaitingForAJudge: 2, openToBeWritten: 1})
  // nothing can be written while circuits wait and messages are open
  const tooEarly = round('rewrite-prepare', first)
  assert.match(tooEarly.stdout, /1 have no accepted circuit and are for a judge to write[\s\S]*2 more messages have no accepted circuit yet, and a circuit that still waits for a judge/u)

  // the judge accepts the circuits with a complement and rejects the flat ones
  writeFileSync(join(first, 'judging', 'verdicts-1.jsonl'), packet.map(line => JSON.stringify(/complement/u.test(line.sop) ? {n: line.n, grade: 'L8', note: ''} : {n: line.n, grade: 'L3', note: "'it' is held as a modifier"})).join('\n') + '\n')
  const prepared = round('rewrite-prepare', first)
  assert.equal(prepared.status, 0, prepared.stderr)
  assert.match(prepared.stdout, /7 messages: 2 have no accepted circuit and are for a judge to write \(1 prepared before, 1 new\)/u)
  const rewriting = join(first, 'rewriting')
  assert.deepEqual(readdirSync(rewriting).sort(), ['REWRITE.md', 'RULES.md', 'check.mjs', 'packet-1.jsonl', 'packet-2.jsonl'])
  const toWrite = [...readJsonl(join(rewriting, 'packet-1.jsonl')), ...readJsonl(join(rewriting, 'packet-2.jsonl'))]
  assert.deepEqual(toWrite.map(line => [line.n, line.text, line.rejected.length]), [[1, 'hide it, please', 0], [2, 'lift it', 1]])
  assert.deepEqual(Object.keys(toWrite[1].rejected[0]), ['sop', 'note'])
  assert.match(toWrite[1].rejected[0].note, /held as a modifier/u)
  assert.match(readFileSync(join(rewriting, 'REWRITE.md'), 'utf8'), new RegExp(join(packageRoot, 'schemas/syntax/schema.sop').replace(/[.\\/]/gu, '\\$&') + '[\\s\\S]*docs/syntax-schema\\.md', 'u'))

  // the writer refuses while a message has no circuit, and names the messages
  const refused = round('write', first, '--tag', 'round-1')
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /things\/small\.csv: 2 messages have no circuit:\n  "lift it"\n  "hide it, please"\nNothing was written/u)
  assert.deepEqual([existsSync(join(registry, 'round-1.jsonl')), existsSync(join(dataset, 'syntactic/things'))], [false, false])

  // the judge writes the two circuits; the checker says what is wrong with the first try
  const check = k => spawnSync(process.execPath, [join(rewriting, 'check.mjs'), String(k)], {encoding: 'utf8'})
  writeFileSync(join(rewriting, 'written-1.jsonl'), JSON.stringify({n: 1, sop: '@c1 syntax.clause form=imperative verb="hide" complement=$n1\n@n1 syntax.nominal head="it"'}) + '\n')
  const wrong = check(1)
  assert.equal(wrong.status, 1)
  assert.match(wrong.stdout, /n=1: these words of the message stand in no value: "please"/u)
  assert.equal(round('write', first, '--tag', 'round-1').status, 1, 'a written circuit with a problem stops the writer')
  writeFileSync(join(rewriting, 'written-1.jsonl'), JSON.stringify({n: 1, sop: '@c1 syntax.clause form=imperative verb="hide" discourse="please" complement=$n1\n@n1 syntax.nominal head="it"'}) + '\n')
  writeFileSync(join(rewriting, 'written-2.jsonl'), JSON.stringify({n: 2, sop: full('lift')}) + '\n')
  assert.match(check(1).stdout, /1 with a circuit that is right in form, 0 still to write[\s\S]*Every written circuit fits/u)

  // write: the registry holds what the judge decided, and the syntactic files hold the labels
  const written = round('write', first, '--tag', 'round-1', '--judge', 'test-judge')
  assert.equal(written.status, 0, written.stderr)
  const stored = readJsonl(join(registry, 'round-1.jsonl'))
  const kinds = line => line.source === 'judge' ? 'written' : line.verdict
  // the agreed circuit that the judge read for the audit is a verdict of the judge; the two others stand in no registry line
  const sources = {'push it': 'alpha+beta', 'move it': 'alpha+beta+gamma', 'turn it': 'alpha+beta+gamma'}
  assert.deepEqual(stored.map(line => [line.text, kinds(line), line.source]).sort(), [
    ['drop it', 'accepted', 'alpha'], ['drop it', 'rejected', 'beta+gamma'], ['hide it, please', 'written', 'judge'], ['lift it', 'rejected', 'alpha'], ['lift it', 'written', 'judge'],
    [audited, 'accepted', sources[audited]], ['push it', 'rejected', 'gamma'], ['show it', 'rejected', 'alpha']].sort())
  for (const line of stored) {
    assert.deepEqual(Object.keys(line), ['text', 'sop', 'core', 'verdict', 'grade', 'note', 'judge', 'run', 'source'])
    assert.equal(line.core, coreOf(line.text, line.sop))
    assert.equal(line.judge, 'test-judge', 'the registry keeps only what a judge decided')
    assert.equal(line.run, 'round-1')
  }
  assert.match(written.stdout, /Registry: 8 circuits published[^\n]*: 2 accepted and 4 rejected by the judge \(test-judge\), 2 written by the judge\.\nSettled by agreement in this round, with no judge: 2 circuits\. They stand in the syntactic files only\.\nLabels: 6 messages get a circuit accepted in this round \(6 had no label, 0 had another one\)/u)
  assert.deepEqual(readJson(join(first, 'written.json')).published, {circuits: 8, judgeAccepted: 2, judgeRejected: 4, written: 2})
  const by = message => message === audited ? 'judge' : 'agreement'
  const small = readFileSync(join(dataset, 'syntactic/things/small.csv'), 'utf8')
  assert.equal(small.startsWith('text,sop,source,accepted_by\r\n'), true, 'the line ends of the source file')
  assert.deepEqual(readCsv(small).slice(1).map(([message, sop, wrote, accepted]) => [message, sop.split('\n').length, wrote, accepted]), [
    ['move it', 2, 'alpha+beta+gamma', by('move it')], ['drop it', 2, 'alpha', 'judge'], ['lift it', 2, 'judge', 'written'], ['show it', 2, 'old', 'judge'],
    ['hide it, please', 2, 'judge', 'written'], ['turn it', 2, 'alpha+beta+gamma', by('turn it')]])
  for (const [message, sop] of readCsv(small).slice(1)) assert.equal(validateSyntax(message, sop).valid, true, message)
  // the cells are the labels: there is no other store
  const labels = readLabels(syntactic)
  assert.deepEqual([...labels.values()].map(line => [line.text, line.source, line.accepted_by]).sort(), [['drop it', 'alpha', 'judge'], ['hide it, please', 'judge', 'written'], ['lift it', 'judge', 'written'],
    ['move it', 'alpha+beta+gamma', by('move it')], ['push it', 'alpha+beta', by('push it')], ['show it', 'old', 'judge'], ['turn it', 'alpha+beta+gamma', by('turn it')]])
  assert.deepEqual(readdirSync(join(dataset, 'annotations/syntax/v1')), ['judged'], 'no labels file beside the registry')
  assert.deepEqual(readCsv(readFileSync(join(dataset, 'syntactic/things/tiny.csv'), 'utf8')), [SYNTACTIC_HEADER, ['push it', full('push'), 'alpha+beta', by('push it')]])
  assert.deepEqual(readJson(join(first, 'written.json')).files.map(file => [file.file, file.status, file.messages, file.open]), [['things/tiny.csv', 'written', 1, 0], ['things/small.csv', 'written', 6, 0]])

  // the report: how the messages were settled, how often agreement was right, the levels
  const reported = round('report', first)
  assert.equal(reported.status, 0, reported.stderr)
  const report = readJson(join(first, 'report.json'))
  assert.deepEqual(report.summary, {messages: 7, agreement: 2, judge: 3, written: 2, open: 0, openWaitingForAJudge: 0, openToBeWritten: 0})
  assert.deepEqual(report.audit, {agreedCircuits: 3, sentToAJudge: 1, judged: 1, accepted: 1})
  assert.match(reported.stdout, /3 circuits were written alike by strategies of several families and settled without a judge\. 1 of them were sent to a judge, 1 are judged, and the judge accepted 1 \(100\.0%\)/u)
  // alpha: four accepted, two flat ones rejected, no valid circuit for "hide it, please". "show it" had a label, which alpha did not write.
  assert.deepEqual(report.strategies.map(line => [line.strategy, line.levels.L0, line.levels.L3, line.levels.L8, line.levels.L9, line.waiting]), [['alpha', 1, 2, 4, 0, 0], ['beta', 3, 1, 3, 0, 0], ['gamma', 3, 2, 2, 0, 0]])

  // an existing syntactic file is never written again, and the files are no source for a later round or sample
  const again = round('write', first, '--tag', 'round-1b')
  assert.equal(again.status, 0, again.stderr)
  assert.match(again.stdout, /Registry: no judge decided anything new, so nothing is published[\s\S]*things\/small\.csv \| 6 .* exists already: no empty cell to fill/u)
  assert.equal(readFileSync(join(dataset, 'syntactic/things/small.csv'), 'utf8'), small)
  assert.equal(existsSync(join(registry, 'round-1b.jsonl')), false)
  const next = round('plan', '--rounds', '2', '--min-messages', '5', '--rounds-dir', join(folder, 'no-rounds'))
  assert.match(next.stdout, /3 source files[^\n]*: 2 have a syntactic file, 0 belong to a round in progress\.\n[^\n]*\n[^\n]*\n\| 1 \| things\/other\.csv \| 8 \| 8 \|\n$/u)

  // with --allow-open a file is written with empty cells for the messages that have no circuit
  assert.equal(node('run.mjs', second, '--sample', join(second, 'sample.json'), '--strategies', strategies, '--only', 'alpha').status, 0)
  assert.equal(round('settle', second, '--strategies', strategies).status, 0)
  assert.equal(round('write', second, '--tag', 'round-2').status, 1)
  const open = round('write', second, '--tag', 'round-2', '--allow-open')
  assert.equal(open.status, 0, open.stderr)
  assert.deepEqual(readCsv(readFileSync(join(dataset, 'syntactic/things/other.csv'), 'utf8')).slice(1, 3), [['bend it', '', '', ''], ['fold it', '', '', '']])
  assert.equal(existsSync(join(registry, 'round-2.jsonl')), false, 'nothing was judged, so nothing is published')

  // The two agreed circuits that no judge read stand in no registry line; the syntactic file says they
  // are accepted. A later settlement of the round knows it: nothing is sent to a judge again.
  assert.equal(readdirSync(registry).flatMap(name => readJsonl(join(registry, name))).some(line => line.judge === 'agreement'), false)
  const resettled = round('settle', first, '--audit', '0.34', '--families', '2', '--strategies', strategies, '--judge', 'needed')
  assert.equal(resettled.status, 0, resettled.stderr)
  assert.match(resettled.stdout, /Already settled: 7 messages have a label in the syntactic files[\s\S]*For a judge: 6 circuits \(6 prepared before, 0 new\)[\s\S]*No new packet/u)
  assert.deepEqual(readJson(join(first, 'settle.json')).messagesWith, {aLabel: 7, aCircuitSettledByAgreement: 3, anAcceptedCircuitAlready: 7, noSettledCircuitYet: 0, noValidCircuitFromAnyStrategy: 1})
  assert.deepEqual(readJsonl(join(first, 'key', 'agreement.jsonl')).map(circuit => circuit.text).sort(), ['move it', 'push it', 'turn it'])
  // A benchmark run over the same messages: a circuit equal to a label needs no judge, whether a judge
  // accepted the label, wrote it, or formalizers agreed on it; a strategy that writes it is at L9.
  const bench = join(folder, 'bench')
  assert.equal(node('run.mjs', bench, '--sample', join(first, 'sample.json'), '--strategies', strategies, '--reuse', first).status, 0)
  const benched = node('judge-prepare.mjs', bench, '--registry', registry)
  assert.equal(benched.status, 0, benched.stderr)
  assert.match(benched.stdout, /7 of the 7 messages of this run have a label\.\n[^\n]*\n[^\n]*\n\| alpha \| 7 \| 1 \| 4 \| 0 \| 2 \| 0 \|\n\| beta \| 7 \| 3 \| 3 \| 0 \| 1 \| 0 \|\n\| gamma \| 7 \| 3 \| 2 \| 0 \| 2 \| 0 \|\n0 distinct circuits need a judge/u)
  assert.deepEqual(readJsonl(join(bench, 'key', 'labels-before.jsonl')).map(line => [line.text, line.accepted_by]).sort(), [...labels.values()].map(line => [line.text, line.accepted_by]).sort())
  assert.equal(node('table.mjs', bench, '--registry', registry).status, 0)
  assert.deepEqual(readJson(join(bench, 'table.json')).strategies.map(line => [line.strategy, line.levels.L0, line.levels.L3, line.levels.L8, line.levels.L9, line.waiting]), [['alpha', 1, 2, 0, 4, 0], ['beta', 3, 1, 0, 3, 0], ['gamma', 3, 2, 0, 2, 0]])

  // none of this touched the syntactic files of the dataset
  assert.equal(datasetFiles(), datasetBefore)
})

test('what the syntactic files hold is not kept a second time', () => {
  const full = verb => `@c1 syntax.clause form=imperative verb="${verb}" complement=$n1\n@n1 syntax.nominal head="it"`
  const flat = verb => `@c1 syntax.clause form=imperative verb="${verb}" modifier="it"`
  const other = verb => `@x syntax.clause form=imperative verb="${verb}" complement=$y\n@y syntax.nominal head="it"`      // full, by another hand
  const folder = mkdtempSync(join(tmpdir(), 'syntax-duplicates-'))
  const dataset = join(folder, 'dataset'), v1 = join(dataset, 'annotations/syntax/v1'), registry = join(v1, 'judged'), labelsFile = join(v1, 'labels.jsonl')
  mkdirSync(join(dataset, 'syntactic/things'), {recursive: true})
  mkdirSync(registry, {recursive: true})
  const cells = [['move it', full('move'), 'alpha+beta', 'agreement'], ['drop it', full('drop'), 'alpha', 'judge'], ['lift it', flat('lift'), 'alpha+beta', 'agreement'],
    ['turn it', full('turn'), 'judge', 'written'], ['hide it', '', '', ''], ['show it', full('show'), 'alpha+beta', 'agreement']]
  const syntacticFile = join(dataset, 'syntactic/things/all.csv')
  writeFileSync(syntacticFile, writeCsv(['text', 'sop', 'source', 'accepted_by'], cells))
  const labels = readLabels(join(dataset, 'syntactic'))

  // the labels file: every line must be the circuit of its message in the syntactic files
  const label = (message, sop, source = 'hmm-rules') => ({text: message, label: sop, core: coreOf(message, sop), run: 'earlier', source, previous: null})
  const same = [label('move it', other('move')), label('drop it', full('drop')), label('turn it', full('turn'))]
  assert.deepEqual(checkLabelsFile(same, labels), {lines: 3, same: 3, differ: []}, 'the same circuit by another hand, and another source, are no difference')
  const differing = checkLabelsFile([...same, label('lift it', full('lift')), label('hide it', full('hide')), label('gone', '@c1 syntax.clause form=fragment discourse="gone"')], labels)
  assert.deepEqual([differing.same, differing.differ.map(line => [line.text, line.why])], [3, [['lift it', 'the cell holds another circuit'], ['hide it', 'the cell of the message is empty'], ['gone', 'the message has no row in the syntactic files']]])

  // the registry: an agreement line goes when the cell says the same, or when a judge decided the message later
  const agreed = (message, sop) => judged(message, sop, 'accepted', {judge: 'agreement', source: 'alpha+beta', note: 'written alike'})
  const lines = [agreed('move it', full('move')), judged('move it', flat('move'), 'rejected'), agreed('drop it', flat('drop')), agreed('turn it', flat('turn')),
    agreed('lift it', full('lift')), agreed('hide it', full('hide')), judged('show it', full('show'), 'accepted'), agreed('gone', '@c1 syntax.clause form=fragment discourse="gone"')]
  const checked = checkRegistryLines(lines, labels)
  assert.deepEqual([checked.removed, checked.judged, checked.kept.map(line => [line.text, line.judge])], [3, 2, [['move it', 'test'], ['lift it', 'agreement'], ['hide it', 'agreement'], ['show it', 'test'], ['gone', 'agreement']]])
  assert.deepEqual(checked.stay.map(line => [line.text, line.why]), [['lift it', 'the cell holds another circuit settled by agreement'], ['hide it', 'the cell of the message is empty'], ['gone', 'the message has no row in the syntactic files']])

  // the tool: it reports first, and removes only what is said twice
  writeFileSync(labelsFile, [...same, label('lift it', full('lift'))].map(line => JSON.stringify(line)).join('\n') + '\n')
  writeFileSync(join(registry, 'mixed.jsonl'), lines.map(line => JSON.stringify(line)).join('\n') + '\n')
  writeFileSync(join(registry, 'only-agreement.jsonl'), [agreed('show it', full('show')), agreed('move it', other('move'))].map(line => JSON.stringify(line)).join('\n') + '\n')
  writeFileSync(join(registry, 'only-judge.jsonl'), JSON.stringify(judged('drop it', full('drop'), 'accepted')) + '\n')
  const tool = (...args) => spawnSync(process.execPath, [join(tools, 'drop-duplicates.mjs'), '--dataset', dataset, ...args], {encoding: 'utf8'})
  const before = [labelsFile, join(registry, 'mixed.jsonl'), join(registry, 'only-agreement.jsonl'), join(registry, 'only-judge.jsonl'), syntacticFile].map(file => readFileSync(file, 'utf8'))
  const dry = tool()
  assert.equal(dry.status, 0, dry.stderr)
  assert.match(dry.stdout, /labels\.jsonl: 4 lines[^\n]*\. 3 are the circuit of their message in the syntactic files; 1 differ\.\n  "lift it": the cell holds another circuit\n  The file stays/u)
  assert.match(dry.stdout, /Registry: 3 files, 11 lines[^\n]*: 3 lines of a judge, 8 with judge "agreement"\.\n  5 agreement lines repeat the syntactic files and can be removed: 1 files rewritten, 1 files left with no line and removed\./u)
  assert.match(dry.stdout, /3 agreement lines stay[^\n]*\n    mixed\.jsonl: "lift it": the cell holds another circuit settled by agreement/u)
  assert.deepEqual([labelsFile, join(registry, 'mixed.jsonl'), join(registry, 'only-agreement.jsonl'), join(registry, 'only-judge.jsonl'), syntacticFile].map(file => readFileSync(file, 'utf8')), before, 'a check changes nothing')
  // a labels file with a line that differs stays, also with --apply; the registry is cleaned
  assert.equal(tool('--apply').status, 0)
  assert.equal(readFileSync(labelsFile, 'utf8'), before[0])
  assert.deepEqual(readdirSync(registry).sort(), ['mixed.jsonl', 'only-judge.jsonl'])
  assert.deepEqual(readJsonl(join(registry, 'mixed.jsonl')), checked.kept)
  assert.equal(readFileSync(join(registry, 'only-judge.jsonl'), 'utf8'), before[3])
  // once every line of the labels file is in the syntactic files, the file goes
  writeFileSync(labelsFile, same.map(line => JSON.stringify(line)).join('\n') + '\n')
  const applied = tool('--apply')
  assert.match(applied.stdout, /labels\.jsonl: 3 lines[^\n]*; 0 differ\.\n  Removed\.[\s\S]*0 agreement lines repeat the syntactic files[\s\S]*3 agreement lines stay/u)
  assert.equal(existsSync(labelsFile), false)
  assert.match(tool('--apply').stdout, /labels\.jsonl: there is no such file/u)
  assert.equal(readFileSync(syntacticFile, 'utf8'), before[4], 'no syntactic file is changed')
  // the agreement lines that stay still say that their circuit is accepted
  const kept = emptyRegistry()
  for (const line of readJsonl(join(registry, 'mixed.jsonl'))) addToRegistry(kept, line)
  assert.equal(lookup(kept, 'lift it', normalForm('lift it', full('lift')).core).verdict, 'accepted')
})

test('a circuit judged again: the newest verdict of the run counts', () => {
  const full = verb => `@c1 syntax.clause form=imperative verb="${verb}" complement=$n1\n@n1 syntax.nominal head="it"`
  const flat = verb => `@c1 syntax.clause form=imperative verb="${verb}" modifier="it"`
  const item = (n, message, sop, sources, more = {}) => ({n, text: message, sop: normalForm(message, sop).sop, core: normalForm(message, sop).core, sources, ...more})
  const items = [item(1, 'move it', full('move'), ['alpha']), item(2, 'move it', flat('move'), ['beta']), item(3, 'drop it', full('drop'), ['alpha']),
    item(4, 'move it', full('move'), ['alpha'], {rejudge: {of: 1, against: 'round-1.jsonl', rules: 'x'}})]
  const first = [{n: 1, grade: 'L8', note: '', packet: 1}, {n: 2, grade: 'L3', note: "'it'", packet: 1}, {n: 3, grade: 'L8', note: '', packet: 2}]
  // until the judge has written the new verdict, the earlier one counts
  assert.deepEqual([runVerdicts(items, first).get('move it').get(items[0].core)].map(verdict => [verdict.grade, verdict.n, verdict.rejudge]), [['L8', 1, undefined]])
  const later = [...first, {n: 4, grade: 'L1', note: "'move' is no command", packet: 3}]
  for (const verdicts of [later, [...later].reverse(), later.map(({packet, ...verdict}) => verdict)]) {
    const newest = runVerdicts(items, verdicts).get('move it').get(items[0].core)
    assert.deepEqual([newest.grade, newest.note, newest.n, newest.sop, newest.rejudge.of], ['L1', "'move' is no command", 4, items[0].sop, 1], 'the latest packet counts, in whatever order the verdicts are read')
  }
  // the packet decides before the number: a verdict of a later packet counts also for an item with a lower number
  assert.equal(runVerdicts(items, [{n: 4, grade: 'L1', note: "'move'", packet: 1}, {n: 1, grade: 'L8', note: '', packet: 2}]).get('move it').get(items[0].core).grade, 'L8')
  // the levels: a circuit judged again counts by its newest verdict, also when it was the label before the run
  const rows = withCores([row('1', 'move it', full('move')), row('2', 'drop it', full('drop'))])
  const verdicts = runVerdicts(items, later)
  assert.deepEqual(rows.map(line => levelOf(line, emptyRegistry(), verdicts)), ['L1', 'L8'])
  const before = new Map([['move it', labelLine({text: 'move it', label: full('move'), source: 'alpha', accepted_by: 'agreement'})]])
  assert.equal(levelOf(rows[0], emptyRegistry(), verdicts, before), 'L1')
  assert.equal(levelOf(rows[0], emptyRegistry(), runVerdicts(items, [...first, {n: 4, grade: 'L8', note: '', packet: 3}]), before), 'L9')
  assert.equal(levelOf(rows[0], emptyRegistry(), runVerdicts(items.slice(0, 3), first), before), 'L9', 'a circuit not judged again that was the label stays L9')
  assert.deepEqual(tableOf([{strategy: 'alpha', rows}], emptyRegistry(), verdicts)[0].levels.L1, 1)

  // publishing: only the newest item of a circuit; a circuit whose judgment made again is not written yet waits
  const registry = emptyRegistry()
  addToRegistry(registry, judged('move it', full('move'), 'accepted', {run: 'round-1'}), 'round-1.jsonl')
  const waiting = publication(items, runVerdicts(items, first), registry, {tag: 'round-2', judge: 'test'})
  assert.deepEqual([waiting.rows.map(line => [line.text, line.verdict]), waiting.counts.waitingAgain, waiting.counts.judged], [[['move it', 'rejected'], ['drop it', 'accepted']], 1, 2])
  const done = publication(items, verdicts, registry, {tag: 'round-2', judge: 'test'})
  assert.deepEqual(done.rows.map(line => [line.text, line.verdict, line.grade, line.supersedes]), [['move it', 'rejected', 'L3', undefined], ['drop it', 'accepted', 'L8', undefined], ['move it', 'rejected', 'L1', 'round-1.jsonl']])
  assert.deepEqual([done.accepted.map(one => one.n), done.rejudged.map(one => [one.n, one.grade]), done.counts.superseding], [[3], [[4, 'L1']], 1])
  assert.deepEqual(publication(items, verdicts, registry, {tag: 'round-2', rejudgedOnly: true}).rows.map(line => line.supersedes), ['round-1.jsonl'])
  // a later decision in the registry than the one the circuit was judged again against is left as it is
  addToRegistry(registry, judged('move it', full('move'), 'accepted', {run: 'other', supersedes: 'round-1.jsonl'}), 'other.jsonl')
  assert.deepEqual([publication(items, verdicts, registry, {tag: 'round-3', rejudgedOnly: true}).rows.length, publication(items, verdicts, registry, {tag: 'round-3', rejudgedOnly: true}).counts.newer], [0, 1])
})

test('the registry: a line that supersedes another counts, whatever the order of the files', () => {
  const full = verb => `@c1 syntax.clause form=imperative verb="${verb}" complement=$n1\n@n1 syntax.nominal head="it"`
  const core = normalForm('move it', full('move')).core
  const first = judged('move it', full('move'), 'accepted', {run: 'fixed'}), again = judged('move it', full('move'), 'rejected', {run: 'again', grade: 'L1', supersedes: 'fixed.jsonl'})
  const third = judged('move it', full('move'), 'accepted', {run: 'third', supersedes: 'again.jsonl'}), plain = judged('move it', full('move'), 'rejected', {run: 'later'})
  const read = lines => { const registry = emptyRegistry(); for (const [line, file] of lines) addToRegistry(registry, line, file); return registry }
  for (const order of [[[first, 'fixed.jsonl'], [again, 'again.jsonl']], [[again, 'again.jsonl'], [first, 'fixed.jsonl']]]) {
    const registry = read(order)
    assert.deepEqual([lookup(registry, 'move it', core).run, lookup(registry, 'move it', core).file, registry.rows, registry.older], ['again', 'again.jsonl', 2, 1])
  }
  // a third judgment counts before the second; a line that supersedes nothing never replaces another (the first read counts)
  assert.equal(lookup(read([[third, 'third.jsonl'], [first, 'fixed.jsonl'], [again, 'again.jsonl']]), 'move it', core).run, 'third')
  assert.equal(lookup(read([[first, 'fixed.jsonl'], [plain, 'later.jsonl']]), 'move it', core).run, 'fixed')
  assert.equal(lookup(read([[first, 'fixed.jsonl'], [again, 'again.jsonl'], [plain, 'later.jsonl']]), 'move it', core).run, 'again')
  // lines that supersede each other in a circle: the longest chain, then the first read
  assert.equal(newestLine([Object.defineProperty({run: 'a', supersedes: 'b.jsonl'}, 'file', {value: 'a.jsonl'}), Object.defineProperty({run: 'b', supersedes: 'a.jsonl'}, 'file', {value: 'b.jsonl'})]).run, 'a')
  // read from a folder: the file that supersedes is read first by its name, and still counts
  const dir = join(mkdtempSync(join(tmpdir(), 'syntax-registry-')), 'judged')
  mkdirSync(dir, {recursive: true})
  writeFileSync(join(dir, 'fixed.jsonl'), JSON.stringify(first) + '\n' + JSON.stringify(judged('drop it', full('drop'), 'accepted', {run: 'fixed'})) + '\n')
  writeFileSync(join(dir, 'again.jsonl'), JSON.stringify(again) + '\n')
  const registry = readRegistry(dir)
  assert.deepEqual(registry.files, ['again.jsonl', 'fixed.jsonl'])
  assert.deepEqual([lookup(registry, 'move it', core).verdict, lookup(registry, 'move it', core).grade, lookup(registry, 'drop it', normalForm('drop it', full('drop')).core).verdict], ['rejected', 'L1', 'accepted'])
  assert.deepEqual(registry.history.get('move it\0' + core).map(line => line.file), ['again.jsonl', 'fixed.jsonl'], 'every line is kept')
  assert.doesNotMatch(JSON.stringify(lookup(registry, 'move it', core)), /"file"/u, 'the file of a line is never written out with it')
})

test('a label the judge now rejects is replaced by another accepted circuit, or emptied', () => {
  const full = verb => `@c1 syntax.clause form=imperative verb="${verb}" complement=$n1\n@n1 syntax.nominal head="it"`
  const flat = verb => `@c1 syntax.clause form=imperative verb="${verb}" modifier="it"`
  const item = (n, message, sop, sources, grade) => ({n, text: message, sop: normalForm(message, sop).sop, core: normalForm(message, sop).core, sources, grade})
  const label = (message, sop, accepted_by = 'judge', source = 'hmm-rules') => [message, labelLine({text: message, label: sop, source, accepted_by})]
  const labels = new Map([label('move it', full('move')), label('drop it', full('drop')), label('lift it', full('lift')), label('turn it', flat('turn'), 'agreement', 'alpha+beta+gamma'),
    label('bend it', full('bend')), label('show it', full('show'))])
  const rejudged = [
    item(1, 'move it', full('move'), ['hmm-rules'], 'L3'), item(2, 'move it', flat('move'), ['spacy'], 'L8'),   // the label rejected, another circuit of the same judging accepted
    item(3, 'drop it', full('drop'), ['hmm-rules'], 'L3'),                                                    // the label rejected, another accepted circuit elsewhere
    item(4, 'lift it', full('lift'), ['hmm-rules'], 'L1'),                                                    // the label rejected, nothing else accepted
    item(5, 'turn it', flat('turn'), ['alpha', 'beta', 'gamma'], 'L8'),                                 // a label settled by agreement, accepted now
    item(6, 'hide it', flat('hide'), ['hmm-rules'], 'L8'),                                                    // no label, accepted now
    item(7, 'bend it', flat('bend'), ['hmm-rules'], 'L8'),                                                    // another label, still accepted: it stays
    item(8, 'show it', full('show'), ['hmm-rules'], 'L8')]                                                    // the label accepted again by a judge: nothing changes
  const elsewhere = {'drop it': [{sop: normalForm('drop it', full('drop')).sop, core: normalForm('drop it', full('drop')).core, sources: ['hmm-rules'], accepted_by: 'judge'},
    {sop: normalForm('drop it', flat('drop')).sop, core: normalForm('drop it', flat('drop')).core, sources: ['spacy', 'z3'], accepted_by: 'judge'}]}
  const result = rejudgedLabelChanges(labels, rejudged, text => elsewhere[text] ?? [])
  assert.deepEqual([result.replaced, result.cleared, result.confirmed, result.filled], [2, 1, 1, 1])
  assert.deepEqual([...result.changes.values()].map(line => [line.text, line.label, line.source, line.accepted_by]), [
    ['move it', normalForm('move it', flat('move')).sop, 'spacy', 'judge'],
    ['drop it', normalForm('drop it', flat('drop')).sop, 'spacy+z3', 'judge'],                         // never the rejected circuit itself
    ['lift it', '', '', ''],
    ['turn it', flat('turn'), 'alpha+beta+gamma', 'judge'],
    ['hide it', normalForm('hide it', flat('hide')).sop, 'hmm-rules', 'judge']])

  // the other accepted circuits of a message: the run's judge first, then agreement in the run, then the registry
  const registry = emptyRegistry()
  addToRegistry(registry, judged('drop it', flat('drop'), 'accepted', {source: 'spacy+z3'}), 'old.jsonl')
  addToRegistry(registry, judged('drop it', full('drop'), 'rejected', {grade: 'L3'}), 'old.jsonl')
  const items = [{...item(1, 'drop it', full('drop'), ['hmm-rules']), grade: undefined}, item(2, 'drop it', '@c1 syntax.clause form=imperative verb="drop" discourse="it"', ['prolog'])]
  const verdicts = runVerdicts(items, [{n: 1, grade: 'L8', note: ''}, {n: 2, grade: 'L8', note: ''}],
    [{text: 'drop it', sop: normalForm('drop it', '@c1 syntax.clause form=fragment discourse="drop" discourse="it"').sop, core: normalForm('drop it', '@c1 syntax.clause form=fragment discourse="drop" discourse="it"').core, sources: ['a', 'b', 'c']}])
  assert.deepEqual(acceptedCircuitsOf('drop it', verdicts, registry).map(circuit => [circuit.sources.join('+'), circuit.accepted_by]), [['prolog', 'judge'], ['a+b+c', 'agreement'], ['spacy+z3', 'judge']],
    'a circuit the registry holds as rejected is left out, also when the run accepted it')

  // an emptied label is written as empty cells: the message has no label again
  const dir = join(mkdtempSync(join(tmpdir(), 'syntax-rejudge-labels-')), 'syntactic')
  mkdirSync(join(dir, 'things'), {recursive: true})
  writeFileSync(join(dir, 'things/a.csv'), writeCsv(SYNTACTIC_HEADER, [['lift it', full('lift'), 'hmm-rules', 'judge'], ['rest here', '', '', '']]))
  const read = readLabels(dir)
  assert.deepEqual(writeLabels(read, new Map([['lift it', {text: 'lift it', label: '', source: '', accepted_by: ''}]])), {rows: 1, files: ['things/a.csv'], missing: []})
  assert.equal(readFileSync(join(dir, 'things/a.csv'), 'utf8'), 'text,sop,source,accepted_by\nlift it,,,\nrest here,,,\n')
  assert.equal(readLabels(dir).has('lift it'), false)
})

test('judging again from start to publication: packets after the old ones, the registry superseded, the labels changed where they must', () => {
  const datasetBefore = datasetFiles()
  const full = verb => `@c1 syntax.clause form=imperative verb="${verb}" complement=$n1\n@n1 syntax.nominal head="it"`
  const flat = verb => `@c1 syntax.clause form=imperative verb="${verb}" modifier="it"`
  const normal = (message, sop) => normalForm(message, sop).sop
  const folder = mkdtempSync(join(tmpdir(), 'syntax-rejudge-'))
  const registry = join(folder, 'registry'), syntactic = join(folder, 'syntactic'), labelsFile = join(syntactic, 'things/a.csv')
  mkdirSync(join(syntactic, 'things'), {recursive: true})
  mkdirSync(registry, {recursive: true})
  writeFileSync(labelsFile, writeCsv(SYNTACTIC_HEADER, [['move it', '', '', ''], ['drop it', '', '', ''], ['bend it', normal('bend it', full('bend')), 'hmm-rules', 'judge'],
    ['fold it', normal('fold it', full('fold')), 'hmm-rules', 'judge'], ['turn it', normal('turn it', flat('turn')), 'alpha+beta+gamma', 'agreement'], ['hide it', '', '', ''], ['rest here', '', '', '']]))
  // a sample known from the registry only: its judgments stand in fixed-sample.jsonl
  writeFileSync(join(registry, 'fixed-sample.jsonl'), [judged('bend it', normal('bend it', full('bend')), 'accepted', {run: 'fixed-sample'}),
    judged('bend it', normal('bend it', flat('bend')), 'accepted', {run: 'fixed-sample', source: 'hmm-rules+spacy'}), judged('fold it', normal('fold it', full('fold')), 'accepted', {run: 'fixed-sample'}),
    judged('hide it', normal('hide it', flat('hide')), 'rejected', {run: 'fixed-sample', note: "'it' is no modifier"})].map(line => JSON.stringify(line)).join('\n') + '\n')
  const node = (tool, ...args) => spawnSync(process.execPath, [join(tools, tool), ...args], {encoding: 'utf8', env: {...process.env, SOP_KNOWLEDGE_DIR: '/nowhere'}})

  // a run, judged and published
  const run = join(folder, 'run'), judging = join(run, 'judging')
  mkdirSync(run, {recursive: true})
  writeFileSync(join(run, 'alpha.jsonl'), [row('1', 'move it', full('move')), row('2', 'drop it', full('drop'))].map(line => JSON.stringify(line)).join('\n') + '\n')
  writeFileSync(join(run, 'beta.jsonl'), [row('1', 'move it', flat('move')), row('2', 'drop it', full('drop'))].map(line => JSON.stringify(line)).join('\n') + '\n')
  assert.equal(node('judge-prepare.mjs', run, '--registry', registry, '--size', '2').status, 0)
  const packet = [...readJsonl(join(judging, 'packet-1.jsonl')), ...readJsonl(join(judging, 'packet-2.jsonl'))]
  const numberOf = (message, sop) => packet.find(line => line.text === message && line.sop === normal(message, sop)).n
  const verdictsOf = numbers => numbers.map(n => JSON.stringify({n, grade: 'L8', note: ''})).join('\n') + '\n'
  writeFileSync(join(judging, 'verdicts-1.jsonl'), verdictsOf([1, 2]))
  writeFileSync(join(judging, 'verdicts-2.jsonl'), verdictsOf([3]))
  assert.equal(node('judge-publish.mjs', run, '--tag', 'round-1', '--judge', 'test-judge', '--registry', registry).status, 0)
  const labelOf = message => readLabels(syntactic).get(message)
  const moveLabel = labelOf('move it')
  assert.equal(moveLabel.core, normalForm('move it', full('move')).core, 'one source each: the first by number is the label')
  assert.equal(node('table.mjs', run, '--registry', registry).status, 0)
  const tableBefore = readFileSync(join(run, 'table.md'), 'utf8')

  // the rules change: two circuits of the run are judged again
  const list = join(folder, 'rejudge.json')
  writeFileSync(list, JSON.stringify([
    {settled_case: 'a new case', file: join(judging, 'verdicts-1.jsonl'), n: numberOf('move it', full('move')), text: 'move it', why: "'it'", grade_by_rules: 'L3'},
    {settled_case: 'a new case', file: join(judging, 'verdicts-2.jsonl'), n: numberOf('drop it', full('drop')), text: 'drop it', grade_by_rules: 'L8'},
    {file: join(registry, 'fixed-sample.jsonl'), n: 1, text: 'bend it', grade_by_rules: 'L3'}, {file: join(registry, 'fixed-sample.jsonl'), n: 3, text: 'fold it'},
    {file: join(registry, 'fixed-sample.jsonl'), n: 4, text: 'hide it', grade_by_rules: 'L8'}, {file: labelsFile, n: 5, text: 'turn it'}]))
  writeFileSync(join(judging, 'RULES.md'), 'the rules as they were\n')
  const history = ['verdicts-1.jsonl', 'verdicts-2.jsonl', 'packet-1.jsonl', 'packet-2.jsonl'].map(name => readFileSync(join(judging, name), 'utf8'))
  const prepared = node('rejudge.mjs', 'prepare', run, list, '--registry', registry)
  assert.equal(prepared.status, 0, prepared.stderr)
  assert.match(prepared.stdout, /6 entries in .*: 2 for \S*run\. 2 circuits are sent to a judge again\.[\s\S]*New packets: packet-3\.jsonl \(2\)/u)
  assert.deepEqual(readdirSync(judging).sort(), ['RULES.md', 'check.mjs', 'packet-1.jsonl', 'packet-2.jsonl', 'packet-3.jsonl', 'verdicts-1.jsonl', 'verdicts-2.jsonl'])
  assert.deepEqual(['verdicts-1.jsonl', 'verdicts-2.jsonl', 'packet-1.jsonl', 'packet-2.jsonl'].map(name => readFileSync(join(judging, name), 'utf8')), history, 'the old packets and verdicts stay as they were')
  assert.equal(readFileSync(join(judging, 'RULES.md'), 'utf8'), readFileSync(join(tools, 'rules.md'), 'utf8'), 'the judge reads the rules as they are now')
  const again = readJsonl(join(judging, 'packet-3.jsonl'))
  assert.deepEqual(again.map(line => [line.n, line.text, Object.keys(line).join()]), [[4, 'move it', 'n,text,sop'], [5, 'drop it', 'n,text,sop']])
  const items = readJsonl(join(run, 'key/items.jsonl'))
  assert.deepEqual(items.slice(3).map(one => [one.n, one.core === items.find(other => other.n === one.rejudge.of).core, one.rejudge.of, one.rejudge.against, one.rejudge.before.verdict, one.rejudge.expected, one.rejudge.rules]),
    [[4, true, numberOf('move it', full('move')), 'round-1.jsonl', 'accepted', 'L3', rulesVersion()], [5, true, numberOf('drop it', full('drop')), 'round-1.jsonl', 'accepted', 'L8', rulesVersion()]])
  assert.match(node('rejudge.mjs', 'prepare', run, list, '--registry', registry).stdout, /2 were sent again already under these rules[\s\S]*No new packet/u, 'a circuit is sent again once under the same rules')
  // until the judge has written the new verdicts, the table and the registry stay as they were
  assert.equal(node('table.mjs', run, '--registry', registry).status, 0)
  assert.equal(readFileSync(join(run, 'table.md'), 'utf8'), tableBefore)
  const early = node('judge-publish.mjs', run, '--tag', 'round-2', '--registry', registry)
  assert.match(early.stdout, /2 of them judged again, whose new verdict is not written yet[\s\S]*Nothing new to publish/u)
  assert.equal(existsSync(join(registry, 'round-2.jsonl')), false)

  // the judge rejects the label of "move it" and accepts the circuit of "drop it" again
  writeFileSync(join(judging, 'verdicts-3.jsonl'), JSON.stringify({n: 4, grade: 'L3', note: "'it' is no complement"}) + '\n' + JSON.stringify({n: 5, grade: 'L8', note: ''}) + '\n')
  assert.equal(spawnSync(process.execPath, [join(judging, 'check.mjs'), '3'], {encoding: 'utf8'}).status, 0)
  assert.equal(node('table.mjs', run, '--registry', registry).status, 0)
  assert.deepEqual(readJson(join(run, 'table.json')).strategies.map(line => [line.strategy, line.levels.L3, line.levels.L8]), [['alpha', 1, 1], ['beta', 0, 2]])
  const published = node('judge-publish.mjs', run, '--tag', 'round-2', '--judge', 'test-judge', '--rejudged-only', '--registry', registry)
  assert.equal(published.status, 0, published.stderr)
  assert.match(published.stdout, /Of them, 2 were judged again: 1 accepted, 1 rejected; 2 lines supersede/u)
  assert.match(published.stdout, /Labels after judging again: 1 labels the judge now rejects were replaced by another accepted circuit, 0 were emptied/u)
  assert.deepEqual(readJsonl(join(registry, 'round-2.jsonl')).map(line => [line.text, line.verdict, line.supersedes, line.run]), [['move it', 'rejected', 'round-1.jsonl', 'round-2'], ['drop it', 'accepted', 'round-1.jsonl', 'round-2']])
  const now = readRegistry(registry)
  assert.equal(lookup(now, 'move it', normalForm('move it', full('move')).core).grade, 'L3', 'the registry returns the newest decision')
  assert.deepEqual([labelOf('move it').core, labelOf('move it').accepted_by], [normalForm('move it', flat('move')).core, 'judge'], 'the other circuit the judge accepted in the run is the label now')
  assert.deepEqual([labelOf('drop it').core, labelOf('drop it').accepted_by], [normalForm('drop it', full('drop')).core, 'judge'])
  // published once: a second call finds the registry's decision newer than the one the circuits were judged again against
  assert.match(node('judge-publish.mjs', run, '--tag', 'round-3', '--rejudged-only', '--registry', registry).stdout, /2 circuits judged again have a later decision[\s\S]*Nothing new to publish/u)

  // a folder of its own for circuits known from the registry or the labels only
  const own = join(folder, 'rejudge-fixed-sample')
  const made = node('rejudge.mjs', 'prepare', own, list, '--from', join(registry, 'fixed-sample.jsonl'), syntactic, '--registry', registry)
  assert.equal(made.status, 0, made.stderr)
  assert.match(made.stdout, /4 for \S*rejudge-fixed-sample\. 4 circuits are sent to a judge again\.\nTheir decision now: 3 accepted, 1 rejected; 3 have a registry line[\s\S]*packet-1\.jsonl \(4\)/u)
  assert.deepEqual(readJsonl(join(own, 'key/items.jsonl')).map(one => [one.n, one.text, one.sources.join('+'), one.rejudge.against, one.rejudge.before.by, 'of' in one.rejudge]),
    [[1, 'bend it', 'hmm-rules', 'fixed-sample.jsonl', 'judge', false], [2, 'fold it', 'hmm-rules', 'fixed-sample.jsonl', 'judge', false], [3, 'hide it', 'hmm-rules', 'fixed-sample.jsonl', 'judge', false],
      [4, 'turn it', 'alpha+beta+gamma', null, 'agreement', false]])
  assert.deepEqual(readJsonl(join(own, 'key/labels-before.jsonl')).map(line => [line.text, line.accepted_by]), [['bend it', 'judge'], ['fold it', 'judge'], ['turn it', 'agreement']])
  assert.deepEqual(readdirSync(join(own, 'judging')).sort(), ['RULES.md', 'check.mjs', 'packet-1.jsonl'])
  writeFileSync(join(own, 'judging/verdicts-1.jsonl'), [{n: 1, grade: 'L3', note: "'it'"}, {n: 2, grade: 'L1', note: "'fold'"}, {n: 3, grade: 'L8', note: ''}, {n: 4, grade: 'L8', note: ''}].map(line => JSON.stringify(line)).join('\n') + '\n')
  // "again-fixed.jsonl" is read before "fixed-sample.jsonl", and its lines count all the same
  const fixed = node('judge-publish.mjs', own, '--tag', 'again-fixed', '--judge', 'test-judge', '--registry', registry)
  assert.equal(fixed.status, 0, fixed.stderr)
  assert.match(fixed.stdout, /Labels after judging again: 1 labels the judge now rejects were replaced by another accepted circuit, 1 were emptied \(no accepted circuit is left, so the message is open again\), 1 labels settled by agreement were accepted by the judge, 1 messages with no label got the circuit the judge now accepts\./u)
  assert.deepEqual(readJsonl(join(registry, 'again-fixed.jsonl')).map(line => [line.text, line.verdict, line.supersedes ?? null]),
    [['bend it', 'rejected', 'fixed-sample.jsonl'], ['fold it', 'rejected', 'fixed-sample.jsonl'], ['hide it', 'accepted', 'fixed-sample.jsonl'], ['turn it', 'accepted', null]])
  const after = readRegistry(registry)
  assert.equal(lookup(after, 'hide it', normalForm('hide it', flat('hide')).core).verdict, 'accepted')
  assert.equal(lookup(after, 'bend it', normalForm('bend it', full('bend')).core).verdict, 'rejected')
  assert.equal(readFileSync(labelsFile, 'utf8'), writeCsv(SYNTACTIC_HEADER, [['move it', normal('move it', flat('move')), 'beta', 'judge'], ['drop it', normal('drop it', full('drop')), 'alpha+beta', 'judge'],
    ['bend it', normal('bend it', flat('bend')), 'hmm-rules+spacy', 'judge'], ['fold it', '', '', ''], ['turn it', normal('turn it', flat('turn')), 'alpha+beta+gamma', 'judge'],
    ['hide it', normal('hide it', flat('hide')), 'hmm-rules', 'judge'], ['rest here', '', '', '']]))

  // none of this touched the syntactic files of the dataset
  assert.equal(datasetFiles(), datasetBefore)
})

test('the new items of a judgment made again: numbered after the last one, taken once per circuit', () => {
  const full = verb => `@c1 syntax.clause form=imperative verb="${verb}" complement=$n1\n@n1 syntax.nominal head="it"`
  const where = (message, sop, more = {}) => ({kind: 'registry', text: message, sop, sources: ['hmm-rules'], before: {verdict: 'accepted', grade: 'L8', note: '', by: 'judge'}, ...more})
  const located = [{entry: {file: 'a.jsonl', n: 1, text: 'move it', settled_case: 'case 1'}, where: where('move it', full('move'))},
    {entry: {file: 'a.jsonl', n: 2, text: 'move it'}, where: where('move it', full('move'))},                          // the same circuit twice
    {entry: {file: 'a.jsonl', n: 3, text: 'drop it'}, where: where('drop it', 'not a circuit')},
    {entry: {file: 'b.jsonl', n: 1, text: 'lift it'}, where: {problem: 'line 1 of b.jsonl is another message'}}]
  const items = [{n: 7, text: 'turn it', sop: 'x', core: 'y', sources: []}]
  const result = rejudgeItems(items, located, emptyRegistry(), {take: entry => entry.file === 'a.jsonl', rules: 'r1'})
  assert.deepEqual([result.added.map(one => [one.n, one.text, one.rejudge.from, one.rejudge.case, one.rejudge.against]), result.taken, result.again], [[[8, 'move it', 'a.jsonl:1', 'case 1', null]], 3, 1])
  assert.deepEqual(result.problems, ['a.jsonl:3 holds no valid circuit of its message'], 'an entry of another folder with a problem is not reported here')
  assert.equal(rejudgeItems([...items, ...result.added], located.slice(0, 1), emptyRegistry(), {rules: 'r1'}).again, 1)
  assert.equal(rejudgeItems([...items, ...result.added], located.slice(0, 1), emptyRegistry(), {rules: 'r2'}).added.length, 1, 'new rules send the circuit again')
})

test('a renamed strategy: old run folders, registry lines and labels that use its old name count under its name now', () => {
  assert.deepEqual(strategyAliases, {vss: 'hmm-rules'})
  assert.deepEqual(['vss', 'hmm-rules', 'spacy', undefined].map(strategyName), ['hmm-rules', 'hmm-rules', 'spacy', undefined])
  assert.deepEqual(['vss', 'spacy+vss', 'judge', '', 'vssx+avss'].map(sourceNow), ['hmm-rules', 'spacy+hmm-rules', 'judge', '', 'vssx+avss'], 'whole names only, in their order')
  const flat = verb => `@c1 syntax.clause form=imperative verb="${verb}" modifier="it"`
  const write = (dir, name, rows) => writeFileSync(join(dir, name + '.jsonl'), rows.map(one => JSON.stringify(one)).join('\n') + '\n')
  // an old folder: vss.jsonl, listed in summary.json under the old name
  const old = mkdtempSync(join(tmpdir(), 'syntax-renamed-'))
  write(old, 'vss', [row('1', 'move it', flat('move'))])
  write(old, 'spacy', [row('1', 'move it', flat('move'))])
  writeFileSync(join(old, 'summary.json'), JSON.stringify({strategies: {vss: {file: 'vss.jsonl'}, spacy: {file: 'spacy.jsonl'}}}))
  assert.deepEqual(readOutputs(old).map(output => [output.strategy, output.rows.length]), [['hmm-rules', 1], ['spacy', 1]])
  assert.equal(outputFile(old, 'hmm-rules'), join(old, 'vss.jsonl'))
  assert.equal(outputFile(old, 'vss'), join(old, 'vss.jsonl'))
  // run again under the name now: its file counts, and the old one is left where it is
  write(old, 'hmm-rules', [row('1', 'move it', flat('lift'))])
  assert.deepEqual(readOutputs(old).map(output => [output.strategy, output.rows[0].sop]), [['hmm-rules', flat('lift')], ['spacy', flat('move')]])
  assert.equal(outputFile(old, 'vss'), join(old, 'hmm-rules.jsonl'))
  const bare = mkdtempSync(join(tmpdir(), 'syntax-renamed-'))
  write(bare, 'vss', [row('1', 'move it', flat('move'))])
  assert.deepEqual(readOutputs(bare).map(output => output.strategy), ['hmm-rules'], 'a folder with no summary.json')
  // the items and the agreed circuits of an old run
  mkdirSync(join(old, 'key'))
  write(join(old, 'key'), 'items', [{n: 1, text: 'move it', sop: flat('move'), core: coreOf('move it', flat('move')), sources: ['spacy', 'vss']}])
  write(join(old, 'key'), 'agreement', [{text: 'move it', sop: flat('move'), core: coreOf('move it', flat('move')), sources: ['spacy', 'vss'], families: ['parser', 'vss']}])
  assert.deepEqual(readItems(old)[0].sources, ['hmm-rules', 'spacy'])
  assert.deepEqual([readAgreement(old)[0].sources, readAgreement(old)[0].families], [['hmm-rules', 'spacy'], ['hmm-rules', 'parser']])
  // registry lines and labels
  const registry = emptyRegistry()
  addToRegistry(registry, judged('move it', flat('move'), 'accepted', {source: 'vss+spacy'}))
  assert.equal(lookup(registry, 'move it', coreOf('move it', flat('move'))).source, 'hmm-rules+spacy')
  assert.equal(labelLine({text: 'move it', label: flat('move'), source: 'spacy+vss', accepted_by: 'agreement'}).source, 'spacy+hmm-rules')
  // families: an old name given or declared
  assert.equal(familyFinder({vss: ['vss'], parser: ['spacy']})('hmm-rules'), 'hmm-rules')
  assert.equal(familyFinder()('vss'), 'hmm-rules')
  // agreed.mjs with the old name over an old folder
  const done = spawnSync(process.execPath, [join(tools, 'agreed.mjs'), join(bare, 'out.jsonl'), '--strategies', 'vss,spacy', old], {encoding: 'utf8'})
  assert.equal(done.status, 0, done.stderr)
  assert.deepEqual(readJsonl(join(bare, 'out.jsonl')).map(line => line.text), [])
})
