import { parse, serialize, str } from './knowledge.mjs';
import { literalRanges, sortRanges } from './evidence.mjs';
import { tokens } from './lexicon.mjs';
import { quotedSpans } from './literal-roles.mjs';

const ns='w.request.';
const get=(wire,key)=>str(wire?.attrs[key]?.[0]);
const values=(wire,key)=>(wire.attrs[key] ?? []).map(str);
const form=text=>tokens(text ?? '').map(([key])=>key).join(' ');
const word=/^[\p{L}\p{M}\p{N}_]+$/u;
const proper=/^\p{Lu}[\p{L}\p{M}\p{N}_]*$/u;
const atom=/^[\p{L}_][\p{L}\p{M}\p{N}_.-]*$/u;
const detModes=new Set(['definite','demonstrative','possessive']);
const peerModes=new Set([...detModes,'indefinite']);
const phrase=(ts,a,b)=>ts.slice(a,b).map(([key])=>key).join(' ');
const markerMatches=(input,start,words)=>words.every((key,i)=>input[start+i]?.[0]===key);
const quote=JSON.stringify;
const trailing=new Set(['.','!']);

export function compileDependentOperands(facts,requestKeys) {
  const native=new Map(facts('core.slot').map(wire=>[wire.id,wire]));
  const inventories=new Map();
  const frames=[];
  for (const wire of facts('pro.reader.dependent_operand')) {
    const [family,act,attribute,range,phase,itemType,itemField,peerField]=
      ['family','act','attribute','range','phase','item_type','item_field','peer_field'].map(key=>get(wire,key));
    const markers=values(wire,'marker').map(text=>form(text).split(' ')).filter(parts=>parts.every(part=>word.test(part)));
    const matching=requestKeys.filter(key=>key.family===family);
    const key=matching.find(key=>key.name===attribute && !key.values.length && key.head.split('+').includes('span'));
    const slot=native.get(key?.means);
    if (!act || !range || !slot || !values(slot,'type').includes(range) || !markers.length ||
        !['result','selector'].includes(phase) ||
        [itemType,itemField,peerField].some(Boolean) && ![itemType,itemField,peerField].every(Boolean)) continue;
    let pairs;
    if (itemType) {
      const id=JSON.stringify([itemType,itemField,peerField]);
      if (!inventories.has(id)) inventories.set(id,new Set(facts(itemType).flatMap(item=>
        values(item,itemField).flatMap(child=>values(item,peerField).map(peer=>JSON.stringify([form(child),form(peer)]))))));
      pairs=inventories.get(id);
    }
    const effects=matching.filter(key=>key.values.length || key.head.split('+').includes('candidate'));
    frames.push({family,act,attribute,phase,markers,effects,pairs});
  }
  return frames;
}

function unique(text,value,start=0,end=text.length) {
  const ranges=literalRanges(text,value,start,end);
  return ranges.length===1 ? ranges[0] : undefined;
}

function positive(text,ts,worlds,permit) {
  if (quotedSpans(text).length || !permit(text,[])) return false;
  for (let i=0;i<ts.length;i++) for (let j=i+1;j<=Math.min(ts.length,i+5);j++) {
    const key=phrase(ts,i,j);
    if (worlds.negatives.has(key) || worlds.scopeGrammar.negatives.has(key) ||
        worlds.scopeGrammar.conditionals.has(key) || worlds.scopeGrammar.predicateNegators.has(key) ||
        [...worlds.scopeGrammar.endings].some(ending=>key.replaceAll(' ','').endsWith(ending))) return false;
  }
  return true;
}

function rangeForHead(scope,target) {
  const explicit=get(target,'sort_words') ?? get(target,'family_words');
  if (explicit) return unique(scope,explicit);
  const ranges=sortRanges(scope,get(target,'sort'));
  return ranges.length===1 ? ranges[0] : undefined;
}


