// The reader: text in, up to two circuits out. It needs the legend and the learned model,
// and nothing else: no file access and no network, so it runs wherever JavaScript runs.
import {readLegend} from './legend.mjs'
import {observe} from './observe.mjs'
import {readRoutes} from './routes.mjs'
import {stemsOf} from './forms.mjs'
import {buildUnits} from './units.mjs'
import {linkUnits} from './links.mjs'
import {emit} from './emit.mjs'
import {attachment, headKey} from './habits.mjs'
import {openMeanings, openMemory} from './meaning.mjs'
import {identity, bind, bundleInto, normalise, dot, DIMENSIONS} from './space.mjs'
import {createOccurrences, matchPrototypes} from './occurrence.mjs'
import {symptomsOf} from './flags.mjs'

const AMBIGUOUS = 0.7

/** Dense tables from the stored model. */
export function openModel(model, options = {}) {
  const legend = readLegend(model.legend)
  legend.variants = new Map(Object.entries(model.variants ?? {}))
  const n = legend.stations.length, v = model.symbols.length
  const emission = new Float64Array(n * v)
  const active = model.emission.map((row, symbol) => {
    const stations = []
    for (let k = 0; k < row.length; k += 2) { emission[row[k] * v + symbol] = row[k + 1]; stations.push(row[k]) }
    return stations
  })
  const base = Int32Array.from(legend.stations, station => station.like ?? station.index)
  // a station that shares the words of another is active wherever that one is
  const activeAll = active.map(rows => Int32Array.from(legend.stations.filter(station => rows.includes(base[station.index])).map(station => station.index)))
  const book = {
    symbols: model.symbols, transition: Float64Array.from(model.transition), start: Float64Array.from(model.start),
    end: Float64Array.from(model.end), emission, shape: Float64Array.from(model.shape), base, active: activeAll
  }
  const index = new Map(model.symbols.map((symbol, id) => [symbol, id]))
  const stationIndex = new Map(legend.stations.map(station => [station.name, station.index]))
  const isKnown = word => index.has(word) && !legend.places.get(word)?.confined
  const habits = model.habits ?? {}
  const meanings = openMeanings(options.meanings === false ? null : model.meanings)
  const together = new Set(habits.together ?? [])
  // a verb seen too rarely to show a habit borrows it from the verbs used like it
  const borrowed = (list, word) => {
    if (list?.includes(word)) return true
    if (options.transfer !== true || (habits.verbTotal?.[word] ?? 0) >= 20) return false
    let yes = 0, all = 0
    for (const [other, similarity] of meanings.nearest(word, 12)) {
      if ((habits.verbTotal?.[other] ?? 0) < 20 || similarity <= 0) continue
      all += similarity
      if (list?.includes(other)) yes += similarity
    }
    return all > 0 && yes / all > 0.5
  }
  const anchored = new Set(habits.anchored ?? [])
  // what the anchored frames say of a word; a form of a verb counts as that verb
  const kindsOf = word => {
    const own = habits.kinds?.[word] ?? [0, 0, 0]
    let verb = own[0], thing = own[1]
    for (const stem of stemsOf(word, legend.endings)) verb = Math.max(verb, habits.kinds?.[stem]?.[0] ?? 0)
    // the plural of a thing is a thing
    const plural = legend.forms.find(form => form.name === 'plural')?.endings ?? []
    for (const stem of stemsOf(word, plural)) thing = Math.max(thing, habits.kinds?.[stem]?.[1] ?? 0)
    return {verb, thing, quality: own[2]}
  }
  const lexicon = {
    kindsOf,
    // seen as a verb where the structure left no doubt, itself or the word it is a form of
    anchoredVerb: word => anchored.has(word) || stemsOf(word, legend.endings).some(stem => anchored.has(stem)),
    nominal: word => habits.nominal?.[word] === 1 ? true : habits.nominal?.[word] === 0 ? false : undefined,
    takesClause: word => borrowed(habits.takesClause, word) && kindsOf(word).verb >= 3,
    takesQuality: word => borrowed(habits.takesQuality, word),
    gives: word => borrowed(habits.gives, word),
    asks: word => borrowed(habits.asks, word),
    directs: word => habits.directs?.includes(word) ?? false,
    names: word => habits.names?.includes(word) ?? false,
    // an adverb that grades what follows it: listed as a degree, or admitted as an adverb by its ending
    grades: word => (legend.places.get(word)?.stations.has(stationIndex.get('degree')) ?? false) ||
      legend.stations[stationIndex.get('adverb')].suffixes.some(suffix => word.length > suffix.length + 2 && word.endsWith(suffix)),
    phrasal: (verb, particle) => habits.phrasal?.[verb]?.includes(particle) ?? false,
    // is the word more often a thing than something done?
    thingFirst: word => (habits.attach?.nounTotal?.[word] ?? 0) >= (habits.verbTotal?.[word] ?? 0),
    together: (left, right) => together.has(left + ' ' + right),
    canBe: (word, station) => legend.places.get(word)?.stations.has(stationIndex.get(station)) ?? false,
    formOf: word => {
      if (legend.places.get(word)?.confined) return null
      for (const form of legend.forms) {
        if (form.name !== 'past' && form.name !== 'progressive') continue
        if (stemsOf(word, form.endings).some(isKnown)) return form.name
      }
      return null
    }
  }
  const kinds = new Map()
  for (const {unit, kind, cues} of legend.kinds) {
    if (!cues.length) kinds.set(unit + '\0', kind)
    for (const cue of cues) kinds.set(unit + '\0' + cue, kind)
  }
  // The build of an entity as one vector: every slot it has, bound to the class of its filler.
  // Two entities built alike ("a large yellow cat", "a small brown dog") have near vectors.
  const built = (tokens, unit) => {
    const sum = new Float32Array(DIMENSIONS)
    const add = (slot, filler) => bundleInto(sum, bind(identity('slot:' + slot), identity('filler:' + filler)))
    if (unit.determiner?.length) add('determiner', tokens[unit.determiner[0]].word)
    if (unit.quantity?.length) add('quantity', 'some')
    ;(unit.modifier ?? []).forEach((_, k) => add('modifier', String(k)))
    ;(unit.compound ?? []).forEach((_, k) => add('compound', String(k)))
    add('core', unit.pronoun ? 'pronoun' : unit.literal ? 'literal' : unit.name && !unit.head ? 'name' : 'head')
    return normalise(sum)
  }
  const build = (tokens, left, right) => dot(built(tokens, left), built(tokens, right))
  const memory = openMemory(options.memory === false ? null : model.memory)
  const counted = attachment(options.attachment === false ? null : habits.attach, options.transfer !== true ? undefined : word => meanings.nearest(word, 12))
  const weight = options.memoryWeight ?? 2
  const sureOnly = attachment(habits.attachSure)
  const mode = options.attachMode ?? 'current'
  const joiners = new Set(legend.kinds.filter(kind => kind.joins === 'clause').flatMap(kind => kind.cues))
  let opening = null
  const context = {
    legend, lexicon, meanings, gapping: options.gapping, kinds: options.kinds,
    joinsClauses: word => joiners.has(word),
    // two entities are alike when their heads are used alike and they are introduced alike
    alike: (tokens, left, right) => {
      opening = unit => unit.determiner?.length ? tokens[unit.determiner[0]].word : unit.pronoun ? '~pronoun' : unit.name && !unit.head ? '~name' : '~bare'
      const mode = options.alike ?? 'structure'
      if (mode === 'nearest') return 0
      const opened = opening(left) === opening(right) ? 0.3 : 0
      if (mode === 'opener') return opened
      const meant = meanings.similarity(headKey(tokens, left), headKey(tokens, right))
      if (mode === 'meaning') return meant + opened
      // structure: each entity as the bundle of its slots, each bound to what fills it
      return meant + build(tokens, left, right)
    },
    linkOf: word => legend.links.get(word),
    pairOf: word => legend.pairs.get(word),
    kindOf: (unit, cue, strict = false) => cue === null ? kinds.get(unit + '\0')
      : kinds.get(unit + '\0' + cue) ?? (strict || unit !== 'coordination' ? (unit === 'relation' ? undefined : null) : 'additive'),
    // where a relation starts: what the counts say of the verb and of the thing with this cue,
    // and how well the target suits that role of each in the memory
    attach: (verb, head, cue, target) => {
      const filler = target ? meanings.vector(target) : null
      const fit = memory.fit('v:' + verb, cue, filler) - memory.fit('n:' + head, cue, filler)
      if (mode === 'clause') return 1
      if (mode === 'entity') return -1
      if (mode === 'substitution') return sureOnly(verb, head, cue)
      if (mode === 'counts') return counted(verb, head, cue)
      if (mode === 'memory') return fit
      return counted(verb, head, cue) + weight * fit
    },
    // how strongly the verb, or a thing, holds a relation with this cue to this target
    holds: (kind, word, cue, target) => {
      const filler = target ? meanings.vector(target) : null
      const count = !counted.verb ? 0 : kind === 'verb' ? counted.verb(word, cue) : counted.thing(word, cue)
      return count + weight * memory.fit((kind === 'verb' ? 'v:' : 'n:') + word, cue, filler)
    },
    hosts: options.hosts,
    suits: (verb, thing) => memory.fit('v:' + verb, 'said', meanings.vector(thing)),
    // how often the text says this verb form of this thing (per occurrence of the thing)
    describes: (form, head) => (habits.describes?.[form]?.[head] ?? 0) / ((habits.attach?.nounTotal?.[head] ?? 0) + 5)
  }
  return {legend, book, index, context, lexicon, meanings, memory}
}

