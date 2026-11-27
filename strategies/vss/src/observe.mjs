// What the route model sees of a message: one observation per token. A quoted passage is
// one observation, because the quotes say it is verbatim content.
import {tokenize, fold, shapeOf} from './tokens.mjs'

const opening = new Map([['"', '"'], ['“', '”'], ['‘', '’'], ['«', '»'], ["'", "'"]])
const suffixes = ['ing', 'ed', 'ly', 'est', 'er', 's']
const formShapes = new Set(['number', 'date', 'clock', 'code', 'mark', 'quote'])
export const SHAPES = ['lower', 'capital', 'upper']

/**
 * Tokens with quoted passages and the legend's compounds joined:
 * [{text, start, end, word, shape, first, last}], first and last being source token positions.
 */
export function observe(text, compounds = new Map()) {
  const raw = joinWritten(text, tokenize(text))
  const out = []
  for (let i = 0; i < raw.length; i++) {
    const closing = opening.get(raw[i].text)
    if (closing) {
      let j = i + 1
      while (j < raw.length && raw[j].text !== closing) j++
      if (j < raw.length && j > i + 1) {
        out.push({text: text.slice(raw[i].start, raw[j].end), start: raw[i].start, end: raw[j].end, word: '~quote', shape: 'quote', first: raw[i].first, last: raw[j].last})
        i = j
        continue
      }
    }
    const initial = out.length === 0 || out.at(-1).shape === 'mark' && /[.!?]/u.test(out.at(-1).text)
    const joined = (compounds.get(fold(raw[i].text)) ?? []).find(parts => parts.every((part, k) =>
      raw[i + k] && fold(raw[i + k].text) === part && (k === 0 || raw[i + k].start === raw[i + k - 1].end || /^\s+$/u.test(text.slice(raw[i + k - 1].end, raw[i + k].start)))))
    if (joined) {
      const j = i + joined.length - 1
      out.push({text: text.slice(raw[i].start, raw[j].end), start: raw[i].start, end: raw[j].end, word: joined.join(' '), shape: 'lower', first: raw[i].first, last: raw[j].last})
      i = j
      continue
    }
    const shape = shapeOf(raw[i].text, initial)
    // a word written with a capital inside a sentence is not the same symbol as its plain form
    const plain = fold(raw[i].text)
    const word = (shape === 'capital' || shape === 'upper') && !compounds.listed?.has(plain) ? raw[i].text.replace(/’/gu, "'") : plain
    out.push({...raw[i], word, shape})
  }
  return out
}

// What is written as one word is one token: "soft-focus", "Q1-Q4", "260,180".
function joinWritten(text, tokens) {
  const out = []
  const wordLike = token => /^[\p{L}\p{N}]/u.test(token.text)
  for (let i = 0; i < tokens.length; i++) {
    let j = i
    while (wordLike(tokens[j]) && tokens[j + 2] && wordLike(tokens[j + 2]) && tokens[j].end === tokens[j + 1].start && tokens[j + 1].end === tokens[j + 2].start &&
           (tokens[j + 1].text === '-' || tokens[j + 1].text === ',' && /^\p{N}+$/u.test(tokens[j].text) && /^\p{N}/u.test(tokens[j + 2].text))) j += 2
    out.push(j > i ? {text: text.slice(tokens[i].start, tokens[j].end), start: tokens[i].start, end: tokens[j].end, first: i, last: j}
      : {...tokens[i], first: i, last: i})
    i = j
  }
  return out
}

/** The symbol a token is looked up by when its own word is not in the vocabulary. */
export function classOf(word, shape) {
  if (formShapes.has(shape)) return '~' + shape
  if (shape === 'capital' || shape === 'upper' || shape === 'initial') return '~' + shape
  for (const suffix of suffixes) if (word.length > suffix.length + 2 && word.endsWith(suffix)) return '~' + suffix
  return '~word'
}

export const CLASSES = ['~number', '~date', '~clock', '~code', '~mark', '~quote', '~capital', '~upper', '~initial', '~word',
  ...suffixes.map(suffix => '~' + suffix)]

export const shapeIndex = shape => shape === 'capital' ? 1 : shape === 'upper' ? 2 : 0
export const isFormShape = shape => formShapes.has(shape)
