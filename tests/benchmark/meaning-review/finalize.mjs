// Apply completed text-first judgments to the frozen candidate sets. Accept an
// L10 only when a separate judgment confirms the same whole circuit.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {gzipSync,gunzipSync} from 'node:zlib'
import {createVerifier} from '../../../strategies/z3/src/verify/check.mjs'

const [run, review, installation, destination, ...manualFiles] = process.argv.slice(2)
const read = path => path.endsWith('.gz') ? gunzipSync(readFileSync(path)).toString() : readFileSync(path,'utf8')
const lines = path => read(path).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line))
const packed = JSON.parse(read(join(review,'packets.json.gz')))
const verifier = await createVerifier({knowledgeDir:resolve(installation)})
const engines = ['z3','prolog-worlds','prolog-example-transfer']
const predictions = Object.fromEntries(engines.map(engine=>[engine,new Map(
  lines(join(run,engine+'.jsonl.gz')).map(r=>[r.id,r])
)]))
const primary = new Map()
for (const judgment of lines(join(review,'full.jsonl'))) {
  const key = judgment.rowIndex + '/' + judgment.group
  if (primary.has(key)) throw Error('Duplicate primary group '+key)
  primary.set(key,judgment)
}
const strictPath = join(review,'strict.jsonl')
const strict = existsSync(strictPath) ? lines(strictPath) : []
const originalPrimary = [...primary.values()]
for (const j of strict) {
  const key = j.rowIndex + '/' + j.group
  if (!primary.has(key)) throw Error('Unexpected strict group '+key)
  primary.set(key,j)
}
const confirmed = new Map(lines(join(review,'confirmation.jsonl')).map(j=>[j.rowIndex+'/'+j.candidate,j]))
const rescues = new Map()
if (existsSync(join(review,'rescue.jsonl'))) for (const j of lines(join(review,'rescue.jsonl'))) {
  const previous = rescues.get(j.rowIndex) ?? []
  previous.push(j)
  rescues.set(j.rowIndex,previous)
}
const screening = Object.fromEntries(engines.map(engine=>[engine,new Map(
  lines(join(run,engine+'-grades.jsonl.gz')).map(r=>[r.id,r])
)]))
const manuals = new Map()
for (const file of manualFiles) for (const j of lines(file)) {
  const list = manuals.get(j.id) ?? []
  list.push(j)
  manuals.set(j.id,list)
}
const legacy = {L0:0,L1a:1,L1b:2,L1c:3,L1d:4,L2a:5,L2b:6,L2c:7,L3:9,L4:8}
const normalizeSop = sop => sop.replace(/\r\n?/g,'\n').trim()
const tags = ['no-usable-reading','intent-or-polarity','target-or-endpoint','detail-role-or-scope',
  'unsupported-addition','missing-step','missing-participant','missing-key-or-value']
