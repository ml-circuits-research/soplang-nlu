import { parse, serialize } from './knowledge.mjs';
import { literalRanges } from './evidence.mjs';
import { tokens } from './lexicon.mjs';
import { quotedSpans } from './literal-roles.mjs';
import { consumeUnread } from './nominal-evidence.mjs';

const type=name=>'w.request.'+name;
const field=(wire,key)=>{
  const raw=wire?.attrs[key]?.[0];
  return raw?.startsWith('"') ? JSON.parse(raw) : raw;
};
const quote=JSON.stringify;
const word=/^[\p{L}\p{M}\p{N}_]+$/u;
const boundary=/^[,;.!?—–，。！？；]$/u;
const forms=text=>tokens(text).map(t=>t[0]).join(' ');
const relationValues=(worlds,binding)=>worlds.requestKeys.find(key=>key.family===binding.family &&
  key.name===binding.relationKey)?.values ?? [];
const definite=(worlds,key)=>['definite','demonstrative'].includes(worlds.determiners[key]);

const landmarkSurfaces = new WeakMap();

function scopedMarkers(worlds,binding) {
  if (!landmarkSurfaces.has(worlds)) {
    const map=new Map();
    for (const wire of worlds.landmarkSurfaceFacts ?? []) {
      const family=field(wire,'family'),value=field(wire,'relation');
      const base=field(wire,'base');
      if (!family || !value || !base) continue;
      const senses=new Set(worlds.lookup(forms(base)).flatMap(([role,act,slot,sense])=>
        role==='marker' && act==='*' && slot==='spatial' ? [sense] : []));
      if (senses.size!==1 || !senses.has(value)) continue;
      const id=family;
      const surfaces=map.get(id) ?? new Map();
      for (const raw of wire.attrs.text ?? []) {
        const words=forms(raw.startsWith('"') ? JSON.parse(raw) : raw);
        if (!words) continue;
        const values=surfaces.get(words) ?? new Set();
        values.add(value);
        surfaces.set(words,values);
      }
      map.set(id,surfaces);
    }
    landmarkSurfaces.set(worlds,map);
  }
  return landmarkSurfaces.get(worlds).get(binding.family);
}

