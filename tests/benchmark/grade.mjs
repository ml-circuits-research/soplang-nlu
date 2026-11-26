// Grade an existing timing run. Both readers use the same legacy comparator.
import {readFileSync, writeFileSync} from 'node:fs'
import {resolve, join} from 'node:path'
import {gunzipSync, gzipSync} from 'node:zlib'
import {pathToFileURL, fileURLToPath} from 'node:url'
const root = fileURLToPath(new URL('../../', import.meta.url))
const workspace = resolve(process.env.SOP_WORKSPACE ?? join(root, '..'))
const dir = resolve(process.argv[2])
const load = path => import(pathToFileURL(join(workspace, path)))
const {compareProposals} = await load('z3-formaliser/eval/compare.mjs')
const {createVerifier} = await load('z3-formaliser/src/verify/check.mjs')
const verifier = await createVerifier({knowledgeDir: join(workspace, 'sop-knowledge-worlds')})
const unpack = name => gunzipSync(readFileSync(join(dir, name))).toString()
const sample = JSON.parse(unpack('sample.json.gz'))
const statusById = new Map(sample.map(row => [row.id, {}]))
const summary = {}
for (const engine of ['z3', 'prolog-worlds']) {
  const predictions = new Map(unpack(engine + '.jsonl.gz').trim().split('\n')
    .map(line => { const row = JSON.parse(line); return [row.id, row] }))
  const details = []
  const counts = {L0:0, L1:0, L2:0, L3:0, L4:0, missingReference:0, readerError:0}
  for (const {id, text, references} of sample) {
    const row = predictions.get(id)
    if (!row) throw Error('Missing timing record: ' + id)
    const goldReferences = [...new Set(references)].sort().map((sop, i) => ({sop, column:String(i)}))
    const result = compareProposals({text, goldReferences, proposals:[...new Set(row.candidates)].sort(), verifier})
    const grade = row.error ? 'readerError' : result.goldValid ? result.legendGrade : 'missingReference'
    const category = grade.startsWith('L') ? grade.slice(0,2) : grade
    counts[category]++
    statusById.get(id)[engine] = grade
    details.push({id, grade, reasons:result.predErrorReasons, referenceIssues:result.goldIssueReasons,
      errors:result.predCheck.errors, warnings:result.predCheck.warnings})
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
writeFileSync(join(dir, 'grades.json'), JSON.stringify(summary,null,2)+'\n')
console.log(summary)
