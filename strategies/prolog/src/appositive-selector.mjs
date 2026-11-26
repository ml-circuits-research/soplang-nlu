import { parse, serialize, str } from './knowledge.mjs';
import { literalRanges, sortRanges } from './evidence.mjs';
import { tokens } from './lexicon.mjs';
import { quotedSpans } from './literal-roles.mjs';
import { nativeInventory } from './native-inventory.mjs';
import { writtenSpatialAnchor } from './spatial-anchor.mjs';

const ns='w.request.';
const form=text=>tokens(text ?? '').map(([term])=>term).join(' ');
const value=(wire,key)=>str(wire?.attrs[key]?.[0]);
const values=(wire,key)=>(wire.attrs[key] ?? []).map(str);
const word=/^[\p{L}\p{M}\p{N}_]+$/u;
const definite=new Set(['definite','demonstrative']);
const articles=new Set([...definite,'indefinite']);
const tokenText=ts=>ts.map(([term])=>term).join(' ');
const identity=(...parts)=>JSON.stringify(parts);

export function compileAppositiveSelectors(facts,requestKeys,words=facts('core.word')) {
  const proforms=new Set(facts('w.lang.en.phrase').filter(wire=>value(wire,'name')==='elide.noun')
    .flatMap(wire=>values(wire,'item').map(form)).filter(Boolean));
  const bindings=facts('pro.reader.appositive_selector').flatMap(wire=>{
    const [family,attribute,itemType,itemField]=
      ['family','attribute','item_type','item_field'].map(key=>value(wire,key));
    const markers=values(wire,'text').map(form).filter(Boolean);
    const classes=new Set(values(wire,'item_value'));
    if (!markers.length || !itemType || Boolean(itemField)!==Boolean(classes.size) ||
        !requestKeys.some(row=>row.family===family && row.name===attribute &&
          !row.values.length && row.head.split('+').some(head=>['span','candidate'].includes(head)))) return [];
    const items=nativeInventory(type=>type===itemType && itemField
      ? facts(type).filter(item=>values(item,itemField).some(label=>classes.has(label))) : facts(type),itemType,words);
    const subjects=values(wire,'subject_type').map(type=>nativeInventory(facts,type,words));
    return items.size ? [{family,attribute,markers,items,subjects}] : [];
  });
  const adjacentHeads=new Set(bindings.filter(binding=>binding.subjects.length)
    .flatMap(binding=>binding.markers.map(marker=>marker.split(' ')[0])));
  return {bindings,proforms,adjacentHeads};
}

function positive(text,ts,worlds,permit) {
  if (!permit(text,[]) || ts.some(([key])=>worlds.scopeGrammar.endings.has(key))) return false;
  return !ts.some((_,i)=>Array.from({length:Math.min(5,ts.length-i)},(_unused,j)=>tokenText(ts.slice(i,i+j+1)))
    .some(key=>worlds.negatives.has(key) || worlds.scopeGrammar.negatives.has(key) ||
      worlds.scopeGrammar.conditionals.has(key) || worlds.scopeGrammar.predicateNegators.has(key)));
}

function exact(text,literal,start=0,end=text.length) {
  const matches=literalRanges(text,literal,start,end);
  return matches.length===1 ? matches[0] : undefined;
}

function targetHead(text,target) {
  const explicit=value(target,'sort_words') ?? value(target,'family_words');
  if (explicit) return exact(text,explicit);
  const ranges=sortRanges(text,value(target,'sort'));
  return ranges.length===1 ? ranges[0] : undefined;
}

function predicateRoles(worlds) {
  const cache=new Map();
  return (predicate,family)=>{
    const id=identity(predicate,family);
    if (cache.has(id)) return cache.get(id);
    const declared=(worlds.topicCommands ?? []).filter(row=>row.family===family && form(row.predicate)===predicate);
    const roles=new Set(declared.map(row=>identity(row.act,row.attribute)));
    const resolved=roles.size===1 ? roles.values().next().value : undefined;
    cache.set(id,resolved);
    return resolved;
  };
}

