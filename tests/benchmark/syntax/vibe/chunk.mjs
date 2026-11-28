// Splits every -simple.csv and -advanced.csv batch of eval-results/2026-11-28-vibe-batches into parts of at
// most N rows (default 150), so that a judge works on short files. A part keeps the header and every row as it
// is (column n names the row of the batch file, which names the dataset row), so no data is lost and the
// verdicts of the parts can be joined back. Parts: <batch>.p01.csv, .p02.csv, … beside the batch file.
//   node tests/benchmark/syntax/vibe/chunk.mjs [N]
import {readFileSync, writeFileSync, readdirSync, statSync} from 'node:fs'
import {join} from 'node:path'
import {readCsv, writeCsv} from '../lib.mjs'
const N = Number(process.argv[2] ?? 150), root = 'eval-results/2026-11-28-vibe-batches'
const walk = dir => readdirSync(dir).flatMap(name => { const p = join(dir, name); return statSync(p).isDirectory() ? walk(p) : [p] })
let parts = 0, rows = 0
for (const file of walk(root).filter(p => /-(simple|advanced)\.csv$/.test(p))) {
  const [header, ...body] = readCsv(readFileSync(file, 'utf8'))
  rows += body.length
  for (let i = 0, k = 1; i < body.length; i += N, k++) {
    writeFileSync(file.replace(/\.csv$/, `.p${String(k).padStart(2, '0')}.csv`), writeCsv(header, body.slice(i, i + N), '\n'))
    parts++
  }
}
console.log(`${rows} rows in ${parts} parts of at most ${N}`)
