// Spelling variants. A rare word one edit away from a common word, and used the way that
// word is used, is read as that word. Form says they are close; the semantic space says they
// are the same word and not two words that happen to look alike ("cold", "could").

/** Edit distance with transpositions, cut off above `limit`. */
export function editDistance(a, b, limit = 1) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1
  let previous = null, current = Array.from({length: b.length + 1}, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const next = [i]
    for (let j = 1; j <= b.length; j++) {
      let cost = Math.min(current[j] + 1, next[j - 1] + 1, current[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (previous && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cost = Math.min(cost, previous[j - 2] + 1)
      next.push(cost)
    }
    previous = current
    current = next
  }
  return current[b.length]
}

const deletions = word => Array.from({length: word.length}, (_, i) => word.slice(0, i) + word.slice(i + 1))

/** An index of common words by themselves and their one-letter deletions. */
export function indexCommon(words) {
  const index = new Map()
  for (const word of words) for (const key of [word, ...deletions(word)]) (index.get(key) ?? index.set(key, []).get(key)).push(word)
  return word => {
    const found = new Set()
    for (const key of [word, ...deletions(word)]) for (const other of index.get(key) ?? []) if (other !== word && editDistance(word, other) <= 1) found.add(other)
    return [...found]
  }
}

/**
 * @param counts Map word -> occurrences; similarity(a, b) from the semantic space (0 when unknown)
 * @returns Map variant -> the common word it is a spelling of
 */
export function findVariants(counts, similarity, hasVector, fixed = () => false, {minLength = 5, ratio = 40, common = 100, alike = 0.6, rare = 12} = {}) {
  const plain = word => /^\p{Ll}+$/u.test(word)
  const targets = [...counts].filter(([word, count]) => count >= common && plain(word) && word.length >= minLength).map(([word]) => word)
  const near = indexCommon(targets)
  const variants = new Map()
  for (const [word, count] of counts) {
    // a spelling slip is rare: a word seen often is a word of its own
    if (!plain(word) || word.length < minLength || count > rare) continue
    let best = null, bestScore = -Infinity
    for (const target of near(word)) {
      if (counts.get(target) < ratio * count) continue
      // seen often enough to have a vector: it must be used like the target; seen too rarely
      // for one, a long word one edit from a very common one is taken for it
      // (`fixed`: the legend fixes the place of the target, so a slip of it matters most)
      const score = hasVector(word) ? similarity(word, target) + (fixed(target) ? 0.15 : 0)
        : word.length >= 6 && target.length >= 6 && fixed(target) ? alike : -1
      if (score >= alike && score > bestScore) { best = target; bestScore = score }
    }
    if (best) variants.set(word, best)
  }
  return variants
}
