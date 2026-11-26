import {parse,serialize,str} from './knowledge.mjs';
import {quotedSpans} from './literal-roles.mjs';
import {tokens} from './lexicon.mjs';
import {literalRanges} from './evidence.mjs';

const type=name=>'w.request.'+name;
export const landmarkPairType='w.relational.landmark_pair';
const field=(wire,key)=>str(wire.attrs[key]?.[0]);
const normalized=text=>tokens(text).map(([key])=>key);
const word=/^[\p{L}\p{M}\p{N}_-]+$/u;
const proper=/^\p{Lu}[\p{L}\p{M}\p{N}_-]*$/u;
const quote=JSON.stringify;
const writtenAnchorKey=(key,{family,anchorKey})=>key.family===family &&
  key.name===anchorKey && key.head==='fill+span' && !key.values.length;

export function landmarkSelectorsMatchCatalog(wires,worlds) {
  const pairs=wires.filter(wire=>wire.type===landmarkPairType);
  if (!pairs.length) return true;
  const references=new Map(wires.map(wire=>['$'+wire.id,wire]));
  return pairs.every(pair=>{
    const target=references.get(field(pair,'affected'));
    const selectors=['first','second'].map(role=>references.get(field(pair,role)));
    if (!target || !selectors.every(selector=>
      selector?.attrs.value?.length===1 && field(selector,'value')?.trim())) return false;
    return worlds.spatialBindings.some(binding=>binding.family===field(target,'family') &&
      selectors.every(selector=>field(selector,'attribute')===binding.anchorKey) &&
      worlds.requestKeys.some(key=>writtenAnchorKey(key,binding)));
  });
}

export function compileLandmarkPairs(facts) {
  return facts('pro.reader.landmark_pair').flatMap(wire=>
    (wire.attrs.text ?? []).map(raw=>({
      marker:normalized(str(raw)),mode:field(wire,'mode'),relation:field(wire,'relation'),joiner:field(wire,'joiner'),
      leads:new Set((wire.attrs.lead ?? []).map(raw=>normalized(str(raw)).join(' '))),
    })).filter(entry=>entry.marker.length && entry.relation && entry.joiner && ['between','midpoint'].includes(entry.mode)));
}

function writtenLandmark(terms,worlds) {
  if (!terms.length) return false;
  if (terms.every(([,raw])=>proper.test(raw))) {
    return terms.length===1 || !terms.slice(0,-1).some(([key])=>worlds.lookup(key).some(([role])=>role==='act'));
  }
  const [head]=terms[0];
  if (!['definite','demonstrative'].includes(worlds.determiners[head])) return false;
  return terms.slice(1).some((_,i)=>{
    const modifiers=terms.slice(1,i+1);
    if (modifiers.some(([key])=>worlds.determiners[key] || worlds.scopeGrammar.auxiliary.has(key) ||
        worlds.lookup(key).some(([role])=>role==='act' || role==='marker'))) return false;
    const head=terms.slice(i+1).map(([key])=>key).join(' ');
    return worlds.lookup(head).some(([role])=>role==='target');
  });
}

