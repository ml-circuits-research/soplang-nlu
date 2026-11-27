// The benchmark of the `syntax` schema: the normal form of a circuit, the registry of judged
// circuits, the labels of the messages, the packets for a judge, the check of verdict files, the
// levels and GOAL, the agreement between strategies, the random sample, runs from start to table
// with stub strategies, and a conversion round from the source file to the syntactic file.
// Run with SOP_KNOWLEDGE_DIR unset: nothing here may need a knowledge repository.
import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync} from 'node:fs'
import {gzipSync} from 'node:zlib'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {coreOf, validateSyntax, writeCircuit} from '../lib/index.mjs'
import {normalForm, withCores, emptyRegistry, addToRegistry, lookup, collectItems, packetsOf, runVerdicts, levelOf, tableOf, renderTable,
  agreementOf, renderAgreement, chooseLabels, updateLabels, readLabels, writeLabels, readArguments, readSample, readJsonl, readJson, LEVELS,
  defaultLabelsFile, defaultRegistryDir, labelsFileOf, readCsv, writeCsv, csvCell, agreedCircuits, chooseAudit, packageRoot} from './benchmark/syntax/lib.mjs'
import {messagesOfCsv, distinctMessages, drawSample, messageFiles} from './benchmark/syntax/sample.mjs'
import {pickFiles, planRounds, messagesOfFile, roundState, chooseCircuit, syntacticRows, SYNTACTIC_HEADER} from './benchmark/syntax/round.mjs'
import {checkWritten, describeFinding} from './benchmark/syntax/rewrite-check.mjs'
import {checkVerdicts, quotesTheMessage} from './benchmark/syntax/check.mjs'
import {errorKind, takeOver} from './benchmark/syntax/run.mjs'
import {convert} from './benchmark/syntax/convert-nlu.mjs'
import {strategyModules, families, familyFinder} from './benchmark/syntax/strategies.mjs'
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
const judged = (message, sop, verdict, more = {}) => ({text: message, sop, core: coreOf(message, sop), verdict, grade: verdict === 'accepted' ? 'L8' : 'L3', note: '', judge: 'test', run: 'earlier', source: 'vss', ...more})

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
  assert.equal(addToRegistry(registry, {text, sop: verbReading, core: coreOf(text, verbReading), source: 'reference', nlu: {judge: 'x', run: 'y', writtenBy: 'vss'}}), false)
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

