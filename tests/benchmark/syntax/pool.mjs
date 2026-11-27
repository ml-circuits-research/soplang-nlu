// One pool of judge packets for many rounds. After a batch settlement every round folder holds a
// few lines for a judge (the audit share); a judge per folder would be wasteful, so the lines are
// pooled into packets of the usual size and the verdicts are handed back to the folders.
//
//   node tests/benchmark/syntax/pool.mjs collect <pool-folder> [--size 170] <round-folder…>
//       Gathers every packet line of the round folders that has no verdict yet into
//       <pool>/packet-<k>.jsonl ({n, text, sop}), with RULES.md and a check script beside them, and
//       writes <pool>/key.jsonl: which round, packet and line each pooled line came from.
//   (judges write <pool>/verdicts-<k>.jsonl, as in a round)
//   node tests/benchmark/syntax/pool.mjs distribute <pool-folder>
//       Writes the pooled verdicts into the rounds' own judging/verdicts-<k>.jsonl files, each line
//       with the number it has in its round. A verdict a round already has is kept.
import {copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {readArguments, readJsonl, writeJsonl, GRADES} from './lib.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const {words, named} = readArguments(process.argv.slice(2))
const [command, poolArg, ...rounds] = words
if (!['collect', 'distribute'].includes(command) || !poolArg) {
  console.error('Usage: node tests/benchmark/syntax/pool.mjs collect <pool-folder> [--size 170] <round-folder…> | distribute <pool-folder>')
  process.exit(2)
}
const pool = resolve(poolArg)
const numbered = (dir, prefix) => existsSync(dir) ? readdirSync(dir).filter(name => new RegExp('^' + prefix + '-\\d+\\.jsonl$', 'u').test(name)).sort((a, b) => parseInt(a.split('-')[1]) - parseInt(b.split('-')[1])) : []

if (command === 'collect') {
  const size = Number(named.size ?? 170)
  const key = existsSync(join(pool, 'key.jsonl')) ? readJsonl(join(pool, 'key.jsonl')) : []
  const known = new Set(key.map(line => line.round + '\0' + line.packet + '\0' + line.line))
  const fresh = []
  for (const round of rounds.map(folder => resolve(folder))) {
    const judging = join(round, 'judging')
    for (const name of numbered(judging, 'packet')) {
      const k = parseInt(name.split('-')[1]), verdictFile = join(judging, 'verdicts-' + k + '.jsonl')
      const judged = new Set(existsSync(verdictFile) ? readJsonl(verdictFile).map(line => line.n) : [])
      for (const line of readJsonl(join(judging, name))) {
        if (judged.has(line.n) || known.has(round + '\0' + k + '\0' + line.n)) continue
        fresh.push({round, packet: k, line: line.n, text: line.text, sop: line.sop})
      }
    }
  }
  mkdirSync(pool, {recursive: true})
  let n = key.length, packet = numbered(pool, 'packet').length
  for (let at = 0; at < fresh.length; at += size) {
    packet++
    const part = fresh.slice(at, at + size).map(item => ({...item, n: ++n, pooled: packet}))
    writeJsonl(join(pool, 'packet-' + packet + '.jsonl'), part.map(({n, text, sop}) => ({n, text, sop})))
    key.push(...part.map(({n, pooled, round, packet: from, line}) => ({n, pooled, round, packet: from, line})))
  }
  writeJsonl(join(pool, 'key.jsonl'), key)
  copyFileSync(join(here, 'rules.md'), join(pool, 'RULES.md'))
  copyFileSync(join(here, 'check.mjs'), join(pool, 'check.mjs'))
  console.log(`${rounds.length} rounds: ${fresh.length} lines with no verdict pooled into ${Math.ceil(fresh.length / size)} new packets in ${pool} (${numbered(pool, 'packet').length} packets in all).`)
} else {
  const key = new Map(readJsonl(join(pool, 'key.jsonl')).map(line => [line.n, line]))
  const byFile = new Map()
  let read = 0, bad = 0
  for (const name of numbered(pool, 'verdicts')) for (const verdict of readJsonl(join(pool, name))) {
    const from = key.get(verdict.n)
    if (!from || !GRADES.includes(verdict.grade)) { bad++; continue }
    read++
    const file = join(from.round, 'judging', 'verdicts-' + from.packet + '.jsonl')
    byFile.set(file, [...(byFile.get(file) ?? []), {n: from.line, grade: verdict.grade, note: verdict.note ?? ''}])
  }
  let written = 0
  for (const [file, verdicts] of byFile) {
    const have = existsSync(file) ? readJsonl(file) : [], seen = new Set(have.map(line => line.n))
    const added = verdicts.filter(verdict => !seen.has(verdict.n))
    if (added.length) { writeJsonl(file, [...have, ...added].sort((a, b) => a.n - b.n)); written += added.length }
  }
  const waiting = key.size - read
  console.log(`${read} pooled verdicts read${bad ? ', ' + bad + ' lines with an unknown number or grade left out' : ''}: ${written} written into ${byFile.size} verdict files of the rounds. ${waiting} pooled lines still wait for a judge.`)
}