export function createVssReader(model, options = {}) {
  const opened = openModel(model, options)
  const {legend, book, index, context, lexicon} = opened
  const names = legend.stations.map(station => station.as ?? station.name)
  const openers = new Set(model.openers ?? [])
  // the outside of an occurrence, compared with what each station's occurrences look like
  const occurrences = createOccurrences(legend)
  let prototypes = null
  if (model.occurrence && options.occurrence !== false) {
    const binary = atob(model.occurrence.vectors)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const floats = new Float32Array(bytes.buffer), size = model.occurrence.dimensions
    prototypes = {centre: floats.subarray(0, size), prototypes: legend.stations.map((_, k) => floats.subarray((k + 1) * size, (k + 2) * size))}
  }
  const sharp = options.occurrenceWeight ?? 4
  const verbStations = new Set(legend.stations.filter(station => station.key === 'predicate').map(station => station.index))
  const thingStations = new Set(legend.stations.filter(station => station.unit === 'entity' || station.like !== null && legend.stations[station.like].unit === 'entity').map(station => station.index))
  function analyse(text) {
    const tokens = observe(text, legend.compounds, legend.variants)
    if (!tokens.length) return {analyses: []}
    const tried = new Map()
    // an opener stands on its own: none of its words is the verb of what follows
    const cut = tokens.findIndex(token => token.shape === 'mark' && /^[,:;!—–-]$/u.test(token.text))
    if (options.openers !== false && cut >= 1 && cut <= 2 && openers.has(tokens.slice(0, cut).map(token => token.word).join(' '))) {
      for (let position = 0; position < cut; position++) if (!lexicon.anchoredVerb(tokens[position].word)) tried.set(position, verbStations)
    }
    // a second opinion on every word from the outside of its occurrence
    let lift = null
    if (prototypes) {
      const matches = tokens.map((_, t) => matchPrototypes(prototypes, occurrences.outside(tokens, t)))
      lift = (t, s) => Math.exp(sharp * matches[t][s])
    }
    // one verb per clause, unless the verb before makes its object do something or the word describes
    const budget = options.budget !== true ? null : {
      makesDo: word => lexicon.takesClause(word) || lexicon.directs(word),
      describes: word => lexicon.formOf(word) !== null,
      doer: word => legend.links.get(word) === 'subject',
      known: word => lexicon.kindsOf(word).verb >= 3 ? (options.verbLead ?? 1) : 0
    }
    let {stations, confidence} = readRoutes(book, legend, index, tokens, tried, lift, budget)
    const read = flips => {
      const units = buildUnits(tokens, stations.map(station => names[station]), lexicon)
      const {wires, decisions, doubts} = linkUnits(text, tokens, units, context, flips)
      return {sop: emit(wires), decisions, doubts: [...units.doubts, ...doubts].filter(doubt => !tried.has(doubt.position))}
    }
    let first = read(new Set())
    // A verb that the structure cannot place was probably not a verb: the sentence is read
    // again with that word kept off the verb stations.
    for (let again = 0; again < 3 && first.doubts.length; again++) {
      for (const {position, not} of first.doubts) tried.set(position, not === 'verb' ? verbStations : thingStations)
      const banned = new Map(tried)
      ;({stations, confidence} = readRoutes(book, legend, index, tokens, banned, lift, budget))
      first = read(new Set())
    }
    const flags = symptomsOf(first.sop, lexicon, {confidence, fold: word => legend.variants.get(word.toLowerCase()) ?? word.toLowerCase()})
    const analyses = [{sop: first.sop, confidence: Math.min(...confidence), flags}]
    // language can be ambiguous: the least certain attachment is also read the other way
    const doubtful = options.alternatives === false ? null : first.decisions.filter(decision => decision.margin < (options.ambiguous ?? AMBIGUOUS)).sort((a, b) => a.margin - b.margin)[0]
    if (doubtful) {
      const second = read(new Set([doubtful.id]))
      if (second.sop !== first.sop) analyses.push({sop: second.sop, confidence: Math.min(...confidence), alternativeOf: doubtful.cue})
    }
    return {analyses, tokens, stations: stations.map(station => names[station]), confidence}
  }
  return {analyse, ...opened}
}
