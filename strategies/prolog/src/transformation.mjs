import {nativeInventory} from './native-inventory.mjs';
import { tokens } from './lexicon.mjs';

const strings=(wire,key)=>(wire.attrs[key] ?? []).map(value=>value.startsWith('"') ? JSON.parse(value) : value);
const field=(wire,key)=>strings(wire,key)[0];
const normal=text=>tokens(text).map(([term])=>term).join(' ');
const quote=JSON.stringify;
const atom=/^[\p{L}_][\p{L}\p{M}\p{N}_.-]*$/u;
const nominal=/^[\p{L}\p{M}_]+$/u;
const terminal=new Set(['.','!']);
const existingDeterminers=new Set(['definite','demonstrative','possessive']);
const valueDeterminers=new Set(['indefinite','definite']);

export function compileTransformations(facts,requestKeys,words) {
  const inventories=new Map(), heads=new Map();
  function inventory(type) {
    if (!inventories.has(type)) inventories.set(type,nativeInventory(facts,type,words));
    return inventories.get(type);
  }
  for (const wire of facts('pro.reader.transformation')) {
    const [family,act,attribute,ownerType,valueType]=
      ['family','act','attribute','owner_type','value_type'].map(key=>field(wire,key));
    const keys=requestKeys.filter(key=>key.family===family && key.name===attribute);
    if (!act || !keys.length) continue;
    const ownerWords=new Set(strings(wire,'owner').map(normal).filter(Boolean));
    const ownerKinds=ownerType ? inventory(ownerType) : undefined;
    if (!ownerWords.size && !ownerKinds?.size) continue;
    const valueHeads=strings(wire,'value_head').map(normal).filter(Boolean);
    let values;
    if (valueType || keys.every(key=>key.values.length)) {
      if (keys.some(key=>!key.head.split('+').includes('candidate') && !key.head.split('+').includes('class'))) continue;
      const source=valueType ? inventory(valueType) : keys[0].values.map(name=>[normal(name.replaceAll('_',' ')),[name]]);
      values=new Map([...source].map(([text,names])=>
        [text,new Set([...names].filter(name=>keys.every(key=>!key.values.length || key.values.includes(name))))]));
      if (![...values.values()].some(matches=>matches.size)) continue;
    } else if (!valueHeads.length || keys.some(key=>key.head!=='span' || key.values.length)) continue;
    const markers=strings(wire,'marker').map(normal).filter(Boolean);
    if (!markers.length) continue;
    const extent=new Set(strings(wire,'extent').map(normal).filter(Boolean));
    for (const predicate of strings(wire,'predicate').map(normal).filter(Boolean)) {
      const entries=heads.get(predicate) ?? [];
      entries.push({family,act,attribute,ownerWords,ownerKinds,valueHeads,values,markers,extent,
        allowUnreadModifier:Boolean(valueType)});
      heads.set(predicate,entries);
    }
  }
  return heads;
}

function trimDeterminer(start,end,phrase,worlds,allowed) {
  for (let i=Math.min(start+5,end-1);i>start;i--) {
    const determiner=worlds.determiners[phrase(start,i)];
    if (allowed.has(determiner)) return {next:i,determiner};
    if (determiner) return;
  }
  return {next:start};
}

function owner(frame,start,end,phrase,span,worlds) {
  const det=trimDeterminer(start,end,phrase,worlds,existingDeterminers);
  if (!det) return;
  let first=det.next;
  for (let i=end-1;i>first;i--) {
    if (!frame.extent.has(phrase(first,i))) continue;
    first=i;
    break;
  }
  const head=phrase(first,end), words=span(start,end);
  const kinds=frame.ownerKinds?.get(head);
  if (frame.ownerWords.has(head)) return {fill:'context',determiner:det.determiner,words};
  if (kinds?.size===1) return {fill:'description',determiner:det.determiner,words,sort:[...kinds][0],
    sortWords:span(first,end)};
}

