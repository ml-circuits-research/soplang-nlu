import {readFileSync, writeFileSync, mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {gunzipSync, gzipSync} from 'node:zlib'
import {classifyPublicSets, distribution, reconcileCandidate} from '../../tests/benchmark/meaning-review/review-public-candidates.mjs'

const [run] = process.argv.slice(2)
const folder = join(run,'review')
const recheck = join(run,'gate-recheck')
const output = join(folder,'adjudicated')
const utf8 = path => readFileSync(path,'utf8')
const unpack = path => gunzipSync(readFileSync(path)).toString()
const lines = text => text.trim().split('\n').map(line=>JSON.parse(line))
const key = row => `${row.rowIndex}:${row.group}`
const packets = JSON.parse(unpack(join(folder,'packets.json.gz')))
const decisions = lines(unpack(join(folder,'candidate-decisions.jsonl.gz')))
const targets = decisions.filter(row=>row.grade===0 && /static eligib/i.test(row.reason))
const votes = ['primary','independent','adjudicator'].map(pass=>new Map(
  lines(utf8(join(recheck,pass+'.jsonl'))).map(row=>[key(row),row])))
if (votes.some(vote=>vote.size!==targets.length)) throw Error('Gate recheck does not cover all faulty decisions')
const overrides = new Map(targets.map(prior=>{
  const current = votes.map(vote=>vote.get(key(prior)))
  if (current.some(row=>!row || row.candidate!==Number(prior.group) ||
       ![1,3,4,5,6,7,8].includes(row.grade) || !row.reason.trim() || /static eligib/i.test(row.reason))) {
    throw Error('Invalid gate recheck for '+key(prior))
  }
  return [prior.fingerprint,{...reconcileCandidate(...current),fingerprint:prior.fingerprint,
    original:prior,gateRecheck:{primary:current[0],independent:current[1],adjudicator:current[2]}}]
}))
const merged = decisions.map(row=>overrides.get(row.fingerprint) ?? row)
const selected = new Map(merged.map(row=>[row.fingerprint,row]))
const summary = JSON.parse(utf8(join(folder,'candidate-review-summary.json')))
const strategies = Object.keys(summary.engines)
const rows = classifyPublicSets(packets,selected,strategies)
for (const strategy of strategies) {
  const observed = rows.filter(row=>row.engine===strategy)
  const engine = summary.engines[strategy]
  engine.outcomes = distribution(['none','some','all'],observed,row=>row.outcome)
  engine.grades = distribution(Array.from({length:11},(_,grade)=>'L'+grade),observed,row=>'L'+row.grade)
}
summary.gateRecheck = {targets:targets.length,accepted:[...overrides.values()].filter(row=>row.grade===8).length,
  thresholdDisagreements:[...overrides.values()].filter(row=>
    (row.gateRecheck.primary.grade===8)!==(row.gateRecheck.independent.grade===8)).length}
mkdirSync(output,{recursive:true})
writeFileSync(join(output,'candidate-review-summary.json'),JSON.stringify(summary,null,2)+'\n')
for (const [name,data] of [['candidate-decisions',merged],['public-set-judgments',rows]]) {
  writeFileSync(join(output,name+'.jsonl.gz'),gzipSync(data.map(row=>JSON.stringify(row)).join('\n')))
}