const triggers=new WeakMap();
function hasAnchorTail(text,worlds) {
  if (!triggers.has(worlds)) {
    const terms=Object.entries(worlds.determiners).filter(([,mode])=>mode==='definite')
      .map(([term])=>term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
    triggers.set(worlds,terms.length ? new RegExp('\\s(?:'+terms.join('|')+')\\s+\\p{L}','iu') : null);
  }
  return triggers.get(worlds)?.test(text) || /\s\p{Lu}[\p{L}\p{M}\d_]*(?=\s|[.,;!?]|$)/u.test(text);
}

function owned(text,scope) {
  const hits=literalRanges(text,scope);
  return hits.length===1 ? hits[0] : undefined;
}

function shape(scope,target,request,binding,relation,worlds,permit,siblings) {
  const chars=Array.from(scope), ts=tokens(scope), quotes=quotedSpans(scope);
  const phrase=(a,b)=>ts.slice(a,b).map(([key])=>key).join(' ');
  const span=(a,b)=>chars.slice(ts[a][2],ts[b-1][3]).join('');
  const quoted=(a,b)=>quotes.some(q=>q.start<ts[b-1][3] && q.end>ts[a][2]);
  const noun=field(target,'sort_words') ?? field(target,'family_words') ?? field(target,'sort');
  if (!noun) return;
  const head=forms(noun).split(' ');
  const heads=ts.flatMap((_,i)=>head.every((key,j)=>ts[i+j]?.[0]===key) ? [i] : []);
  if (heads.length!==1) return;
  const [at]=heads;
  const verb=field(request,'predicate'), act=field(request,'act');
  if (verb) {
    const predicate=owned(scope,verb);
    const headStart=chars.slice(0,ts[at][2]).join('').length;
    if (!predicate || predicate[1]>headStart || !worlds.lookup(forms(verb)).some(([role,sense,mood])=>
      role==='act' && (!mood || mood==='do') &&
      (sense===act || ['make','place'].includes(sense) && ['make','place'].includes(act)))) return;
  }
  const start=at+head.length;
  let end=start;
  while (end<ts.length && !boundary.test(ts[end][0])) end++;
  if (start>=end || quoted(at,end) ||
      !permit(span(0,end),quotedSpans(span(0,end)))) return;
  const relationBank=relationValues(worlds,binding);
  if (!relationBank.length) return;
  const choices=[];
  const scoped=['make','place'].includes(act) ? scopedMarkers(worlds,binding) : undefined;
  const markerForms=(a,b)=>worlds.lookup(phrase(a,b)).filter(
    ([role,license,slot,value])=>role==='marker' && relationBank.includes(value) &&
       (license==='*' && slot==='spatial' || license===act && slot==='place'));
  for (let markerAt=start;markerAt<Math.min(start+6,end-1);markerAt++) {
    for (let markerEnd=markerAt+1;markerEnd<Math.min(markerAt+6,end);markerEnd++) {
      const marker=span(markerAt,markerEnd);
      const values=new Set(markerForms(markerAt,markerEnd).map(entry=>entry[3]));
      const alias=!values.size && scoped?.get(phrase(markerAt,markerEnd));
      const markerKey=phrase(markerAt,markerEnd);
      if (alias?.size===1 && markerAt===start && relationBank.includes([...alias][0]) &&
          (field(target,'mode')==='new' || ['definite','demonstrative'].includes(field(target,'determiner')))) {
        values.add([...alias][0]);
      }
      if (relation) {
        const priorValue=field(relation,'value');
        const written=forms(field(relation,'words') ?? priorValue);
        if (written===markerKey) {
          if (!values.has(priorValue)) continue;
          values.clear();
          values.add(priorValue);
        } else continue;

      }
      if (values.size!==1) continue;
      const value=[...values][0];
      const det=ts[markerEnd][0];
      const tail=ts.slice(markerEnd,end);
      if (tail.length>9 || !tail.every(([key])=>word.test(key))) continue;
      if (definite(worlds,det)) {
        // A landmark is a complete noun phrase at the end of this local span.
        // Require a typed terminal noun and keep every written modifier.
        let headAt=markerEnd+1;
        for (;headAt<end;headAt++) {
          const surface=phrase(headAt,end);
          const local=worlds.lookup(surface).flatMap(([role,,family])=>role==='target' ? [family] : []);
          const inventory=(worlds.ownerInventory?.get(JSON.stringify(['change',surface])) ?? [])
            .map(({family})=>family);
          if ([...local,...inventory].some(family=>alias ? family===binding.family :
            worlds.semanticFamilies.has(family)) || !alias &&
            siblings.has(surface)) break;
        }
        if (headAt>=end) continue;
        if (ts.slice(markerEnd+1,headAt).some(([key])=>worlds.joiners[key] || worlds.determiners[key] ||
            worlds.evidenceVocabulary.grammar.has(key) || worlds.scopeGrammar.auxiliary.has(key) ||
            worlds.lookup(key).some(([role])=>['act','marker','reference'].includes(role)))) continue;
      } else {
        // A proper name can select an existing landmark. Keep its spelling
        // as the lookup operand; instance resolution belongs to the next layer.
        if (alias || markerAt!==start || tail.length>4 || !tail.every(([key,raw])=>
            /^\p{Lu}[\p{L}\p{M}\d_]*$/u.test(raw) &&
            !worlds.evidenceVocabulary.grammar.has(key) && !worlds.negatives.has(key) &&
            !worlds.joiners[key] && !worlds.isReference(key))) continue;
      }
      const region=(worlds.nominalPositions.get(binding.family)?.get(ts[markerAt][0]) ?? []).some(
        ([keys,,,,operator])=>operator==='region' && keys.join(' ')===phrase(markerAt,end));
      if (region) continue;
      let interrupted=false;
      for (let i=start;i<markerAt;i++) {
        if (worlds.joiners[ts[i][0]] || worlds.lookup(ts[i][0]).some(([role])=>role==='act') ||
            [1,2,3].some(n=>i+n<=markerAt && markerForms(i,i+n).length)) interrupted=true;
      }
      if (interrupted) continue;
      const from=chars.slice(0,ts[markerAt][2]).join('').length;
      const labelFrom=chars.slice(0,ts[markerEnd][2]).join('').length;
      const to=chars.slice(0,ts[end-1][3]).join('').length;
      choices.push({anchor:span(markerEnd,end),marker,value,from,to,labelFrom});
    }
  }
  // Emphatic markers can share their endpoint with a shorter marker.
  // Keep the fullest grounded form; different anchor spans remain ambiguous.
  const maximal=choices.filter(choice=>!choices.some(other=>other.labelFrom===choice.labelFrom &&
    other.to===choice.to && other.from<choice.from));
  return maximal.length===1 ? maximal[0] : undefined;
}

export function writtenSpatialAnchor(text,target,request,binding,worlds,permit) {
  if (!worlds.requestKeys.some(key=>key.family===binding.family &&
      key.name===binding.anchorKey && key.head==='fill+span' && !key.values.length)) return;
  return shape(text,target,request,binding,undefined,worlds,permit,new Set());
}

export function spatialAnchorReadings(text,candidate,worlds,permit) {
  if (!candidate.sop?.includes(' '+type('unread')+' ') ||
      !candidate.sop.includes(' '+type('target')+' ') || !hasAnchorTail(text,worlds)) return [];
  const wires=parse(candidate.sop), requests=wires.filter(w=>w.type===type('request'));
  const targets=wires.filter(w=>w.type===type('target'));
  const placements=[];
  const scopes=new Map();
  let next=0;
  for (const request of requests) {
    const scope=field(request,'words') ?? (requests.length===1 ? text : undefined);
    const bounds=literalRanges(text,scope,next)[0];
    if (!bounds) continue;
    scopes.set(request.id,{scope,bounds});
    next=bounds[1];
  }
  for (const request of requests) {
    if (request.attrs.polarity || ['ask','check'].includes(field(request,'mood'))) continue;
    const ref='$'+request.id;
    const members=targets.filter(w=>field(w,'request')===ref);
    if (members.length!==1) continue;
    const [target]=members, family=field(target,'family');
    const local=wires.filter(w=>field(w,'request')===ref);
    const declared=scopes.get(request.id);
    if (!declared) continue;
    const {scope,bounds}=declared;
    const unread=local.filter(w=>w.type===type('unread')).map(w=>owned(scope,field(w,'text'))).filter(Boolean);
    if (!unread.length) continue;
    for (const binding of worlds.spatialBindings.filter(b=>b.family===family)) {
      if (!worlds.requestKeys.some(key=>key.family===family &&
          key.name===binding.anchorKey && key.head==='fill+span' && !key.values.length)) continue;
      const relations=local.filter(w=>field(w,'attribute')===binding.relationKey);
      const anchors=local.filter(w=>field(w,'attribute')===binding.anchorKey);
      if (relations.length>1 || anchors.length>1 || anchors.length && !relations.length) continue;
      const [relation]=relations,[anchor]=anchors;
      if (relation && (field(relation,'on')!=='place' || field(relation,'operator')!=='relation' ||
          field(relation,'phase')!=='result' || relation.attrs.want) ||
          anchor && (field(anchor,'phase')!=='selector' || field(anchor,'operator')!=='relation' || anchor.attrs.want)) continue;
      const mode=field(target,'mode'), act=field(request,'act');
      if (!(mode==='new' && act==='make' ||
          mode==='existing' && (act==='place' || act==='change' && relation))) continue;
      const siblings=new Set(targets.flatMap(w=>{
        const owner=field(w,'request')?.slice(1);
        const source=scopes.get(owner);
        const noun=field(w,'sort_words') ?? field(w,'family_words') ?? field(w,'sort');
        return owner!==request.id && source?.bounds[1]<=bounds[0] && field(w,'mode')==='new' &&
          worlds.semanticFamilies.has(field(w,'family')) && owned(source.scope,noun) ? [forms(noun)] : [];
      }));
      const placement=shape(scope,target,request,binding,relation,worlds,permit,siblings);
      if (!placement) continue;
      const {from,to,marker,value,anchor:words}=placement;
      if (!unread.some(([a,b])=>a<to && b>from)) continue;
      if (local.some(w=>w.type===type('constraint') && w!==anchor && w!==relation &&
          ['words','key_words',...(w.attrs.words ? [] : ['value'])].some(key=>{
            const evidence=field(w,key), at=evidence && owned(scope,evidence);
            return at && at[0]<to && at[1]>placement.labelFrom;
          }))) continue;
      if (anchor) {
        const prior=forms(field(anchor,'value'));
        if (!forms(words).startsWith(prior+' ')) continue;
      }
      const existingLookups=anchor ? wires.filter(w=>w.type===type('lookup') &&
        field(w,'constraint')==='$'+anchor.id) : [];
      if (existingLookups.some(w=>field(w,'request')!==ref || field(w,'key')!=='thing')) continue;
      if (anchor && (Object.keys(anchor.attrs).some(key=>
          !['request','on','attribute','value','operator','phase'].includes(key)) ||
        wires.some(w=>!existingLookups.includes(w) && Object.values(w.attrs).flat().includes('$'+anchor.id)))) continue;
      placements.push({ref,apply(related) {
        const used=new Set(related.map(w=>w.id));
        function id(suffix) {
          const base=request.id+suffix;
          let next=base;
          for (let i=2;used.has(next);i++) next=base+i;
          used.add(next);
          return next;
        }
        const anchorId=anchor?.id ?? id('.landmark');
        const nextAnchor={id:anchorId,type:type('constraint'),attrs:{request:[ref],on:['place'],
          attribute:[binding.anchorKey],value:[quote(words)],operator:['relation'],phase:['selector']}};
        const enriched=related.map(w=>{
          if (w===anchor) return nextAnchor;
          return w;
        });
        if (!relation) enriched.push({id:id('.relation'),type:type('constraint'),attrs:{request:[ref],on:['place'],
          attribute:[binding.relationKey],value:[value],words:[quote(marker)],operator:['relation'],phase:['result']}});
        if (!anchor) enriched.push(nextAnchor);
        if (!existingLookups.length) enriched.push({id:id('.landmarkLookup'),type:type('lookup'),attrs:{
          request:[ref],constraint:['$'+anchorId],key:['thing'],from:['page']}});
        return consumeUnread(enriched,scope,from,to,w=>field(w,'request')===ref);
      }});
    }
  }
  if (!placements.length) return [];
  const groups=[...Map.groupBy(placements,option=>option.ref).values()];
  const compatible=groups.filter(group=>group.length===1).flat();
  const competing=groups.filter(group=>group.length>1).flat();
  const combined=compatible.reduce((current,option)=>option.apply(current),wires);
  // Independent placements compose across request owners. A competing binding
  // gets its own candidate with the unambiguous placements.
  const circuits=competing.length ? competing.map(option=>option.apply(combined)) : [combined];
  return circuits.map(circuit=>({sop:serialize(circuit),source:'spatial-anchor',
    status:circuit.some(w=>w.type===type('unread')) ? 'partial' : 'matched'}));
}
