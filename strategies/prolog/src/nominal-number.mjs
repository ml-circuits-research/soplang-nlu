import { consumeUnread } from './nominal-evidence.mjs';
import { literalRanges } from './evidence.mjs';
import { tokenize } from './lexicon.mjs';
import { parse } from './schema.mjs';

const first = (wire,key) => {
  const raw=wire.attrs[key]?.[0];
  return raw?.startsWith('"') ? JSON.parse(raw) : raw;
};
const fields=(wire,key)=>(wire.attrs[key] ?? []).map(raw=>raw.startsWith('"') ? JSON.parse(raw) : raw);
const phrase=text=>tokenize(text).map(t=>t.key).join(' ');
const standardKinds=new Set(['cardinal','ordinal','group']);
const phraseKinds=new Map([['cmp.more','increment'],['cmp.than','comparison']]);

export function compileNominalNumbers(facts) {
  const numbers=new Map();
  for (const wire of facts('w.lang.en.number')) {
    const kind=first(wire,'kind'), value=first(wire,'value'), text=first(wire,'text');
    if (text && standardKinds.has(kind) && /^\d+$/u.test(value ?? '')) numbers.set(phrase(text),{kind,value});
  }
  for (const wire of facts('w.lang.en.ordinal')) {
    const text=first(wire,'text'), value=first(wire,'value');
    if (text && fields(wire,'in').includes('acts') && /^-?\d+$/u.test(value ?? '')) {
      const key=phrase(text);
      if (key && !numbers.has(key)) numbers.set(key,{kind:'ordinal',value});
    }
  }
  const unspecified=new Set(facts('w.lang.en.phrase').filter(w=>first(w,'name')==='quant.some')
    .flatMap(w=>fields(w,'item').map(phrase)));
  const articles=new Set(facts('w.lang.en.det').filter(w=>first(w,'kind')==='article')
    .flatMap(w=>fields(w,'text').map(phrase)));
  for (const wire of facts('core.word')) {
    if (!fields(wire,'of').includes('w.lang.en.number.text')) continue;
    const [meaning,...extra]=fields(wire,'means');
    const number=!extra.length && meaning && numbers.get(phrase(meaning));
    if (number?.kind!=='group' && number?.kind!=='cardinal') continue;
    const langs=fields(wire,'lang');
    if (langs.length && !langs.some(lang=>/^en(?:[-_]|$)/iu.test(lang))) continue;
    for (const text of fields(wire,'text').map(phrase)) {
      if (!numbers.has(text) && !unspecified.has(text) && !articles.has(text)) numbers.set(text,number);
    }
  }
  for (const wire of facts('w.lang.en.phrase')) {
    const kind=phraseKinds.get(first(wire,'name'));
    if (!kind) continue;
    for (const text of fields(wire,'item').map(phrase)) {
      if (text && !numbers.has(text)) numbers.set(text,{kind});
    }
  }
  for (const wire of facts('w.lang.en.det')) {
    if (first(wire,'meaning')!=='one-more' || first(wire,'number')!=='sg') continue;
    for (const text of fields(wire,'text').map(phrase)) {
      if (text && !numbers.has(text)) numbers.set(text,{kind:'additive',value:'1'});
    }
  }
  // These give a quantity without fixing the number of members.
  for (const cue of facts('w.lang.en.cue')) {
    if (first(cue,'on')!=='count' || first(cue,'takes')!=='none' || !first(cue,'amount')) continue;
    for (const raw of fields(cue,'lead')) {
      const term=phrase(raw);
      if (!numbers.has(term)) numbers.set(term,{kind:'qualitative'});
    }
  }
  return numbers;
}

function endingAt(input,after,numbers,numberOf,kinds) {
  for (let start=Math.max(0,after-8);start<after;start++) {
    const form=input.slice(start,after).map(t=>t.key).join(' ');
    const entry=after===start+1 ? numberOf(input[start]) : numbers.get(form);
    if (kinds.has(entry?.kind)) return {i:start,number:entry};
  }
}

const amounts=new Set([...standardKinds,'additive','qualitative']);
const increment=new Set(['increment']);
const cardinal=new Set(['cardinal']);
const ordinal=new Set(['ordinal']);
const comparison=new Set(['comparison']);

