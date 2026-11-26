// Mechanical screening for previously saved predictions. Final NLU grades require source-text review. Grading is timed
// separately so generation timings remain comparable across strategies.
import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {resolve, join} from 'node:path'
import {gunzipSync, gzipSync} from 'node:zlib'
import {fileURLToPath} from 'node:url'
import {compareProposals} from './webmeet/compare.mjs'
import {createVerifier} from '../../strategies/z3/src/verify/check.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const workspace = resolve(process.env.SOP_WORKSPACE ?? join(root, '..'))
const dir = resolve(process.argv[2])
const verifier = await createVerifier({knowledgeDir: process.env.KNOWLEDGE_DIR ?? join(workspace, 'sop-knowledge-worlds')})
const unpack = name => gunzipSync(readFileSync(join(dir, name))).toString()
const sample = JSON.parse(unpack('sample.json.gz'))
const diagnosticsById = new Map(sample.map(({id,text,references}) => [id,{id,text,references,engines:{}}]))
const summary = {}
const engines = ['z3','prolog-worlds','prolog-example-transfer'].filter(name => existsSync(join(dir,name+'.jsonl.gz')))
if (!engines.length) throw Error('No saved predictions in ' + dir)
const accepted = grade => grade === 'L3' || grade === 'L4'

for (const engine of engines) {
  const started = performance.now()
  const predictions = new Map(unpack(engine + '.jsonl.gz').trim().split('\n')
    .map(line => { const row = JSON.parse(line); return [row.id, row] }))
  const details = []
  const counts = {L0:0, L1:0, L2:0, L3:0, L4:0, invalidReference:0, readerError:0}
  const alternatives = {distinct:0,accepted:0,exactReferences:0,totalReferences:0}
  const syntax = {rows:0,passed:0,tokens:0,tokensWithPos:0,tokensInPhraseHypotheses:0}
  const grounding = {quotedKeys:0,unlocatedQuotedKeys:0,ambiguousQuotedKeys:0,invalidCandidates:0}
  const subgrades = {}
  for (const {id, text, references} of sample) {
    const row = predictions.get(id)
    if (!row) throw Error('Missing timing record: ' + id)
    if (row.syntax) {
      syntax.rows++
      if (row.syntax.check?.ok) syntax.passed++
      syntax.tokens += row.syntax.tokens
      syntax.tokensWithPos += row.syntax.tokensWithPos
      syntax.tokensInPhraseHypotheses += row.syntax.check?.tokensInPhraseHypotheses ?? 0
    }
    for (const candidate of row.candidateEvidence ?? []) {
      for (const entry of candidate.sourceEvidence ?? []) {
        if (entry.kind !== 'quoted') continue
        grounding.quotedKeys++
        if (!entry.ranges.length) grounding.unlocatedQuotedKeys++
        if (entry.ranges.length > 1) grounding.ambiguousQuotedKeys++
      }
    }
    const goldReferences = [...new Set(references)].sort().map((sop, i) => ({sop, column:String(i)}))
    const proposals = [...new Set(row.candidates)].sort()
    const options = {text,goldReferences,verifier}
    const result = compareProposals({...options,proposals})
    const grade = row.error ? 'readerError' : result.goldValid ? result.legendGrade : 'invalidReference'
    const category = grade.startsWith('L') ? grade.slice(0,2) : grade
    counts[category]++
    subgrades[grade] = (subgrades[grade] ?? 0) + 1
    let reasonable = 0
    for (const proposal of proposals) {
      const assessed = proposals.length === 1 ? result : compareProposals({...options,proposals:[proposal]})
      if (!assessed.predValid) grounding.invalidCandidates++
      if (assessed.goldValid && accepted(assessed.legendGrade)) reasonable++
    }
    alternatives.distinct += proposals.length
    alternatives.accepted += reasonable
    alternatives.exactReferences += row.comparison.matched
    alternatives.totalReferences += row.comparison.references
    const diagnostics = {grade, reasonableProposals:reasonable, reasons:result.predErrorReasons,
      referenceIssues:result.goldIssueReasons, errors:result.predCheck.errors, warnings:result.predCheck.warnings}
    details.push({id,...diagnostics})
    diagnosticsById.get(id).engines[engine] = {...diagnostics,candidates:proposals}
  }
  summary[engine] = counts
  writeFileSync(join(dir,engine+'-alternative-quality.json'), JSON.stringify({...alternatives,syntax,grounding,subgrades,evaluationMs:performance.now()-started},null,2)+'\n')
  writeFileSync(join(dir,engine+'-grades.jsonl.gz'),gzipSync(details.map(row => JSON.stringify(row)).join('\n')))
}

summary.pairedAcceptance = {}
for (const row of diagnosticsById.values()) {
  const passed = engines.filter(name => accepted(row.engines[name].grade)).join(' + ') || 'none'
  summary.pairedAcceptance[passed] = (summary.pairedAcceptance[passed] ?? 0) + 1
}
const failures = [...diagnosticsById.values()].filter(row =>
  Object.values(row.engines).some(result => !accepted(result.grade)))
for (let i = 0; i < failures.length; i += 1000) {
  const batch = failures.slice(i,i + 1000).map(row => JSON.stringify(row)).join('\n')
  writeFileSync(join(dir,'review-' + (1 + i / 1000) + '.jsonl.gz'),gzipSync(batch))
}
summary.reviewCases = failures.length
writeFileSync(join(dir,'grades.json'),JSON.stringify(summary,null,2)+'\n')
console.log('Mechanical WebMeet v1.2 screening. Source-text adjudication is required for final NLU v1 grades.',summary)
