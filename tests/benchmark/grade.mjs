// Grade an existing timing run. Both readers use the same legacy comparator.
import {readFileSync, writeFileSync} from 'node:fs'
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
const statusById = new Map(sample.map(row => [row.id, {}]))
const summary = {}
for (const engine of ['z3', 'prolog-worlds']) {
  const predictions = new Map(unpack(engine + '.jsonl.gz').trim().split('\n')
    .map(line => { const row = JSON.parse(line); return [row.id, row] }))
  const details = []
  const counts = {L0:0, L1:0, L2:0, L3:0, L4:0, invalidReference:0, readerError:0}
  for (const {id, text, references} of sample) {
    const row = predictions.get(id)
    if (!row) throw Error('Missing timing record: ' + id)
    const goldReferences = [...new Set(references)].sort().map((sop, i) => ({sop, column:String(i)}))
    const result = compareProposals({text, goldReferences, proposals:[...new Set(row.candidates)].sort(), verifier})
    const grade = row.error ? 'readerError' : result.goldValid ? result.legendGrade : 'invalidReference'
    const category = grade.startsWith('L') ? grade.slice(0,2) : grade
    counts[category]++
    statusById.get(id)[engine] = grade
    const diagnostics = {grade, reasons:result.predErrorReasons, referenceIssues:result.goldIssueReasons,
      errors:result.predCheck.errors, warnings:result.predCheck.warnings}
    details.push({id, ...diagnostics})
    diagnosticsById.get(id).engines[engine] = {...diagnostics, candidates:row.candidates}
  }
  summary[engine] = counts
  writeFileSync(join(dir, engine + '-grades.jsonl.gz'), gzipSync(details.map(row => JSON.stringify(row)).join('\n')))
}
const worlds = {both:0,z3Only:0,prologOnly:0,neither:0}
for (const entry of statusById.values()) {
  const passed = engine => ['L3','L4'].includes(entry[engine])
  worlds[passed('z3') ? (passed('prolog-worlds') ? 'both' : 'z3Only') : (passed('prolog-worlds') ? 'prologOnly' : 'neither')]++
}
summary.pairedAcceptance = worlds
const failures = [...diagnosticsById.values()].filter(row =>
  Object.values(row.engines).some(result => !['L3','L4'].includes(result.grade)))
for (let i = 0; i < failures.length; i += 1000) {
  const batch = failures.slice(i,i + 1000).map(row => JSON.stringify(row)).join('\n')
  writeFileSync(join(dir,'review-' + (1 + i / 1000) + '.jsonl.gz'), gzipSync(batch))
}
summary.reviewCases = failures.length
writeFileSync(join(dir, 'grades.json'), JSON.stringify(summary,null,2)+'\n')
console.log(summary)
