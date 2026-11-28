// node hardnotes.mjs <scratch> <step>: the standing rejections of the hard half, in group.mjs's notes format
import {readFileSync} from 'node:fs'
const [S, step] = process.argv.slice(2)
const sets = JSON.parse(readFileSync(S + '/cache/sets.json')), known = JSON.parse(readFileSync(S + '/cache/known.json')), hard = JSON.parse(readFileSync(S + '/hard.json'))
for (const s of ['fresh', 'freshb', 'vibe', 'audit']) {
  const now = new Map(readFileSync(`${S}/${s}-${step}.jsonl`, 'utf8').trim().split('\n').map(l => JSON.parse(l)).map(r => [r.key, r])), H = new Set(hard[s])
  for (const m of sets[s]) { if (!H.has(m.key)) continue; const c = now.get(m.key)?.core; const k = known[m.text]?.[c]; const g = c ? k?.grade ?? '?' : 'L0'
    if (['L8', 'L9', 'L10', '?'].includes(g)) continue; console.log(`${s}\t${m.n}${m.bucket ? ' b' + m.bucket : ''} ${g} ${m.text}`); console.log('\t' + (k?.note ?? '')) }
}
