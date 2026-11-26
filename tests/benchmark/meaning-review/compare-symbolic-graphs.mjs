import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { createAnalysisValidator, hasCompleteSource } from '../../../lib/check-analysis.mjs'

const engines = ['z3', 'prolog-worlds']
import {directedGraph,sameDirectedGraph} from '../../../lib/directed-graph.mjs'
export {directedGraph,sameDirectedGraph} from '../../../lib/directed-graph.mjs'
const projections = ['strict','syntax']
const normalizeSop = sop => sop.replace(/\r\n?/g, '\n').trim()
const candidatesFor = (row, text, validate, parse) => {
  const attempts = [...row.candidates, ...(row.rejected ?? []).map(({sop}) => sop)]
  const unique = new Map()
  for (const [index, sop] of attempts.entries()) {
    const key = normalizeSop(sop)
    if (!unique.has(key) && hasCompleteSource(validate(text, sop))) {
      const wires = parse(sop)
      unique.set(key, {index, graphs: Object.fromEntries(projections.map(p => [p, directedGraph(wires, p)]))})
    }
  }
  return unique
}

const verdict = (left, right) => Object.fromEntries(projections.map(p =>
  [p, sameDirectedGraph(left.graphs[p], right.graphs[p])]))

const candidatesAgree = (left, right) => Object.fromEntries(projections.map(p => [p,
  [...left.values()].some(a => [...right.values()].some(b => sameDirectedGraph(a.graphs[p], b.graphs[p])))
]))

const read = (file) => {
  const contents = readFileSync(file)
  return (file.endsWith('.gz') ? gunzipSync(contents) : contents).toString('utf8')
}
const jsonl = (file) => read(file).split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line))
const mapById = (rows, label) => {
  const result = new Map(rows.map(row => [row.id, row]))
  if (result.size !== rows.length) throw new Error('Duplicate row IDs in ' + label)
  return result
}

export async function compareFrozenGraphs(run, knowledgeDir, judgmentsFile) {
  const {parse} = await import(pathToFileURL(join(resolve(knowledgeDir), 'tools/sopworld/sopworld.mjs')))
  const validate = await createAnalysisValidator({knowledgeDir})
  const sample = JSON.parse(read(join(run, 'sample.json.gz')))
  const inputs = mapById(sample, 'sample')
  const predictions = engines.map(engine => mapById(jsonl(join(run, engine + '.jsonl.gz')), engine))
  const judgments = judgmentsFile ? jsonl(judgmentsFile) : []
  const byEngine = judgmentsFile && engines.map(engine => mapById(judgments.filter(row => row.engine === engine), engine + ' judgments'))
  for (const [index, rows] of predictions.entries()) {
    if (rows.size !== inputs.size || (byEngine && byEngine[index].size !== inputs.size)) {
      throw new Error('Missing predictions or judgments for ' + engines[index])
    }
  }

  const eligibleRows = []
  const acceptedRows = []
  const complete = Object.fromEntries(engines.map(engine => [engine, 0]))
  const accepted = byEngine ? {...complete} : null
  for (const {id, text} of inputs.values()) {
    const candidates = predictions.map((rows, engine) => {
      const row = rows.get(id)
      if (!row || row.evaluatedSchema !== 'nlu') throw new Error('Missing native predictions for ' + id)
      const result = candidatesFor(row, text, validate, parse)
      if (result.size) complete[engines[engine]]++
      return result
    })
    let overlap
    if (candidates.every(group => group.size)) {
      overlap = candidatesAgree(...candidates)
      eligibleRows.push({id, ...overlap})
    }
    if (!byEngine) continue
    const judgments = byEngine.map((rows, engine) => {
      const item = rows.get(id)
      if (!item || (item.text !== undefined && item.text !== text)) throw new Error('Missing or mismatched judgment for ' + id)
      if (item.grade < 8) return null
      accepted[engines[engine]]++
      const selected = typeof item.sop === 'string' && candidates[engine].get(normalizeSop(item.sop))
      if (!selected) throw new Error('Accepted witness is not a complete emitted circuit for ' + id + ' / ' + engines[engine])
      return selected
    })
    if (judgments.every(Boolean)) {
      const [z3, prolog] = judgments
      acceptedRows.push({id, ...verdict(z3, prolog), anyCompleteOverlap: overlap,
        witnesses: {z3: z3.index, 'prolog-worlds': prolog.index}})
    }
  }
  const stats = (rows) => ({rows: rows.length,
    strictAgreement: rows.filter(row => row.strict).length,
    syntaxAgreement: rows.filter(row => row.syntax).length})
  return {
    sample: sample.length, engines,
    complete, completeCandidateSets: stats(eligibleRows), completeRows: eligibleRows,
    accepted, jointlyAcceptedWitnesses: byEngine ? stats(acceptedRows) : null, acceptedRows
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [run, knowledgeDir, output, judgments] = process.argv.slice(2)
  if (!run || !knowledgeDir || !output) {
    console.error('Usage: node compare-symbolic-graphs.mjs RUN KNOWLEDGE_DIR OUTPUT.json [NATIVE_JUDGMENTS.jsonl.gz]')
    process.exitCode = 1
  } else {
    const report = await compareFrozenGraphs(run, knowledgeDir, judgments)
    writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
    const {sample, complete, completeCandidateSets, accepted, jointlyAcceptedWitnesses} = report
    console.log(JSON.stringify({sample, complete, completeCandidateSets, accepted, jointlyAcceptedWitnesses}))
  }
}
