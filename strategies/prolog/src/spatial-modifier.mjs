import {str,serialize} from './knowledge.mjs';
import {literalRanges} from './evidence.mjs';
import {consumeUnread} from './nominal-evidence.mjs';
import {parse} from './schema.mjs';

const field=(wire,key)=>str(wire.attrs[key]?.[0]);
const constraint='w.request.constraint';

export function compileSpatialModifiers(facts) {
  const rules=new Map();
  for (const wire of facts('pro.reader.spatial_modifier')) {
    const additional=field(wire,'additional');
    if (!additional) continue;
    for (const prefix of wire.attrs.prefix ?? []) {
      const key=str(prefix).toLowerCase();
      const list=rules.get(key) ?? [];
      list.push({bases:new Set((wire.attrs.base ?? []).map(str)),additional});
      rules.set(key,list);
    }
  }
  return {rules,heads:new Set([...rules.keys()].map(key=>key.split(/\s+/u)[0]))};
}

// Two compatible relations can describe the same target and landmark. Require
// one written anchor so the extra relation cannot attach to a different object.
export function* spatialModifierReadings(text,candidate,worlds) {
  const wires=parse(candidate.sop);
  const targets=wires.filter(w=>w.type==='w.request.target');
  if (targets.length!==1) return;
  const [target]=targets, request=field(target,'request');
  const local=wires.filter(w=>field(w,'request')===request);
  const relations=local.filter(w=>w.type===constraint && field(w,'operator')==='relation');
  if (relations.length!==2) return;
  const markers=local.filter(w=>w.type==='w.request.unread' &&
    worlds.spatialModifiers.rules.has(field(w,'text')?.toLowerCase()));
  for (const binding of worlds.spatialBindings.filter(b=>b.family===field(target,'family'))) {
    const direction=relations.find(w=>field(w,'attribute')===binding.relationKey);
    const anchor=relations.find(w=>field(w,'attribute')===binding.anchorKey);
    if (!direction || !anchor || direction.attrs.want || anchor.attrs.want) continue;
    const bank=worlds.requestKeys.find(k=>k.family===binding.family && k.name===binding.relationKey);
    const base=field(direction,'value'), marker=field(direction,'words') ?? base;
    for (const unread of markers) {
      const prefix=field(unread,'text');
      const occurrences=literalRanges(text,prefix);
      if (occurrences.length!==1) continue;
      const [[start,end]]=occurrences;
      const tail=text.slice(end).trimStart();
      const landmark=field(anchor,'value');
      if (!literalRanges(tail,marker).some(([at])=>at===0) ||
          !literalRanges(tail.slice(marker.length).trimStart(),landmark).some(([at])=>at===0)) continue;
      for (const {bases,additional} of worlds.spatialModifiers.rules.get(prefix.toLowerCase())) {
        if (!bases.has(base) || !bank?.values.includes(base) || !bank.values.includes(additional) || additional===base) continue;
        const id=direction.id+'.modifier';
        if (wires.some(w=>w.id===id)) continue;
        const companion={id,type:constraint,attrs:{...direction.attrs,value:[additional],words:[JSON.stringify(prefix)]}};
        const enhanced=consumeUnread(wires,text,start,end,w=>w===unread)
          .flatMap(w=>w===direction ? [w,companion] : [w]);
        yield {sop:serialize(enhanced).trimEnd(),source:'spatial-modifier',status:candidate.status};
      }
    }
  }
}
