import {createHash} from 'node:crypto'
import {existsSync, readFileSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {gunzipSync, gzipSync} from 'node:zlib'
import {matchReviewedReferences, nativeReferenceDigest} from '../native-references.mjs'

export const protocol = 'nlu-public-candidate-review-v1'
const protocolLock = new URL('../fresh-1pct.lock.json', import.meta.url)
const sha = value => createHash('sha256').update(value).digest('hex')
const archived = (path) => JSON.parse(gunzipSync(readFileSync(path)))
const write = (path, data) => writeFileSync(path, JSON.stringify(data,null,2)+'\n')
const compress = (path, data) => writeFileSync(path, gzipSync(JSON.stringify(data)))
const keys = (index, group) => index + ':' + group
const readJson = name => JSON.parse(readFileSync(name,'utf8'))
const passes = grade => grade === 8
const circuit = (packet, index) => packet.circuits[index].map(line => packet.lines[line]).join('\n')
const fingerprint = (packet, index) => sha(JSON.stringify([packet.text,circuit(packet,index)]))

function publicIndices(membership) {
  if (!Number.isSafeInteger(membership.returned) || membership.returned < 0 ||
      membership.returned > membership.original.length) throw Error('Invalid public candidate boundary.')
  return membership.original.slice(0,membership.returned)
}

export function planCandidates(packets) {
  const targets = []
  const seen = new Set()
  for (const row of packets) {
    const candidates = new Set()
    for (const membership of Object.values(row.memberships)) {
      const eligible = new Set(row.groups[membership.key])
      for (const index of publicIndices(membership)) {
        if (eligible.has(index)) candidates.add(index)
      }
    }
    const groups = {}
    for (const index of [...candidates].sort((a,b) => a-b)) {
      const id = fingerprint(row,index)
      if (seen.has(id)) continue
      seen.add(id)
      groups[String(index)] = [index]
    }
    if (Object.keys(groups).length) {
      targets.push({
        rowIndex:row.rowIndex, text:row.text, lines:row.lines, circuits:row.circuits,
        references:[], groups, staticJudgments:{}
      })
    }
  }
  return targets
}

function groupsOf(packets) {
  return packets.flatMap(packet => Object.entries(packet.groups).map(([group, [candidate]]) =>
    ({rowIndex:packet.rowIndex, group, candidate, fingerprint:fingerprint(packet,candidate)})))
}

function readJudgments(path, expected) {
  const bytes = readFileSync(path)
  const map = new Map()
  const byKey = new Map(expected.map(group => [keys(group.rowIndex,group.group),group]))
  for (const line of bytes.toString().split('\n')) {
    if (!line.trim()) continue
    const judgment = JSON.parse(line)
    const key = keys(judgment.rowIndex,judgment.group)
    const target = byKey.get(key)
    const {grade,candidate,reason,referenceIssue} = judgment
    if (!target || map.has(key) || !Number.isSafeInteger(grade) || grade < 0 || grade > 8 || grade === 2 ||
        candidate !== (grade === 0 ? null : target.candidate) || typeof reason !== 'string' ||
        !reason.trim() || (referenceIssue !== null && referenceIssue !== undefined)) {
      throw Error('Invalid or repeated decision in ' + path + ' for group ' + key)
    }
    map.set(key,judgment)
  }
  if (map.size !== byKey.size) throw Error('Review does not cover the complete planned set: ' + path)
  return {map,sha256:sha(bytes)}
}

export function selectAudit(groups, first, second, {seed, agreedAcceptSample, agreedRejectSample}) {
  const disputes = []
  const agreement = {accepted:[],rejected:[]}
  for (const group of groups) {
    const key = keys(group.rowIndex,group.group)
    const a = first.get(key)
    const b = second.get(key)
    if (!a || !b) throw Error('Incomplete primary or independent review for ' + key)
    if (passes(a.grade) !== passes(b.grade)) disputes.push({...group,stratum:'threshold disagreement'})
    else agreement[passes(a.grade) ? 'accepted' : 'rejected'].push(group)
  }
  const sample = (items, maximum, stratum) => items.map(group => ({
    ...group, stratum, score:sha(seed+'\0'+stratum+'\0'+group.fingerprint)
  })).sort((a,b) => a.score.localeCompare(b.score)).slice(0,maximum)
    .map(({score,...group}) => group)
  return [...disputes,
    ...sample(agreement.accepted,agreedAcceptSample,'agreed acceptance audit'),
    ...sample(agreement.rejected,agreedRejectSample,'agreed rejection audit')]
}

function auditPackets(candidatePackets, selection) {
  const selected = new Set(selection.map(group => keys(group.rowIndex,group.group)))
  return candidatePackets.flatMap(packet => {
    const groups = Object.fromEntries(Object.entries(packet.groups)
      .filter(([group]) => selected.has(keys(packet.rowIndex,group))))
    return Object.keys(groups).length ? [{...packet,groups}] : []
  })
}

export function reconcileCandidate(first, second, audit) {
  if (passes(first.grade) === passes(second.grade)) return first
  if (!audit) throw Error('A threshold disagreement lacks blind adjudication.')
  return audit
}

export function classifyPublicSets(packets, decisions, engines) {
  const rows = []
  for (const packet of packets) {
    for (const engine of engines) {
      const member = packet.memberships[engine]
      if (!member) throw Error('Missing strategy row ' + packet.id + ' ' + engine)
      const eligible = new Set(packet.groups[member.key])
      const publicCandidates = publicIndices(member).map(index => {
        let grade = 0
        let reason = 'The public proposal failed schema or source grounding.'
        let reviewed = false
        if (eligible.has(index)) {
          const id = fingerprint(packet,index)
          const result = decisions.get(id)
          if (!result) throw Error('No exact-circuit review for ' + packet.id + ' ' + engine)
          grade = result.grade
          reason = result.reason
          reviewed = true
        } else if (member.valid.includes(index)) {
          grade = 2
          reason = 'The grounded proposal leaves material source uncovered or unresolved.'
        }
        return {index,sop:circuit(packet,index),grade,reason,reviewed}
      })
      const accepted = publicCandidates.filter(candidate => passes(candidate.grade))
      const outcome = accepted.length === 0 ? 'none' : accepted.length === publicCandidates.length ? 'all' : 'some'
      const reviewed = publicCandidates.filter(candidate => candidate.reviewed)
      // Ranked cause only matters for NONE. A useful judged reading takes
      // precedence over static rejects. Serialization breaks a true tie.
      const bestFailure = (reviewed.length ? reviewed : publicCandidates).slice().sort((a,b) =>
        b.grade-a.grade || (a.sop < b.sop ? -1 : a.sop > b.sop ? 1 : 0))[0]
      const grade = outcome === 'all' ? 8 : outcome === 'some' ? 7 : Math.min(bestFailure?.grade ?? 0,6)
      rows.push({
        id:packet.id, rowIndex:packet.rowIndex, engine, text:packet.text, outcome, grade,
        reason:bestFailure?.reason ?? member.error ?? 'The strategy returned no public candidate.',
        publicCandidateSops:publicCandidates.map(candidate=>candidate.sop),
        acceptedCandidateSops:accepted.map(candidate=>candidate.sop), candidates:publicCandidates,
        readerError:member.error ?? null, savedRejectedCount:member.original.length-member.returned
      })
    }
  }
  return rows
}

export function distribution(keys, rows, select) {
  const counts = Object.fromEntries(keys.map(key => [key,0]))
  for (const row of rows) counts[select(row)]++
  if (!rows.length) return {counts,percentages:counts}
  const parts = keys.map((key,index) => ({
    key,index,value:Math.floor(10000*counts[key]/rows.length),remainder:(10000*counts[key])%rows.length
  }))
  let balance = 10000-parts.reduce((sum,item)=>sum+item.value,0)
  for (const part of [...parts].sort((a,b)=>b.remainder-a.remainder || a.index-b.index)) {
    if (!balance) break
    part.value++
    balance--
  }
  return {counts,percentages:Object.fromEntries(parts.map(part=>[part.key,part.value/100]))}
}

function main() {
  const [stage,reviewArg,runArg,subset] = process.argv.slice(2)
  if (!['plan','audit','score'].includes(stage) || !reviewArg || (stage === 'score' && !runArg)) {
    throw Error('Usage: node review-public-candidates.mjs plan|audit|score REVIEW_DIR [RUN_DIR [STRATEGIES]]')
  }
  const directory = resolve(reviewArg)
  const path = name => join(directory,name)
  const packets = archived(path('packets.json.gz'))
  const baseline = readJson(path('manifest.json'))
  const lock = readJson(protocolLock)
  if (baseline.packetsSha256 !== sha(readFileSync(path('packets.json.gz')))) throw Error('Prepared packets changed.')
  if (stage === 'plan') {
    const planned = planCandidates(packets)
    compress(path('candidate-packets.json.gz'),planned)
    const counts = {protocol,sample:packets.length,candidateReviewTargets:groupsOf(planned).length,
      sourceRowsWithTargets:planned.length, candidatePacketsSha256:sha(readFileSync(path('candidate-packets.json.gz'))),
      preparedPacketsSha256:baseline.packetsSha256}
    write(path('candidate-plan.json'),counts)
    console.log(JSON.stringify(counts))
    return
  }
  const plan = readJson(path('candidate-plan.json'))
  if (plan.preparedPacketsSha256 !== baseline.packetsSha256 ||
      plan.candidatePacketsSha256 !== sha(readFileSync(path('candidate-packets.json.gz')))) {
    throw Error('Candidate review plan does not match the prepared sample.')
  }
  const planned = archived(path('candidate-packets.json.gz'))
  const groups = groupsOf(planned)
  const first = readJudgments(path('primary.jsonl'),groups)
  const second = readJudgments(path('independent.jsonl'),groups)
  const selection = selectAudit(groups,first.map,second.map,{seed:lock.seed,...lock.audit})
  const audit = auditPackets(planned,selection)
  if (stage === 'audit') {
    write(path('audit-selection.json'),selection)
    compress(path('audit-packets.json.gz'),audit)
    console.log(JSON.stringify({disagreements:selection.filter(group=>group.stratum==='threshold disagreement').length,
      agreedCases:selection.filter(group=>group.stratum!=='threshold disagreement').length}))
    return
  }
  const auditFile = path('audit.jsonl')
  const third = selection.length ? readJudgments(auditFile,groupsOf(audit)) : {map:new Map(),sha256:null}
  const decisions = new Map()
  const auditReport = {thresholdDisagreements:0,exactGradeAgreements:0,
    agreementAuditCount:0,agreementAuditContradictions:0}
  for (const target of groups) {
    const key = keys(target.rowIndex,target.group)
    const a = first.map.get(key)
    const b = second.map.get(key)
    const c = third.map.get(key)
    if (a.grade === b.grade) auditReport.exactGradeAgreements++
    const disagreement = passes(a.grade) !== passes(b.grade)
    if (disagreement) auditReport.thresholdDisagreements++
    else if (c) {
      auditReport.agreementAuditCount++
      if (passes(a.grade) !== passes(c.grade)) auditReport.agreementAuditContradictions++
    }
    decisions.set(target.fingerprint,{...target,...reconcileCandidate(a,b,c),primary:a,independent:b,audit:c})
  }
  const run = resolve(runArg)
  const environment = readJson(join(run,'environment.json'))
  if (environment.sampleSha256 !== baseline.sampleSha256 || environment.sample !== packets.length) {
    throw Error('Review and timing sample do not match.')
  }
  const referencePath = join(run,'native-references.json.gz')
  const references = existsSync(referencePath) ? archived(referencePath) : []
  if ((environment.nativeReferenceTexts ?? 0) !== references.length ||
      (environment.nativeReferenceSha256 && environment.nativeReferenceSha256 !== nativeReferenceDigest(references))) {
    throw Error('The frozen reference snapshot does not match the run environment.')
  }
  const strategies = subset === undefined ? lock.strategyNames : subset.split(',')
  if (strategies.some(engine => !lock.strategyNames.includes(engine)) ||
      new Set(strategies).size !== strategies.length ||
      (subset !== undefined && (Object.keys(baseline.predictions).length !== strategies.length ||
        strategies.some(engine => !Object.hasOwn(baseline.predictions,engine))))) {
    throw Error('Invalid strategy subset for the prepared benchmark.')
  }
  const rows = matchReviewedReferences(classifyPublicSets(packets,decisions,strategies),references)
  const engines = Object.fromEntries(strategies.map(engine => {
    const observed = rows.filter(row=>row.engine===engine)
    const {workerTiming, ...timing} = readJson(join(run,engine+'.json'))
    return [engine,{
      outcomes:distribution(['none','some','all'],observed,row=>row.outcome),
      grades:distribution(Array.from({length:11},(_,grade)=>'L'+grade),observed,row=>'L'+row.grade),
      timing
    }]
  }))
  const trainingPath = join(run,'prolog-example-transfer-training.json')
  const reviewExecution = Object.fromEntries(['primary','independent','audit'].flatMap(stage => {
    const execution = path(stage+'-batches/execution.json')
    return existsSync(execution) ? [[stage,readJson(execution)]] : []
  }))
  const summary = {protocol, sample:packets.length, revision:environment.revision, seed:environment.seed,
    libraryRevision:environment.libraryRevision, knowledgeRevision:environment.knowledgeRevision,
    sampleSha256:environment.sampleSha256,
    frozenNativeReferenceTexts:references.length, candidateTargets:groups.length,
    audit:auditReport, reviewDigests:{primary:first.sha256,independent:second.sha256,audit:third.sha256},
    reviewExecution, engines, ...(existsSync(trainingPath) ? {training:readJson(trainingPath)} : {})}
  write(path('candidate-review-summary.json'),summary)
  writeFileSync(path('candidate-decisions.jsonl.gz'),gzipSync([...decisions.values()].map(row=>JSON.stringify(row)).join('\n')))
  writeFileSync(path('public-set-judgments.jsonl.gz'),gzipSync(rows.map(row=>JSON.stringify(row)).join('\n')))
  console.log(JSON.stringify(summary))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