function effectMatches(ts,start,end,frame,local,worlds) {
  if (frame.phase==='result') return [{peerEnd:end,effectStart:end,effectEnd:end}];
  const readings=[];
  for (const effect of frame.effects) {
    const donors=local.filter(wire=>wire.type===ns+'constraint' && get(wire,'attribute')===effect.name &&
      get(wire,'operator')==='eq' && get(wire,'phase')==='result' && !wire.attrs.want && !wire.attrs.open_value &&
      (!effect.values.length || effect.values.includes(get(wire,'value'))));
    if (donors.length!==1) continue;
    const canonical=get(donors[0],'value');
    for (let at=Math.max(start+1,end-7);at<end;at++) {
      const written=phrase(ts,at,end), licensed=new Set(effect.values.filter(value=>
        form(value)===written || form(value.replaceAll('_',' '))===written));
      for (const [body] of worlds.ownerPropertyValues?.get(JSON.stringify([frame.family,written])) ?? []) {
        const [wire]=parse('@v '+ns+'constraint '+body);
        if (get(wire,'attribute')===effect.name && !wire.attrs.open_value && !wire.attrs.want &&
            (!effect.values.length || effect.values.includes(get(wire,'value')))) licensed.add(get(wire,'value'));
      }
      if (licensed.size!==1 || !licensed.has(canonical)) continue;
      for (let peerEnd=Math.max(start+1,at-4);peerEnd<=at;peerEnd++) {
        if (peerEnd!==at && !worlds.lookup(phrase(ts,peerEnd,at)).some(([role,act,kind])=>
          role==='marker' && act===frame.act && kind==='value')) continue;
        readings.push({peerEnd,effectStart:at,effectEnd:end,canonical,effectKey:effect.name,effectWire:donors[0]});
      }
    }
  }
  return readings;
}

function peerMatches(ts,start,end,head,frame,worlds) {
  const peer=ts.slice(start,end);
  if (!peer.length || peer.length>7 || peer.some(([term])=>!word.test(term) || worlds.joiners[term])) return false;
  if (!frame.pairs) return peer.every(([key,raw])=>proper.test(raw) &&
    !worlds.evidenceVocabulary.grammar.has(key) && !worlds.isReference(key));
  if (!peerModes.has(worlds.determiners[peer[0][0]])) return false;
  return peer.slice(1).some((_,i)=>frame.pairs.has(JSON.stringify([head,phrase(peer,i+1,peer.length)])) &&
    peer.slice(1,i+1).every(([key])=>!worlds.evidenceVocabulary.grammar.has(key) &&
      !worlds.lookup(key).some(([role])=>['act','marker','reference'].includes(role))));
}

