// The benchmark of the `syntax` schema: the normal form of a circuit, the registry of judged
// circuits, the packets for a judge, the check of verdict files, the levels and GOAL, the
// agreement between strategies, and one run from start to table with stub strategies.
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
  agreementOf, renderAgreement, readJsonl, readJson, LEVELS} from './benchmark/syntax/lib.mjs'
import {checkVerdicts, quotesTheMessage} from './benchmark/syntax/check.mjs'
import {errorKind, takeOver} from './benchmark/syntax/run.mjs'
import {convert} from './benchmark/syntax/convert-nlu.mjs'
import {strategyModules} from './benchmark/syntax/strategies.mjs'
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

test('a judge\'s line counts before a line rewritten from an nlu reference', () => {
  const converted = judged(text, verbReading, 'accepted', {run: 'convert-nlu:old-run', source: 'reference'})
  const byJudge = judged(text, sameByAnotherHand, 'rejected', {grade: 'L3', run: 'later', source: 'reference'})
  for (const order of [[converted, byJudge], [byJudge, converted]]) {
    const registry = emptyRegistry()
    for (const line of order) addToRegistry(registry, line)
    assert.equal(lookup(registry, text, normalForm(text, verbReading).core).verdict, 'rejected')
  }
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

test('a reference rewritten from nlu can be sent to the judge with the circuits that differ from it', () => {
  const registry = emptyRegistry()
  addToRegistry(registry, judged(text, verbReading, 'accepted', {run: 'convert-nlu:old-run', source: 'reference'}))
  const outputs = [{strategy: 'alpha', rows: withCores([row('1', text, nounReading)])}, {strategy: 'beta', rows: withCores([row('1', text, sameByAnotherHand)])}]
  assert.deepEqual(collectItems(outputs, registry).items.map(item => item.sources), [['alpha']])
  const audited = collectItems(outputs, registry, {auditReferences: true}).items
  assert.deepEqual(audited.map(item => item.sources).sort(), [['alpha'], ['reference']])
  assert.doesNotMatch(JSON.stringify(packetsOf(audited)), /reference|alpha/u)
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

test('levels and GOAL from the registry and the verdicts of the run', () => {
  const circuit = verb => `@c1 syntax.clause form=imperative verb="${verb}" complement=$n1\n@n1 syntax.nominal head="it"`
  const flat = verb => `@c1 syntax.clause form=imperative verb="${verb}" modifier="it"`
  const registry = emptyRegistry()
  addToRegistry(registry, judged('move it', circuit('move'), 'accepted'))                                       // L9 for who writes it
  addToRegistry(registry, judged('drop it', flat('drop'), 'rejected', {grade: 'L3'}))                           // L3 from the registry
  addToRegistry(registry, judged('lift it', flat('lift'), 'rejected', {grade: 'L3', source: 'reference'}))      // a reference a judge rejected
  addToRegistry(registry, judged('lift it', circuit('lift'), 'accepted'))                                       // L10: accepted, reference rejected
  const rows = withCores([row('1', 'move it', circuit('move')), row('2', 'drop it', flat('drop')), row('3', 'lift it', circuit('lift')),
    row('4', 'turn it', circuit('turn')), row('5', 'hide it', flat('hide')), row('6', 'show it', circuit('show')), row('7', 'bend it', null, 'no circuit'), row('8', 'fold it', broken),
    row('9', text, openReading)])
  const outputs = [{strategy: 'alpha', rows}]
  const {items} = collectItems(outputs, registry)
  assert.deepEqual(items.map(item => item.text), ['turn it', 'hide it', 'show it', text])
  // the judge of this run reads three of the four waiting circuits
  const verdicts = runVerdicts(items, [{n: 1, grade: 'L8', note: ''}, {n: 2, grade: 'L5', note: "'it'"}, {n: 4, grade: 'L8', note: ''}, {n: 77, grade: 'L8', note: ''}])
  assert.deepEqual(rows.map(line => levelOf(line, registry, verdicts)), ['L9', 'L3', 'L10', 'L8', 'L5', 'waiting', 'L0', 'L0', 'L8'])
  assert.deepEqual(rows.map(line => levelOf(line, registry)), ['L9', 'L3', 'L10', 'waiting', 'waiting', 'waiting', 'L0', 'L0', 'waiting'])
  const [line] = tableOf(outputs, registry, verdicts)
  assert.deepEqual(line.levels, {L0: 2, L1: 0, L2: 0, L3: 1, L4: 0, L5: 1, L6: 0, L7: 0, L8: 2, L9: 1, L10: 1})
  assert.deepEqual([line.messages, line.waiting, line.accepted, line.ambiguous], [9, 1, 4, 1])
  assert.equal(line.goal, 4 / 9)          // of all messages: a waiting message is not counted as accepted
  assert.equal(line.atMost, 5 / 9)        // when the waiting circuit is accepted too
  const shown = renderTable([line], {notRun: [['z3', 'not ported']]})
  assert.match(shown, /\| Strategy \| Messages \| L0 \| L1 \| L2 \| L3 \| L4 \| L5 \| L6 \| L7 \| L8 \| L9 \| L10 \| waiting \| GOAL \|/u)
  assert.match(shown, /\| alpha \| 9 \| 2 \| 0 \| 0 \| 1 \| 0 \| 1 \| 0 \| 0 \| 2 \| 1 \| 1 \| 1 \| 44\.4% \|/u)
  assert.match(shown, /\| alpha \| 1 \| 44\.4% \| 55\.6% \|/u)
  assert.match(shown, /\| alpha \| 4 \| 1 \| 25\.0% \|/u)
  assert.match(shown, /z3 \(not ported\)/u)
  // a reference rejected by the judge of this run opens L10 as well
  const audit = collectItems(outputs, (() => { const before = emptyRegistry(); addToRegistry(before, judged('turn it', flat('turn'), 'accepted', {run: 'convert-nlu:x', source: 'reference'})); return before })(), {auditReferences: true})
  const turn = audit.items.filter(item => item.text === 'turn it')
  assert.deepEqual(turn.map(item => item.sources).sort(), [['alpha'], ['reference']])
  const auditVerdicts = runVerdicts(audit.items, turn.map(item => ({n: item.n, grade: item.sources[0] === 'reference' ? 'L3' : 'L8', note: "'it'"})))
  assert.equal(levelOf(rows[3], emptyRegistry(), auditVerdicts), 'L10')
  assert.equal(LEVELS.length, 11)
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

test('the list of strategies has the names of the earlier benchmark', () => {
  assert.deepEqual(Object.keys(strategyModules), Object.keys(earlierModules))
  for (const [name, [module, exported]] of Object.entries(strategyModules)) {
    assert.equal(exported, earlierModules[name][1])
    assert.equal(existsSync(new URL(module, new URL('./benchmark/syntax/strategies.mjs', import.meta.url))), true, module)
  }
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
  const folder = mkdtempSync(join(tmpdir(), 'syntax-benchmark-'))
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

  // judged in this run: L8. The table does not change when the verdicts are published.
  const table = node('table.mjs', run, '--registry', registry)
  assert.equal(table.status, 0, table.stderr)
  assert.deepEqual(levels('careful').levels, {L0: 4, L1: 0, L2: 0, L3: 0, L4: 0, L5: 0, L6: 0, L7: 0, L8: 2, L9: 0, L10: 0})
  assert.deepEqual(levels('hasty').levels, {L0: 4, L1: 0, L2: 0, L3: 1, L4: 0, L5: 0, L6: 0, L7: 0, L8: 1, L9: 0, L10: 0})
  assert.equal(levels('careful').goal, 2 / 6)
  assert.match(readFileSync(join(run, 'table.md'), 'utf8'), /\| careful \| 6 \| 4 \| 0 \| 0 \| 0 \| 0 \| 0 \| 0 \| 0 \| 2 \| 0 \| 0 \| 0 \| 33\.3% \|/u)
  const agreement = node('agree.mjs', run, '--registry', registry)
  assert.equal(agreement.status, 0, agreement.stderr)
  assert.match(agreement.stdout, /All 2 strategies wrote the same circuit \| 1 \| 16\.7% \| 1 \| 0 \| 0 \|/u)

  // a later run reuses the files and needs no judge: what was judged is now L9
  const later = join(folder, 'later')
  assert.equal(node('run.mjs', later, '--strategies', strategies, '--sample', sampleFile, '--reuse', run, '--only', 'careful,hasty').status, 0)
  assert.equal(readJson(join(later, 'summary.json')).strategies.hasty.status, 'reused')
  const again = node('judge-prepare.mjs', later, '--registry', registry)
  assert.match(again.stdout, /0 distinct circuits need a judge/u)
  assert.equal(existsSync(join(later, 'judging', 'packet-1.jsonl')), false)
  assert.equal(node('table.mjs', later, '--registry', registry).status, 0)
  const laterLevels = readJson(join(later, 'table.json')).strategies
  assert.deepEqual(laterLevels.map(line => [line.strategy, line.levels.L9, line.levels.L3, line.levels.L8, line.waiting]), [['careful', 2, 0, 0, 0], ['hasty', 1, 1, 0, 0]])
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
