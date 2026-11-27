// Sort saved proposals of native circuits by how far an independent reading agrees with them.
//   node strategies/hmm-rules/triage.mjs --out <folder> [--dataset ../webmeet-dataset] [--knowledge ../sop-knowledge-worlds]
// For every text that has a proposal under annotations/nlu/v1/{conversions,raw-conversions}:
//   agree    an hmm-rules reading is the same graph as a proposal: two independent sources say the same
//   close    same slots for nearly every token and the same links; they differ in a detail
//   differ   the two readings disagree on structure: someone has to judge
//   defect   the proposal fails the static check (schema, source quotes, every word accounted for)
import {readFileSync, readdirSync, writeFileSync, mkdirSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createComparer, agreement} from './compare.mjs'
import {createHmmRulesReader} from './src/reader.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).join(' ').split(/\s*--/u).filter(Boolean).map(pair => pair.split(/\s+/u)))
const dataset = resolve(args.dataset ?? resolve(here, '../../../webmeet-dataset'))
const knowledgeDir = resolve(args.knowledge ?? process.env.SOP_KNOWLEDGE_DIR ?? resolve(here, '../../../sop-knowledge-worlds'))
const out = resolve(args.out)
const {describe, sameGraph} = await createComparer(knowledgeDir)
const reader = createHmmRulesReader(JSON.parse(readFileSync(resolve(args.model ?? join(here, 'model/model.json')), 'utf8')))

const folder = join(dataset, 'annotations/nlu/v1')
const proposals = new Map()
for (const kind of ['conversions', 'raw-conversions']) for (const model of readdirSync(join(folder, kind))) {
  for (const name of readdirSync(join(folder, kind, model)).sort()) {
    for (const line of gunzipSync(readFileSync(join(folder, kind, model, name))).toString().split('\n')) {
      if (!line.trim()) continue
      const row = JSON.parse(line)
      const entry = proposals.get(row.text) ?? proposals.set(row.text, {id: row.id, text: row.text, readings: [], sources: []}).get(row.text)
      for (const sop of row.readings ?? []) if (!entry.readings.includes(sop)) entry.readings.push(sop)
      entry.sources.push(`${kind}/${model}/${name}:${row.status}:${row.model}`)
    }
  }
}
const counts = {}, rows = []
const started = Date.now()
for (const entry of proposals.values()) {
  const ours = reader.analyse(entry.text).analyses.map(analysis => analysis.sop)
  const theirs = entry.readings.map(sop => ({sop, said: describe(entry.text, sop)}))
  let bucket, best = {slots: 0, links: 0}
  if (!theirs.length) bucket = 'empty'
  else if (!theirs.some(reading => reading.said.complete)) bucket = 'defect'
  else if (ours.some(sop => theirs.some(reading => sameGraph(sop, reading.sop)))) { bucket = 'agree'; best = {slots: 1, links: 1} }
  else {
    const first = ours[0] ? describe(entry.text, ours[0]) : null
    for (const reading of theirs) {
      if (!first || !reading.said.complete) continue
      const score = agreement(first, reading.said)
      if (score.slots + score.links > best.slots + best.links) best = score
    }
    bucket = best.slots >= 0.9 && best.links >= 0.99 ? 'close' : 'differ'
  }
  counts[bucket] = (counts[bucket] ?? 0) + 1
  rows.push({id: entry.id, bucket, slots: Number(best.slots.toFixed(3)), links: Number(best.links.toFixed(3)), text: entry.text, proposals: entry.readings, vss: ours, sources: entry.sources})
}
mkdirSync(out, {recursive: true})
writeFileSync(join(out, 'triage.jsonl'), rows.map(row => JSON.stringify(row)).join('\n') + '\n')
const summary = {texts: rows.length, ...counts, seconds: Number(((Date.now() - started) / 1000).toFixed(1))}
writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary))
