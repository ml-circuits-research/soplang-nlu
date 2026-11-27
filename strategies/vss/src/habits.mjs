// Habits of words, counted on unannotated text once the routes are learned. Each one is
// read off cases where the structure leaves no doubt, and then used where it does.
import {observe} from './observe.mjs'
import {readRoutes} from './routes.mjs'
import {buildUnits} from './units.mjs'

const bump = (table, key, by = 1) => { table[key] = (table[key] ?? 0) + by }
const bump2 = (table, a, b) => { bump(table[a] ??= {}, b) }

export function learnHabits(opened, texts) {
  const {legend, book, index, lexicon} = opened
  const names = legend.stations.map(station => station.as ?? station.name)
  const heads = {}, qualities = {}
  const verbTotal = {}, verb = {}, nounTotal = {}, noun = {}, takes = {}, everyNoun = {}, doubtful = new Map(), becomes = {}, withObject = {}, pairs = {}, said = {}, saidTotal = {}
  for (const text of texts) {
    const tokens = observe(text, legend.compounds)
    if (!tokens.length) continue
    const stations = readRoutes(book, legend, index, tokens).stations.map(station => names[station])
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
        }
        // an entity no verb governs can only hold its own cue
        if (!unit.pronoun && head(unit)) bump(everyNoun, head(unit))
        if (!governed && !unit.pronoun && head(unit)) {
          bump(nounTotal, head(unit))
          if (next?.type === 'cue' && after?.type === 'entity') bump2(noun, head(unit), tokens[next.last].word)
        } else if (governed && !unit.pronoun && head(unit) && next?.type === 'cue' && after?.type === 'entity') {
          // the verb or the entity may hold this cue: the case is settled below
          const key = governed + '\0' + head(unit) + '\0' + tokens[next.last].word
          doubtful.set(key, (doubtful.get(key) ?? 0) + 1)
        }
      } else if (unit.type === 'complement') {
        // after a cue the bare word is the thing pointed at; elsewhere it says what something is like
        if (units[i - 1]?.type === 'cue') bump(heads, tokens[unit.value[1]].word)
        else for (let position = unit.value[0]; position <= unit.value[1]; position++) bump(qualities, tokens[position].word)
      } else if (unit.type === 'verb') {
        const predicate = tokens[unit.predicate[0]].word
        bump(verbTotal, predicate)
        // a cue right after the verb, or after a pronoun object, can only belong to the verb
        if (next?.type === 'cue' && after?.type === 'entity') bump2(verb, predicate, tokens[next.last].word)
        else if (next?.type === 'entity' && next.pronoun && after?.type === 'cue' && third?.type === 'entity') bump2(verb, predicate, tokens[after.last].word)
        // "make it blue": a verb that says what its object becomes (counted where the object is plain)
        if (next?.type === 'entity' && (next.pronoun || next.determiner?.length)) {
          bump(withObject, predicate)
          if (after?.type === 'complement') bump(becomes, predicate)
        }
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
  return {nominal, takesClause, takesQuality, together, describes, attach}
}

/** What an entity is counted under: its head word, or its class when it is a name or verbatim content. */
export function headKey(tokens, unit) {
  return unit.head ? tokens[unit.head[1]].word : unit.name ? '~name' : unit.literal ? '~literal' : null
}

// Positive: the relation starts at the clause. Negative: at the entity before the cue.
export function attachment(stats) {
  if (!stats) return () => 1
  const smooth = 5
  const rate = (table, totals, word, cue, prior) => ((table[word]?.[cue] ?? 0) + smooth * prior) / ((totals[word] ?? 0) + smooth)
  return (verb, head, cue) => {
    const verbPrior = (stats.verbCue[cue] ?? 0) / stats.verbAll, nounPrior = (stats.nounCue[cue] ?? 0) / stats.nounAll
    const byVerb = rate(stats.verb, stats.verbTotal, verb, cue, verbPrior)
    const byNoun = rate(stats.noun, stats.nounTotal, head, cue, nounPrior)
    return Math.log((byVerb + 1e-6) / (byNoun + 1e-6))
  }
}
