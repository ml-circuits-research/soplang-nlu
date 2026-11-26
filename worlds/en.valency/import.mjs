// Generate from the Princeton WordNet 3.1 database distributed under LICENSE.
import {readFileSync, writeFileSync} from 'node:fs'

const families = new Map(Object.entries({
  intransitive: [1, 2, 3, 23],
  oblique: [4, 12, 13, 22, 27],
  object_predicative: [5],
  predicative: [6, 7],
  transitive: [8, 9, 10, 11],
  double_object: [14],
  object_oblique: [15, 16, 17, 18, 19, 20, 21, 31],
  object_infinitive: [24],
  object_bare_infinitive: [25],
  finite_clause: [26, 34],
  infinitive: [28],
  interrogative_infinitive: [29],
  object_into_gerund: [30],
  bare_infinitive: [32, 35],
  gerund: [33]
}).flatMap(([family, numbers]) => numbers.map(number => [number, family])))

const inventory = new Map()
for (const line of readFileSync(process.argv[2], 'utf8').split('\n')) {
  if (!/^\d{8} /u.test(line)) continue
  const [record] = line.split(' | ')
  const fields = record.trim().split(/\s+/u)
  const count = parseInt(fields[3], 16)
  const lemmas = Array.from({length: count}, (_, index) =>
    fields[4 + 2 * index].replaceAll('_', ' ').toLowerCase())
  let at = 4 + count * 2
  const pointerCount = Number(fields[at++])
  at += 4 * pointerCount
  const frameCount = Number(fields[at++])
  for (let i = 0; i < frameCount; i++) {
    if (fields[at++] !== '+') throw Error('Missing frame marker for ' + fields[0])
    const family = families.get(Number(fields[at++]))
    const word = parseInt(fields[at++], 16)
    if (!family || word > count) throw Error('Unknown frame or word for ' + fields[0])
    for (const lemma of word ? [lemmas[word - 1]] : lemmas) {
      if (!inventory.has(lemma)) inventory.set(lemma, new Set())
      inventory.get(lemma).add(family)
    }
  }
  if (at !== fields.length) throw Error('Unexpected fields for ' + fields[0])
}
if (inventory.size === 0) throw Error('No verb frames found')
const rows = [...inventory.keys()].sort().map((lemma, index) => {
  const frames = [...inventory.get(lemma)].sort().map(frame => 'frame=' + frame)
  return '@en.valency.v' + (index + 1) + ' en.valency.verb lemma=' + JSON.stringify(lemma) + ' ' + frames.join(' ')
})
writeFileSync(new URL('./verbs.sop', import.meta.url), rows.join('\n') + '\n')