test('every circuit accepted in a run becomes the label of its message', () => {
  const circuit = verb => `@c1 syntax.clause form=imperative verb="${verb}" complement=$n1\n@n1 syntax.nominal head="it"`
  const flat = verb => `@c1 syntax.clause form=imperative verb="${verb}" modifier="it"`
  const item = (n, message, sop, sources) => ({n, text: message, sop: normalForm(message, sop).sop, core: normalForm(message, sop).core, sources})
  // one label per message: the circuit most strategies wrote, then the first
  const accepted = [item(1, 'move it', flat('move'), ['alpha']), item(2, 'move it', circuit('move'), ['beta', 'gamma']),
    item(4, 'drop it', circuit('drop'), ['alpha']), item(3, 'drop it', flat('drop'), ['beta']), item(5, 'lift it', circuit('lift'), ['alpha'])]
  assert.deepEqual([...chooseLabels(accepted)].map(([message, chosen]) => [message, chosen.n]), [['move it', 2], ['drop it', 3], ['lift it', 5]])

  const labels = new Map()
  assert.deepEqual(updateLabels(labels, accepted, 'run-1'), {set: 3, first: 3, replaced: 0})
  assert.deepEqual(labels.get('move it'), {text: 'move it', label: circuit('move'), core: coreOf('move it', circuit('move')), run: 'run-1', source: 'beta+gamma', previous: null})
  assert.equal(labels.get('drop it').label, flat('drop'))
  // a later run: a new accepted circuit replaces the label whatever it was, and names the one it replaced
  const later = [item(1, 'move it', flat('move'), ['delta']), item(2, 'lift it', circuit('lift'), ['delta']), item(3, 'turn it', circuit('turn'), ['delta'])]
  assert.deepEqual(updateLabels(labels, later, 'run-2'), {set: 2, first: 1, replaced: 1})
  assert.deepEqual(labels.get('move it'), {text: 'move it', label: flat('move'), core: coreOf('move it', flat('move')), run: 'run-2', source: 'delta', previous: coreOf('move it', circuit('move'))})
  assert.equal(labels.get('lift it').run, 'run-1', 'the same circuit again leaves the label as it is')
  assert.equal(labels.get('turn it').previous, null)

  // the file: one line per message, read back with the same cores
  const file = join(mkdtempSync(join(tmpdir(), 'syntax-benchmark-')), 'labels.jsonl')
  assert.equal(readLabels(file).size, 0)
  writeLabels(file, labels)
  const lines = readJsonl(file)
  assert.deepEqual(lines.map(line => Object.keys(line)), Array(4).fill(['text', 'label', 'core', 'run', 'source', 'previous']))
  assert.deepEqual(lines.map(line => line.text), ['move it', 'drop it', 'lift it', 'turn it'])
  for (const line of lines) assert.equal(line.core, coreOf(line.text, line.label))
  assert.deepEqual([...readLabels(file)], [...labels])
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
    'not json', '{"n": 1, "grade": "L8"}', '{"n": 1, "grade": "L8", "note": "", "strategy": "vss"}'])
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
  const label = (message, sop) => [message, {text: message, label: sop, core: normalForm(message, sop).core, run: 'earlier', source: 'vss', previous: null}]
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
  assert.deepEqual(Object.keys(strategyModules).filter(name => name !== 'neural-dependencies').sort(), Object.keys(earlier).sort())
  for (const [name, [module, exported]] of Object.entries(strategyModules)) {
    if (earlier[name]) assert.equal(exported, earlier[name][1])
    assert.equal(existsSync(new URL(module, new URL('./benchmark/syntax/strategies.mjs', import.meta.url))), true, module)
  }
  const familyOf = familyFinder()
  // a family is the source of the analysis: whatever reads the dependency parse, or chooses among circuits written from it, stands with the parser
  assert.deepEqual(Object.keys(families), ['vss', 'parser', 'prolog', 'z3', 'distilbert'])
  for (const name of Object.keys(strategyModules)) assert.ok(families[familyOf(name)]?.includes(name), name + ' stands in a family')
  assert.deepEqual(['vss', 'spacy-direct', 'neural-dependencies', 'prolog', 'neuro-prolog', 'neuro-z3', 'distilbert', 'neuro-selector'].map(familyOf), ['vss', 'parser', 'parser', 'prolog', 'parser', 'parser', 'distilbert', 'parser'])
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
  assert.ok(rules.split('\n').length < 110, 'short enough to be read again often')
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
  // the labels of the dataset stand beside its registry; a registry named for a trial brings its own labels
  assert.equal(labelsFileOf(), defaultLabelsFile)
  assert.equal(labelsFileOf(defaultRegistryDir), defaultLabelsFile)
  const datasetLabels = existsSync(defaultLabelsFile) ? readFileSync(defaultLabelsFile, 'utf8') : null
  const folder = mkdtempSync(join(tmpdir(), 'syntax-benchmark-'))
  const labelsFile = join(folder, 'labels.jsonl')
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
  // every accepted circuit is now the label of its message; the labels before the run are kept in the run folder
  assert.match(published.stdout, /Labels: 2 messages got the circuit accepted in this run as their label \(2 had no label, 0 had another one\)/u)
  const labelled = readJsonl(labelsFile)
  assert.deepEqual(labelled.map(line => Object.keys(line)), Array(2).fill(['text', 'label', 'core', 'run', 'source', 'previous']))
  assert.deepEqual(labelled.map(line => [line.text, line.run, line.source, line.previous]), [['move it', 'round-1', 'careful+hasty', null], ['drop it', 'round-1', 'careful', null]])
  for (const line of labelled) {
    assert.equal(line.label, stored.find(other => other.text === line.text && other.verdict === 'accepted').sop)
    assert.equal(line.core, coreOf(line.text, line.label))
  }
  assert.equal(readFileSync(join(run, 'key', 'labels-before.jsonl'), 'utf8'), '')

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
  assert.match(replaced.stdout, /Labels: 1 messages got the circuit accepted in this run as their label \(0 had no label, 1 had another one\)/u)
  const relabelled = readJsonl(labelsFile)
  assert.deepEqual(relabelled.map(line => [line.text, line.run, line.source, line.previous]), [['move it', 'round-2', 'bold', labelled[0].core], ['drop it', 'round-1', 'careful', null]])
  assert.equal(relabelled[0].label, replacing.sop)
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

  // none of this touched the labels of the dataset
  assert.equal(existsSync(defaultLabelsFile) ? readFileSync(defaultLabelsFile, 'utf8') : null, datasetLabels)
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
  addToRegistry(registry, judged('show it', flat('show'), 'accepted', {judge: 'agreement', run: 'earlier'}))
  addToRegistry(registry, judged('show it', bare('show'), 'accepted', {source: 'judge', run: 'earlier'}))
  const core = (message, sop) => normalForm(message, sop).core
  const agreed = [{text: 'move it', core: core('move it', full('move')), sources: ['alpha', 'beta']}, {text: 'lift it', core: core('lift it', full('lift')), sources: ['alpha', 'beta']}]
  const items = [{n: 1, text: 'lift it', core: core('lift it', full('lift')), sources: ['alpha', 'beta']}, {n: 2, text: 'turn it', core: core('turn it', flat('turn')), sources: ['beta']},
    {n: 3, text: 'hide it', core: core('hide it', full('hide')), sources: ['alpha']}]
  const verdicts = runVerdicts(items, [{n: 1, grade: 'L8', note: ''}, {n: 2, grade: 'L2', note: "'it'"}, {n: 3, grade: 'L8', note: ''}], agreed)
  const written = [{text: 'bend it', sop: full('bend'), core: core('bend it', full('bend'))}]
  const state = roundState({texts, outputs, registry, verdicts, written})
  const said = message => state.get(message).map(circuit => [circuit.status, circuit.by, circuit.strategies.join('+')]).sort()
  assert.deepEqual(said('move it'), [['accepted', 'agreement', 'alpha+beta']])
  assert.deepEqual(said('lift it'), [['accepted', 'judge', 'alpha+beta']], 'an agreed circuit that a judge read is accepted by the judge')
  assert.deepEqual(said('turn it'), [['rejected', 'judge', 'alpha+vss'], ['rejected', 'judge', 'beta']])
  assert.deepEqual(said('hide it'), [['accepted', 'judge', 'alpha'], ['waiting', null, 'beta']])
  assert.deepEqual(said('drop it'), [['accepted', 'judge', 'beta+old+older'], ['accepted', 'judge', 'old'], ['waiting', null, 'alpha']])
  assert.deepEqual(said('show it'), [['accepted', 'agreement', 'beta+vss'], ['accepted', 'written', ''], ['waiting', null, 'alpha']])
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
    ['hide it', 2, 'alpha', 'judge'], ['show it', 1, 'beta+vss', 'agreement'], ['bend it', 2, 'judge', 'written']])
  assert.equal(rows[3][1], '')
  // a message the round does not know is open
  assert.deepEqual(syntacticRows([{record: 1, text: 'a new message'}], state, labels).open, ['a new message'])
})

