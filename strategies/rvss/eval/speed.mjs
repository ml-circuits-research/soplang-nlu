// Speed, start-up time and size on disk of a syntax strategy, measured through the common reader createReader
// (lib/reader.mjs), one message after the other, as tests/benchmark/syntax/run.mjs calls it.
//
//   node strategies/rvss/eval/speed.mjs <strategy module> [--export <name>] [--options <file.json>] [--device cpu|any]
//        [--threads <n>] [--sample <file>] [--limit <n>] [--model <path>]... [--name <name>] [--out <file.json>]
//
// <strategy module>: a path to an ES module that exports a strategy object with `schema: 'syntax'` (the first such
//   export unless --export names it), e.g. strategies/spacy/index.mjs.
// --device cpu (the default): CUDA_VISIBLE_DEVICES is set empty and every SOP_NLU_*_DEVICE variable is set to cpu
//   before the module is loaded, so neither the strategy nor a worker process it starts can reach the GPU.
//   --device any leaves the environment as it is. --threads n sets OMP_NUM_THREADS, MKL_NUM_THREADS and
//   OPENBLAS_NUM_THREADS (read by torch and numpy in worker processes); without it they stay as they are (torch then
//   takes one thread per core).
// --sample: the messages, a JSON array of {id, text} (gzipped or not) or a .jsonl with `text`; default the 1,831
//   messages of eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz. --limit takes the first n.
// --options: a JSON object passed to createReader (as run.mjs --options passes one strategy's entry).
// Reports: import and open time (start-up = both), ms per message (median, p90, p99, mean, max, first message), valid
// circuits, the resident memory of the process and its child processes after the run, and the size on disk:
//   code: the .mjs/.js/.py files reached from the module by relative imports and new URL(..., import.meta.url);
//   data: the other files reached that way (a model.json, for example);
//   model paths: --model paths, option values that are existing paths, and the environment variables the code reads
//     (process.env.X, os.environ) that are set to an existing path, except those naming a PYTHON or a DEVICE.
//   model size = data + model paths. Interpreters and libraries (Python, torch, spaCy itself) are not counted.
// The load of the machine (load average, CPU count) is recorded with the numbers: other work slows the timings.
// Writes the result as JSON to --out (default .local-data/rvss/eval/speed/<name>-<device>[-<n>thread].json).
import {readFileSync, existsSync, statSync, mkdirSync, writeFileSync, readdirSync} from 'node:fs'
import {dirname, join, resolve, extname, basename} from 'node:path'
import {pathToFileURL, fileURLToPath} from 'node:url'
import {cpus, loadavg} from 'node:os'
import {readRows, benchmarkDir, localData, sizeOnDisk, megabytes, parseArguments, listOf} from './common.mjs'

const {words, named} = parseArguments(process.argv.slice(2))
if (!words[0]) { console.error('Usage: node strategies/rvss/eval/speed.mjs <strategy module> [--export <name>] [--options <file.json>] [--device cpu|any] [--limit <n>] [--model <path>]'); process.exit(2) }
const modulePath = resolve(words[0])
const device = named.device ?? 'cpu'
delete process.env.SOP_KNOWLEDGE_DIR
if (device === 'cpu') {
  process.env.CUDA_VISIBLE_DEVICES = ''
  for (const key of Object.keys(process.env)) if (/^SOP_NLU_\w*DEVICE$/u.test(key)) process.env[key] = 'cpu'
  process.env.SOP_NLU_DISTILBERT_DEVICE = 'cpu'
}
const threads = named.threads ? String(Number(named.threads)) : null
if (threads) for (const key of ['OMP_NUM_THREADS', 'MKL_NUM_THREADS', 'OPENBLAS_NUM_THREADS']) process.env[key] = threads

