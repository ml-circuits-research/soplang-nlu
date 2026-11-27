// Source tokens of a message. The pattern is the validator's, so a token here is exactly one
// coverage unit there: a date, a clock reading or a decimal stays whole, a clitic is split off.
const pattern = /[0-9]{4}-[0-9]{2}-[0-9]{2}(?![\p{L}\p{M}\p{N}_])|[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?(?![\p{L}\p{M}\p{N}_])|[+-]?(?:[0-9]+\.[0-9]+|\.[0-9]+)(?![\p{L}\p{M}\p{N}_])|[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*|[^\s]/gu
const clitic = /(?:n[’']t|[’'](?:s|d|m|re|ve|ll))$/iu

/** @returns {{text: string, start: number, end: number}[]} */
export function tokenize(text) {
  const tokens = []
  for (const match of text.matchAll(pattern)) {
    const surface = match[0]
    const cut = clitic.exec(surface)
    if (cut?.index > 0) {
      tokens.push({text: surface.slice(0, cut.index), start: match.index, end: match.index + cut.index},
        {text: surface.slice(cut.index), start: match.index + cut.index, end: match.index + surface.length})
    } else tokens.push({text: surface, start: match.index, end: match.index + surface.length})
  }
  return tokens
}

// The form a word is looked up by. Typographic apostrophes fold to the plain one.
export const fold = surface => surface.toLowerCase().replace(/’/gu, "'")

const isWord = /^[\p{L}\p{M}]/u
const isNumber = /^[+-]?[\p{N}]/u

/** Surface classes that need no learning: they are read off the characters. */
export function shapeOf(surface, sentenceInitial) {
  if (isNumber.test(surface)) {
    if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(surface)) return 'date'
    if (/^[0-9]{1,2}:[0-9]{2}/u.test(surface)) return 'clock'
    if (/^[+-]?[0-9.,]+$/u.test(surface)) return 'number'
    return 'code'                                   // 3px, 2nd, 10am
  }
  if (!isWord.test(surface)) return 'mark'
  // an address stands as written, like quoted words
  if (/[\p{L}\p{N}][.\/:@][\p{L}\p{N}\/]/u.test(surface)) return 'quote'
  if (/^[\p{N}]+,[\p{N}.,]+$/u.test(surface)) return 'number'
  if (/[\p{N}_]/u.test(surface)) return 'code'       // g1, node_2
  if (surface.length > 1 && surface === surface.toUpperCase()) return 'upper'
  if (surface[0] !== surface[0].toLowerCase()) return sentenceInitial ? 'initial' : 'capital'
  return 'lower'
}
