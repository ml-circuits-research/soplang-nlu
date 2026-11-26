// Run the public reader on the existing development split without passing labels.
import {createHash} from 'node:crypto'
import {readFileSync, writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {gunzipSync, gzipSync} from 'node:zlib'
import {performance} from 'node:perf_hooks'

const [inputPath, outputPath] = process.argv.slice(2)
const knowledgeDir = process.env.SOP_KNOWLEDGE_DIR
if (!inputPath || !outputPath || !knowledgeDir) {
  throw Error('Expected DEV.jsonl.gz OUTPUT.jsonl.gz and SOP_KNOWLEDGE_DIR.')
}
const paths = ['lib/reader.mjs', 'strategies/z3/index.mjs', 'lib/check-analysis.mjs']
const [{createReader}, {z3}, {hasCompleteSource}] = await Promise.all(
  paths.map(path => import(pathToFileURL(resolve(path)))))
const bytes = readFileSync(inputPath)
const input = gunzipSync(bytes).toString().trim().split('\n').map((line, i) => {
  const {id, text} = JSON.parse(line)
  return {id, text, i}
})
const start = performance.now()
const reader = await createReader({strategy:z3, knowledgeDir:resolve(knowledgeDir)})
const startupMs = performance.now() - start
const rows = []
try {
  for (const item of input) {
    const began = performance.now()
    const cpuStart = process.cpuUsage()
    const result = await reader.propose(item.text)
    const ms = performance.now() - began
    const cpu = process.cpuUsage(cpuStart)
    const candidates = result.candidates.map(({sop, check}) => ({sop, complete:hasCompleteSource(check)}))
    if (candidates.length > 2) throw Error('Public reading budget exceeded.')
    rows.push({...item, ms, cpuMs:(cpu.user + cpu.system)/1000, candidates,
      rejected:result.rejected?.length ?? 0, error:result.error ?? null,
      status:result.analysisDiagnostics?.status ?? null})
  }
} finally {
  await reader.close()
}
writeFileSync(outputPath, gzipSync(rows.map(row => JSON.stringify(row)).join('\n') + '\n'), {flag:'wx'})
console.log(JSON.stringify({rows:rows.length, startupMs, elapsedMs:performance.now()-start,
  inputSha256:createHash('sha256').update(bytes).digest('hex')}))
