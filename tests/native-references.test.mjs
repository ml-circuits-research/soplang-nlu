import assert from 'node:assert/strict'
import test from 'node:test'
import {matchReviewedReferences} from './benchmark/native-references.mjs'

test('native gold requires an accepted reading for the exact text and an emitting strategy', () => {
  const text = 'Nothing!'
  const sop = '@c nlu.clause form=fragment terminator="!"'
  const rows = [
    {id:'one',engine:'p',text,grade:8,sop:'another'},
    {id:'one',engine:'z',text,grade:8,sop:'another'},
    {id:'two',engine:'p',text:'nothing!',grade:8,sop},
    {id:'three',engine:'p',text,grade:2,sop}
  ]
  const evidence = [{id:'one',text,engines:['p'],sop}]
  const result = matchReviewedReferences(rows,evidence,[{text,references:[' '+sop+'\r\n']}])
  assert.deepEqual(result.map(row=>row.grade),[9,8,8,2])
  assert.equal(result[0].matchedReference,sop)
})
