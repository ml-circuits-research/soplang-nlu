// The syntax contract: parse, check and write circuits of the `syntax` schema.
// Self-contained: it reads only schemas/syntax/schema.sop of this package. No knowledge
// repository, no other schema.
import {readFileSync} from 'node:fs'

const WORD = /[0-9]{4}-[0-9]{2}-[0-9]{2}(?![\p{L}\p{M}\p{N}_])|[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?(?![\p{L}\p{M}\p{N}_])|[+-]?(?:[0-9]+\.[0-9]+|\.[0-9]+)(?![\p{L}\p{M}\p{N}_])|[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*|[^\s]/gu
const CLITIC = /(?:n[’']t|[’'](?:s|d|m|re|ve|ll))$/iu
// Punctuation marks are not words: no value covers them.
const MARK = /^[.,;:!?()[\]{}"'“”‘’«»—–\-…/\\]+$/u

/** The words of a text, in order: [{text, start, end}]. Punctuation marks are left out. */
export function wordsOf(text) {
  const words = []
  for (const match of text.matchAll(WORD)) {
    const surface = match[0]
    if (MARK.test(surface)) continue
    const cut = CLITIC.exec(surface)
    if (cut?.index > 0) {
      words.push({text: surface.slice(0, cut.index), start: match.index, end: match.index + cut.index},
        {text: surface.slice(cut.index), start: match.index + cut.index, end: match.index + surface.length})
    } else words.push({text: surface, start: match.index, end: match.index + surface.length})
  }
  return words
}

// The words of a quoted value. A value may be a clitic by itself ("'s", "'re"), which in a
// message only ever follows a word.
const LONE_CLITIC = /^[’'](?:s|d|m|re|ve|ll)$/iu
function wordsOfValue(surface) {
  const parts = []
  for (const piece of String(surface).trim().split(/\s+/u)) {
    if (LONE_CLITIC.test(piece)) parts.push(piece)
    else parts.push(...wordsOf(piece).map(word => word.text))
  }
  return parts
}

/** The schema as {type: {key: {kind, many, required, options, targets}}}. */
export function readSchema(source) {
  const types = {}
  for (const line of source.split('\n')) {
    if (!line.startsWith('@') || !line.includes(' core.slot ')) continue
    const attrs = [...line.matchAll(/([a-z_]+)=(\S+)/gu)].map(match => [match[1], match[2]])
    const all = name => attrs.filter(pair => pair[0] === name).map(pair => pair[1])
    const [of] = all('of'), [key] = all('key')
    const options = all('enum')
    ;(types[of] ??= {})[key] = {kind: options.length ? 'enum' : all('kind')[0], many: all('many')[0] === 'true',
      required: all('required')[0] === 'true', options, targets: all('type')}
  }
  return types
}
const schemaText = readFileSync(new URL('../schemas/syntax/schema.sop', import.meta.url), 'utf8')
export const schema = readSchema(schemaText)

/** One wire per line: [{id, type, slots: [[key, raw]]}]. Throws on a line that is no wire. */
export function parseCircuit(sop) {
  return sop.split('\n').filter(line => line.trim()).map((line, number) => {
    const head = /^@([A-Za-z0-9_.-]+)\s+([a-z.]+)(?=\s|$)/u.exec(line)
    if (!head) throw new SyntaxError(`Line ${number + 1} is not a wire: ${line.slice(0, 40)}`)
    const rest = line.slice(head[0].length)
    const slots = [...rest.matchAll(/\s+([a-z_]+)=("(?:[^"\\]|\\.)*"|[^\s"]+)/gu)]
    if (slots.reduce((sum, match) => sum + match[0].length, 0) !== rest.trimEnd().length) throw new SyntaxError(`Line ${number + 1} has text that is no key=value pair`)
    return {id: head[1], type: head[2], slots: slots.map(match => [match[1], match[2]])}
  })
}

/**
 * Check one circuit against the schema and against its message.
 * Alignment: a quoted value covers one word or a run of adjacent words. Values claim
 * occurrences in the order the circuit is written; each takes the earliest occurrence whose
 * words are all still free. Every word of the message must be covered exactly once.
 * @returns {valid, findings: [{code, ...}], placements: [{wire, key, first, last}], words}
 */
export function validateSyntax(text, sop) {
  const findings = [], placements = []
  const words = wordsOf(text)
  const fail = () => ({valid: false, findings, placements, words: words.length})
  let wires
  try { wires = parseCircuit(sop) } catch (error) { findings.push({code: 'not-a-circuit', message: error.message}); return fail() }
  if (!wires.length) { findings.push({code: 'empty-circuit'}); return fail() }
  const byId = new Map()
  for (const wire of wires) {
    if (byId.has(wire.id)) findings.push({code: 'duplicate-id', wire: wire.id})
    byId.set(wire.id, wire)
  }
  for (const wire of wires) {
    const keys = schema[wire.type]
    if (!keys) { findings.push({code: 'unknown-type', wire: wire.id, type: wire.type}); continue }
    const seen = new Map()
    for (const [key, raw] of wire.slots) {
      const slot = keys[key]
      if (!slot) { findings.push({code: 'unknown-key', wire: wire.id, key}); continue }
      seen.set(key, (seen.get(key) ?? 0) + 1)
      if (seen.get(key) > 1 && !slot.many) findings.push({code: 'repeated-key', wire: wire.id, key})
      if (slot.kind === 'enum') { if (!slot.options.includes(raw)) findings.push({code: 'unknown-value', wire: wire.id, key, value: raw}) }
      else if (slot.kind === 'ref') {
        const target = raw.startsWith('$') ? byId.get(raw.slice(1)) : null
        if (!target) findings.push({code: 'missing-wire', wire: wire.id, key, value: raw})
        else if (!slot.targets.includes(target.type)) findings.push({code: 'wrong-wire-type', wire: wire.id, key, value: raw})
        else if (target === wire) findings.push({code: 'refers-to-itself', wire: wire.id, key})
      } else if (!raw.startsWith('"')) findings.push({code: 'expected-quoted-words', wire: wire.id, key, value: raw})
    }
    for (const [key, slot] of Object.entries(keys)) if (slot.required && !seen.has(key)) findings.push({code: 'missing-key', wire: wire.id, key})
    const has = key => seen.has(key)
    const value = key => wire.slots.find(slot => slot[0] === key)?.[1]
    if (wire.type === 'syntax.clause') {
      if (value('form') === 'fragment' && has('verb')) findings.push({code: 'fragment-with-verb', wire: wire.id})
      if (has('form') && value('form') !== 'fragment' && !has('verb')) findings.push({code: 'clause-without-verb', wire: wire.id})
      if (has('ellipsis') && value('form') !== 'fragment') findings.push({code: 'ellipsis-outside-fragment', wire: wire.id})
      if (has('ellipsis') && !byId.get(value('ellipsis').slice(1))?.slots.some(slot => slot[0] === 'verb')) findings.push({code: 'ellipsis-of-a-clause-without-verb', wire: wire.id})
    }
    if (wire.type === 'syntax.coordination') {
      const members = wire.slots.filter(slot => slot[0] === 'conjunct').map(slot => slot[1])
      if (members.length < 2 || new Set(members).size !== members.length) findings.push({code: 'coordination-needs-two-conjuncts', wire: wire.id})
      if (new Set(members.map(member => byId.get(member.slice(1))?.type)).size > 1) findings.push({code: 'mixed-conjuncts', wire: wire.id})
    }
  }
  if (!wires.some(wire => wire.type === 'syntax.clause')) findings.push({code: 'no-clause'})
  // alignment, in the order the circuit is written
  const taken = new Array(words.length).fill(false)
  for (const wire of wires) for (const [key, raw] of wire.slots) {
    if (!raw.startsWith('"') || schema[wire.type]?.[key]?.kind !== 'string') continue
    let surface
    try { surface = JSON.parse(raw) } catch { findings.push({code: 'bad-quote', wire: wire.id, key}); continue }
    const wanted = wordsOfValue(surface)
    if (!wanted.length) { findings.push({code: 'value-without-words', wire: wire.id, key, value: surface}); continue }
    let at = -1
    for (let start = 0; start + wanted.length <= words.length && at < 0; start++) {
      if (wanted.every((word, k) => !taken[start + k] && words[start + k].text === word)) at = start
    }
    if (at < 0) { findings.push({code: 'words-not-in-message', wire: wire.id, key, value: surface}); continue }
    for (let k = 0; k < wanted.length; k++) taken[at + k] = true
    placements.push({wire: wire.id, key, first: at, last: at + wanted.length - 1})
  }
  const uncovered = words.filter((_, index) => !taken[index]).map(word => word.text)
  if (uncovered.length) findings.push({code: 'uncovered-words', words: uncovered})
  return {valid: findings.length === 0, findings, placements, words: words.length}
}

/**
 * Write a circuit from wires whose quoted values are given as spans of words.
 * @param wires [{id, type, slots: [{key, span: [first, last]} | {key, ref: id} | {key, value: atom}]}]
 * The wires are ordered so that the alignment rule gives every value its own span back. When
 * repeated words cross between wires no such order exists: the wires are then written in the
 * order of the message, and values that hold the same words may get each other's occurrence.
 * Throws when the spans do not cover every word exactly once, or when even that order leaves a
 * word uncovered.
 */
export function writeCircuit(text, wires) {
  const words = wordsOf(text)
  const owner = new Array(words.length).fill(null)
  for (const wire of wires) for (const slot of wire.slots) {
    if (!slot.span) continue
    const [first, last] = slot.span
    if (!(first >= 0 && last >= first && last < words.length)) throw new RangeError(`Wire ${wire.id} has a span outside the message`)
    for (let index = first; index <= last; index++) {
      if (owner[index]) throw new Error(`The word "${words[index].text}" is claimed twice (${owner[index].wire.id} and ${wire.id})`)
      owner[index] = {wire, slot}
    }
  }
  const missing = words.filter((_, index) => !owner[index]).map(word => word.text)
  if (missing.length) throw new Error('Words not covered: ' + missing.join(' '))
  const sequence = slot => words.slice(slot.span[0], slot.span[1] + 1).map(word => word.text)
  // a value must come after whatever covers an earlier occurrence of the same words
  const before = new Map(wires.map(wire => [wire, new Set()]))
  for (const wire of wires) for (const slot of wire.slots) {
    if (!slot.span) continue
    const wanted = sequence(slot)
    for (let start = 0; start < slot.span[0]; start++) {
      if (!wanted.every((word, k) => words[start + k]?.text === word)) continue
      const blocker = owner[start].wire
      if (blocker !== wire) before.get(wire).add(blocker)
    }
  }
  const firstWord = wire => Math.min(...wire.slots.filter(slot => slot.span).map(slot => slot.span[0]), Infinity)
  const pending = [...wires].sort((a, b) => firstWord(a) - firstWord(b)), ordered = []
  let crossing = null
  while (pending.length) {
    const next = pending.findIndex(wire => [...before.get(wire)].every(other => ordered.includes(other)))
    if (next < 0) {
      // Repeated words cross between wires: no order gives every value its own occurrence. The wires
      // are then written in the order of the message. Values that hold the same words cannot be told
      // apart in the circuit, so the rule may give two wires each other's occurrence; every word is
      // still covered once. This is checked below.
      crossing = pending.map(wire => wire.id)
      ordered.push(...pending.splice(0))
      break
    }
    ordered.push(...pending.splice(next, 1))
  }
  const quote = slot => JSON.stringify(text.slice(words[slot.span[0]].start, words[slot.span[1]].end))
  const sop = ordered.map(wire => {
    const atoms = wire.slots.filter(slot => slot.value !== undefined).map(slot => `${slot.key}=${slot.value}`)
    const quoted = wire.slots.filter(slot => slot.span).sort((a, b) => a.span[0] - b.span[0]).map(slot => `${slot.key}=${quote(slot)}`)
    const refs = wire.slots.filter(slot => slot.ref !== undefined).map(slot => `${slot.key}=$${slot.ref}`)
    return [`@${wire.id} ${wire.type}`, ...atoms, ...quoted, ...refs].join(' ')
  }).join('\n')
  if (crossing && validateSyntax(text, sop).findings.some(finding => ['words-not-in-message', 'uncovered-words'].includes(finding.code)))
    throw new Error('Repeated words cross between wires: no order of the wires aligns them (' + crossing.join(', ') + ')')
  return sop
}

/**
 * What a circuit says, with wire names set aside: equal for two circuits that place every
 * word alike and tie the same wires. null for an invalid circuit.
 */
export function coreOf(text, sop) {
  const check = validateSyntax(text, sop)
  if (!check.valid) return null
  const wires = parseCircuit(sop), byId = new Map(wires.map(wire => [wire.id, wire]))
  const firstOf = new Map()
  for (const {wire, first} of check.placements) firstOf.set(wire, Math.min(firstOf.get(wire) ?? Infinity, first))
  const name = (id, depth = 0) => {
    const wire = byId.get(id)
    if (firstOf.has(id) && wire.type !== 'syntax.relation' && wire.type !== 'syntax.coordination') return String(firstOf.get(id))
    const refs = wire.slots.filter(slot => slot[1].startsWith('$')).map(slot => depth > 6 ? '?' : name(slot[1].slice(1), depth + 1))
    return (wire.type === 'syntax.coordination' ? '[' + refs.sort().join('+') + ']' : '(' + refs.join('>') + ')')
  }
  const lines = check.placements.map(({wire, key, first, last}) => `${first}-${last} ${key} @${name(wire)}`)
  for (const wire of wires) for (const [key, raw] of wire.slots) {
    if (raw.startsWith('"')) continue
    lines.push(`${wire.type.slice(7)} ${name(wire.id)} ${key} ${raw.startsWith('$') ? name(raw.slice(1)) : raw}`)
  }
  return [...new Set(lines)].sort().join('\n')
}
