import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { createAnalysisValidator, hasCompleteSource } from '../../../lib/check-analysis.mjs'

const engines = ['z3', 'prolog-worlds']
const projections = ['strict', 'syntax']
const optionalSemantics = {
  'nlu.clause': new Set(['act', 'result_color']),
  'nlu.entity': new Set(['kind', 'color'])
}
const connectives = new Map([
  ['additive', 'and'], ['conjunctive', 'and'],
  ['alternative', 'or'], ['disjunctive', 'or']
])
const byText = (left, right) => left < right ? -1 : left > right ? 1 : 0
const encode = JSON.stringify
const normalizeSop = sop => sop.replace(/\r\n?/g, '\n').trim()

export function directedGraph(wires, projection) {
  if (!projections.includes(projection)) throw new RangeError('Unknown graph projection ' + projection)
  const ids = new Map(wires.map(({id}, index) => ['$' + id, index]))
  const nodes = wires.map(({type, attrs}) => {
    const slots = []
    const outgoing = new Map()
    const orderedMembers = type === 'nlu.coordination' && ['sequence', 'contrast'].includes(attrs.kind?.[0])
    for (const [key, values] of Object.entries(attrs).sort(([a], [b]) => byText(a, b))) {
      if (projection === 'syntax' && (optionalSemantics[type]?.has(key) ||
        (type === 'nlu.clause' && key === 'polarity' && values.join() === 'positive' && !attrs.negation))) continue
      const literals = []
      for (const [index, raw] of values.entries()) {
        if (raw.startsWith('$')) {
          const target = ids.get(raw)
          if (target === undefined) throw new Error('Missing graph node ' + raw)
          if (!outgoing.has(target)) outgoing.set(target, [])
          outgoing.get(target).push(orderedMembers && key === 'member' ? key + ':' + index : key)
        } else {
          const atom = projection === 'syntax' && type === 'nlu.coordination' && key === 'kind'
            ? connectives.get(raw) ?? raw : raw
          literals.push(raw.startsWith('"') ? ['source', JSON.parse(raw)] : ['atom', atom])
        }
      }
      if (literals.length) slots.push([key, literals.sort((a, b) => byText(encode(a), encode(b)))])
    }
    return {label: encode([type, slots]), outgoing, incoming: new Map()}
  })
  for (const [source, node] of nodes.entries()) {
    for (const [target, roles] of node.outgoing) {
      const edge = encode(roles.sort(byText))
      node.outgoing.set(target, edge)
      nodes[target].incoming.set(source, edge)
    }
  }
  return nodes
}

// Refine the two graphs together so equal color numbers name the same
// structural class. Exact matching checks ambiguous classes without assuming
// color refinement proves isomorphism.
function compatibleColors(left, right) {
  const assign = (labels) => {
    const names = [...new Set(labels.flat())].sort(byText)
    const ids = new Map(names.map((name, index) => [name, index]))
    return {count: names.length, colors: labels.map(group => group.map(name => ids.get(name)))}
  }
  const graphs = [left, right]
  let state = assign(graphs.map(nodes => nodes.map(({label}) => label)))
  const sameCounts = ([a, b]) => encode(a.toSorted((i,j)=>i-j)) === encode(b.toSorted((i,j)=>i-j))
  while (sameCounts(state.colors)) {
    const next = assign(graphs.map((nodes, side) => nodes.map((node, index) => {
      const neighbors = links => [...links].map(([other, roles]) => encode([roles, state.colors[side][other]])).sort(byText)
      return encode([state.colors[side][index], neighbors(node.outgoing), neighbors(node.incoming)])
    })))
    if (next.count === state.count) return next.colors
    state = next
  }
  return null
}

export function sameDirectedGraph(left, right) {
  if (left.length !== right.length) return false
  const classColors = compatibleColors(left, right)
  if (!classColors) return false
  const [leftColors, rightColors] = classColors
  const candidates = left.map((node, index) => right.flatMap((other, target) =>
    leftColors[index] === rightColors[target] && node.label === other.label ? [target] : []))
  const order = left.map((_, index) => index).sort((i,j) =>
    candidates[i].length - candidates[j].length ||
    left[j].outgoing.size + left[j].incoming.size - left[i].outgoing.size - left[i].incoming.size)
  const matched = new Map()
  const used = new Set()
  function search(index) {
    if (index === order.length) return true
    const source = order[index]
    for (const target of candidates[source]) {
      if (used.has(target) || left[source].outgoing.get(source) !== right[target].outgoing.get(target)) continue
      const consistent = [...matched].every(([a, b]) =>
        left[source].outgoing.get(a) === right[target].outgoing.get(b) &&
        left[source].incoming.get(a) === right[target].incoming.get(b))
      if (!consistent) continue
      matched.set(source, target)
      used.add(target)
      if (search(index + 1)) return true
      matched.delete(source)
      used.delete(target)
    }
    return false
  }
  return search(0)
}

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
