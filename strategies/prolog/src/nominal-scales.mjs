import { parse, serialize } from './knowledge.mjs';
import { literalField, literalRanges } from './evidence.mjs';
import { tokens } from './lexicon.mjs';
import { consumeUnread } from './nominal-evidence.mjs';

export const nominalScaleTypes=['pro.reader.nominal_scale','k.values.scale','k.values.step'];
const decode=value=>value?.startsWith('"') ? JSON.parse(value) : value;
const fields=(wire,key)=>(wire.attrs[key] ?? []).map(decode);
const field=(wire,key)=>fields(wire,key)[0];
const normalize=text=>tokens(text).map(([word])=>word).join(' ');
const atom=value=>/^[\p{L}_][\p{L}\p{M}\p{N}_.-]*$/u.test(value) ? value : JSON.stringify(value);
const constraintType='w.request.constraint';

function index(map,key,item) {
  const list=map.get(key) ?? [];
  list.push(item);
  map.set(key,list);
}

export function nominalScaleForms(facts,requestKeys) {
  const scales=new Set(facts('k.values.scale').map(wire=>field(wire,'name')));
  const names=new Map(), byId=new Map(), surfaces=new Map();
  for (const wire of facts('k.values.step')) {
    const scale=field(wire,'scale'), value=field(wire,'name');
    if (!scales.has(scale) || !value) continue;
    const step={scale,value};
    index(names,value,step);
    byId.set(wire.id,step);
    index(surfaces,normalize(value),step);
  }
  for (const wire of facts('core.word')) {
    if (!fields(wire,'of').includes('k.values.step.name')) continue;
    const languages=fields(wire,'lang');
    if (languages.length && !languages.some(lang=>/^en(?:[-_]|$)/iu.test(lang))) continue;
    for (const ref of fields(wire,'means')) {
      const step=byId.get(ref) ?? (names.get(ref)?.length===1 ? names.get(ref)[0] : undefined);
      if (step) for (const text of fields(wire,'text')) index(surfaces,normalize(text),step);
    }
  }
  const byFamily=new Map();
  const properties=new Map();
  for (const property of requestKeys) index(properties,JSON.stringify([property.family,property.name]),property);
  for (const wire of facts('pro.reader.nominal_scale')) {
    const family=field(wire,'family'), attribute=field(wire,'attribute');
    const scale=field(wire,'scale'), on=field(wire,'on');
    const keys=(properties.get(JSON.stringify([family,attribute])) ?? []).filter(key=>
      key.head.split('+').some(head=>head==='class' || head==='step'));
    if (keys.length!==1 || !scales.has(scale) || !on) continue;
    const [property]=keys;
    const excluded=new Set();
    for (const cue of facts('w.lang.en.cue')) {
      if (field(cue,'on')!==on || on==='attribute' && field(cue,'attribute')!==attribute) continue;
      const cueValue=field(cue,'value'), comparable=field(cue,'step');
      const values=cueValue && (surfaces.get(normalize(cueValue)) ?? []).filter(s=>s.scale===scale);
      for (const lead of fields(cue,'lead')) {
        const phrase=normalize(lead);
        const candidates=(surfaces.get(phrase) ?? []).filter(s=>s.scale===scale);
        if (comparable || values?.length && candidates.some(s=>values.every(v=>v.value!==s.value))) excluded.add(phrase);
      }
    }
    const bank=byFamily.get(family) ?? {forms:new Map(),width:0,compoundLeads:new Set()};
    byFamily.set(family,bank);
    for (const [phrase,steps] of surfaces) {
      if (!phrase || excluded.has(phrase)) continue;
      const candidates=new Set(steps.filter(step=>step.scale===scale).map(step=>step.value));
      if (candidates.size!==1) continue;
      const [value]=candidates;
      if (property.values.length && !property.values.includes(value)) continue;
      const id=JSON.stringify([attribute,on,scale,value]);
      const choices=bank.forms.get(phrase) ?? new Map();
      choices.set(id,{attribute,on,scale,value});
      bank.forms.set(phrase,choices);
      const words=phrase.split(' ');
      bank.width=Math.max(bank.width,words.length);
      if (words.length>1) bank.compoundLeads.add(words[0]);
    }
  }
  return {byFamily,properties,surfaces};
}

function sameEvidence(text,value,scope) {
  const hits=literalRanges(text,value,...scope);
  return hits.length===1 ? hits[0] : undefined;
}

