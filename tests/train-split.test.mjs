import assert from 'node:assert/strict'
import test from 'node:test'
import {splitTrainingRows} from './benchmark/train-split.mjs'

test('keeps all training alternatives and excludes exact evaluation duplicates across files', async () => {
  const evalRow = {id: 'drawing/a.csv#1', text: 'A  CAT', references: ['eval-a', 'eval-b']}
  const equivalent = {id: 'document/b.csv#1', text: 'Ａ\tcat\u00a0', references: ['hidden-alt']}
  const trainRow = {id: 'document/b.csv#2', text: 'a dog', references: ['first', 'second']}
  const duplicate = {...evalRow,id:'calendar/b.csv#1'}
  const accentA = {id:'x#1',text:'é',references:['a']}
  const accentB = {id:'x#2',text:'e\u0301',references:['b']}
  const rows = [evalRow, equivalent, trainRow,duplicate,accentA,accentB]

  const {training, metadata} = await splitTrainingRows(rows, [evalRow,accentA])
  assert.deepEqual(training, [equivalent,trainRow,accentB])
  assert.equal(metadata.population, 6)
  assert.equal(metadata.trainingCircuits, 4)
  assert.equal(metadata.excludedRows, 3)
  assert.equal(metadata.excludedCircuits, 5)
  assert.equal(metadata.exactTextOverlap, 0)
  assert.deepEqual((await splitTrainingRows(rows, [evalRow,accentA])).metadata, metadata)
})

test('rejects an evaluation sample whose rows differ from the committed revision', async () => {
  const row = {id: 'drawing/a.csv#1', text: 'a cat', references: ['eval']}
  await assert.rejects(splitTrainingRows([row], [{...row, references: []}]), /differs/)
  await assert.rejects(splitTrainingRows([row], [{...row, id: 'document/missing.csv#1'}]), /Missing committed/)
})
