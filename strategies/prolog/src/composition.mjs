import { tokens } from './lexicon.mjs';
import { parse } from './schema.mjs';

const quotes = new Map([['"', '"'], ["'", "'"], ['“', '”'], ['‘', '’']]);
const requestType = 'w.request.request';
const targetType = 'w.request.target';
const constraintType = 'w.request.constraint';
const decode = value => value?.startsWith('"') ? JSON.parse(value) : value;
const one = (wire, key) => decode(wire.attrs[key]?.[0]);
const word = /[\p{L}\p{N}]/u;
const keyOf = text => tokens(text).map(([key]) => key).join(' ');

export function visibleTokens(chars, ts) {
  let quote = '';
  const visible = ts.map(([word, raw, start, end]) => {
    if ((raw === "'" || raw === '’') &&
        /[\p{L}\p{N}]/u.test(chars[start-1] ?? '') && /[\p{L}\p{N}]/u.test(chars[end] ?? '')) return '';
    if (quote) {
      if (raw === quote) {
        let slash = start;
        while (chars[slash-1] === '\\') slash--;
        if ((start-slash) % 2 === 0) quote = '';
      }
      return '';
    }
    if (quotes.has(raw)) { quote = quotes.get(raw); return ''; }
    return word;
  });
  // A literal list can contain words that are also imperative verbs. Only
  // matched brackets protect a span, so an unfinished list cannot hide the tail.
  const starts = [];
  for (let i=0;i<visible.length;i++) {
    if (visible[i]==='[') starts.push(i);
    if (visible[i]===']' && starts.length) {
      const start=starts.pop();
      visible.fill('',start,i+1);
    }
  }
  return visible;
}

export function coordinationActs(worlds) {
  const {grammar = new Set(), filler = new Set()} = worlds.evidenceVocabulary ?? {};
  const determiners = worlds.determiners ?? {};
  const rows = worlds.lookup;
  const isArgumentLead = surface => surface && (Object.hasOwn(determiners,surface) || worlds.isReference?.(surface));
  return (surface, { next, clause = surface } = {}) => {
    const head = surface.split(' ')[0];
    if (grammar.has(head) || filler.has(head) || Object.hasOwn(determiners,head)) return false;
    const lexical = worlds.lookup(surface);
    const licensed = lexical.some(([role,,mood])=>role==='act' && (!mood || mood==='do'));
    const entries = lexical;
    const acts = entries.filter(([role,,mood])=>role==='act' && (!mood || mood==='do' || mood==='propose'));
    if (!acts.length) return false;
    const verbs = acts.reduce((sum,row)=>sum+row.at(-1),0);
    const nominals = entries.filter(([role])=>role==='target' ||
      role==='constraint' && (!licensed || !next));
    const nominal = nominals.length && (!verbs || nominals.some(row=>row.at(-1)===0) ||
      nominals.reduce((sum,row)=>sum+row.at(-1),0)>=verbs);
    const boundedArgument = isArgumentLead(next);
    if (nominal && !boundedArgument) return false;
    // A verb can also be an adjective in an independently grounded phrase.
    // An explicit argument can distinguish that command from the modifier.
    if (!boundedArgument && clause!==surface && rows(clause).some(([role])=>role==='constraint' || role==='target')) return false;
    return Boolean(next) || licensed;
  };
}

// Weak connectors may join nouns, modifiers or clauses. Only independently
// supported, clause-leading predicates or preservation frames justify a cut.
export function clausePrefixes(prefixes) {
  const byHead = new Map();
  for (const phrase of prefixes) {
    const keys = keyOf(phrase).split(' ');
    if (!keys.some(key=>word.test(key))) continue;
    if (!byHead.has(keys[0])) byHead.set(keys[0],[]);
    byHead.get(keys[0]).push(keys);
  }
  return byHead;
}

