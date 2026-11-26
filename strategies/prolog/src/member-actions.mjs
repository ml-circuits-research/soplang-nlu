import { tokens } from './lexicon.mjs';
import { constraintGrounder } from './grounding.mjs';
import { parse, str } from './knowledge.mjs';

const initial = /^\p{Lu}$/u;
const title = /^\p{Lu}[\p{L}\p{M}_]*$/u;
const code = /^(\p{L}+)[0-9]+$/u;
const decimalId = /^[0-9]{1,8}$/u;
const atom = /^[\p{L}_][\p{L}\p{M}\p{N}_.-]*$/u;
const quote = JSON.stringify;
const keysOf = text => tokens(text).map(t=>t[0]);
const ground = constraintGrounder();

function licensedFrame(frame,worlds) {
  const {family,key,act,mode,phase}=frame;
  return atom.test(act) && atom.test(family) && atom.test(key) &&
    ((mode==='new' && phase==='result') || (mode==='existing' && phase==='selector')) &&
    (!(frame.numericId || frame.effectKey) || mode==='existing' && frame.nouns?.length) &&
    worlds.requestKeys.some(row=>row.family===family && row.name===key &&
      !row.values.length && row.head.split('+').some(type=>type==='candidate' || type==='span'));
}

function memberEffect(frame,predicate,worlds) {
  const {family,act,effectKey}=frame;
  const key=worlds.requestKeys.find(row=>row.family===family && row.name===effectKey && row.values.length);
  if (!key || !worlds.literalGrammar.licenses(family,act)) return;
  const values=new Map();
  for (const entry of worlds.lookup(keysOf(predicate).join(' '))) {
    const [role,license,owner,body]=entry;
    if (role!=='constraint' || (license!==act && license!=='*') || owner!==family || typeof body!=='string') continue;
    const [wire]=parse('@value w.request.constraint '+body);
    const read=name=>str(wire.attrs[name]?.[0]);
    const value=read('value');
    if (read('attribute')===effectKey && read('on')==='attribute' && read('phase')==='result' &&
        read('operator')==='eq' && !wire.attrs.want && !wire.attrs.open_value && wire.attrs.value?.length===1 &&
        key.values.includes(value)) {
      const grounded=ground(entry,predicate);
      if (grounded) values.set(value,grounded[3]);
    }
  }
  return values.size===1 ? values.values().next().value : undefined;
}

