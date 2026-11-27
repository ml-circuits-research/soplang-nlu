// Evaluation only: rewrites the `nlu` circuits that judges accepted into `syntax` circuits and
// writes them as reference circuits, for comparison.
//   node tests/benchmark/syntax/convert-nlu.mjs [--out <file>] [--nlu <folder>] [--knowledge <folder>] [--report <file>] [--dry]
// It follows the table "How it relates to the `nlu` schema" of docs/syntax-schema.md and the rules of
// that document. A circuit is rewritten only when the rules settle every word; the others are left
// out and counted with the reason. Rejected `nlu` circuits are skipped.
// The file is written beside the registry of judged circuits, not into it: no judge has read these
// circuits in the `syntax` schema, so they are neither accepted nor labels, and no level counts them.
// A line is {text, sop, core, source: "reference", nlu: {judge, run, writtenBy}}.
// This is the one tool of the syntax benchmark that reads the old checker and, through it, the
// knowledge repository: the old checker gives the position of each quoted value in the message.
// No formalizer may depend on this file.
import {existsSync, readdirSync} from 'node:fs'
import {join, resolve, relative} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {wordsOf, writeCircuit, validateSyntax} from '../../../lib/syntax.mjs'
import {readArguments, readJsonl, writeJsonl, normalForm, packageRoot} from './lib.mjs'

/** A circuit the rules do not settle: left out, with the reason. */
export class NotConverted extends Error {}
const leave = reason => { throw new NotConverted(reason) }

const TYPE = {'nlu.clause': 'syntax.clause', 'nlu.entity': 'syntax.nominal', 'nlu.relation': 'syntax.relation', 'nlu.coordination': 'syntax.coordination'}
const HEADS = ['head', 'name', 'pronoun', 'literal']
const COMPLEMENTS = new Set(['direct_object', 'indirect_object', 'predicative_entity', 'topic', 'participant'])
const CLAUSE_WORDS = {auxiliary: 'auxiliary', negation: 'negation', adverb: 'modifier', particle: 'modifier', result_complement: 'modifier', degree: 'modifier', filler: 'discourse'}
// keys that hold a meaning and no word of the message
const NO_WORDS = new Set(['form', 'completion', 'speech_act', 'act', 'polarity', 'result_color', 'kind', 'color'])
// a word after the head that says how the nominal is (Rule 5.2)
const AFTER_HEAD = new Set(['modifier', 'adverb', 'degree'])
// question words that stand before a noun as its dependent, and those that stand for a nominal
const BEFORE_NOUN = new Set(['what', 'which', 'whose', 'how many', 'how much'])
const FOR_A_NOMINAL = new Set(['what', 'which', 'who', 'whom', 'whose'])

