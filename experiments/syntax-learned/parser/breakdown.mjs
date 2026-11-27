// The benchmark verdicts of the parser and of VSS, re-read now (the run's judging grows), split by
// whether the message had a label before the run (labelled messages are those where strategies
// agreed or a judge accepted a circuit: the easier part of the dataset, like the training data).
//   node breakdown.mjs tag1 [tag2 ...]
import {readFileSync, writeFileSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {normalForm, readLabelsBefore} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const {openVerdicts, runDir} = await import('./verdicts.mjs')
const {verdictOf} = openVerdicts()
const before = readLabelsBefore(runDir, new Map())
const read = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
const strategies = {vss: read(runDir + 'vss.jsonl'), spacy: read(runDir + 'spacy.jsonl'), distilbert: read(runDir + 'distilbert.jsonl')}
for (const tag of process.argv.slice(2)) strategies['parser:' + tag] = read(`bench-${tag}.jsonl`)
const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '-'
console.log('vss.jsonl as of', (await import('node:fs')).statSync(runDir + 'vss.jsonl').mtime.toISOString())
console.log('| strategy | part | n | accepted | rejected | unjudged | unjudged ~ accepted up to relation starts |')
console.log('| --- | --- | ---: | ---: | ---: | ---: | ---: |')
const cores = {}
for (const [name, rows] of Object.entries(strategies)) {
  const parts = {all: [0, 0, 0, 0, 0], 'labelled before': [0, 0, 0, 0, 0], 'not labelled before': [0, 0, 0, 0, 0]}
  cores[name] = new Map()
  for (const r of rows) {
    const core = r.sop ? normalForm(r.text, r.sop)?.core : null
    cores[name].set(r.text, core)
    const v = verdictOf(r.text, core)
    for (const part of ['all', before.has(r.text) ? 'labelled before' : 'not labelled before']) {
      const t = parts[part]; t[0]++
      if (v.verdict === 'accepted') t[1]++; else if (v.verdict === 'rejected' || v.verdict === 'invalid') t[2]++; else { t[3]++; if (v.relaxed === 'accepted') t[4]++ }
    }
  }
  for (const [part, t] of Object.entries(parts)) console.log(`| ${name} | ${part} | ${t[0]} | ${t[1]} (${pct(t[1], t[0])}) | ${t[2]} (${pct(t[2], t[0])}) | ${t[3]} (${pct(t[3], t[0])}) | ${t[4]} |`)
}
// agreement of the parser with each strategy
for (const tag of process.argv.slice(2)) {
  const p = cores['parser:' + tag]
  for (const other of ['vss', 'spacy', 'distilbert']) {
    let same = 0; for (const [text, core] of p) if (core && cores[other].get(text) === core) same++
    console.log(`parser:${tag} same circuit as ${other}: ${same}`)
  }
  // the parser's circuits that nothing judged yet, in normal form, for a later judge
  const rows = strategies['parser:' + tag].filter(r => { const c = cores['parser:' + tag].get(r.text); return c && verdictOf(r.text, c).verdict === 'unjudged' })
  writeFileSync(`unjudged-${tag}.jsonl`, rows.map(r => JSON.stringify({text: r.text, sop: normalForm(r.text, r.sop).sop})).join('\n') + '\n')
  console.log(`wrote unjudged-${tag}.jsonl: ${rows.length} circuits`)
}
