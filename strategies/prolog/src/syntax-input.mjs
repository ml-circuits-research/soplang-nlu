// What the Prolog grammar receives for one message: its tokens and the classes of each.
// A token is one word of `wordsOf(text)`, a run of words that the sentence writes as one
// ("x-axis", "and/or"), or one punctuation mark. Every word of the message stands in
// exactly one token, so a range of tokens is a span of words.
import {wordsOf} from '../../../lib/syntax.mjs'
import {classesOf, multiwordClasses, longestMultiword, isPhrasal} from './english.mjs'

const QUOTATION = /"(?:\\.|[^"\\\n])*"|“[^”\n]*”|«[^»\n]*»|(?<![\p{L}\p{N}])‘[^’\n]*’(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])'[^'\n]*'(?![\p{L}\p{N}])/gu
const JOINER = /^[-‐‑/]$/u
const ALPHANUMERIC = /^[\p{L}\p{M}\p{N}_]+$/u
const CLOSED = new Set(['det', 'prep', 'conj', 'to'])

/** @returns {tokens: [{raw, lower, word: [first, last] | null, quote, parts}], packet} */
export function syntaxInput(text) {
  const words = wordsOf(text)
  const quoteOf = position => quotes.findIndex(quote => position >= quote[0] && position < quote[1]) + 1
  const quotes = [...text.matchAll(QUOTATION)].map(match => [match.index, match.index + match[0].length])
  const tokens = []
  const marks = (from, to) => {
    for (let at = from; at < to; at++) {
      if (/\s/u.test(text[at])) continue
      // a surrogate pair never stands here: every mark is one code unit
      tokens.push({raw: text[at], lower: text[at], word: null, quote: quoteOf(at), start: at, end: at + 1})
    }
  }
  let previous = 0
  for (const [index, word] of words.entries()) {
    const gap = text.slice(previous, word.start)
    const last = tokens.at(-1)
    if (index && last?.word && JOINER.test(gap) && !quoteOf(word.start) && !last.quote &&
        ALPHANUMERIC.test(word.text) && ALPHANUMERIC.test(words[index - 1].text)) {
      last.word[1] = index; last.end = word.end; last.raw = text.slice(last.start, word.end)
      last.lower = last.raw.toLowerCase(); last.parts.push(word.text.toLowerCase())
    } else {
      marks(previous, word.start)
      tokens.push({raw: word.text, lower: word.text.toLowerCase().replace(/’/gu, "'"), word: [index, index], quote: quoteOf(word.start),
        start: word.start, end: word.end, parts: [word.text.toLowerCase()]})
    }
    previous = word.end
  }
  marks(previous, text.length)

  // Capital letters. A word written with a capital inside a sentence is a name, unless the
  // message writes its small words with capitals too (a title, or all capitals).
  const capital = token => token.word && /^\p{Lu}/u.test(token.raw) && token.lower !== 'i'
  const opens = tokens.map((token, at) => {
    if (!token.word) return false
    for (let before = at - 1; before >= 0; before--) {
      if (tokens[before].word) return false
      if (/[.!?;]/u.test(tokens[before].raw) && !tokens[before].quote) return true
    }
    return true
  })
  const lexical = tokens.map(token => token.word ? (token.parts.length > 1 ? compound(token.parts) : classesOf(token.lower)) : null)
  // one capital letter is a name of its own ("move A below B"), never a sign of a title
  const titled = tokens.filter((token, at) => capital(token) && !opens[at] && !token.quote && token.raw.length > 1 &&
    lexical[at].pos.some(pos => CLOSED.has(pos)) && !lexical[at].pos.includes('verb')).length > 1
  const forms = tokens.map((token, at) => {
    if (!token.word) return []
    const entry = lexical[at]
    const features = [...entry.features]
    let pos = entry.pos
    if (capital(token)) {
      features.push(['capital', 'true'])
      if (!opens[at] && !titled) { pos = ['noun']; features.push(['name', 'true']) }
    } else if (/\p{L}/u.test(token.raw) && /\p{N}/u.test(token.raw) && entry.features.some(item => item[0] === 'unknown')) {
      // letters and digits in one word: an identifier, which is a name ("n5", "r2")
      features.push(['name', 'true'])
    }
    const next = tokens[at + 1]
    if (next?.word) for (const [key, base] of entry.features) if (key === 'base' && isPhrasal(base, next.lower)) features.push(['phrasal', next.lower])
    const single = [at + 1, pos, features]
    const longer = []
    if (!token.quote) for (let end = at + 2; end <= Math.min(tokens.length, at + longestMultiword); end++) {
      const run = tokens.slice(at, end)
      if (run.some(item => !item.word || item.quote || item.parts.length > 1)) break
      if (!titled && run.some((item, offset) => capital(item) && !opens[at + offset])) break
      const found = multiwordClasses(run.map(item => item.lower))
      if (found) longer.unshift([end, found.pos, found.features])
    }
    return [...longer, single]
  })
  return {tokens, words, packet: {tokens: tokens.map(token => [token.raw, token.lower, token.word ? 'word' : 'punct', token.quote]), forms}}
}

// The class of a compound written with a hyphen or a slash follows its last part.
function compound(parts) {
  const last = classesOf(parts.at(-1))
  const has = name => last.pos.includes(name)
  const form = name => last.features.some(item => item[0] === 'vform' && item[1] === name)
  if (has('conj')) return {pos: ['conj'], features: [['compound', 'true']]}
  if (has('verb') && (form('ed') || form('en') || form('ing')) && !form('base')) return {pos: ['adj'], features: [['compound', 'true']]}
  if (has('adj') && !has('noun')) return {pos: ['adj'], features: [['compound', 'true']]}
  if (has('verb') && form('base') && last.features.some(item => item[0] === 'verbal' && item[1] === 'strong') && !has('part')) {
    return {pos: ['verb', 'noun'], features: [...last.features.filter(item => item[0] !== 'verbal'), ['verbal', 'balanced'], ['compound', 'true']]}
  }
  return {pos: ['noun', 'adj'], features: [['compound', 'true'], ...last.features.filter(item => item[0] === 'number')]}
}
