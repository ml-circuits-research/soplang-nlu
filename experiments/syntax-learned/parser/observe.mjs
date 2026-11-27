// What the parser sees of each word: its form, its ending, its shape, the punctuation around it,
// and what VSS's learned model says of it (the station of the route decoding, the kinds counts of
// the word habits). Portable: needs only VSS's reader (plain JS) and lib/syntax.mjs.
import {wordsOf} from '/home/salboaie/work/sopworlds/soplang-nlu/lib/syntax.mjs'

const bucket = c => c <= 0 ? 0 : c < 3 ? 1 : c < 20 ? 2 : c < 200 ? 3 : 4
const PUNCT = /[.,;:!?()[\]{}"'“”‘’«»—–\-…/\\]/gu

export function shapeOf(surface, initial) {
  if (/^[+-]?\p{N}/u.test(surface)) {
    if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(surface)) return 'date'
    if (/^[0-9]{1,2}:[0-9]{2}/u.test(surface)) return 'clock'
    if (/^[+-]?[0-9.,]+$/u.test(surface)) return 'num'
    return 'code'
  }
  if (!/^[\p{L}\p{M}]/u.test(surface)) return /^['’]/u.test(surface) ? 'clitic' : 'sym'
  if (/[\p{N}_]/u.test(surface)) return 'code'
  if (surface.length > 1 && surface === surface.toUpperCase()) return 'upper'
  if (surface[0] !== surface[0].toLowerCase()) return initial ? 'init' : 'cap'
  return 'low'
}

/**
 * @param vss the VSS reader (createVssReader(model, {schema: 'syntax'})) or null
 * @returns {words, atoms: [{w, sfx, shape, st, kd, pp, pn, first, q}], endsQ}
 */
const flag = (on, name) => on ? name : ''
// VSS's learned word habits (strategies/hmm-rules/src/reader.mjs, lexicon; the strategy was then named vss), in three groups
function habitsOf(lex, word) {
  const verbal = [flag(lex.takesClause(word), 'tc'), flag(lex.takesQuality(word), 'tq'), flag(lex.gives(word), 'gv'), flag(lex.asks(word), 'ak'), flag(lex.directs(word), 'dr'),
    flag(lex.names(word), 'nm'), flag(lex.makesDo(word), 'md'), flag(lex.anchoredVerb(word), 'an'), flag(lex.sForm(word), 'sf'), lex.formOf(word) ?? ''].join('')
  const nom = lex.nominal(word)
  const nominal = [nom === true ? 'n1' : nom === false ? 'n0' : '', flag(lex.thingFirst(word), 'tf'), flag(lex.saysHow(word), 'sh'), flag(lex.gradedForm(word), 'gf'), flag(lex.pluralThing(word), 'pt'), lex.leans?.(word) ?? ''].join('')
  return {hb1: verbal || '-', hb2: nominal || '-', lk: lex.linksThings(word) ? 'lk' : '-'}
}
export function observeWords(text, vss, clusters = null) {
  const words = wordsOf(text)
  let stations = null, tokens = null
  if (vss) { try { const r = vss.analyse(text); stations = r.stations; tokens = r.tokens } catch { stations = null } }
  const atoms = words.map((word, k) => {
    const before = text.slice(k ? words[k - 1].end : 0, word.start)
    const after = text.slice(word.end, k + 1 < words.length ? words[k + 1].start : text.length)
    const pp = (before.match(PUNCT) ?? []).join('').slice(-2)
    const pn = (after.match(PUNCT) ?? []).join('').slice(0, 2)
    const initial = k === 0 || /[.!?]/u.test(pp)
    const lower = word.text.toLowerCase().replace(/’/gu, "'")
    let st = '-', part = 'S'
    if (tokens) {
      const t = tokens.findIndex(token => token.start <= word.start && word.start < token.end)
      if (t >= 0) {
        st = stations[t] ?? '-'
        if (tokens[t].end > word.end || tokens[t].start < word.start) part = tokens[t].start === word.start ? 'B' : 'I'
        if (tokens[t].shape === 'quote') { st = 'quote'; }
      }
    }
    let kd = 'k?'
    if (vss) {
      const seen = vss.lexicon.kindsOf(lower)
      kd = 'v' + bucket(seen.verb) + 't' + bucket(seen.thing) + 'q' + bucket(seen.quality)
    }
    const habits = vss ? habitsOf(vss.lexicon, lower) : {hb1: '?', hb2: '?', lk: '?'}
    const cl = clusters?.[lower] ?? null
    return {w: lower, sfx: lower.slice(-3), shape: shapeOf(word.text, initial), st: st + (part === 'S' ? '' : '.' + part), kd, pp, pn, first: initial ? 1 : 0,
      ...habits, c64: cl ? 'c' + cl[0] : '-', c256: cl ? 'd' + cl[1] : '-'}
  })
  // pairs the habits know: a verb with its particle (adjacent, or after the nearest earlier verb within four words), words seen together
  if (vss) for (let k = 0; k < atoms.length; k++) {
    const prev = k ? atoms[k - 1].w : null
    atoms[k].pr = prev && vss.lexicon.phrasal(prev, atoms[k].w) ? 'ph' : prev && vss.lexicon.together(prev, atoms[k].w) ? 'tg' : '-'
    let pv = '-'
    for (let j = k - 1; j >= Math.max(0, k - 4); j--) if (/^(predicate|following)/u.test(atoms[j].st)) { pv = vss.lexicon.phrasal(atoms[j].w, atoms[k].w) ? 'ph' + (k - j) : vss.lexicon.separable(atoms[j].w, atoms[k].w) ? 'sp' + (k - j) : '-'; break }
    atoms[k].pv = pv
  }
  return {words, atoms, endsQ: /\?\s*$/u.test(text) ? 1 : 0, sentences: 1 + (text.trim().match(/[.!?]+\s+\S/gu)?.length ?? 0)}
}
