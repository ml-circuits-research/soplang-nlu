import { serialize } from './knowledge.mjs';
import { literalRanges, sortRanges } from './evidence.mjs';
import { tokens } from './lexicon.mjs';
import { quotedSpans } from './literal-roles.mjs';
import { tokenize } from './lexicon.mjs';
import { nativeInventory } from './native-inventory.mjs';
import { consumeUnread } from './nominal-evidence.mjs';
import { preservationAdjunct } from './preservation-adjunct.mjs';
import { parse } from './schema.mjs';

const type=name=>'w.request.'+name;
const decode=value=>value?.startsWith('"') ? JSON.parse(value) : value;
const all=(wire,name)=>(wire?.attrs[name] ?? []).map(decode);
const field=(wire,name)=>all(wire,name)[0];
const form=text=>tokens(text ?? '').map(([key])=>key).join(' ');
const word=/^[\p{L}\p{M}\p{N}_]+$/u;
const proper=/^\p{Lu}[\p{L}\p{M}\p{N}_-]*$/u;
const terminal=/^[.!]$/u;
const replaceable=new Set(['request','on','attribute','value','words','key_words','open_value','operator','phase']);

export function compileOrientationLandmarks(facts,requestKeys,words=facts('core.word')) {
  const corrections=new Set(facts('w.lang.en.correction')
    .filter(wire=>field(wire,'comma')==='yes').flatMap(wire=>all(wire,'text').map(form)));
  const bindings=[];
  for (const wire of facts('pro.reader.orientation')) {
    const [family,act,attribute,sourceAttribute,landmarkType]=
      ['family','act','attribute','source_attribute','landmark_type'].map(name=>field(wire,name));
    const markers=new Set(all(wire,'text').map(form).filter(Boolean));
    const catalog=requestKeys.filter(key=>key.family===family);
    const result=catalog.find(key=>key.name===attribute && key.head==='fill+span' && !key.values.length);
    const direction=catalog.find(key=>key.name===sourceAttribute && key.head==='class' && key.values.length);
    if (!act || !result || !direction || !landmarkType || !markers.size) continue;
    bindings.push({family,act,attribute,sourceAttribute,markers,
      markerWidth:Math.max(...[...markers].map(marker=>marker.split(' ').length)),
      landmarks:nativeInventory(facts,landmarkType,words)});
  }
  return {bindings,corrections};
}

function unique(text,phrase,left=0,right=text.length) {
  const ranges=literalRanges(text,phrase,left,right);
  return ranges.length===1 ? ranges[0] : undefined;
}

function landmark(contents,binding,worlds) {
  const surface=contents.map(token=>token.key).join(' ');
  const forbidden=key=>worlds.negatives.has(key) || worlds.joiners[key] ||
    worlds.scopeGrammar.conditionals.has(key) || worlds.isReference(key);
  if (!contents.length || contents.length>8 || contents.some(({key})=>!word.test(key) || forbidden(key))) return false;
  if (worlds.determiners[contents[0].key]!=='definite') {
    return contents.length<=4 && contents.every(({raw,key})=>proper.test(raw) &&
      !worlds.evidenceVocabulary.grammar.has(key) && !worlds.lookup(key).some(([role])=>role==='act'));
  }
  if (binding.landmarks.has(surface)) return true;
  return contents.slice(1).some((_,i)=>{
    const term=contents.slice(i+1).map(token=>token.key).join(' ');
    return binding.landmarks.has(term) && !contents.slice(1,i+1).some(({key})=>
      worlds.determiners[key] || worlds.evidenceVocabulary.grammar.has(key) ||
      worlds.lookup(key).some(([role])=>['act','marker','reference'].includes(role)));
  });
}

