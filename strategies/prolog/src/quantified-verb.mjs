import { tokens } from './lexicon.mjs';
import { resolveWrittenMeasurement } from './owner-property.mjs';
import { quotedSpans } from './literal-roles.mjs';
import { requestScope } from './request-scope.mjs';

const forms=ts=>ts.map(([term])=>term).join(' ');
const form=text=>forms(tokens(text));
const quote=JSON.stringify;
const values=(wire,key)=>(wire.attrs[key] ?? []).map(raw=>raw.startsWith('"') ? JSON.parse(raw) : raw);
const one=(wire,key)=>values(wire,key)[0];
const numeric=(keys,family,key)=>keys.some(spec=>spec.family===family && spec.name===key &&
  !spec.values.length && spec.head.split('+').includes('number'));

export function compileQuantifiedVerbs(facts,keys) {
  const verbs=facts('pro.reader.quantified_verb').flatMap(wire=>{
    const family=one(wire,'family'),key=one(wire,'key'),step=one(wire,'step');
    return numeric(keys,family,key) ? values(wire,'text').map(text=>[form(text),'change',family,key,step,true]) : [];
  });
  const markers=facts('pro.reader.quantified_marker').flatMap(wire=>
    values(wire,'text').map(text=>[form(text),one(wire,'operator')]));
  const references=new Map(facts('pro.reader.quantified_reference').map(wire=>
    [form(one(wire,'prefix')),one(wire,'quantifier')]));
  return {verbs,markers,references};
}

function referenceTarget(words,terms,worlds,references) {
  if (worlds.isReference(terms) && ['sg','pl'].includes(worlds.sequenceObjectPronouns.get(terms))) {
    return 'mode=bound fill=context description='+quote(words);
  }
  for (const [prefix,quantifier] of references) {
    if (!terms.startsWith(prefix+' ') || !worlds.scopeGrammar.universals.has(form(quantifier))) continue;
    const pronoun=terms.slice(prefix.length+1);
    if (worlds.isReference(pronoun) && worlds.sequenceObjectPronouns.get(pronoun)==='pl') {
      return 'mode=bound fill=context description='+quote(words)+' quantifier='+quote(quantifier);
    }
  }
}

function nominalTarget(ts,span,start,end,family,worlds) {
  if (!ts.slice(start,end).every(([term])=>/^[\p{L}\p{M}\p{N}_-]+$/u.test(term))) return;
  const possibilities=new Set();
  for (let head=start;head<end;head++) {
    const determiner=head===start ? undefined : worlds.determiners[forms(ts.slice(start,head))];
    if (head!==start && !['definite','demonstrative'].includes(determiner)) continue;
    const noun=forms(ts.slice(head,end));
    const words=span(head,end);
    const candidates=[...worlds.lookup(noun).flatMap(([role,act,owner,mode,sort])=>
      role==='target' && act==='change' && mode==='existing' && owner===family ? [sort] : []),
    ...(worlds.ownerInventory?.get(JSON.stringify(['change',noun])) ?? [])
      .filter(item=>item.family===family).map(item=>item.sort)];
    const sorts=new Set(candidates.filter(Boolean));
    if (sorts.size>1 || !candidates.length) continue;
    const [sort]=sorts;
    const typed=sort ? 'sort='+quote(sort)+' sort_words='+quote(words) : 'family_words='+quote(words);
    possibilities.add('mode=existing fill=description description='+quote(span(start,end))+
      (determiner ? ' determiner='+determiner : '')+' '+typed);
  }
  if (possibilities.size===1) return possibilities.values().next().value;
}

export function quantifiedVerbReadings(text,worlds) {
  const grammar=worlds.quantifiedVerbs;
  if (!grammar?.markers.length) return [];
  const ts=tokens(text);
  const vocabulary=new Set(ts.map(([term])=>term));
  if (!grammar.markers.some(([marker])=>vocabulary.has(marker.split(' ')[0]))) return [];
  const chars=Array.from(text);
  const span=(a,b)=>chars.slice(ts[a][2],ts[b-1][3]).join('');
  const end=/^[.!?]$/u.test(ts.at(-1)?.[0] ?? '') ? ts.length-1 : ts.length;
  const entries=[...grammar.verbs,...(worlds.nativeVerbEffects ?? []).flatMap(([verb,act,family,key,op,step])=>
    act==='change' && op==='delta' && vocabulary.has(verb.split(' ')[0]) &&
    numeric(worlds.requestKeys,family,key) ? [[verb,act,family,key,step,false]] : [])]
    .filter(([verb])=>vocabulary.has(verb.split(' ')[0]));
  if (!entries.length || quotedSpans(text).length || requestScope(text,text,worlds,[]).restricted) return [];
  const readings=new Map();
  for (const [verb,act,family,key,step,absolute] of entries) {
    const length=verb.split(' ').length;
    for (let start=0;start<end-length-2;start++) {
      const lead=forms(ts.slice(0,start)).replace(/ ,$/u,'');
      if (lead && !worlds.literalGrammar.leads.has(lead) && !worlds.fillerPhrases.has(lead)) continue;
      const object=start+length;
      if (forms(ts.slice(start,object))!==verb) continue;
      for (const [marker,operator] of grammar.markers) {
        if (operator==='eq' && !absolute) continue;
        const size=marker.split(' ').length;
        for (let at=object+1;at+size<end;at++) {
          if (forms(ts.slice(at,at+size))!==marker) continue;
          const amountAt=at+size, written=span(amountAt,end);
          const operand=resolveWrittenMeasurement(written,worlds,family,key);
          if (!operand?.value) continue;
          const {value,measurement}=operand;
          const magnitude=Number(measurement?.measure ?? value);
          if (!Number.isFinite(magnitude) || (operator==='delta' && magnitude<0 && step!=='signed')) continue;
          const description=span(object,at);
          const target=referenceTarget(description,forms(ts.slice(object,at)),worlds,grammar.references) ??
            nominalTarget(ts,span,object,at,family,worlds);
          if (!target) continue;
          const delta=operator==='delta';
          const direction=step==='signed' ? (magnitude<0 ? 'less' : 'more') : step;
          const literalValue=delta && magnitude<0 ? String(-magnitude) : value;
          const sop=[
            '@r w.request.request act='+act+' mood=do predicate='+quote(span(start,object))+' words='+quote(text),
            '@t w.request.target request=$r family='+quote(family)+' '+target,
            ...(target.startsWith('mode=bound') ? ['@l w.request.lookup request=$r target=$t key=thing from=any'] : []),
            '@c w.request.constraint request=$r on=attribute attribute='+quote(key)+' operator='+operator+
              ' phase=result value='+quote(literalValue)+' words='+quote(written)+' key_words='+quote(span(start,object))+
              (delta ? ' step='+direction : '')+
              (measurement ? ' measure='+measurement.measure+' unit='+quote(measurement.unit)+
                ' measure_words='+quote(measurement.words) : ''),
          ].join('\n');
          readings.set(sop,{sop,source:'quantified-verb',status:'matched'});
        }
      }
    }
  }
  return [...readings.values()];
}