function typedItem(binding,input,worlds,allowedDeterminers=definite,allowBare=false) {
  if (!input.length || input.some(([term])=>!word.test(term) || worlds.joiners[term])) return false;
  const start=Number(allowedDeterminers.has(worlds.determiners[input[0][0]]));
  if (!start && !allowBare) return false;
  for (let i=start;i<input.length;i++) {
    if (binding.items.get(tokenText(input.slice(i)))?.size!==1) continue;
    const modifiers=input.slice(start,i);
    if (modifiers.every(([term])=>!worlds.evidenceVocabulary.grammar.has(term) &&
      !worlds.lookup(term).some(([role])=>['act','marker','reference'].includes(role)))) return true;
  }
  return false;
}

function finiteResult(wire,family,operand,worlds) {
  if (value(wire,'on')!=='attribute' || value(wire,'operator')!=='eq' || wire.attrs.open_value || wire.attrs.want ||
      wire.attrs.value?.length!==1 || form(value(wire,'words') ?? value(wire,'value'))!==form(operand)) return false;
  const attribute=value(wire,'attribute'), canonical=value(wire,'value'), surface=form(operand);
  const key=worlds.requestKeys.find(key=>key.family===family && key.name===attribute && key.values.includes(canonical));
  if (!key) return false;
  const readings=new Set(key.values.filter(item=>form(item.replaceAll('_',' '))===surface));
  for (const [body] of worlds.ownerPropertyValues?.get(identity(family,surface)) ?? []) {
    const [fact]=parse('@value '+ns+'constraint '+body);
    const choice=value(fact,'value');
    if (value(fact,'attribute')===attribute && !fact.attrs.open_value && key.values.includes(choice)) readings.add(choice);
  }
  return readings.size===1 && readings.has(canonical);
}

export function createAppositiveSelectorReader(worlds) {
  const bindings=worlds.appositiveSelectors?.bindings ?? [];
  const resolveRole=predicateRoles(worlds);
  return (text,candidate,permit)=>{
    if (!bindings.length || text.length>240 || !text.includes(',') || !candidate.sop?.includes(' phase=result')) return;
    const ts=tokens(text), parts=ts.flatMap(([term],i)=>term===',' ? [i] : []);
    if (parts.length!==2) return;
    const [a,b]=parts, chars=Array.from(text);
    const span=(start,end)=>chars.slice(ts[start][2],ts[end-1][3]).join('');
    const subject=ts.slice(0,a), appositive=ts.slice(a+1,b), suffix=ts.slice(b+1);
    if (['.','!'].includes(suffix.at(-1)?.[0])) suffix.pop();
    if (!subject.length || !suffix.length || appositive.length<5 ||
        !definite.has(worlds.determiners[subject[0][0]]) ||
        worlds.determiners[appositive[0][0]]!=='definite' ||
        !worlds.appositiveSelectors.proforms.has(appositive[1][0]) ||
        [...subject,...appositive,...suffix].some(([term])=>!word.test(term)) ||
        quotedSpans(text).length || !positive(text,ts,worlds,permit)) return;
    const wires=parse(candidate.sop), requests=wires.filter(wire=>wire.type===ns+'request');
    if (requests.length!==1) return;
    const [request]=requests, owner='$'+request.id;
    const act=value(request,'act'),predicate=value(request,'predicate');
    if (value(request,'mood')!=='do' || !predicate) return;
    const local=wires.filter(wire=>value(wire,'request')===owner);
    const targets=local.filter(wire=>wire.type===ns+'target');
    if (targets.length!==1 || value(targets[0],'mode')!=='existing' || targets[0].attrs.name) return;
    const [target]=targets, family=value(target,'family');
    const writtenSubject=span(0,a), description=span(0,b);
    if (!targetHead(writtenSubject,target) || !worlds.literalGrammar.licenses(family,act)) return;
    if (target.attrs.description && ![writtenSubject,description].includes(value(target,'description'))) return;
    const later=span(b+1,b+1+suffix.length), pred=exact(later,predicate);
    if (!pred || pred[0]!==0 || !/^\s/u.test(later.slice(pred[1]))) return;
    const operand=later.slice(pred[1]).trim();
    const scoped=value(request,'words');
    if (scoped) {
      const range=exact(text,scoped);
      if (!range || range[0]>0 || range[1]<text.indexOf(later)+later.length) return;
    }
    const effects=local.filter(wire=>wire.type===ns+'constraint' && value(wire,'phase')==='result');
    if (effects.length!==2) return;
    const outcome=effects.find(wire=>finiteResult(wire,family,operand,worlds));
    if (!outcome) return;
    const selector=effects.find(wire=>wire!==outcome);
    const possible=bindings.filter(binding=>binding.family===family && binding.attribute===value(selector,'attribute'));
    if (!possible.length || value(selector,'on')!=='attribute' || value(selector,'operator')!=='eq' ||
        selector.attrs.want || selector.attrs.value?.length!==1 || selector.attrs.thing) return;
    const matches=possible.flatMap(binding=>binding.markers.flatMap(marker=>{
      const count=marker.split(' ').length+2;
      const item=appositive.slice(count);
      if (tokenText(appositive.slice(2,count))!==marker || !typedItem(binding,item,worlds)) return [];
      const written=span(a+1+count,b);
      return written===value(selector,'value') && (!selector.attrs.words || written===value(selector,'words')) ? [written] : [];
    }));
    if (new Set(matches).size!==1 || resolveRole(form(predicate),family)!==identity(act,value(outcome,'attribute'))) return;
    target.attrs.description=[JSON.stringify(description)];
    selector.attrs.phase=['selector'];
    return {...candidate,sop:serialize(wires),source:'appositive-selector'};
  };
}

