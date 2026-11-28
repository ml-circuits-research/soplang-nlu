// Judges a part of syntactic circuits with the Codex CLI in ONE call per batch (no agent steps): the rules and the
// rows go inline in the prompt, the model answers with JSONL verdicts in its final message, the script checks every
// line and sends back only the rows that failed, at most once more.
//   node tests/benchmark/syntax/codex/judge-batch.mjs <part.csv> [--model gpt-6.2-sol] [--effort medium] [--rows 100] [--out <verdicts.jsonl>]
// Default --mode verdict --rows 400: one call per 400 rows, the rules first and identical in every call (cacheable),
// a few words per row in the answer. A part has the columns n, text, sop[, alt, label_state] (the -simple/-advanced parts and the Opus packets). The
// verdicts file is <part>.verdicts.jsonl beside it unless --out is given: {n, grade, note[, sop]}; a rejection carries
// "sop", a corrected circuit, which must pass validateSyntax for the text. The rules are the judges' rules.md.
// Cost is written to <verdicts>.log (prompt and answer sizes, seconds) so the first batch can be measured.
import {readFileSync, writeFileSync, appendFileSync, existsSync, mkdtempSync, rmSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
import {join, dirname, resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {fileURLToPath} from 'node:url'
import {readCsv} from '../lib.mjs'
import {validateSyntax} from '../../../../lib/syntax.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2), named = {}, files = []
for (let i = 0; i < args.length; i++) { if (args[i].startsWith('--')) named[args[i].slice(2)] = args[++i]; else files.push(resolve(args[i])) }
const [part] = files
if (!part) { console.error('Usage: node judge-batch.mjs <part.csv> [--model gpt-6.2-sol] [--effort medium] [--rows 100] [--out file]'); process.exit(2) }
const model = named.model ?? 'gpt-6.2-sol', effort = named.effort ?? 'medium', batchRows = Number(named.rows ?? 400)
// --mode verdict (default): accept/reject only, a few words per row, no corrected circuits (cheap first pass;
// rejections go to a stronger judge who writes the corrections). --mode full: verdicts with corrected circuits.
const mode = named.mode ?? 'verdict'
const out = resolve(named.out ?? part.replace(/\.csv$/u, '.verdicts.jsonl')), log = out.replace(/\.jsonl$/u, '.log')
const rules = readFileSync(join(here, '../rules.md'), 'utf8')

const [header, ...body] = readCsv(readFileSync(part, 'utf8'))
const col = name => header.indexOf(name)
const rows = body.filter(r => r.length > 1).map(r => ({n: Number(r[col('n')]), text: r[col('text')], sop: r[col('sop')], alt: col('alt') >= 0 ? r[col('alt')] : undefined}))
const done = new Map(existsSync(out) ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).map(v => [v.n, v]) : [])

const promptVerdict = batch => `You are a judge of syntactic circuits. Below are the judges' RULES (fixed text, identical in every call), then ROWS as JSON lines {n, text, sop}: a message and one circuit written for it by a formalizer that saw only the words of the message.
For every row decide by the RULES whether sop is acceptable. Answer with one line per row and nothing else, tab-separated:
<n>\tA            when acceptable (a plausible or incomplete reading the next layer can continue from)
<n>\tR\t<grade L1..L6>\t<at most 12 words: the quoted words and what is wrong>   when it states something wrong or loses explicit information
Do not run commands; just answer.

RULES:
${rules}

ROWS:
${batch.map(r => JSON.stringify({n: r.n, text: r.text, sop: r.sop})).join('\n')}
`
const prompt = batch => `You are a judge of syntactic circuits. Below are the judges' RULES, then ROWS as JSON lines {n, text, sop${batch[0].alt !== undefined ? ', alt' : ''}}: a message and one circuit (sop) written for it by a formalizer that saw only the words of the message${batch[0].alt !== undefined ? '; alt is another formalizer\'s circuit' : ''}.
Judge every row's sop by the RULES. Answer with JSON lines only, one per row, nothing else (no prose, no code fences):
{"n": <number>, "grade": "L8" or "L1".."L6", "note": "<one sentence>"}
A rejection quotes the message's words in single quotes and names the wrong statement or the lost information, and also carries "sop": a corrected circuit for the text, in the same SOP syntax as the input circuits (every word of the message on exactly one key; take alt when it is right). Judge fairly: a plausible or incomplete reading the next layer can continue from is acceptable (L8). Do not run commands; just answer.

RULES:
${rules}

ROWS:
${batch.map(r => JSON.stringify(r)).join('\n')}
`

function call(batch) {
  const dir = mkdtempSync(join(tmpdir(), 'codex-judge-')), last = join(dir, 'last.txt'), text = (mode === 'verdict' ? promptVerdict : prompt)(batch), started = Date.now()
  const run = spawnSync('codex', ['exec', '-m', model, '-c', `model_reasoning_effort=${effort}`, '--sandbox', 'read-only', '--skip-git-repo-check', '--ephemeral', '-C', dir, '-o', last, '-'],
    {input: text, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 1800 * 1000})
  const answer = existsSync(last) ? readFileSync(last, 'utf8') : ''
  appendFileSync(log, JSON.stringify({rows: batch.length, promptChars: text.length, answerChars: answer.length, seconds: Math.round((Date.now() - started) / 1000), status: run.status, stderrTail: (run.stderr ?? '').slice(-300)}) + '\n')
  rmSync(dir, {recursive: true, force: true})
  return answer
}

function accept(batch, answer) {
  const byN = new Map(batch.map(r => [r.n, r])), good = new Map()
  if (mode === 'verdict') {
    for (const line of answer.split('\n')) {
      const [n, verdict, grade, reason] = line.trim().split('\t')
      const row = byN.get(Number(n))
      if (!row) continue
      if (verdict === 'A') good.set(row.n, {n: row.n, grade: 'L8', note: 'accepted (first pass, ' + model + ')'})
      else if (verdict === 'R' && /^L[1-6]$/u.test(grade ?? '')) good.set(row.n, {n: row.n, grade, note: (reason ?? '').trim() || 'rejected (first pass)', pass: 'first'})
    }
    return good
  }
  for (const line of answer.split('\n')) {
    const s = line.trim().replace(/^```\w*$/u, '')
    if (!s.startsWith('{')) continue
    let v; try { v = JSON.parse(s) } catch { continue }
    const row = byN.get(Number(v.n))
    if (!row || !/^L[1-68]$/u.test(v.grade ?? '') || typeof v.note !== 'string') continue
    if (v.grade !== 'L8') { if (typeof v.sop !== 'string' || validateSyntax(row.text, v.sop).length) continue }
    good.set(row.n, {n: row.n, grade: v.grade, note: v.note, ...(v.grade !== 'L8' ? {sop: v.sop} : {})})
  }
  return good
}

const todo = rows.filter(r => !done.has(r.n))
for (let i = 0; i < todo.length; i += batchRows) {
  let batch = todo.slice(i, i + batchRows)
  for (let attempt = 0; attempt < 2 && batch.length; attempt++) {
    const good = accept(batch, call(batch))
    for (const v of good.values()) { done.set(v.n, v); appendFileSync(out, JSON.stringify(v) + '\n') }
    batch = batch.filter(r => !good.has(r.n))
  }
  if (batch.length) console.error(`${batch.length} rows still without a valid verdict after a retry: ${batch.map(r => r.n).join(' ')}`)
}
console.log(`${part}: ${done.size}/${rows.length} judged (${[...done.values()].filter(v => v.grade === 'L8').length} accepted) -> ${out}`)
