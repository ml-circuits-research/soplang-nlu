const evidenceKeys = new Set([
  'words','predicate','asked_words','sort_words','name_words','count_words','code_words',
  'family_words','key_words','measure_words','text','description','ids'
])
const word = /[\p{L}\p{M}\p{N}_]/u

function occurrences(text, quote) {
  const ranges = []
  if (!quote) return ranges
  for (let offset = 0; offset <= text.length - quote.length;) {
    const start = text.indexOf(quote, offset)
    if (start < 0) break
    const end = start + quote.length
    const insideWord = (word.test(quote[0]) && word.test(text[start-1] ?? '')) ||
      (word.test(quote.at(-1)) && word.test(text[end] ?? ''))
    if (!insideWord) ranges.push({start,end})
    offset = start + 1
  }
  return ranges
}

// Keep every possible location when a phrase repeats. A missing literal
// value may be licensed by a world mapping; only quoted evidence is required.
export function alignCircuit(text, wires) {
  const evidence = []
  const requestRanges = new Map()
  const decode = raw => raw.startsWith('"') ? JSON.parse(raw) : raw
  for (const wire of wires) {
    if (wire.type === 'w.request.request' && wire.attrs.words?.length) {
      requestRanges.set(wire.id, wire.attrs.words.flatMap(raw => occurrences(text, decode(raw))))
    }
  }
  for (const wire of wires) {
    const owner = wire.attrs.request?.[0]?.slice(1) ?? wire.id
    const scope = requestRanges.get(owner)
    for (const [key, values] of Object.entries(wire.attrs)) {
      const quoted = evidenceKeys.has(key)
      if (!quoted && !['value','name','sort'].includes(key)) continue
      for (const raw of values) {
        const surface = decode(raw)
        const ranges = occurrences(text, surface).filter(range =>
          !scope || scope.some(window => window.start <= range.start && range.end <= window.end))
        if (quoted || ranges.length) {
          evidence.push({wire:wire.id,key,surface,kind:quoted?'quoted':'literal',ranges})
        }
      }
    }
  }
  return evidence
}
