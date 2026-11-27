// Blind paired review packets: for a seeded subset of the frozen sample, the candidate sets of two
// strategies in a random order, without their names.
import {readFileSync, writeFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {createHash} from 'node:crypto'
const base = '/home/salboaie/work/sopworlds/soplang-nlu/eval-results/'
const read = path => gunzipSync(readFileSync(base + path)).toString().split('\n').filter(Boolean).map(line => JSON.parse(line))
const sample = JSON.parse(gunzipSync(readFileSync(base + '2026-11-26-fresh-locked-one-percent/sample.json.gz')))
const vss = new Map(read('2026-11-27-vss-frozen-one-percent/vss.jsonl.gz').map(r => [r.id, r]))
const spacy = new Map(read('2026-11-26-fresh-locked-one-percent/spacy-direct.jsonl.gz').map(r => [r.id, r]))
const h = text => createHash('sha256').update(text).digest('hex')
const [count, parts, out] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4]]
const picked = sample.map(r => r).sort((a, b) => h('review\0' + a.id).localeCompare(h('review\0' + b.id))).slice(0, count)
const key = []
const packets = Array.from({length: parts}, () => [])
picked.forEach((row, k) => {
  const flip = parseInt(h('order\0' + row.id).slice(0, 2), 16) % 2 === 1
  const sets = flip ? [['spacy-direct', spacy.get(row.id)], ['vss', vss.get(row.id)]] : [['vss', vss.get(row.id)], ['spacy-direct', spacy.get(row.id)]]
  key.push({item: k + 1, id: row.id, A: sets[0][0], B: sets[1][0]})
  packets[k % parts].push({item: k + 1, text: row.text, A: sets[0][1].candidates, B: sets[1][1].candidates})
})
packets.forEach((packet, p) => writeFileSync(`${out}/packet-${p + 1}.jsonl`, packet.map(row => JSON.stringify(row)).join('\n') + '\n'))
writeFileSync(`${out}/key.json`, JSON.stringify(key))
console.log(picked.length, 'items in', parts, 'packets; sets with no candidate:', picked.filter(r => !vss.get(r.id).candidates.length).length, 'vss,', picked.filter(r => !spacy.get(r.id).candidates.length).length, 'spacy')
