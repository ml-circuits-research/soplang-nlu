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
import {openMeanings} from './meaning.mjs'

const AMBIGUOUS = 0.7

/** Dense tables from the stored model. */
export function openModel(model, options = {}) {
  const legend = readLegend(model.legend)
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
  const together = new Set(habits.together ?? [])
  const lexicon = {
    nominal: word => habits.nominal?.[word] === 1 ? true : habits.nominal?.[word] === 0 ? false : undefined,
    takesClause: word => habits.takesClause?.includes(word) ?? false,
    takesQuality: word => habits.takesQuality?.includes(word) ?? false,
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
  const joiners = new Set(legend.kinds.filter(kind => kind.joins === 'clause').flatMap(kind => kind.cues))
  const meanings = openMeanings(options.meanings === false ? null : model.meanings)
  let opening = null
  const context = {
    legend, lexicon, meanings,
    joinsClauses: word => joiners.has(word),
    // two entities are alike when their heads are used alike and they are introduced alike
    alike: (tokens, left, right) => {
      opening = unit => unit.determiner?.length ? tokens[unit.determiner[0]].word : unit.pronoun ? '~pronoun' : unit.name && !unit.head ? '~name' : '~bare'
      return meanings.similarity(headKey(tokens, left), headKey(tokens, right)) + (opening(left) === opening(right) ? 0.3 : 0)
    },
    linkOf: word => legend.links.get(word),
    kindOf: (unit, cue, strict = false) => cue === null ? kinds.get(unit + '\0')
      : kinds.get(unit + '\0' + cue) ?? (strict || unit !== 'coordination' ? (unit === 'relation' ? undefined : null) : 'additive'),
    attach: attachment(options.attachment === false ? null : habits.attach)
  }
  return {legend, book, index, context, lexicon, meanings}
}

export function createVssReader(model, options = {}) {
  const opened = openModel(model, options)
  const {legend, book, index, context, lexicon} = opened
  const names = legend.stations.map(station => station.as ?? station.name)
  function analyse(text) {
    const tokens = observe(text, legend.compounds)
    if (!tokens.length) return {analyses: []}
    const {stations, confidence} = readRoutes(book, legend, index, tokens)
    const read = flips => {
      const units = buildUnits(tokens, stations.map(station => names[station]), lexicon)
      const {wires, decisions} = linkUnits(text, tokens, units, context, flips)
      return {sop: emit(wires), decisions}
    }
    const first = read(new Set())
    const analyses = [{sop: first.sop, confidence: Math.min(...confidence)}]
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