function bounded(scope,target,frame,local,worlds) {
  const ts=tokens(scope), chars=Array.from(scope);
  let end=ts.length;
  if (trailing.has(ts[end-1]?.[0])) end--;
  const commas=ts.slice(0,end).flatMap(([term],i)=>term===',' ? [i] : []);
  if (end>35 || end<4 || commas.length>1) return;
  const span=(a,b)=>chars.slice(ts[a][2],ts[b-1][3]).join('');
  const offset=i=>chars.slice(0,ts[i][2]).join('').length;
  const lead=commas.length ? commas[0]+1 : 0;
  let explanation;
  if (lead) {
    const prefix=phrase(ts,0,lead-1);
    const known=worlds.literalGrammar.leads.has(prefix) || worlds.fillerPhrases.has(prefix);
    if (!known && (lead<3 || !worlds.scopeGrammar.subjects.has(ts[0][0]) ||
        ts.slice(0,lead-1).some(([term])=>worlds.joiners[term] ||
          worlds.lookup(term).some(([role])=>role==='act')))) return;
    explanation={text:span(0,lead-1),filler:known};
  }
  if (ts.slice(lead,end).some(([term])=>!word.test(term) || worlds.joiners[term])) return;
  const head=rangeForHead(scope,target);
  if (!head) return;
  const pivot=ts.findIndex((_,i)=>i>lead && chars.slice(0,ts[i-1][3]).join('').length===head[1]);
  if (pivot<0) return;
  const subjectWord=get(target,'sort') ?? get(target,'family_words');
  const readings=[];
  for (let verb=lead;verb<Math.min(lead+5,pivot-1);verb++) {
    const courtesy=phrase(ts,lead,verb);
    if (courtesy && !worlds.literalGrammar.leads.has(courtesy) && !worlds.fillerPhrases.has(courtesy)) continue;
    for (let after=verb+1;after<pivot-1;after++) {
      if (!worlds.lookup(phrase(ts,verb,after)).some(([role,act,mood])=>
        role==='act' && act===frame.act && (!mood || mood==='do'))) continue;
      if (!detModes.has(worlds.determiners[ts[after][0]]) ||
          offset(after)>=head[0]) continue;
      if (ts.slice(after+1,pivot).some((_,i)=>offset(after+1+i)<head[0] &&
          worlds.lookup(ts[after+1+i][0]).some(([role])=>['act','marker','reference'].includes(role)))) continue;
      for (const marker of frame.markers) {
        if (!markerMatches(ts,pivot,marker)) continue;
        const peerStart=pivot+marker.length;
        for (const effect of effectMatches(ts,peerStart,end,frame,local,worlds)) {
          if (!peerMatches(ts,peerStart,effect.peerEnd,form(subjectWord),frame,worlds)) continue;
          const cueEnd=effect.effectStart;
          readings.push({predicate:span(verb,after),subject:span(after,pivot),operand:span(peerStart,effect.peerEnd),
            marker:span(pivot,peerStart),description:span(after,effect.peerEnd),...effect,
            written:effect.canonical ? span(effect.effectStart,effect.effectEnd) : undefined,
            grammar:[...marker,...ts.slice(effect.peerEnd,cueEnd).map(([term])=>term)],
            explanation,courtesy:verb>lead ? span(lead,verb) : undefined});
        }
      }
    }
  }
  return readings.length===1 ? readings[0] : undefined;
}