function spatialMarkers(ts,start,worlds,match) {
  const markers=[];
  for (let end=start+1;end<=Math.min(start+5,ts.length);end++) {
    const entries=worlds.lookup(tokenText(ts.slice(start,end)));
    const meanings=new Set(entries.filter(entry=>entry[0]==='marker' && match(entry)).map(entry=>entry[3]));
    if (meanings.size===1) markers.push({end,value:[...meanings][0]});
  }
  return markers;
}

function typedSubject(ts,start,binding,worlds,expected) {
  if (!definite.has(worlds.determiners[ts[start]?.[0]])) return;
  for (let at=start+1;at<Math.min(start+8,ts.length);at++) {
    if (!word.test(ts[at][0]) || worlds.joiners[ts[at][0]]) break;
    for (let headEnd=at+1;headEnd<=Math.min(at+5,ts.length);headEnd++) {
      const head=tokenText(ts.slice(at,headEnd));
      const known=binding.subjects.some(forms=>forms.get(head)?.size===1 &&
        (!expected || head===expected || forms.get(head).has(expected.replaceAll(' ','_'))));
      if (!known) continue;
      for (const marker of binding.markers) {
        const itemStart=headEnd+marker.split(' ').length;
        if (tokenText(ts.slice(headEnd,itemStart))===marker) return {headEnd,itemStart};
      }
    }
    if (worlds.evidenceVocabulary.grammar.has(ts[at][0]) || worlds.lookup(ts[at][0]).some(([role])=>
      ['act','marker','reference'].includes(role))) break;
  }
}

function adjacentItems(ts,start,binding,worlds,terminal=false) {
  const coordinated=[];
  let at=start;
  while (at<ts.length) {
    let itemEnd;
    for (let end=at+1;end<=Math.min(at+8,ts.length);end++) {
      if (!typedItem(binding,ts.slice(at,end),worlds,articles,coordinated.length>0)) continue;
      if (terminal && end===ts.length) return {items:[...coordinated,[at,end]],boundary:end};
      if (!terminal) {
        const amount=worlds.motionAmountPhrases.find(terms=>terms.every((term,i)=>ts[end+i]?.[0]===term));
        const next=end+(amount?.length ?? 0);
        if (spatialMarkers(ts,next,worlds,([,act,slot])=>act==='place' && ['place','source'].includes(slot)).length) {
          return {items:[...coordinated,[at,end]],boundary:end,placement:next};
        }
      }
      if (worlds.joiners[ts[end]?.[0]]==='coordination') {
        itemEnd=end;
        break;
      }
    }
    if (!itemEnd) return;
    coordinated.push([at,itemEnd]);
    at=itemEnd+1;
  }
}

