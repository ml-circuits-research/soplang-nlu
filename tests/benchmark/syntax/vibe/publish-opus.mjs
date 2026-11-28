// Publishes the verdicts of a judged packet folder (packet-NN.csv + .verdicts.jsonl) into the dataset.
//   node tests/benchmark/syntax/vibe/publish-opus.mjs <folder> --tag <name> --judge <model> [--dry]
// Registry: one new file <tag>.jsonl, one line per judged circuit (accepted or rejected) and, for each rejection,
// the judge's corrected circuit as an accepted line (source "judge"). Labels: the accepted circuit of every message,
// the spaCy one when L8 (accepted_by "judge", source "spacy"), the corrected one otherwise (accepted_by "written", source "judge").
// Rows are matched to dataset messages by text only; texts that are gone are skipped and counted.
import {existsSync, readFileSync, readdirSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {readArguments, readCsv, readJsonl, writeJsonl, readLabels, writeLabels, labelLine, normalForm, defaultRegistryDir, defaultSyntacticDir, readRegistry, lookup} from '../lib.mjs'

const {words, named} = readArguments(process.argv.slice(2))
if (!words[0] || typeof named.tag !== 'string' || typeof named.judge !== 'string') { console.error('Usage: publish-opus.mjs <folder> --tag <name> --judge <model> [--dry]'); process.exit(2) }
const dir = resolve(words[0]), file = join(defaultRegistryDir, named.tag + '.jsonl')
if (existsSync(file)) { console.error(`${file} exists: choose another --tag.`); process.exit(1) }
const labels = readLabels(defaultSyntacticDir), registry = readRegistry(defaultRegistryDir)
const lines = [], changes = new Map(), stat = {rows: 0, accepted: 0, corrected: 0, gone: 0, newLabels: 0, replaced: 0, duplicateLines: 0, bad: 0}
const seen = new Set()
const add = line => { const k = line.text + '\0' + line.core; if (seen.has(k) || lookup(registry, line.text, line.core)) { stat.duplicateLines++; return } seen.add(k); lines.push(line) }
for (const name of readdirSync(dir).filter(n => /^packet-\d+\.csv$/u.test(n) && existsSync(join(dir, n.replace('.csv', '.verdicts.jsonl')))).sort()) {
  const [, ...rows] = readCsv(readFileSync(join(dir, name), 'utf8'))
  const verdicts = new Map(readJsonl(join(dir, name.replace('.csv', '.verdicts.jsonl'))).map(v => [v.n, v]))
  for (const [n, text, sop] of rows) {
    const v = verdicts.get(Number(n))
    if (!v) { stat.bad++; continue }
    stat.rows++
    if (!labels.files.has(text)) { stat.gone++; continue }
    const good = v.grade === 'L8'
    const spacy = normalForm(text, sop)
    if (!spacy) stat.unreadableSpacy = (stat.unreadableSpacy ?? 0) + 1
    if (spacy) add({text, sop: spacy.sop, core: spacy.core, verdict: good ? 'accepted' : 'rejected', grade: v.grade, note: v.note, judge: named.judge, run: named.tag, source: 'spacy'})
    let label = spacy?.sop, source = 'spacy', by = 'judge'
    if (good && !spacy) { stat.bad++; continue }
    if (good) stat.accepted++
    else {
      const fix = v.sop && normalForm(text, v.sop)
      if (!fix) { stat.bad++; continue }
      add({text, sop: fix.sop, core: fix.core, verdict: 'accepted', grade: 'L8', note: 'written by the judge as the corrected circuit: ' + v.note, judge: named.judge, run: named.tag, source: 'judge'})
      label = fix.sop; source = 'judge'; by = 'written'; stat.corrected++
    }
    const old = labels.get(text)
    if (old) stat.replaced++; else stat.newLabels++
    changes.set(text, labelLine({text, label, source, accepted_by: by}))
  }
}
console.log(stat)
if (named.dry) process.exit(0)
writeJsonl(file, lines)
const w = writeLabels(labels, changes)
console.log(`registry ${lines.length} lines -> ${file}; labels rows written ${w.rows} in ${w.files.length} files; missing ${w.missing.length}`)
