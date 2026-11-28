// Judges batch files with the Mistral `vibe` CLI in headless mode, K files at a time.
//   node tests/benchmark/syntax/vibe/run.mjs --model <alias> --parallel <K> [--time-limit 1200] [--max-turns 120] [--log <dir>] <batch.csv …>
// A batch file is F-simple.csv or F-advanced.csv (see prepare.mjs); its RULES.md must stand beside it.
// After each file the checker (check.mjs) runs; when it fails, the file is retried once with the checker's report.
// A file whose verdicts already pass the checker is not judged again.
import {spawn} from 'node:child_process'
import {readFileSync, mkdirSync, copyFileSync, existsSync, writeFileSync, appendFileSync} from 'node:fs'
import {dirname, basename, join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {checkBatch, verdictsFileOf} from './check.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2), named = {}, files = []
for (let i = 0; i < args.length; i++) { if (args[i].startsWith('--')) named[args[i].slice(2)] = args[++i]; else files.push(resolve(args[i])) }
const model = named.model, K = Number(named.parallel ?? 1), timeLimit = Number(named['time-limit'] ?? 1200), maxTurns = Number(named['max-turns'] ?? 120)
if (!model || !files.length) { console.error('Usage: node run.mjs --model <alias> --parallel <K> [--time-limit s] [--max-turns n] [--log dir] <batch.csv …>'); process.exit(2) }
const logDir = resolve(named.log ?? join(dirname(files[0]), '.vibe-logs'))

function promptFor(csv, report) {
  const kind = /-advanced(\.p\d+)?\.csv$/u.test(csv) ? 'advanced' : 'simple'
  const text = readFileSync(join(here, `prompt-${kind}.txt`), 'utf8').replaceAll('{CSV}', basename(csv)).replaceAll('{VERDICTS}', basename(verdictsFileOf(csv))).trim()
  return report ? text + `\n\nYour previous ${basename(verdictsFileOf(csv))} failed the checker:\n${report}\nWrite the whole verdicts file again, with every row judged and these problems corrected.` : text
}
function vibe(csv, attempt, report) {
  const dir = dirname(csv)
  if (!existsSync(join(dir, 'RULES.md'))) copyFileSync(join(here, '../rules.md'), join(dir, 'RULES.md'))
  const out = join(logDir, basename(csv, '.csv') + `.${attempt}`)
  mkdirSync(out, {recursive: true})
  const argv = ['-p', promptFor(csv, report), '--model', model, '--auto-approve', '--trust', '--workdir', dir, '--output', 'json', '--output-dir', out, '--max-turns', String(maxTurns), '--time-limit', String(timeLimit)]
  return new Promise(done => {
    const child = spawn('vibe', argv, {stdio: ['ignore', 'pipe', 'pipe']})
    let o = '', e = ''
    child.stdout.on('data', d => o += d); child.stderr.on('data', d => e += d)
    child.on('error', error => done({code: -1, error: String(error)}))
    child.on('exit', code => { writeFileSync(join(out, 'vibe.out'), o); writeFileSync(join(out, 'vibe.err'), e); done({code}) })
  })
}
async function judge(csv) {
  let result = checkBatch(csv)
  if (!result.problems.length) return {csv, status: 'already judged', ...result}
  let attempts = 0
  for (let attempt = 1; attempt <= 2 && result.problems.length; attempt++) {
    attempts = attempt
    const report = attempt === 1 ? null : result.problems.slice(0, 40).join('\n')
    const r = await vibe(csv, attempt, report)
    result = checkBatch(csv)
    if (r.code) result.problems.push(`vibe exited with ${r.code}${r.error ? ' ' + r.error : ''}`)
  }
  return {csv, status: result.problems.length ? 'failed' : 'ok', attempts, ...result}
}
const queue = [...files], summary = []
mkdirSync(logDir, {recursive: true})
await Promise.all(Array.from({length: Math.min(K, files.length)}, async () => {
  while (queue.length) {
    const csv = queue.shift(), r = await judge(csv)
    summary.push(r)
    console.log(`${r.status}: ${basename(csv)} (${r.judged}/${r.rows} judged, ${r.accepted} accepted)${r.problems.length ? ' ' + r.problems[0] : ''}`)
    appendFileSync(join(logDir, 'results.jsonl'), JSON.stringify({...r, problems: r.problems.slice(0, 5)}) + '\n')
  }
}))
process.exit(summary.some(r => r.status === 'failed') ? 1 : 0)
