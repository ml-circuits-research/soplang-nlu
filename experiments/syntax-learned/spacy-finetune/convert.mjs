// From a gold `syntax` circuit back to a dependency tree over the parser's own tokens, so that the spacy
// strategy's writer (circuitOf + the repairs of spacy-direct) gives that circuit again.
//
// Candidates, in the order they are tried (the first one that gives the gold circuit back is kept):
//   A  the base model's parse as it is (it already gives the gold circuit);
//   B  a tree built from the circuit, keeping the base parse's label and tag wherever the base parse has
//      the same head for that word;
//   C  the same tree with the converter's own labels throughout, and tags forced where a role needs one.
// Nothing here names a content word: the tree follows the wires and keys of the circuit, and the
// labels are those of spaCy's English scheme (ClearNLP).
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {wordsOf, parseCircuit, validateSyntax, coreOf, writeCircuit} = await import(root + 'lib/syntax.mjs')
const {unitsOf} = await import(root + 'strategies/neural-dependencies/syntax-circuit.mjs')
const {normalForm} = await import(root + 'tests/benchmark/syntax/lib.mjs')

const SUBJECT = new Set(['nsubj', 'nsubjpass', 'expl', 'csubj', 'csubjpass'])
const OBJECT = new Set(['dobj', 'obj', 'iobj', 'dative', 'attr', 'oprd'])
const WITHIN = new Set(['det', 'predet', 'amod', 'nummod', 'compound', 'quantmod', 'nmod', 'poss', 'neg', 'advmod', 'case'])
const CLAUSAL = new Set(['advcl', 'ccomp', 'xcomp', 'relcl', 'acl', 'pcomp', 'parataxis', 'csubj', 'csubjpass'])
// labels that may stand for the converter's label when the base parse has the same head
const COMPATIBLE = {
  nsubj: SUBJECT, dobj: OBJECT, attr: OBJECT, pobj: new Set(['pobj']), prep: new Set(['prep', 'agent', 'dative']),
  advmod: new Set(['advmod', 'acomp', 'prt', 'npadvmod', 'oprd', 'amod']), aux: new Set(['aux', 'auxpass']), neg: new Set(['neg']),
  intj: new Set(['intj', 'cc', 'discourse']), mark: new Set(['mark']), conj: new Set(['conj']), cc: new Set(['cc', 'preconj']),
  appos: new Set(['appos']), poss: new Set(['poss']), case: new Set(['case']), compound: WITHIN, det: WITHIN, amod: WITHIN,
  nummod: WITHIN, predet: WITHIN, xcomp: CLAUSAL, ccomp: CLAUSAL, advcl: CLAUSAL, relcl: CLAUSAL, acl: CLAUSAL, pcomp: CLAUSAL,
  parataxis: new Set(['parataxis']), dep: new Set(['dep']),
}
const MODALS = new Set(['can', 'could', 'may', 'might', 'must', 'shall', 'should', 'will', 'would', 'ca', 'wo', "'ll", "'d"])
const SUBORDINATORS = new Set(['if', 'because', 'when', 'while', 'unless', 'although', 'though', 'since', 'as', 'so', 'that', 'whether',
  'once', 'until', 'till', 'before', 'after', 'where', 'whenever', 'wherever', 'how', 'what', 'which', 'who', 'whom', 'why', 'than', 'like'])
const verbTag = tag => /^(?:VB|MD)/u.test(tag)

class Loss extends Error { constructor(kind, detail = '') { super(kind + (detail ? ': ' + detail : '')); this.kind = kind } }