export function memberActionPackets(text,ts,quotes,worlds) {
  if (!worlds.memberActions?.length || !ts.length || ts.length>48) return [];
  const chars=Array.from(text);
  const keys=ts.map(([key])=>key);
  const phrase=(start,end)=>keys.slice(start,end).join(' ');
  const span=(start,end)=>chars.slice(ts[start][2],ts[end-1][3]).join('');
  const overlaps=(start,end)=>quotes.some(q=>q.start<ts[end-1][3] && q.end>ts[start][2]);
  const restricted=keys.some((key,i)=>{
    if (overlaps(i,i+1)) return false;
    if (worlds.negatives.has(key)) return true;
    return [1,2,3,4].some(n=>{
      if (i+n>keys.length || overlaps(i,i+n)) return false;
      const surface=phrase(i,i+n);
      return worlds.scopeGrammar.negatives.has(surface) || worlds.scopeGrammar.conditionals.has(surface);
    });
  });
  if (restricted) return [];
  const end=['.','!','?'].includes(keys.at(-1)) && !overlaps(ts.length-1,ts.length) ? ts.length-1 : ts.length;
  const packets=[];
  for (const frame of worlds.memberActions) {
    if (!licensedFrame(frame,worlds)) continue;
    const separators=(frame.separators ?? []).map(keysOf).filter(parts=>parts.length);
    if (!separators.length) continue;
    const suffixes=(frame.suffixes ?? []).map(keysOf).filter(parts=>parts.length);
    const nouns=(frame.nouns ?? []).map(keysOf).filter(parts=>parts.length);
    const typedCodes=new Set((worlds.instanceBindings ?? []).filter(({family})=>
      frame.mode==='existing' ? family===frame.family : frame.memberFamilies.includes(family))
      .map(({prefix})=>prefix));
    const excluded=new Set([...separators,...suffixes].flat());
    const packetTokens=(start,stop)=>{
      const list=[];
      for (let i=start;i<stop;i++) {
        const [key,raw,a]=ts[i];
        const quoted=quotes.find(q=>q.start===a);
        if (quoted) {
          const last=ts.findIndex(([, , ,end])=>end===quoted.end);
          if (last<i || last>=stop || !/[\p{L}\p{N}]/u.test(quoted.value)) return;
          list.push([key,quoted.value,'solo']);
          i=last;
          continue;
        }
        if (overlaps(i,i+1)) return;
        const typed=typedCodes.has(code.exec(key)?.[1]) || frame.numericId && decimalId.test(raw);
        const label=title.test(raw) && (initial.test(raw) || !worlds.evidenceVocabulary.grammar.has(key));
        const declaredAct=worlds.lookup(key).some(([role])=>role==='act');
        const kind=excluded.has(key) ? '' : typed ? 'solo' : label ? declaredAct ? 'solo' : 'word' : '';
        const gap=i===start ? '' : chars.slice(ts[i-1][3],a).join('');
        // Preserve the submitted whitespace inside a multiword written label.
        list.push([key,raw,kind,gap]);
      }
      return list;
    };
    const startsAdjunct=comma=>{
      if (keys[comma]!==',' || overlaps(comma,comma+2) || title.test(ts[comma+1][1]) ||
          separators.some(parts=>parts.every((key,i)=>keys[comma+1+i]===key))) return false;
      for (let markerEnd=comma+2;markerEnd<=Math.min(comma+6,end-1);markerEnd++) {
        if (overlaps(comma+1,markerEnd)) break;
        const cue=phrase(comma+1,markerEnd);
        if (worlds.lookup(cue).some(([role,act,slot])=>role==='marker' && act===frame.act &&
            ['replacement','means','tool','part'].includes(slot))) return true;
      }
      return false;
    };
    for (let start=0;start<Math.min(12,end);start++) {
      const lead=keys.slice(0,start).filter(key=>key!==',').join(' ');
      if (start && (overlaps(0,start) || !worlds.fillerPhrases.has(lead) && !worlds.literalGrammar.leads.has(lead))) continue;
      if (keys.at(-1)==='?' && !worlds.literalGrammar.leads.has(lead)) continue;
      for (let stop=start+1;stop<Math.min(start+9,end);stop++) {
        if (overlaps(start,stop)) continue;
        const predicate=span(start,stop);
        const licensed=frame.effectKey ? memberEffect(frame,predicate,worlds) : worlds.lookup(phrase(start,stop)).some(([role,act,mood])=>
          role==='act' && act===frame.act && (!mood || mood==='do'));
        if (!licensed) continue;
        const noun=nouns.find(parts=>parts.every((key,i)=>keys[stop+i]===key) && !overlaps(stop,stop+parts.length));
        if (nouns.length && !noun) continue;
        const first=stop+(noun?.length ?? 0);
        const comma=noun ? keys.findIndex((_,i)=>i>first && i<end-2 && startsAdjunct(i)) : -1;
        const stops=comma<0 ? [end] : [end,comma];
        for (const memberStop of stops) {
          const input=packetTokens(first,memberStop);
          if (!input) continue;
          packets.push({family:frame.family,act:frame.act,mode:frame.mode,key:frame.key,phase:frame.phase,
            predicate,separators,suffixes,input,
            ...(noun ? {noun:span(stop,first)} : {}),...(frame.effectKey ? {effectKey:frame.effectKey} : {}),
            ...(memberStop===comma ? {adjunct:span(comma+1,keys.length)} : {})});
        }
      }
    }
  }
  return packets;
}

export function memberActionReadings(text,proofs,worlds) {
  const alternatives=new Map();
  for (const proof of proofs ?? []) {
    const {family,act,mode,key,phase,predicate,members,noun,effectKey,adjunct}=proof;
    if (!predicate || !Array.isArray(members) || members.length<2 || members.length>8) continue;
    const frame=worlds.memberActions?.find(frame=>frame.family===family && frame.act===act &&
      frame.mode===mode && frame.key===key && frame.phase===phase && frame.effectKey===effectKey &&
      (!frame.nouns?.length || noun && frame.nouns.some(item=>keysOf(item).join(' ')===keysOf(noun).join(' '))) &&
      licensedFrame(frame,worlds));
    if (!frame) continue;
    const effect=effectKey && memberEffect(frame,predicate,worlds);
    if (effectKey && !effect) continue;
    const lines=[
      '@r1 w.request.request act='+quote(act)+' mood=do predicate='+quote(predicate)+' words='+quote(text),
      '@r1.t w.request.target request=$r1 family='+quote(family)+' mode='+mode+
        (mode==='new' ? ' determiner=indefinite' : ' determiner=definite fill=written ids='+members.map(quote).join(' ids='))+
        (noun ? ' family_words='+quote(noun) : ''),
      ...members.map((value,i)=>'@r1.m'+(i+1)+' w.request.constraint request=$r1 on=attribute attribute='+quote(key)+
        ' value='+quote(value)+' operator=eq phase='+phase)
    ];
    if (effect) lines.push('@r1.effect w.request.constraint request=$r1 '+effect);
    if (adjunct) lines.push('@r1.u1 w.request.unread request=$r1 text='+quote(adjunct));
    const sop=lines.join('\n');
    alternatives.set(sop,{sop,source:'member-action',...(adjunct ? {status:'partial'} : {})});
  }
  return [...alternatives.values()];
}
