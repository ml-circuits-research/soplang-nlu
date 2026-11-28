// rvss on a fresh file-level sample (tests/benchmark/syntax/draw-sample.mjs): decode inputs, spaCy targets, and the
// list of rvss circuits no judge has decided yet.
//
//   node strategies/rvss/eval/fresh-sample.mjs prepare <sample.json.gz> <out-folder> --rewritten <rewritten-<commit>.jsonl>
//     writes <out>/inputs.jsonl (decode.py input) and <out>/targets.jsonl.gz: per message {id, text, file, row, sop:
//     spaCy's circuit from the rewritten file (same text), origin "spacy", split: where the message stands in the
//     rvss sets: train (rvss trained on its spaCy circuit), dev-B, excluded (left out as a benchmark copy) or new (not
//     in the sets: a text the dataset gained after the sets were built)}; messages whose text has no spaCy circuit
//     in the rewritten file are counted and left out of the targets.
//   node strategies/rvss/eval/fresh-sample.mjs unjudged <outputs.jsonl> <targets.jsonl.gz> <out.jsonl>
//     the rvss circuits that differ from spaCy's (exact core) and have no decision in the registry: {n, id, text, sop}
//     in normal form, one line per (message, core), for judges.
import {createReadStream, readFileSync, writeFileSync, mkdirSync} from 'node:fs'
import {createInterface} from 'node:readline'
import {createGunzip, gunzipSync, gzipSync} from 'node:zlib'
import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const repo = resolve(fileURLToPath(import.meta.url), '../../../..')
const args = process.argv.slice(2)
const opt = name => { const at = args.indexOf('--' + name); return at >= 0 ? args[at + 1] : undefined }
const linesOf = file => { const s = createReadStream(file); return createInterface({input: file.endsWith('.gz') ? s.pipe(createGunzip()) : s, crlfDelay: Infinity}) }
const {input} = await import(join(repo, 'strategies/rvss/model/io.mjs'))
const {readRegistry, lookup, normalForm} = await import(join(repo, 'tests/benchmark/syntax/lib.mjs'))

if (args[0] === 'prepare') {
  const sample = JSON.parse(gunzipSync(readFileSync(resolve(args[1]))))
  const out = resolve(args[2]); mkdirSync(out, {recursive: true})
  const spacy = new Map()
  for await (const l of linesOf(resolve(opt('rewritten')))) { if (!l) continue; const r = JSON.parse(l); if (r.sop) spacy.set(r.text, r.sop) }
  const where = new Map()
  for await (const l of linesOf(join(repo, '.local-data/rvss/distill.jsonl.gz'))) { const o = JSON.parse(l); where.set(o.text, o.split) }
  for await (const l of linesOf(join(repo, '.local-data/rvss/excluded.jsonl.gz'))) { const o = JSON.parse(l); where.set(o.text, 'excluded') }
  const inputs = [], targets = [], count = {messages: sample.length, noSpacy: 0, split: {}}
  for (const {id, text} of sample) {
    const [file, row] = [id.slice(0, id.lastIndexOf('#')), Number(id.slice(id.lastIndexOf('#') + 1))]
    inputs.push({id, file, row, text, ...input(text)})
    const sop = spacy.get(text)
    if (!sop) { count.noSpacy++; continue }
    const split = where.get(text) ?? 'new'
    count.split[split] = (count.split[split] ?? 0) + 1
    targets.push({id, text, file, row, sop, origin: 'spacy', split})
  }
  writeFileSync(join(out, 'inputs.jsonl'), inputs.map(o => JSON.stringify(o)).join('\n') + '\n')
  writeFileSync(join(out, 'targets.jsonl.gz'), gzipSync(targets.map(o => JSON.stringify(o)).join('\n') + '\n'))
  writeFileSync(join(out, 'prepare.json'), JSON.stringify(count, null, 1) + '\n')
  console.log(JSON.stringify(count))
} else if (args[0] === 'unjudged') {
  const targets = new Map()
  for await (const l of linesOf(resolve(args[2]))) { if (!l) continue; const o = JSON.parse(l); targets.set(o.text, o) }
  const registry = readRegistry(join(repo, '../webmeet-dataset/annotations/syntax/v1/judged'))
  const seen = new Set(), list = [], count = {outputs: 0, valid: 0, equalSpacy: 0, decided: {}, unjudged: 0}
  for await (const l of linesOf(resolve(args[1]))) {
    if (!l) continue
    const o = JSON.parse(l); count.outputs++
    if (!o.sop) continue
    count.valid++
    const nf = normalForm(o.text, o.sop); if (!nf) continue
    const t = targets.get(o.text)
    if (t && normalForm(t.text, t.sop)?.core === nf.core) { count.equalSpacy++; continue }
    const d = lookup(registry, o.text, nf.core)
    if (d) { count.decided[d.verdict] = (count.decided[d.verdict] ?? 0) + 1; continue }
    const k = o.text + '\0' + nf.core
    if (seen.has(k)) continue
    seen.add(k); count.unjudged++
    list.push({n: list.length + 1, id: o.id, text: o.text, sop: nf.sop ?? nf.text ?? o.sop, split: t?.split ?? null})
  }
  writeFileSync(resolve(args[3]), list.map(o => JSON.stringify(o)).join('\n') + '\n')
  console.log(JSON.stringify(count))
} else { console.error('usage: prepare | unjudged'); process.exit(2) }
