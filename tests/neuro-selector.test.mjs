import assert from 'node:assert/strict'
import {mkdtemp, writeFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {test} from 'node:test'
import {createReader} from '../lib/index.mjs'
import {neuroSelector} from '../strategies/neuro-selector/index.mjs'
import {selectorChoices} from '../strategies/neuro-selector/features.mjs'
import {openProposalPool} from '../strategies/neuro-selector/pool.mjs'

const knowledgeDir = process.env.SOP_KNOWLEDGE_DIR ??
  fileURLToPath(new URL('../../sop-knowledge-worlds', import.meta.url))
const swipl = process.env.SWIPL

test('neuro-selector emits exactly the circuit selected by the fitted policy', {
  skip: !swipl && 'Set SWIPL to test the optional Prolog family'
}, async () => {
  const text = 'Draw it.'
  const graph = [
    {i:0,text:'Draw',start:0,end:4,pos:'VERB',tag:'VB',dep:'ROOT',head:0,lemma:'draw'},
    {i:1,text:'it',start:5,end:7,pos:'PRON',tag:'PRP',dep:'dobj',head:0,lemma:'it'},
    {i:2,text:'.',start:7,end:8,pos:'PUNCT',tag:'.',dep:'punct',head:0,lemma:'.'}
  ]
  const syntaxModel = {async open() {
    return {async parse() {return graph}, async parseBeam() {return {tokens:graph,alternatives:[]}}, async close() {}}
  }}
  const options = {knowledgeDir,swipl,baseSyntaxModel:syntaxModel,adaptedSyntaxModel:syntaxModel,compactSyntaxModel:syntaxModel}
  const pool = await openProposalPool(options)
  let input
  try {
    const {parse} = await import(pathToFileURL(join(resolve(knowledgeDir),'tools/sopworld/sopworld.mjs')))
    input = selectorChoices(text,await pool.propose(text),parse)
  } finally { await pool.close() }
  assert.ok(input.candidates.length)
  const directory = await mkdtemp(join(tmpdir(),'sop-selector-'))
  const selectorModelPath = join(directory,'model.json')
  let reader
  try {
    await writeFile(selectorModelPath,JSON.stringify({
      format:'sop-proposal-ranker-v1',featureNames:input.featureNames,
      estimator:{type:'logistic',intercept:0,weights:input.featureNames.map(()=>0)},
      policy:{maxCandidates:1,minScore:0,maxSimilarity:1}
    }))
    reader = await createReader({strategy:neuroSelector,selectorModelPath,...options})
    const result = await reader.propose(text)
    assert.equal(result.engine,'neuro-selector')
    assert.equal(result.error,null)
    assert.equal(result.candidates.length,1)
    assert.equal(result.candidates[0].sop,input.candidates[0].sop)
    assert.equal(result.candidates[0].selectorScore,.5)
    assert.ok(result.candidates[0].check.valid)
    assert.match(result.analysisDiagnostics.modelSha256,/^[a-f0-9]{64}$/)
  } finally {
    await reader?.close()
    await rm(directory,{recursive:true,force:true})
  }
})
