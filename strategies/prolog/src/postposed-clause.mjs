import { analyse, morphOf, parse, serialize } from './knowledge.mjs';
import { literalField, literalRanges } from './evidence.mjs';
import { quotedSpans } from './literal-roles.mjs';
import { tokens } from './lexicon.mjs';
import { nativeInventory } from './native-inventory.mjs';
import { consumeUnread } from './nominal-evidence.mjs';

const requestType='w.request.request';
const targetType='w.request.target';
const constraintType='w.request.constraint';
const unreadType='w.request.unread';
const fillerType='w.request.filler';
const quote=JSON.stringify;
const decode=value=>value?.startsWith('"') ? JSON.parse(value) : value;
const fields=(wire,key)=>(wire.attrs[key] ?? []).map(decode);
const get=(wire,key)=>fields(wire,key)[0];
const shape=text=>tokens(text ?? '').map(([key])=>key==='’' ? "'" : key).join(' ');
const word=/^[\p{L}\p{M}\p{N}_]+$/u;

export function compilePostposedClauses(facts,requestKeys,words,hasVerb) {
  const finite=new Set(facts('w.lang.en.irregular_form').filter(wire=>['past','third'].includes(get(wire,'vform')))
    .flatMap(wire=>fields(wire,'form').map(shape)));
  for (const wire of facts('w.lang.en.aux')) for (const form of fields(wire,'text').map(shape)) finite.add(form);
  const speakers=new Set(facts('w.lang.en.pron').filter(wire=>get(wire,'person')==='1' &&
    fields(wire,'case').includes('subject')).flatMap(wire=>fields(wire,'text').map(shape)));
  const reported=new Set(words.filter(wire=>fields(wire,'means').includes('w.dialogue.assumption.said'))
    .flatMap(wire=>fields(wire,'text').map(shape)).filter(form=>finite.has(form)));
  const bindings=[];
  const inventories=new Map();
  for (const wire of facts('pro.reader.postposed_clause')) {
    const [kind,family,attribute,reasonKey,valueType]=
      ['kind','family','attribute','reason_key','value_type'].map(key=>get(wire,key));
    const markers=fields(wire,'text').map(shape).filter(Boolean);
    const catalog=requestKeys.filter(key=>key.family===family);
    const operand=catalog.find(key=>key.name===attribute);
    if (!markers.length || !operand || !['causal','report'].includes(kind)) continue;
    if (kind==='report' && (operand.values.length || !operand.head.split('+').includes('span'))) continue;
    if (kind==='causal' && !catalog.some(key=>key.name===reasonKey && !key.values.length &&
        key.head.split('+').includes('span'))) continue;
    if (operand.values.length && valueType && !inventories.has(valueType)) {
      inventories.set(valueType,nativeInventory(facts,valueType,words));
    }
    bindings.push({kind,family,attribute,reasonKey,operand,markers,
      inventory:inventories.get(valueType) ?? new Map()});
  }
  const types={cls:'w.lang.en.class',ending:'w.lang.en.ending',irregular:'w.lang.en.irregular_form'};
  const morphology=morphOf({ofType:facts},{types});
  const checked=new Map();
  const finiteVerb=form=>{
    if (finite.has(form)) return true;
    if (!checked.has(form)) checked.set(form,analyse(morphology,form).some(row=>
      row.exact && ['third','past'].includes(row.features.vform) && hasVerb(row.lemma)));
    return checked.get(form);
  };
  const markers=[...new Set(bindings.filter(b=>b.kind==='causal').flatMap(b=>b.markers))];
  return {bindings,finiteVerb,speakers,reported,markers};
}

function actual(text,words,left=0,right=text.length) {
  const places=literalRanges(text,words,left,right);
  return places.length===1 ? places[0] : undefined;
}

