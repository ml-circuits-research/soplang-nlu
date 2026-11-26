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

export function matchReviewedReferences(judgments, witnesses, references) {
  const byText = new Map(references.map(row => [row.text,new Set(row.references.map(normalizeCircuit))]))
  const matched = new Map()
  // The same accepted reading can support every strategy that actually emitted it.
  for (const witness of witnesses) {
    if (!byText.get(witness.text)?.has(normalizeCircuit(witness.sop))) continue
    for (const engine of witness.engines) matched.set(witness.id+'\0'+engine,witness.sop)
  }
  return judgments.map(row => {
    if (row.grade !== 8) return row
    const direct = byText.get(row.text)?.has(normalizeCircuit(row.sop)) ? row.sop : undefined
    const matchedReference = direct ?? matched.get(row.id+'\0'+row.engine)
    return matchedReference ? {...row, grade:9, matchedReference} : row
  })
}
