// Recover a literal qualifier adjacent to an existing target's typed noun.
import { literalRanges, sortRanges } from './evidence.mjs';
import { tokens } from './lexicon.mjs';
import { maskQuoted, quotedSpans } from './literal-roles.mjs';
import { consumeUnread } from './nominal-evidence.mjs';
import { parse } from './schema.mjs';
import { serialize } from './knowledge.mjs';

const value = (wire,key) => {
  const raw = wire?.attrs[key]?.[0];
  return raw?.startsWith('"') ? JSON.parse(raw) : raw;
};
const proper = /^(?:\p{Lu}[\p{L}\p{N}_'’-]*|\p{L}+[0-9][\p{L}\p{N}_-]*)$/u;
const number = /^\d+$/u;
const gap = /^\s+$/u;

export function compileCodeSelectors(facts,requestKeys) {
  const codeSlots=new Set(facts('core.slot').filter(wire=>value(wire,'key')==='code').map(wire=>wire.id));
  const keys=Map.groupBy(requestKeys.filter(key=>codeSlots.has(key.means) &&
    key.head.split('+').includes('candidate')),key=>key.name);
  const labels=facts('core.word').filter(wire=>(wire.attrs.means ?? []).some(raw=>
    codeSlots.has(raw.startsWith('"') ? JSON.parse(raw) : raw)))
    .flatMap(wire=>(wire.attrs.text ?? []).map(raw=>tokens(raw.startsWith('"') ? JSON.parse(raw) : raw).map(([word])=>word)))
    .filter(words=>words.length);
  return {keys,labels:[...new Map(labels.map(words=>[words.join(' '),words])).values()]};
}

function hasCodeMarker(scope,name,labels) {
  const visible=Array.from(maskQuoted(scope,quotedSpans(scope)));
  return literalRanges(scope,name).some(([start])=>{
    const offset=Array.from(scope.slice(0,start)).length;
    const lead=tokens(visible.slice(0,offset).join('').replace(/[\s"'‘“:=()]+$/u,'')).map(([term])=>term);
    if (lead.at(-1)==='is') lead.pop();
    return labels.some(words=>words.every((term,i)=>term===lead[lead.length-words.length+i]));
  });
}

// A name already identifies the written designation. Promoting the same
// multiword span to a machine code requires independent wording.
function duplicateDesignationSelectors(text,wires,worlds) {
  const {keys,labels}=worlds.codeSelectors ?? {};
  if (!keys?.size || !wires.some(wire=>wire.type==='w.request.constraint' && keys.has(value(wire,'attribute')))) return [];
  const requests=wires.filter(wire=>wire.type==='w.request.request');
  const owned=Map.groupBy(wires.filter(wire=>wire.attrs.request?.length),wire=>wire.attrs.request[0]);
  return requests.flatMap(request=>{
    const scope=value(request,'words') ?? (requests.length===1 ? text : undefined);
    if (!scope) return [];
    const local=owned.get('$'+request.id) ?? [];
    const targets=local.filter(wire=>wire.type==='w.request.target');
    if (targets.length!==1) return [];
    const [target]=targets, name=value(target,'name'), family=value(target,'family');
    if (value(target,'mode')!=='existing' || !name || !/\S\s+\S/u.test(name) ||
        target.attrs.ids?.length || target.attrs.code_words?.length ||
        !literalRanges(scope,name).length || hasCodeMarker(scope,name,labels)) return [];
    return local.filter(wire=>wire.type==='w.request.constraint' && value(wire,'on')==='attribute' &&
      value(wire,'phase')==='selector' && [undefined,'yes'].includes(value(wire,'want')) &&
      [undefined,'eq'].includes(value(wire,'operator')) && wire.attrs.value?.length===1 &&
      value(wire,'value')===name && keys.get(value(wire,'attribute'))?.some(key=>key.family===family));
  });
}

export function keepWrittenDesignations(text,reading,worlds) {
  if (!reading.sop?.includes(' name=') ||
      ![...worlds.codeSelectors?.keys.keys() ?? []].some(key=>reading.sop.includes(key))) return reading;
  const wires=parse(reading.sop), removed=duplicateDesignationSelectors(text,wires,worlds);
  if (!removed.length) return reading;
  const ids=new Set(removed.map(wire=>'$'+wire.id));
  if (wires.some(wire=>Object.values(wire.attrs).some(values=>values.some(raw=>ids.has(raw))))) return reading;
  return {...reading,sop:serialize(wires.filter(wire=>!removed.includes(wire))).trimEnd()};
}

function followsPlaceMarker(text, at, worlds) {
  const tail = tokens(text.slice(at)).slice(0, 4).map(([key])=>key);
  return tail.some((_, index)=>worlds.lookup(tail.slice(0,index+1).join(' '))
    .some(([role,,kind])=>role==='marker' && ['place','spatial'].includes(kind)));
}

export function namedTargetReading(text, candidate, worlds) {
  if (candidate.source !== 'lexicon' || !candidate.sop.includes('w.request.unread')) return;
  const wires=parse(candidate.sop);
  const targets=wires.filter(w=>w.type==='w.request.target');
  if (targets.length!==1) return;
  const [target]=targets;
  if (value(target,'mode')!=='existing' || target.attrs.name || target.attrs.ids) return;
  const head=value(target,'sort_words') ?? value(target,'family_words') ?? value(target,'sort');
  if (!head) return;
  const prior=value(target,'description');
  if (prior && !sortRanges(prior,head).some(([a,b])=>b===prior.length &&
      (!a || Object.hasOwn(worlds.determiners,prior.slice(0,a).trim().toLowerCase())))) return;
  const ref=value(target,'request');
  const request=wires.find(w=>'$'+w.id===ref && w.type==='w.request.request');
  const scope=value(request,'words') ?? text;
  const bounds=literalRanges(text,scope);
  if (!request || bounds.length!==1) return;
  const [[start,stop]]=bounds;
  const chars=Array.from(text);
  const quotes=quotedSpans(text).map(({start,end})=>
    [chars.slice(0,start).join('').length,chars.slice(0,end).join('').length]);
  const unquoted=(a,b)=>!quotes.some(([left,right])=>a<right && left<b);
  const heads=sortRanges(text,head,start,stop).filter(([a,b])=>unquoted(a,b));
  const unread=wires.filter(w=>w.type==='w.request.unread' && value(w,'request')===ref);
  const matches=[];
  for (const wire of unread) {
    const raw=value(wire,'text');
    if (!raw) continue;
    const ranges=literalRanges(text,raw);
    if (ranges.length!==1) continue;
    const [[from,to]]=ranges;
    if (from<start || to>stop || !unquoted(from,to)) continue;
    const words=raw.trim().split(/\s+/u);
    if (Object.hasOwn(worlds.determiners,words[0].toLowerCase())) words.shift();
    if (!words.length) continue;
    const key=words.join(' ').toLowerCase();
    if (worlds.lookup(key).some(([role])=>role==='constraint' ||
        role==='act' && text.trimStart().toLowerCase().startsWith(key+' '))) continue;
    const properName=words.every(w=>proper.test(w) && !worlds.evidenceVocabulary.grammar.has(w.toLowerCase()));
    const numeric=words.length===1 && number.test(words[0]);
    if (!properName && !numeric) continue;
    for (const [a,b] of heads) {
      if (properName && to<a && gap.test(text.slice(to,a))) {
        matches.push({wire,from,to,headStart:a,description:text.slice(from,b),name:words.join(' ')});
      }
      if (b<from && gap.test(text.slice(b,from)) &&
          (properName || followsPlaceMarker(text.slice(0,stop),to,worlds))) {
        matches.push({wire,from,to,headStart:a,description:text.slice(a,to),name:properName ? words.join(' ') : undefined});
      }
    }
  }
  if (matches.length!==1) return;
  const [{wire,from,to,headStart,description,name}]=matches;
  if (headStart!==heads[0][0]) return;
  const attributes=name && unread.length===1 ? {fill:['written'],name:[JSON.stringify(name)]} :
    {fill:['description'],description:[JSON.stringify(description)]};
  const revised={...target,attrs:{...target.attrs,...attributes}};
  if (attributes.name) delete revised.attrs.description;
  const retained=consumeUnread(wires,text,from,to,w=>w===wire);
  return {...candidate,sop:serialize(retained.map(w=>w===target ? revised : w)),source:'named-target',status:'partial'};
}
