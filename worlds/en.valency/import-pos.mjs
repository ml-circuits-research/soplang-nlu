// Import aggregate WordNet tag counts. Never read or store example sentences.
import {readFileSync, writeFileSync} from 'node:fs'
const classes = {1: 'noun', 2: 'verb', 3: 'adjective', 4: 'adverb', 5: 'adjective'}
const counts = new Map()
for (const line of readFileSync(process.argv[2], 'utf8').trimEnd().split('\n')) {
  const match = /^(.+)%([1-5]):\S*\s+\d+\s+(\d+)$/u.exec(line)
  if (!match) throw Error('Invalid WordNet tag-count row: ' + line)
  const lemma = match[1].replaceAll('_', ' ').toLowerCase()
  const pos = classes[match[2]]
  if (!counts.has(lemma)) counts.set(lemma, {})
  const record = counts.get(lemma)
  record[pos] = (record[pos] ?? 0) + Number(match[3])
}
const rows = [...counts.keys()].sort().map((lemma, index) => {
  const values = Object.entries(counts.get(lemma)).sort(([a], [b]) => a.localeCompare(b))
  return '@en.valency.p' + (index + 1) + ' en.valency.pos_usage lemma=' +
    JSON.stringify(lemma) + ' ' + values.map(([key, count]) => key + '=' + count).join(' ')
})
writeFileSync(new URL('./pos.sop', import.meta.url), rows.join('\n') + '\n')
