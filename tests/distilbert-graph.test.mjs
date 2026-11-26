import assert from 'node:assert/strict'
import {test} from 'node:test'
import {join} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createAnalysisValidator,hasCompleteSource} from '../lib/check-analysis.mjs'
import {tokenizeSource,encodeGraph,renderGraph} from '../strategies/distilbert/graph.mjs'

const knowledgeDir=process.env.SOP_KNOWLEDGE_DIR ?? fileURLToPath(new URL('../../sop-knowledge-worlds',import.meta.url))
test('the native graph codec preserves graph roles, repeated occurrences and original Unicode',async()=>{
  const {parse}=await import(pathToFileURL(join(knowledgeDir,'tools/sopworld/sopworld.mjs')))
  const validate=await createAnalysisValidator({knowledgeDir})
  const text='Move É beside É!'
  const sop='@cmd nlu.clause form=imperative predicate="Move" direct_object=$first terminator="!"\n'+
    '@first nlu.entity name="É"\n@second nlu.entity name="É"\n'+
    '@placement nlu.relation kind=beside cue="beside" from=$cmd to=$second'
  const check=validate(text,sop,{alignSource:true})
  assert.ok(hasCompleteSource(check))
  const {tokens,nodes}=encodeGraph(text,sop,parse,check)
  assert.deepEqual(tokens.map(t=>t.text),['Move','É','beside','É','!'])
  assert.deepEqual(nodes.map(n=>n.anchor),[0,1,3,2])
  const out=renderGraph(text,tokens,nodes)
  assert.equal(out,sop.replaceAll('cmd','n1').replaceAll('first','n2').replaceAll('second','n3').replaceAll('placement','n4'))
  assert.ok(hasCompleteSource(validate(text,out)))
  assert.equal(validate(text,sop).placements,undefined)
})
test('worker spans count source tokens and never use subword or Unicode character offsets',()=>{
  const text='🙂 We’ll meet at 10:30.'
  const tokens=tokenizeSource(text)
  assert.deepEqual(tokens.map(t=>t.text),['🙂','We','’ll','meet','at','10:30','.'])
  assert.equal(text.slice(tokens[1].start,tokens[2].end),'We’ll')
  assert.throws(()=>renderGraph(text,tokens,[{type:'nlu.entity',anchor:1,attrs:[{key:'head',start:1,end:20}]}]),/span/)
})