const final = [], corrections = []
for (const p of packed) {
  const sop = candidate => p.circuits[candidate].map(i=>p.lines[i]).join('\n')
  const referenceSet = new Set(p.references.map(i=>normalizeSop(sop(i))))
  const witnesses = new Map()
  function nominate(j,source) {
    if (!Number.isInteger(j.grade) || j.grade<0 || j.grade>10) throw Error('Invalid grade '+p.id)
    if (j.candidate == null || j.candidate === -1) {
      if (j.grade !== 0) throw Error('Missing witness '+p.id)
      return
    }
    const index = j.candidate
    if (!p.circuits[index]) throw Error('Unknown candidate '+p.id)
    const key = p.rowIndex+'/'+index
    const confirm = confirmed.get(key)
    if (j.grade === 10 && !confirm) throw Error('Unconfirmed L10 '+key)
    const verdict = confirm ?? j
    let grade = verdict.grade
    const exact = referenceSet.has(normalizeSop(sop(index)))
    if (grade >= 8 && grade < 10) grade = exact ? 9 : 8
    if (grade === 10 && (exact || !confirm?.referenceIssue)) throw Error('Invalid correction '+key)
    const value = {grade,candidate:index,reason:verdict.reason,
      source:confirm?'independent-confirmation':source,
      ...(grade===10?{referenceIssue:confirm.referenceIssue}:{})}
    const previous = witnesses.get(index)
    // Retain the independent judgment on disputed nominations. Otherwise the
    // same complete, valid witness can support every engine that emitted it.
    if (!previous || value.grade>previous.grade || (value.grade===previous.grade && source==='targeted-review')) {
      witnesses.set(index,value)
    }
  }
  for (const [group,eligible] of Object.entries(p.groups)) {
    const j = primary.get(p.rowIndex+'/'+group)
    if (!j && eligible.length) throw Error('Missing primary judgment '+p.id+'/'+group)
    if (!j) continue
    if (j.candidate!=null && j.candidate!==-1 && !eligible.includes(j.candidate)) throw Error('Primary witness outside set '+p.id)
    nominate(j,'batch-review')
  }
  for (const j of rescues.get(p.rowIndex) ?? []) {
    if (j.candidate!=null && !p.groups[j.group]?.includes(j.candidate)) throw Error('Rescue witness outside set '+p.id)
    nominate(j,'alternative-witness-review')
  }
  for (const j of manuals.get(p.id) ?? []) {
    const membership = p.memberships[j.engine]
    if (!membership) throw Error('Unknown reviewed engine '+j.engine)
    const candidate = membership.original[j.candidateIndex]
    if (j.candidateIndex!=null && candidate!==undefined && p.groups[membership.key].includes(candidate)) {
      nominate({grade:legacy[j.grade],candidate,reason:j.reason},'targeted-review')
    }
  }
  for (const [index,j] of witnesses) if (j.grade === 10) {
    const proposedBy = engines.filter(engine=>p.memberships[engine].original.includes(index))
    corrections.push({id:p.id,text:p.text,proposedBy,candidate:sop(index),references:p.references.map(sop),
      reason:j.reason,referenceIssue:j.referenceIssue})
  }
  const validationCache = new Map()
  for (const engine of engines) {
    const pred = predictions[engine].get(p.id)
    const membership = p.memberships[engine]
    const eligible = p.groups[membership.key]
    const primaryOfSet = primary.get(p.rowIndex+'/'+membership.key)
    const choices = eligible.map(i=>witnesses.get(i)).filter(Boolean)
    choices.sort((a,b)=>b.grade-a.grade || Number(b.candidate===primaryOfSet?.candidate)-Number(a.candidate===primaryOfSet?.candidate) || a.candidate-b.candidate)
    const selected = choices[0]
    const grade = selected?.grade ?? 0
    const candidateIndex = selected ? membership.original.indexOf(selected.candidate) : null
    const diagnostics = []
    if (screening[engine].get(p.id)?.grade==='invalidReference') diagnostics.push('reference.failed-legacy-verifier')
    if (grade===10) diagnostics.push('reference.confirmed-material-defect')
    if (pred.error) diagnostics.push('engine.error')
    if (!pred.candidates.length) diagnostics.push('engine.empty-output')
    if (pred.candidates.length && !eligible.length) {
      const parses = pred.candidates.some(s=>{try{return verifier.parse(s).length>0}catch{return false}})
      diagnostics.push(parses?'schema.no-valid-candidate':'syntax.no-parseable-candidate')
    }
    if (pred.syntax?.check?.ok===false) diagnostics.push('syntax.source-check-failed')
    if (grade<8) diagnostics.push(tags[grade])
    if (grade===0 && eligible.length) diagnostics.push('meaning.no-usable-candidate')
    if (selected) {
      if (!validationCache.has(selected.candidate)) validationCache.set(selected.candidate,verifier.check(p.text,sop(selected.candidate)))
      const result = validationCache.get(selected.candidate)
      if (!result.schemaValid) throw Error('Structurally invalid chosen candidate '+p.id)
      for (const err of result.errors) diagnostics.push('verifier.'+err.why)
    }
    const defaultReason = pred.error ? 'Engine failure: '+pred.error : !pred.candidates.length ?
      'No circuit was emitted.' : !eligible.length ? 'No emitted circuit passed SOP parsing and structural validation.' :
      'The emitted set has no usable interpretation.'
    final.push({id:p.id,engine,grade,candidateIndex,reason:selected?.reason ?? (eligible.length ? primaryOfSet?.reason : null) ?? defaultReason,
      ...(selected?.referenceIssue?{referenceIssue:selected.referenceIssue}:{}),source:selected?.source ?? 'empty-or-unusable',
      diagnostics:[...new Set(diagnostics)]})
  }
}
if (final.length!==packed.length*engines.length) throw Error('Incomplete review')
mkdirSync(destination,{recursive:true})
function save(name,rows) {
  writeFileSync(join(destination,name),gzipSync(rows.map(row=>JSON.stringify(row)).join('\n')+'\n'))
}
save('final.jsonl.gz',final)
save('dataset-correction-candidates.jsonl.gz',corrections)
save('primary.jsonl.gz',originalPrimary)
if (strict.length) save('strict.jsonl.gz',strict)
save('confirmations.jsonl.gz',[...confirmed.values()])
save('targeted.jsonl.gz',[...manuals.values()].flat())
if (rescues.size) save('alternative-witness-reviews.jsonl.gz',[...rescues.values()].flat())
if (existsSync(join(review,'confirmation-audit.jsonl'))) save('confirmation-audit.jsonl.gz',lines(join(review,'confirmation-audit.jsonl')))
const examples = corrections.map(row=>[
  '## '+row.id,
  row.text,
  '**Proposed by** '+row.proposedBy.join(', '),
  '**Annotation issue** '+row.referenceIssue,
  '**Grounding** '+row.reason,
  '### Proposed circuit',
  '```sop\n'+row.candidate+'\n```',
  '### Existing reference circuits',
  ...row.references.map(ref=>'```sop\n'+ref+'\n```')
].join('\n\n'))
writeFileSync(join(destination,'dataset-corrections.md'),[
  '# Confirmed proposals for dataset review',
  'Each entry records a reviewed candidate that corrects a material issue in the supplied references. The dataset revision and row IDs belong to the frozen sample. Recheck the current row against its original text and all alternatives before applying a correction.',
  ...examples
].join('\n\n')+'\n')
console.log({messages:packed.length,decisions:final.length,correctionWitnesses:corrections.length})
