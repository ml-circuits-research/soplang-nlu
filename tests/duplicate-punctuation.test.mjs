import test from 'node:test'
import assert from 'node:assert/strict'
import {removeSurplusPunctuation} from '../experiments/native-teacher/duplicate-punctuation.mjs'

test('keeps each sentence stop once when nested clauses duplicate it',()=>{
  const draft='@a nlu.clause form=declarative clausal_complement=$b terminator="."\n'+
    '@b nlu.clause form=nonfinite marker="to" predicate="go" terminator="."'
  const result=removeSurplusPunctuation('I want to go.',draft)
  assert.equal(result,draft.replace(' terminator="."',''))
})

test('leaves punctuation within source evidence and all explicit question marks',()=>{
  const draft='@a nlu.clause form=interrogative terminator="?" separator=","\n'+
    '@b nlu.entity literal="Tuesday, Thursday."'
  const result=removeSurplusPunctuation('Switch to "Tuesday, Thursday."?',draft)
  assert.equal(result,draft.replace(' separator=","',''))
})

test('restores only an unambiguous pair of written quotation marks',async()=>{
  const {restoreLiteralDelimiters}=await import('../experiments/native-teacher/duplicate-punctuation.mjs')
  const draft='@e nlu.entity literal="Good morning."'
  assert.equal(restoreLiteralDelimiters('Use "Good morning.".',draft),
    '@e nlu.entity literal='+JSON.stringify('"Good morning."'))
  assert.equal(restoreLiteralDelimiters('Use "Good morning." and remove "Good morning.".',draft),draft)
})
