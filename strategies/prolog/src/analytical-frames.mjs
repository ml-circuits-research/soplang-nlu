import { str } from './knowledge.mjs';
import { tokens } from './lexicon.mjs';
import { scalarNumber } from './structured-arguments.mjs';

const surface=text=>tokens(text).map(([key])=>key).join(' ');
const ownerId=(family,key,value,words)=>JSON.stringify([family,key,value,surface(words)]);

// Lower declarative analytical frames into the existing argument parser. The
// frame names the data roles and layouts, while the argument parser binds and
// validates the written spans and closed operator values.
export function analyticalArgumentFacts(facts) {
  const frames=[];
  const boundaries=new Map();
  const closedFields=new Set(facts('w.request.key').filter(({attrs})=>
    attrs.value?.length && str(attrs.head?.[0])?.split('+').some(head=>head==='class' || head==='candidate'))
    .map(({attrs})=>JSON.stringify(['family','name'].map(key=>str(attrs[key]?.[0])))));
  for (const {attrs} of facts('pro.reader.analytical_boundary')) {
    const id=str(attrs.family?.[0]);
    const accumulated=boundaries.get(id) ?? {open_boundary:[],numeric_modifier:[]};
    accumulated.open_boundary.push(...attrs.text ?? []);
    accumulated.numeric_modifier.push(...attrs.numeric_modifier ?? []);
    boundaries.set(id,accumulated);
  }
  for (const wire of facts('pro.reader.analytical_frame')) {
    const {attrs}=wire;
    const take=key=>attrs[key]?.[0];
    const [layout,ownerMarker,grouping,operation,measure]=
      ['layout','owner_marker','grouping','operation','measure'].map(take);
    if (![take('family'),take('owner_key'),take('owner_value')].every(Boolean) ||
        !attrs.prefix?.length || !attrs.owner?.length) continue;
    const family=str(take('family'));
    const isClosedField=field=>field.startsWith('=') || field==='$predicate' || closedFields.has(JSON.stringify([family,field]));
    const parts=layout==='ordered_fields' ? (attrs.pattern ?? []).flatMap(pattern=>{
      // Braces name typed catalog slots. The text between slots is one
      // authored connector. A closed value between open slots also separates
      // them, as in a threshold operator between a subject and its bound.
      const split=str(pattern).split(/\{(\$(?:owner|predicate)|=?[\p{L}][\p{L}\p{N}_-]*\.[\p{L}\p{N}_.-]+)\}/u);
      if (split.length<5 || split.some((item,i)=>i%2===0 &&
          (/[{}]/u.test(item) || i>0 && i<split.length-1 && !item.trim() &&
            !isClosedField(split[i-1]) && !isClosedField(split[i+1])))) return [];
      return [split.flatMap((item,i)=>{
        const part=item.trim();
        return part ? [i%2 ? part : JSON.stringify(part)] : [];
      })];
    }) : groupedParts(attrs,[layout,ownerMarker,grouping,operation,measure]);
    for (const [i,part] of parts.entries()) {
      const inherited=boundaries.get(family);
      const bindsPredicate=part.includes('$predicate');
      // Reuse the authored command surfaces as a closed slot. The leading
      // literal indexes the packet while leaving the command at its written position.
      const predicateLead=part[part.indexOf('$predicate')-1];
      if (bindsPredicate && (!part[0].startsWith('"') || !predicateLead?.endsWith(',"'))) continue;
      frames.push({
        id:wire.id+'.argument.'+(i+1),
        type:'pro.reader.argument_sequence',
        attrs:Object.fromEntries([
          ...['family','owner','owner_key','owner_value'].map(key=>[key,attrs[key]]),
          ['prefix',bindsPredicate ? part.slice(0,1) : attrs.prefix],
          ['predicate_surface',bindsPredicate ? attrs.prefix : []],
          ['act',['make']],['mode',['new']],['part',bindsPredicate ? part.slice(1) : part],
          ['tail',bindsPredicate ? [] : attrs.tail ?? []],
          ['scope_literal_slot',attrs.scope_literal_slot ?? []],['scope_literal',attrs.scope_literal ?? []],
          ['open_boundary',[...inherited?.open_boundary ?? [],...attrs.open_boundary ?? []]],
          ['numeric_modifier',inherited?.numeric_modifier ?? []]
        ])
      });
    }
  }
  return frames;
}