function attach(text,body,candidate,plan,binding,worlds) {
  const wires=parse(candidate.sop);
  const requests=wires.filter(w=>w.type===type('request'));
  if (requests.length!==1) return;
  const [request]=requests, ref='$'+request.id;
  const act=field(request,'act'), predicate=field(request,'predicate'), mood=field(request,'mood');
  if (!binding.namedActs.includes(act) || !worlds.literalGrammar.licenses(binding.family,act) || !predicate || ![undefined,'do','propose'].includes(mood) || request.attrs.polarity) return;
  const targets=wires.filter(w=>w.type===type('target'));
  if (targets.length>1 || targets.some(w=>field(w,'request')!==ref || field(w,'family')!==binding.family)) return;
  if (!targets.length && field(request,'refers')!=='thing') return;
  const [predicateSpan]=literalRanges(body,predicate);
  const lead=predicateSpan && body.slice(0,predicateSpan[0]).trim().replace(/,$/u,'').trim();
  const lexicalLead=lead && normalized(lead).join(' ');
  for (const wire of wires.filter(w=>w.type===type('unread'))) {
    const phrase=field(wire,'text');
    const key=phrase && normalized(phrase).join(' ');
    if (!key || key!==lexicalLead || !plan.leads.has(key) &&
        !worlds.fillerPhrases.has(key) && !worlds.literalGrammar.leads.has(key)) return;
    wire.type=type('filler');
    wire.attrs={text:[quote(phrase)]};
  }
  const prior=field(request,'words');
  if (prior && !literalRanges(body,prior).length) return;
  if (wires.some(w=>w.type===type('constraint') && field(w,'phase')==='result' &&
      [binding.anchorKey,binding.relationKey].includes(field(w,'attribute')))) return;
  const ids=new Set(wires.map(w=>w.id));
  const nextId=suffix=>{
    let id=request.id+'.pair.'+suffix;
    while (ids.has(id)) id+='_';
    ids.add(id);
    return id;
  };
  const add=(suffix,type,fields)=>{
    const id=nextId(suffix);
    wires.push({id,type,attrs:Object.fromEntries(Object.entries(fields).map(([key,value])=>[key,[value]]))});
    return '$'+id;
  };
  const affected=targets.length ? '$'+targets[0].id : add('target',type('target'),{
    request:ref,family:quote(binding.family),mode:'existing',fill:'context',
  });
  if (!wires.some(w=>w.type===type('lookup') && field(w,'target')===affected)) {
    add('targetLookup',type('lookup'),{request:ref,target:affected,key:'thing',from:'any'});
  }
  add('position',type('constraint'),{request:ref,on:'place',attribute:quote(binding.relationKey),
    value:quote(plan.relation),words:quote(plan.marker),operator:'relation',phase:'result'});
  const anchor=(slot,surface)=>{
    const constraint=add(slot,type('constraint'),{request:ref,on:'place',attribute:quote(binding.anchorKey),
      value:quote(surface),operator:'relation',phase:'selector'});
    add(slot+'Lookup',type('lookup'),{request:ref,constraint,key:'thing',from:'page'});
    return constraint;
  };
  const first=anchor('first',plan.first), second=anchor('second',plan.second);
  add('relation',landmarkPairType,{request:ref,affected,first,second,mode:plan.mode,words:quote(plan.words)});
  request.attrs.words=[quote(text)];
  return {sop:serialize(wires),source:'landmark-pair',status:'matched'};
}

export async function landmarkPairReadings(text,worlds,read,permit,parseClause) {
  const frames=worlds.landmarkPairs;
  if (!frames?.length || !worlds.validationModules?.types.has(landmarkPairType) || quotedSpans(text).length) return [];
  const ts=tokens(text), chars=Array.from(text);
  if (ts.length<5 || ts.length>44) return [];
  const outline=ts.map(([key])=>key);
  if (!frames.some(({marker})=>outline.includes(marker[0])) || !permit(text,[])) return [];
  const end=outline.length-Number(['.','!','?'].includes(outline.at(-1)));
  const tokenKeys=outline.slice(0,end);
  const active=frames.filter(frame=>worlds.joiners[frame.joiner]==='coordination');
  const blocked=[...new Set(tokenKeys.filter(key=>!word.test(key) || worlds.joiners[key] ||
    worlds.negatives.has(key) || worlds.scopeGrammar.conditionals.has(key) || worlds.isReference(key)))];
  const matches=await parseClause({tokens:tokenKeys,
    markers:active.map(({marker,mode,joiner})=>[marker,mode,joiner]),blocked});
  if (matches.length!==1) return [];
  const [{head,marker,mode,first,second}]=matches;
  const span=([from,to])=>chars.slice(ts[from][2],ts[to-1][3]).join('');
  if (normalized(span(first)).join(' ')===normalized(span(second)).join(' ')) return [];
  const licensed=active.filter(frame=>frame.mode===mode && frame.joiner===tokenKeys[first[1]] &&
    frame.marker.join(' ')===tokenKeys.slice(...marker).join(' '));
  const relation=new Set(licensed.map(frame=>frame.relation));
  if (relation.size!==1) return [];
  const body=span(head);
  const plan={mode,marker:span(marker),first:span(first),second:span(second),words:span([marker[0],end]),relation:[...relation][0],
    leads:new Set(licensed.flatMap(frame=>[...frame.leads]))};
  const admissible=worlds.spatialBindings.filter(binding=>worlds.requestKeys.some(key=>writtenAnchorKey(key,binding)) &&
    worlds.requestKeys.some(key=>
    key.family===binding.family && key.name===binding.relationKey && key.values.includes(plan.relation)) &&
    writtenLandmark(ts.slice(...first),worlds) && writtenLandmark(ts.slice(...second),worlds));
  if (!admissible.length) return [];
  const candidates=await read(body);
  return candidates.flatMap(candidate=>admissible.map(binding=>attach(text,body,candidate,plan,binding,worlds)).filter(Boolean));
}