function simpleConstraint(wire,ref,phase) {
  return wire.type===constraintType && field(wire,'request')===ref && (field(wire,'phase') ?? 'result')===phase &&
    ['eq','degree'].includes(field(wire,'operator') ?? 'eq') && wire.attrs.value?.length===1 &&
    (wire.attrs.words?.length ?? 0)<=1 && !wire.attrs.key_words && !wire.attrs.of && !wire.attrs.thing &&
    !wire.attrs.want && field(wire,'open_value')!=='true';
}

function matchScale(ts,end,bank) {
  for (let start=Math.max(0,end-bank.width);start<end;start++) {
    const phrase=ts.slice(start,end).map(([word])=>word).join(' ');
    const choices=bank.forms.get(phrase);
    if (choices) return {start,...(choices.size===1 ? [...choices.values()][0] : {})};
  }
}

// One lexical property can overlap two independently declared modifiers.
// A second reading splits it only at an attested scale/value boundary.
function splitModifier(text,ts,start,end,wire,bank,family,worlds,offset) {
  if (end-start<2 || matchScale(ts,start,bank)) return;
  const original=field(wire,'value'),attribute=field(wire,'attribute');
  const raw=text.slice(offset(ts[start][2]),offset(ts[end-1][3]));
  if (normalize(original)!==normalize(raw)) return;
  const alternatives=[];
  for (let i=start+1;i<end;i++) {
    const scale=matchScale(ts,i,bank);
    if (scale?.start!==start || !scale.attribute || scale.attribute===attribute) continue;
    const suffix=text.slice(offset(ts[i][2]),offset(ts[end-1][3]));
    const values=new Set();
    for (const [role,,owner,body] of worlds.lookup(normalize(suffix))) {
      if (role!=='constraint' || owner!==family) continue;
      const [property]=parse('@p w.request.constraint '+body);
      if (field(property,'attribute')===attribute && field(property,'operator')==='eq' &&
          property.attrs.value?.length===1) values.add(field(property,'value'));
    }
    if (values.size===1) alternatives.push({at:i,suffix,value:[...values][0]});
  }
  return alternatives.length===1 ? alternatives[0] : undefined;
}

