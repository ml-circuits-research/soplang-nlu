// Forms of one word. The legend lists the endings; a form belongs to a family when stripping an
// ending leaves a word the text also uses. Nothing here knows what any word means.

/** Candidate stems of a word, nearest first. */
export function stemsOf(word, endings) {
  const stems = []
  const listed = endings.irregular?.get(word)
  if (listed) stems.push(listed)
  for (const ending of endings) {
    if (!word.endsWith(ending) || word.length - ending.length < 3) continue
    const base = word.slice(0, -ending.length)
    stems.push(base, base + 'e')
    if (base.length > 3 && base.at(-1) === base.at(-2)) stems.push(base.slice(0, -1))
    if (base.endsWith('i')) stems.push(base.slice(0, -1) + 'y')
  }
  return stems
}

/** stem[i] = the symbol that symbol i is a form of, or -1. */
export function stemLinks(symbols, endings, eligible) {
  const index = new Map(symbols.map((symbol, id) => [symbol, id]))
  return Int32Array.from(symbols, (symbol, id) => {
    if (!eligible(symbol, id)) return -1
    for (const stem of stemsOf(symbol, endings)) {
      const other = index.get(stem)
      if (other !== undefined && other !== id && eligible(stem, other)) return other
    }
    return -1
  })
}
