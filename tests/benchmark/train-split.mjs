import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'

export const splitVersion = 'nfkc-lowercase-whitespace-v1'

export function normalizeSplitText(text) {
  return text.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ')
}

function git(dataset, ...args) {
  return execFileSync('git', ['-C', dataset, ...args], {
    encoding: 'utf8', maxBuffer: 128 * 1024 * 1024
  })
}

export function datasetRevision(dataset, revision = 'HEAD') {
  return git(dataset, 'rev-parse', '--verify', revision + '^{commit}').trim()
}

export async function* readCommittedRows(dataset, revision) {
  const parser = git(dataset, 'show', revision + ':tools/rows.mjs')
  const {readRecords} = await import('data:text/javascript;base64,' + Buffer.from(parser).toString('base64'))
  for (const file of git(dataset, 'ls-tree', '-r', '--name-only', revision).split('\n')) {
    if (!/\.csv$/.test(file)) continue
    const parsed = readRecords(git(dataset, 'show', revision + ':' + file))
    if (!parsed.ok) throw Error(file + ': ' + parsed.why)
    for (const row of parsed.records) {
      yield {id: file + '#' + row.record, text: row.text, references: row.circuits.map(circuit => circuit.sop)}
    }
  }
}

export async function splitTrainingRows(committedRows, evaluationRows) {
  const expectedById = new Map(evaluationRows.map(row => [row.id, row]))
  const evaluationTexts = new Set(evaluationRows.map(row => normalizeSplitText(row.text)))
  const training = []
  const trainingTexts = new Set()
  const trainingHash = createHash('sha256')
  const excludedHash = createHash('sha256')
  let population = 0
  let excludedRows = 0
  let excludedCircuits = 0
  let trainingCircuits = 0
  for await (const row of committedRows) {
    population++
    const expected = expectedById.get(row.id)
    if (expected) {
      if (row.text !== expected.text || JSON.stringify(row.references) !== JSON.stringify(expected.references)) {
        throw Error('Evaluation sample differs from the committed dataset at ' + row.id)
      }
      expectedById.delete(row.id)
    }
    const key = normalizeSplitText(row.text)
    const serialized = JSON.stringify(row) + '\n'
    if (evaluationTexts.has(key)) {
      excludedRows++
      excludedCircuits += row.references.length
      excludedHash.update(serialized)
      continue
    }
    training.push(row)
    trainingTexts.add(key)
    trainingCircuits += row.references.length
    trainingHash.update(serialized)
  }
  if (expectedById.size) throw Error('Missing committed evaluation row: ' + expectedById.keys().next().value)
  if (!training.length) throw Error('No dataset rows remain after excluding the evaluation texts.')
  const overlap = [...evaluationTexts].filter(key => trainingTexts.has(key)).length
  if (overlap) throw Error('Training/evaluation text overlap: ' + overlap)
  return {
    training,
    metadata: {
      splitVersion, population, evaluationRows: evaluationRows.length, evaluationTexts: evaluationTexts.size,
      excludedRows, excludedCircuits, trainingRows: training.length, trainingTexts: trainingTexts.size,
      trainingCircuits, normalizedTextOverlap: overlap,
      evaluationSha256: createHash('sha256').update(JSON.stringify(evaluationRows)).digest('hex'),
      trainingSha256: trainingHash.digest('hex'), excludedSha256: excludedHash.digest('hex')
    }
  }
}
