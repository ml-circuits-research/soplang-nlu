// Exact serialisation coverage under WebMeet legend v1.2. A novel circuit
// can still earn L4 through a separate semantic assessment.
export function compareAlternatives(references, proposals) {
  const distinct = circuits => new Set(circuits
    .map(circuit => circuit.replace(/\r\n?/g, '\n').trim())
    .filter(Boolean))
  const expected = distinct(references)
  const actual = distinct(proposals)
  const matched = [...expected].filter(circuit => actual.has(circuit)).length
  return {
    references: expected.size,
    proposals: actual.size,
    matched,
    missing: expected.size - matched,
    unlisted: actual.size - matched
  }
}
