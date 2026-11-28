// Judged acceptance of a run's circuits on held-out messages, from what the dataset holds now: a circuit is accepted
// when its normal-form core equals the message's label (syntactic/**, any accepted_by) or a circuit the registry
// (annotations/syntax/v1/judged) holds as accepted; rejected when the registry holds it as rejected; else unjudged.
// The share accepted is a lower bound (unjudged counts as not accepted).
//
//   node strategies/rvss/eval/accepted.mjs <outputs.jsonl>... [--texts <sample.json.gz or .jsonl with text>] [--json <file>]
//
// --texts keeps the messages of that file (e.g. the 1,000 messages of eval-results/2026-11-28-h2h-general, which are
// fully judged for spaCy and rVSS g15). Prints, per outputs file: messages, accepted, rejected, unjudged, no circuit,
// and the same by length.
import {readFileSync, writeFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {resolve, basename, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const {readRegistry, readLabels, normalForm, lookup} = await import(repo + '/tests/benchmark/syntax/lib.mjs')
const {wordsOf} = await import(repo + '/lib/syntax.mjs')
const args = process.argv.slice(2)
const opt = name => { const at = args.indexOf('--' + name); return at >= 0 ? args[at + 1] : undefined }
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')))
const rows = file => { const b = readFileSync(file); const s = (file.endsWith('.gz') ? gunzipSync(b) : b).toString('utf8').trim()
  return s.startsWith('[') ? JSON.parse(s) : s.split('\n').filter(Boolean).map(l => JSON.parse(l)) }
const keep = opt('texts') ? new Set(rows(resolve(opt('texts'))).map(r => r.text)) : null
const registry = readRegistry(), labels = readLabels()
const bucket = n => n < 10 ? '<10' : n < 25 ? '10-24' : n < 40 ? '25-39' : '40+'
const out = {}
for (const file of files) {
  const t = {all: {n: 0, accepted: 0, rejected: 0, unjudged: 0, none: 0}}
  for (const r of rows(resolve(file))) {
    if (keep && !keep.has(r.text)) continue
    let core = null; try { core = r.sop ? normalForm(r.text, r.sop)?.core ?? null : null } catch {}
    const k = !core ? 'none' : labels.get(r.text)?.core === core ? 'accepted' : lookup(registry, r.text, core)?.verdict ?? 'unjudged'
    for (const g of ['all', bucket(wordsOf(r.text).length)]) { const x = t[g] ??= {n: 0, accepted: 0, rejected: 0, unjudged: 0, none: 0}; x.n++; x[k]++ }
  }
  out[file] = t
  const p = x => (100 * x.accepted / x.n).toFixed(1) + '%'
  console.log(`${file}: ${t.all.n} messages, accepted ${t.all.accepted} (${p(t.all)}), rejected ${t.all.rejected}, unjudged ${t.all.unjudged}, no circuit ${t.all.none}; by length ` +
    ['<10', '10-24', '25-39', '40+'].filter(g => t[g]).map(g => `${g} ${p(t[g])} of ${t[g].n} (${t[g].unjudged} unjudged)`).join(', '))
}
if (opt('json')) writeFileSync(resolve(opt('json')), JSON.stringify(out, null, 1) + '\n')