function subjectPrefix(scope,input,request,target,local,binding,worlds,corrections) {
  const noun=field(target,'sort_words') ?? field(target,'family_words') ?? field(target,'sort');
  const written=field(target,'description');
  const description=written && unique(scope,written);
  const exact=field(target,'sort_words') || field(target,'family_words');
  const heads=exact ? literalRanges(scope,noun) : sortRanges(scope,noun);
  if (heads.length!==1 || (description && (description[0]>heads[0][0] || description[1]<heads[0][1]))) return;
  const [head]=heads;
  const at=input.findIndex(token=>token.start===head[0]);
  const determiner=input[at-1];
  if (at<1 || !['definite','demonstrative','possessive'].includes(worlds.determiners[determiner.key])) return;
  const predicate=field(request,'predicate'), predicateSpan=unique(scope,predicate,0,determiner.start);
  if (!predicateSpan) return;
  const act=field(request,'act');
  const before=scope.slice(0,predicateSpan[0]).trim().replace(/,\s*$/u,'');
  if (before && !worlds.literalGrammar.leads.has(form(before)) && !worlds.fillerPhrases.has(form(before))) return;
  const repair=corrections.has(form(predicate)) && scope.slice(predicateSpan[1],determiner.start).trim()===','
    ? predicate : undefined;
  const predicateFacts=worlds.lookup(form(predicate));
  const framed=act===binding.act && !scope.slice(predicateSpan[1],determiner.start).trim() &&
    predicateFacts.some(([role,sense,mood])=>role==='act' && sense===act && (!mood || mood==='do')) &&
    predicateFacts.some(([role,sense,slot])=>role==='frame' && sense===act && slot==='value');
  if (!framed && !(repair && (act===binding.act || act==='pick'))) return;
  const coverage=[head,...(description ? [description] : [])];
  for (const wire of local) {
    if (wire.type!==type('constraint') || field(wire,'phase')!=='selector' || wire.attrs.want) continue;
    for (const name of ['words','key_words','value']) {
      const range=unique(scope,field(wire,name));
      if (range && range[0]>=head[1]) coverage.push(range);
    }
  }
  return {head,coverage,repair};
}

function shape(scope,request,target,local,binding,worlds,permit) {
  const quotes=quotedSpans(scope);
  if (quotes.length || !permit(scope,quotes) || field(target,'mode')!=='existing' || request.attrs.polarity ||
      ['ask','check'].includes(field(request,'mood')) || !worlds.literalGrammar.licenses(binding.family,binding.act)) return;
  const input=tokenize(scope);
  while (terminal.test(input.at(-1)?.key ?? '')) input.pop();
  if (input.length>35 || !input.length) return;
  const subject=subjectPrefix(scope,input,request,target,local,binding,worlds,worlds.orientationLandmarks.corrections);
  if (!subject) return;
  const choices=[];
  const prior=local.filter(wire=>wire.type===type('constraint') && field(wire,'attribute')===binding.sourceAttribute);
  if (prior.length>1 || local.some(wire=>wire.type===type('constraint') &&
    (field(wire,'attribute')===binding.attribute || subject.repair && field(wire,'phase')==='result' && !prior.includes(wire)))) return;
  for (let i=0;i<input.length-1;i++) {
    const start=input[i].start;
    if (start<subject.head[1] || !input.slice(0,i).filter(token=>token.start>=subject.head[1]).every(token=>
      subject.coverage.some(([a,b])=>a<=token.start && token.end<=b))) continue;
    for (let j=i+1;j<=Math.min(input.length-1,i+binding.markerWidth);j++) {
      const key=scope.slice(start,input[j-1].end);
      if (!binding.markers.has(form(key)) || subject.coverage.some(([a,b])=>a< input[j-1].end && b>start)) continue;
      if (!landmark(input.slice(j),binding,worlds)) continue;
      const operand=scope.slice(input[j].start,input.at(-1).end),end=input.at(-1).end;
      const [open]=prior;
      if (open && !(field(open,'on')==='attribute' && field(open,'phase')==='result' && field(open,'operator')==='eq' &&
          field(open,'open_value')==='true' && Object.entries(open.attrs).every(([k,vs])=>replaceable.has(k) && vs.length===1) &&
          (field(open,'words')===operand || field(open,'words')===scope.slice(start,end)) &&
          form(key).endsWith(form(field(open,'key_words'))) &&
          [form(operand),form(scope.slice(input[j+1]?.start ?? input[j].start,end))].includes(form(field(open,'value'))))) continue;
      if (!open && !local.some(wire=>wire.type===type('unread') && literalRanges(scope,field(wire,'text')).some(
        ([a,b])=>a<=start && b>=end))) continue;
      choices.push({start,end,key,operand,open,repair:subject.repair});
    }
  }
  return choices.length===1 ? choices[0] : undefined;
}