function compose(scope,wires,request,target,frame,reading) {
  const ref='$'+request.id, local=wires.filter(wire=>get(wire,'request')===ref);
  const remove=new Set();
  for (const wire of local) {
    if (wire.type===ns+'unread') {
      if (unique(scope,get(wire,'text'))) remove.add(wire.id);
      continue;
    }
    if (wire.type!==ns+'constraint') continue;
    const attribute=get(wire,'attribute'), phase=get(wire,'phase'), evidence=get(wire,'words') ?? get(wire,'value');
    const documented=get(wire,'operator')==='eq' && !wire.attrs.want && !wire.attrs.thing && wire.attrs.value?.length===1 &&
      !['number','measure','unit','of','character'].some(key=>wire.attrs[key]);
    if (!documented) return;
    if (attribute===frame.attribute && phase===frame.phase &&
        [reading.operand,form(reading.operand)].includes(evidence) ||
        wire===reading.effectWire ||
        phase==='result' && !wire.attrs.key_words && reading.grammar.includes(form(evidence)) && unique(scope,evidence)) {
      remove.add(wire.id);
      continue;
    }
    return;
  }
  if (target.attrs.ids || target.attrs.name || target.attrs.description &&
      ![reading.subject,reading.description].includes(get(target,'description')) ||
      wires.some(wire=>Object.values(wire.attrs).flat().some(v=>v.startsWith('$') && remove.has(v.slice(1))))) return;
  const ids=new Set(wires.map(wire=>wire.id));
  function id(stem) {
    let fresh=request.id+stem;
    for (let n=2;ids.has(fresh);n++) fresh=request.id+stem+n;
    ids.add(fresh);
    return fresh;
  }
  const peer=id('.related');
  const keep=wires.filter(wire=>!remove.has(wire.id)).map(wire=>{
    if (wire===request) return {...wire,attrs:{...wire.attrs,act:[frame.act],mood:['do'],predicate:[quote(reading.predicate)],words:[quote(scope)]}};
    if (wire===target) return {...wire,attrs:{...wire.attrs,fill:['description'],description:[quote(reading.subject)]}};
    return wire;
  });
  const remaining=keep;
  remaining.push({id:peer,type:ns+'constraint',attrs:{request:[ref],on:['attribute'],attribute:[frame.attribute],
    value:[quote(reading.operand)],key_words:[quote(reading.marker)],operator:['eq'],phase:[frame.phase]}});
  remaining.push({id:id('.relatedLookup'),type:ns+'lookup',attrs:{request:[ref],constraint:['$'+peer],key:['thing'],from:['page']}});
  if (!local.some(wire=>wire.type===ns+'lookup' && get(wire,'target')==='$'+target.id)) {
    remaining.push({id:id('.ownerLookup'),type:ns+'lookup',attrs:{request:[ref],target:['$'+target.id],key:['thing'],from:['page']}});
  }
  if (reading.effectKey) remaining.push({id:id('.effect'),type:ns+'constraint',attrs:{request:[ref],on:['attribute'],
    attribute:[reading.effectKey],value:[atom.test(reading.canonical) ? reading.canonical : quote(reading.canonical)],
    ...(reading.written!==reading.canonical ? {words:[quote(reading.written)]} : {}), operator:['eq'],phase:['result']}});
  if (reading.explanation && !remaining.some(wire=>get(wire,'text')===reading.explanation.text)) {
    remaining.push({id:id('.explanation'),type:ns+(reading.explanation.filler ? 'filler' : 'unread'),attrs:{
      ...(reading.explanation.filler ? {} : {request:[ref]}),text:[quote(reading.explanation.text)]}});
  }
  if (reading.courtesy && !remaining.some(wire=>get(wire,'text')===reading.courtesy)) {
    remaining.push({id:id('.courtesy'),type:ns+'filler',attrs:{text:[quote(reading.courtesy)]}});
  }
  const partial=remaining.some(wire=>wire.type===ns+'unread');
  return {sop:serialize(remaining),source:'dependent-operand',status:partial ? 'partial' : 'matched'};
}

export function dependentOperandReadings(text,candidate,worlds,permit) {
  if (!worlds.dependentOperands?.length || !candidate.sop?.includes(' '+ns+'target ') ||
      !candidate.sop.includes(' mode=existing') || text.length>400) return [];
  const tokensInText=tokens(text), compatible=worlds.dependentOperands.filter(frame=>
    frame.markers.some(marker=>tokensInText.some((_,i)=>markerMatches(tokensInText,i,marker))));
  if (!compatible.length || !positive(text,tokensInText,worlds,permit)) return [];
  const wires=parse(candidate.sop),requests=wires.filter(wire=>wire.type===ns+'request');
  const output=[];
  for (const request of requests) {
    const mode=get(request,'mood');
    if (mode && mode!=='do' || request.attrs.polarity) continue;
    const targets=wires.filter(wire=>wire.type===ns+'target' && get(wire,'request')==='$'+request.id);
    if (targets.length!==1 || get(targets[0],'mode')!=='existing') continue;
    const [target]=targets,scope=get(request,'words') ?? (requests.length===1 ? text : undefined);
    const local=wires.filter(wire=>get(wire,'request')==='$'+request.id);
    const range=scope && unique(text,scope);
    if (!range || requests.some(peer=>peer!==request && literalRanges(text,get(peer,'words')).some(
      ([a,b])=>a<range[1] && b>range[0]))) continue;
    for (const frame of compatible) {
      if (get(target,'family')!==frame.family || get(request,'act')!==frame.act ||
          !worlds.literalGrammar.licenses(frame.family,frame.act)) continue;
      const reading=bounded(scope,target,frame,local,worlds);
      if (!reading) continue;
      const candidate=compose(scope,wires,request,target,frame,reading);
      if (candidate) output.push(candidate);
    }
  }
  return output;
}
