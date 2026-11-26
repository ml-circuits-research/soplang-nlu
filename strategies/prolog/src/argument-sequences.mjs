import {parse,serialize} from './knowledge.mjs';
import {tokens} from './lexicon.mjs';
import {consumeUnread} from './nominal-evidence.mjs';
import {literalRanges} from './evidence.mjs';
import {compileStructuredArguments,structuredBank} from './structured-arguments.mjs';

const decode=v=>v?.startsWith('"') ? JSON.parse(v) : v;
const many=(w,k)=>(w.attrs[k] ?? []).map(decode);
const one=(w,k)=>many(w,k)[0];
const keys=s=>tokens(s).map(t=>t[0]);
const encode=s=>JSON.stringify(s);
const ownerPart='$owner';
const predicatePart='$predicate';
const scopePart='$scope';
const unreadPart='$unread';
const identityPart='$identity';
const previousPart='$previous';
const matchesAt=(ts,start,words)=>words.every((word,i)=>ts[start+i]?.[0]===word);
const atom=/^[\p{L}_][\p{L}\p{M}\p{N}_.-]*$/u;

function admittedLead(ts,end,worlds) {
  if (!end) return true;
  const words=ts.slice(0,end).map(([word])=>word).filter(word=>word!==',');
  const known=text=>worlds.fillerPhrases.has(text) || worlds.literalGrammar.leads.has(text) ||
    worlds.scopeGrammar.courtesy.has(text);
  return known(words.join(' ')) ||
    worlds.joiners[words.at(-1)]==='addition' && (words.length===1 || known(words.slice(0,-1).join(' ')));
}

// A fronted location can qualify an instruction without naming its owner.
// Preserve that span until a world supplies the placement binding.
function addressedLead(ts,end,worlds,allowAddition=false) {
  const comma=ts.slice(0,end).findIndex(([word])=>word===',');
  const start=comma<0 && allowAddition && worlds.joiners[ts[0]?.[0]]==='addition' ? 1 : comma+1;
  const lead=ts.slice(start,end).map(([word])=>word);
  const grammar=worlds.scopeGrammar;
  if (!grammar.modals.has(lead[0]) || !grammar.addressees.has(lead[1]) ||
      !worlds.literalGrammar.leads.has(lead.join(' '))) return;
  if (comma<0) return {courtesyStart:ts[start][2]};
  const markerEnd=ts.slice(0,comma).findIndex(([word])=>worlds.determiners[word]==='definite');
  if (markerEnd<1 || markerEnd+1>=comma ||
      !worlds.lookup(ts.slice(0,markerEnd).map(([word])=>word).join(' ')).some(
        ([role,license,slot])=>role==='marker' && license==='*' && slot==='spatial')) return;
  const nominal=ts.slice(markerEnd+1,comma);
  if (!nominal.every(([word])=>/^[\p{L}\p{M}\p{N}_]+$/u.test(word) &&
      !grammar.auxiliary.has(word) && !grammar.conditionals.has(word) &&
      !worlds.negatives.has(word) && !worlds.joiners[word])) return;
  return {courtesyStart:ts[start][2],locationEnd:ts[comma-1][3]};
}

function coordinatedCommandStarts(ts,worlds) {
  const starts=new Set();
  const phrase=(from,to)=>ts.slice(from,to).map(([word])=>word).join(' ');
  for (let start=1;start+2<ts.length;start++) {
    if (!worlds.joiners[ts[start-1][0]]) continue;
    for (let boundary=start+1;boundary<Math.min(start+5,ts.length-1);boundary++) {
      if (worlds.determiners[ts[boundary][0]]!=='definite') continue;
      const acts=worlds.lookup(phrase(start,boundary)).filter(([role,act,mood])=>
        role==='act' && act!=='ask' && (!mood || mood==='do')).map(([,act])=>act);
      if (!acts.length) continue;
      for (let end=boundary+2;end<=Math.min(boundary+5,ts.length);end++) {
        if (worlds.lookup(phrase(boundary+1,end)).some(([role,act,,mode])=>
          role==='target' && mode==='existing' && acts.includes(act))) {
          starts.add(start);
          break;
        }
      }
    }
  }
  return starts;
}

