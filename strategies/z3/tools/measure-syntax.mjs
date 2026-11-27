// Measure a `syntax` strategy on a sample: one JSON line per message
// {"id", "text", "sop": circuit or null, "error": null or text}, and a summary on stdout.
// Usage: node strategies/z3/tools/measure-syntax.mjs <z3|neuro-z3> <sample.json.gz> <out.jsonl> [key=value ...]
import {createWriteStream, readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {createReader} from '../../../lib/index.mjs'

const [name, samplePath, outPath, ...settings] = process.argv.slice(2)
const module = await import(new URL(`../../${name}/index.mjs`, import.meta.url))
const strategy = Object.values(module).find((value) => value?.schema === 'syntax')
const options = Object.fromEntries(settings.map((pair) => pair.split(/=(.*)/su).slice(0, 2)))
const limit = options.limit ? Number(options.limit) : Infinity
delete options.limit
const sample = JSON.parse(gunzipSync(readFileSync(samplePath))).slice(0, limit)
const started = performance.now()
const reader = await createReader({strategy, ...options})
const ready = performance.now()
const out = createWriteStream(outPath)
const reasons = new Map()
const note = (reason, text) => {
  if (!reasons.has(reason)) reasons.set(reason, {count: 0, example: text})
  reasons.get(reason).count++
}
const latencies = []
let valid = 0, withLeftover = 0
for (const {id, text} of sample) {
  const before = performance.now()
  const result = await reader.propose(text)
  latencies.push(performance.now() - before)
  const candidate = result.candidates[0]
  if (candidate) {
    valid++
    if (candidate.leftover?.length) { withLeftover++; note('(valid) a word placed by the last rule only: modifier of its clause', text) }
  } else {
    const findings = result.rejected?.[0]?.check.findings ?? []
    if (findings.length) for (const code of new Set(findings.map((finding) => finding.code))) note('finding: ' + code, text)
    else note('error: ' + String(result.error).replace(/"[^"]*"/gu, '"…"').replace(/\([^)]*\)/gu, '(…)').slice(0, 90), text)
  }
  out.write(JSON.stringify({id, text, sop: candidate?.sop ?? null, error: candidate ? null : result.error}) + '\n')
}
const finished = performance.now()
await reader.close()
await new Promise((resolve) => out.end(resolve))
latencies.sort((a, b) => a - b)
const at = (share) => latencies[Math.ceil(latencies.length * share) - 1]
console.log(JSON.stringify({strategy: name, messages: sample.length, valid, validShare: valid / sample.length, withLeftover,
  startupMs: Math.round(ready - started), msPerMessage: (finished - ready) / sample.length, medianMs: at(0.5), p95Ms: at(0.95), maxMs: at(1),
  reasons: [...reasons].sort((a, b) => b[1].count - a[1].count).map(([reason, {count, example}]) => ({reason, count, example}))}, null, 1))
