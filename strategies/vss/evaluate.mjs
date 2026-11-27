// Measure the reader against reviewed nlu circuits. The references are never read by the
// learning step: this file is the only place that opens them.
//   node strategies/vss/evaluate.mjs [--dataset ../webmeet-dataset] [--knowledge ../sop-knowledge-worlds]
//        [--model strategies/vss/model/model.json] [--part dev|test|all] [--errors file.md]
import {readFileSync, readdirSync, writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {dirname, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {hasCompleteSource} from '../../lib/check-analysis.mjs'
import {createComparer, overlap} from './compare.mjs'
import {createVssReader} from './src/reader.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const args = Object.fromEntries(process.argv.slice(2).join(' ').split(/\s*--/u).filter(Boolean).map(pair => pair.split(/\s+/u)))
const dataset = resolve(args.dataset ?? resolve(here, '../../../webmeet-dataset'))
const knowledgeDir = resolve(args.knowledge ?? process.env.SOP_KNOWLEDGE_DIR ?? resolve(here, '../../../sop-knowledge-worlds'))
const part = args.part ?? 'all'

const {describe, sameGraph} = await createComparer(knowledgeDir)
const without = new Set(String(args.without ?? '').split(',').filter(Boolean))
const reader = createVssReader(JSON.parse(readFileSync(resolve(args.model ?? join(here, 'model/model.json')), 'utf8')),
  {meanings: !without.has('meanings'), attachment: !without.has('attachment'), alternatives: !without.has('alternatives'), gapping: !without.has('gapping'), transfer: args.transfer === 'on', alike: args.alike, memory: !without.has('memory'), openers: !without.has('openers'), kinds: !without.has('kinds'), occurrence: !without.has('occurrence'), occurrenceWeight: args.sharp === undefined ? undefined : Number(args.sharp), memoryWeight: args.weight === undefined ? undefined : Number(args.weight)})
// --against <option>: the same texts read with one mechanism switched off, to count what it wins and what it breaks
const rival = args.against ? createVssReader(JSON.parse(readFileSync(resolve(args.model ?? join(here, 'model/model.json')), 'utf8')), {[args.against]: false}) : null
const duel = {better: [], worse: [], same: 0}

// references: one record per exact text. A fixed tenth (by hash) is the part looked at while
// developing; the rest is the test part.
const folder = join(dataset, 'annotations/nlu/v1')
const records = []
for (const file of [join(folder, 'readings.jsonl'), ...readdirSync(join(folder, 'batches')).filter(name => name.endsWith('.jsonl')).sort().map(name => join(folder, 'batches', name))]) {
  for (const line of readFileSync(file, 'utf8').split('\n')) if (line.trim()) records.push(JSON.parse(line))
}
const isDev = text => parseInt(createHash('sha256').update(text).digest('hex').slice(0, 8), 16) % 10 === 0
const rows = records.filter(row => part === 'all' || (part === 'dev') === isDev(row.text)).slice(0, Number(args.limit ?? Infinity))

// Buckets of an independent review of this reader: how a reading stands against its closest
// reference once defensible differences of representation are merged, and how often judges
// accepted readings of each bucket. The weighted sum is a cheap stand-in for a judged round.
const roleClass = label => {
  const [, type, key] = label.split('.')
  if (type === 'entity') return ({compound: 'attr', modifier: 'attr', head: 'head', name: 'head', literal: 'head', pronoun: 'head', determiner: 'det', quantity: 'det', possessive_marker: 'det', degree: 'deg', adverb: 'adv', filler: 'fill', unresolved: 'UNRES'})[key]
  if (type === 'clause') return ({predicate: 'PRED', auxiliary: 'aux', negation: 'neg', marker: 'link', adverb: 'adv', particle: 'adv', expression: 'expr', filler: 'fill', separator: 'punct', terminator: 'punct', question: 'wh', result_complement: 'rc', degree: 'deg', connective: 'link', unresolved: 'UNRES'})[key]
  if (type === 'relation') return ({cue: 'link', adverb: 'adv', negation: 'neg'})[key]
  return 'link'
}
const ACCEPTED = {A: 0.93, B: 0.85, C: 0.72, D: 0.39, E: 0.05}
const sameSet = (x, y) => x.size === y.size && [...x].every(value => y.has(value))
function bucketOf(ours, theirs, marks) {
  let typed = true, predicates = true
  for (const [token, label] of theirs.labels) {
    const mine = ours?.labels.get(token)
    const wanted = marks.has(token) ? 'punct' : roleClass(label), got = !mine ? 'NONE' : marks.has(token) ? 'punct' : roleClass(mine)
    if (wanted === got) continue
    typed = false
    if ((wanted === 'PRED') !== (got === 'PRED')) predicates = false
  }
  if (!ours) return 'E'
  return typed && sameSet(ours.links, theirs.links) ? 'A' : typed && sameSet(ours.bare, theirs.bare) ? 'B' : typed ? 'C' : predicates ? 'D' : 'E'
}
const totals = () => ({buckets: {A: 0, B: 0, C: 0, D: 0, E: 0}, texts: 0, valid: 0, complete: 0, exact: 0, exactAny: 0, two: 0, tokens: 0, labelled: 0, sameLabel: 0, sameType: 0,
  entity: [0, 0, 0], link: [0, 0, 0], bare: [0, 0, 0], ms: 0})
const buckets = {all: totals(), 'up to 10 tokens': totals(), '11 to 25 tokens': totals(), 'over 25 tokens': totals()}
const misses = [], confusion = new Map(), linkMiss = new Map()
let shown
const dumped = new Map(), dumpRows = []
const wordsOf = new Map()
const sourceTokens = text => { const out = []; for (const m of text.matchAll(/[0-9]{4}-[0-9]{2}-[0-9]{2}(?![\p{L}\p{M}\p{N}_])|[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?(?![\p{L}\p{M}\p{N}_])|[+-]?(?:[0-9]+\.[0-9]+|\.[0-9]+)(?![\p{L}\p{M}\p{N}_])|[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*|[^\s]/gu)) { const c = /(?:n[’']t|[’'](?:s|d|m|re|ve|ll))$/iu.exec(m[0]); if (c?.index > 0) out.push(m[0].slice(0, c.index), m[0].slice(c.index)); else out.push(m[0]) } return out }
for (const row of rows) {
  const start = performance.now()
  const {analyses, tokens} = reader.analyse(row.text)
  const ms = performance.now() - start
  const length = tokens?.reduce((n, token) => n + token.last - token.first + 1, 0) ?? 0
  const targets = [buckets.all, buckets[length <= 10 ? 'up to 10 tokens' : length <= 25 ? '11 to 25 tokens' : 'over 25 tokens']]
  const references = [...new Set(row.readings.map(reading => reading.sop))]
  const first = analyses[0] ? describe(row.text, analyses[0].sop) : null
  const exact = Boolean(first) && references.some(reference => sameGraph(analyses[0].sop, reference))
  const exactAny = exact || analyses.slice(1).some(other => references.some(reference => sameGraph(other.sop, reference)))
  // the reference reading closest to the first analysis
  let best = null
  for (const reference of references) {
    const said = describe(row.text, reference)
    let same = 0, type = 0
    for (const [token, label] of said.labels) {
      if (first?.labels.get(token) === label) same++
      if (first?.labels.get(token)?.split('.')[1] === label.split('.')[1]) type++
    }
    const score = same + (first ? overlap(first.links, said.links) : 0)
    if (!best || score > best.score) best = {score, said, same, type, reference}
  }
  const marks = new Set()
  sourceTokens(row.text).forEach((surface, position) => { if (/^[^\p{L}\p{N}]+$/u.test(surface)) marks.add(position) })
  const bucket = bucketOf(first, best.said, marks)
  if (args.dump === bucket) {
    const words = sourceTokens(row.text), diffs = []
    for (const [token, label] of best.said.labels) {
      const mine = first?.labels.get(token)
      const wanted = marks.has(token) ? 'punct' : roleClass(label), got = !mine ? 'NONE' : marks.has(token) ? 'punct' : roleClass(mine)
      if (wanted !== got) { diffs.push(words[token] + ':' + wanted + '<-' + got); const key = wanted + '<-' + got; dumped.set(key, (dumped.get(key) ?? 0) + 1) }
    }
    dumpRows.push(row.text + '   {' + diffs.join(' ') + '}')
  }
  for (const total of targets) {
    total.buckets[bucket]++
    total.texts++
    total.ms += ms
    if (first?.check.valid) total.valid++
    if (first && hasCompleteSource(first.check)) total.complete++
    if (exact) total.exact++
    if (exactAny) total.exactAny++
    if (analyses.length > 1) total.two++
    total.tokens += length
    total.labelled += best.said.labels.size
    total.sameLabel += best.same
    total.sameType += best.type
    for (const [key, field] of [['entities', 'entity'], ['links', 'link'], ['bare', 'bare']]) {
      total[field][0] += first ? overlap(first[key], best.said[key]) : 0
      total[field][1] += first ? first[key].size : 0
      total[field][2] += best.said[key].size
    }
  }
  if (rival) {
    // per text: the links (with role) that each version shares with the closest reference
    const other = rival.analyse(row.text).analyses[0]
    if (other && first && other.sop !== analyses[0].sop) {
      const theirs = describe(row.text, other.sop)
      const f = said => { const hit = overlap(said.links, best.said.links); return said.links.size + best.said.links.size ? 2 * hit / (said.links.size + best.said.links.size) : 1 }
      const gain = f(first) - f(theirs)
      const entry = {text: row.text, gain, with: analyses[0].sop, without: other.sop}
      if (gain > 1e-9) duel.better.push(entry); else if (gain < -1e-9) duel.worse.push(entry); else duel.same++
    } else duel.same++
  }
  if (args.show && isDev(row.text)) {
    const wanted = String(args.show).replace(/_/gu, ' ')
    const source = [...row.text.matchAll(/\S+/gu)]
    for (const [token, label] of best.said.labels) {
      const ours = first?.labels.get(token) ?? '(none)'
      if ((label + ' <- ' + ours).replace('nlu.', '').replace('nlu.', '') === wanted && (shown = (shown ?? 0) + 1) <= Number(args.count ?? 25)) {
        console.log('#' + token + ' | ' + row.text + '\n     ' + reader.analyse(row.text).tokens.map((t, i, all) => t.text + '/' + reader.analyse(row.text).stations[i]).join(' '))
      }
    }
    if (wanted === 'incomplete' && first && !hasCompleteSource(first.check) && (shown = (shown ?? 0) + 1) <= Number(args.count ?? 25)) console.log(row.text + '\n   ' + JSON.stringify(first.check.coverage) + '\n' + analyses[0].sop)
  }
  if (args.confusion && isDev(row.text)) {
    for (const [token, label] of best.said.labels) {
      const ours = first?.labels.get(token) ?? '(none)'
      if (ours !== label) confusion.set(label + ' <- ' + ours, (confusion.get(label + ' <- ' + ours) ?? 0) + 1)
      if (ours !== label && args.words) { const key = (label + ' <- ' + ours).replace(/nlu\./gu, ''); const bag = wordsOf.get(key) ?? wordsOf.set(key, new Map()).get(key); const w = sourceTokens(row.text)[token]?.toLowerCase(); bag.set(w, (bag.get(w) ?? 0) + 1) }
    }
    for (const link of best.said.links) if (!first?.links.has(link)) { const key = 'missed ' + link.split(' ')[1]; linkMiss.set(key, (linkMiss.get(key) ?? 0) + 1) }
    for (const link of first?.links ?? []) if (!best.said.links.has(link)) { const key = 'extra ' + link.split(' ')[1]; linkMiss.set(key, (linkMiss.get(key) ?? 0) + 1) }
  }
  if (!exact && isDev(row.text)) misses.push({text: row.text, ours: analyses[0]?.sop ?? '(none)', reference: best.reference,
    findings: first?.check.valid ? null : first?.check.findings, coverage: first?.check.coverage})
}
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '-'
const f1 = ([hit, ours, theirs]) => { const p = hit / (ours || 1), r = hit / (theirs || 1); return `${pct(hit, ours)} / ${pct(hit, theirs)} / ${(p + r ? 200 * p * r / (p + r) : 0).toFixed(1)}` }
const report = Object.fromEntries(Object.entries(buckets).map(([name, t]) => [name, {
  texts: t.texts,
  'estimated acceptance (bucket proxy)': (100 * Object.entries(t.buckets).reduce((sum, [name, count]) => sum + ACCEPTED[name] * count, 0) / (t.texts || 1)).toFixed(1) + '%',
  'buckets A typed and linked like the reference / B same edges / C other edges / D a word typed differently / E a predicate missed or invented': Object.values(t.buckets).map(count => pct(count, t.texts)).join(' / '),
  'valid circuit': pct(t.valid, t.texts), 'every word accounted for': pct(t.complete, t.texts),
  'same graph as a reference (first reading)': pct(t.exact, t.texts), 'same graph (either reading)': pct(t.exactAny, t.texts),
  'texts with two readings': pct(t.two, t.texts),
  'token in the same slot as the reference': pct(t.sameLabel, t.labelled), 'token in the same kind of slot': pct(t.sameType, t.labelled),
  'entities precision / recall / F1': f1(t.entity), 'links with role P / R / F1': f1(t.link), 'links without role P / R / F1': f1(t.bare),
  'ms per text': (t.ms / (t.texts || 1)).toFixed(2)
}]))
console.log(JSON.stringify(args.brief ? {part, all: report.all} : {part, ...report}, null, 1))
if (args.words) for (const key of String(args.words).split(';')) console.log(key.replace(/_/gu, ' ') + ': ' + [...(wordsOf.get(key.replace(/_/gu, ' ')) ?? [])].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([w, c]) => w + ':' + c).join(' '))
if (args.confusion) {
  console.log([...confusion].sort((a, b) => b[1] - a[1]).slice(0, 45).map(([key, count]) => count + '  ' + key).join('\n'))
  console.log([...linkMiss].sort((a, b) => b[1] - a[1]).map(([key, count]) => count + '  ' + key).join('\n'))
}
if (args.dump) {
  console.log([...dumped].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([key, count]) => count + ' ' + key).join(' | '))
  const step = Math.max(1, Math.floor(dumpRows.length / Number(args.count ?? 40)))
  console.log(dumpRows.filter((_, k) => k % step === 0).slice(0, Number(args.count ?? 40)).join('\n'))
}
if (rival) {
  console.log(`with ${args.against} against without: closer to the reference on ${duel.better.length} texts, further on ${duel.worse.length}, unchanged on ${duel.same}`)
  for (const [name, list] of [['closer', duel.better], ['further', duel.worse]]) for (const entry of list.slice(0, Number(args.count ?? 4))) console.log(`\n[${name}] ${entry.text}\n--- with\n${entry.with}\n--- without\n${entry.without}`)
}
if (args.errors) {
  writeFileSync(resolve(args.errors), misses.slice(0, Number(args.count ?? 150)).map(miss =>
    `TEXT: ${miss.text}\n--- ours\n${miss.ours}\n--- reference\n${miss.reference}\n${miss.findings ? 'FINDINGS: ' + JSON.stringify(miss.findings) + '\n' : ''}`).join('\n'))
}
