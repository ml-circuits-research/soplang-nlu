// Resolve nominal role conflicts before the projector indexes dependency arcs.
// All edits operate on the projector's private, source-aligned token copies.
const nominals = new Set(['NOUN','PROPN','PRON','NUM'])
const verbs = new Set(['VERB','AUX'])
const movement = new Set(['move','place','position','put','shift','slide','drag','nudge','push','pull','raise','lower'])
const lengths = new Set(['px','pixel','inch','foot','metre','meter','cm','mm','step','place','spot','unit'])
const orientation = new Set(['face','point','stand','sit','look','wear','hold'])

export function repairNominalRoles(tokens) {
  repairBooking(tokens)
  repairLabels(tokens)
  repairIdentifiers(tokens)
  bindWrittenNames(tokens)
  const pairs = repairValueLists(tokens)
  repairCoordinateLists(tokens, pairs)
  const children = Map.groupBy(tokens.filter(t => t.head !== t.index), t => t.head)
  const under = t => children.get(t.index) ?? []
  for (const token of tokens) {
    const governor = tokens[token.head]
    if (token.dep === 'conj' && nominals.has(token.pos) && verbs.has(governor.pos)) {
      // In an elliptical object list a parser can attach the next noun
      // to the verb. Relink only when there is already an overt object
      // and an intervening coordination or sequencing cue.
      const object = under(governor).find(t => ['obj','dobj'].includes(t.dep) && t.index < token.index && nominals.has(t.pos))
      if (!object || under(token).some(t => ['nsubj','nsubjpass','cop','aux'].includes(t.dep))) continue
      const cues = tokens.slice(object.index + 1,token.index)
      if (cues.some(t => t.dep === 'ROOT' || t.value === ';') ||
          !cues.some(t => t.dep === 'cc' || t.value === ',' || t.lower === 'then')) continue
      token.head = object.index
      for (const cue of cues.filter(t => (t.dep === 'cc' || t.value === ',') && t.head === governor.index)) {
        cue.head = object.index
      }
    }
    if (token.dep === 'acl' && orientation.has(token.lemma) && token.index > governor.index &&
        governor.dep === 'pobj' && ['left','right'].includes(governor.lower)) {
      const prep = tokens[governor.head]
      const referent = tokens[prep.head]
      if (prep.dep === 'prep' && nominals.has(referent.pos)) token.head = referent.index
    }
    if (token.dep === 'dep' && token.pos === 'VERB' && /^\p{Lu}/u.test(token.value) &&
        token.index === governor.index + 1 && movement.has(governor.lemma)) {
      const measure = under(token).find(t => ['obj','dobj'].includes(t.dep) && lengths.has(t.lemma) &&
        under(t).some(n => n.dep === 'nummod'))
      if (measure && !under(governor).some(t => ['obj','dobj'].includes(t.dep))) {
        token.dep = 'dobj'
        token.pos = 'PROPN'
        measure.head = governor.index
        measure.dep = 'npadvmod'
      }
    }
  }
  return pairs
}

const designation = new Set(['call','label','name','title','entitle','designate'])
const namedHeads = new Set(['block','box','calendar','chart','diagram','document','event','figure','heading',
  'meeting','node','page','paragraph','part','room','section','sheet','sketch','slide','tab','title'])
const numberedHeads = new Set(['block','box','cell','column','floor','gate','node','page','panel','part',
  'paragraph','room','row','section','sheet','slide','suite','tab','table','track'])