export function argumentSequences(facts,catalog,formats=compileStructuredArguments(facts,catalog)) {
  const forms=new Map();
  const referenceForms=facts('w.lang.en.pron').filter(w=>many(w,'in').includes('acts') &&
    many(w,'refers').includes('thing') && (many(w,'case').includes('demonstrative') ||
      one(w,'person')==='3' && many(w,'case').includes('object')))
    .flatMap(w=>many(w,'text').map(keys)).filter(words=>words.length);
  const conjunctions=facts('w.lang.en.closed').filter(w=>one(w,'class')==='conjunction')
    .flatMap(w=>many(w,'text').map(keys));
  for (const w of facts('core.word')) {
    for (const owner of many(w,'of')) {
      if (!forms.has(owner)) forms.set(owner,[]);
      for (const text of many(w,'text')) for (const value of many(w,'means')) forms.get(owner).push([keys(text),value]);
    }
  }
  const index=new Map();
  for (const w of facts('pro.reader.argument_sequence')) {
    const family=one(w,'family'),act=one(w,'act'),mode=one(w,'mode');
    const props=new Map(catalog.filter(k=>k.family===family).map(k=>[k.name,k]));
    const owners=many(w,'owner').map(keys).filter(words=>words.length), ownerKey=one(w,'owner_key'),ownerValue=one(w,'owner_value');
    const ownerSort=one(w,'owner_sort'), ownerKindType=one(w,'owner_kind_type');
    const sortWords=ownerSort ? keys(ownerSort) : [];
    if (Boolean(ownerSort)!==Boolean(ownerKindType) || ownerSort &&
        (mode!=='new' || !owners.length || !sortWords.length ||
         !facts(ownerKindType).some(kind=>one(kind,'name')===ownerSort) ||
         owners.some(words=>!sortWords.every((word,i)=>word===words[words.length-sortWords.length+i])))) continue;
    const inferred=one(w,'inferred_owner')==='true', contextual=one(w,'contextual_owner')==='true';
    if (inferred && (owners.length || mode!=='new' || ownerKey || contextual) ||
        contextual && (owners.length || mode!=='existing' || ownerKey)) continue;
    const owned=owners.length>0 || inferred || contextual;
    const requestMode=one(w,'request_mode');
    if (requestMode && (!owned || !atom.test(requestMode))) continue;
    const modeMarker=one(w,'mode_marker');
    const predicateBank=many(w,'predicate_surface').map(keys).filter(words=>words.length);
    const scopeAttribute=one(w,'scope_attribute');
    if (scopeAttribute && !catalog.some(key=>key.family==='preference' &&
        key.name===scopeAttribute && key.head==='span' && !key.values.length)) continue;
    const lexicalParts=new Set(many(w,'lexical_part'));
    const structuredParts=new Set(many(w,'structured_part'));
    const transitionKey=one(w,'transition_key');
    const transitionFormat=transitionKey && formats.get(JSON.stringify([family,transitionKey]));
    const literalReference=one(w,'literal_reference')==='true';
    if (literalReference && (!transitionKey || !owners.length || contextual)) continue;
    if (transitionKey && (!owned || mode!=='existing' || !structuredParts.has(transitionKey) ||
        !['scalar_number','positive_count'].includes(transitionFormat))) continue;
    if (Boolean(ownerKey)!==Boolean(ownerValue) || ownerKey && (mode!=='new' || !props.get(ownerKey)?.values.includes(ownerValue))) continue;
    const openFields=new Set();
    const parts=many(w,'part').map(p=>{
      if (p.startsWith('=')) {
        const field=p.slice(1);
        return owned && openFields.has(field) ? {repeat:field} : null;
      }
      if (p===ownerPart) return owners.length ? (mode==='existing' ?
        {key:p,nominal:owners,...literalReference ? {references:referenceForms} : {}} :
        {key:p,bank:owners.map(words=>[words,''])}) : null;
      if (p===predicatePart) return owned && predicateBank.length ? {key:p,bank:predicateBank.map(words=>[words,''])} : null;
      if (p===scopePart) return scopeAttribute ? {key:p,format:'nominal_description'} : null;
      if (p===unreadPart) return owned ? {key:p} : null;
      if (p===identityPart) return owned && mode==='existing' ? {key:p} : null;
      if (p===previousPart) return transitionFormat ? {key:p,format:transitionFormat,argument:transitionKey} : null;
      const prop=props.get(p);
      if (!prop) {
        const literal=keys(p);
        return p.includes('.') || !literal.length ? null : {literal};
      }
      if (structuredParts.has(p)) {
        const format=formats.get(JSON.stringify([family,p]));
        return format && !lexicalParts.has(p) ? {key:p,format} : null;
      }
      if (lexicalParts.has(p)) {
        if (prop.values.length || !prop.head.split('+').includes('span')) return null;
        const bank=[...forms.get(prop.name) ?? [],...forms.get(prop.means) ?? []]
          .filter(([words])=>words.length).map(([words])=>[words,'']);
        return bank.length ? {key:p,bank,lexical:true} : null;
      }
      if (prop.values.length && prop.head.split('+').some(h=>['class','candidate'].includes(h))) {
        const bank=prop.values.map(v=>[keys(v),v]);
        for (const [alias,v] of forms.get(prop.name) ?? []) if (prop.values.includes(v)) bank.push([alias,v]);
        return {key:p,bank};
      }
      if (!prop.head.split('+').includes('span') || prop.values.length) return null;
      openFields.add(p);
      return {key:p};
    });
    if (parts.some(p=>!p)) continue;
    const slots=parts.filter(p=>p.key && p.key!==unreadPart).map(p=>p.key);
    if (slots.length<2 || new Set(slots).size!==slots.length ||
        Boolean(transitionKey)!==slots.includes(previousPart) ||
        transitionKey && slots.indexOf(previousPart)>=slots.indexOf(transitionKey) ||
        [...lexicalParts].some(key=>!slots.includes(key)) ||
        [...structuredParts].some(key=>!slots.includes(key)) ||
        inferred && !structuredParts.size ||
        owned && (!inferred && !contextual && !slots.includes(ownerPart) || slots.includes(ownerKey))) continue;
    const orderedNumericPair=one(w,'ordered_numeric_pair')==='true';
    const contextualNumeric=contextual && parts[0].key===predicatePart && parts[1]?.format==='scalar_number' &&
      (parts.length===2 && !orderedNumericPair ||
        orderedNumericPair && parts.length===4 && parts[2].literal && parts[3].format==='scalar_number');
    const contextualPostfix=slots.length===2 && parts.length===2 && parts[0].bank && parts[1].key===predicatePart;
    if (contextual && !contextualNumeric && !contextualPostfix || orderedNumericPair && !contextualNumeric) continue;
    if (modeMarker && (!requestMode || parts.at(-1).literal?.join(' ')!==keys(modeMarker).join(' ') ||
        slots.filter(key=>props.has(key)).length!==1)) continue;
    const scopeLiteralSlot=one(w,'scope_literal_slot');
    const scopeLiterals=many(w,'scope_literal').map(keys);
    const closedSlot=parts.find(part=>part.key===scopeLiteralSlot)?.bank;
    if (scopeLiteralSlot && (!owned || !closedSlot || !scopeLiterals.length ||
        scopeLiterals.some(form=>!closedSlot.some(([words])=>words.join(' ')===form.join(' '))))) continue;
    const tails=owned ? many(w,'tail').map(keys).filter(words=>words.length) : [];
    const bindsPredicate=slots.includes(predicatePart);
    const boundaries=[...many(w,'open_boundary').map(keys),...bindsPredicate ? conjunctions : []].filter(words=>words.length);
    const numericModifiers=many(w,'numeric_modifier').map(keys).filter(words=>words.length);
    const declaredPrefixes=many(w,'prefix').map(keys).filter(prefix=>prefix.length);
    if (contextual && declaredPrefixes.length) continue;
    if (scopeAttribute && (!declaredPrefixes.length || mode!=='existing' || !bindsPredicate ||
        parts[0].key!==scopePart || parts[1]?.literal?.join(' ')!==',' || !parts[2]?.nominal ||
        parts[3]?.key!==predicatePart)) continue;
    const closedResult=parts[2]?.bank && !parts[2].lexical;
    const ownerLed=!declaredPrefixes.length && mode==='existing' && parts.length===3 && parts[0].nominal &&
      (parts[1].literal && closedResult || parts[1].key===predicatePart && (closedResult || parts[2].format));
    for (const prefix of ownerLed || contextual ? [[]] : declaredPrefixes) {
      const head=prefix[0] ?? '';
      const entries=index.get(head) ?? [];
      entries.push({prefix,parts,family,act,mode,owned,inferred,ownerKey,ownerValue,ownerSort,sortWords:sortWords.length,tails,boundaries,numericModifiers,transitionKey,
        bindsPredicate,ownerLed,contextual,contextualNumeric,orderedNumericPair,requestMode,modeMarker,
        scopeAttribute,scopeLiteralSlot,scopeLiterals});index.set(head,entries);
    }
  }
  for (const frames of index.values()) {
    for (const frame of frames.filter(frame=>frame.owned)) {
      frame.boundPhrases=frames.filter(peer=>peer.owned && peer.family===frame.family && peer.act===frame.act)
        // A vocabulary for an open slot can appear in another open field.
        .flatMap(peer=>peer.parts.filter(part=>part.key!==ownerPart && !part.lexical).flatMap(part=>part.bank ?? []))
        .map(([words])=>words).filter(words=>words.length>1);
    }
  }
  return index;
}

