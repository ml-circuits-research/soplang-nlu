// Habits of words, counted on unannotated text once the routes are learned. Each one is
// read off cases where the structure leaves no doubt, and then used where it does.
import {observe} from './observe.mjs'
import {readRoutes} from './routes.mjs'
import {buildUnits} from './units.mjs'
import {createMemory} from './meaning.mjs'

const bump = (table, key, by = 1) => { table[key] = (table[key] ?? 0) + by }
const bump2 = (table, a, b) => { bump(table[a] ??= {}, b) }

export function learnHabits(opened, texts) {
  const {legend, book, index, lexicon, meanings} = opened
  const memory = createMemory(meanings.dimensions || 1)
  const meant = unit => meanings.vector(headKey(tokens_, unit))
  let tokens_ = null
  const stationNames = legend.stations.map(station => station.as ?? station.name)
  const conditions = new Set(legend.kinds.filter(kind => kind.unit === 'relation' && kind.kind === 'condition').flatMap(kind => kind.cues))
  const heads = {}, qualities = {}
  const targets = new Map()
  const verbTotal = {}, verb = {}, nounTotal = {}, noun = {}, takes = {}, everyNoun = {}, doubtful = new Map(), becomes = {}, withObject = {}, pairs = {}, said = {}, saidTotal = {}, hands = {}, wonders = {}, moves = {}, tells = {}, titles = {}, sure = {}
  for (const text of texts) {
    const tokens = observe(text, legend.compounds, legend.variants)
    if (!tokens.length) continue
    tokens_ = tokens
    const stations = readRoutes(book, legend, index, tokens).stations.map(station => stationNames[station])
    const units = buildUnits(tokens, stations, lexicon)
    const head = unit => headKey(tokens, unit)
    let governed = null
    units.forEach((unit, i) => {
      const next = units[i + 1], after = units[i + 2], third = units[i + 3]
      if (unit.type === 'terminator') { governed = null; return }
      if (unit.type === 'entity') {
        // words that stand together inside an entity which no verb could have split
        if (unit.head && units[i - 1]?.type !== 'verb') {
          const before = [...unit.modifier ?? [], ...unit.compound ?? []].filter(position => position === unit.head[0] - 1)
          for (const position of before) bump(pairs, tokens[position].word + ' ' + tokens[unit.head[0]].word)
        }
        // is the word a thing (it heads entities) or a quality (it says what a thing is like)?
        if (unit.head && stations[unit.head[1]] === 'noun') bump(heads, tokens[unit.head[1]].word)
        unit.modifier?.forEach((position, k) => { if (unit.degree?.length && k === 0) bump(qualities, tokens[position].word) })
        // "a man wearing a hat": a verb form right after a thing that nothing else stands between says something of it
        if (!unit.pronoun && head(unit) && next?.type === 'verb' && next.form && !next.auxiliary.length && units[i - 1]?.type !== 'cue') {
          bump2(said, tokens[next.predicate[0]].word, head(unit))
          bump(saidTotal, head(unit))
          memory.add('v:' + tokens[next.predicate[0]].word, 'said', meant(unit))
        }
        // an entity no verb governs can only hold its own cue
        if (!unit.pronoun && head(unit)) bump(everyNoun, head(unit))
        if (!governed && !unit.pronoun && head(unit)) {
          bump(nounTotal, head(unit))
          if (next?.type === 'cue' && after?.type === 'entity') {
            bump2(noun, head(unit), tokens[next.last].word)
            memory.add('n:' + head(unit), tokens[next.last].word, meant(after))
          }
        } else if (governed && !unit.pronoun && head(unit) && next?.type === 'cue' && after?.type === 'entity') {
          // the verb or the entity may hold this cue: the case is settled below
          const key = governed + '\0' + head(unit) + '\0' + tokens[next.last].word
          doubtful.set(key, (doubtful.get(key) ?? 0) + 1)
          const target = headKey(tokens, after)
          if (target) { const full = key + '\0' + target; targets.set(full, (targets.get(full) ?? 0) + 1) }
        }
      } else if (unit.type === 'complement') {
        // after a cue the bare word is the thing pointed at; elsewhere it says what something is like
        if (units[i - 1]?.type === 'cue') bump(heads, tokens[unit.value[1]].word)
        else for (let position = unit.value[0]; position <= unit.value[1]; position++) bump(qualities, tokens[position].word)
      } else if (unit.type === 'verb') {
        const predicate = tokens[unit.predicate[0]].word
        bump(verbTotal, predicate)
        // a helping verb, a negation or "to" before it leaves no doubt that the word is a verb
        if (unit.auxiliary.length || unit.negation.length || units[i - 1]?.type === 'marker' && legend.links.get(tokens[units[i - 1].last].word) === 'infinitive') bump(sure, predicate)
        // a cue right after the verb, or after a pronoun object, can only belong to the verb
        if (next?.type === 'cue' && after?.type === 'entity') { bump2(verb, predicate, tokens[next.last].word); memory.add('v:' + predicate, tokens[next.last].word, meant(after)) }
        else if (next?.type === 'entity' && next.pronoun && after?.type === 'cue' && third?.type === 'entity') { bump2(verb, predicate, tokens[after.last].word); memory.add('v:' + predicate, tokens[after.last].word, meant(third)) }
        if (next?.type === 'entity' && !next.pronoun) memory.add('v:' + predicate, 'object', meant(next))
        // "make it blue": a verb that says what its object becomes (counted where the object is plain)
        if (next?.type === 'entity' && (next.pronoun || next.determiner?.length)) {
          bump(withObject, predicate)
          if (after?.type === 'complement') bump(becomes, predicate)
        }
        // "sort it out", "zoom in": a word that moves with the verb, seen where it cannot point at anything
        const lone = next?.type === 'entity' ? after : next
        const last = next?.type === 'entity' ? third : after
        if ((lone?.type === 'adverb' || lone?.type === 'cue') && lone.first === lone.last && legend.links.get(tokens[lone.first].word) === 'particle' && last?.type !== 'entity') bump2(moves, predicate, tokens[lone.first].word)
        // "need you to make": a verb whose object is the one who does what follows "to"
        if (next?.pronoun && after?.type === 'marker' && legend.links.get(tokens[after.last].word) === 'infinitive' && third?.type === 'verb') bump(tells, predicate)
        // "call it Bob": a verb that gives its object a name
        if (next?.pronoun && after?.type === 'entity' && after.name && !after.head && !after.determiner?.length) bump(titles, predicate)
        // "give me a hand": a verb seen with a person and then a thing hands things over
        if (next?.pronoun && legend.links.get(tokens[next.pronoun[0]].word) === 'recipient' && after?.type === 'entity' && !after.pronoun) bump(hands, predicate)
        // "check if …", "tell me whether …", "see what …": a verb that takes a question
        const asked = next?.type === 'entity' && next.pronoun ? after : next
        if (asked?.type === 'question' || asked?.type === 'marker' && conditions.has(tokens[asked.last].word)) bump(wonders, predicate)
        // "let us add": a verb whose object is followed by a bare verb takes a clause
        if (next?.type === 'entity' && next.pronoun && after?.type === 'verb' && !after.form && !after.auxiliary.length) bump(takes, predicate)
        governed = predicate
      }
    })
  }
  const nominal = {}
  for (const word of new Set([...Object.keys(heads), ...Object.keys(qualities)])) {
    // a thing has a plural that heads entities; a quality is said of things and has none
    const plural = legend.forms.find(form => form.name === 'plural')?.endings ?? []
    const many = plural.reduce((sum, ending) => sum + (heads[word + ending] ?? 0), 0) +
      (plural.some(ending => word.endsWith(ending) && heads[word.slice(0, -ending.length)]) ? heads[word] ?? 0 : 0)
    const thing = heads[word] ?? 0, quality = qualities[word] ?? 0
    if (many >= 2 && thing + many > 2 * quality) nominal[word] = 1
    else if (quality >= 3 && quality > thing) nominal[word] = 0
  }
  const takesQuality = Object.keys(becomes).filter(word => becomes[word] >= 3 && becomes[word] / withObject[word] >= 0.03)
  const directs = Object.keys(tells).filter(word => tells[word] >= 3 && tells[word] / verbTotal[word] >= 0.01)
  const names = Object.keys(titles).filter(word => titles[word] >= 3 && titles[word] / verbTotal[word] >= 0.01)
  const gives = Object.keys(hands).filter(word => hands[word] >= 3 && hands[word] / verbTotal[word] >= 0.01)
  const asks = Object.keys(wonders).filter(word => wonders[word] >= 3 && wonders[word] / verbTotal[word] >= 0.02)
  const takesClause = Object.keys(takes).filter(word => takes[word] >= 5 && takes[word] / verbTotal[word] >= 0.02)
  // Doubtful cases first count half for each side, then by what the counts so far say.
  const perCue = table => { const out = {}; for (const cues of Object.values(table)) for (const [cue, count] of Object.entries(cues)) bump(out, cue, count); return out }
  const sum = table => Object.values(table).reduce((a, b) => a + b, 0)
  const tables = (verbs, nouns, nounTotals) => ({
    verb: verbs, noun: nouns, verbTotal, nounTotal: nounTotals,
    verbCue: perCue(verbs), nounCue: perCue(nouns), verbAll: sum(verbTotal), nounAll: sum(nounTotals)
  })
  let attach = tables(verb, noun, nounTotal)
  // The sure cases undercount the verb (its object usually stands in between), by an unknown
  // factor. The first round therefore keeps only what they say about each cue against the
  // others, and shifts it so that the doubtful cases split evenly overall.
  const lean = cue => Math.log(((attach.verbCue[cue] ?? 0) / attach.verbAll + 1e-5) / ((attach.nounCue[cue] ?? 0) / attach.nounAll + 1e-5))
  const split = shift => {
    let toVerb = 0, all = 0
    for (const [key, count] of doubtful) { toVerb += count / (1 + Math.exp(-lean(key.split('\0')[2]) - shift)); all += count }
    return toVerb / all
  }
  let low = -20, high = 20
  for (let step = 0; step < 50; step++) { const mid = (low + high) / 2; if (split(mid) < 0.5) low = mid; else high = mid }
  const shift = (low + high) / 2
  for (let round = 0; round < 4; round++) {
    const verbs = structuredClone(verb), nouns = structuredClone(noun)
    const score = round ? attachment(attach) : (predicate, head, cue) => lean(cue) + shift
    for (const [key, count] of doubtful) {
      const [predicate, head, cue] = key.split('\0')
      const share = 1 / (1 + Math.exp(-score(predicate, head, cue)))
      bump(verbs[predicate] ??= {}, cue, count * share)
      bump(nouns[head] ??= {}, cue, count * (1 - share))
    }
    attach = tables(verbs, nouns, everyNoun)
  }
  // the doubtful cases enter the memory by the share the counts gave each side
  const settled = attachment(attach)
  for (const [key, count] of targets) {
    const [predicate, head, cue, target] = key.split('\0')
    const share = 1 / (1 + Math.exp(-settled(predicate, head, cue)))
    const filler = meanings.vector(target)
    memory.add('v:' + predicate, cue, filler, count * share)
    memory.add('n:' + head, cue, filler, count * (1 - share))
  }
  const prune = table => Object.fromEntries(Object.entries(table).map(([word, cues]) =>
    [word, Object.fromEntries(Object.entries(cues).filter(([, count]) => count >= 1).map(([cue, count]) => [cue, Number(count.toFixed(1))]))]).filter(([, cues]) => Object.keys(cues).length))
  const keep = (totals, table) => Object.fromEntries(Object.entries(totals).filter(([word, count]) => count >= 2 || table[word]))
  const round1 = table => Object.fromEntries(Object.entries(table).map(([cue, count]) => [cue, Number(count.toFixed(1))]))
  attach = {
    verb: prune(attach.verb), noun: prune(attach.noun), verbTotal: keep(verbTotal, attach.verb), nounTotal: keep(everyNoun, attach.noun),
    verbCue: round1(attach.verbCue), nounCue: round1(attach.nounCue), verbAll: attach.verbAll, nounAll: attach.nounAll
  }
  const together = Object.keys(pairs).filter(pair => pairs[pair] >= 2)
  const describes = Object.fromEntries(Object.entries(said).map(([form, heads]) => [form, Object.fromEntries(Object.entries(heads).filter(([, count]) => count >= 2))]).filter(([, heads]) => Object.keys(heads).length))
  const phrasal = Object.fromEntries(Object.entries(moves).map(([word, with_]) => [word, Object.keys(with_).filter(particle => with_[particle] >= 3)]).filter(([, list]) => list.length))
  return {nominal, takesClause, takesQuality, gives, asks, directs, names, phrasal, anchored: Object.keys(sure).filter(word => sure[word] >= 2), together, describes, verbTotal: Object.fromEntries(Object.entries(verbTotal).filter(([, count]) => count >= 3)), attach,
    memory: meanings.dimensions ? memory.store() : null}
}