/** One nlu circuit as [{id, type, slots: [{key, raw}]}], the keys in the order they are written. */
export function parseNlu(sop) {
  return sop.split('\n').filter(line => line.trim()).map(line => {
    const [, id, type, rest] = /^@(\S+)\s+(\S+)\s*(.*)$/u.exec(line) ?? []
    if (!id) leave('a line of the nlu circuit is no wire')
    return {id, type, slots: [...rest.matchAll(/([A-Za-z_]+)=("(?:[^"\\]|\\.)*"|\S+)/gu)].map(match => ({key: match[1], raw: match[2]}))}
  })
}

/**
 * Rewrites one nlu circuit.
 * @param wires from parseNlu; every quoted slot carries `span`: the words it covers as [first, last]
 *   in wordsOf(text), or null when it covers punctuation only
 * @returns the wires for writeCircuit
 */
export function convert(text, wires) {
  const words = wordsOf(text)
  const said = span => text.slice(words[span[0]].start, words[span[1]].end).toLowerCase().replace(/\s+/gu, ' ')
  const out = new Map()
  for (const wire of wires) {
    if (!TYPE[wire.type]) leave('a wire of a type the table does not name')
    out.set(wire.id, {id: wire.id, type: TYPE[wire.type], slots: [], source: wire})
  }
  let made = 0
  const add = (type, slots) => { let id; do id = 'new' + ++made; while (out.has(id)); const wire = {id, type, slots}; out.set(id, wire); return wire }
  const target = raw => out.get(raw.slice(1)) ?? leave('a reference to a wire that is missing')
  const perWord = (wire, key, span) => { for (let word = span[0]; word <= span[1]; word++) wire.slots.push({key, span: [word, word]}) }
  const relate = (from, to, marker) => add('syntax.relation', [{key: 'from', ref: from.id}, {key: 'to', ref: to.id}, ...(marker ? [{key: 'marker', span: marker}] : [])])
  const has = (wire, key) => wire.slots.some(slot => slot.key === key)
  const refers = (wire, other, keys) => wire.slots.some(slot => slot.ref === other.id && (!keys || keys.includes(slot.key)))
  const complete = [], markers = [], questions = [], connectives = [], relationAdverbs = [], measures = [], afterHead = []

  for (const wire of [...out.values()]) {
    const {source} = wire
    const slotOf = key => source.slots.find(slot => slot.key === key)
    if (wire.type === 'syntax.clause') {
      const predicate = slotOf('predicate'), form = slotOf('form')?.raw
      if (predicate && !predicate.span) leave('a predicate that is no word')
      if (predicate && form === 'fragment') leave('a fragment that has a predicate')
      // a clause without a verb is a fragment, whatever form the nlu circuit gave it
      wire.slots.push({key: 'form', value: predicate ? form : 'fragment'})
      for (const {key, raw, span} of source.slots) {
        if (NO_WORDS.has(key)) continue
        if (key === 'subject') wire.slots.push({key: 'subject', ref: target(raw).id})
        else if (COMPLEMENTS.has(key)) wire.slots.push({key: 'complement', ref: target(raw).id})
        else if (key === 'clausal_complement') complete.push([wire, target(raw)])
        else if (key === 'unresolved') leave('unresolved words: the syntax schema has no place for them')
        else if (!span) { if (key === 'separator' || key === 'terminator' || raw.startsWith('"')) continue; leave('a clause key the table does not name: ' + key) }
        else if (key === 'predicate') wire.slots.push({key: 'verb', span})
        else if (CLAUSE_WORDS[key]) perWord(wire, CLAUSE_WORDS[key], span)
        else if (key === 'expression') { if (span[1] > span[0]) leave('an expression of several words: the nlu circuit does not give its grammar'); wire.slots.push({key: 'discourse', span}) }
        else if (key === 'marker') markers.push([wire, span])
        else if (key === 'question') questions.push([wire, span])
        else if (key === 'connective') connectives.push([wire, span])
        else if (key === 'separator' || key === 'terminator') leave('a separator or terminator that is a word')
        else leave('a clause key the table does not name: ' + key)
      }
    } else if (wire.type === 'syntax.nominal') {
      const naming = HEADS.flatMap(key => source.slots.filter(slot => slot.key === key && slot.span))
      const head = naming[0] ?? leave(has({slots: source.slots}, 'unresolved') ? 'unresolved words: the syntax schema has no place for them' : 'an entity without a head word')
      wire.slots.push({key: 'head', span: head.span})
      for (const slot of source.slots) {
        const {key, raw, span} = slot
        if (slot === head || NO_WORDS.has(key) || key === 'possessive_marker') continue
        if (key === 'possessor') relate(wire, target(raw), slotOf('possessive_marker')?.span)
        else if (key === 'measure') relate(wire, target(raw))
        else if (key === 'unresolved') leave('unresolved words: the syntax schema has no place for them')
        else if (!span) { if (raw.startsWith('"')) continue; leave('an entity key the table does not name: ' + key) }
        // "x 120", "block 1", "the node Intro": a name or a value after the head is a nominal of its own, tied with no marker
        else if (HEADS.includes(key)) { if (span[0] > head.span[1]) relate(wire, add('syntax.nominal', [{key: 'head', span}])); else perWord(wire, 'dependent', span) }
        else if (AFTER_HEAD.has(key) && span[0] > head.span[1]) afterHead.push([wire, span])
        else perWord(wire, 'dependent', span)
      }
      if (slotOf('possessive_marker')?.span && !slotOf('possessor')) leave('a possessive marker with no possessor')
    } else if (wire.type === 'syntax.relation') {
      for (const {key, raw, span} of source.slots) {
        if (key === 'kind') continue
        if (key === 'from' || key === 'to') wire.slots.push({key, ref: target(raw).id})
        else if (key === 'attachment') { if (raw !== 'open') leave('an attachment value the table does not name'); wire.slots.push({key: 'attachment', value: 'ambiguous'}) }
        else if (key === 'measure') measures.push([wire, target(raw)])
        else if (!span) { if (raw.startsWith('"')) continue; leave('a relation key the table does not name: ' + key) }
        else if (key === 'cue') wire.slots.push({key: 'marker', span})
        else if (key === 'negation') perWord(wire, 'negation', span)
        else if (key === 'adverb') relationAdverbs.push([wire, span])
        else leave('a relation key the table does not name: ' + key)
      }
      if (!has(wire, 'from') || !has(wire, 'to')) leave('a relation without both ends')
    } else {
      for (const {key, raw, span} of source.slots) {
        if (key === 'kind') continue
        if (key === 'member') wire.slots.push({key: 'conjunct', ref: target(raw).id})
        else if (key === 'cue') { if (span) wire.slots.push({key: 'conjunction', span}) }   // a comma among the cues is not covered
        else leave('a coordination key the table does not name: ' + key)
      }
    }
  }

  const all = () => [...out.values()]
  const endOf = (relation, key) => out.get(relation.slots.find(slot => slot.key === key).ref)
  // the first word of a wire, or of what it ties when it has no word of its own
  const anchor = (wire, depth = 0) => {
    const own = Math.min(Infinity, ...wire.slots.filter(slot => slot.span).map(slot => slot.span[0]))
    return own < Infinity || depth > 6 ? own : Math.min(Infinity, ...wire.slots.filter(slot => slot.ref).map(slot => anchor(out.get(slot.ref), depth + 1)))
  }
  // the clause a wire belongs to: the one that takes it as subject or complement, or the one its relation starts at
  const clauseOf = (wire, seen = new Set()) => {
    if (!wire || seen.has(wire)) return null
    seen.add(wire)
    if (wire.type === 'syntax.clause') return wire
    if (wire.type === 'syntax.relation') return clauseOf(endOf(wire, 'from'), seen)
    const users = all().filter(other => refers(other, wire))
    const taker = users.find(other => other.type === 'syntax.clause' && refers(other, wire, ['subject', 'complement']))
    if (taker) return taker
    for (const user of users) {
      const through = user.type === 'syntax.coordination' || (user.type === 'syntax.relation' && refers(user, wire, ['to']))
      const found = through ? clauseOf(user, seen) : null
      if (found) return found
    }
    return null
  }

  // Rule 5.1: a word that grades a relation ("right behind") is neither a nominal nor a marker: a modifier of the clause
  for (const [relation, span] of relationAdverbs) perWord(clauseOf(relation) ?? leave('a word that grades a relation, with no clause to hold it'), 'modifier', span)
  // Rule 4: the measure is a nominal of the clause and the relation starts at it
  for (const [relation, measure] of measures) {
    const clause = clauseOf(relation) ?? leave('a measure before a marker, with no clause to hold it')
    relation.slots.find(slot => slot.key === 'from').ref = measure.id
    relation.slots = relation.slots.filter(slot => slot.key !== 'attachment')
    if (!refers(clause, measure, ['subject', 'complement'])) clause.slots.push({key: 'complement', ref: measure.id})
  }
  for (const relation of all()) {
    if (relation.type === 'syntax.relation' && has(relation, 'attachment') && endOf(relation, 'from').type !== 'syntax.clause') leave('an open attachment that does not start at a clause')
  }
  // Rule 5.2: a word after a nominal that says how it is. It modifies the clause when the nominal is
  // the subject or a complement; it stays a dependent when the nominal ends a relation with a marker.
  for (const [nominal, span] of afterHead) {
    const taker = all().find(other => other.type === 'syntax.clause' && refers(other, nominal, ['subject', 'complement']))
    if (taker) perWord(taker, 'modifier', span)
    else perWord(nominal, 'dependent', span)
  }
  // a clause that completes another: a relation between the two
  for (const [governor, completion] of complete) relate(governor, completion)
  // the marker of a clause ("to", "if", "when") marks the relation that ends at that clause, or at the
  // coordination the clause opens
  for (const [clause, span] of markers) {
    const endsAt = wire => all().find(other => other.type === 'syntax.relation' && refers(other, wire, ['to']))
    let tie = endsAt(clause)
    if (!tie) {
      const joined = all().find(other => other.type === 'syntax.coordination' && refers(other, clause) && other.slots.every(slot => !slot.ref || anchor(out.get(slot.ref)) >= anchor(clause)))
      tie = joined && endsAt(joined)
    }
    if (!tie) leave('a clause marker with no relation that ends at its clause')
    tie.slots.push({key: 'marker', span})
  }
  // a connective ("and", "then", "so") is the conjunction of the coordination that joins its clause to an earlier one
  for (const [clause, span] of connectives) {
    const joined = all().find(other => other.type === 'syntax.coordination' && refers(other, clause) && other.slots.some(slot => slot.ref && slot.ref !== clause.id && anchor(out.get(slot.ref)) < span[0]))
    if (!joined) leave('a connective with no coordination that joins its clause to an earlier one')
    joined.slots.push({key: 'conjunction', span})
  }
  // a question word stands where its grammar puts it
  for (const [clause, span] of questions) {
    const word = said(span)
    const next = all().find(other => other.type === 'syntax.nominal' && anchor(other) === span[1] + 1 && refers(clause, other, ['subject', 'complement']))
    if (next && BEFORE_NOUN.has(word)) perWord(next, 'dependent', span)
    else if (span[1] > span[0]) leave('a question of several words: the nlu circuit does not give its grammar')
    else if (FOR_A_NOMINAL.has(word)) {
      const finite = ['declarative', 'interrogative'].includes(clause.slots.find(slot => slot.key === 'form').value)
      clause.slots.push({key: finite && has(clause, 'verb') && !has(clause, 'subject') ? 'subject' : 'complement', ref: add('syntax.nominal', [{key: 'head', span}]).id})
    } else clause.slots.push({key: 'modifier', span})
  }
  for (const wire of all()) {
    if (wire.type !== 'syntax.clause' || has(wire, 'verb')) continue
    // a clause that held only punctuation says nothing
    if (wire.slots.length === 1) {
      if (all().some(other => refers(other, wire))) leave('a clause that holds only punctuation is tied to other wires')
      out.delete(wire.id)
      continue
    }
    // Rule 3: whether a fragment shares the verb of an earlier conjunct is not written in an nlu circuit
    const content = ['subject', 'complement', 'modifier', 'negation'].some(key => has(wire, key))
    const after = all().some(other => other.type === 'syntax.coordination' && refers(other, wire) &&
      other.slots.some(slot => slot.ref && slot.ref !== wire.id && has(out.get(slot.ref), 'verb') && anchor(out.get(slot.ref)) < anchor(wire)))
    if (content && after) leave('a fragment joined after a clause with a verb: the nlu circuit does not say whether it shares that verb')
  }
  return all().map(({id, type, slots}) => ({id, type, slots}))
}

/** Gives every quoted slot the words it covers, from the placements of the old checker. */
export function placeValues(text, wires, placements, tokens) {
  const wordAt = new Map(wordsOf(text).map((word, index) => [word.start, index]))
  const queues = new Map()
  for (const placement of placements) {
    const key = placement.wire + '\0' + placement.key + '\0' + placement.text
    ;(queues.get(key) ?? queues.set(key, []).get(key)).push(placement)
  }
  for (const queue of queues.values()) queue.sort((a, b) => a.start - b.start)
  for (const wire of wires) for (const slot of wire.slots) {
    if (!slot.raw.startsWith('"')) continue
    const placement = queues.get(wire.id + '\0' + slot.key + '\0' + JSON.parse(slot.raw))?.shift() ?? leave('a quoted value has no place in the message')
    let first = -1, last = -1
    for (let token = placement.start; token < placement.end; token++) {
      const word = wordAt.get(tokens[token].index)
      if (word === undefined) continue
      if (first < 0) first = word
      last = word
    }
    slot.span = first < 0 ? null : [first, last]
  }
  return wires
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const {named} = readArguments(process.argv.slice(2))
  const annotations = join(packageRoot, '../webmeet-dataset/annotations')
  const nluDir = resolve(named.nlu ?? join(annotations, 'nlu/v1/judged'))
  const knowledgeDir = resolve(named.knowledge ?? join(packageRoot, '../sop-knowledge-worlds'))
  const outFile = resolve(typeof named.out === 'string' ? named.out : join(annotations, 'syntax/v1/reference/reference-nlu-v1.jsonl'))
  // the old checker, loaded here only: it reads the SOP parser of the knowledge repository
  const {createAnalysisValidator, sourceTokenMatches} = await import('../../../lib/check-analysis.mjs')
  const validate = await createAnalysisValidator({knowledgeDir})

  const rows = [], notConverted = [], reasons = new Map(), seenSource = new Set(), seenCore = new Set(), covered = new Set(), texts = new Set()
  let accepted = 0, rejected = 0, repeated = 0, same = 0
  for (const name of readdirSync(nluDir).filter(file => file.endsWith('.jsonl')).sort()) {
    for (const judged of readJsonl(join(nluDir, name))) {
      texts.add(judged.text)
      rejected += (judged.rejected ?? []).length
      for (const reading of judged.accepted ?? []) {
        if (seenSource.has(judged.text + '\0' + reading.sop)) { repeated++; continue }
        seenSource.add(judged.text + '\0' + reading.sop)
        accepted++
        try {
          const check = validate(judged.text, reading.sop, {alignSource: true})
          if (!check.valid) leave('the nlu circuit does not pass the old check')
          const wires = convert(judged.text, placeValues(judged.text, parseNlu(reading.sop), check.placements, sourceTokenMatches(judged.text)))
          let sop
          try { sop = writeCircuit(judged.text, wires) } catch (error) { leave('the writer refused the circuit: ' + (/^Words not covered/u.test(error.message) ? 'a word of the message has no place' : /claimed twice/u.test(error.message) ? 'a word is claimed twice' : /cross between wires/u.test(error.message) ? 'repeated words cross between wires' : error.message)) }
          const found = validateSyntax(judged.text, sop)
          if (!found.valid) leave('the syntax check refused the circuit: ' + [...new Set(found.findings.map(finding => finding.code))].join(', '))
          const normal = normalForm(judged.text, sop)
          if (seenCore.has(judged.text + '\0' + normal.core)) { same++; continue }
          seenCore.add(judged.text + '\0' + normal.core)
          covered.add(judged.text)
          rows.push({text: judged.text, sop: normal.sop, core: normal.core, source: 'reference',
            nlu: {judge: judged.judge ?? 'unknown', run: judged.run ?? name.replace(/\.jsonl$/u, ''), writtenBy: reading.source}})
        } catch (error) {
          if (!(error instanceof NotConverted)) throw error
          reasons.set(error.message, (reasons.get(error.message) ?? 0) + 1)
          notConverted.push({text: judged.text, reason: error.message, nlu: reading.sop})
        }
      }
    }
  }
  const failed = notConverted.length
  console.log(`${accepted} accepted nlu circuits of ${texts.size} messages (${repeated} repeats of the same circuit left aside; ${rejected} rejected circuits skipped).`)
  console.log(`Converted: ${accepted - failed} (${(100 * (accepted - failed) / accepted).toFixed(1)}%). They give ${rows.length} distinct syntax circuits (${same} have the same core as another one of their message), for ${covered.size} of the ${texts.size} messages.`)
  console.log(`Not converted: ${failed} (${(100 * failed / accepted).toFixed(1)}%).\n\n| Reason | Circuits |\n| --- | ---: |`)
  for (const [reason, count] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`| ${reason} | ${count} |`)
  if (typeof named.report === 'string') { writeJsonl(resolve(named.report), notConverted); console.log(`\nThe circuits that were not converted, with the reason: ${relative(process.cwd(), resolve(named.report))}`) }
  if (named.dry) console.log('\n--dry: nothing written.')
  else {
    const replaced = existsSync(outFile)
    writeJsonl(outFile, rows)
    console.log(`\n${replaced ? 'Written again' : 'Written'}: ${outFile} (${rows.length} lines)`)
  }
}
