import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {selectReadings} from '../../strategies/neuro-selector/score.mjs'

const [modelPath,inputPath,referencePath,outputPath]=process.argv.slice(2)
if(!modelPath||!inputPath||!referencePath)throw Error('Expected MODEL SPLIT_FEATURES PYTHON_SCORE_REPORT [OUTPUT]')
const bytes=readFileSync(modelPath)
const model=JSON.parse(bytes)
const digest=createHash('sha256').update(bytes).digest('hex')
const input=readFileSync(inputPath)
const rows=(inputPath.endsWith('.gz')?gunzipSync(input):input).toString().split('\n').filter(Boolean).map(JSON.parse)
const ref=JSON.parse(readFileSync(referencePath,'utf8'))
assert.equal(digest,ref.modelSha256)
assert.equal(rows.length,ref.decisions.length)
const counts={NONE:0,SOME:0,ALL:0}
let error=0,total=0,outputs=0,empty=0
for (const [index,row] of rows.entries()){
  const {id,candidates,split}=row
  const expected=ref.decisions[index]
  assert.equal(id,expected.id)
  assert.equal(split,ref.split)
  assert.equal(candidates.length,expected.scores.length)
  if(!candidates.length)empty++
  const result=selectReadings({featureNames:model.featureNames,candidates},model)
  const selected=result.map(c=>c.index)
  assert.deepEqual(selected,expected.selectedIndices,id)
  for (const [i,candidate] of candidates.entries()){
    // All candidates are scored independently of the selected public cap.
    // A single eligible candidate always returns its own probability.
    const [{probability}]=selectReadings({featureNames:model.featureNames,
      candidates:[{...candidate,similarity:[1]}]},model)
    const difference=Math.abs(probability-expected.scores[i])
    error=Math.max(error,difference)
    assert.ok(difference<=1e-12,id+' candidate '+i+' probability mismatch')
    total++
  }
  const accepted=selected.filter(i=>candidates[i].accepted).length
  const outcome=!accepted?'NONE':accepted===selected.length?'ALL':'SOME'
  assert.equal(outcome,expected.outcome,id)
  counts[outcome]++
  outputs+=selected.length
}
assert.deepEqual(counts,ref.summary.counts)
assert.equal(outputs/rows.length,ref.summary.averageCandidates)
const summary={modelSha256:digest,split:ref.split,rows:rows.length,checkedCandidateScores:total,
  emptyRows:empty,exactSelectionParity:rows.length,maxAbsoluteProbabilityError:error}
if(outputPath)writeFileSync(outputPath,JSON.stringify(summary,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(summary))