/** What an entity is counted under: its head word, or its class when it is a name or verbatim content. */
export function headKey(tokens, unit) {
  return unit.head ? tokens[unit.head[1]].word : unit.name ? '~name' : unit.literal ? '~literal' : null
}

// Positive: the relation starts at the clause. Negative: at the entity before the cue.
// `near(word)` gives words used like this one, with their similarity: a word seen too rarely
// to have habits of its own borrows the habits of its neighbours in the semantic space.
export function attachment(stats, near = () => []) {
  if (!stats) return () => 1
  const smooth = 5, enough = 20
  const own = (table, totals, word, cue) => (table[word]?.[cue] ?? 0) / (totals[word] || 1)
  const rate = (table, totals, word, cue, prior) => {
    const seen = totals[word] ?? 0
    let lean = prior
    if (seen < enough) {
      let sum = 0, weight = 0
      for (const [other, similarity] of near(word)) {
        if ((totals[other] ?? 0) < enough || similarity <= 0) continue
        sum += similarity * own(table, totals, other, cue)
        weight += similarity
      }
      if (weight > 0) lean = sum / weight
    }
    return ((table[word]?.[cue] ?? 0) + smooth * lean) / (seen + smooth)
  }
  return (verb, head, cue) => {
    const verbPrior = (stats.verbCue[cue] ?? 0) / stats.verbAll, nounPrior = (stats.nounCue[cue] ?? 0) / stats.nounAll
    const byVerb = rate(stats.verb, stats.verbTotal, verb, cue, verbPrior)
    const byNoun = rate(stats.noun, stats.nounTotal, head, cue, nounPrior)
    return Math.log((byVerb + 1e-6) / (byNoun + 1e-6))
  }
}
