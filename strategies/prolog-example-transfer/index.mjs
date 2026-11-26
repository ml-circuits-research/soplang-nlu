import {readFile} from 'node:fs/promises'
import {prolog} from '../prolog/index.mjs'
import {catalogIssues} from '../prolog/src/catalog.mjs'
import {countOperandConflicts} from '../prolog/src/count-operands.mjs'
import {evidenceReport} from '../prolog/src/evidence.mjs'
import {evidenceInText} from '../prolog/src/grounding.mjs'
import {openKnowledge, withKnowledge} from '../prolog/src/knowledge.mjs'
import {tokens} from '../prolog/src/lexicon.mjs'
import {numericSettingsInOwnedQuotes} from '../prolog/src/literal-attachment.mjs'
import {prologWorker} from '../prolog/src/prolog-worker.mjs'
import {validate} from '../prolog/src/schema.mjs'
import {signatures} from '../prolog/src/signatures.mjs'
import {loadWorlds} from '../prolog/src/worlds.mjs'
import {modelVersion, trainExampleTransfer} from './train.mjs'

export {trainExampleTransfer}

const name = 'prolog-example-transfer'
const atom = /^[\p{L}\p{N}_][\p{L}\p{M}\p{N}_.-]*$|^[+-]?\d+(?:\.\d+)?$/u
const slotKinds = new Set(['number', 'date', 'time', 'quoted', 'phrase'])

function validBlueprint(blueprint, width) {
  return Array.isArray(blueprint) && blueprint.length && blueprint.every(wire =>
    typeof wire?.id === 'string' && typeof wire.type === 'string' && wire.attrs &&
    typeof wire.attrs === 'object' && !Array.isArray(wire.attrs) &&
    Object.values(wire.attrs).every(values => Array.isArray(values) && values.every(value =>
      typeof value === 'string' || value && Number.isInteger(value.from) && Number.isInteger(value.to) &&
      value.from >= 0 && value.from < value.to && value.to <= width && typeof value.quoted === 'boolean')))
}

function compileModel(model) {
  if (model?.version !== modelVersion || !Array.isArray(model.templates)) {
    throw new TypeError('Unsupported example transfer model')
  }
  const frequencies = new Map()
  for (const entry of model.templates) {
    const {pattern, support, blueprint} = entry ?? {}
    if (!Array.isArray(pattern) || !pattern.length || !validBlueprint(blueprint, pattern.length) ||
        !Number.isInteger(support) || support < 1 || pattern.some(part => typeof part !== 'string' &&
          (!slotKinds.has(part?.kind) || !Number.isInteger(part.min) || !Number.isInteger(part.max) ||
            part.min < 1 || part.max < part.min || part.max > 160 ||
            part.delimiter !== undefined && !['"', "'", '”', '’'].includes(part.delimiter)))) {
      throw new TypeError('Malformed example transfer template')
    }
    for (const literal of new Set(pattern.filter(part => typeof part === 'string'))) {
      frequencies.set(literal, (frequencies.get(literal) ?? 0) + 1)
    }
  }
  const indexed = new Map()
  for (const [index, {pattern, support}] of model.templates.entries()) {
    const literals = pattern.filter(part => typeof part === 'string')
    if (!literals.length) throw new TypeError('Example transfer templates require literal anchors')
    const anchor = literals.reduce((best, key) => frequencies.get(key) < frequencies.get(best) ? key : best)
    const min = pattern.reduce((length, part) => length + (part.min ?? 1), 0)
    const max = pattern.reduce((length, part) => length + (part.max ?? 1), 0)
    const entry = {index, pattern, support, min, max, anchors: literals.length, first: pattern[0], last: pattern.at(-1)}
    if (!indexed.has(anchor)) indexed.set(anchor, [])
    indexed.get(anchor).push(entry)
  }
  return {indexed, templates: model.templates}
}

function viable(indexed, input) {
  const keys = input.map(([, raw]) => raw)
  const from = keys[0], to = keys.at(-1)
  const eligible = []
  for (const key of new Set(keys)) {
    for (const entry of indexed.get(key) ?? []) {
      if (entry.min > keys.length || entry.max < keys.length ||
          typeof entry.first === 'string' && entry.first !== from ||
          typeof entry.last === 'string' && entry.last !== to) continue
      let offset = 0
      if (!entry.pattern.every(part => {
        if (typeof part !== 'string') {
          offset += part.min
          return offset <= keys.length
        }
        const found = keys.indexOf(part, offset)
        if (found < 0) return false
        offset = found + 1
        return true
      })) continue
      eligible.push(entry)
    }
  }
  eligible.sort((a, b) => b.anchors - a.anchors || b.support - a.support || a.index - b.index)
  return eligible.slice(0, 160).map(({index, pattern}) => ({index, pattern}))
}