function qualifierBefore(text,input,position,numbers,numberOf,grounded) {
  let after=position;
  while (after>0) {
    const modifiersAt=grounded.get(input[after-1].end);
    if (modifiersAt?.conflict || modifiersAt?.starts.length>1) return;
    if (modifiersAt?.starts.length===1) after=modifiersAt.starts[0];
    else break;
  }
  const additive=endingAt(input,after,numbers,numberOf,increment);
  let match=endingAt(input,after,numbers,numberOf,amounts);
  if (additive) {
    const count=endingAt(input,additive.i,numbers,numberOf,cardinal);
    if (count && Number(count.number.value)>0) {
      match={i:count.i,number:{kind:'additive',value:count.number.value}};
    }
  }
  if (!match) return;
  const {i,number}=match;
  const order=number.kind==='cardinal' && Number(number.value)>1 && endingAt(input,i,numbers,numberOf,ordinal);
  // The attested group endpoints are the first N and the last N. A different
  // ordinal next to a count may describe a numbered batch, not its endpoint.
  if (order && ![1,-1].includes(Number(order.number.value))) return;
  const begin=order ? order.i : i;
  if (amounts.has(numberOf(input[begin-1])?.kind) || ['.',',','-','+','/'].includes(input[begin-1]?.key) &&
      (numberOf(input[begin-2]) || ['-','+'].includes(input[begin-1].key))) return;
  const start=input[begin].start, end=input[after-1].end;
  return {start,end,surface:text.slice(start,end),number,position,
    order:order && {value:order.number.value,countWords:text.slice(input[i].start,end)}};
}

function groundedModifiers(wires,input,text,scope,target,numberOf) {
  const request=first(target,'request'), phase=first(target,'mode')==='new' ? 'result' : 'selector';
  const owned=wires.filter(w=>w.type==='w.request.constraint' && first(w,'request')===request);
  const grounded=new Map();
  for (const wire of owned) {
    const op=first(wire,'operator') ?? 'eq', key=first(wire,'attribute');
    if (!key || !['eq','degree'].includes(op) || op==='eq' && first(wire,'on')!=='attribute' ||
      (first(wire,'phase') ?? 'result')!==phase || wire.attrs.value?.length!==1 || wire.attrs.want ||
      wire.attrs.key_words || wire.attrs.of || wire.attrs.thing || first(wire,'open_value')==='true') continue;
    const evidence=first(wire,'words') ?? first(wire,'value');
    const spans=literalRanges(text,evidence,...scope);
    if (spans.length!==1) continue;
    const [[start,end]]=spans;
    const firstToken=input.findIndex(token=>token.start===start);
    const lastToken=input.findIndex(token=>token.end===end);
    if (firstToken<0 || lastToken<firstToken ||
      input.slice(firstToken,lastToken+1).some(token=>numberOf(token) || !/^\p{L}[\p{L}\p{M}]*$/u.test(token.key))) continue;
    const evidenceAt=grounded.get(end) ?? {starts:[],conflict:false};
    evidenceAt.starts.push(firstToken);
    evidenceAt.conflict ||= owned.filter(w=>first(w,'attribute')===key).length>1;
    grounded.set(end,evidenceAt);
  }
  return grounded;
}

