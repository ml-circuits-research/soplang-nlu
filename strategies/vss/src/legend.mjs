// The legend as data. The reader holds no word list and no slot name of its own: both come
// from the SOP declarations parsed here.

/** One wire per line: `@id type key=value key="quoted value"`. */
export function parseWires(source) {
  const wires = []
  for (const line of source.split(/\r?\n/u)) {
    const head = /^@(\S+)\s+(\S+)/u.exec(line)
    if (!head) continue
    const attrs = {}
    const pattern = /([\w.]+)=("(?:[^"\\]|\\.)*"|\S+)/gu
    pattern.lastIndex = head[0].length
    for (let match; (match = pattern.exec(line));) {
      const value = match[2].startsWith('"') ? JSON.parse(match[2]) : match[2]
      ;(attrs[match[1]] ??= []).push(value)
    }
    wires.push({id: head[1], type: head[2], attrs})
  }
  return wires
}

export function readLegend(source) {
  const wires = parseWires(source)
  const stations = wires.filter(wire => wire.type === 'vss.station').map((wire, index) => ({
    index, name: wire.id.replace(/^st\./u, ''), unit: wire.attrs.unit[0], key: wire.attrs.key[0],
    core: wire.attrs.core?.[0] === 'true', closed: wire.attrs.closed?.[0] === 'true',
    opens: wire.attrs.opens?.[0] !== 'false', ends: wire.attrs.ends?.[0] === 'true', as: wire.attrs.as?.[0] ?? null,
    like: wire.attrs.like?.[0] ?? null, shapes: wire.attrs.shape ?? [], suffixes: wire.attrs.suffix ?? [],
    follows: wire.attrs.follows ?? []
  }))
  const byName = new Map(stations.map(station => [station.name, station]))
  const need = name => {
    if (!byName.has(name)) throw Error('The legend names an unknown station: ' + name)
    return byName.get(name).index
  }
  for (const station of stations) {
    station.follows = station.follows.map(need)
    station.like = station.like === null ? null : need(station.like)
  }
  // word -> the stations that list it, and whether some list confines it
  const places = new Map(), links = new Map()
  for (const wire of wires.filter(wire => wire.type === 'vss.words')) {
    const station = need(wire.attrs.station[0])
    const open = wire.attrs.open?.[0] === 'true'
    for (const word of wire.attrs.word ?? []) {
      if (wire.attrs.link) links.set(word, wire.attrs.link[0])
      const entry = places.get(word) ?? {stations: new Set(), confined: false}
      entry.stations.add(station)
      if (!open) entry.confined = true
      places.set(word, entry)
    }
  }
  const kinds = wires.filter(wire => wire.type === 'vss.kind').map(wire => ({
    unit: wire.attrs.unit[0], kind: wire.attrs.kind[0], cues: wire.attrs.cue ?? [], joins: wire.attrs.joins?.[0] ?? null
  }))
  // compounds by their first word, longest first
  const compounds = new Map()
  for (const word of places.keys()) {
    const parts = word.split(' ')
    if (parts.length < 2) continue
    const list = compounds.get(parts[0]) ?? []
    list.push(parts)
    compounds.set(parts[0], list.sort((a, b) => b.length - a.length))
  }
  compounds.listed = new Set(places.keys())
  const endings = wires.filter(wire => wire.type === 'vss.endings').flatMap(wire => wire.attrs.ending ?? [])
  const forms = wires.filter(wire => wire.type === 'vss.forms').map(wire => ({
    name: wire.id.replace(/^forms\./u, ''), station: need(wire.attrs.station[0]), also: (wire.attrs.also ?? []).map(need), confine: wire.attrs.confine?.[0] === 'true',
    endings: wire.attrs.ending ?? []
  }))
  return {stations, places, kinds, endings, forms, compounds, links}
}

const formShapes = new Set(['number', 'date', 'clock', 'code', 'mark', 'quote'])

/** The stations a token may stand at, before any learning: Uint8Array mask over stations. */
export function admitted(legend, word, shape) {
  const mask = new Uint8Array(legend.stations.length)
  const listed = legend.places.get(word)
  if (listed) for (const station of listed.stations) mask[station] = 1
  if (listed?.confined) return mask
  if (formShapes.has(shape)) {
    for (const station of legend.stations) if (station.shapes.includes(shape)) mask[station.index] = 1
    return mask
  }
  for (const station of legend.stations) {
    if (station.shapes.includes('mark')) continue
    if (!station.closed || station.suffixes.some(suffix => word.length > suffix.length + 2 && word.endsWith(suffix))) mask[station.index] = 1
  }
  return mask
}

/** Token ranges of the sentences of a message: a sentence ends after its closing marks. */
export function sentencesOf(legend, tokens) {
  const closing = legend.stations.filter(station => station.ends).map(station => station.index)
  const closes = token => closing.some(station => legend.places.get(token.word)?.stations.has(station))
  const ranges = []
  let start = 0
  for (let i = 0; i < tokens.length; i++) {
    if (closes(tokens[i]) && i + 1 < tokens.length && !closes(tokens[i + 1])) { ranges.push([start, i + 1]); start = i + 1 }
  }
  if (start < tokens.length) ranges.push([start, tokens.length])
  return ranges
}
