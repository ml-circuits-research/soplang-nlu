// Step 1 of the conversion: candidates for every labelled message.
//   node build.mjs <labels.jsonl> <base-parses.jsonl> <candidates.jsonl>
import {readFileSync, writeFileSync} from 'node:fs'
import {candidates} from './convert.mjs'
const lines = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const [labelsFile, parsesFile, outFile] = process.argv.slice(2)
const parses = new Map(lines(parsesFile).map(row => [row.text, row]))
const out = [], losses = {}
for (const label of lines(labelsFile)) {
  const parse = parses.get(label.text)
  if (!parse) continue
  const {out: list, losses: lost} = candidates(label.text, label.sop, parse.tokens)
  for (const candidate of list) out.push(JSON.stringify({key: candidate.name, text: label.text, tokens: candidate.tokens}))
  for (const loss of lost) losses[loss.name + ' ' + loss.kind] = (losses[loss.name + ' ' + loss.kind] ?? 0) + 1
}
writeFileSync(outFile, out.join('\n') + '\n')
console.log(JSON.stringify(losses, null, 1))
