import {readFileSync} from 'node:fs'
import {candidates} from './convert.mjs'
const lines = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const parses = new Map(lines('parses/base-gold-train.jsonl').map(row => [row.text, row]))
const want = process.argv[2]; let shown = 0
for (const label of lines('data/gold-train.jsonl')) {
  const {losses} = candidates(label.text, label.sop, parses.get(label.text).tokens)
  const l = losses.find(l => l.name === 'C' && l.kind.startsWith(want))
  if (!l) continue
  console.log('TEXT', label.text, '\n  ', l.message, '\n', label.sop.split('\n').map(s => '    ' + s).join('\n'))
  if (++shown > 6) break
}