export function sequenceParts(text, ts, joiners, {
  isAct, prefixes, requireLeftAct = true, requireClauseBoundary = false,
} = {}) {
  const chars = Array.from(text);
  const words = visibleTokens(chars, ts);
  const max = Math.max(1, ...Object.keys(joiners).map(phrase => phrase.split(' ').length));
  const parts = [];
  let start = 0;
  const offset = index => ts[index]?.[2] ?? chars.length;
  const phrase = (from, to) => chars.slice(offset(from),offset(to)).join('').trim();
  function connectorAt(index) {
    let key = '', match;
    for (let end=index;end<ts.length && end<index+max && words[end];end++) {
      key += (end===index ? '' : ' ') + words[end];
      if (Object.hasOwn(joiners,key)) match = {kind:joiners[key],end:end+1};
    }
    return match;
  }
  const strongKind = kind => kind==='sequence' || kind==='clause';
  const precedence = kind => kind==='condition' ? 3 : strongKind(kind) ? 2 : kind==='sequence-boundary' ? 1 : 0;

  function hasActLead(from, to) {
    if (!isAct) return false;
    const starts = new Set([from]);
    for (const index of starts) {
      for (const lead of prefixes?.get(words[index]) ?? []) {
        if (index+lead.length>=to || !lead.every((key,i)=>words[index+i]===key)) continue;
        let next = index+lead.length;
        while (words[next]===',' && next<to) next++;
        if (next<to) starts.add(next);
      }
      const head = [], clause = words.slice(index,to).filter(Boolean).join(' ');
      for (let i=index; i<to && i<index+8; i++) {
        const key = words[i];
        if (!key || !word.test(key) || connectorAt(i)) break;
        head.push(key);
        const follow = i+1<to ? ts[i+1][0] : undefined;
        const next = follow && (word.test(follow) || quotes.has(follow)) ? follow : undefined;
        if (isAct(head.join(' '),{next,clause})) return true;
      }
    }
    return false;
  }

  for (let i=0; i<ts.length;) {
    const first = i, initial = connectorAt(i);
    if (!initial) {
      i++;
      continue;
    }
    let {kind,end} = initial, following;
    let clauseBoundary = kind==='clause';
    // Punctuation after an ordered connector keeps the order. A condition in
    // the same run still belongs with the clause it qualifies.
    while ((following = connectorAt(end))) {
      clauseBoundary ||= following.kind==='clause';
      if (precedence(following.kind)>=precedence(kind)) kind = following.kind;
      end = following.end;
    }
    if (kind==='condition') break;
    if ((!requireClauseBoundary || clauseBoundary) && first>start && end<ts.length) {
      let next = end+1;
      while (next<ts.length && !connectorAt(next)) next++;
      const left = phrase(start,first);
      const ordered = strongKind(kind) || kind==='sequence-boundary' && hasActLead(end,next);
      const weak = ['coordination','addition','list-or-clause','contrast'].includes(kind) &&
        hasActLead(end,next);
      if (word.test(left) && (ordered || weak && (!requireLeftAct || hasActLead(start,first)))) {
        parts.push(left);
        if (parts.length >= 8) return [];
        start = end;
      }
    }
    i = end;
  }
  const tail = phrase(start,ts.length);
  return parts.length && tail ? [...parts,tail] : [];
}

const serialize = wires => wires.map(wire => ['@'+wire.id,wire.type,
  ...Object.entries(wire.attrs).flatMap(([key,vs]) => vs.map(v => key+'='+v)),
].join(' ')).join('\n');

// An explicit creation head can license separate, newly introduced list items.
// Requiring each item to begin with its own determiner or number keeps bare
// labels, coordinated attributes, and shared quantities in their original scope.
export function enumeratedParts(text, ts, worlds, { prefixes } = {}) {
  const chars = Array.from(text), visible = visibleTokens(chars,ts);
  const separators = new Set(['coordination','list-or-clause']);
  const starts = new Set([0]);
  const firstComma = visible.indexOf(',');
  const vocabulary = worlds.evidenceVocabulary;
  if (firstComma>0 && firstComma<=4 && visible.slice(0,firstComma).every(key=>
      key && !worlds.negatives?.has(key) && (vocabulary?.grammar.has(key) || vocabulary?.filler.has(key)))) {
    starts.add(firstComma+1);
  }
  const range = (from,to) => chars.slice(ts[from]?.[2] ?? chars.length,ts[to]?.[2] ?? chars.length).join('').trim();
  const nominalStart = position => ['indefinite','quantified'].includes(worlds.determiners[visible[position]]) ||
    /^\d+$/u.test(visible[position] ?? '');
  const targets = (from,to,act) => {
    const matches = [];
    for (let i=from+1;i<to;i++) {
      let phrase = '';
      for (let j=i;j<to && j<i+8 && visible[j] && word.test(visible[j]);j++) {
        phrase += (j===i?'':' ') + visible[j];
        const declared = worlds.lookup(phrase);
        const modifier = declared.some(([role])=>role==='constraint');
        for (const [role,licence,family,mode,sort] of declared) {
          if (role==='target' && licence===act && mode==='new' &&
              (!modifier || !sort || keyOf(sort)===phrase))
            matches.push({family,sort,index:i});
        }
      }
    }
    if (!matches.length) return [];
    const earliest = matches[0].index;
    return matches.filter(match=>match.index===earliest);
  };
  for (const from of starts) {
    for (const lead of prefixes?.get(visible[from]) ?? []) {
      if (!lead.every((key,i)=>visible[from+i]===key)) continue;
      let next = from+lead.length;
      while (visible[next]===',') next++;
      if (next<ts.length) starts.add(next);
    }
    const normalized = [];
    for (let end=from+1;end<ts.length && end<=from+8;end++) {
      const token = visible[end-1];
      if (!word.test(token) || worlds.joiners[token]) break;
      normalized.push(token);
      if (!nominalStart(end)) continue;
      const actions = worlds.lookup(normalized.join(' ')).filter(([role,,mood])=>role==='act' && (!mood || mood==='do'));
      for (const [,act] of actions) {
        const bounds = [];
        let start=end, punctuation=false, pendingComplement=false, ambiguousCut=false;
        for (let i=end+1;i<ts.length;i++) {
          const kind=worlds.joiners[visible[i]];
          if (!separators.has(kind)) continue;
          let next=i+1;
          while (separators.has(worlds.joiners[visible[next]])) next++;
          if (!nominalStart(next)) {
            if (kind==='coordination' && targets(start,i,act).length) pendingComplement=true;
            continue;
          }
          if (pendingComplement) { ambiguousCut=true; break; }
          punctuation ||= visible.slice(i,next).some(key=>worlds.joiners[key]==='list-or-clause');
          bounds.push([start,i]);
          start=next;
          i=next;
        }
        if (ambiguousCut || !bounds.length || bounds.length>=8) continue;
        bounds.push([start,ts.length]);
        const items = bounds.map(([a,b])=>targets(a,b,act));
        if (items.some(item=>!item.length)) continue;
        // In an unpunctuated two-item phrase, a second indefinite phrase
        // can belong to a spatial complement of the first object.
        if (!punctuation && bounds.length===2) {
          const start = items[0][0].index+1;
          const marker = key => key && worlds.lookup(key).some(([role,licence])=>role==='marker' &&
            (licence==='*' || licence===act));
          const complement = visible.slice(start,bounds[0][1]).some((key,index)=>
            nominalStart(start+index) || marker(key));
          const tail = visible.slice(items[1][0].index+1,bounds[1][1]);
          const anchor = tail.findIndex(marker);
          // A second item's own relation to the first target licenses a
          // separate object without lending the first relation to the second.
          if (complement && (anchor<0 || !tail.slice(anchor+1).includes(visible[items[0][0].index]))) continue;
        }
        const predicate=range(from,end);
        return {
          act,predicate,items,
          parts:bounds.map(([a,b],i)=>range(i?a:0,b)),
          inputs:bounds.map(([a,b])=>predicate+' '+range(a,b)),
        };
      }
    }
  }
  return null;
}