const nominalArguments = new Set(['appos','attr','dative','dep','dobj','obj','pobj','nsubj','nsubjpass','oprd'])
const namingArgs = new Set(['appos','attr','dep','dobj','obj','oprd'])
const nominalDeps = new Set(['amod','appos','compound','dep','flat','name','nummod','oprd'])
const scheduling = new Set(['book','reserve','schedule'])
const venue = new Set(['auditorium','hall','lounge','room','studio','suite'])
const prepositions = new Set(['at','by','for','from','in','into','of','on','over','through','to','under','until','with'])
const labelParticipants = new Set(['for','from','at','on','until'])
const titleInitial = token => Boolean(token && (token.quoted || /^\p{Lu}/u.test(token.value)))
const lexicalTitlePart = token => Boolean(token && /^[\p{L}\p{N}_][\p{L}\p{M}\p{N}_‐‑-]*$/u.test(token.value))
const groupedInitials = (tokens, start) => {
  const first = tokens[start], ampersand = tokens[start+1], last = tokens[start+2]
  return lexicalTitlePart(first) && ampersand?.value === '&' && lexicalTitlePart(last) &&
    first.end === ampersand.start && ampersand.end === last.start ? [first,ampersand,last] : []
}
const integer = token => Boolean(token && /^\d+$/u.test(token.value))
const scalar = token => Boolean(token && /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(token.value))
const idCode = token => Boolean(token && /^(?:[A-Za-z][0-9][0-9A-Za-z]*|[A-Z])$/u.test(token.value))
const punct = token => !token || token.pos === 'PUNCT' || /^[;:,.!?—–]$/u.test(token.value)

function attach(token, parent, dep) {
  token.head = parent.index
  token.dep = dep
}

function label(base, parts, marker) {
  const name = parts[0]
  name.pos = 'PROPN'
  attach(name, base, 'appos')
  name.nominalName = parts.map(part => part.index)
  name.nominalRelation = 'label'
  for (const part of parts.slice(1)) attach(part, name, 'compound')
  if (marker) {
    name.nominalCue = [marker.index]
    attach(marker, name, 'label_cue')
  }
  return name
}

function titleTail(tokens, start, explicit) {
  const first = tokens[start]
  if (!first || first.pos === 'DET' || first.pos === 'PRON' || punct(first) ||
      !explicit && !titleInitial(first)) return []
  if (first.quoted) return [first]
  if (!lexicalTitlePart(first)) return []
  const initial = groupedInitials(tokens,start)
  const parts = initial.length ? initial : [first]
  for (let i = start + parts.length; i < tokens.length && parts.length < 9; i++) {
    const t = tokens[i]
    const next = tokens[i+1]
    const internalPreposition = explicit && next && (
      ['by','of'].includes(t.lower) && next.pos !== 'PROPN' && !next.numeric &&
        (nominalDeps.has(next.dep) || next.dep === 'pobj') && parts.some(part => part.index === t.head) ||
      t.lower === 'to' && /^[A-Z]\d+$/u.test(parts.at(-1).value) &&
        /^[A-Z]\d+$/u.test(next.value) && parts.at(-1).value[0] === next.value[0]
    )
    if (punct(t) || t.quoted || t.dep === 'ROOT' || t.pos === 'CCONJ' ||
        (prepositions.has(t.lower) && !internalPreposition) || t.pos === 'DET' ||
        t.pos === 'PRON' || t.pos === 'AUX' || t.tag === 'VBG' ||
        (!explicit && !titleInitial(t) && !integer(t))) break
    if (!lexicalTitlePart(t)) break
    const compound = groupedInitials(tokens,i)
    parts.push(...(compound.length ? compound : [t]))
    if (compound.length) i += compound.length-1
  }
  return parts
}

