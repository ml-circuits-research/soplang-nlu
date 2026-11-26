import {readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {gunzipSync, gzipSync} from 'node:zlib'

const [directory, singletonPath] = process.argv.slice(2)
if (!directory) {
  throw Error('Usage: node accepted-native-witnesses.mjs REVIEW_DIR [SINGLETON.jsonl]')
}
const load = name => readFileSync(join(directory, name))
const packets = JSON.parse(gunzipSync(load('packets.json.gz')))
const readRows = bytes => bytes.toString().split('\n').filter(line => line.trim()).map(line => JSON.parse(line))
const settled = readRows(gunzipSync(load('native-judgments.jsonl.gz')))
const eligible = (packet, group, candidate) => packet.groups[group]?.includes(candidate)

const exactVotes = new Map()
const keyFor = (rowIndex, candidate) => rowIndex + ':' + candidate
const reviewerPasses = [['luna', 'luna.jsonl'], ['sol', 'sol.jsonl'], ['adjudicated', 'adjudicated.jsonl']]
for (const [reviewer, path] of reviewerPasses) {
  for (const vote of readRows(load(path))) {
    const {rowIndex, group, grade, reason, candidate} = vote
    const packet = packets[rowIndex]
    if (candidate === null || !eligible(packet, group, candidate)) continue
    const key = keyFor(rowIndex, candidate)
    const votes = exactVotes.get(key) ?? []
    votes.push({reviewer, group, grade, reason})
    exactVotes.set(key, votes)
  }
}
if (singletonPath) {
  for (const vote of readRows(readFileSync(singletonPath))) {
    const candidate = Number(vote.group)
    const entry = {reviewer: 'singleton', grade: vote.grade, reason: vote.reason}
    if (!Number.isSafeInteger(candidate) || (vote.grade > 0 && vote.candidate !== candidate)) {
      throw Error('Singleton witness does not match its reviewed candidate.')
    }
    const key = keyFor(vote.rowIndex, candidate)
    const votes = exactVotes.get(key) ?? []
    votes.push(entry)
    exactVotes.set(key, votes)
  }
}

const byWitness = new Map()
for (const {grade, rowIndex, candidate, engine, id, text, sop, check, reason} of settled) {
  if (grade !== 8) continue
  const key = keyFor(rowIndex, candidate)
  let item = byWitness.get(key)
  if (!item) {
    const votes = exactVotes.get(key) ?? []
    const supporters = [...new Set(votes.filter(vote => vote.grade === 8).map(vote => vote.reviewer))]
    const dissenters = [...new Set(votes.filter(vote => vote.grade < 8).map(vote => vote.reviewer))]
    const singleton = votes.find(vote => vote.reviewer === 'singleton')
    const confirmed = singleton ? singleton.grade === 8 && supporters.length >= 2
      : supporters.length >= 2 && dissenters.length === 0
    item = {id, rowIndex, candidate, text, sop, check, reason, engines: [], votes,
      exactSupporters: supporters, exactDissenters: dissenters, confirmed}
    byWitness.set(key, item)
  }
  item.engines.push(engine)
}
const witnesses = [...byWitness.values()]
writeFileSync(join(directory, 'accepted-witnesses.jsonl.gz'),
  gzipSync(witnesses.map(item => JSON.stringify(item)).join('\n')))
const target = new Map()
for (const item of witnesses) {
  if (item.confirmed) continue
  const original = packets[item.rowIndex]
  let packet = target.get(item.rowIndex)
  if (!packet) {
    packet = {...original, groups: {}, staticJudgments: {}}
    target.set(item.rowIndex, packet)
  }
  packet.groups[String(item.candidate)] = [item.candidate]
}
writeFileSync(join(directory, 'singleton-packets.json.gz'), gzipSync(JSON.stringify([...target.values()])))
const count = {acceptedWitnesses: witnesses.length, confirmed: witnesses.filter(item => item.confirmed).length,
  requiresConfirmation: witnesses.filter(item => !item.confirmed).length}
writeFileSync(join(directory, 'accepted-witness-counts.json'), JSON.stringify(count,null,2)+'\n')
console.log(JSON.stringify(count))
