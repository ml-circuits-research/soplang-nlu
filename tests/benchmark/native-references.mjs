import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'

export const nativeReferencePath = 'annotations/nlu/v1/readings.jsonl'
export const normalizeCircuit = sop => sop.replace(/\r\n?/gu,'\n').trim()

// Only the evaluation parent reads this file. Worker messages contain id and text.
export function readNativeReferences(dataset, revision, texts) {
  const git = (...args) => execFileSync('git',['-C',dataset,...args],{encoding:'utf8',maxBuffer:128*1024*1024})
  if (!git('ls-tree','--name-only',revision,'--',nativeReferencePath).trim()) return []
  const selected = new Set(texts)
  const found = new Map()
  for (const line of git('show',revision+':'+nativeReferencePath).split('\n').filter(Boolean)) {
    const {text,readings} = JSON.parse(line)
    if (!selected.has(text)) continue
    if (found.has(text) || !Array.isArray(readings) || !readings.length) throw Error('Malformed native references for '+text)
    const references = readings.map(({sop}) => {
      if (typeof sop !== 'string' || !sop.trim()) throw Error('Empty native reference for '+text)
      return normalizeCircuit(sop)
    })
    found.set(text,{text,references:[...new Set(references)].sort()})
  }
  return [...found.values()]
}

export function nativeReferenceDigest(references) {
  return createHash('sha256').update(JSON.stringify(references)).digest('hex')
}

const normalizeSet = circuits => new Set(circuits.map(normalizeCircuit))
const sameSet = (a, b) => a.size === b.size && [...a].every(circuit => b.has(circuit))

export function matchReviewedReferences(judgments, references, confirmedDefects = []) {
  const byText = new Map(references.map(row => [row.text, normalizeSet(row.references)]))
  return judgments.map(row => {
    const expected = byText.get(row.text)
    if (!expected?.size || !Array.isArray(row.publicCandidateSops)) return row
    const returned = normalizeSet(row.publicCandidateSops)
    const exact = sameSet(expected, returned)
    const nativeReferenceSet = {
      expected: expected.size, returned: returned.size, exact,
      missing: [...expected].filter(circuit => !returned.has(circuit)).length,
      novel: [...returned].filter(circuit => !expected.has(circuit)).length
    }
    if (row.outcome !== 'all' || row.grade !== 8) return {...row, nativeReferenceSet}
    if (exact) return {...row, grade: 9, nativeReferenceSet}
    const confirmation = confirmedDefects.find(record => record.text === row.text &&
      record.independentlyConfirmed === true && typeof record.reason === 'string' && record.reason.trim() &&
      Array.isArray(record.defectiveReferences) && sameSet(normalizeSet(record.defectiveReferences), expected) &&
      Array.isArray(record.acceptableCandidates) && sameSet(normalizeSet(record.acceptableCandidates), returned))
    return confirmation
      ? {...row, grade: 10, nativeReferenceSet, referenceIssue: confirmation.reason}
      : {...row, nativeReferenceSet}
  })
}
