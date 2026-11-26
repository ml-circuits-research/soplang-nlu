import assert from 'node:assert/strict'
import test from 'node:test'
import {join, resolve} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {matchExpectedAnalysis} from './benchmark/analysis-breadth.mjs'
import {fixtures} from './benchmark/analysis-fixtures.mjs'

const knowledge = resolve(process.env.SOP_KNOWLEDGE_DIR ?? fileURLToPath(new URL('../../sop-knowledge-worlds', import.meta.url)))
const {parse} = await import(pathToFileURL(join(knowledge, 'tools/sopworld/sopworld.mjs')))
const fixture = id => fixtures.find(example => example.id === id)

test('matches independently chosen IDs and either licensed attachment', () => {
  const expected = fixture('scope-ambiguity').alternatives
  const circuit = from => parse([
    '@highlight nlu.entity head="circle"',
    '@edge nlu.entity head="wall"',
    '@point nlu.relation kind=near from=' + from + ' to=$edge cue="near"',
    '@move nlu.clause form=imperative predicate="Move" direct_object=$highlight'
  ].join('\n'))
  assert.deepEqual(expected.map(graph => matchExpectedAnalysis(circuit('$move'), graph).matched), [true, false])
  assert.deepEqual(expected.map(graph => matchExpectedAnalysis(circuit('$highlight'), graph).matched), [false, true])
  assert.ok(expected.every(graph => !matchExpectedAnalysis(circuit('$edge'), graph).matched))
})

test('rejects a reversed typed relationship and an additional unsupported clause', () => {
  const [expected] = fixture('source-and-destination').alternatives
  const sop = [
    '@a nlu.entity name="Zürich"',
    '@b nlu.entity name="Paris"',
    '@cabinet nlu.entity head="cabinet"',
    '@s nlu.relation kind=source from=$c to=$b cue="from"',
    '@d nlu.relation kind=destination from=$c to=$a cue="to"',
    '@c nlu.clause form=imperative predicate="Move" direct_object=$cabinet'
  ].join('\n')
  assert.equal(matchExpectedAnalysis(parse(sop), expected).matched, true)
  const reversed = sop.replace('to=$b cue="from"', 'to=$a cue="from"').replace('to=$a cue="to"', 'to=$b cue="to"')
  assert.equal(matchExpectedAnalysis(parse(reversed), expected).linkMismatch, true)
  const extra = matchExpectedAnalysis(parse(sop + '\n@bad nlu.clause form=fragment'), expected)
  assert.equal(extra.matched, false)
  assert.deepEqual(extra.shape, [{type: 'nlu.clause', wanted: 1, actual: 2}])
})

test('each fixture is unique and has complete internal expected references', () => {
  assert.equal(new Set(fixtures.map(item => item.id)).size, fixtures.length)
  for (const item of fixtures) {
    assert.ok(item.alternatives.length > 0, item.id)
    for (const graph of item.alternatives) {
      const labels = new Set(graph.map(node => node.label))
      assert.equal(labels.size, graph.length, item.id)
      for (const node of graph) {
        for (const value of Object.values(node.slots).flat()) {
          if (typeof value === 'string' && value.startsWith('$')) assert.ok(labels.has(value.slice(1)), item.id)
        }
      }
    }
  }
})