test('a syntactic file: cells with several lines, commas and quotes', () => {
  assert.deepEqual(SYNTACTIC_HEADER, ['text', 'sop', 'source', 'accepted_by'])
  assert.deepEqual(['plain', 'a, b', 'say "hi"', 'two\nlines', ' edge', '', null].map(csvCell), ['plain', '"a, b"', '"say ""hi"""', '"two\nlines"', '" edge"', '', ''])
  const circuit = '@c1 syntax.clause form=imperative verb="put" complement=$n1\n@n1 syntax.nominal dependent="the" head="box"\n@r1 syntax.relation marker="next to" from=$c1 to=$n2\n@n2 syntax.nominal head="it"'
  const rows = [['put the box next to it', circuit, 'vss+z3', 'agreement'], ['say "hi", then stop', '@c1 syntax.clause form=fragment discourse="say"', 'judge', 'written'], ['an open one', '', '', '']]
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
  const realLabels = existsSync(defaultLabelsFile) ? readFileSync(defaultLabelsFile, 'utf8') : null
  const realSyntactic = join(packageRoot, '../webmeet-dataset/syntactic'), realFiles = existsSync(realSyntactic) ? readdirSync(realSyntactic, {recursive: true}).sort().join('\n') : null
  const folder = mkdtempSync(join(tmpdir(), 'syntax-round-'))
  const dataset = join(folder, 'dataset'), rounds = join(folder, 'rounds'), strategies = join(folder, 'strategies.mjs')
  const registry = join(dataset, 'annotations/syntax/v1/judged'), labelsFile = join(dataset, 'annotations/syntax/v1/labels.jsonl')
  const full = verb => `@c1 syntax.clause form=imperative verb="${verb}" complement=$n1\n@n1 syntax.nominal head="it"`
  const source = (name, texts, newline = '\n') => { mkdirSync(join(dataset, 'semantic/things'), {recursive: true}); writeFileSync(join(dataset, 'semantic/things', name), ['text,sop', ...texts.map(message => `${csvCell(message)},"@r1 w.request.request act=make\n@r2 w.request.target request=$r1"`)].join(newline) + newline) }
  source('tiny.csv', ['push it'])
  source('small.csv', ['move it', 'drop it', 'lift it', 'show it', 'hide it, please', 'turn it', 'move it'], '\r\n')
  source('other.csv', ['bend it', 'fold it', 'tear it', 'wrap it', 'tilt it', 'spin it', 'flip it', 'lock it'])
  mkdirSync(join(dataset, 'syntactic'), {recursive: true})
  // "show it" was judged in an earlier run and has a label
  mkdirSync(registry, {recursive: true})
  const earlierLine = {text: 'show it', sop: full('show'), core: coreOf('show it', full('show')), verdict: 'accepted', grade: 'L8', note: '', judge: 'earlier-judge', run: 'earlier', source: 'old'}
  writeFileSync(join(registry, 'earlier.jsonl'), JSON.stringify(earlierLine) + '\n')
  writeFileSync(labelsFile, JSON.stringify({text: 'show it', label: full('show'), core: earlierLine.core, run: 'earlier', source: 'old', previous: null}) + '\n')
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
  const settled = round('settle', first, '--audit', '0.34', '--families', '2', '--strategies', strategies)
  assert.equal(settled.status, 0, settled.stderr)
  const counts = readJson(join(first, 'settle.json'))
  assert.deepEqual(counts.strategies, [{strategy: 'alpha', family: 'one'}, {strategy: 'beta', family: 'two'}, {strategy: 'gamma', family: 'two'}])
  assert.deepEqual(counts.circuits, {distinct: 8, alreadyAcceptedInTheRegistry: 1, alreadyRejectedInTheRegistry: 0, settledByAgreement: 3, agreedAndSentToAJudge: 1, sentToAJudge: 6, newPackets: 1})
  assert.deepEqual(counts.messagesWith, {aCircuitSettledByAgreement: 3, anAcceptedCircuitInTheRegistry: 1, noSettledCircuitYet: 3, noValidCircuitFromAnyStrategy: 1})
  const agreement = readJsonl(join(first, 'key', 'agreement.jsonl'))
  assert.deepEqual(agreement.map(circuit => [circuit.text, circuit.sources.join('+'), circuit.families.join('+')]), [['push it', 'alpha+beta', 'one+two'], ['move it', 'alpha+beta+gamma', 'one+two'], ['turn it', 'alpha+beta+gamma', 'one+two']])
  assert.equal(agreement.filter(circuit => circuit.audit).length, 1)
  const audited = agreement.find(circuit => circuit.audit).text
  const packet = readJsonl(join(first, 'judging', 'packet-1.jsonl'))
  assert.deepEqual(packet.map(line => Object.keys(line)), Array(6).fill(['n', 'text', 'sop']))
  assert.deepEqual(packet.map(line => line.text).sort(), ['drop it', 'drop it', 'lift it', 'push it', 'show it', audited].sort())
  assert.doesNotMatch(JSON.stringify(packet), /alpha|beta|gamma|audit|@a /u)
  assert.equal(existsSync(join(first, 'key', 'labels-before.jsonl')), true)

  // before any judge: the three agreed circuits count as accepted, also the one sent to the judge for the audit;
  // "show it" has its label; two messages wait for the judge and one has no circuit at all
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
  assert.deepEqual([existsSync(join(registry, 'round-1.jsonl')), existsSync(join(dataset, 'syntactic/things')), readJsonl(labelsFile).length], [false, false, 1])

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

  // write: the registry, the labels, the syntactic files
  const written = round('write', first, '--tag', 'round-1', '--judge', 'test-judge')
  assert.equal(written.status, 0, written.stderr)
  const stored = readJsonl(join(registry, 'round-1.jsonl'))
  const kinds = line => line.judge === 'agreement' ? 'agreement' : line.source === 'judge' ? 'written' : line.verdict
  assert.deepEqual(stored.map(line => [line.text, kinds(line), line.source]).sort(), [
    ['drop it', 'accepted', 'alpha'], ['drop it', 'rejected', 'beta+gamma'], ['hide it, please', 'written', 'judge'], ['lift it', 'rejected', 'alpha'], ['lift it', 'written', 'judge'],
    ['move it', audited === 'move it' ? 'accepted' : 'agreement', 'alpha+beta+gamma'], ['push it', audited === 'push it' ? 'accepted' : 'agreement', 'alpha+beta'], ['push it', 'rejected', 'gamma'],
    ['show it', 'rejected', 'alpha'], ['turn it', audited === 'turn it' ? 'accepted' : 'agreement', 'alpha+beta+gamma']])
  for (const line of stored) {
    assert.deepEqual(Object.keys(line), ['text', 'sop', 'core', 'verdict', 'grade', 'note', 'judge', 'run', 'source'])
    assert.equal(line.core, coreOf(line.text, line.sop))
    assert.equal(line.judge, kinds(line) === 'agreement' ? 'agreement' : 'test-judge')
    assert.equal(line.run, 'round-1')
  }
  assert.match(stored.find(line => line.judge === 'agreement').note, /written alike by \d formalizers of 2 families \(one, two\); no judge has read it/u)
  const labels = readJsonl(labelsFile)
  assert.deepEqual(labels.map(line => [line.text, line.run, line.source]).sort(), [['drop it', 'round-1', 'alpha'], ['hide it, please', 'round-1', 'judge'], ['lift it', 'round-1', 'judge'],
    ['move it', 'round-1', 'alpha+beta+gamma'], ['push it', 'round-1', 'alpha+beta'], ['show it', 'earlier', 'old'], ['turn it', 'round-1', 'alpha+beta+gamma']])
  const by = message => message === audited ? 'judge' : 'agreement'
  const small = readFileSync(join(dataset, 'syntactic/things/small.csv'), 'utf8')
  assert.equal(small.startsWith('text,sop,source,accepted_by\r\n'), true, 'the line ends of the source file')
  assert.deepEqual(readCsv(small).slice(1).map(([message, sop, wrote, accepted]) => [message, sop.split('\n').length, wrote, accepted]), [
    ['move it', 2, 'alpha+beta+gamma', by('move it')], ['drop it', 2, 'alpha', 'judge'], ['lift it', 2, 'judge', 'written'], ['show it', 2, 'old', 'judge'],
    ['hide it, please', 2, 'judge', 'written'], ['turn it', 2, 'alpha+beta+gamma', by('turn it')]])
  for (const [message, sop] of readCsv(small).slice(1)) {
    assert.equal(validateSyntax(message, sop).valid, true, message)
    assert.equal(sop, labels.find(line => line.text === message).label, 'the circuit of the file is the label')
  }
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
  assert.match(again.stdout, /Registry: nothing new to publish[\s\S]*things\/small\.csv \| 6 .* exists already: not written/u)
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

  // none of this touched the dataset itself
  assert.equal(existsSync(defaultLabelsFile) ? readFileSync(defaultLabelsFile, 'utf8') : null, realLabels)
  assert.equal(existsSync(realSyntactic) ? readdirSync(realSyntactic, {recursive: true}).sort().join('\n') : null, realFiles)
})
