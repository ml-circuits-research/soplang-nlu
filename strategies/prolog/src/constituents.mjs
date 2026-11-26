// The Prolog chart supplies types, roles, dependencies and source intervals.
export function serializeConstituents(text, tokens, wires) {
  const lines = wires.map(([id, type, fields]) => {
    const attrs = fields.map(([key, kind, value, end, length]) => {
      if (kind === 'piece') {
        const letters = [...tokens[value].raw]
        return key + '=' + JSON.stringify(letters.slice(end, end + length).join(''))
      }
      if (kind === 'ref') return key + '=$w' + value
      if (kind === 'atom') return key + '=' + value
      return key + '=' + JSON.stringify(text.slice(tokens[value].start, tokens[end - 1].end))
    })
    return '@w' + id + ' nlu.' + type + ' ' + attrs.join(' ')
  })
  return {sop: lines.join('\n'), semanticEvidence: []}
}