export function sequencePacket(ts,worlds,restricted=false,text) {
  const packets=[];
  let stop=ts.length;
  while (stop && ['.','!','?'].includes(ts[stop-1][0])) stop--;
  if (!stop) return packets;
  let commandStarts;
  for (let i=0;i<stop;i++) for (const f of [...worlds.argumentSequences?.get(ts[i][0]) ?? [],
      ...worlds.argumentSequences?.get('') ?? []]) {
    if (!matchesAt(ts,i,f.prefix) || restricted && !f.scopeLiteralSlot) continue;
    const start=i+f.prefix.length;
    if (start>=stop) continue;
    if (f.contextual && !f.parts[0].bank.some(([words])=>matchesAt(ts,start,words))) continue;
    if (f.ownerLed) {
      const det=worlds.determiners[ts[i][0]];
      if (det && !['definite','demonstrative','possessive'].includes(det) ||
          !f.parts[0].nominal.some(noun=>matchesAt(ts,i+Number(Boolean(det)),noun))) continue;
    }
    const addressed=f.owned && (!f.bindsPredicate || f.contextualNumeric) && addressedLead(ts,i,worlds,f.contextualNumeric);
    if (f.owned) {
      if (!worlds.literalGrammar.licenses(f.family,f.act) ||
          !addressed && (ts[stop]?.[0]==='?' || !admittedLead(ts,i,worlds))) continue;
    } else if (!f.prefix.some((_,a)=>f.prefix.slice(a).some((_,b)=>
      worlds.lookup(f.prefix.slice(a,a+b+1).join(' ')).some(([role,act,family,mode])=>
        role==='target' && act===f.act && family===f.family && mode===f.mode)))) continue;
    // A connector reserves its complete phrase. An article inside that
    // phrase can still belong to a different written operand.
    const connectors=f.parts.flatMap(part=>part.literal ? [part.literal] : []);
    const protectedPositions=new Set();
    for (const words of [...connectors,...f.boundPhrases ?? [],...f.boundaries]) {
      for (let from=start;from+words.length<=stop;from++) {
        if (!matchesAt(ts,from,words)) continue;
        for (let at=from;at<from+words.length;at++) protectedPositions.add(at);
      }
    }
    // A declared measurement modifier is not a data field name. Leave
    // the tokens available to typed/literal parts, but bar open spans.
    for (const words of f.numericModifiers) {
      for (let from=start;from+2+words.length<=stop;from++) {
        if (!/^\d+$/u.test(ts[from][0]) || ts[from+1][0]!=='-' || !matchesAt(ts,from+2,words)) continue;
        for (let at=from;at<from+2+words.length;at++) protectedPositions.add(at);
      }
    }
    commandStarts ??= coordinatedCommandStarts(ts,worlds);
    const input=ts.slice(start,stop).map(([word,,a,b],j)=>{
      const protectedWord=protectedPositions.has(start+j) || commandStarts.has(start+j) ||
        worlds.negatives.has(word) || worlds.scopeGrammar.conditionals.has(word) ||
        Boolean(worlds.joiners[word]) || worlds.scopeGrammar.auxiliary.has(word) ||
        worlds.lookup(word).some(([role])=>role==='marker') ||
        !/^[\p{L}\p{M}\p{N}_]+$/u.test(word) && !(word==='-' && ts[start+j-1]?.[3]===a && ts[start+j+1]?.[2]===b);
      return [word,a,b,!protectedWord];
    });
    const endings=[stop];
    const politeTail=f.ownerLed && worlds.discourse.some(({text,class:kind})=>
      kind==='politeness' && text===ts[stop-1][0]);
    for (let end=start+1;end<stop;end++) {
      if (politeTail && end===stop-1 || f.tails.some(words=>end+words.length<=stop && matchesAt(ts,end,words))) endings.push(end);
    }
    for (const end of endings) {
      const marker=f.modeMarker ? keys(f.modeMarker) : [];
      const markerAt=end-marker.length;
      if (end-start>32 || marker.length && (markerAt<start || !matchesAt(ts,markerAt,marker))) continue;
      const parts=f.parts.map(part=>part.format ? {...part,bank:structuredBank(text,ts,start,end,worlds,f.family,
        part.argument ? {...part,key:part.argument} : part)} : part);
      if (parts.some(part=>part.format && !part.bank.length)) continue;
      const packet={family:f.family,act:f.act,mode:f.mode,parts,input:input.slice(0,end-start),
        anchor:ts[i][2],start:ts[start][2],end:ts[end-1][3]};
      if (f.owned) {
        const boundary=f.prefix.findLastIndex(word=>[',',':'].includes(word));
        packet.owned={...addressed,inferred:f.inferred,ownerKey:f.ownerKey ?? '',ownerValue:f.ownerValue ?? '',
          utteranceEnd:ts[stop-1][3]};
        if (f.ownerSort) Object.assign(packet.owned,{ownerSort:f.ownerSort,sortWords:f.sortWords});
        if (f.transitionKey) packet.owned.transitionKey=f.transitionKey;
        const counts=parts.filter(part=>part.format==='positive_count').map(part=>part.key);
        if (counts.length) packet.owned.counts=counts;
        if (f.contextual) packet.owned.contextual=true;
        if (f.orderedNumericPair) packet.owned.orderedNumericPair=true;
        if (f.requestMode) packet.owned.requestMode=f.requestMode;
        if (marker.length) packet.owned.modeMarkerStart=ts[markerAt][2];
        if (f.scopeAttribute) packet.owned.scopeAttribute=f.scopeAttribute;
        if (f.scopeLiteralSlot) Object.assign(packet.owned,{scopeLiteralSlot:f.scopeLiteralSlot,scopeLiterals:f.scopeLiterals});
        if (f.bindsPredicate) {
          packet.owned.bindsPredicate=true;
          if (start && admittedLead(ts,start,worlds)) packet.owned.prefaceEnd=ts[start-1][3];
        }
        else if (!f.ownerLed) Object.assign(packet.owned,{predicateStart:ts[i+boundary+1][2],predicateEnd:ts[start-1][3]});
        if (politeTail && end===stop-1) packet.owned.politeTail=ts[end][2];
      }
      packets.push(packet);
    }
  }
  return packets;
}