/** The gold circuit read into wires with the units of each value. */
function readGold(text, sop, units) {
  const normal = normalForm(text, sop)
  if (!normal?.core) throw new Loss('invalid-label')
  const wires = parseCircuit(normal.sop)
  const check = validateSyntax(text, normal.sop)
  const unitOfWord = []
  for (const unit of units) if (unit.word) for (let w = unit.word[0]; w <= unit.word[1]; w++) unitOfWord[w] = unit
  const byId = new Map()
  let place = 0
  const quotedKeys = new Set(['head', 'dependent', 'verb', 'auxiliary', 'negation', 'modifier', 'discourse', 'marker', 'conjunction'])
  const holder = new Map() // unit index -> {wire, key}
  for (const wire of wires) {
    const w = {id: wire.id, type: wire.type.slice(7), refs: {}, values: {}, form: null, attachment: null}
    for (const [key, raw] of wire.slots) {
      if (quotedKeys.has(key) && raw.startsWith('"')) {
        const {first, last} = check.placements[place++]
        const run = []
        for (let word = first; word <= last; word++) {
          const unit = unitOfWord[word]
          if (!run.includes(unit)) run.push(unit)
          const held = holder.get(unit.index)
          if (held && (held.wire !== w || held.key !== key)) throw new Loss('unit-split', unit.value)
          holder.set(unit.index, {wire: w, key})
        }
        ;(w.values[key] ??= []).push(run)
      } else if (raw.startsWith('$')) (w.refs[key] ??= []).push(raw.slice(1))
      else if (key === 'form') w.form = raw
      else if (key === 'attachment') w.attachment = raw
    }
    byId.set(w.id, w)
  }
  for (const w of byId.values()) for (const key of Object.keys(w.refs)) w.refs[key] = w.refs[key].map(id => byId.get(id))
  // every unit of a value must hold only words of that value (a unit with words outside it splits)
  for (const unit of units) if (unit.word) {
    const held = holder.get(unit.index)
    if (!held) throw new Loss('unit-uncovered', unit.value)
  }
  return {wires: [...byId.values()], holder, core: normal.core, sop: normal.sop}
}

const unitsIn = w => Object.values(w.values).flat(2)
const first = list => list.reduce((a, b) => a.index <= b.index ? a : b)

/**
 * The tree of one candidate: Map unit index -> {head: unit index (itself for a root), dep, tag}.
 * @param baseLabels keep the base parse's label where its head is the same
 */
