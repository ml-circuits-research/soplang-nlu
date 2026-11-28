// hmm-rules' circuit for every message of the dataset's syntactic files -> .local-data/rvss/hmm-rules-all.jsonl.gz
//   node tests/benchmark/syntax/vibe/hmm-all.mjs [--workers 16]
// Lines {text, file, row, sop, error, ms}, like spacy-silver.jsonl.gz (row = 1-based data row of the file).
import {readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync} from 'node:fs'
import {gzipSync} from 'node:zlib'
import {fork} from 'node:child_process'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {readCsv, defaultSyntacticDir, packageRoot} from '../lib.mjs'
import {createReader} from '../../../../lib/reader.mjs'
import {hmmRules} from '../../../../strategies/hmm-rules/index.mjs'

const files = dir => readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name < b.name ? -1 : 1)
  .flatMap(e => e.isDirectory() ? files(join(dir, e.name)).map(f => e.name + '/' + f) : e.name.endsWith('.csv') ? [e.name] : [])
const out = join(packageRoot, '.local-data/rvss/hmm-rules-all.jsonl.gz')
const part = k => join(packageRoot, '.local-data/rvss', `hmm-rules-part-${k}.jsonl`)

if (process.argv[2] === '--child') {
  const [k, n] = [Number(process.argv[3]), Number(process.argv[4])]
  const reader = await createReader({strategy: hmmRules, maxReadings: 1})
  const lines = []
  files(defaultSyntacticDir).forEach((file, i) => {
    if (i % n !== k) return
    lines.push(file)
  })
  const rows = []
  for (const file of lines) {
    const [, ...data] = readCsv(readFileSync(join(defaultSyntacticDir, file), 'utf8'))
    for (let row = 1; row <= data.length; row++) {
      const text = data[row - 1][0], start = performance.now()
      let result
      try {
        const r = await reader.propose(text), sop = r.candidates?.[0]?.sop
        result = typeof sop === 'string' ? {sop, error: null} : {sop: null, error: r.rejected?.length ? 'invalid circuit' : 'no circuit: ' + (r.error ?? '')}
      } catch (e) { result = {sop: null, error: 'crash: ' + (e?.message ?? e)} }
      rows.push(JSON.stringify({text, file, row, ...result, ms: Math.round((performance.now() - start) * 1000) / 1000}))
    }
  }
  writeFileSync(part(k), rows.join('\n') + '\n')
  process.exit(0)
}
const arg = process.argv.indexOf('--workers'), n = arg > 0 ? Number(process.argv[arg + 1]) : 16
mkdirSync(dirname(out), {recursive: true})
await Promise.all(Array.from({length: n}, (_, k) => new Promise((ok, no) => {
  const c = fork(fileURLToPath(import.meta.url), ['--child', k, n]); c.on('exit', code => code ? no(new Error('worker ' + k)) : ok())
})))
const all = []
for (let k = 0; k < n; k++) all.push(readFileSync(part(k), 'utf8'))
writeFileSync(out, gzipSync(all.join('')))
console.log('wrote', out)
