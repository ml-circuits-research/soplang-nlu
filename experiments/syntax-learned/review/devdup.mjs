import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
const S = '/tmp/claude-1000/-home-salboaie-work-sopworlds/e235462f-8553-42ea-b357-85307b023a32/scratchpad/learned/'
const lines = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const alnum = t => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
const wordsLow = t => t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
const template = t => t.replace(/\d+/gu, '#').replace(/\b\p{Lu}[\p{L}]*/gu, 'X').toLowerCase().replace(/\s+/gu, ' ').trim()
const del1 = s => { const o = new Set([s]); for (let i = 0; i < s.length; i++) o.add(s.slice(0, i) + s.slice(i + 1)); return o }
const wdel1 = ws => { const o = new Set([ws.join(' ')]); for (let i = 0; i < ws.length; i++) o.add(ws.slice(0, i).concat(ws.slice(i + 1)).join(' ')); return o }
const data = JSON.parse(gunzipSync(readFileSync(S + 'parser/data2.json.gz')))
const train = data.filter(x => x.split === 'train' && x.heads && x.proj).map(x => x.text)
const c1 = new Set(), w1 = new Set(), tp = new Set()
for (const t of train) { const a = alnum(t); if (a.length >= 12) for (const k of del1(a)) c1.add(k); const ws = wordsLow(t); if (ws.length >= 5) for (const k of wdel1(ws)) w1.add(k); tp.add(template(t)) }
const near = t => { const a = alnum(t); if (a.length >= 12 && [...del1(a)].some(k => c1.has(k))) return 'near'; const ws = wordsLow(t); if (ws.length >= 5 && [...wdel1(ws)].some(k => w1.has(k))) return 'near'; return tp.has(template(t)) ? 'template' : 'none' }
const dev = lines(S + 'parser/dev-x-e15-g3.jsonl').filter(r => r.gold)
const t = {}
for (const r of dev) { const k = near(r.text); t[k] ??= {n: 0, parser: 0, vss: 0}; t[k].n++; t[k].parser += !!r.parserOk; t[k].vss += !!r.vssOk }
console.log('gold dev by near-duplicate in parser train:', JSON.stringify(t))
