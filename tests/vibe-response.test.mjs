import test from 'node:test'
import assert from 'node:assert/strict'
import {readVibeResponse} from '../experiments/native-teacher/vibe-response.mjs'

test('reads complete regular or fenced JSON',()=>{
  const input=JSON.stringify({results:[{index:0,readings:[]}]})
  assert.deepEqual(readVibeResponse(input),{results:[{index:0,readings:[]}]})
  assert.deepEqual(readVibeResponse('\x60\x60\x60json\n'+input+'\n\x60\x60\x60'),
    {results:[{index:0,readings:[]}]})
})

test('retains full rows from a truncated response and leaves the incomplete row out',()=>{
  const row={index:19,readings:[{sop:'literal="{looks like JSON} \\"'}]}
  const input='{"results":['+JSON.stringify(row)+',{"index":20,"readings":[{"sop":"unfinished'
  assert.deepEqual(readVibeResponse(input),{results:[row],partial:true})
  assert.throws(()=>readVibeResponse('{"results":[{"index":20,"readings":['))
})