export function sequenceReading(text,candidate,proof) {
  if (proof.owned) return;
  const wires=parse(candidate.sop), req=wires.filter(w=>w.type==='w.request.request'), tg=wires.filter(w=>w.type==='w.request.target');
  if (req.length!==1 || tg.length!==1 || one(req[0],'act')!==proof.act || one(tg[0],'family')!==proof.family ||
      one(tg[0],'mode')!==proof.mode || one(tg[0],'request')!=='$'+req[0].id) return;
  const chars=Array.from(text), point=i=>chars.slice(0,i).join('').length;
  const anchor=point(proof.anchor),start=point(proof.start),end=point(proof.end);
  const head=one(tg[0],'sort_words') ?? one(tg[0],'family_words') ?? one(tg[0],'sort');
  if (head && !literalRanges(text.toLowerCase(),head.toLowerCase(),0,start).some(([,b])=>b>anchor)) return;
  const predicate=one(req[0],'predicate');
  if (predicate && !literalRanges(text,predicate,0,start).length) return;
  const scope=one(req[0],'words');
  if (scope && !scope.includes(text.slice(anchor,end))) return;
  const additions=[],ids=new Set(wires.map(w=>w.id));
  for (const [key,canonical,a,b] of proof.bindings) {
    const surface=chars.slice(a,b).join(''),value=canonical || surface;
    const matches=wires.filter(w=>w.type==='w.request.constraint' && one(w,'attribute')===key);
    if (matches.some(w=>one(w,'request')!=='$'+req[0].id || many(w,'value').length!==1 ||
        one(w,'value')!==value || ![undefined,'result'].includes(one(w,'phase')) ||
        ![undefined,'eq'].includes(one(w,'operator')) || one(w,'want') || w.attrs.of)) return;
    if (matches.length) continue;
    let id=req[0].id+'.arg'+additions.length;
    while(ids.has(id)) id+='_';
    ids.add(id);additions.push({id,type:'w.request.constraint',attrs:{request:['$'+req[0].id],on:['attribute'],attribute:[key],value:[canonical && /^[\p{L}_][\p{L}\p{M}\p{N}_.-]*$/u.test(canonical) ? canonical : encode(value)],words:[encode(surface)],operator:['eq'],phase:['result']}});
  }
  if (!additions.length) return;
  return {sop:serialize([...consumeUnread(wires,text,start,end),...additions]),source:'argument-sequence',status:candidate.status};
}

