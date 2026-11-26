import assert from 'node:assert/strict'
import {test} from 'node:test'
import {directedGraph, sameDirectedGraph} from './benchmark/meaning-review/compare-symbolic-graphs.mjs'

const n = (id, type, attrs) => ({id, type: 'nlu.' + type,
  attrs: Object.fromEntries(Object.entries(attrs).map(([key, value]) => [key, [].concat(value)]))})
const compare = (left, right, projection = 'strict') =>
  sameDirectedGraph(directedGraph(left, projection), directedGraph(right, projection))

test('ignores wire IDs and order while preserving directed role edges', () => {
  const left = [
    n('c', 'clause', {form:'imperative', direct_object:'$a', predicate:'"move"'}),
    n('a', 'entity', {name:'"A"'}), n('b', 'entity', {name:'"B"'}),
    n('r', 'relation', {from:'$c', to:'$b', kind:'left_of', cue:'"left of"'})
  ]
  const right = [
    n('thing7', 'entity', {name:'"B"'}),
    n('edge44', 'relation', {cue:'"left of"', kind:'left_of', to:'$thing7', from:'$request'}),
    n('thing2', 'entity', {name:'"A"'}),
    n('request', 'clause', {predicate:'"move"', direct_object:'$thing2', form:'imperative'})
  ]
  assert.equal(compare(left, right), true)
  right[1].attrs.from = ['$thing2']
  assert.equal(compare(left, right, 'syntax'), false)
  right[1].attrs.from = ['$request']
  right[1].attrs.to = ['$thing2']
  assert.equal(compare(left, right), false)
  right[1].attrs.to = ['$thing7']
  right[1].attrs.kind = ['right_of']
  assert.equal(compare(left, right, 'syntax'), false)
})

test('projects optional classifiers and preserves explicit negative polarity', () => {
  const z3 = [
    n('c', 'clause', {form:'imperative', predicate:'"Make"', result_color:'green', act:'change',
      polarity:'positive', direct_object:'$e', result_complement:'"green"'}),
    n('e', 'entity', {head:'"fox"'})
  ]
  const prolog = [
    n('c', 'clause', {form:'imperative', predicate:'"Make"', direct_object:'$e', result_complement:'"green"'}),
    n('e', 'entity', {head:'"fox"', kind:'fox'})
  ]
  assert.equal(compare(z3, prolog), false)
  assert.equal(compare(z3, prolog, 'syntax'), true)
  z3[0].attrs.polarity = ['negative']
  assert.equal(compare(z3, prolog, 'syntax'), false)
})

test('normalizes conjunction aliases but keeps explicit sequence ordering', () => {
  const nodes = [
    n('c1', 'clause', {form:'imperative', predicate:'"Open"'}),
    n('c2', 'clause', {form:'imperative', predicate:'"close"'})
  ]
  const withGroup = (kind, member) => [
    ...nodes, n('g', 'coordination', {kind, member, cue:'"and"'})
  ]
  assert.equal(compare(withGroup('additive', ['$c1','$c2']), withGroup('conjunctive', ['$c2','$c1']), 'syntax'), true)
  assert.equal(compare(withGroup('sequence', ['$c1','$c2']), withGroup('sequence', ['$c2','$c1']), 'syntax'), false)
})

test('exact matching distinguishes color-refinement ties', () => {
  const graph = permutation => permutation.map((target, id) =>
    n(String(id), 'clause', {form:'fragment', clausal_complement:'$' + target}))
  assert.equal(compare(graph([1,2,3,0]), graph([3,0,1,2])), true)
  assert.equal(compare(graph([1,2,3,0]), graph([1,0,3,2])), false)
})
