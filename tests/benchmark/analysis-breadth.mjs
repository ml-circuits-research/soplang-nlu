import {writeFile} from 'node:fs/promises'
import {resolve, join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {parseArgs} from 'node:util'
import {createReader} from '../../lib/index.mjs'
import {fixtureVersion, fixtures} from './analysis-fixtures.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const decode = value => value.startsWith('"') ? JSON.parse(value) : value
const reference = value => typeof value === 'string' && value.startsWith('$')

function literalMatch(actual, expected) {
  if (expected === null) return actual.length === 0
  if (typeof expected === 'object' && expected.oneOf) {
    return actual.length === 1 && expected.oneOf.includes(actual[0])
  }
  if (typeof expected === 'object' && !Array.isArray(expected) && expected.includes) {
    return actual.some(value => value.includes(expected.includes))
  }
  const values = Array.isArray(expected) ? expected : [expected]
  return actual.length === values.length && values.every(value => reference(value) || actual.includes(value))
}

export function matchExpectedAnalysis(wires, expected) {
  const requiredTypes = new Map()
  const actualTypes = new Map()
  for (const node of expected) requiredTypes.set(node.type, (requiredTypes.get(node.type) ?? 0) + 1)
  for (const wire of wires) actualTypes.set(wire.type, (actualTypes.get(wire.type) ?? 0) + 1)
  const shape = [...new Set([...requiredTypes.keys(), ...actualTypes.keys()])].flatMap(type => {
    const wanted = requiredTypes.get(type) ?? 0
    const actual = actualTypes.get(type) ?? 0
    return wanted === actual ? [] : [{type, wanted, actual}]
  })
  const slots = (wire, key) => (wire.attrs[key] ?? []).map(decode)
  const domains = expected.map(node => ({
    node,
    choices: wires.filter(wire => wire.type === node.type &&
      Object.entries(node.slots).every(([key, expected]) => literalMatch(slots(wire, key), expected)))
  })).sort((a, b) => a.choices.length - b.choices.length)
  const missing = domains.filter(entry => !entry.choices.length).map(({node}) => node.label)
  if (shape.length || missing.length) return {matched: false, shape, missing, linkMismatch: false}

  const assigned = new Map()
  const used = new Set()
  function compatible() {
    for (const {node} of domains) {
      const wire = assigned.get(node.label)
      if (!wire) continue
      for (const [key, value] of Object.entries(node.slots)) {
        const references = (Array.isArray(value) ? value : [value]).filter(reference)
        for (const ref of references) {
          const target = assigned.get(ref.slice(1))
          if (target && !slots(wire, key).includes('$' + target.id)) return false
        }
      }
    }
    return true
  }
  function search(index) {
    if (index === domains.length) return true
    const {node, choices} = domains[index]
    for (const wire of choices) {
      if (used.has(wire.id)) continue
      used.add(wire.id)
      assigned.set(node.label, wire)
      if (compatible() && search(index + 1)) return true
      assigned.delete(node.label)
      used.delete(wire.id)
    }
    return false
  }
  const matched = search(0)
  return {matched, shape, missing, linkMismatch: !matched}
}

const entries = {
  z3: ['../../strategies/z3/index.mjs', 'z3'],
  prolog: ['../../strategies/prolog/index.mjs', 'prolog'],
  'prolog-example-transfer': ['../../strategies/prolog-example-transfer/index.mjs', 'prologExampleTransfer']
}

async function runStrategy(name, settings, cases, parse) {
  const [entry, symbol] = entries[name]
  const strategy = (await import(entry))[symbol]
  const config = name === 'z3'
    ? {topK: settings.topK, ...(settings.z3Module ? {z3Module: settings.z3Module} : {})}
    : {...(settings.swipl ? {swipl: settings.swipl} : {}), ...(settings.modelPath && name === 'prolog-example-transfer'
      ? {modelPath: settings.modelPath} : {})}
  const start = performance.now()
  const reader = await createReader({strategy, knowledgeDir: settings.knowledgeDir, ...config})
  const startupMs = performance.now() - start
  const rows = []
  try {
    for (const fixture of cases) {
      const started = performance.now()
      const row = {id: fixture.id, category: fixture.category, text: fixture.text, candidates: []}
      try {
        const result = await reader.propose(fixture.text)
        row.error = result.error
        row.candidates = result.candidates.map(candidate => {
          const check = candidate.check
          return {
            sop: candidate.sop, check,
            expected: check?.valid
              ? fixture.alternatives.map(expected => matchExpectedAnalysis(parse(candidate.sop), expected))
              : []
          }
        })
      } catch (error) {
        row.error = error.message
      }
      row.latencyMs = performance.now() - started
      row.hasSchemaValidCircuit = row.candidates.some(candidate => candidate.check?.schemaValid)
      row.hasValidCircuit = row.candidates.some(candidate => candidate.check?.valid)
      row.hasAccountedSource = row.candidates.some(candidate => candidate.check?.valid &&
        candidate.check.coverage.allAccountedFor)
      row.hasNoUnresolvedSource = row.candidates.some(candidate => candidate.check?.valid &&
        candidate.check.coverage.allAccountedFor && candidate.check.coverage.unresolved === 0)
      row.hasExpectedReading = row.candidates.some(candidate => candidate.expected.some(result => result.matched))
      rows.push(row)
    }
  } finally {
    await reader.close()
  }
  return {
    strategy: name, startupMs, wallMs: performance.now() - start,
    summary: {
      rows: rows.length, errors: rows.filter(row => row.error).length,
      schemaValidCircuit: rows.filter(row => row.hasSchemaValidCircuit).length,
      validCircuit: rows.filter(row => row.hasValidCircuit).length,
      accountedSource: rows.filter(row => row.hasAccountedSource).length,
      noUnresolvedSource: rows.filter(row => row.hasNoUnresolvedSource).length,
      expectedReading: rows.filter(row => row.hasExpectedReading).length,
    },
    rows
  }
}

async function main() {
  const {values} = parseArgs({
    options: {
      help: {type: 'boolean'}, strategies: {type: 'string', default: 'z3,prolog'},
      case: {type: 'string', multiple: true}, knowledge: {type: 'string'},
      output: {type: 'string'}, 'model-path': {type: 'string'},
      'z3-module': {type: 'string'}, swipl: {type: 'string'},
      'top-k': {type: 'string', default: '4'}
    }
  })
  if (values.help) {
    console.log('Usage: node tests/benchmark/analysis-breadth.mjs [--strategies z3,prolog] [--case ID ...] [--output FILE]')
    console.log('Options: --knowledge DIR --z3-module FILE --swipl FILE --top-k N --model-path FILE')
    return
  }
  const strategies = values.strategies.split(',').map(name => name.trim())
  if (new Set(strategies).size !== strategies.length || strategies.some(name => !Object.hasOwn(entries, name))) {
    throw Error('Specify a comma-separated list of distinct supported strategy names.')
  }
  if (values.case?.some(id => !fixtures.some(fixture => fixture.id === id))) {
    throw Error('Unknown breadth diagnostic fixture ID.')
  }
  const cases = fixtures.filter(fixture => !values.case || values.case.includes(fixture.id))
  const workspace = resolve(process.env.SOP_WORKSPACE ?? join(root, '..'))
  const settings = {
    knowledgeDir: resolve(values.knowledge ?? process.env.SOP_KNOWLEDGE_DIR ?? process.env.KNOWLEDGE_DIR ??
      join(workspace, 'sop-knowledge-worlds')),
    swipl: values.swipl ?? process.env.SWIPL,
    z3Module: values['z3-module'] ?? process.env.Z3_MODULE,
    modelPath: values['model-path'] && resolve(values['model-path']),
    topK: Number(values['top-k'])
  }
  if (settings.z3Module) settings.z3Module = resolve(settings.z3Module)
  if (!Number.isSafeInteger(settings.topK) || settings.topK < 1) throw Error('--top-k must be a positive integer.')
  const {parse} = await import(pathToFileURL(join(settings.knowledgeDir, 'tools/sopworld/sopworld.mjs')))
  const reports = []
  for (const name of strategies) {
    console.log('Running', name, 'on', cases.length, fixtureVersion, 'fixtures')
    try {
      const report = await runStrategy(name, settings, cases, parse)
      reports.push(report)
      console.log(JSON.stringify({strategy: name, ...report.summary}))
      console.log('Missing expected reading:', report.rows.filter(row => !row.hasExpectedReading).map(row => row.id).join(', ') || 'none')
      if (report.summary.errors) process.exitCode = 1
    } catch (error) {
      reports.push({strategy: name, error: error.message})
      console.error(name, error.message)
      process.exitCode = 1
    }
  }
  if (values.output) await writeFile(resolve(values.output), JSON.stringify({fixtureVersion, settings, reports}, null, 2) + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main()
}
