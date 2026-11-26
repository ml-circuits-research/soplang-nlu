import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync} from 'node:fs'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {gunzipSync,gzipSync} from 'node:zlib'
import {createAnalysisValidator,hasCompleteSource,sourceTokenMatches} from '../../lib/check-analysis.mjs'

const [hard,curated,original,providerSources,providerVotes,output,knowledgeDir] = process.argv.slice(2).map(resolvePath)
function resolvePath(value) { return resolve(value) }
if (!knowledgeDir) throw Error('Expected HARD_DIR CURATED_DIR ORIGINAL_DRAFTS.gz PROVIDER_SOURCES.gz PROVIDER_VOTES.gz OUTPUT_DIR KNOWLEDGE_DIR')
const read = name => readFileSync(name)
const json = name => JSON.parse(read(name))
const jsonl = name => gunzipSync(read(name)).toString().trim().split('\n').filter(Boolean).map(JSON.parse)
const key = (...parts) => JSON.stringify(parts)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const {parse} = await import(pathToFileURL(join(knowledgeDir,'tools/sopworld/sopworld.mjs')))
const validate = await createAnalysisValidator({knowledgeDir})
const anchors = {
  'nlu.clause':['predicate','expression','question','auxiliary','marker'],
  'nlu.entity':['head','name','pronoun','literal','quantity','modifier'],
  'nlu.relation':['cue'],
  'nlu.coordination':['cue']
}
const excluded = new Set(['unresolved','filler','terminator','separator'])
const anchorTarget = ['to','topic','member','subject','direct_object','from']
const sorted = iterable => [...iterable].sort()
function representation(text,sop) {
  const check = validate(text,sop,{alignSource:true})
  if (!check.valid) return null
  const lexical = sourceTokenMatches(text)
  const wires = parse(sop)
  const placements = new Map()
  for (const p of check.placements) {
    if (excluded.has(p.key) || !/[\p{L}\p{N}]/u.test(p.text)) continue
    if (!placements.has(p.wire)) placements.set(p.wire,[])
    placements.get(p.wire).push(p)
  }
  const ids = new Map()
  for (const wire of wires) {
    const claims = (placements.get(wire.id) ?? []).sort((a,b)=>a.start-b.start||a.end-b.end)
    const anchor = anchors[wire.type].map(slot=>claims.find(p=>p.key===slot)).find(Boolean) ?? claims[0]
    if (anchor) ids.set(wire.id,{type:wire.type,start:anchor.start,inferred:false})
  }
  // Cue-less nodes borrow the anchor of a directed operand. The node type
  // stays part of the identity. This tolerates ID changes without graph edit search.
  for(let iteration=0;iteration<wires.length;iteration++) {
    let progress = false
    for(const wire of wires) {
      if(ids.has(wire.id))continue
      const operand = anchorTarget.flatMap(slot=>wire.attrs[slot] ?? []).map(raw=>ids.get(raw.slice(1))).find(Boolean)
      if(operand) {
        ids.set(wire.id,{type:wire.type,start:operand.start,inferred:true})
        progress = true
      }
    }
    if(!progress)break
  }
  const literalSpans = new Set(),surfaceTokens = new Set(),nodeAnchors = new Set()
  const roles = new Map(),edges = new Map(),atoms = new Map()
  let unanchoredWires = 0
  const signature = entry=>key(entry.type,entry.start)
  for (const wire of wires) {
    const identity = ids.get(wire.id)
    if (!identity) {unanchoredWires++;continue}
    const node = signature(identity)
    nodeAnchors.add(node)
    for (const p of placements.get(wire.id) ?? []) {
      const span = key(p.start,p.end)
      literalSpans.add(span)
      for(let i=p.start;i<p.end;i++) if(/[\p{L}\p{N}]/u.test(lexical[i][0]))surfaceTokens.add(i)
      roles.set(key(node,p.key,p.start,p.end),{slot:p.key,span,node,source:p.text})
    }
    for(const [slot,values] of Object.entries(wire.attrs)) {
      for(const value of values) {
        if(value.startsWith('$')) {
          const target = ids.get(value.slice(1))
          if(target) edges.set(key(node,slot,signature(target)),{slot,node,to:signature(target),sourceType:wire.type})
        } else if(!value.startsWith('"')) {
          atoms.set(key(node,slot,value),{slot,value,node,sourceType:wire.type})
        }
      }
    }
  }
  const facts = new Set([...nodeAnchors].map(x=>'anchor:'+x))
  const coreFacts = new Set(facts)
  for(const [label,items] of [['role',roles],['edge',edges],['atom',atoms]]) {
    for(const [id,item] of items) {
      facts.add(label+':'+id)
      const optional = label==='atom' &&
        (['act','result_color','color'].includes(item.slot) ||
          (item.slot==='kind' && item.sourceType==='nlu.entity') ||
          (item.slot==='polarity' && item.value==='positive'))
      if(!optional)coreFacts.add(label+':'+id)
    }
  }
  return {check,literalSpans,surfaceTokens,nodeAnchors,roles,edges,atoms,facts,coreFacts,unanchoredWires,
    ambiguous:check.coverage.ambiguous.length>0}
}
const compare = (a,b) => ({draft:a.size,after:b.size,retained:[...a.keys()].filter(x=>b.has(x)).length})
function compareReading(text,draft,final) {
  const a = representation(text,draft), b = representation(text,final)
  assert.ok(b && hasCompleteSource(b.check))
  if (!a) return null
  const touched = ['literalSpans','surfaceTokens','nodeAnchors','roles','edges','atoms','facts','coreFacts']
  const metrics = Object.fromEntries(touched.map(name=>[name,compare(a[name],b[name])]))
  const facts = metrics.facts
  const addedRoles = [...b.roles].filter(([id])=>!a.roles.has(id)).map(([,item])=>item)
  const removedRoles = [...a.roles].filter(([id])=>!b.roles.has(id)).map(([,item])=>item)
  const addedEdges = [...b.edges].filter(([id])=>!a.edges.has(id)).map(([,item])=>item)
  const removedEdges = [...a.edges].filter(([id])=>!b.edges.has(id)).map(([,item])=>item)
  const factsChanged = facts.retained!==facts.draft || facts.retained!==facts.after
  const families = []
  if (metrics.surfaceTokens.after>metrics.surfaceTokens.retained) families.push('grounds new lexical tokens')
  if (removedRoles.some(r=>addedRoles.some(p=>p.span===r.span && p.slot!==r.slot))) families.push('relabels a literal span')
  if (removedRoles.some(r=>addedRoles.some(p=>p.span===r.span && p.slot===r.slot && p.node!==r.node))) families.push('moves a literal role to another anchor')
  if (removedEdges.some(r=>addedEdges.some(p=>p.slot===r.slot && (p.node===r.node || p.to===r.to)))) families.push('reattaches an existing role link')
  if (addedEdges.some(e=>['subject','direct_object','indirect_object','predicative_entity','clausal_complement'].includes(e.slot))) families.push('adds or changes a core clause argument')
  if (addedEdges.some(e=>['nlu.relation','nlu.coordination'].includes(e.sourceType)) ||
      removedEdges.some(e=>['nlu.relation','nlu.coordination'].includes(e.sourceType))) families.push('changes a relation or coordination link')
  const bySlot = atoms => new Map([...atoms.values()].filter(item=>item.sourceType==='nlu.clause')
    .map(item=>[key(item.node,item.slot),item.value]))
  const firstAtoms = bySlot(a.atoms), secondAtoms = bySlot(b.atoms)
  if ([...firstAtoms].some(([slot,value])=>{
    const role = JSON.parse(slot)[1]
    return ['form','polarity','completion','speech_act'].includes(role) && secondAtoms.has(slot) && secondAtoms.get(slot)!==value
  })) families.push('changes explicit clause status on a matched anchor')
  if (metrics.atoms.retained<Math.max(metrics.atoms.draft,metrics.atoms.after)) families.push('adds, drops or changes atom fields')
  const core = metrics.coreFacts
  return {metrics,factsChanged,editFraction:(facts.draft+facts.after-2*facts.retained)/(facts.draft+facts.after),
    coreEditFraction:(core.draft+core.after-2*core.retained)/(core.draft+core.after),
    ambiguous:a.ambiguous || b.ambiguous,unanchoredWires:a.unanchoredWires+b.unanchoredWires,families,
    addedRoleSlots:sorted(new Set(addedRoles.map(r=>r.slot))),addedEdgeSlots:sorted(new Set(addedEdges.map(r=>r.slot)))}
}
const batchRaw = read(original)
const curatedManifest = json(join(curated,'manifest.json'))
assert.equal(sha(batchRaw),curatedManifest.inputSha256)
const curatedAcceptedPath = join(curated,'accepted.jsonl.gz')
assert.equal(sha(read(curatedAcceptedPath)),json(join(curated,'curation-review-summary.json')).digests['accepted.jsonl.gz'])
const hardAcceptedPath = join(hard,'accepted-supervision.jsonl.gz')
assert.equal(sha(read(hardAcceptedPath)),json(join(hard,'accepted-manifest.json')).sha256)
const reserved = new Set(JSON.parse(gunzipSync(read(new URL('../../tests/benchmark/next-evaluation/reserved-exact-texts.json.gz',import.meta.url)))))
const trainingSources = new Map(jsonl(providerSources).map(r=>[r.id,r.text]))
const votes = new Map(jsonl(providerVotes).map(r=>[key(r.id,r.sop),r.accepted]))
const curatedVotes = new Map(jsonl(join(curated,'votes.jsonl.gz')).map(r=>[key(r.id,r.sop),r.accepted]))
const hardDrafts = jsonl(join(hard,'teacher-inputs.jsonl.gz'))
assert.equal(sha(read(join(hard,'teacher-inputs.jsonl.gz'))),json(join(hard,'verification.json')).inputSha256)
function sourceVerdict(id,text,sop) {
  const check = validate(text,sop)
  if(!hasCompleteSource(check)) return 'none'
  const known = votes.get(key(id,sop)) ?? curatedVotes.get(key(id,sop))
  return known===true?'any':known===false?'none':'unknown'
}
function cohort(name,drafts,accepted) {
  const byId = new Map(accepted.map(row=>[row.id,row]))
  const pairs = [],baseline = [],ranks = []
  for(const draft of drafts) {
    const {id,text,candidates} = draft
    assert.equal(trainingSources.get(id),text)
    assert.ok(!reserved.has(sha(text)))
    const final = byId.get(id)
    const states = candidates.map(({sop})=>sourceVerdict(id,text,sop))
    const set = states.includes('any')?'any':states.includes('unknown')?'unknown':'none'
    baseline.push({id,first:states[0]??'none',set,accepted:Boolean(final)})
    if(!final)continue
    assert.equal(final.text,text)
    for(const [rank,reading] of final.readings.entries()) {
      const best = candidates[0]?.sop
      const entry = {cohort:name,id,text,rank,teacherDraftIndex:reading.draftIndex,
        bestSop:best,finalSop:reading.sop,rawChanged:best!==reading.sop,
        baselineFirst:states[0]??'none',baselineSet:set,
        copiedSomeDraft:candidates.some(c=>c.sop===reading.sop)}
      if(best)Object.assign(entry,compareReading(text,best,reading.sop))
      pairs.push(entry)
    }
    ranks.push(final.readings.length)
  }
  assert.equal(ranks.length,accepted.length)
  return {name,pairs,baseline,ranks}
}
const hardRun = cohort('hard451',hardDrafts.map(r=>({id:r.id,text:r.text,candidates:[{sop:r.draftSop}]})),
  jsonl(hardAcceptedPath).map(r=>({...r,readings:[{sop:r.sop}]})))