function exactRegion(ts,family,spatial,worlds) {
  const choices=(worlds.nominalPositions.get(family)?.get(ts[0]?.[0]) ?? [])
    .filter(([words,key,,,operator])=>key===spatial.regionKey && operator==='region' &&
      words.join(' ')===tokenText(ts));
  if (choices.length===1) return choices[0];
}

// A qualified landmark may contain its own coordinated nominal modifiers.
function qualifiedLandmark(ts,start,end,binding,spatial,worlds,span) {
  const regionEnd=ts.findIndex(([term],i)=>i>=start && i<end && term===',');
  const stop=regionEnd<0 ? end : regionEnd;
  if (stop<end && !exactRegion(ts.slice(stop+1,end),binding.family,spatial,worlds)) return;
  const keys=worlds.requestKeys.filter(key=>key.family===binding.family);
  const bank=keys.find(key=>key.name===spatial.relationKey)?.values ?? [];
  if (!keys.some(key=>key.name===spatial.anchorKey && key.head==='fill+span' && !key.values.length)) return;
  const local=ts.slice(0,stop);
  const choices=[];
  for (let at=start;at<stop;at++) {
    if (!word.test(ts[at][0]) || worlds.joiners[ts[at][0]]) break;
    for (const marker of spatialMarkers(local,at,worlds,([,act,slot,sense])=>bank.includes(sense) &&
      (act==='place' && slot==='place' || act==='*' && slot==='spatial'))) {
      const subject=typedSubject(local,marker.end,binding,worlds);
      if (!subject || !adjacentItems(local,subject.itemStart,binding,worlds,true)) continue;
      choices.push({marker:span(at,marker.end),value:marker.value,anchor:span(marker.end,stop),exact:at===start && stop===end});
    }
  }
  if (choices.length===1) return choices[0];
}

