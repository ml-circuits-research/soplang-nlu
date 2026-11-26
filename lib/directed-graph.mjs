const projections = ['strict', 'syntax']
const optionalSemantics = {
  'nlu.clause': new Set(['act', 'result_color']),
  'nlu.entity': new Set(['kind', 'color'])
}
const connectives = new Map([
  ['additive', 'and'], ['conjunctive', 'and'],
  ['alternative', 'or'], ['disjunctive', 'or']
])
const byText = (left, right) => left < right ? -1 : left > right ? 1 : 0
const encode = JSON.stringify

export function directedGraph(wires, projection) {
  if (!projections.includes(projection)) throw new RangeError('Unknown graph projection ' + projection)
  const ids = new Map(wires.map(({id}, index) => ['$' + id, index]))
  const nodes = wires.map(({type, attrs}) => {
    const slots = []
    const outgoing = new Map()
    const orderedMembers = type === 'nlu.coordination' && ['sequence', 'contrast'].includes(attrs.kind?.[0])
    for (const [key, values] of Object.entries(attrs).sort(([a], [b]) => byText(a, b))) {
      if (projection === 'syntax' && (optionalSemantics[type]?.has(key) ||
        (type === 'nlu.clause' && key === 'polarity' && values.join() === 'positive' && !attrs.negation))) continue
      const literals = []
      for (const [index, raw] of values.entries()) {
        if (raw.startsWith('$')) {
          const target = ids.get(raw)
          if (target === undefined) throw new Error('Missing graph node ' + raw)
          if (!outgoing.has(target)) outgoing.set(target, [])
          outgoing.get(target).push(orderedMembers && key === 'member' ? key + ':' + index : key)
        } else {
          const atom = projection === 'syntax' && type === 'nlu.coordination' && key === 'kind'
            ? connectives.get(raw) ?? raw : raw
          literals.push(raw.startsWith('"') ? ['source', JSON.parse(raw)] : ['atom', atom])
        }
      }
      if (literals.length) slots.push([key, literals.sort((a, b) => byText(encode(a), encode(b)))])
    }
    return {label: encode([type, slots]), outgoing, incoming: new Map()}
  })
  for (const [source, node] of nodes.entries()) {
    for (const [target, roles] of node.outgoing) {
      const edge = encode(roles.sort(byText))
      node.outgoing.set(target, edge)
      nodes[target].incoming.set(source, edge)
    }
  }
  return nodes
}

// Refine the two graphs together so equal color numbers name the same
// structural class. Exact matching checks ambiguous classes without assuming
// color refinement proves isomorphism.
function compatibleColors(left, right) {
  const assign = (labels) => {
    const names = [...new Set(labels.flat())].sort(byText)
    const ids = new Map(names.map((name, index) => [name, index]))
    return {count: names.length, colors: labels.map(group => group.map(name => ids.get(name)))}
  }
  const graphs = [left, right]
  let state = assign(graphs.map(nodes => nodes.map(({label}) => label)))
  const sameCounts = ([a, b]) => encode(a.toSorted((i,j)=>i-j)) === encode(b.toSorted((i,j)=>i-j))
  while (sameCounts(state.colors)) {
    const next = assign(graphs.map((nodes, side) => nodes.map((node, index) => {
      const neighbors = links => [...links].map(([other, roles]) => encode([roles, state.colors[side][other]])).sort(byText)
      return encode([state.colors[side][index], neighbors(node.outgoing), neighbors(node.incoming)])
    })))
    if (next.count === state.count) return next.colors
    state = next
  }
  return null
}

export function sameDirectedGraph(left, right) {
  if (left.length !== right.length) return false
  const classColors = compatibleColors(left, right)
  if (!classColors) return false
  const [leftColors, rightColors] = classColors
  const candidates = left.map((node, index) => right.flatMap((other, target) =>
    leftColors[index] === rightColors[target] && node.label === other.label ? [target] : []))
  const order = left.map((_, index) => index).sort((i,j) =>
    candidates[i].length - candidates[j].length ||
    left[j].outgoing.size + left[j].incoming.size - left[i].outgoing.size - left[i].incoming.size)
  const matched = new Map()
  const used = new Set()
  function search(index) {
    if (index === order.length) return true
    const source = order[index]
    for (const target of candidates[source]) {
      if (used.has(target) || left[source].outgoing.get(source) !== right[target].outgoing.get(target)) continue
      const consistent = [...matched].every(([a, b]) =>
        left[source].outgoing.get(a) === right[target].outgoing.get(b) &&
        left[source].incoming.get(a) === right[target].incoming.get(b))
      if (!consistent) continue
      matched.set(source, target)
      used.add(target)
      if (search(index + 1)) return true
      matched.delete(source)
      used.delete(target)
    }
    return false
  }
  return search(0)
}