export function orientationLandmarkReadings(text,candidate,worlds,permit) {
  const bindings=worlds.orientationLandmarks?.bindings;
  if (!bindings?.length || !candidate.sop?.includes(' '+type('target')+' ')) return [];
  const input=tokenize(text);
  if (!bindings.some(binding=>input.some((_,i)=>Array.from({length:binding.markerWidth},(_,n)=>n+1)
    .some(width=>binding.markers.has(input.slice(i,i+width).map(token=>token.key).join(' ')))))) return [];
  if (!permit(text,quotedSpans(text))) return [];
  const wires=parse(candidate.sop),requests=wires.filter(wire=>wire.type===type('request'));
  const preservation=preservationAdjunct(text,worlds);
  if (preservation) {
    const keys=new Set([...preservation.keys.values()].flatMap(names=>[...names]));
    const owners=new Set(requests.filter(request=>field(request,'words')===preservation.suffix).map(request=>'$'+request.id));
    if (!wires.some(wire=>wire.type===type('constraint') && owners.has(field(wire,'request')) &&
        keys.has(field(wire,'attribute')) && field(wire,'value')===preservation.value &&
        field(wire,'words')===preservation.suffix)) return [];
  }
  const results=[];
  for (const request of requests) {
    const owner='$'+request.id,local=wires.filter(wire=>field(wire,'request')===owner);
    const targets=local.filter(wire=>wire.type===type('target'));
    if (targets.length!==1) continue;
    const [target]=targets,scope=field(request,'words') ?? (requests.length===1 ? text : undefined);
    const range=scope && unique(text,scope);
    if (!range || requests.some(peer=>peer!==request && literalRanges(text,field(peer,'words')).some(
      ([a,b])=>a<range[1] && b>range[0]))) continue;
    for (const binding of bindings) {
      if (field(target,'family')!==binding.family) continue;
      const match=shape(scope,request,target,local,binding,worlds,permit);
      if (!match) continue;
      const {start,end,key,operand,open,repair}=match;
      if (open && wires.some(wire=>Object.values(wire.attrs).flat().includes('$'+open.id))) continue;
      const ids=new Set(wires.map(wire=>wire.id));
      function id(stem) {
        let next=request.id+stem;
        for (let i=2;ids.has(next);i++) next=request.id+stem+i;
        ids.add(next);
        return next;
      }
      const anchorId=open?.id ?? id('.facingTarget');
      const retained=consumeUnread(wires.filter(wire=>wire!==open),text,range[0]+start,range[0]+end).map(wire=>
        wire===request && repair ? {...wire,attrs:{...wire.attrs,act:[binding.act],predicate:[JSON.stringify(key)]}} : wire);
      retained.push({id:anchorId,type:type('constraint'),attrs:{request:[owner],on:['attribute'],
        attribute:[binding.attribute],value:[JSON.stringify(operand)],key_words:[JSON.stringify(key)],operator:['eq'],phase:['result']}});
      retained.push({id:id('.orientationLookup'),type:type('lookup'),attrs:{
        request:[owner],constraint:['$'+anchorId],key:['thing'],from:['page']}});
      if (!local.some(wire=>wire.type===type('lookup') && field(wire,'target')==='$'+target.id)) {
        retained.push({id:id('.subjectLookup'),type:type('lookup'),attrs:{
          request:[owner],target:['$'+target.id],key:['thing'],from:['page']}});
      }
      if (repair && !retained.some(wire=>wire.type===type('filler') && field(wire,'text')===repair)) {
        retained.push({id:id('.repair'),type:type('filler'),attrs:{text:[JSON.stringify(repair)]}});
      }
      results.push({sop:serialize(retained),source:'orientation-landmark',
        status:retained.some(wire=>wire.type===type('unread')) ? 'partial' : 'matched'});
    }
  }
  return results;
}
