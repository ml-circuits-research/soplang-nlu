import { tokens } from './lexicon.mjs';
import { quotedSpans } from './literal-roles.mjs';

const sentence=new Set(['.','?','!','。','？','！']);
const courtesyEnd=new Set(['.','!','。','！']);
const word=/^[\p{L}\p{N}\p{M}_]+$/u;
const decode=value=>value?.startsWith('"') ? JSON.parse(value) : value;
const keyOf=key=>key==='’' ? "'" : key;

export function politeBody(text,ts,politeness,minWords,leading) {
  if (ts.length<minWords || ts.length>14 || ts.some(([term])=>['?','？'].includes(term))) return;
  const chars=Array.from(text);
  const phrase=(start,end)=>ts.slice(start,end).map(([term])=>term).join(' ');
  const span=(start,end)=>chars.slice(ts[start][2],ts[end-1][3]).join('');
  let start=0, end=ts.length;
  while (courtesyEnd.has(ts[end-1]?.[0])) end--;
  const fillers=[];
  for (let width=Math.min(end-minWords,5);width>0;width--) {
    const opening=phrase(0,width);
    if (!politeness.has(opening) && !leading?.has(opening)) continue;
    fillers.push(span(0,width));
    start=width+Number(ts[width]?.[0]===',');
    break;
  }
  for (let width=Math.min(end-start-minWords,5);width>0;width--) {
    if (!politeness.has(phrase(end-width,end))) continue;
    fillers.push(span(end-width,end));
    end-=width;
    end-=Number(ts[end-1]?.[0]===',');
    break;
  }
  if (end-start>=minWords) return {start,end,fillers,phrase,span};
}

export function compileTrailingDiscourse(facts) {
  const index=new Map();
  for (const wire of facts('pro.reader.trailing_discourse')) {
    for (const raw of wire.attrs.text ?? []) {
      const surface=tokens(decode(raw)).map(([key])=>keyOf(key));
      if (!surface.length || !surface.every((key,i)=>word.test(key) ||
          [",","'"].includes(key) && word.test(surface[i-1] ?? '') && word.test(surface[i+1] ?? ''))) continue;
      const head=surface.at(-1);
      const entries=index.get(head) ?? new Map();
      if (!index.has(head)) index.set(head,entries);
      entries.set(surface.join(' '),surface);
    }
  }
  return new Map([...index].map(([head,entries])=>[head,[...entries.values()]]));
}

export function discourseBody(text,index) {
  if (!index?.size) return;
  const chars=Array.from(text), quotes=quotedSpans(text);
  const ts=tokens(text).map(([key,,start,end])=>({
    key:keyOf(key),start,end,hidden:quotes.some(q=>q.start<end && q.end>start),
  }));
  if (ts.some(({key,start,end,hidden})=>!hidden &&
    (/^["“”‘]$/u.test(key) || key==="'" && !(word.test(chars[start-1] ?? '') && word.test(chars[end] ?? ''))))) return;
  let cursor=ts.length, omitted;
  while (cursor>1) {
    const last=ts[cursor-1];
    const end=courtesyEnd.has(last.key) && !last.hidden ? cursor-1 : cursor;
    const matches=(index.get(ts[end-1]?.key) ?? []).flatMap(surface=>{
      const start=end-surface.length;
      const boundary=ts[start-1], first=ts[start];
      if (!boundary || !first || boundary.hidden || !sentence.has(boundary.key) ||
          boundary.end===first.start || !surface.every((key,i)=>ts[start+i].key===key && !ts[start+i].hidden)) return [];
      return [start];
    });
    if (matches.length!==1) break;
    [omitted]=matches;
    cursor=omitted;
  }
  if (omitted===undefined || !ts.slice(0,cursor).some(({key,hidden})=>!hidden && word.test(key))) return;
  const start=chars.slice(0,ts[0].start).join('').length;
  const end=chars.slice(0,ts[cursor-1].end).join('').length;
  return {text:text.slice(start,end),start,end,suffix:text.slice(end).trim()};
}

export function compileDiscourseEdges(facts,discourse) {
  const rules={before:new Map(),after:new Map()};
  const add=(position,text)=>{
    const keys=tokens(text).map(([k])=>keyOf(k));
    if (!keys.length) return;
    const head=position==='before' ? keys[0] : keys.at(-1);
    const forms=rules[position].get(head) ?? [];
    forms.push(keys);
    rules[position].set(head,forms);
  };
  for (const {text,class:kind} of discourse) {
    if (kind!=='politeness') continue;
    add('before',text);
    add('after',text);
  }
  for (const w of facts('pro.reader.discourse_edge')) {
    const position=decode(w.attrs.position?.[0]);
    if (Object.hasOwn(rules,position)) for (const v of w.attrs.text ?? []) add(position,decode(v));
  }
  return rules;
}

export function detachedDiscourse(text,rules) {
  const ts=tokens(text);
  if (ts.length<3) return;
  const chars=Array.from(text), span=(a,b)=>chars.slice(ts[a][2],ts[b-1][3]).join('');
  const boundary=new Set([',',':','—','–']);
  const matches=(i,keys)=>i>=0 && keys.every((k,j)=>keyOf(ts[i+j]?.[0])===k);
  const visibleEdge=(a,b)=>!quotedSpans(text).some(q=>q.start<ts[b-1][3] && q.end>ts[a][2]);
  let start=0,end=ts.length;
  const extras=[];
  const leading=(rules.before.get(keyOf(ts[0][0])) ?? []).filter(keys=>
    boundary.has(ts[keys.length]?.[0]) && matches(0,keys) && visibleEdge(0,keys.length+1));
  if (leading.length) {
    const size=Math.max(...leading.map(keys=>keys.length));
    extras.push(span(0,size));start=size+1;
  }
  const stop=end-(courtesyEnd.has(ts.at(-1)[0]) ? 1 : 0);
  const trailing=(rules.after.get(keyOf(ts[stop-1]?.[0])) ?? []).filter(keys=>{
    const i=stop-keys.length;
    return i>start && boundary.has(ts[i-1][0]) && matches(i,keys) && visibleEdge(i-1,stop);
  });
  if (trailing.length) {
    const size=Math.max(...trailing.map(keys=>keys.length));
    extras.push(span(stop-size,stop));end=stop-size-1;
  }
  if (!extras.length || end<=start || !ts.slice(start,end).some(([key])=>word.test(key))) return;
  return {body:span(start,end),extras};
}