function repairLabels(tokens) {
  for (const marker of tokens) {
    const base = tokens[marker.head]
    if (!designation.has(marker.lemma) || marker.pos !== 'VERB' || !['acl','amod'].includes(marker.dep) ||
        !base || !nominals.has(base.pos) || base.index >= marker.index) continue
    const parts = titleTail(tokens, marker.index+1, true)
    if (!parts.length || !parts.some(part => namingArgs.has(part.dep) && part.head === marker.index)) continue
    const last = parts.at(-1)
    const after = tokens[last.index+1]
    if (after && after.pos === 'VERB' && after.tag === 'VBG' &&
        ['contain','read','say','show','display'].includes(after.lemma) &&
        (after.head === marker.index || parts.some(part => part.index === after.head))) {
      attach(after,base,'acl')
    }
    for (const part of tokens.slice(last.index+1)) {
      if (punct(part) || verbs.has(part.pos)) break
      if (part.dep === 'prep' && parts.some(t => part.head === t.index) &&
          (part.lower === 'with' || part.lower === 'on')) attach(part,base,'prep')
    }
    label(base,parts,marker)
  }
  for (const base of tokens) {
    if (!namedHeads.has(base.lemma) || !nominals.has(base.pos) || base.nominalName ||
        !nominalArguments.has(base.dep)) continue
    const first = tokens[base.index+1]
    if (!first || first.nominalName) continue
    const startOfSeries = partsOfAlternatingSeries(tokens,base)[0]?.name.index
    if (startOfSeries) {
      label(base,[first])
      continue
    }
    const parts = titleTail(tokens, base.index+1, false)
    const hasDeterminer = tokens.some(part => part.dep === 'det' && part.head === base.index)
    if (!parts.length || (!hasDeterminer && !parts.some(t => t.head === base.index &&
        ['appos','nummod','compound','flat'].includes(t.dep)))) continue
    if (!parts.every(p => p.head === base.index || parts.some(t => p.head === t.index) ||
        (p.head === base.head && namingArgs.has(p.dep)))) continue
    if (parts.every(integer)) continue
    label(base,parts)
  }
}

function repairIdentifiers(tokens) {
  for (const token of tokens) {
    if (token.nominalName || token.dep === 'compound' && tokens[token.head]?.nominalName) continue
    const previous = tokens[token.index-1]
    const following = tokens[token.index+1]
    // A type noun premodifying an alphanumeric identifier is an operand,
    // even when spaCy reports that identifier as X or as a numeric count.
    if (previous && namedHeads.has(previous.lemma) && nominalArguments.has(token.dep) &&
        (idCode(token) || integer(token) && numberedHeads.has(previous.lemma) ||
          titleInitial(token) && ['NOUN','PROPN'].includes(token.pos)) &&
        previous.dep === 'compound' && previous.head === token.index) {
      const oldHead = token.head
      const oldDep = token.dep
      previous.pos = 'NOUN'
      previous.head = oldHead
      previous.dep = oldDep
      for (const child of tokens.slice(0,previous.index)) {
        if (child.head === token.index && ['amod','det','nummod','predet','poss'].includes(child.dep)) child.head = previous.index
      }
      label(previous,[token])
      continue
    }
    if (idCode(token) && nominalArguments.has(token.dep) &&
        (token.pos === 'X' || token.pos === 'NUM' && !scalar(token))) {
      token.pos = 'PROPN'
      token.nominalName = [token.index]
    }
    if (!numberedHeads.has(token.lemma) || !nominals.has(token.pos) ||
        !(integer(following) || idCode(following)) || following.nominalName ||
        following.head !== token.index || !['nummod','appos','compound'].includes(following.dep)) continue
    // In English, postnominal numbers name the referred unit. A following
    // measurement unit or explicit coordinate separator licenses an extent instead.
    const after = tokens[following.index+1]
    if (lengths.has(after?.lemma) || ['by','x','×'].includes(after?.lower)) continue
    label(token,[following])
  }
}


// An expressly introduced multiword name can be recognized again in the
// same utterance, using the same exact source spelling and an argument edge.
function bindWrittenNames(tokens) {
  const declarations = tokens.flatMap(token =>
    token.nominalRelation === 'label' && token.nominalName?.length > 1
      ? [token.nominalName.map(index => tokens[index].value)] : [])
  for (const first of tokens) {
    if (first.nominalName || first.dep === 'label_cue') continue
    for (const written of declarations) {
      const parts = tokens.slice(first.index, first.index+written.length)
      if (parts.some(t => t.nominalName) || parts.length !== written.length ||
          !parts.every((t,i) => t.value === written[i])) continue
      const identities = new Set(parts.map(t => t.index))
      const anchors = parts.filter(t => nominalArguments.has(t.dep) && !identities.has(t.head))
      if (anchors.length !== 1) continue
      const [anchor] = anchors
      if (anchor !== first) {
        first.head = anchor.head
        first.dep = anchor.dep
        for (const child of tokens) {
          if (child.head === anchor.index && !identities.has(child.index)) child.head = first.index
        }
      }
      first.pos = 'PROPN'
      first.nominalName = parts.map(t => t.index)
      for (const child of parts.slice(1)) attach(child,first,'compound')
      break
    }
  }
}

