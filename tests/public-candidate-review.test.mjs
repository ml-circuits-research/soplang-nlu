import assert from 'node:assert/strict'
import test from 'node:test'
import {createHash} from 'node:crypto'
import {classifyPublicSets, distribution, planCandidates, reconcileCandidate, selectAudit} from './benchmark/meaning-review/review-public-candidates.mjs'

const hashed = (text,sop) => createHash('sha256').update(JSON.stringify([text,sop])).digest('hex')
const packet = (overrides = {}) => ({
  id:'test#1', rowIndex:0, text:'Move it.',
  lines:['whole passing circuit','whole wrong circuit','partial','saved rejected'],
  circuits:[[0],[1],[2],[3]], groups:{a:[0,1,3],b:[0],c:[]},
  memberships:{
    one:{key:'a',original:[2,1,0,3],returned:3,valid:[0,1,2,3]},
    two:{key:'b',original:[0],returned:1,valid:[0]},
    three:{key:'c',original:[],returned:0,valid:[]},
  },
  ...overrides
})
const grades = new Map([
  [hashed('Move it.','whole passing circuit'),{grade:8,reason:'The complete imperative has its object.'}],
  [hashed('Move it.','whole wrong circuit'),{grade:3,reason:'The proposed object is wrong.'}]
])

test('plans one singleton per exact source and eligible public circuit across all strategies', () => {
  const planned = planCandidates([
    packet(), packet({id:'test#2',rowIndex:1}), packet({id:'test#3',rowIndex:2,text:'Move it!'})
  ])
  assert.deepEqual(planned.map(({rowIndex,groups})=>({rowIndex,groups})),[
    {rowIndex:0,groups:{0:[0],1:[1]}}, {rowIndex:2,groups:{0:[0],1:[1]}}
  ])
  assert.ok(planned.every(row=>row.references.length===0 && !row.memberships))
})

test('grades NONE, SOME and ALL and excludes saved rejected proposals from public lists', () => {
  const [some, all, none] = classifyPublicSets([packet()],grades,['one','two','three'])
  assert.deepEqual([some.outcome,all.outcome,none.outcome],['some','all','none'])
  assert.deepEqual([some.grade,all.grade,none.grade],[7,8,0])
  assert.equal(some.savedRejectedCount,1)
  assert.deepEqual(some.candidates.map(candidate=>candidate.grade),[2,3,8])
  const reversed = packet()
  reversed.memberships.one.original = [0,1,2,3]
  assert.equal(classifyPublicSets([reversed],grades,['one'])[0].grade,7)
})

test('a static source gap produces L2 and a v2 qualifier omission maps to v3 L6', () => {
  const full = packet({groups:{a:[]}})
  const [partial] = classifyPublicSets([full],new Map(),['one'])
  assert.equal(partial.grade,2)
  const missed = new Map([[hashed('Move it.','whole passing circuit'),{grade:7,reason:'The explicit destination is missing.'}]])
  assert.equal(classifyPublicSets([packet()],missed,['two'])[0].grade,6)
})

test('audits every threshold dispute and deterministic agreement strata', () => {
  const groups = [0,1,2,3].map(rowIndex=>({rowIndex,group:'x',candidate:0,fingerprint:String(rowIndex)}))
  const initial = new Map([8,8,8,1].map((grade,index)=>[index+':x',{grade}]))
  const independent = new Map([7,8,8,3].map((grade,index)=>[index+':x',{grade}]))
  const options = {seed:'locked',agreedAcceptSample:1,agreedRejectSample:1}
  const chosen = selectAudit(groups,initial,independent,options)
  assert.deepEqual(chosen.map(group=>group.stratum),['threshold disagreement','agreed acceptance audit','agreed rejection audit'])
  assert.deepEqual(selectAudit([...groups].reverse(),initial,independent,options),chosen)
  assert.equal(reconcileCandidate(initial.get('0:x'),independent.get('0:x'),{grade:7}).grade,7)
  assert.equal(reconcileCandidate(initial.get('3:x'),independent.get('3:x'),{grade:8}).grade,1)
  assert.throws(()=>reconcileCandidate(initial.get('0:x'),independent.get('0:x')),/lacks blind adjudication/)
})

test('percentage apportionment preserves exactly 100 percent', () => {
  const result = distribution(['none','some','all'],['none','some','all'],value=>value)
  assert.deepEqual(result.percentages,{none:33.34,some:33.33,all:33.33})
})