const curatedRun = cohort('curated000001',jsonl(original),jsonl(curatedAcceptedPath))
const ratio = (a,b)=>b?a/b:null
const quantile = (values,p)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1]??null
const frequencies = list=>Object.fromEntries([...Map.groupBy(list,x=>x)].map(([kind,items])=>[kind,items.length]).sort((a,b)=>b[1]-a[1]))
function aggregate(rows) {
  const names = ['literalSpans','surfaceTokens','nodeAnchors','roles','edges','atoms','facts','coreFacts']
  const retention = Object.fromEntries(names.map(name=>{
    const sums = {draft:0,after:0,retained:0,definedRows:0}
    const perRow = []
    for(const row of rows) {
      const metric=row.metrics[name]
      for(const key of ['draft','after','retained'])sums[key]+=metric[key]
      if(metric.draft){sums.definedRows++;perRow.push(metric.retained/metric.draft)}
    }
    return [name,{...sums,draftRetained:ratio(sums.retained,sums.draft),
      finalPreviouslyPresent:ratio(sums.retained,sums.after),medianDraftRetained:quantile(perRow,.5)}]
  }))
  return {readings:rows.length,ambiguousPlacement:rows.filter(r=>r.ambiguous).length,
    anyUnanchoredWires:rows.filter(r=>r.unanchoredWires).length,
    editFraction:{p25:quantile(rows.map(r=>r.editFraction),.25),median:quantile(rows.map(r=>r.editFraction),.5),
      p75:quantile(rows.map(r=>r.editFraction),.75)},
    coreEditFraction:{median:quantile(rows.map(r=>r.coreEditFraction),.5)},
    retention,editFamilies:frequencies(rows.flatMap(r=>r.families)),
    addedRoleSlots:frequencies(rows.flatMap(r=>r.addedRoleSlots)),addedEdgeSlots:frequencies(rows.flatMap(r=>r.addedEdgeSlots))}
}
function summary(run) {
  const {pairs,baseline,ranks}=run
  const changed = pairs.filter(r=>r.factsChanged)
  const changedPrimary = changed.filter(r=>r.rank===0)
  const count = (scope,status)=>({texts:baseline.filter(row=>row[scope]===status).length,
    recovered:baseline.filter(row=>row[scope]===status&&row.accepted).length})
  return {sources:baseline.length,acceptedSources:ranks.length,acceptedReadings:pairs.length,
    exactBestDraftCopies:pairs.filter(r=>!r.rawChanged).length,
    changedStringsWithoutFactEdits:pairs.filter(r=>r.rawChanged&&r.factsChanged===false).length,
    invalidOrMissingBestDraft:pairs.filter(r=>!r.metrics).length,
    identicalToAnotherDraft:pairs.filter(r=>r.copiedSomeDraft&&r.rawChanged).length,
    baseline:Object.fromEntries(['first','set'].map(scope=>[scope,Object.fromEntries(['any','none','unknown'].map(status=>[status,count(scope,status)]))])),
    changedAll:aggregate(changed),
    changedPrimary:aggregate(changedPrimary),
    changedPrimaryNovelVersusAllDrafts:aggregate(changedPrimary.filter(r=>!r.copiedSomeDraft)),
    changedWithoutAmbiguousPlacements:aggregate(changedPrimary.filter(r=>!r.ambiguous))}
}
const outputs={hard451:summary(hardRun),curated000001:summary(curatedRun)}
const hardIds = new Set(hardRun.baseline.map(r=>r.id))
const overlap = curatedRun.baseline.filter(r=>hardIds.has(r.id)).length
writeFileSync(join(output,'summary.json'),JSON.stringify({inputs:{curatedDraftsSha256:sha(batchRaw),
  providerVotesSha256:sha(read(providerVotes)),providerSourcesSha256:sha(read(providerSources)),cohortOverlap:overlap},...outputs},null,2)+'\n')
writeFileSync(join(output,'paired-facts.jsonl.gz'),gzipSync([...hardRun.pairs,...curatedRun.pairs].map(JSON.stringify).join('\n')+'\n'))
console.log(JSON.stringify(Object.fromEntries(Object.entries(outputs).map(([name,s])=>[name,{
  sources:s.sources,exactCopies:s.exactBestDraftCopies,changed:s.changedAll.readings,
  editedPrimary:s.changedPrimary.readings,baseline:s.baseline,medianEdit:s.changedPrimary.editFraction.median}]))))