function groupedParts(attrs,[layout,ownerMarker,grouping,operation,measure]) {
  if (!ownerMarker || !grouping || !measure) return [];
  const owner=['$owner',ownerMarker];
  const groupMarkers=attrs.group_marker ?? [];
  const operationMarkers=attrs.operation_marker ?? [];
  const variants=operation ? [[operation],...operationMarkers.map(marker=>[operation,marker])] : [[]];
  if (operation) for (const lead of attrs.operation_lead ?? []) {
    variants.push([lead,operation],...operationMarkers.map(marker=>[lead,operation,marker]));
  }
  const parts=[];
  for (const variant of variants) for (const groupMarker of groupMarkers) {
    if (layout==='leading_owner') {
      parts.push([...owner,...variant,measure,groupMarker,grouping]);
    } else if (layout==='trailing_owner') {
      parts.push([...variant,measure,groupMarker,grouping,ownerMarker,'$owner']);
    }
  }
  if (layout==='leading_group' && operation) {
    for (const marker of operationMarkers) parts.push([...owner,grouping,operation,marker,measure]);
  }
  if (layout==='trailing_operation' && operation) {
    for (const marker of operationMarkers) for (const groupMarker of groupMarkers) {
      parts.push([...owner,measure,marker,operation,groupMarker,grouping]);
    }
  }
  return parts;
}

export function compileAnalyticalOwnerProperties(facts, requestKeys) {
  const index=new Map();
  for (const {attrs} of facts('pro.reader.analytical_owner_property')) {
    const get=key=>str(attrs[key]?.[0]);
    const [family,ownerKey,ownerValue,key,value]=
      ['family','owner_key','owner_value','key','value'].map(get);
    if (ownerKey===key || ![[ownerKey,ownerValue],[key,value]].every(([name,choice])=>
      requestKeys.some(row=>row.family===family && row.name===name && row.values.includes(choice)))) continue;
    for (const word of (attrs.text ?? []).map(str)) {
      const id=ownerId(family,ownerKey,ownerValue,word), fields=index.get(id) ?? new Map();
      const values=fields.get(key) ?? new Set();
      values.add(value);
      fields.set(key,values);
      index.set(id,fields);
    }
  }
  return index;
}

export function analyticalOwnerBindings(text,proof,worlds) {
  if (!proof.owned?.ownerKey || !worlds.analyticalOwnerProperties?.size) return [];
  const owner=proof.bindings.find(([key])=>key==='$owner');
  if (!owner) return [];
  const [, ,start,end]=owner, span=Array.from(text).slice(start,end).join('');
  const fields=worlds.analyticalOwnerProperties.get(ownerId(proof.family,
    proof.owned.ownerKey,proof.owned.ownerValue,span));
  return [...(fields ?? [])].flatMap(([key,values])=>values.size===1 &&
    !proof.bindings.some(([occupied])=>occupied===key) ? [[key,[...values][0],start,end]] : []);
}

export function compileAnalyticalAdjuncts(facts,catalog) {
  const frames=new Map();
  for (const {attrs} of facts('pro.reader.analytical_adjunct')) {
    const [family,key,value]=['family','key','value'].map(name=>str(attrs[name]?.[0]));
    const property=catalog.find(row=>row.family===family && row.name===key);
    if (!property) continue;
    for (const pattern of (attrs.pattern ?? []).map(str)) {
      const [before,after,...repeated]=pattern.split('{number}');
      if (repeated.length || /[{}]/u.test(before+(after ?? ''))) continue;
      if (after===undefined ? !property.values.includes(value) :
          value!==undefined || property.values.length || !property.head.split('+').includes('number')) continue;
      const lead=surface(before).split(' '), tail=after?.trim() ? surface(after).split(' ') : [];
      if (!lead[0]) continue;
      const entries=frames.get(family) ?? [];
      entries.push({key,lead,tail,value});
      frames.set(family,entries);
    }
  }
  return frames;
}