function buildTree(units, gold, {baseLabels}) {
  const arcs = new Map()
  const tags = new Map()
  const wires = gold.wires
  const position = new Map()
  const positionOf = (w, depth = 0) => {
    if (position.has(w)) return position.get(w)
    const own = unitsIn(w).map(unit => unit.index)
    let at = own.length ? Math.min(...own) : Infinity
    if (!own.length && depth < 8) for (const list of Object.values(w.refs)) for (const other of list) at = Math.min(at, positionOf(other, depth + 1))
    position.set(w, at)
    return at
  }
  const fragmentRoot = new Map()
  /** The unit that stands for a wire in the tree. */
  function headOf(w, depth = 0) {
    if (depth > 10) throw new Loss('cycle')
    if (w.type === 'nominal') return w.values.head.at(-1).at(-1)
    if (w.type === 'clause') {
      if (w.values.verb) {
        if (w.values.verb.length > 1 || w.values.verb[0].length > 1) throw new Loss('verb-of-several-words')
        return w.values.verb[0][0]
      }
      return fragmentHead(w)
    }
    if (w.type === 'coordination') return headOf([...w.refs.conjunct].sort((a, b) => positionOf(a) - positionOf(b))[0], depth + 1)
    if (w.type === 'relation') return w.values.marker ? w.values.marker[0][0] : headOf(w.refs.to[0], depth + 1)
    throw new Loss('unknown-wire')
  }
  function fragmentHead(w) {
    if (fragmentRoot.has(w)) return fragmentRoot.get(w)
    const complements = (w.refs.complement ?? []).filter(c => c.type === 'nominal' || c.type === 'coordination')
    const modifiers = (w.values.modifier ?? []).flat()
    const discourse = (w.values.discourse ?? []).flat()
    let rootUnit = null
    const firstComplement = complements.length ? Math.min(...complements.map(c => positionOf(c))) : Infinity
    if (modifiers.length && first(modifiers).index < firstComplement) rootUnit = first(modifiers)
    else if (complements.length) rootUnit = headOf([...complements].sort((a, b) => positionOf(a) - positionOf(b))[0])
    else if (modifiers.length) rootUnit = first(modifiers)
    else if (discourse.length) rootUnit = first(discourse)
    else {
      const relation = wires.find(r => r.type === 'relation' && r.refs.from?.[0] === w && r.values.marker)
      if (!relation) throw new Loss('empty-fragment')
      rootUnit = relation.values.marker[0][0]
    }
    fragmentRoot.set(w, rootUnit)
    return rootUnit
  }
  const set = (unit, head, dep) => {
    if (!unit) return
    if (arcs.has(unit.index)) {
      const old = arcs.get(unit.index)
      if (old.head === head.index && old.dep === dep) return
      throw new Loss('two-heads', unit.value)
    }
    if (unit === head) throw new Loss('self-head', unit.value)
    arcs.set(unit.index, {head: head.index, dep})
  }
  const tagOf = unit => tags.get(unit.index) ?? unit.tag
  const forceTag = (unit, tag) => tags.set(unit.index, tag)

  // ----- who references whom
  const parentRef = new Map() // wire -> [{from: wire, key}]
  const HOLDING = new Set(['subject', 'complement', 'to', 'conjunct'])
  for (const w of wires) for (const [key, list] of Object.entries(w.refs)) if (HOLDING.has(key)) for (const other of list) (parentRef.get(other) ?? parentRef.set(other, []).get(other)).push({from: w, key})
  const memberOf = new Map()
  for (const w of wires) if (w.type === 'coordination') for (const c of w.refs.conjunct) memberOf.set(c, w)

  // ----- nominals
  for (const w of wires.filter(w => w.type === 'nominal')) {
    const head = headOf(w)
    for (const run of w.values.head) for (const unit of run) if (unit !== head) set(unit, head, 'compound')
    for (const unit of (w.values.dependent ?? []).flat()) {
      const t = tagOf(unit)
      const dep = /^(?:DT|WDT)$/u.test(t) ? 'det' : t === 'PDT' ? 'predet' : /^(?:PRP\$|WP\$)$/u.test(t) ? 'poss' : t === 'CD' ? 'nummod'
        : t === 'POS' ? 'case' : /^(?:JJ|VBN|VBG)/u.test(t) ? 'amod' : /^RB/u.test(t) ? 'advmod' : 'compound'
      set(unit, head, dep)
    }
    // a head that a nominal cannot have: a verb form, or an adjective or adverb with no determiner
    const t = tagOf(head)
    const determined = (w.values.dependent ?? []).flat().some(unit => /^(?:DT|PRP\$|WP\$|POS)$/u.test(tagOf(unit)))
    if (!head.quoted && (verbTag(t) || t === 'UH' || /^(?:JJ|RB)/u.test(t) && !determined))
      forceTag(head, /^\p{Lu}/u.test(head.value) && head.word[0] > 0 ? 'NNP' : /[^s]s$/u.test(head.lower) ? 'NNS' : 'NN')
  }

  // ----- clauses
  for (const w of wires.filter(w => w.type === 'clause')) {
    const head = headOf(w)
    const fragment = !w.values.verb
    if (!fragment) {
      const t = tagOf(head)
      if (!verbTag(t)) {
        const lower = head.lower
        forceTag(head, w.form === 'imperative' ? 'VB' : w.form === 'nonfinite' ? (/ing$/u.test(lower) ? 'VBG' : /ed$/u.test(lower) ? 'VBN' : 'VB')
          : /ed$/u.test(lower) ? 'VBD' : /[^s]s$/u.test(lower) ? 'VBZ' : 'VBP')
      }
    }
    for (const unit of (w.values.auxiliary ?? []).flat()) {
      set(unit, head, 'aux')
      if (!verbTag(tagOf(unit))) forceTag(unit, MODALS.has(unit.lower) ? 'MD' : 'VBP')
    }
    for (const unit of (w.values.negation ?? []).flat()) { set(unit, head, 'neg'); if (!/^RB/u.test(tagOf(unit))) forceTag(unit, 'RB') }
    for (const unit of (w.values.modifier ?? []).flat()) if (unit !== head) set(unit, head, 'advmod')
    for (const unit of (w.values.discourse ?? []).flat()) {
      if (unit === head) { if (fragment && !/^(?:UH)$/u.test(tagOf(unit)) && unit.lower !== 'thanks') forceTag(unit, 'UH'); continue }
      set(unit, head, 'intj')
      if (verbTag(tagOf(unit))) forceTag(unit, 'UH')
    }
    for (const subject of w.refs.subject ?? []) set(headOf(subject), head, 'nsubj')
    const complements = [...(w.refs.complement ?? [])].sort((a, b) => positionOf(a) - positionOf(b))
    for (const c of complements) {
      const unit = headOf(c)
      if (unit === head) continue
      // in a fragment: a nominal root holds the other nominals before it by `dep` and after it as a subject would stand;
      // any other root holds them by `dep`
      if (fragment) set(unit, head, unit.index > head.index && complements.some(o => headOf(o) === head) ? 'nsubj' : 'dep')
      else set(unit, head, head.lemma === 'be' ? 'attr' : 'dobj')
    }
  }

  // ----- relations
  for (const r of wires.filter(w => w.type === 'relation')) {
    const from = r.refs.from[0], to = r.refs.to[0]
    const inCoordination = memberOf.get(r)
    const markers = (r.values.marker ?? []).flat()
    const negation = (r.values.negation ?? []).flat()
    if (from.type === 'relation' || to.type === 'relation') throw new Loss('relation-of-a-relation')
    let fromHead = headOf(from)
    // a relation in a coordination of relations hangs on the marker of the conjunct before it
    let conjOf = null
    if (inCoordination) {
      const members = [...inCoordination.refs.conjunct].sort((a, b) => positionOf(a) - positionOf(b))
      const at = members.indexOf(r)
      if (at > 0) conjOf = headOf(members[at - 1])
    }
    const toHead = headOf(to)
    if (!markers.length) {
      if (conjOf) throw new Loss('coordinated-relation-without-marker')
      if (from.type === 'nominal' && to.type === 'nominal') set(toHead, fromHead, 'appos')
      else if (from.type !== 'clause' && to.type === 'clause') set(toHead, fromHead, 'acl')
      else if (from.type === 'clause' && to.type === 'clause') set(toHead, fromHead, 'ccomp')
      else if (from.type !== 'clause' && to.type === 'coordination' && to.refs.conjunct[0].type === 'nominal') set(toHead, fromHead, 'appos')
      else if (from.type === 'clause' && to.type === 'coordination' && to.refs.conjunct[0].type === 'clause') set(toHead, fromHead, 'ccomp')
      else if (from.type === 'coordination' && to.type === 'nominal') set(toHead, fromHead, 'appos')
      else throw new Loss('unmarked-relation-' + from.type + '-to-' + to.type)
      if (negation.length) throw new Loss('negated-unmarked-relation')
      continue
    }
    const lead = markers[0]
    const attach = (unit, dep) => conjOf ? set(unit, conjOf, 'conj') : set(unit, fromHead, dep)
    if (markers.length === 1 && /^['’]s$/u.test(lead.lower) && to.type === 'nominal') {
      if (conjOf) throw new Loss('coordinated-possessive')
      set(toHead, fromHead, 'poss')
      set(lead, toHead, 'case')
      forceTag(lead, 'POS')
    } else if (to.type === 'clause') {
      if (conjOf) throw new Loss('coordinated-relation-into-clause')
      const verb = toHead
      const before = verb.index < fromHead.index
      if (markers.length === 1 && lead.lower === 'to' && (to.form === 'nonfinite' || !to.form)) {
        set(verb, fromHead, before ? 'advcl' : from.type === 'clause' ? 'xcomp' : 'acl')
        set(lead, verb, 'aux')
        forceTag(lead, 'TO')
      } else if (!markers.some(m => SUBORDINATORS.has(m.lower)) && /^VBG$/u.test(tags.get(verb.index) ?? verb.tag)) {
        // a preposition that governs a clause ("by clicking it")
        set(lead, fromHead, 'prep')
        for (let k = 1; k < markers.length; k++) set(markers[k], markers[k - 1], 'prep')
        set(verb, markers.at(-1), 'pcomp')
      } else {
        for (const m of markers) set(m, verb, 'mark')
        set(verb, fromHead, from.type === 'clause' ? 'advcl' : 'relcl')
      }
    } else {
      attach(lead, 'prep')
      for (let k = 1; k < markers.length; k++) set(markers[k], markers[k - 1], 'prep')
      set(toHead, markers.at(-1), 'pobj')
    }
    for (const n of negation) { set(n, lead, 'neg'); if (!/^RB/u.test(tagOf(n))) forceTag(n, 'RB') }
  }

  // ----- coordinations
  for (const k of wires.filter(w => w.type === 'coordination')) {
    const members = [...k.refs.conjunct].sort((a, b) => positionOf(a) - positionOf(b))
    const heads = members.map(m => headOf(m))
    for (let i = 1; i < members.length; i++) {
      const m = members[i]
      if (m.type === 'relation') continue // set with the relation
      // a verbless conjunct that shares no verb stands beside the clause; one that shares it is joined to it
      // with no joining word the clauses stand side by side (parataxis); a nonfinite clause is joined as a conjunct
      const plain = !(k.values.conjunction ?? []).length && m.type === 'clause' && m.form !== 'nonfinite'
      const dep = plain || m.type === 'clause' && !m.values.verb && !m.refs.ellipsis && members[i - 1].type === 'clause' ? 'parataxis' : 'conj'
      set(heads[i], heads[i - 1], dep)
    }
    for (const run of k.values.conjunction ?? []) {
      const at = run[0].index
      const before = heads.filter(h => h.index < at)
      const host = before.length ? before.reduce((a, b) => a.index > b.index ? a : b) : heads[0]
      for (const unit of run) set(unit, host, before.length ? 'cc' : 'preconj')
    }
  }
  // the ellipsis of a fragment that is in no coordination
  for (const w of wires.filter(w => w.type === 'clause' && w.refs.ellipsis)) {
    if (!memberOf.get(w)) throw new Loss('ellipsis-outside-coordination')
  }

  // ----- roots: wires that nothing holds
  const rootsWires = wires.filter(w => (w.type === 'clause') && !parentRef.get(w)?.length && !memberOf.get(w))
  const roots = []
  for (const w of wires.filter(w => w.type === 'coordination' && !parentRef.get(w)?.length)) {
    if (w.refs.conjunct[0].type !== 'clause') throw new Loss('top-coordination-of-' + w.refs.conjunct[0].type)
    roots.push(headOf(w))
  }
  for (const w of rootsWires) roots.push(headOf(w))
  for (const unit of roots) {
    if (arcs.has(unit.index)) throw new Loss('root-with-head', unit.value)
    arcs.set(unit.index, {head: unit.index, dep: 'ROOT'})
  }
  // every word unit needs a place
  for (const unit of units) if (unit.word && !arcs.has(unit.index)) throw new Loss('unit-without-arc', unit.value)

  // the base parse's labels where its head is the same
  if (baseLabels) for (const unit of units) {
    const arc = arcs.get(unit.index)
    if (!arc || !unit.word || arc.dep === 'ROOT') continue
    if (unit.head === arc.head && unit.dep !== arc.dep && COMPATIBLE[arc.dep]?.has(unit.dep)) arc.dep = unit.dep
  }
  if (baseLabels) for (const unit of units) if (tags.has(unit.index) && baseLabels === 'keep-tags') tags.delete(unit.index)
  return {arcs, tags, roots}
}

/** From unit arcs to token arcs, in the worker's token format. */
function toTokens(base, units, arcs, tags) {
  const tokens = base.map(token => ({...token}))
  const unitOfToken = new Map()
  for (const unit of units) for (const token of unit.tokens) unitOfToken.set(token.i, unit)
  // the main token of each unit: the base parse's outer token; the other tokens of the unit hang inside it
  const mainOf = new Map()
  for (const unit of units) {
    const own = new Set(unit.tokens.map(token => token.i))
    const outer = unit.tokens.filter(token => token.head === token.i || !own.has(token.head))
    const main = outer.find(token => token.dep === 'neg') ?? outer.find(token => token.pos !== 'PUNCT') ?? outer[0] ?? unit.tokens[0]
    mainOf.set(unit.index, main)
  }
  const clauseRootOf = new Map()
  const rootOfUnit = unit => { let at = unit, steps = 0; while (arcs.get(at.index) && arcs.get(at.index).head !== at.index && steps++ < 200) at = units[arcs.get(at.index).head]; return at }
  for (const unit of units) {
    const main = mainOf.get(unit.index)
    if (!main) continue
    for (const token of unit.tokens) {
      if (token === main) continue
      // inside the unit: keep the base head when it is inside too
      const own = unit.tokens.some(other => other.i === token.head) && token.head !== token.i
      tokens[token.i].head = own ? token.head : main.i
      tokens[token.i].dep = own ? token.dep : (token.pos === 'PUNCT' ? 'punct' : 'compound')
    }
    if (!unit.word) continue
    const arc = arcs.get(unit.index)
    const t = tokens[main.i]
    t.head = arc.head === unit.index ? main.i : mainOf.get(arc.head).i
    t.dep = arc.dep
    if (tags.has(unit.index)) t.tag = tags.get(unit.index)
  }
  // punctuation units: on the root of the sentence of the word before them (after them at the start)
  const wordUnits = units.filter(unit => unit.word)
  for (const unit of units) {
    if (unit.word) continue
    const before = wordUnits.filter(other => other.index < unit.index).at(-1) ?? wordUnits.find(other => other.index > unit.index)
    const host = rootOfUnit(before)
    for (const token of unit.tokens) {
      const own = unit.tokens.some(other => other.i === token.head) && token.head !== token.i
      if (own) continue
      tokens[token.i].head = mainOf.get(host.index).i
      tokens[token.i].dep = 'punct'
    }
  }
  // white space tokens: on the token before them
  for (const token of tokens) if (!token.text.trim()) { token.head = Math.max(0, token.i - 1); token.dep = token.i === 0 ? 'ROOT' : 'dep'; if (token.i === 0) token.head = 0 }
  // no cycles
  for (const token of tokens) {
    const seen = new Set()
    for (let at = token; at.head !== at.i; at = tokens[at.head]) { if (seen.has(at.i)) throw new Loss('cycle'); seen.add(at.i) }
  }
  return tokens
}

/** Sentences must not interleave: the span of every root's subtree is contiguous and apart from the others. */
function sentencesApart(tokens) {
  const rootOf = token => { let at = token; while (at.head !== at.i) at = tokens[at.head]; return at.i }
  let last = -1
  const seen = new Set()
  for (const token of tokens) {
    const r = rootOf(token)
    if (r !== last) { if (seen.has(r)) return false; seen.add(r); last = r }
  }
  return true
}

/** Candidates for one message: [{name, tokens}] and the losses of those that could not be built. */
/** The sentence of every word: a sentence ends at ". ! ?" or a line break between two words. */
function sentencesOf(text) {
  const words = wordsOf(text)
  const out = []
  let sentence = 0
  words.forEach((word, k) => { if (k > 0 && /[.!?\n]/u.test(text.slice(words[k - 1].end, word.start))) sentence++; out.push(sentence) })
  return out
}
/** A clause with no verb whose words are all said to the listener ("Hey", "Thanks"). */
const discourseOnly = w => w.type === 'clause' && w.slots.every(slot => slot.key === 'form' || slot.key === 'discourse') && w.slots.some(slot => slot.key === 'discourse')

/**
 * The rules (L6) ask that the clauses of one sentence be tied; separate sentences need no tie. Labels accepted
 * under earlier judging may leave two clauses of one sentence untied ("drop in a tote, would you"). Such clauses
 * are put side by side: a coordination with no joining word. A sentence ends at ". ! ?" or a line break.
 * @returns {sop, tied} the circuit with the ties added, and how many were added
 */
export function tieSentences(text, sop) {
  const normal = normalForm(text, sop)
  if (!normal?.core) return {sop, tied: 0}
  const check = validateSyntax(text, normal.sop)
  const sentenceOf = sentencesOf(text)
  let place = 0
  let wires = parseCircuit(normal.sop).map(w => ({id: w.id, type: w.type.slice(7), slots: w.slots.map(([key, raw]) => {
    if (raw.startsWith('"')) { const p = check.placements[place++]; return {key, span: [p.first, p.last]} }
    if (raw.startsWith('$')) return {key, ref: raw.slice(1)}
    return {key, value: raw}
  })}))
  const byId = new Map(wires.map(w => [w.id, w]))
  const firstWord = (w, depth = 0) => {
    const own = w.slots.filter(slot => slot.span).map(slot => slot.span[0])
    if (own.length || depth > 8) return Math.min(Infinity, ...own)
    return Math.min(Infinity, ...w.slots.filter(slot => slot.ref && slot.key !== 'ellipsis').map(slot => firstWord(byId.get(slot.ref), depth + 1)))
  }
  const held = new Set(wires.flatMap(w => w.slots.filter(slot => ['subject', 'complement', 'to', 'conjunct'].includes(slot.key)).map(slot => slot.ref)))
  const tops = wires.filter(w => !discourseOnly(w) && (w.type === 'clause' || w.type === 'coordination' && byId.get(w.slots.find(slot => slot.key === 'conjunct').ref).type === 'clause') && !held.has(w.id))
    .sort((a, b) => firstWord(a) - firstWord(b))
  let tied = 0, counter = 0
  for (let k = 1; k < tops.length; k++) {
    const a = tops[k - 1], b = tops[k]
    if (sentenceOf[firstWord(a)] !== sentenceOf[firstWord(b)]) continue
    const conjuncts = w => w.type === 'coordination' ? w.slots.filter(slot => slot.key === 'conjunct').map(slot => slot.ref) : [w.id]
    let group
    if (a.type === 'coordination') { group = a; for (const ref of conjuncts(b)) group.slots.push({key: 'conjunct', ref}) }
    else if (b.type === 'coordination') { group = b; group.slots.push({key: 'conjunct', ref: a.id}) }
    else { group = {id: 'tie' + ++counter, type: 'coordination', slots: [{key: 'conjunct', ref: a.id}, {key: 'conjunct', ref: b.id}]}; wires.push(group); byId.set(group.id, group) }
    if (a.type === 'coordination' && b.type === 'coordination' && group === a) { group.slots.push(...b.slots.filter(slot => slot.key === 'conjunction')); wires = wires.filter(w => w !== b) }
    tops[k] = group
    tied++
  }
  if (!tied) return {sop: normal.sop, tied}
  try {
    const out = writeCircuit(text, wires.map(w => ({...w, type: 'syntax.' + w.type})))
    return validateSyntax(text, out).valid ? {sop: out, tied} : {sop: normal.sop, tied: 0}
  } catch { return {sop: normal.sop, tied: 0} }
}

export function candidates(text, givenSop, base) {
  const {sop} = tieSentences(text, givenSop)
  const units = unitsOf(text, base)
  const out = [{name: 'A', tokens: base}], losses = []
  let gold
  try { gold = readGold(text, sop, units) } catch (error) { if (!(error instanceof Loss)) throw error; return {out, losses: [{name: 'gold', kind: error.kind, message: error.message}]} }
  for (const [name, options] of [['B', {baseLabels: 'keep-tags'}], ['B2', {baseLabels: true}], ['C', {baseLabels: false}]]) {
    try {
      const {arcs, tags} = buildTree(units, gold, options)
      const tokens = toTokens(base, units, arcs, tags)
      if (!sentencesApart(tokens)) throw new Loss('sentences-interleave')
      out.push({name, tokens})
    } catch (error) {
      if (!(error instanceof Loss)) throw error
      losses.push({name, kind: error.kind, message: error.message})
    }
  }
  return {out, losses}
}

// ----- comparison of circuits
/**
 * The core of a circuit up to the readings the judging rules let pass (tests/benchmark/syntax/rules.md):
 * attachment marks set aside and every marked relation started at the clause its start stands in ("the start of
 * a relation with a marker: the clause, or any nominal of that clause"); a head of several words split into its
 * last word and dependents ("Team lunch", "Room 3"); a name or number right after a nominal, tied to it by a
 * relation without a marker, held as dependents of that nominal ("x 120", "16:00 UTC").
 */
export function relaxedCore(text, sop) {
  const normal = normalForm(text, sop)
  if (!normal?.core) return null
  const check = validateSyntax(text, normal.sop)
  let place = 0
  let wires = parseCircuit(normal.sop).map(w => ({id: w.id, type: w.type.slice(7), slots: w.slots.map(([key, raw]) => {
    if (raw.startsWith('"')) { const p = check.placements[place++]; return {key, span: [p.first, p.last]} }
    if (raw.startsWith('$')) return {key, ref: raw.slice(1)}
    return {key, value: raw}
  })}))
  const byId = () => new Map(wires.map(w => [w.id, w]))
  // a head of several words
  for (const w of wires) if (w.type === 'nominal') {
    const head = w.slots.find(slot => slot.key === 'head')
    if (!head || head.span[1] === head.span[0]) continue
    for (let word = head.span[0]; word < head.span[1]; word++) w.slots.push({key: 'dependent', span: [word, word]})
    head.span = [head.span[1], head.span[1]]
  }
  // a nominal right after another, tied to it with no marker and held by nothing else
  for (let changed = true; changed;) {
    changed = false
    const ids = byId()
    for (const r of wires.filter(w => w.type === 'relation' && !w.slots.some(slot => slot.key === 'marker'))) {
      const from = ids.get(r.slots.find(slot => slot.key === 'from').ref), to = ids.get(r.slots.find(slot => slot.key === 'to').ref)
      if (from?.type !== 'nominal' || to?.type !== 'nominal' || to.slots.some(slot => slot.ref)) continue
      if (wires.some(w => w !== r && w.slots.some(slot => slot.ref === to.id))) continue
      const last = Math.max(...from.slots.filter(slot => slot.span).map(slot => slot.span[1]))
      const words = to.slots.filter(slot => slot.span).flatMap(slot => Array.from({length: slot.span[1] - slot.span[0] + 1}, (_, k) => slot.span[0] + k)).sort((a, b) => a - b)
      if (words[0] !== last + 1 || words.some((word, k) => word !== words[0] + k)) continue
      for (const word of words) from.slots.push({key: 'dependent', span: [word, word]})
      wires = wires.filter(w => w !== r && w !== to)
      changed = true
      break
    }
  }
  // a fragment of words said to the listener, held by nothing, in a sentence with another clause: its words are
  // discourse words of that clause ("which clause holds a discourse word" is not compared)
  {
    const sentenceOf = sentencesOf(text)
    const held = new Set(wires.flatMap(w => w.slots.filter(slot => slot.ref && slot.key !== 'from').map(slot => slot.ref)))
    const fromRefs = new Set(wires.flatMap(w => w.slots.filter(slot => slot.key === 'from').map(slot => slot.ref)))
    const firstOf = w => Math.min(Infinity, ...w.slots.filter(slot => slot.span).map(slot => slot.span[0]))
    const hosts = wires.filter(w => w.type === 'clause' && !discourseOnly(w) && w.slots.some(slot => slot.span))
    for (const w of wires.filter(w => discourseOnly(w) && !held.has(w.id) && !fromRefs.has(w.id))) {
      const host = hosts.find(h => sentenceOf[firstOf(h)] === sentenceOf[firstOf(w)])
      if (!host) continue
      host.slots.push(...w.slots.filter(slot => slot.key === 'discourse'))
      wires = wires.filter(other => other !== w)
    }
  }
  // the start of marked relations
  const ids = byId()
  const homeOf = new Map()
  const visit = (id, clause, depth = 0) => {
    if (depth > 12 || homeOf.has(id)) return
    homeOf.set(id, clause)
    const w = ids.get(id)
    if (w?.type === 'coordination') for (const slot of w.slots) if (slot.key === 'conjunct') visit(slot.ref, clause, depth + 1)
    for (const r of wires) if (r.type === 'relation' && r.slots.find(slot => slot.key === 'from')?.ref === id) {
      const to = r.slots.find(slot => slot.key === 'to').ref
      if (ids.get(to)?.type !== 'clause') visit(to, clause, depth + 1)
    }
  }
  for (const w of wires) if (w.type === 'clause') for (const slot of w.slots) if (slot.key === 'subject' || slot.key === 'complement') visit(slot.ref, w.id)
  for (const r of wires) if (r.type === 'relation') {
    r.slots = r.slots.filter(slot => slot.key !== 'attachment')
    if (!r.slots.some(slot => slot.key === 'marker')) continue
    const from = r.slots.find(slot => slot.key === 'from')
    if (ids.get(from.ref)?.type === 'nominal' && homeOf.get(from.ref)) from.ref = homeOf.get(from.ref)
  }
  try { return coreOf(text, writeCircuit(text, wires.map(w => ({...w, type: 'syntax.' + w.type})))) } catch { return null }
}
export {Loss}
