// Anchored evidence. Some frames are fixed by the legend's words alone: after "the" and before
// a cue stands a thing, after "could" stands a verb, after "very" stands a quality. Counting a
// word only in such frames says what kind of word it is without asking the route model, so the
// model's own mistakes cannot confirm themselves.

/** @returns per symbol [verb, thing, quality] counts from frames the legend fixes. */
export function anchoredFrames(legend, messages, index) {
  const station = name => legend.stations.find(entry => entry.name === name)?.index
  const at = Object.fromEntries(['determiner', 'pronoun', 'auxiliary', 'predicate', 'negation', 'infinitive', 'cue', 'conjunction', 'degree', 'marker', 'relative', 'filler', 'quantity'].map(name => [name, station(name)]))
  const places = token => token && legend.places.get(token.word)
  const only = (token, ...names) => { const entry = places(token); return Boolean(entry?.confined) && [...entry.stations].every(index_ => names.some(name => at[name] === index_)) }
  const listed = (token, name) => places(token)?.stations.has(at[name]) ?? false
  const free = token => token && !places(token)?.confined && /^\p{Ll}/u.test(token.word) && token.shape !== 'mark'
  const opens = token => only(token, 'determiner', 'degree')                     // the, a, an, every, my …
  const helps = token => only(token, 'auxiliary')                                 // could, would, should, can …
  const denies = token => only(token, 'negation')
  const grades = token => only(token, 'degree') || listed(token, 'degree') && !places(token).confined && !listed(token, 'quantity') && false
  const is = token => listed(token, 'auxiliary') && listed(token, 'predicate') && legend.links.get(token.word) === 'predicative'
  const closes = token => !token || token.shape === 'mark' || only(token, 'cue') || only(token, 'conjunction') || only(token, 'cue', 'infinitive') || helps(token) || only(token, 'cue', 'marker')
  const object = token => opens(token) || listed(token, 'pronoun') && legend.links.get(token.word) === 'recipient' || token?.word === 'it'
  const counts = new Float32Array(index.size * 3)
  const add = (token, kind, weight = 1) => { const id = index.get(token.word); if (id !== undefined) counts[id * 3 + kind] += weight }
  for (const tokens of messages) {
    for (let t = 0; t < tokens.length; t++) {
      const token = tokens[t]
      if (!free(token)) continue
      const before = tokens[t - 1], after = tokens[t + 1], earlier = tokens[t - 2]
      // a thing: the one word between a determiner and something that closes the group
      // (one word further and it could be a verb or a quality said of the thing: "the picture goes")
      if (closes(after) && opens(before)) add(token, 1)
      // a verb: after a helping verb or a negation of one, or after "to", before its object or the end
      if ((helps(before) || denies(before) && (helps(earlier) || listed(earlier, 'auxiliary'))) && (object(after) || closes(after))) add(token, 0)
      if (listed(before, 'infinitive') && object(after)) add(token, 0)
      // a verb that opens the message or follows a courtesy word, before its object
      if ((t === 0 || listed(before, 'filler')) && object(after)) add(token, 0, 0.5)
      // a quality: graded, or said of something by "is"
      if (before && only(before, 'degree') || listed(before, 'degree') && free(before) === false && only(before, 'degree', 'adverb')) add(token, 2)
      if (is(before) && closes(after) && !opens(earlier)) add(token, 2, 0.5)
    }
  }
  void grades
  return counts
}