function bindsFrontedLandmark(wires,target,{location,bindings}) {
  const constraints=wires.filter(w=>w.type===constraintType && one(w,'request')===one(target,'request'));
  return bindings.some(({anchorKey,relationKey})=>{
    const anchors=constraints.filter(w=>one(w,'attribute')===anchorKey && one(w,'phase')==='selector');
    if (anchors.length!==1) return false;
    const [anchor]=anchors, landmark=one(anchor,'value');
    return landmark && keyOf(location).endsWith(' '+keyOf(landmark)) &&
      constraints.some(w=>one(w,'attribute')===relationKey && one(w,'phase')==='result' && !w.attrs.want) &&
      wires.some(w=>w.type==='w.request.lookup' && one(w,'constraint')==='$'+anchor.id && one(w,'from')==='page');
  });
}

export function composableWires(result, item) {
  let wires;
  try { wires = parse(result.sop); } catch { return null; }
  const requests = wires.filter(w => w.type===requestType);
  if (item) {
    if (requests.length!==1 || one(requests[0],'act')!==item.act ||
        one(requests[0],'predicate')!==item.predicate) return null;
    const targets = wires.filter(w=>w.type===targetType && one(w,'request')==='$'+requests[0].id);
    if (targets.length!==1 || one(targets[0],'mode')!=='new' ||
        !item.targets.some(({family,sort,fronted})=>one(targets[0],'family')===family && one(targets[0],'sort')===sort &&
          (!fronted || bindsFrontedLandmark(wires,targets[0],fronted)))) return null;
  } else if (requests.length===1) {
    if (!requests[0].attrs.predicate && !['scene-heading','nominal-creation'].includes(result.source)) return null;
  } else if (result.source!=='enumeration' || requests.length<2 ||
             requests.some(w=>!w.attrs.words)) return null;
  return wires;
}

export function composeParts(parts, results, enumeration) {
  const combined = [];
  if (parts.length !== results.length || parts.length < 2) return null;
  for (const [i, result] of results.entries()) {
    const targets = enumeration?.items[i];
    const item = targets && {act:enumeration.act,predicate:enumeration.predicate,targets};
    const wires = composableWires(result,item);
    if (!wires) return null;
    const ids = new Map(wires.map(w => [w.id,'s' + (i+1) + '.' + w.id]));
    for (const wire of wires) {
      if (Object.values(wire.attrs).some(values =>
        values.some(value => value.startsWith('$') && !ids.has(value.slice(1))))) return null;
      const attrs = Object.fromEntries(Object.entries(wire.attrs).map(([key,values]) => [key,values.map(value =>
        value.startsWith('$') ? '$'+ids.get(value.slice(1)) : value)]));
      if (wire.type===requestType) {
        if (item || !attrs.words) attrs.words = [JSON.stringify(parts[i])];
        if (item && (i>0 || enumeration.syntheticPredicate)) delete attrs.predicate;
      }
      combined.push({...wire,id:ids.get(wire.id),attrs});
    }
  }
  if (enumeration?.prefix) {
    const request=combined.find(w=>w.type===requestType);
    combined.push({id:'scene.setting',type:'w.request.unread',
      attrs:{request:['$'+request.id],text:[JSON.stringify(enumeration.prefix)]}});
  }
  return serialize(combined);
}
