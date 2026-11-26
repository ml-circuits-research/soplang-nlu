import {readFile} from 'node:fs/promises'
import {resolve, join} from 'node:path'
import {pathToFileURL} from 'node:url'

const baseSchema = new URL('../schemas/nlu/schema.sop', import.meta.url)
const first = (wire, key) => wire.attrs[key]?.[0]
const decode = raw => raw.startsWith('"') ? JSON.parse(raw) : raw
const tokenPattern = /[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*|[^\s]/gu
const atom = /^[^"\s=$@]+$/u

function declaredTypes(parse, schemas) {
  const types = new Map()
  const slots = []
  for (const schema of schemas) {
    for (const wire of parse(schema)) {
      if (wire.type === 'core.module') continue
      if (wire.type === 'core.slot') {
        slots.push(wire)
        continue
      }
      const type = first(wire, 'of')
      if (wire.type !== 'core.type' || !type?.startsWith('nlu.') || first(wire, 'closed') !== 'true' ||
          first(wire, 'extends')) {
        throw Error('Analysis schemas must declare closed nlu types: ' + wire.id)
      }
      if (types.has(type)) throw Error('Duplicate analysis type: ' + type)
      types.set(type, new Map())
    }
  }
  for (const wire of slots) {
    const type = first(wire, 'of')
    const key = first(wire, 'key')
    const kind = first(wire, 'kind')
    const options = wire.attrs.enum
    const targets = wire.attrs.type ?? wire.attrs.to ?? []
    const fields = types.get(type)
    if (!fields || !key || !['string', 'atom', 'ref', undefined].includes(kind) ||
        (kind === undefined && !options?.length) ||
        ((kind === 'ref' || kind === 'string') && options) ||
        (kind === 'ref' && (!targets.length || targets.some(target => !types.has(target)))) ||
        (kind !== 'ref' && targets.length) ||
        ((wire.attrs.to?.length ?? 0) > 1) || (wire.attrs.to && wire.attrs.type)) {
      throw Error('Unsupported analysis slot declaration: ' + wire.id)
    }
    if (fields.has(key)) throw Error('Duplicate analysis slot: ' + type + '.' + key)
    fields.set(key, {
      kind, options, targets, required: first(wire, 'required') === 'true' || first(wire, 'present') === 'true',
      many: first(wire, 'many') === 'true'
    })
  }
  return types
}

function checkStructure(wires, types, findings) {
  const evidence = []
  const byId = new Map(wires.map(wire => ['$' + wire.id, wire]))
  const issue = (code, wire, key, value) => findings.push({code, wire: wire.id, key, value})
  for (const wire of wires) {
    const fields = types.get(wire.type)
    if (!fields || wire.pattern) {
      issue('unknown-analysis-type', wire, undefined, wire.type)
      continue
    }
    for (const [key, field] of fields) {
      if (field.required && !wire.attrs[key]?.length) issue('missing-slot', wire, key)
    }
    for (const [key, values] of Object.entries(wire.attrs)) {
      const field = fields.get(key)
      if (!field) {
        issue('unknown-slot', wire, key)
        continue
      }
      if (!field.many && values.length > 1) issue('duplicate-slot', wire, key)
      for (const raw of values) {
        if (field.kind === 'ref') {
          const target = byId.get(raw)
          if (!target || !field.targets.includes(target.type)) {
            issue('invalid-reference', wire, key, raw)
          } else if (wire.type === 'nlu.clause' && target.type === 'nlu.coordination' &&
                     (target.attrs.member ?? []).some(member => byId.get(member)?.type !== 'nlu.entity')) {
            issue('wrong-coordination-role', wire, key, raw)
          }
        } else if (field.kind === 'string') {
          let surface
          try { surface = decode(raw) } catch { /* Report with the invalid quote below. */ }
          if (!raw.startsWith('"') || typeof surface !== 'string' || !surface.trim()) {
            issue('expected-source-quote', wire, key, raw)
          } else {
            const category = key === 'unresolved' || key === 'filler' ? key : 'understood'
            evidence.push({wire: wire.id, key, text: surface, category})
          }
        } else if (!atom.test(raw) || (field.options && !field.options.includes(raw))) {
          issue('invalid-atom', wire, key, raw)
        }
      }
    }
    if (wire.type === 'nlu.entity' && !['head', 'name', 'pronoun', 'unresolved'].some(key => wire.attrs[key]?.length)) {
      issue('missing-entity-evidence', wire)
    }
    if (wire.type === 'nlu.coordination') {
      const members = wire.attrs.member ?? []
      if (members.length < 2 || new Set(members).size !== members.length) issue('invalid-coordination-members', wire, 'member')
      const categories = new Set(members.map(member => byId.get(member)?.type).filter(Boolean))
      if (categories.size > 1) issue('mixed-coordination-members', wire, 'member')
    }
  }
  if (!wires.some(wire => wire.type === 'nlu.clause')) findings.push({code: 'missing-clause'})
  return evidence
}

function occurrenceIndex(text, tokens) {
  const starts = new Map(tokens.map((token, i) => [token.index, i]))
  const ends = new Map(tokens.map((token, i) => [token.index + token[0].length, i + 1]))
  return surface => {
    const occurrences = []
    for (let offset = 0; offset <= text.length - surface.length;) {
      const position = text.indexOf(surface, offset)
      if (position === -1) break
      offset = position + 1
      const start = starts.get(position)
      const end = ends.get(position + surface.length)
      if (start === undefined || end === undefined) continue
      const mask = ((1n << BigInt(end - start)) - 1n) << BigInt(start)
      occurrences.push({start, end, mask})
    }
    return occurrences
  }
}

// Equal quoted surfaces share a group. Candidate placements within a group
// are interchangeable for overlap checks, so search combinations rather than
// permutations. A bounded search reports unknown coverage on hard instances.
function assignOccurrences(groups) {
  const direct = new Map()
  let occupied = 0n
  for (const group of groups) {
    const placements = []
    for (const occurrence of group.occurrences) {
      if (occupied & occurrence.mask) continue
      occupied |= occurrence.mask
      placements.push(occurrence)
      if (placements.length === group.claims.length) break
    }
    if (placements.length !== group.claims.length) break
    direct.set(group, placements)
  }
  if (direct.size === groups.length) return {matching: direct, exhausted: false}
  if (groups.reduce((sum, group) => sum + group.claims.length, 0) > 1000) {
    return {matching: null, exhausted: true}
  }
  const chosen = new Map()
  let budget = 100000
  function assign(index, occupied) {
    if (index === groups.length) return true
    const {claims, occurrences} = groups[index]
    const available = occurrences.filter(occurrence => !(occupied & occurrence.mask))
    if (available.length < claims.length) return false
    const placements = []
    function place(start, used) {
      if (--budget < 0) return false
      if (placements.length === claims.length) {
        chosen.set(groups[index], [...placements])
        if (assign(index + 1, used)) return true
        chosen.delete(groups[index])
        return false
      }
      for (let i = start; i <= available.length - (claims.length - placements.length); i++) {
        const occurrence = available[i]
        if (used & occurrence.mask) continue
        placements.push(occurrence)
        if (place(i + 1, used | occurrence.mask)) return true
        placements.pop()
        if (budget < 0) return false
      }
      return false
    }
    return place(0, occupied)
  }
  return {matching: assign(0, 0n) ? chosen : null, exhausted: budget < 0}
}

function checkSource(text, evidence, findings) {
  const tokens = [...text.matchAll(tokenPattern)]
  const coverage = {
    words: tokens.length, understood: 0, filler: 0, unresolved: 0, uncovered: tokens.length,
    allAccountedFor: false, ambiguous: []
  }
  const find = occurrenceIndex(text, tokens)
  const groups = new Map()
  for (const claim of evidence) {
    let group = groups.get(claim.text)
    if (!group) {
      group = {text: claim.text, claims: [], occurrences: find(claim.text)}
      groups.set(claim.text, group)
    }
    group.claims.push(claim)
  }
  let missing = false
  for (const {text: surface, claims, occurrences} of groups.values()) {
    if (occurrences.length < claims.length) {
      missing = true
      findings.push({
        code: occurrences.length ? 'insufficient-source-occurrences' : 'source-quote-not-found',
        text: surface, claimed: claims.length, occurrences: occurrences.length,
        slots: claims.map(({wire, key}) => ({wire, key}))
      })
    }
    if (occurrences.length > 1) {
      coverage.ambiguous.push({text: surface, claimed: claims.length, occurrences: occurrences.length})
    }
  }
  if (missing) return {sourceValid: false, coverage}
  const ordered = [...groups.values()].sort((a, b) =>
    a.occurrences.length - a.claims.length - (b.occurrences.length - b.claims.length) ||
    b.occurrences[0].end - b.occurrences[0].start - (a.occurrences[0].end - a.occurrences[0].start))
  // Short-circuit an impossible size bound before allocating quotes.
  const claimed = ordered.reduce((sum, group) => sum +
    group.claims.length * (group.occurrences[0].end - group.occurrences[0].start), 0)
  if (claimed > tokens.length) {
    findings.push({code: 'overlapping-source-quotes'})
    return {sourceValid: false, coverage}
  }
  const {matching, exhausted} = assignOccurrences(ordered)
  if (!matching) {
    findings.push({code: exhausted ? 'source-allocation-limit' : 'overlapping-source-quotes'})
    return {sourceValid: false, coverage}
  }
  for (const [group, placements] of matching) {
    for (const [index, {end, start}] of placements.entries()) {
      coverage[group.claims[index].category] += end - start
      coverage.uncovered -= end - start
    }
  }
  coverage.allAccountedFor = coverage.uncovered === 0
  return {sourceValid: true, coverage}
}

export async function createAnalysisValidator({knowledgeDir, schemaPaths = []} = {}) {
  if (typeof knowledgeDir !== 'string' || !knowledgeDir) {
    throw new TypeError('Expected a SOP knowledge directory for analysis validation.')
  }
  if (!Array.isArray(schemaPaths)) throw new TypeError('Expected analysis schema paths as an array.')
  const [{parse}, ...schemas] = await Promise.all([
    import(pathToFileURL(join(resolve(knowledgeDir), 'tools/sopworld/sopworld.mjs'))),
    ...[baseSchema, ...schemaPaths].map(path => readFile(path, 'utf8'))
  ])
  const types = declaredTypes(parse, schemas)
  return function checkAnalysis(text, sop) {
    if (typeof text !== 'string' || typeof sop !== 'string') {
      throw new TypeError('Expected source text and an analysis circuit as strings.')
    }
    const findings = []
    let evidence = []
    try {
      evidence = checkStructure(parse(sop), types, findings)
    } catch (error) {
      findings.push({code: 'analysis-parse-error', reason: error.message})
    }
    const schemaValid = findings.length === 0
    const {sourceValid, coverage} = checkSource(text, evidence, findings)
    return {valid: schemaValid && sourceValid, schemaValid, sourceValid, coverage, findings}
  }
}
