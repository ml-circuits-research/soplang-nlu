const wordPattern = /[\p{L}\p{N}\p{M}_]+|[^\s]/gu;
export function tokens(text) {
  const out = [];
  let pos = 0, previous = 0;
  for (const match of text.matchAll(wordPattern)) {
    pos += Array.from(text.slice(previous, match.index)).length;
    const end = pos + Array.from(match[0]).length;
    out.push([match[0].toLowerCase(), match[0], pos, end]);
    previous = match.index + match[0].length;
    pos = end;
  }
  return out;
}

// These spans are used to slice JavaScript strings directly.
export function tokenize(text) {
  return [...text.matchAll(wordPattern)].map(match => ({
    raw: match[0],
    key: match[0].toLowerCase(),
    start: match.index,
    end: match.index + match[0].length,
  }));
}
