import {test} from 'node:test'
import assert from 'node:assert/strict'
import {join} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {selectorChoices} from '../strategies/neuro-selector/features.mjs'
import {selectReadings} from '../strategies/neuro-selector/score.mjs'

const knowledge=process.env.SOP_KNOWLEDGE_DIR ?? fileURLToPath(new URL('../../sop-knowledge-worlds',import.meta.url))
const {parse}=await import(pathToFileURL(join(knowledge,'tools/sopworld/sopworld.mjs')))
const source='Move the ring near the box.'
const base='@a nlu.clause form=imperative predicate="Move" direct_object=$b terminator="."\n@b nlu.entity head="ring" determiner="the"\n@c nlu.entity head="box" determiner="the"\n@d nlu.relation kind=near from=$a to=$c cue="near"'
const variant=base.replace('from=$a','from=$b')
const renamed=base.replaceAll('@a ','@other ').replaceAll('$a ','$other ').split('\n').reverse().join('\n')
const offer=(sop,family,rank=0,eligible=true)=>({sop,family,rank,eligible})

test('proposal agreement preserves attachment differences across reordered and renamed wires',()=>{
  const list=[offer(base,'base-beam'),offer(base,'adapted-compact'),offer(renamed,'neuro-prolog'),
    offer(variant,'adapted-beam'),offer('not a circuit','base-beam',2,false)]
  const {featureNames,candidates}=selectorChoices(source,list,parse)
  assert.equal(candidates.length,3)
  assert.equal(candidates[0].features[featureNames.indexOf('exactFamilySupport')],2)
  assert.equal(candidates[0].similarity[1],1)
  assert.ok(candidates[0].similarity[2]<1)
})

test('portable selector applies its score, similarity threshold and hard public cap',()=>{
  const candidates=[.9,.8,.7,.6].map((x,i)=>({features:[x],similarity:[0,1,2,3].map(j=>i===j||i<2&&j<2?1:.4)}))
  const input={featureNames:['x'],candidates}
  const model={format:'sop-proposal-ranker-v1',featureNames:['x'],estimator:{type:'logistic',intercept:0,weights:[1]},
    policy:{maxCandidates:3,minScore:.2,maxSimilarity:.9}}
  assert.deepEqual(selectReadings(input,model).map(o=>o.index),[0,2,3])
  assert.deepEqual(selectReadings(input,{...model,policy:{...model.policy,minScore:1}}).map(o=>o.index),[0])
})
