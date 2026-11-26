// Offset-preserving tokenizer for nl-formaliser.
// Every token preserves exact [start, end) character offsets in the source text
// so `text.slice(tok.start, tok.end) === tok.text` holds unconditionally.

import { lemmatiseWord } from './morph.mjs';

const TZ_PATH_RE = /^[A-Z][A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/;
const TZ_ABBR_RE = /^(?:UTC|GMT|EST|EDT|CST|CDT|MST|MDT|PST|PDT|CET|CEST|EET|EEST|BST|IST|JST)$/;
const CODE_RE = /^[a-zA-Z]{1,2}\d+$/;

// Ordered atomic token patterns. Special multi-char/structured tokens are matched
// before splitting on punctuation or plain words.
const TOKEN_PATTERNS = [
  // Double-quoted strings (ASCII "..." or curly “...”)
  { kind: 'quote', re: /"(?:[^"\\]|\\.)*"|“[^”]*”/y },
  // ISO dates YYYY-MM-DD (not immediately followed by word chars)
  { kind: 'date', re: /\d{4}-\d{2}-\d{2}(?![A-Za-z0-9_])/y },
  // Times: HH:MM(:SS)?(am|pm)? or 5pm / 10am
  { kind: 'time', re: /\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:am|pm))?(?![A-Za-z0-9_])|\d{1,2}(?:am|pm)(?![A-Za-z0-9_])/iy },
  // Timezone IANA paths like Europe/Bucharest, America/New_York
  { kind: 'word', re: /[A-Z][A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?(?![A-Za-z0-9_])/y, isTimezone: true },
  // Coordinate pairs without spaces: 260,180 or -10,20
  { kind: 'coord', re: /-?(?:\d+(?:\.\d+)?|\.\d+), ?(?:-?(?:\d+(?:\.\d+)?|\.\d+))(?![A-Za-z0-9_])/y },
  // Signed/unsigned decimals, integers, percentages
  { kind: 'number', re: /-?(?:\d+(?:\.\d+)?|\.\d+)%?(?![A-Za-z0-9_])/y },
  // Words (including contractions, hyphens, 3d, etc.)
  { kind: 'word', re: /[A-Za-z0-9]+(?:['\u2019-][A-Za-z0-9]+)*/y },
  // Punctuation
  { kind: 'punct', re: /[,;.\?!:()\-—–\/]/y },
];

function checkGrammarWord(word, kb) {
  if (!kb) return false;
  if (typeof kb.isGrammarWord === 'function') return Boolean(kb.isGrammarWord(word));
  const lower = word.toLowerCase().replace(/\u2019/g, "'");
  const gSet = kb.grammar?.grammarWords ?? kb.grammar?.words;
  if (gSet instanceof Set) return gSet.has(lower);
  if (Array.isArray(gSet)) return gSet.includes(lower);
  return false;
}

function checkFillerWord(word, kb) {
  if (!kb) return false;
  if (typeof kb.isFillerWord === 'function') return Boolean(kb.isFillerWord(word));
  const lower = word.toLowerCase().replace(/\u2019/g, "'");
  if (kb.grammar?.fillerWords instanceof Set) return kb.grammar.fillerWords.has(lower);
  if (Array.isArray(kb.grammar?.fillerWords)) return kb.grammar.fillerWords.includes(lower);
  return false;
}

function unquoteToken(raw) {
  if (raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw.slice(1, -1);
    }
  }
  if (raw.startsWith('“') && raw.endsWith('”')) {
    return raw.slice(1, -1);
  }
  return raw;
}

/**
 * Tokenize `text` preserving exact character offsets.
 * @param {string} text
 * @param {object|null} kb
 * @returns {Array<object>}
 */
export function tokenize(text, kb = null) {
  const src = String(text ?? '');
  const tokens = [];
  let pos = 0;

  while (pos < src.length) {
    // Skip whitespace
    if (/\s/.test(src[pos])) {
      pos++;
      continue;
    }

    let matched = null;
    for (const spec of TOKEN_PATTERNS) {
      // Do not parse `260, 180` as single coord token when space is present here;
      // space-less `260,180` is atomic, while `[number, ',', number]` is combined in candidates.mjs.
      if (spec.kind === 'coord') {
        spec.re.lastIndex = pos;
        const m = spec.re.exec(src);
        if (m && !m[0].includes(' ')) {
          matched = { kind: 'coord', raw: m[0], start: pos, end: pos + m[0].length };
          break;
        }
        continue;
      }

      // Prevent `-` after an alphanumeric char (e.g. `5-10`) from binding `-10` as a negative number
      if (spec.kind === 'number' && src[pos] === '-' && pos > 0 && /[A-Za-z0-9_]/.test(src[pos - 1])) {
        continue;
      }

      // Prevent `3d` from matching `3` as number when immediately followed by letters
      spec.re.lastIndex = pos;
      const m = spec.re.exec(src);
      if (m) {
        matched = {
          kind: spec.kind,
          raw: m[0],
          start: pos,
          end: pos + m[0].length,
          isTimezone: Boolean(spec.isTimezone),
        };
        break;
      }
    }

    if (!matched) {
      // Fallback single non-whitespace char as punct
      matched = { kind: 'punct', raw: src[pos], start: pos, end: pos + 1 };
    }

    let { kind, raw, start, end, isTimezone } = matched;

    // Refine word -> code if matching /^[a-zA-Z]{1,2}\d+$/
    if (kind === 'word' && CODE_RE.test(raw)) {
      kind = 'code';
    }
    if (kind === 'word' && (TZ_PATH_RE.test(raw) || TZ_ABBR_RE.test(raw))) {
      isTimezone = true;
    }

    const lower = raw.toLowerCase().replace(/\u2019/g, "'");
    const beforeTrimmed = src.slice(0, start).trimEnd();
    const isSentenceStart =
      tokens.length === 0 ||
      !beforeTrimmed ||
      /[.!?:;"\u201c(\-\u2014\u2013]$/.test(beforeTrimmed);
    const isCapitalized = /^[A-Z]/.test(raw);
    const isPunct = kind === 'punct';
    const isGrammar = !isPunct && kind === 'word' && checkGrammarWord(raw, kb);
    const isFiller = !isPunct && checkFillerWord(raw, kb);
    const isProperCandidate =
      kind === 'word' &&
      isCapitalized &&
      !isSentenceStart &&
      !/^I('|$)/.test(raw) &&
      !/^[A-Z]{2,}s?$/.test(raw);
    const isContent = (!isPunct && !isGrammar) || isProperCandidate;
    const lemmas = kind === 'word' ? lemmatiseWord(raw, kb) : [lower];

    const tok = {
      index: tokens.length,
      text: raw,
      lower,
      start,
      end,
      kind,
      isSentenceStart,
      isCapitalized,
      isProperCandidate,
      isGrammar,
      isFiller,
      isPunct,
      isContent,
      lemmas,
    };

    if (isTimezone) tok.isTimezone = true;
    if (kind === 'quote') tok.inner = unquoteToken(raw);
    if (kind === 'coord') {
      const [cx, cy] = raw.split(',');
      tok.coordX = cx;
      tok.coordY = cy;
    }

    tokens.push(tok);
    pos = end;
  }

  return tokens;
}