function clauseAfter(text,scope,binding,grammar,worlds) {
  const [left,right]=scope;
  const chars=Array.from(text);
  const offsets=chars.reduce((list,char)=>{list.push(list.at(-1)+char.length);return list;},[0]);
  const all=tokens(text).map(([key,raw,start,end])=>({key,raw,start:offsets[start],end:offsets[end]}));
  const quotes=quotedSpans(text).map(q=>[offsets[q.start],offsets[q.end]]);
  const hidden=token=>quotes.some(([a,b])=>a<token.end && b>token.start);
  const input=all.filter(token=>token.start>=left && token.end<=right);
  if (input.some(token=>!hidden(token) && (/^["“”‘]$/u.test(token.key) || token.key==="'" &&
     !(word.test(text.slice(token.start-1,token.start)) && word.test(text.slice(token.end,token.end+1)))))) return [];
  let after=input.length;
  while (['.','!'].includes(input[after-1]?.key)) after--;
  if (after>36 || after<4 || input.some(token=>token.key==='?' && !hidden(token))) return [];
  const form=(start,end)=>shape(text.slice(input[start].start,input[end-1].end));
  const polite=new Set(worlds.discourse.filter(({class:kind})=>kind==='politeness'||kind==='interjection').map(({text})=>text));
  let courtesy;
  for (let i=Math.max(1,after-6);i<after-1;i++) {
    if (input[i].key!==',' || hidden(input[i]) || !polite.has(form(i+1,after))) continue;
    courtesy=text.slice(input[i+1].start,input[after-1].end);
    after=i;
    break;
  }
  const readings=[];
  for (let i=1;i<after;i++) for (const marker of binding.markers) {
    const start=i+marker.split(' ').length;
    if (start>=after || form(i,start)!==marker || input.slice(i,after).some(hidden)) continue;
    if (input.slice(start,after).some(({key})=>!word.test(key) || worlds.joiners[key] ||
        worlds.scopeGrammar.conditionals.has(key))) continue;
    const clause=(binding.kind==='report')
      ? [...grammar.speakers].some(speaker=>{
        const end=start+speaker.split(' ').length;
        return end<after && form(start,end)===speaker && grammar.reported.has(form(end,after));
      })
      : input.slice(start+1,after).some((token,j)=>{
        const predicate=start+j+1, subject=form(start,predicate);
        return (worlds.scopeGrammar.subjects.has(subject) ||
        predicate>start+1 && Object.hasOwn(worlds.determiners,input[start].key) &&
          input.slice(start+1,predicate).every(({key})=>!worlds.evidenceVocabulary.grammar.has(key))) &&
          grammar.finiteVerb(token.key);
      });
    if (!clause) continue;
    const split=input[i].start, bodyEnd=input[i-1].key===',' ? input[i-1].start : split;
    readings.push({split,bodyEnd,end:input[after-1].end,marker:text.slice(split,input[start-1].end),
      clause:text.slice(input[start].start,input[after-1].end),courtesy});
  }
  return readings.filter(reading=>!readings.some(other=>other.split<reading.split &&
    other.end===reading.end && other.clause===reading.clause));
}

export function postposedCause(text,worlds) {
  const grammar=worlds.postposedClauses, written=' '+shape(text)+' ';
  const markers=grammar.markers.filter(marker=>written.includes(' '+marker+' '));
  if (!markers.length) return;
  const binding={kind:'causal',markers};
  const tails=clauseAfter(text,[0,text.length],binding,grammar,worlds);
  if (!tails.length) for (const dash of text.matchAll(/[—–]/gu)) {
    const aside=text.slice(dash.index+1).trim(), input=tokens(aside);
    if (worlds.determiners[input[0]?.[0]]!=='definite' || input.length<3 ||
        input.some(([key],i)=>!word.test(key) && !(i===input.length-1 && ['.','!'].includes(key)) ||
          worlds.scopeGrammar.modals.has(key) || worlds.scopeGrammar.conditionals.has(key) ||
          ['coordination','sequence','condition','addition'].includes(worlds.joiners[key]))) continue;
    for (const tail of clauseAfter(text,[0,dash.index],binding,grammar,worlds)) {
      if (!tail.courtesy && !text.slice(tail.end,dash.index).trim()) {
        tails.push({...tail,aside,textEnd:text.trimEnd().length});
      }
    }
  }
  if (tails.length!==1) return;
  const [tail]=tails;
  return {...tail,body:text.slice(0,tail.bodyEnd).trimEnd()};
}

export function withPostposedCause(text,tail,candidate,worlds) {
  const wires=parse(candidate.sop), requests=wires.filter(w=>w.type===requestType);
  const request=requests.at(-1), owner='$'+request?.id;
  if (!request || !get(request,'predicate') || ![undefined,'do'].includes(get(request,'mood')) ||
      request.attrs.polarity) return;
  const targets=wires.filter(w=>w.type===targetType && get(w,'request')===owner);
  if (targets.length!==1) return;
  const scope=get(request,'words') ?? (requests.length===1 ? tail.body : undefined);
  const location=scope && actual(tail.body,scope);
  if (!location || location[1]!==tail.body.length) return;
  const effects=wires.filter(w=>w.type===constraintType && get(w,'request')===owner && get(w,'phase')==='result');
  if (!effects.length && wires.some(w=>w.type===unreadType && get(w,'request')===owner)) return;
  const keys=new Set(worlds.postposedClauses.bindings.filter(binding=>binding.kind==='causal' &&
    binding.family===get(targets[0],'family') && binding.markers.includes(shape(tail.marker)) &&
    effects.some(w=>get(w,'attribute')===binding.attribute) &&
    !effects.some(w=>get(w,'attribute')===binding.reasonKey)).map(binding=>binding.reasonKey));
  request.attrs.words=[quote(text.slice(location[0],tail.textEnd ?? tail.end))];
  let id=request.id+'.cause';
  while (wires.some(w=>w.id===id || w.id.startsWith(id+'.'))) id+='_';
  if (keys.size===1) {
    wires.push({id,type:constraintType,attrs:{request:[owner],on:['attribute'],attribute:[...keys],
      value:[quote(tail.clause)],key_words:[quote(tail.marker)],operator:['eq'],phase:['result']}});
  } else {
    wires.push({id,type:unreadType,attrs:{request:[owner],text:[quote(text.slice(tail.split,tail.end))],
      note:[quote('stated reason')]}});
  }
  if (tail.courtesy) wires.push({id:id+'.courtesy',type:fillerType,attrs:{text:[quote(tail.courtesy)]}});
  if (tail.aside) wires.push({id:id+'.aside',type:unreadType,attrs:{request:[owner],text:[quote(tail.aside)],
    note:[quote('following comment')]}});
  return {sop:serialize(wires),source:'postposed-cause',
    status:wires.some(w=>w.type===unreadType) ? 'partial' : 'matched'};
}

export function readsCauseAsCommand(text,tail,candidate) {
  return parse(candidate.sop).some(wire=>{
    const phrase=wire.type===requestType ? get(wire,'predicate') :
      wire.type==='w.request.intent' && get(wire,'role')==='purpose' ? get(wire,'words') : undefined;
    if (!phrase) return false;
    const scope=wire.type===requestType && get(wire,'words');
    const [left,right]=scope && actual(text,scope) || [0,text.length];
    const range=actual(text,phrase,left,right);
    return range && range[0]>=tail.split && range[1]<=(tail.textEnd ?? tail.end);
  });
}

function headValue(text,[start,end],headEnd,binding) {
  const written=text.slice(start,Math.min(end,headEnd)).trimEnd();
  if (!written || /[,.;!?]$/u.test(written)) return;
  const {operand,inventory}=binding;
  if (!operand.values.length) return operand.head.split('+').includes('span') ? {value:written,written} : undefined;
  const surface=shape(written);
  const values=new Set([...operand.values.filter(value=>shape(value)===surface),
    ...[...inventory.get(surface) ?? []].filter(value=>operand.values.includes(value))]);
  if (values.size===1) return {value:values.values().next().value,written};
}

function enact(text,scope,wires,request,wire,binding,tail,permit) {
  const [left,right]=scope,owner='$'+request.id;
  const rawValue=get(wire,'value'), written=get(wire,'words') ?? rawValue;
  const address=actual(text,written,left,right), predicate=actual(text,get(request,'predicate'),left,right);
  if (!address || !predicate || predicate[1]>address[0] || address[0]>=tail.bodyEnd ||
      address[1]<tail.end || address[1]>right || !permit(text.slice(0,tail.bodyEnd),quotedSpans(text.slice(0,tail.bodyEnd)))) return;
  if (fields(wire,'key_words').some(words=>{
    const range=actual(text,words,left,right);
    return !range || range[1]>address[0];
  })) return;
  const read=headValue(text,address,tail.bodyEnd,binding);
  if (!read) return;
  const rawSpan=actual(text,rawValue,address[0],address[1]);
  if (!rawSpan || rawSpan[1]<tail.end) return;
  const uniqueSuffix=[tail.split,tail.end];
  const overlaps=([a,b])=>a<uniqueSuffix[1] && b>uniqueSuffix[0];
  const conflicting=wires.some(item=>{
    if (item===wire || item===request || fields(item,'request')[0]!==owner || item.type===unreadType) return false;
    if (item.type===constraintType && get(item,'attribute')===binding.reasonKey) return true;
    return Object.entries(item.attrs).some(([key,values])=>(literalField(key) || key==='value' && !item.attrs.words) &&
      values.some(value=>literalRanges(text,decode(value),left,right).some(overlaps)));
  });
  if (conflicting || wires.some(item=>item!==request && item.type===requestType &&
    literalRanges(text,get(item,'words')).some(overlaps))) return;
  const chosen={...wire,attrs:{...wire.attrs,value:[binding.operand.values.length ? read.value : quote(read.value)]}};
  if (read.written===read.value) delete chosen.attrs.words;
  else chosen.attrs.words=[quote(read.written)];
  delete chosen.attrs.open_value;
  const retained=consumeUnread(wires.map(item=>item===wire ? chosen : item),text,tail.split,tail.end);
  let id=request.id+'.subordinate';
  for (let n=2;retained.some(item=>item.id===id || item.id.startsWith(id+'.'));n++) id=request.id+'.subordinate'+n;
  if (binding.kind==='causal') {
    retained.push({id,type:constraintType,attrs:{request:[owner],on:['attribute'],attribute:[binding.reasonKey],
      value:[quote(tail.clause)],key_words:[quote(tail.marker)],operator:['eq'],phase:['result']}});
  } else {
    retained.push({id,type:unreadType,attrs:{request:[owner],text:[quote(text.slice(tail.split,tail.end))],
      note:[quote('reported comparison')]}});
  }
  if (tail.courtesy && !retained.some(item=>item.type===fillerType && get(item,'text')===tail.courtesy)) {
    retained.push({id:id+'.courtesy',type:fillerType,attrs:{text:[quote(tail.courtesy)]}});
  }
  return {sop:serialize(retained),source:'postposed-clause',
    status:retained.some(item=>item.type===unreadType) ? 'partial' : 'matched'};
}

export function postposedClauseReadings(text,candidate,worlds,permit) {
  const grammar=worlds.postposedClauses;
  if (!grammar?.bindings.length || !candidate.sop?.includes(' '+constraintType+' ')) return [];
  const normalized=shape(text), options=grammar.bindings.filter(binding=>binding.markers.some(marker=>
    (' '+normalized+' ').includes(' '+marker+' ')));
  if (!options.length) return [];
  const wires=parse(candidate.sop);
  const requests=wires.filter(wire=>wire.type===requestType);
  const output=[];
  for (const request of requests) {
    const owner='$'+request.id;
    const local=wires.filter(wire=>get(wire,'request')===owner);
    const targets=local.filter(wire=>wire.type===targetType);
    if (targets.length!==1 || ![undefined,'do','propose'].includes(get(request,'mood')) || request.attrs.polarity) continue;
    const [target]=targets, family=get(target,'family');
    if (!worlds.literalGrammar.licenses(family,get(request,'act'))) continue;
    const scope=get(request,'words') ? actual(text,get(request,'words')) : requests.length===1 ? [0,text.length] : undefined;
    if (!scope) continue;
    for (const binding of options) {
      if (binding.family!==family) continue;
      const constraints=local.filter(wire=>wire.type===constraintType && get(wire,'attribute')===binding.attribute);
      if (constraints.length!==1) continue;
      const [wire]=constraints;
      if (get(wire,'on')!=='attribute' || get(wire,'operator')!=='eq' || ![undefined,'result'].includes(get(wire,'phase')) ||
          ![undefined,'yes'].includes(get(wire,'want')) || wire.attrs.value?.length!==1 ||
          ['thing','measure','unit','of'].some(key=>wire.attrs[key])) continue;
      const tails=clauseAfter(text,scope,binding,grammar,worlds);
      if (tails.length!==1) continue;
      const reading=enact(text,scope,wires,request,wire,binding,tails[0],permit);
      if (reading) output.push({...candidate,...reading});
    }
  }
  return output;
}
