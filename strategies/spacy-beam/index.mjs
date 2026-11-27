// spacy-beam: the dependency parser's beam, written as one circuit of the `syntax` schema.
//
// The greedy parse gives the circuit, as in spacy-direct. The beam gives two things more:
// a parse to fall back on when the greedy one leaves words without a grammatical place, and a
// basis for Rule 2. Where the parses of the beam disagree on the start of a prepositional
// phrase inside one clause, the phrase is written from the clause with attachment=ambiguous.
// No knowledge repository is read.
import {writeCircuit} from '../../lib/syntax.mjs'
import {openDependencies} from '../neural-dependencies/index.mjs'
import {directCircuit} from '../spacy-direct/index.mjs'

// The share of the beam's probability that must disagree with the chosen start of a phrase
// before the attachment is left unsettled.
const DISAGREEMENT = 0.25

/**
 * One circuit from the greedy parse and the scored parses of the beam.
 * @param alternatives [{score, tokens}]: other parses of the same tokens, with their probability
 * @returns {sop, loose, source: 'greedy' | 'beam', unsettled: number, beamScore?}
 */
export function beamCircuit(text, tokens, alternatives = [], {disagreement = DISAGREEMENT} = {}) {
  const ranked = [...alternatives].sort((a, b) => b.score - a.score)
  const readings = [{tokens, score: null}, ...ranked].map(({tokens, score}) => {
    try { return {score, ...directCircuit(text, tokens)} } catch (error) { return {score, error} }
  })
  // the greedy reading stands unless a parse of the beam places more of the words
  const written = readings.filter(reading => !reading.error)
  if (!written.length) throw readings[0].error
  const base = written.reduce((best, reading) => reading.loose.length < best.loose.length ? reading : best)
  // Rule 2: the same marker, in the same clause, started at another wire by a weighty share of the beam
  const scored = written.filter(reading => reading.score !== null)
  const total = scored.reduce((sum, reading) => sum + reading.score, 0)
  let unsettled = 0
  for (const relation of base.relations) {
    if (relation.unsettled || relation.clause === null) continue
    const same = other => other.marker[0] === relation.marker[0] && other.marker[1] === relation.marker[1] && other.clauseVerb === relation.clauseVerb
    let against = 0
    for (const reading of scored) {
      const other = reading.relations.find(same)
      if (other && other.start !== relation.start) against += reading.score
    }
    if (!total || against / total < disagreement) continue
    const wire = base.wires.find(wire => wire.id === relation.id)
    wire.slots.find(slot => slot.key === 'from').ref = relation.clause
    wire.slots.push({key: 'attachment', value: 'ambiguous'})
    unsettled++
  }
  return {sop: unsettled ? writeCircuit(text, base.wires) : base.sop, loose: base.loose, unsettled,
    source: base === readings[0] ? 'greedy' : 'beam', ...(base.score !== null ? {beamScore: base.score} : {})}
}

async function open({python, model, syntaxModel} = {}) {
  const parser = await openDependencies({python, model, syntaxModel})
  if (!parser.parseBeam) {
    await parser.close()
    throw Error('spacy-beam requires a dependency backend with parseBeam')
  }
  async function analyse(text) {
    if (typeof text !== 'string' || !text.trim()) return {analyses: [], error: 'Expected a nonempty text string.'}
    try {
      const {tokens, alternatives} = await parser.parseBeam(text)
      const {sop, ...evidence} = beamCircuit(text, tokens, alternatives)
      return {analyses: [{sop, ...evidence}]}
    } catch (error) {
      return {analyses: [], error: error instanceof Error ? error.message : String(error)}
    }
  }
  return {analyse, metadata: parser.metadata, close: () => parser.close()}
}

export const spacyBeam = {name: 'spacy-beam', schema: 'syntax', open}
