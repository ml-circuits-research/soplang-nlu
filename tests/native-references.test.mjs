import assert from 'node:assert/strict'
import test from 'node:test'
import {matchReviewedReferences} from './benchmark/native-references.mjs'

const text = 'Nothing!'
const one = '@c nlu.clause form=fragment terminator="!"'
const two = '@other nlu.clause form=fragment terminator="!"'
const refs = [{text, references: [one, two]}]
const reviewed = (publicCandidateSops, overrides = {}) =>
  ({text, engine:'p', grade:8, outcome:'all', publicCandidateSops, ...overrides})

test('L9 requires all acceptable and the complete exact frozen alternative set', () => {
  const rows = [
    reviewed([two, ' '+one+'\r\n', one]),
    reviewed([one]),
    reviewed([one,two,'extra']),
    reviewed([one,two], {grade:7,outcome:'mixed'}),
    reviewed([one,two], {text:'nothing!'}),
    reviewed([one,two], {grade:2,outcome:'none'})
  ]
  const result = matchReviewedReferences(rows,refs)
  assert.deepEqual(result.map(row=>row.grade),[9,8,8,7,8,2])
  assert.deepEqual(result[0].nativeReferenceSet,{expected:2,returned:2,exact:true,missing:0,novel:0})
  assert.equal(result[3].nativeReferenceSet.exact,true)
  assert.equal(result[4].nativeReferenceSet,undefined)
})

test('L10 cannot be assigned from an unattested or stale reference defect', () => {
  const row = reviewed(['replacement'])
  const proof = {text,independentlyConfirmed:true,reason:'Both references misunderstand the source.',
    defectiveReferences:[two,one],acceptableCandidates:['replacement']}
  assert.equal(matchReviewedReferences([row],refs,[proof])[0].grade,10)
  assert.equal(matchReviewedReferences([row],refs,[{...proof,independentlyConfirmed:false}])[0].grade,8)
  assert.equal(matchReviewedReferences([row],refs,[{...proof,defectiveReferences:[one]}])[0].grade,8)
  assert.equal(matchReviewedReferences([row],refs,[{...proof,acceptableCandidates:[one]}])[0].grade,8)
  assert.equal(matchReviewedReferences([{...row,outcome:'mixed',grade:7}],refs,[proof])[0].grade,7)
})