export function nominalScaleReading(text,ts,quotes,candidate,worlds,{splitCompounds=false}={}) {
  const index=worlds.nominalScales;
  if (!index?.byFamily.size || !candidate.sop) return;
  const wires=parse(candidate.sop);
  const requests=wires.filter(w=>w.type==='w.request.request'), targets=wires.filter(w=>w.type==='w.request.target');
  if (requests.length!==1 || targets.length!==1) return;
  const [request]=requests,[target]=targets;
  const family=field(target,'family'), mode=field(target,'mode'), ref='$'+request.id;
  const head=field(target,'sort_words') ?? field(target,'family_words') ?? field(target,'sort');
  const bank=index.byFamily.get(family);
  if (!head || !bank || !['new','existing'].includes(mode) || field(target,'request')!==ref ||
      ['ask','check'].includes(field(request,'mood'))) return;
  const requestWords=field(request,'words');
  const scope=requestWords ? sameEvidence(text,requestWords,[0,text.length]) : [0,text.length];
  if (!scope) return;
  const offsets=[0];
  for (const char of text) offsets.push(offsets.at(-1)+char.length);
  const offset=i=>offsets[i];
  const keys=normalize(head).split(' ');
  const positions=ts.flatMap(([, ,start],i)=>keys.every((word,j)=>ts[i+j]?.[0]===word) &&
      offset(start)>=scope[0] && offset(ts[i+keys.length-1][3])<=scope[1] ? [i] : []);
  if (positions.length!==1 || positions[0]===0) return;
  const [position]=positions, phase=mode==='new' ? 'result' : 'selector';
  const scopeTokens=tokens(text.slice(...scope)).map(t=>t[0]);
  if (scopeTokens.some((token,i)=>worlds.negatives.has(token) ||
    [1,2,3,4].some(n=>{
      const phrase=scopeTokens.slice(i,i+n).join(' ');
      return worlds.scopeGrammar.negatives.has(phrase) || worlds.scopeGrammar.conditionals.has(phrase);
    })) || /n['’]t\b/iu.test(text.slice(...scope))) return;

  const propertyFor=wire=>index.properties.get(JSON.stringify([family,field(wire,'attribute')])) ?? [];
  const owned=wires.filter(w=>w.type===constraintType && field(w,'request')===ref);
  if (owned.some(w=>['no','not_all'].includes(field(w,'want')))) return;
  const grounded=owned.flatMap(w=>{
    if (!simpleConstraint(w,ref,phase) || field(w,'on')!=='attribute' ||
        !propertyFor(w).some(key=>key.head.split('+').some(h=>h==='class' || h==='candidate'))) return [];
    const value=field(w,'value');
    if (!propertyFor(w).some(key=>!key.values.length || key.values.includes(value))) return [];
    const raw=field(w,'words') ?? value, range=sameEvidence(text,raw,scope);
    return range ? [{wire:w,range}] : [];
  });

  let at=position, scale, sizeEnd;
  while (at>0) {
    const next=matchScale(ts,at,bank);
    if (next) {
      if (!next.attribute || scale) return;
      scale=next;
      sizeEnd=at;
      at=next.start;
      continue;
    }
    const end=offset(ts[at-1][3]);
    const peers=grounded.filter(({wire,range})=>range[1]===end &&
      owned.filter(w=>field(w,'attribute')===field(wire,'attribute')).length===1);
    if (!peers.length) break;
    if (peers.length!==1) return;
    const [{range,wire}]=peers;
    const start=ts.findIndex(([, ,start])=>offset(start)===range[0]);
    if (start<0 || start>=at) return;
    const part=splitCompounds && !scale && splitModifier(text,ts,start,at,wire,bank,family,worlds,offset);
    if (part && !wires.some(w=>Object.values(w.attrs).flat().includes('$'+wire.id))) {
      wire.attrs={...wire.attrs,value:[atom(part.value)],words:[JSON.stringify(part.suffix)]};
      at=part.at;
    } else at=start;
  }
  if (!scale || owned.some(w=>field(w,'attribute')===scale.attribute)) return;
  const {attribute,on,value}=scale;
  const prior=ts[scale.start-1]?.[0];
  if (bank.compoundLeads.has(prior) && !Object.hasOwn(worlds.determiners,prior)) return;
  const fromChar=ts[scale.start][2], toChar=ts[sizeEnd-1][3];
  const from=offset(fromChar),to=offset(toChar),surface=text.slice(from,to);
  if (from<scope[0] || quotes.some(q=>q.start<ts[position+keys.length-1][3] && q.end>fromChar) ||
      !sameEvidence(text,surface,scope)) return;

  // A determiner plus a size adjective can also look like a degree phrase.
  // It can be replaced only where another declared scale and the rival
  // property's bank both account for the exact same determiner/adjective span.
  const determiner=ts[scale.start-1], drop=new Set();
  if (determiner && worlds.determiners[determiner[0]]==='indefinite') {
    const start=offset(determiner[2]);
    const degreeText=text.slice(start,to);
    const senses=(index.surfaces.get(normalize(degreeText)) ?? []).filter(step=>step.scale!==scale.scale);
    const collisions=grounded.filter(({wire,range})=>range[0]===start && range[1]===to &&
      field(wire,'attribute')!==attribute && propertyFor(wire).some(key=>
        key.values.includes(field(wire,'value')) && senses.some(step=>key.values.includes(step.value))));
    if (collisions.length===1) {
      const [rival]=collisions;
      if (!wires.some(w=>w!==rival.wire && Object.values(w.attrs).flat().includes('$'+rival.wire.id)))
        drop.add(rival.wire);
    }
  }

  for (const wire of wires) {
    if (wire===request || drop.has(wire) || wire.type==='w.request.unread') continue;
    const evidence=Object.keys(wire.attrs).filter(key=>literalField(key) &&
      !(wire===target && key==='description'));
    if (wire.type===constraintType && !wire.attrs.words) evidence.push('value');
    if (evidence.some(key=>fields(wire,key).some(value=>literalRanges(text,value,...scope)
      .some(([a,b])=>a<to && b>from)))) return;
  }
  const ids=new Set(wires.map(w=>w.id));
  let id=target.id+'.scale';
  for (let n=2;ids.has(id);n++) id=target.id+'.scale'+n;
  const kept=consumeUnread(wires.filter(w=>!drop.has(w)),text,from,to);
  const sized={id,type:constraintType,attrs:{request:[ref],on:[on],attribute:[atom(attribute)],value:[atom(value)],
    words:[JSON.stringify(surface)],operator:['degree'],phase:[phase]}};
  return {sop:serialize([...kept,sized]),source:'nominal-scale',
    status:kept.some(w=>w.type==='w.request.unread') ? 'partial' : candidate.status};
}