function adjunctValue({key,lead,tail,value},part,span,worlds,family) {
  const stop=part.length-tail.length;
  if (stop<lead.length || !lead.every((word,i)=>part[i][0]===word) ||
      !tail.every((word,i)=>part[stop+i][0]===word)) return;
  if (value!==undefined) return stop===lead.length ? value : undefined;
  if (stop===lead.length) return;
  return scalarNumber(span(part[lead.length][2],part[stop-1][3]),worlds,family,key);
}

export function analyticalAdjunctAlias(worlds,family,key,text,value) {
  const rules=worlds.analyticalAdjuncts?.get(family)?.filter(rule=>rule.key===key);
  if (!rules?.length) return false;
  const chars=Array.from(text), part=tokens(text);
  const matches=new Set(rules.map(rule=>adjunctValue(rule,part,(a,b)=>chars.slice(a,b).join(''),worlds,family))
    .filter(result=>result!==undefined));
  return matches.size===1 && matches.has(value);
}

export function analyticalAdjunctBindings(text,proof,worlds,baseBindings) {
  const rules=worlds.analyticalAdjuncts?.get(proof.family);
  if (!rules?.length || !proof.owned.ownerKey || proof.mode!=='new') return;
  const end=proof.owned.politeTail ?? proof.owned.utteranceEnd;
  if (proof.end>=end) return;
  const chars=Array.from(text);
  const span=(a,b)=>chars.slice(a,b).join('');
  const ts=tokens(span(proof.end,end));
  const parts=[];
  let start=0;
  for (let i=0;i<=ts.length;i++) {
    if (i<ts.length) {
      const [word,,a,b]=ts[i], around=span(proof.end+a-1,proof.end+b+1);
      if ((word==='.' && !/\d\.\d/u.test(around)) || [';','!','?'].includes(word)) {
        parts.push(ts.slice(start));
        break;
      }
      if (word!==',' || /\d,\d/u.test(around)) continue;
    }
    if (i>start) parts.push(ts.slice(start,i));
    start=i+1;
  }
  const occupied=new Set([...proof.bindings,...baseBindings].map(([key])=>key));
  let crossedRequest=false;
  const results=parts.map(part=>{
    const from=proof.end+part[0][2], to=proof.end+part.at(-1)[3];
    if (crossedRequest) return {from,to};
    const choices=new Map();
    for (const rule of rules) {
      if (occupied.has(rule.key)) continue;
      const canonical=adjunctValue(rule,part,(a,b)=>span(proof.end+a,proof.end+b),worlds,proof.family);
      if (canonical!==undefined) choices.set(JSON.stringify([rule.key,canonical]),[rule.key,canonical,from,to]);
    }
    if (!choices.size) {
      let first=0;
      while (worlds.joiners[part[first]?.[0]]) first++;
      crossedRequest=part.slice(first,first+4).some((_,i)=>
        worlds.lookup(part.slice(first,first+i+1).map(([word])=>word).join(' '))
          .some(([role,act,mood])=>role==='act' && act!=='ask' && (!mood || mood==='do')));
    }
    return {from,to,binding:choices.size===1 ? choices.values().next().value : undefined};
  });
  const counts=new Map();
  for (const {binding} of results) if (binding) counts.set(binding[0],(counts.get(binding[0]) ?? 0)+1);
  const bindings=[], unread=[];
  let remainder;
  for (const {from,to,binding} of results) {
    if (binding && counts.get(binding[0])===1) {
      if (remainder) unread.push(span(...remainder));
      remainder=undefined;
      bindings.push(binding);
    } else remainder=[remainder?.[0] ?? from,to];
  }
  if (remainder) unread.push(span(...remainder));
  if (bindings.length) return {bindings,unread};
}