function render(template, bounds, input, text) {
  const characters = Array.from(text)
  const range = (from, to) => [input[bounds[from][0]][2], input[bounds[to - 1][1] - 1][3]]
  const span = ([a, b]) => characters.slice(a, b).join('')
  const wires = template.blueprint.map(({id, type, attrs}) => ({id, type,
    attrs: Object.fromEntries(Object.entries(attrs).map(([key, values]) => [
      key, values.map(value => {
        if (typeof value === 'string') return value
        const written = span(range(value.from, value.to))
        return value.quoted || !atom.test(written) ? JSON.stringify(written) : written
      })
    ]))
  }))
  const slots = template.pattern.flatMap((part, index) => {
    if (typeof part === 'string') return []
    const [start, end] = range(index, index + 1)
    return [{kind: part.kind, text: span([start, end]), start, end}]
  })
  return {wires, slots}
}

export const prologExampleTransfer = {
  name,
  async open({
    modelPath,
    knowledgeDir = process.env.SOP_KNOWLEDGE_DIR,
    worldPaths,
    swipl = process.env.SWIPL || 'swipl',
    evidence = true,
    languageFrames = true,
    ...unknown
  } = {}) {
    if (Object.keys(unknown).length) {
      throw new TypeError('Unsupported example transfer options: ' + Object.keys(unknown).join(', '))
    }
    if (typeof modelPath !== 'string' || !modelPath) throw new TypeError('Expected an explicit example transfer model path')
    if (!knowledgeDir) throw new TypeError('Expected a SOP knowledge directory')
    const modelStart = performance.now()
    const {indexed, templates} = compileModel(JSON.parse(await readFile(modelPath, 'utf8')))
    const modelLoadMs = performance.now() - modelStart

    const installation = await openKnowledge(knowledgeDir)
    const worlds = withKnowledge(installation, () => loadWorlds({paths: worldPaths}))
    const symbolic = await prolog.open({knowledgeDir, worldPaths, swipl, evidence, languageFrames})
    const matcher = prologWorker(new URL('./match.pl', import.meta.url), swipl)
    return {
      modelLoadMs,
      async propose(text) {
        const base = await symbolic.propose(text)
        if (base.error || typeof text !== 'string') return {...base, engine: name}
        const input = tokens(text)
        const possible = viable(indexed, input)
        if (!possible.length) return {...base, engine: name}
        let matches
        try {
          matches = await matcher.request({text, tokens: input, templates: possible})
        } catch (error) {
          return {...base, engine: name, error: error instanceof Error ? error.message : String(error)}
        }
        return withKnowledge(installation, async () => {
          const {parse, serialize} = installation.api
          const key = wires => JSON.stringify(signatures(wires, true))
          const seen = new Set(base.candidates.map(candidate => key(parse(candidate.sop))))
          const transferred = []
          for (const {index, bounds} of matches) {
            const template = templates[index]
            const {wires, slots} = render(template, bounds, input, text)
            const sop = serialize(wires).trimEnd()
            const signature = key(wires)
            if (seen.has(signature) || !validate(sop, worlds) || !evidenceInText(text, sop, worlds) ||
                catalogIssues(wires, worlds).length || countOperandConflicts(text, wires, worlds).length ||
                numericSettingsInOwnedQuotes(text, wires, worlds).length) continue
            seen.add(signature)
            const candidate = {sop, source: name, support: template.support, status: 'matched', transfer: {slots}}
            transferred.push(evidence ? {...candidate, evidence: evidenceReport(text, wires, worlds.evidenceVocabulary),
              catalog: {issues: []}} : candidate)
            if (transferred.length === 12) break
          }
          if (!transferred.length) return {...base, engine: name}
          const {unread: _unread, ...result} = base
          let candidates = [...base.candidates, ...transferred]
          let analyses = base.analyses
          let analysisDiagnostics = base.analysisDiagnostics
          try {
            const decorated = await symbolic.decorateAnalyses(text, transferred)
            candidates = [...base.candidates, ...decorated.candidates]
            analyses = [...new Map([...analyses, ...decorated.analyses].map(candidate => [candidate.sop, candidate])).values()]
          } catch (error) {
            analysisDiagnostics = {solver:'swipl', status:'error',
              error:error instanceof Error ? error.message : String(error)}
          }
          return {...result, engine: name, candidates, analyses, analysisDiagnostics, candidateCount: candidates.length,
            multipleInterpretations: candidates.length > 1, unresolved: base.candidates.length ? base.unresolved : []}
        })
      },
      async close() {
        const results = await Promise.allSettled([matcher.close(), symbolic.close()])
        for (const result of results) if (result.status === 'rejected') throw result.reason
      }
    }
  }
}
