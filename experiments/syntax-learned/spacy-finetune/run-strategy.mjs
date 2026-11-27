// Run the spacy strategy itself (createReader + strategies/spacy, the Python worker on the CPU) over messages.
//   SOP_NLU_SYNTAX_PYTHON=... SOP_NLU_SYNTAX_MODEL=<model dir> node run-strategy.mjs <in.jsonl> <out.jsonl>
import {readFileSync, writeFileSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {createReader} = await import(root + 'lib/index.mjs')
const {spacy} = await import(root + 'strategies/spacy/index.mjs')
const lines = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const [inFile, outFile] = process.argv.slice(2)
const reader = await createReader({strategy: spacy})
const out = []
const started = Date.now()
for (const row of lines(inFile)) {
  const t = performance.now()
  let sop = null, error = null
  try { sop = (await reader.propose(row.text)).candidates[0]?.sop ?? null } catch (e) { error = e.message }
  out.push({id: row.id, text: row.text, sop, error, ms: +(performance.now() - t).toFixed(1)})
}
await reader.close?.()
writeFileSync(outFile, out.map(row => JSON.stringify(row)).join('\n') + '\n')
const ms = out.map(row => row.ms).sort((a, b) => a - b)
console.log(JSON.stringify({messages: out.length, seconds: (Date.now() - started) / 1000, medianMs: ms[Math.floor(ms.length / 2)], noCircuit: out.filter(row => !row.sop).length}))