function effect(frame,start,end,phrase,span,worlds) {
  const det=trimDeterminer(start,end,phrase,worlds,valueDeterminers);
  if (!det) return;
  const first=det.next;
  if (!frame.values) {
    const words=phrase(first,end);
    if (!frame.valueHeads.some(head=>words===head || words.endsWith(' '+head))) return;
    return {value:span(first,end),words:span(start,end)};
  }
  for (let i=first;i<end;i++) {
    const options=frame.values.get(phrase(i,end));
    if (!options?.size) continue;
    if (options.size!==1 || i-first>3 || i>first && !frame.allowUnreadModifier) return;
    for (let j=first;j<i;j++) {
      for (let stop=j+1;stop<=i;stop++) {
        const modifier=phrase(j,stop);
        if (frame.values.get(modifier)?.size || worlds.determiners[modifier] ||
          worlds.lookup(modifier).some(([role])=>role==='marker')) return;
      }
    }
    return {value:[...options][0],canonical:true,words:span(i===first ? start : i,end),
      unread:i>first ? span(first,i) : undefined};
  }
}

function proposal(text,head,frame,target,result,lead) {
  const value=result.canonical && atom.test(result.value) ? result.value : quote(result.value);
  const lines=[
    '@r1 w.request.request act='+quote(frame.act)+' mood=do predicate='+quote(head)+' words='+quote(text),
    '@r1.t w.request.target request=$r1 family='+quote(frame.family)+' mode=existing fill='+target.fill+
      (target.determiner ? ' determiner='+target.determiner : '')+
      (target.sort ? ' sort='+quote(target.sort)+' description='+quote(target.words)+
        (target.sortWords!==target.sort ? ' sort_words='+quote(target.sortWords) : '') : ' family_words='+quote(target.words)),
    '@r1.l w.request.lookup request=$r1 target=$r1.t key=thing from=page',
    '@r1.c1 w.request.constraint request=$r1 on=attribute attribute='+quote(frame.attribute)+
      ' value='+value+' operator=eq phase=result'+(result.words!==result.value ? ' words='+quote(result.words) : ''),
  ];
  if (lead) lines.push('@f1 w.request.filler text='+quote(lead));
  if (result.unread) lines.push('@r1.u1 w.request.unread request=$r1 text='+quote(result.unread));
  return {sop:lines.join('\n'),source:'transformation',status:result.unread ? 'partial' : 'matched'};
}

export function transformationReadings(text,ts,quotes,worlds) {
  if (!worlds.transformations?.size) return [];
  const chars=Array.from(text), terms=ts.map(([term])=>term.replaceAll('’',"'"));
  const phrase=(a,b)=>terms.slice(a,b).join(' ');
  const span=(a,b)=>chars.slice(ts[a][2],ts[b-1][3]).join('');
  let stop=ts.length;
  while (terminal.has(terms[stop-1])) stop--;
  const safe=(a,b)=>{
    if (quotes.some(q=>q.start<ts[b-1][3] && ts[a][2]<q.end)) return false;
    for (let i=a;i<b;i++) {
      if (!nominal.test(terms[i]) && !(terms[i]==='-' && i>a && i+1<b &&
        ts[i-1][3]===ts[i][2] && ts[i][3]===ts[i+1][2])) return false;
      for (let end=i+1;end<=Math.min(b,i+5);end++) {
        const term=phrase(i,end);
        if (worlds.negatives.has(term) || worlds.scopeGrammar.negatives.has(term) ||
          worlds.scopeGrammar.conditionals.has(term) || worlds.joiners[term]) return false;
      }
    }
    return true;
  };
  const outputs=new Map();
  for (let first=0;first<Math.min(12,stop-3);first++) {
    const lead=terms.slice(0,first).filter(term=>term!==',').join(' ');
    if (lead && !worlds.literalGrammar.leads.has(lead) && !worlds.fillerPhrases.has(lead)) continue;
    for (let next=first+1;next<Math.min(first+8,stop-2);next++) {
      const frames=worlds.transformations.get(phrase(first,next)) ?? [];
      if (!frames.length || !safe(first,stop)) continue;
      for (const frame of frames) {
        if (!worlds.literalGrammar.licenses(frame.family,frame.act)) continue;
        const readings=new Map();
        for (const marker of frame.markers) {
          const length=marker.split(' ').length;
          for (let from=next+1;from+length<stop;from++) {
            if (phrase(from,from+length)!==marker) continue;
            const target=owner(frame,next,from,phrase,span,worlds);
            if (!target) continue;
            const result=effect(frame,from+length,stop,phrase,span,worlds);
            if (!result) continue;
            const candidate=proposal(text,span(first,next),frame,target,result,first ? span(0,first) : undefined);
            readings.set(candidate.sop,candidate);
          }
        }
        if (readings.size===1) for (const [sop,candidate] of readings) outputs.set(sop,candidate);
      }
    }
  }
  return [...outputs.values()];
}