// Recheck speech scope after a full proof has assigned the closed cue to
// a value slot. Keep all other tokens, including any independent negation.
export function sequenceScopeText(text,proof) {
  const slot=proof.owned?.scopeLiteralSlot;
  if (!slot || proof.end!==proof.owned.utteranceEnd) return;
  const binding=proof.bindings.find(([key])=>key===slot);
  if (!binding?.[1]) return;
  const [, ,start,end]=binding, chars=Array.from(text);
  const surface=keys(chars.slice(start,end).join('')).join(' ');
  if (!proof.owned.scopeLiterals.some(words=>words.join(' ')===surface)) return;
  chars.fill(' ',start,end);
  return chars.join('');
}

export function sequenceFrameReading(text,proof,extraBindings=[],labels,adjuncts) {
  if (!proof.owned) return;
  if (proof.owned.orderedNumericPair) {
    const [lower,upper]=proof.bindings.map(([,value])=>Number(value));
    if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower>upper) return;
  }
  const chars=Array.from(text), span=(start,end)=>chars.slice(start,end).join('');
  const {ownerKey,ownerValue,predicateStart,predicateEnd,utteranceEnd,contextual,requestMode,modeMarkerStart}=proof.owned;
  const owner=proof.bindings.find(([key])=>key===ownerPart);
  const identity=proof.bindings.find(([key])=>key===identityPart);
  if (!owner && !proof.owned.inferred && !contextual) return;
  const noun=owner && span(owner[2],owner[3]);
  const reference=owner?.[1]==='literal_reference';
  const sort=proof.owned.ownerSort && noun ? ' sort='+encode(proof.owned.ownerSort)+' sort_words='+
    encode(Array.from(noun).slice(tokens(noun).at(-proof.owned.sortWords)[2]).join('')) : '';
  const target=identity ? ' fill=written name='+encode(span(identity[2],identity[3]))+' family_words='+encode(noun) :
    contextual ? ' fill=context' : proof.mode==='existing' ? ' fill=description description='+encode(noun) :
      noun ? ' determiner=indefinite family_words='+encode(noun) : '';
  const lines=[
    '@r1 w.request.request act='+encode(proof.act)+' mood=do'+(requestMode ? ' mode='+requestMode : '')+
      (predicateStart===undefined ? '' : ' predicate='+encode(span(predicateStart,predicateEnd)))+
      ' words='+encode(text)+(reference ? ' refers=thing' : ''),
  ];
  if (reference) lines.push('@r1.l w.request.lookup request=$r1 key=thing words='+encode(noun));
  else {
    lines.push('@r1.t w.request.target request=$r1 family='+encode(proof.family)+' mode='+proof.mode+target+sort);
    if (proof.mode==='existing') lines.push('@r1.l w.request.lookup request=$r1 target=$r1.t key=thing from=page');
  }
  const bindings=proof.bindings.flatMap(binding=>binding===owner ?
    (ownerKey ? [[ownerKey,ownerValue,owner[2],owner[3]]] : []) :
    binding[0]===scopePart ? [[proof.owned.scopeAttribute,'',proof.anchor,binding[3]]] :
    binding===identity || binding[0]===unreadPart || binding[0].startsWith('=') ? [] : [binding]);
  for (const [i,[argument,canonical,a,b]] of [...bindings,...extraBindings,...adjuncts?.bindings ?? []].entries()) {
    const previous=argument===previousPart;
    const key=previous ? proof.owned.transitionKey : argument;
    const transition=key===proof.owned.transitionKey;
    const words=span(a,b), measurement=canonical?.measurement, value=measurement ? canonical.value : canonical || words;
    let keyWords='',countLabel='';
    if (labels?.has(key)) {
      // A role label must be in an adjacent connector. A fronted role may
      // have a label after its value and before the command delimiter.
      const previous=Math.max(proof.start,...proof.bindings.map(binding=>binding[3]).filter(end=>end<=a));
      if (transition) keyWords=span(previous,a).trim();
      const beforeRepeat=proof.bindings.find(([slot,,x,y])=>slot.startsWith('=') && y===previous);
      const leadToRepeat=beforeRepeat && Math.max(proof.start,...proof.bindings.map(binding=>binding[3])
        .filter(end=>end<=beforeRepeat[2]));
      const connectors=[[previous,tokens(span(previous,a))]];
      if (beforeRepeat && !span(previous,a).trim()) connectors.push([leadToRepeat,tokens(span(leadToRepeat,beforeRepeat[2]))]);
      const count=proof.owned.counts?.includes(argument);
      const forwardBoundary=count ? proof.end :
        proof.owned.bindsPredicate && b<predicateStart ? predicateStart : b;
      const following=tokens(span(b,Math.min(forwardBoundary,...proof.bindings.map(binding=>binding[2]).filter(start=>start>=b))));
      for (const label of labels.get(key)) {
        const prefix=following.slice(0,label.words.length);
        const matches=parts=>label.words.every((word,i)=>word===parts[i]?.[0]);
        if (count && matches(prefix)) {
          const written=span(b+prefix[0][2],b+prefix.at(-1)[3]);
          if (written.length>countLabel.length) countLabel=written;
        }
        const [offset,matched]=connectors.map(([from,connector])=>[from,connector.slice(-label.words.length)])
          .find(([,suffix])=>matches(suffix)) ?? (!count && matches(prefix) ? [b,prefix] : []);
        if (!matched) continue;
        const written=span(offset+matched[0][2],offset+matched.at(-1)[3]);
        if (written.length>keyWords.length) keyWords=written;
      }
    }
    lines.push('@r1.arg'+i+' w.request.constraint request=$r1 on=attribute attribute='+encode(key)+
      ' value='+(!measurement && canonical && (atom.test(canonical) || transition && /^\d+$/u.test(canonical)) ? canonical : encode(value))+
      (words===value && !measurement ? '' : ' words='+encode(words))+
      [...new Set([keyWords,countLabel])].filter(Boolean).map(label=>' key_words='+encode(label)).join('')+
      (modeMarkerStart===undefined ? '' : ' key_words='+encode(span(modeMarkerStart,proof.end)))+
      ' operator=eq phase='+(previous ? 'selector' : 'result')+
      (measurement ? ' measure='+measurement.measure+' unit='+encode(measurement.unit)+' measure_words='+encode(measurement.words) : ''));
  }
  const lead=span(proof.owned.courtesyStart ?? 0,proof.owned.prefaceEnd ??
    (proof.owned.bindsPredicate ? proof.anchor : predicateStart ?? proof.anchor)).trim();
  if (lead) lines.push('@f1 w.request.filler text='+encode(lead.replace(/,\s*$/u,'')));
  const {politeTail}=proof.owned;
  if (politeTail!==undefined) lines.push('@f2 w.request.filler text='+encode(span(politeTail,utteranceEnd)));
  const remainder=span(proof.end,politeTail ?? utteranceEnd).replace(/^\s*,?\s*/u,'');
  const unread=proof.bindings.filter(([key])=>key===unreadPart).map(([, ,a,b])=>span(a,b));
  if (proof.owned.locationEnd) unread.unshift(span(0,proof.owned.locationEnd).trim());
  if (adjuncts) unread.push(...adjuncts.unread);
  else if (remainder) unread.push(remainder);
  for (const [i,raw] of unread.entries()) lines.push('@r1.u'+i+' w.request.unread request=$r1 text='+encode(raw));
  return {sop:lines.join('\n'),source:'argument-frame',status:unread.length ? 'partial' : 'matched'};
}