/** Files reached from a module by relative static imports, dynamic imports of a literal, and new URL(literal, import.meta.url). */
function reachedFiles(entry) {
  const seen = new Set(), queue = [entry], envNames = new Set()
  while (queue.length) {
    const file = queue.shift()
    if (seen.has(file) || !existsSync(file) || !statSync(file).isFile()) continue
    seen.add(file)
    const ext = extname(file)
    if (!['.mjs', '.js', '.cjs', '.py'].includes(ext)) continue
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/process\.env\.([A-Z0-9_]+)|process\.env\[['"]([A-Z0-9_]+)['"]\]|os\.environ(?:\.get)?[([]\s*['"]([A-Z0-9_]+)['"]/gu)) envNames.add(match[1] ?? match[2] ?? match[3])
    if (ext === '.py') continue
    const specifiers = [...source.matchAll(/(?:^|[\s;])(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|^import\s+['"](\.{1,2}\/[^'"]+)['"]|new URL\(\s*['"](\.{0,2}\/?[^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/gmu)]
      .map(match => match[1] ?? match[2] ?? match[3] ?? match[4])
    for (const specifier of specifiers) {
      const target = resolve(dirname(file), specifier)
      if (existsSync(target) && statSync(target).isFile()) queue.push(target)
    }
  }
  return {files: [...seen], envNames: [...envNames].sort()}
}

/** Resident memory (kB) of a process and all its descendants, from /proc. */
function treeRss(root = process.pid) {
  const children = new Map()
  for (const name of readdirSync('/proc').filter(name => /^\d+$/u.test(name))) {
    try { const stat = readFileSync(`/proc/${name}/stat`, 'utf8'); const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]); children.set(ppid, [...children.get(ppid) ?? [], Number(name)]) } catch { /* gone */ }
  }
  let total = 0, processes = 0
  const visit = pid => {
    try { const rss = /VmRSS:\s+(\d+)/u.exec(readFileSync(`/proc/${pid}/status`, 'utf8')); total += rss ? Number(rss[1]) : 0; processes++ } catch { return }
    for (const child of children.get(pid) ?? []) visit(child)
  }
  visit(root)
  return {kB: total, processes}
}

const stats = values => {
  const sorted = [...values].sort((a, b) => a - b), at = p => sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] : null
  const round = x => x === null ? null : Math.round(x * 1000) / 1000
  return {messages: sorted.length, median: round(at(0.5)), p90: round(at(0.9)), p99: round(at(0.99)), mean: round(sorted.reduce((s, x) => s + x, 0) / (sorted.length || 1)), max: round(sorted.at(-1) ?? null), first: round(values[0] ?? null)}
}

const sampleFile = resolve(named.sample ?? join(benchmarkDir, 'sample.json.gz'))
const limit = named.limit ? Number(named.limit) : Infinity
const texts = readRows(sampleFile).map(row => typeof row === 'string' ? row : row.text).filter(text => typeof text === 'string').slice(0, limit)
const options = named.options ? JSON.parse(readFileSync(resolve(named.options), 'utf8')) : {}
const loadBefore = loadavg()

const t0 = performance.now()
const {createReader} = await import(pathToFileURL(resolve(fileURLToPath(new URL('../../../lib/reader.mjs', import.meta.url)))).href)
const module = await import(pathToFileURL(modulePath).href)
const strategy = named.export ? module[named.export] : Object.values(module).find(value => value && typeof value === 'object' && value.schema === 'syntax')
if (!strategy || strategy.schema !== 'syntax') { console.error(`No export with schema 'syntax' in ${modulePath}${named.export ? ' named ' + named.export : ''}.`); process.exit(1) }
const t1 = performance.now()
const {knowledgeDir, strategy: _ignored, ...configuration} = options
const reader = await createReader({...configuration, strategy})
const t2 = performance.now()
const latencies = []
let valid = 0, errors = 0
for (const text of texts) {
  const start = performance.now()
  let result
  try { result = await reader.propose(text) } catch { errors++ }
  latencies.push(performance.now() - start)
  if (result?.candidates?.[0]?.sop) valid++
}
const rss = treeRss()
const t3 = performance.now()
try { await reader.close?.() } catch { /* measured already */ }
const loadAfter = loadavg()

const name = named.name ?? strategy.name ?? basename(dirname(modulePath))
const reached = reachedFiles(modulePath)
const code = reached.files.filter(file => ['.mjs', '.js', '.cjs', '.py'].includes(extname(file)))
const data = reached.files.filter(file => !code.includes(file))
const modelPaths = new Map()
for (const path of listOf(named.model)) if (existsSync(resolve(path))) modelPaths.set(resolve(path), '--model')
for (const [key, value] of Object.entries(configuration)) if (typeof value === 'string' && value.startsWith('/') && existsSync(value)) modelPaths.set(value, 'option ' + key)
for (const key of reached.envNames) {
  const value = process.env[key]
  if (!value || /PYTHON|DEVICE/u.test(key) || !value.includes('/') || !existsSync(value)) continue
  modelPaths.set(resolve(value), 'environment ' + key)
}
const bytes = files => files.reduce((sum, file) => sum + statSync(file).size, 0)
const modelEntries = [...modelPaths].map(([path, from]) => ({path, from, bytes: sizeOnDisk(path)}))
const result = {
  name, module: modulePath, export: named.export ?? Object.keys(module).find(key => module[key] === strategy), device,
  environment: {CUDA_VISIBLE_DEVICES: process.env.CUDA_VISIBLE_DEVICES ?? null, OMP_NUM_THREADS: process.env.OMP_NUM_THREADS ?? null, ...Object.fromEntries(reached.envNames.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]))},
  sample: sampleFile, messages: texts.length, valid, errors,
  importMs: Math.round(t1 - t0), openMs: Math.round(t2 - t1), startupMs: Math.round(t2 - t0),
  perMessageMs: stats(latencies), totalRunMs: Math.round(t3 - t2),
  rssAfterRun: {MB: megabytes(rss.kB * 1024), processes: rss.processes},
  size: {
    codeFiles: code.length, codeMB: megabytes(bytes(code)),
    dataFiles: data.map(file => ({file, bytes: statSync(file).size})), dataMB: megabytes(bytes(data)),
    modelPaths: modelEntries.map(entry => ({...entry, MB: megabytes(entry.bytes)})),
    modelMB: megabytes(bytes(data) + modelEntries.reduce((sum, entry) => sum + entry.bytes, 0))
  },
  machine: {cpus: cpus().length, loadBefore: loadBefore.map(x => +x.toFixed(2)), loadAfter: loadAfter.map(x => +x.toFixed(2))},
  measuredAt: new Date().toISOString()
}
const out = resolve(named.out ?? join(localData, 'eval/speed', `${name}-${device}${threads ? `-${threads}thread` : ''}.json`))
mkdirSync(dirname(out), {recursive: true})
writeFileSync(out, JSON.stringify(result, null, 2) + '\n')
const p = result.perMessageMs
console.log(`| Strategy | Device | Messages | Valid | Start-up ms (import + open) | Median ms | p90 ms | p99 ms | Mean ms | First ms | Model MB (data + model paths) | Code MB | RSS MB after run | Load before / after |`)
console.log(`| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |`)
console.log(`| ${name} | ${device} | ${result.messages} | ${valid} | ${result.startupMs} (${result.importMs} + ${result.openMs}) | ${p.median} | ${p.p90} | ${p.p99} | ${p.mean} | ${p.first} | ${result.size.modelMB} | ${result.size.codeMB} | ${result.rssAfterRun.MB} (${rss.processes} processes) | ${result.machine.loadBefore[0]} / ${result.machine.loadAfter[0]} of ${result.machine.cpus} CPUs |`)
console.log(`Model paths: ${modelEntries.map(entry => `${entry.path} (${entry.from}, ${megabytes(entry.bytes)} MB)`).join('; ') || 'none'}. Data files: ${data.map(file => `${file} (${megabytes(statSync(file).size)} MB)`).join('; ') || 'none'}.`)
console.error(`Written: ${out}`)
process.exit(0)