export function nominalNumberReading(text,candidate,numbers,quotes=[],worlds={}) {
  const input=tokenize(text);
  const numberOf = token => token && (numbers.get(token.key) ??
    (/^\d{1,8}$/u.test(token.key) ? {kind:'cardinal',value:token.key} : undefined));
  if (!input.length) return;
  const wires=parse(candidate.sop);
  const targets=wires.filter(w=>w.type==='w.request.target'), requests=wires.filter(w=>w.type==='w.request.request');
  if (targets.length!==1 || requests.length!==1) return;
  const [target]=targets, [holder]=requests;
  if (target.attrs.ordinal || target.attrs.quantifier) return;
  const head=first(target,'sort_words') ?? first(target,'family_words') ?? first(target,'sort');
  if (!head || !/\p{L}/u.test(head)) return;
  const keys=tokenize(head).map(t=>t.key);
  const words=first(holder,'words');
  const scopes=words ? literalRanges(text,words) : [[0,text.length]];
  if (scopes.length!==1) return;
  const [[left,right]]=scopes;
  const quoteRanges=quotes.map(q=>[q.start,q.end].map(offset=>Array.from(text).slice(0,offset).join('').length));
  const inQuotes=(start,end)=>quoteRanges.some(([a,b])=>a<end && b>start);
  const headEnd=position=>input[position+keys.length-1].end;
  let positions=input.flatMap(({start},i)=>start>=left && keys.every((key,j)=>input[i+j]?.key===key) &&
    headEnd(i)<=right && !inQuotes(start,headEnd(i)) ? [i] : []);
  if (positions.length>1) {
    // A uniquely grounded result can repeat the target noun as its payload.
    const payloads=wires.filter(w=>w.type==='w.request.constraint' && first(w,'request')==='$'+holder.id &&
      (first(w,'phase') ?? 'result')==='result').flatMap(w=>['words','value'].flatMap(key=>{
        const ranges=literalRanges(text,first(w,key),left,right);
        return ranges.length===1 ? ranges : [];
      }));
    positions=positions.filter(i=>!payloads.some(([a,b])=>a<=input[i].start && headEnd(i)<=b));
  }
  const grounded=groundedModifiers(wires,input,text,[left,right],target,numberOf);
  const qualified=positions.map(i=>qualifierBefore(text,input,i,numbers,numberOf,grounded))
    .filter(q=>q && q.start>=left && !inQuotes(q.start,headEnd(q.position)));
  // A later number may belong to a payload or a second object. An earlier
  // plausible head or another qualified occurrence leaves the binding open.
  if (qualified.length!==1 || qualified[0].position!==positions[0]) return;
  const [{start,end,surface,number,order}]=qualified;
  const ordered=order || number.kind==='ordinal';
  if ((target.attrs.count || target.attrs.quantity || target.attrs.count_words) && (!order ||
    target.attrs.count && Number(first(target,'count'))!==Number(number.value) ||
    ['quantity','count_words'].some(key=>target.attrs[key] && phrase(first(target,key))!==phrase(order.countWords)))) return;
  if (order) {
    if (first(target,'mode')!=='existing' || !worlds.nominalInflection) return;
    const noun=phrase(head), lookup=lemma=>[
      ...worlds.lookup(lemma),...worlds.frameTargets(lemma),
    ];
    const invariant=worlds.universalAgreement.invariant.has(keys.at(-1));
    if (!worlds.nominalInflection(noun,lookup).length &&
        !(invariant && lookup(noun).some(([role])=>role==='target'))) return;
  }
  if (ordered && (amounts.has(numbers.get(phrase(head))?.kind) ||
    ['name','ids'].some(key=>fields(target,key).some(written=>
      literalRanges(text,written,left,right).some(([a,b])=>a<end && b>start))))) return;
  if (number.kind==='qualitative') {
    if (first(target,'mode')!=='new' || first(holder,'act')!=='make' ||
        ![undefined,'do'].includes(first(holder,'mood')) || holder.attrs.polarity) return;
    const prefix=text.slice(left,start).trim();
    const predicate=first(holder,'predicate');
    // A prefixed quantity must be the direct argument of the command.
    if (prefix && (!predicate || !(' '+phrase(prefix)).endsWith(' '+phrase(predicate)))) return;
  }
  if (number.kind==='additive') {
    if (first(target,'mode')!=='new') return;
    const afterNoun=input.slice(positions[0]+keys.length).filter(token=>token.end<=right);
    if (afterNoun.some(({end},i)=>{
      const matched=endingAt(afterNoun,i+1,numbers,numberOf,comparison);
      return matched && !inQuotes(afterNoun[matched.i].start,end);
    })) return;
  }
  if (wires.some(w=>w.type==='w.request.constraint' && ['on','words','value'].some(k=>
    (k==='on' && first(w,k)==='count') || !order && first(w,k)===surface))) return;
  const additions=number.kind==='ordinal' ? {ordinal:[JSON.stringify(surface)]}
    : {...(number.kind==='qualitative' ? {} : {count:[String(number.value)]}),
      quantity:[JSON.stringify(order?.countWords ?? surface)],count_words:[JSON.stringify(order?.countWords ?? surface)],
      ...(order ? {ordinal:[JSON.stringify(surface)]} : {})};
  let consumeFrom=start;
  const split=candidate.source==='split-target-frame';
  if (ordered || split && number.kind==='cardinal') {
    const before=input.findIndex(token=>token.start===start);
    let determiner;
    for (let i=Math.max(0,before-4);i<before;i++) {
      const mode=worlds.determiners?.[input.slice(i,before).map(token=>token.key).join(' ')];
      if (!['definite','demonstrative','possessive'].includes(mode) || input[i].start<left || inQuotes(input[i].start,start)) continue;
      determiner={mode,start:input[i].start};
      break;
    }
    // A relative endpoint needs its own nominal boundary. Its final word
    // alone does not select the endpoint in compound order descriptions.
    const predicate=first(holder,'predicate');
    const relative=Number(order?.value ?? number.value)<0;
    if ((relative || order) && !determiner && !literalRanges(text,predicate,left,start)
      .some(([,finish])=>!text.slice(finish,start).trim())) return;
    const onlyQuantityDeterminer=number.kind==='cardinal' && fields(target,'determiner').every(mode=>mode==='quantified');
    if ((relative || order || split) && determiner &&
        first(target,'mode')==='existing' && (!target.attrs.determiner || onlyQuantityDeterminer)) {
      additions.determiner=[determiner.mode];
      consumeFrom=determiner.start;
    }
  }
  const lines=[];
  for (const wire of consumeUnread(wires,text,consumeFrom,end)) {
    const attrs=wire===target ? {...wire.attrs,...additions} : wire.attrs;
    lines.push(['@'+wire.id,wire.type,...Object.entries(attrs).flatMap(([k,vs])=>vs.map(v=>k+'='+v))].join(' '));
  }
  return {sop:lines.join('\n'),source:'nominal-number',status:candidate.status};
}