function repairBooking(tokens) {
  for (const command of tokens) {
    if (!scheduling.has(command.lemma) || command.quoted) continue
    const room = tokens[command.index+1]
    const startsRequest = !command.index || tokens.slice(0,command.index).every(t =>
      t.lower === 'please' || t.lower === 'hey' || t.value === ',') ||
      [';',':','—','.','!','?'].includes(tokens[command.index-1]?.value)
    if (startsRequest && room?.dep === 'ROOT' && command.head === room.index &&
        command.dep === 'compound' && venue.has(room.lemma) &&
        (titleInitial(room) || integer(tokens[room.index+1]))) {
      command.pos = 'VERB'
      command.tag = 'VB'
      attach(command,command,'ROOT')
      attach(room,command,'dobj')
      for (const lead of tokens.slice(0,command.index)) {
        if (lead.head === room.index && (lead.dep === 'intj' || lead.dep === 'punct')) lead.head = command.index
      }
    }
    if (!verbs.has(command.pos)) continue
    const operand = tokens.find(t => t.head === command.index && ['dobj','obj'].includes(t.dep))
    if (!operand) continue
    for (const cue of tokens.slice(operand.index+1)) {
      if ([';', '.', '!', '?'].includes(cue.value) || cue.dep === 'ROOT') break
      if (!labelParticipants.has(cue.lower) || cue.dep !== 'prep') continue
      const target = tokens.find(t => t.head === cue.index && ['pobj','obj'].includes(t.dep))
      if (!target) continue
      const timestamp = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}:\d\d/u.test(target.value) ||
        /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/iu.test(target.value)
      const purpose = cue.lower === 'for' && venue.has(operand.lemma) && cue.head === operand.index
      const parent = tokens[cue.head]
      if ((timestamp || purpose) && (parent === operand ||
          (parent?.dep === 'pobj' && tokens[parent.head]?.head === command.index))) cue.head = command.index
    }
  }
}

function list(tokens, start, accepts, compoundNames = false) {
  if (!accepts(tokens[start])) return {items:[],cues:[],end:start,nameParts:[]}
  const items = [tokens[start]]
  const cues = []
  const nameParts = [compoundNames ? groupedInitials(tokens,start) : []]
  let end = start + (nameParts[0].length || 1)
  while (tokens[end] && (tokens[end].value === ',' || tokens[end].lower === 'and')) {
    const first = tokens[end]
    const next = tokens[end+1]
    const last = first.value === ',' && next?.lower === 'and' ? next : first
    const item = tokens[last.index+1]
    if (!accepts(item)) break
    cues.push(...(first === last ? [first] : [first,last]))
    items.push(item)
    const compound = compoundNames ? groupedInitials(tokens,item.index) : []
    nameParts.push(compound)
    end = item.index + (compound.length || 1)
  }
  return {items,cues,end,nameParts}
}

function listRoles(series, parent, dep) {
  const [first,...rest] = series.items
  attach(first,parent,dep)
  for (const item of rest) attach(item,first,'conj')
  for (const cue of series.cues) attach(cue,first,cue.value === ',' ? 'punct' : 'cc')
  for (const parts of series.nameParts) {
    if (!parts.length) continue
    const name = parts[0]
    name.pos = 'PROPN'
    name.nominalName = parts.map(part => part.index)
    for (const part of parts.slice(1)) attach(part,name,'compound')
  }
}

function partsOfAlternatingSeries(tokens, base) {
  if (base.lemma !== 'chart' || !['compound','appos'].includes(tokens[base.index+1]?.dep)) return []
  const start = base.index+2
  const pairs = []
  for (let i=start; i+1 < tokens.length; i+=2) {
    const name = tokens[i], amount=tokens[i+1]
    if (!/^[A-Z]$/u.test(name.value) || !scalar(amount)) break
    pairs.push({name,amount})
  }
  return pairs.length >= 2 ? pairs : []
}

