// The syntactic layer of a reading: an nlu circuit rewritten in the small `syntax` schema.
// Every quoted word keeps its wire; only the fine distinctions between slots are dropped.
const KIND = {imperative: 'command', declarative: 'statement', interrogative: 'question', fragment: 'mention', nonfinite: 'dependent'}
const FACT = {predicate: 'action', expression: 'action', auxiliary: 'helper', negation: 'helper', particle: 'helper', adverb: 'how', result_complement: 'how', degree: 'how', question: 'asks',
  subject: 'doer', direct_object: 'thing', indirect_object: 'thing', predicative_entity: 'thing', topic: 'thing', participant: 'thing'}
const HEADS = new Set(['head', 'name', 'pronoun', 'literal'])
const DESCRIBES = new Set(['nominal_clause', 'modifier', 'relative', 'relative_clause', 'apposition', 'elaboration', 'attribute', 'value', 'label'])
const DROPPED = new Set(['act', 'speech_act', 'polarity', 'completion', 'result_color', 'color', 'kind'])

function parse(sop) {
  return sop.split('\n').filter(line => line.trim()).map(line => {
    const [, id, type, rest] = /^@(\S+)\s+(\S+)\s*(.*)$/u.exec(line) ?? []
    const slots = [...(rest ?? '').matchAll(/([A-Za-z_]+)=("(?:[^"\\]|\\.)*"|\S+)/gu)].map(match => [match[1], match[2]])
    return {id, type, slots}
  })
}

/** An nlu circuit as a syntax circuit: the same words in the same wires, with the syntax schema's keys. */
export function toSyntax(sop) {
  const wires = parse(sop), byId = new Map(wires.map(wire => ['$' + wire.id, wire]))
  const lines = [], extra = []
  let links = 0
  for (const wire of wires) {
    const out = []
    const value = key => wire.slots.find(slot => slot[0] === key)?.[1]
    if (wire.type === 'nlu.clause') {
      const acts = wire.slots.some(slot => slot[0] === 'predicate')
      out.push(`@${wire.id} syntax.fact kind=${acts ? KIND[value('form')] ?? 'statement' : 'mention'}`)
      let asked = false, acted = false
      for (const [key, raw] of wire.slots) {
        if (key === 'form' || DROPPED.has(key)) continue
        if (key === 'clausal_complement') { extra.push(`@l${++links} syntax.link kind=completes from=$${wire.id} to=${raw}`); continue }
        let to = FACT[key] ?? 'word'
        // one action and one asking word per fact; a second one keeps its words as plain words of the fact
        if (to === 'action') { if (acted) to = 'word'; acted = true }
        if (to === 'asks') { if (asked) to = 'word'; asked = true }
        if (to === 'doer' && out.some(part => part.startsWith('doer='))) to = 'thing'
        out.push(`${to}=${raw}`)
      }
    } else if (wire.type === 'nlu.entity') {
      out.push(`@${wire.id} syntax.thing`)
      let headed = false
      for (const [key, raw] of wire.slots) {
        if (DROPPED.has(key)) continue
        if (key === 'possessor' || key === 'measure') continue
        if (key === 'possessive_marker') continue
        const head = HEADS.has(key) && !headed
        if (head) headed = true
        out.push(`${head ? 'head' : 'describing'}=${raw}`)
      }
      const owner = value('possessor'), mark = value('possessive_marker'), measure = value('measure')
      if (owner) extra.push(`@l${++links} syntax.link kind=cue from=$${wire.id} to=${owner}${mark ? ' cue=' + mark : ''}`)
      else if (mark) out.push(`describing=${mark}`)
      if (measure) extra.push(`@l${++links} syntax.link kind=open from=$${wire.id} to=${measure}`)
    } else if (wire.type === 'nlu.relation') {
      const cues = wire.slots.filter(slot => ['cue', 'adverb', 'negation'].includes(slot[0])).map(slot => slot[1])
      const from = value('from'), to = value('to'), named = value('kind')
      const kind = cues.length ? 'cue' : named === 'open' ? 'open' : DESCRIBES.has(named) ? 'describes' : byId.get(to)?.type === 'nlu.clause' && byId.get(from)?.type === 'nlu.clause' ? 'completes' : 'open'
      out.push(`@${wire.id} syntax.link kind=${kind} from=${from} to=${to}`, ...cues.map(cue => `cue=${cue}`))
      const measure = value('measure')
      if (measure) extra.push(`@l${++links} syntax.link kind=open from=$${wire.id} to=${measure}`)
    } else if (wire.type === 'nlu.coordination') {
      out.push(`@${wire.id} syntax.list`, ...wire.slots.filter(slot => slot[0] === 'member' || slot[0] === 'cue').map(slot => `${slot[0]}=${slot[1]}`))
    } else continue
    lines.push(out.join(' '))
  }
  return [...lines, ...extra].join('\n')
}