// A typed nominal modifier belongs to the existing target. A separately
// witnessed placement survives; a loose destination fragment cannot move it.
export function adjacentSelectorReading(text,candidate,worlds,permit,ts=tokens(text)) {
  if (text.length>240 || ts.length<7 || quotedSpans(text).length ||
      !ts.some(([term])=>worlds.appositiveSelectors.adjacentHeads.has(term))) return;
  const wires=parse(candidate.sop), requests=wires.filter(wire=>wire.type===ns+'request');
  if (requests.length!==1 || wires.some(wire=>[ns+'context',ns+'previous',ns+'clock'].includes(wire.type))) return;
  const [request]=requests, owner='$'+request.id, predicate=value(request,'predicate');
  if (value(request,'act')!=='place' || ![undefined,'do'].includes(value(request,'mood')) || request.attrs.polarity ||
      !predicate || !worlds.lookup(form(predicate)).some(([role,act])=>role==='act' && act==='place')) return;
  const local=wires.filter(wire=>value(wire,'request')===owner);
  const targets=local.filter(wire=>wire.type===ns+'target');
  const [target]=targets, family=value(target,'family');
  if (targets.length!==1 || value(target,'mode')!=='existing' || target.attrs.name ||
      !positive(text,ts,worlds,permit)) return;
  const pivot=exact(text,predicate);
  if (!pivot) return;
  const chars=Array.from(text), span=(a,b)=>chars.slice(ts[a][2],ts[b-1][3]).join('');
  const end=ts.length-Number(['.','!','?'].includes(ts.at(-1)?.[0]));
  const predicateOffset=Array.from(text.slice(0,pivot[0])).length;
  const predicateStart=ts.findIndex(([, ,start])=>start===predicateOffset);
  if (predicateStart<0) return;
  const first=predicateStart+tokens(predicate).length;
  const lead=tokenText(ts.slice(0,predicateStart)).replace(/ ,$/u,'');
  if (lead && !worlds.literalGrammar.leads.has(lead) && !worlds.fillerPhrases.has(lead)) return;
  const scoped=value(request,'words');
  if (scoped && form(scoped).replace(/ [.!?]$/u,'')!==tokenText(ts.slice(0,end))) return;
  const expected=form(value(target,'sort_words') ?? value(target,'family_words') ?? value(target,'sort'));
  if (!expected) return;
  const clause=ts.slice(0,end);
  for (const binding of worlds.appositiveSelectors.bindings) {
    if (binding.family!==family || !binding.subjects.length) continue;
    const spatial=worlds.spatialBindings.find(row=>row.family===family);
    if (!spatial) continue;
    const subject=typedSubject(clause,first,binding,worlds,expected);
    if (!subject) continue;
    const {headEnd,itemStart}=subject;
    const match=adjacentItems(clause,itemStart,binding,worlds);
    if (!match || match.placement>=end-1) continue;
    const description=span(first,match.boundary), subjectBase=span(first,headEnd);
    if (target.attrs.description && ![description,subjectBase].includes(value(target,'description'))) continue;
    const suffix=span(match.boundary,end);
    const placement=span(match.placement,end);
    const bare=match.boundary===match.placement;
    const tail=clause.slice(match.placement);
    const region=bare ? exactRegion(tail,family,spatial,worlds) : undefined;
    const qualified=qualifiedLandmark(clause,match.placement,end,binding,spatial,worlds,span);
    if (!qualified && tail.some(([term])=>!word.test(term) || worlds.joiners[term])) continue;
    const placed=bare && !region ?
      qualified ?? writtenSpatialAnchor(span(predicateStart,headEnd)+' '+placement,target,request,spatial,worlds,permit)
      : undefined;
    const anchored=placed && (qualified ? qualified.exact : form(placement)===form(placed.marker+' '+placed.anchor));
    const keep=local.filter(wire=>wire.type===ns+'constraint' && value(wire,'phase')==='selector' &&
      value(wire,'on')!=='place' && value(wire,'attribute')!==binding.attribute &&
      exact(subjectBase,value(wire,'words') ?? value(wire,'value') ?? ''));
    const retained=wires.filter(wire=>!local.includes(wire) || wire===target ||
      keep.includes(wire) || wire.type===ns+'lookup' && value(wire,'target')==='$'+target.id);
    target.attrs.description=[JSON.stringify(description)];
    if (lead) request.attrs.words=[JSON.stringify(text)];
    const add=(type,attrs)=>{
      let id=target.id+'.'+type;
      while (retained.some(wire=>wire.id===id)) id+='_';
      retained.push({id,type:ns+type,attrs:{request:[owner],...attrs}});
      return '$'+id;
    };
    for (const [a,b] of match.items) add('constraint',{
      on:['attribute'],attribute:[binding.attribute],value:[JSON.stringify(span(a,b))],operator:['eq'],phase:['selector'],
    });
    if (region) {
      const [,attribute,regionValue,on,operator]=region;
      add('constraint',{on:[on],attribute:[attribute],value:[regionValue],words:[JSON.stringify(placement)],
        operator:[operator],phase:['result']});
    }
    if (anchored) {
      add('constraint',{on:['place'],attribute:[spatial.relationKey],value:[placed.value],
        words:[JSON.stringify(placed.marker)],operator:['relation'],phase:['result']});
      const anchor=add('constraint',{on:['place'],attribute:[spatial.anchorKey],value:[JSON.stringify(placed.anchor)],
        operator:['relation'],phase:['selector']});
      add('lookup',{constraint:[anchor],key:['thing'],from:['page']});
    }
    const matched=Boolean(anchored || region);
    if (!matched) add('unread',{text:[JSON.stringify(suffix)],note:['"unresolved destination"']});
    return {...candidate,sop:serialize(retained),source:'adjacent-selector',status:matched?'matched':'partial'};
  }
}
