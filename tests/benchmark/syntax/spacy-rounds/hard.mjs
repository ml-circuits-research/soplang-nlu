// node hard.mjs <scratch> <step> : hard-half acceptance (hmm-rules core differs from the spaCy core of the base step, r12 from round 13) per set
// writes <scratch>/hard.json: {set: [keys]} on first run (frozen from the base step)
import {readFileSync, writeFileSync, existsSync, createReadStream} from 'node:fs'
import {createInterface} from 'node:readline'
import {createGunzip} from 'node:zlib'
const R = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {normalForm, writtenAlike} = await import(R + 'tests/benchmark/syntax/lib.mjs')
const [S, step] = process.argv.slice(2)
const sets = JSON.parse(readFileSync(S + '/cache/sets.json')), known = JSON.parse(readFileSync(S + '/cache/known.json'))
const read = f => new Map(readFileSync(f, 'utf8').trim().split('\n').map(l => JSON.parse(l)).map(r => [r.key, r]))
const SETS = ['fresh', 'freshb', 'freshc', 'vibe', 'audit', 'wide', 'bench']
if (!existsSync(S + '/hard.json')) {
  const texts = new Set(SETS.flatMap(s => sets[s].map(m => m.text)))
  const hmm = new Map()
  const rl = createInterface({input: createReadStream(R + '.local-data/rvss/hmm-rules-all.jsonl.gz').pipe(createGunzip()), crlfDelay: Infinity})
  for await (const raw of rl) { if (!raw) continue; const r = JSON.parse(raw); if (texts.has(r.text) && !hmm.has(r.text)) hmm.set(r.text, r.sop ?? null) }
  const hard = {}
  for (const s of SETS) { const now = read(`${S}/${s}-r12.jsonl`); hard[s] = sets[s].filter(m => { const a = hmm.get(m.text) ? normalForm(m.text, hmm.get(m.text)) : null, b = now.get(m.key)?.sop ? normalForm(m.text, now.get(m.key).sop) : null; return !(a && b && writtenAlike(m.text, b, a, 'variants')) }).map(m => m.key) }
  writeFileSync(S + '/hard.json', JSON.stringify(hard))
}
const hard = JSON.parse(readFileSync(S + '/hard.json'))
for (const s of SETS) {
  const now = read(`${S}/${s}-${step}.jsonl`), H = new Set(hard[s]); const c = {all: [0, 0, 0], hard: [0, 0, 0]}
  for (const m of sets[s]) { const g = known[m.text]?.[now.get(m.key)?.core]?.grade ?? '?'; for (const k of H.has(m.key) ? ['all', 'hard'] : ['all']) { c[k][0]++; if (['L8', 'L9', 'L10'].includes(g)) c[k][1]++; else if (g === '?') c[k][2]++ } }
  const pct = ([n, ok, u]) => `${n} rows, ${ok} ok, ${u} unknown, ${(100 * ok / (n - u)).toFixed(1)}%`
  console.log(s.padEnd(7), 'all:', pct(c.all), '| hard:', pct(c.hard))
}
