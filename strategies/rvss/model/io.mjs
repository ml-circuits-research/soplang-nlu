// rvss: inputs for decode.py and circuits from its outputs.
//   node io.mjs inputs-dev <out.jsonl>         every dev-B message of distill.jsonl.gz (15,104)
//   node io.mjs inputs-bench <out.jsonl>       the 1,831 benchmark messages (sample.json.gz)
//   node io.mjs write <decoded.jsonl> <outputs.jsonl>   nodes -> circuits ({id, file, row, text, sop, error, ms})
import {createReadStream, createWriteStream, readFileSync, writeFileSync} from 'node:fs'
import {createGunzip, gunzipSync} from 'node:zlib'
import {createInterface} from 'node:readline'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {wordsOf, validateSyntax} = await import(root + 'lib/syntax.mjs')
const {writeNodes} = await import(root + 'strategies/rvss/writer.mjs')
const [cmd, a, b] = process.argv.slice(2)
export function input(text) {
  const ws = wordsOf(text); let prev = 0; const gaps = []
  for (const w of ws) { gaps.push(text.slice(prev, w.start).replace(/\s+/gu, '')); prev = w.end }
  gaps.push(text.slice(prev).replace(/\s+/gu, ''))
  return {words: ws.map(w => w.text), gaps}
}
if (cmd === 'inputs-dev') {
  const out = createWriteStream(a); let n = 0
  for await (const l of createInterface({input: createReadStream(root + '.local-data/rvss/distill.jsonl.gz').pipe(createGunzip())})) {
    const o = JSON.parse(l); if (o.split !== 'dev-B') continue
    out.write(JSON.stringify({text: o.text, file: o.file, row: o.row, split: o.split, ...input(o.text)}) + '\n'); n++ }
  out.end(); console.log(n)
} else if (cmd === 'inputs-bench') {
  const s = JSON.parse(gunzipSync(readFileSync(root + 'eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz')))
  writeFileSync(a, s.map(o => JSON.stringify({id: o.id, text: o.text, ...input(o.text)})).join('\n') + '\n'); console.log(s.length)
} else if (cmd === 'write') {
  const out = createWriteStream(b); const c = {}
  for await (const l of createInterface({input: createReadStream(a)})) {
    const o = JSON.parse(l); let sop = null, error = o.error
    if (!error) {
      try { sop = writeNodes(o.text, o.nodes); const v = validateSyntax(o.text, sop); if (!v.valid) { error = 'invalid circuit: ' + (v.errors?.[0]?.code ?? v.errors?.[0] ?? 'invalid'); sop = null } }
      catch (e) { error = 'crash: ' + e.message; sop = null }
    }
    const k = error ? error.slice(0, 40) : 'ok'; c[k] = (c[k] ?? 0) + 1
    out.write(JSON.stringify({id: o.id ?? `${o.file}#${o.row}`, file: o.file, row: o.row, text: o.text, sop, error, ms: o.ms, readback: o.readback}) + '\n')
  }
  out.end(); console.log(JSON.stringify(c))
}