function repairValueLists(tokens) {
  const pairs = []
  const acceptsName = token => Boolean(token && (token.quoted || /^[\p{L}][\p{L}\p{N}_‐‑-]*$/u.test(token.value) &&
    (nominals.has(token.pos) || titleInitial(token)) || /^\d{4}$/u.test(token.value)) &&
    !prepositions.has(token.lower) && token.lower !== 'and' && token.dep !== 'ROOT')
  for (const bank of tokens) {
    if (/^(?:values?|counts?|scores?|amounts?)$/iu.test(bank.value) && nominals.has(bank.pos)) {
      const values = list(tokens,bank.index+1,scalar)
      if (values.items.length < 2 || !values.items.some(t => t.head === bank.index)) continue
      const cue = tokens[values.end]
      const permitsLabels = cue?.lower === 'for' && ['prep','dative'].includes(cue.dep) &&
        (cue.head === bank.index || values.items.some(item => item.index === cue.head))
      const names = list(tokens,values.end+1,acceptsName,true)
      listRoles(values,bank,'appos')
      values.items[0].nominalRelation = 'values'
      if (permitsLabels && names.items.length === values.items.length) {
        attach(cue,bank,'prep')
        listRoles(names,cue,'pobj')
        names.items.forEach((name,i) => pairs.push({from:name.index,to:values.items[i].index,kind:'value',cue:[]}))
      }
      continue
    }
    if (bank.lemma !== 'chart' || !nominals.has(bank.pos)) continue
    for (const {name,amount} of partsOfAlternatingSeries(tokens,bank)) {
      name.pos = 'PROPN'
      attach(name,bank,'appos')
      name.nominalRelation = 'category'
      attach(amount,name,'value')
      pairs.push({from:name.index,to:amount.index,kind:'value',cue:[]})
    }
    const withCue = tokens[bank.index+1]
    if (withCue?.lower !== 'with' || withCue.head !== bank.index) continue
    const names = list(tokens,withCue.index+1,acceptsName,true)
    const at = tokens[names.end]
    if (names.items.length < 2 || at?.lower !== 'at' || !names.items.some(t => t.index === at.head)) continue
    const values = list(tokens,at.index+1,scalar)
    if (values.items.length !== names.items.length) continue
    listRoles(names,withCue,'pobj')
    attach(at,bank,'prep')
    listRoles(values,at,'pobj')
    names.items.forEach((name,i) => pairs.push({from:name.index,to:values.items[i].index,kind:'value',cue:[]}))
  }
  return pairs
}

function repairCoordinateLists(tokens, pairs) {
  for (const host of tokens) {
    if (!['coordinate','position','location'].includes(host.lemma) || !nominals.has(host.pos)) continue
    const axis = tokens[host.index+1]
    const first = tokens[host.index+2]
    const comma = tokens[host.index+3]
    const second = tokens[host.index+4]
    if (axis?.lower === 'x' && scalar(first) && comma?.value === ',' &&
        second?.lower === 'y' && scalar(tokens[host.index+5])) {
      const value = tokens[host.index+5]
      attach(first,host,'coordinate')
      attach(value,host,'coordinate')
      pairs.push({from:host.index,to:first.index,kind:'horizontal_value',cue:[axis.index]},
        {from:host.index,to:value.index,kind:'vertical_value',cue:[second.index]})
      continue
    }
    const owner = tokens[host.head]
    if (host.dep === 'appos' && ['row','column'].includes(owner?.lemma)) host.nominalRelation = 'position'
    const values = list(tokens,host.index+1,scalar)
    if (values.items.length < 2 || values.items.length > 3 || !values.cues.some(t => t.value === ',') ||
        !values.items.some(t => t.head === host.index)) continue
    for (const item of values.items) attach(item,host,'coordinate')
    values.items.forEach((t,i) => pairs.push({
      from:host.index,to:t.index,kind:'coordinate_component',cue:i ? [values.cues[i-1].index] : []
    }))
  }
}
