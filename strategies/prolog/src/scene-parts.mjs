
const nounStart = new Set(['indefinite','quantified']);
const word = /^[\p{L}\p{M}\p{N}_]+$/u;
const terminal = new Set(['.','!','?']);
const separators = new Set(['list-or-clause','coordination']);

const quantityStarts=new WeakMap();
function quantityWidth(terms,start,numbers) {
  if (!numbers) return 0;
  if (!quantityStarts.has(numbers)) {
    const heads=new Map();
    for (const [form,{kind}] of numbers) if (kind==='qualitative') {
      const words=form.split(' ');
      heads.set(words[0],Math.max(words.length,heads.get(words[0]) ?? 0));
    }
    quantityStarts.set(numbers,heads);
  }
  for (let size=Math.min(quantityStarts.get(numbers).get(terms[start]) ?? 0,terms.length-start);size>0;size--)
    if (numbers.get(terms.slice(start,start+size).join(' '))?.kind==='qualitative') return size;
  return 0;
}

export function sceneParts(text, ts, worlds, {visible, prefixes, isAct} = {}) {
  const head = visible ?? ts.map(([key])=>key);
  const chars = Array.from(text);
  const span = (from,to)=>chars.slice(ts[from]?.[2] ?? chars.length,ts[to-1]?.[3] ?? chars.length).join('').trim();
  const memo=new Map();
  const lookup=surface=>{
    if (!memo.has(surface)) memo.set(surface,worlds.lookup(surface));
    return memo.get(surface);
  };
  const quantityAt=i=>quantityWidth(head,i,worlds.nominalNumbers);
  const nominal = i=>quantityAt(i)>0 || nounStart.has(worlds.determiners[head[i]]) || /^\d+$/u.test(head[i] ?? '');
  const separator = i=>separators.has(worlds.joiners[head[i]]);
  const spatial = i=>worlds.lookup(head[i] ?? '').some(([role,act,arg])=>
    role==='marker' && (act==='*' && arg==='spatial' || act==='make' && arg==='place'));
  const hasSpatialLead = i=> spatial(i) || (word.test(head[i] ?? '') && spatial(i+1));
  const forms = (start,end)=>head.slice(start,end).join(' ');
  const partMarker = i=>worlds.lookup(head[i] ?? '').some(([role,act,arg])=>
    role==='marker' && act==='make' && arg==='part');

  function nouns(start,end) {
    if (!nominal(start)) return [];
    let ambiguous=[];
    for (let i=start+Math.max(1,quantityAt(start));i<Math.min(end,start+8);i++) {
      if (!word.test(head[i]) || spatial(i) || nominal(i)) break;
      for (let j=Math.min(end,i+6);j>i;j--) {
        if (!head.slice(i,j).every(key=>word.test(key))) continue;
        const phrase=forms(i,j), hits=lookup(phrase);
        const hasProperty=hits.some(([role,act])=>role==='constraint' && (act==='*' || act==='make'));
        const targets=hits.flatMap(([role,act,family,mode,sort])=>role==='target' && act==='make' && mode==='new' &&
          (!hasProperty || sort===phrase)
          ? [{family,sort:sort || undefined,start:i,end:j}] : []);
        if (targets.length && !hasProperty) return targets;
        if (targets.length && (!ambiguous.length || j>ambiguous[0].end)) ambiguous=targets;
      }
    }
    return ambiguous;
  }

  let start=0, predicate, prefix;
  while (worlds.fillerPhrases.has(head[start]) || start &&
    ([',','-','—','–'].includes(head[start]) || worlds.joiners[head[start]]==='addition')) start++;
  if (!prefix) {
    for (const lead of prefixes?.get(head[start]) ?? []) {
      if (lead.every((key,i)=>head[start+i]===key)) {
        start+=lead.length;
        if (head[start]===',') start++;
        break;
      }
    }
    for (let end=start+1;end<Math.min(ts.length,start+8);end++) {
      if (!head.slice(start,end).every(key=>word.test(key))) break;
      if (!nominal(end) || !lookup(forms(start,end)).some(([role,act,mood])=>role==='act' && act==='make' &&
        (!mood || mood==='do'))) continue;
      predicate=span(start,end);
      start=end;
      break;
    }

    // A title or a preposed setting remains outside the object clauses. An
    // ordinary concrete nominal before “with” owns its part list.
    const colon=head.findIndex((key,i)=>i>start && key===':' && nominal(i+1));
    if (colon>=0 || !nouns(start,ts.length).length) {
      const end=colon>=0 ? colon : head.findIndex((key,i)=>i>start &&
        (key===',' || partMarker(i)) && nominal(i+1));
      if (end<0 || !nominal(start) && !hasSpatialLead(start) || colon<0 && nouns(start,end).length) return null;
      prefix=span(0,end);
      start=end+1;
    }
  }

  const parts=[],inputs=[],items=[];
  let begin=start, chunk=start, punctuated=false, firstObject, frontedLocation=false;
  const synthesize=!predicate || !!prefix;
  predicate ??= 'make';
  function add(end) {
    const targets=nouns(chunk,end);
    if (!targets.length) return false;
    if (!prefix && begin!==chunk) {
      const location=span(begin,chunk-1);
      for (const target of targets) {
        target.fronted={location,bindings:worlds.spatialBindings.filter(b=>b.family===target.family)};
      }
    }
    const part=span(begin,end);
    firstObject ??= part;
    parts.push(!parts.length && (prefix || !synthesize) ? span(0,end) : part);
    const nounEnd=terminal.has(head[end-1]) ? end-1 : end;
    const body=begin===chunk ? part : span(chunk,nounEnd)+' '+span(begin,chunk-1);
    inputs.push(predicate+' '+body);
    items.push(targets);
    return true;
  }
  for (let i=start+1;i<ts.length;i++) {
    if (head[i]==='?' || (terminal.has(head[i]) && i<ts.length-1)) return null;
    if (!separator(i)) continue;
    let next=i+1;
    while (separator(next)) next++;
    if (next===ts.length) break;
    const comma=head.slice(i,next).some(key=>key===',');
    if (!nominal(next)) {
      if (comma && hasSpatialLead(next)) {
        const after=head.indexOf(',',next);
        if (after>=0 && nominal(after+1)) {
          if (!prefix && head.slice(next,after).some(key=>!word.test(key) || worlds.joiners[key] ||
              worlds.negatives.has(key) || worlds.scopeGrammar.conditionals.has(key))) return null;
          if (!add(i)) return null;
          frontedLocation=true;
          begin=next;
          chunk=after+1;
          punctuated=true;
          i=chunk;
        }
        continue;
      }
      const tailVerb=isAct?.(head[next],{next:head[next+1],clause:forms(next,ts.length)}) ||
        comma && next>i+1 && worlds.scopeGrammar.plainImperatives.has(head[next]) &&
        Object.hasOwn(worlds.determiners,head[next+1]);
      if (parts.length && tailVerb && add(i)) {
        parts.push(span(next,ts.length));
        inputs.push(parts.at(-1));
        items.push(null);
        chunk=ts.length;
        break;
      }
      continue;
    }
    // Without a comma, a nominal may be another landmark or owned part.
    const previous=nouns(chunk,i);
    if (!previous.length) continue;
    const afterNoun=previous[0].end;
    if (!prefix && !parts.length && head.slice(afterNoun,i).some((_,j)=>partMarker(afterNoun+j))) return null;
    if (!comma && head.slice(afterNoun,i).some((_,j)=>spatial(afterNoun+j) || partMarker(afterNoun+j))) continue;
    if (!add(i)) return null;
    punctuated ||= comma;
    begin=chunk=next;
    i=next;
  }
  if (chunk<ts.length && !add(ts.length)) return null;
  // A standalone indefinite noun phrase can share the creation reading of
  // an item in a list. Its projected circuit must ground the whole phrase.
  if (!prefix && synthesize && start===0 && parts.length===1 &&
      (worlds.determiners[head[0]]==='indefinite' || quantityAt(0)) && ts.every(([key])=>
        !worlds.negatives.has(key) && !worlds.scopeGrammar.conditionals.has(key) &&
        !worlds.scopeGrammar.auxiliary.has(key) && !worlds.scopeGrammar.copulas.has(key) &&
        !worlds.joiners[key] && (word.test(key) || key==='-' || key==='.' || key==='!'))) {
    return {act:'make',predicate,parts,inputs,items,singleNominal:true,quantity:quantityAt(0) ? span(0,quantityAt(0)) : undefined};
  }
  if (!punctuated || items.filter(Boolean).length<2 || parts.length>8) return null;
  return {act:'make',predicate,parts,inputs,items,prefix,firstObject,frontedLocation,syntheticPredicate:synthesize};
}
