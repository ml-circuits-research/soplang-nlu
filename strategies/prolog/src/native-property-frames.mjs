import { tokens } from './lexicon.mjs';
import { parse } from './schema.mjs';
import { universalOwner } from './universal-inventory.mjs';
import { nominalSelectorLines } from './nominal-selectors.mjs';
import { inventoryModifiers } from './owner-property.mjs';

const decode=value=>value?.startsWith('"') ? JSON.parse(value) : value;
const fields=(wire,slot)=>(wire.attrs[slot] ?? []).map(decode);
const field=(wire,slot)=>fields(wire,slot)[0];
const identity=(left,right)=>JSON.stringify([left,right]);
const norm=text=>tokens(text).map(([key])=>key.replaceAll('’',"'")).join(' ');
const words=text=>norm(text).split(' ').filter(Boolean);
const quote=JSON.stringify;
const letters=/^[\p{L}\p{M}\p{N}_]+$/u;
const named=/^\p{Lu}[\p{L}\p{M}\p{N}_-]*$/u;
const idPattern=/^(\p{L}+)[0-9]+$/u;
const decimal=/^[+-]?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)$/u;
const atom=/^[\p{L}_][\p{L}\p{M}\p{N}_.-]*$/u;
const targetDeterminers=new Set(['definite','demonstrative','possessive']);
const hasWords=(input,start,terms)=>terms.every((word,i)=>input[start+i]===word);

export function compileNativePropertyFrames(facts) {
  const parts=new Map(), phrases=new Map(), verbs=new Map();
  const questionKinds=new Map(facts('pro.reader.question_kind').map(wire=>[field(wire,'asks'),field(wire,'question')]));
  const interrogatives=new Map(facts('w.lang.en.wh').flatMap(wire=>{
    const question=questionKinds.get(field(wire,'asks'));
    return question ? fields(wire,'text').map(text=>[norm(text),question]) : [];
  }));
  const deontic=facts('w.lang.en.aux').filter(wire=>
    ['advice','obligation','necessity'].includes(field(wire,'modal')))
    .flatMap(wire=>fields(wire,'text').map(words));
  const fixed=new Set(facts('w.lang.en.fixed').map(wire=>field(wire,'frame')));
  for (const wire of facts('w.lang.en.part')) {
    const key=field(wire,'frame'), list=parts.get(key) ?? [];
    list.push(wire);
    parts.set(key,list);
  }
  for (const wire of facts('w.lang.en.phrase')) {
    phrases.set(field(wire,'name'),fields(wire,'item').map(words));
  }
  for (const wire of facts('k.actions.verb')) {
    if (field(wire,'complement')!=='value') continue;
    const act=field(wire,'act'), list=verbs.get(act) ?? [];
    list.push(...fields(wire,'text').map(words));
    verbs.set(act,list);
  }
  const frames=[];
  for (const wire of facts('w.lang.en.frame')) {
    const [name,act,mode,needs]=['name','act','mode','needs'].map(key=>field(wire,key));
    const asking=act==='ask' && mode==='what';
    const roles=fields(wire,'role');
    const implicitOwner=act==='change' && mode==='set' && roles.length===2 && roles.includes('attribute') && roles.includes('value');
    const finiteOnly=implicitOwner && needs==='values';
    const qualitative=act==='change' && needs==='values' && !implicitOwner;
    if ((!asking && (act!=='change' || mode!=='set')) || !['attrs','number'].includes(needs) && !qualitative && !finiteOnly ||
        fixed.has(name) || wire.attrs.mood || wire.attrs.polarity) continue;
    const required=asking ? ['thing','attribute'] : qualitative ? ['thing','value'] :
      implicitOwner ? ['attribute','value'] : ['thing','attribute','value'];
    if (roles.length!==required.length || !required.every(role=>roles.includes(role))) continue;
    const ordered=(parts.get(name) ?? []).slice().sort((a,b)=>Number(field(a,'at'))-Number(field(b,'at')));
    const pattern=[];
    let questions;
    let consumed=0;
    for (const [i,part] of ordered.entries()) {
      const [kind,role,takes]=['is','role','takes'].map(key=>field(part,key));
      const optional=field(part,'optional')==='yes';
      if (kind==='role') {
        if (optional || !roles.includes(role) || (role==='attribute' ? takes!=='lexicon' ||
              field(part,'lexicon')!=='attribute' : role==='thing' ? takes!=='words' :
                qualitative ? takes!=='lexicon' || field(part,'lexicon')!=='value' : !['words','number'].includes(takes))) break;
        pattern.push({role:implicitOwner ? 'context_'+role : qualitative && role==='value' ? 'qualitative' : role});
        consumed++;
        continue;
      }
      if (kind==='det' && optional && field(ordered[i+1] ?? part,'is')==='role') { consumed++; continue; }
      let forms, mark;
      if (kind==='lead') { forms=phrases.get(field(part,'phrase')); mark='lead'; }
      if (kind==='verb') { forms=verbs.get(field(part,'act')); mark='predicate'; }
      if (kind==='word') {
        forms=fields(part,'word').map(words);
        if (implicitOwner && !optional && pattern.every(part=>part.mark==='lead')) {
          const written=new Set((verbs.get(act) ?? []).map(form=>form.join(' ')));
          forms=forms.filter(form=>written.has(form.join(' ')));
          mark='predicate';
        }
        if (asking && !optional && pattern.every(part=>part.mark==='lead')) {
          forms=forms.filter(form=>interrogatives.has(form.join(' ')));
          questions=Object.fromEntries(forms.map(form=>[form.join(' '),interrogatives.get(form.join(' '))]));
          mark='predicate';
        }
        if (!asking && !optional && field(ordered[i-1] ?? part,'role')==='thing' &&
            (needs==='number' || qualitative && !pattern.some(part=>part.mark==='predicate'))) {
          forms=forms.filter(form=>deontic.some(cue=>hasWords(form,0,cue)));
          mark='predicate';
        }
      }
      if (!forms?.some(form=>form.length)) break;
      pattern.push({forms,optional,...(mark ? {mark}: {})});
      consumed++;
    }
    const compiledRoles=pattern.filter(part=>part.role);
    if (consumed!==ordered.length || compiledRoles.length!==required.length ||
        pattern.filter(part=>part.mark==='predicate').length!==1 || asking && !questions) continue;
    if (implicitOwner && (compiledRoles[0]?.role!=='context_attribute' || compiledRoles[1]?.role!=='context_value' ||
        pattern.at(-1)?.role!=='context_value' || pattern.findIndex(part=>part.mark==='predicate')>pattern.indexOf(compiledRoles[0]))) continue;
    frames.push({name,act,numberOnly:needs==='number',implicitOwner,finiteOnly,pattern,...(questions ? {questions} : {})});
  }
  // A catalogue shard's position should not put a contextual owner ahead of
  // an explicitly written owner. Keep both frames available to the reader.
  return frames.sort((a,b)=>Number(a.implicitOwner)-Number(b.implicitOwner));
}

function catalogKey(worlds,family,name) {
  const keys=worlds.requestKeys.filter(key=>key.family===family && key.name===name);
  const [first]=keys;
  if (!first || keys.some(key=>key.head!==first.head || key.values.length!==first.values.length ||
      key.values.some(value=>!first.values.includes(value)))) return;
  return first;
}

function keyFor(worlds,family,surface) {
  const names=new Set((worlds.ownerPropertyLabels.get(identity(surface,family)) ?? []).map(({attribute})=>attribute));
  if (names.size===1) return catalogKey(worlds,family,names.values().next().value);
}

const contextualLabels=new WeakMap();
function contextKeys(worlds,surface) {
  if (!contextualLabels.has(worlds)) {
    const labels=new Map();
    for (const [id,entries] of worlds.ownerPropertyLabels) {
      const [surface,family]=JSON.parse(id);
      if (!worlds.literalGrammar.licenses(family,'change')) continue;
      const keys=labels.get(surface) ?? new Map();
      for (const {attribute} of entries) {
        const key=catalogKey(worlds,family,attribute);
        if (key) keys.set(identity(family,attribute),key);
      }
      if (keys.size) labels.set(surface,keys);
    }
    contextualLabels.set(worlds,labels);
  }
  return contextualLabels.get(worlds).get(surface)?.values() ?? [];
}

function ownerBindings(worlds,act,ts,words,span,plain,det,start,end) {
  const owners=new Map(), {next,mode}=det(start,end);
  if (worlds.universalAgreement?.heads.has(ts[start]?.[0])) {
    if (act!=='change' || !plain(start,end)) return owners;
    for (const family of worlds.semanticFamilies) {
      if (!worlds.literalGrammar.licenses(family,act)) continue;
      const population=universalOwner(ts.slice(start,end),worlds,family,act,(a,b)=>span(start+a,start+b));
      if (population?.sort) owners.set(family,{act,family,fill:'all',description:span(start,end),...population});
    }
    return owners;
  }
  if (next>=end || mode && !targetDeterminers.has(mode) || !plain(next,end)) return owners;
  const description=span(start,end), raw=span(next,end);
  const bind=(family,fields)=>{
    if (worlds.literalGrammar.licenses(family,act)) owners.set(JSON.stringify([family,fields]),{family,act,...fields});
  };
  const prefix=idPattern.exec(words(next,end))?.[1];
  if (prefix) {
    for (const {family,prefix:declared} of worlds.instanceBindings ?? []) {
      if (prefix===declared) bind(family,{fill:'written',ids:raw,...(mode ? {determiner:mode} : {})});
    }
  }
  for (let from=next;from<end;from++) {
    const surface=words(from,end);
    const native=(worlds.ownerInventory?.get(identity(act,surface)) ?? []).filter(({family})=>
      inventoryModifiers(worlds,act,family,words,next,from));
    const lexical=worlds.lookup(surface).flatMap(([role,sense,family,mode,sort])=>
      role==='target' && sense===act && mode==='existing' && !native.some(item=>item.family===family) ? [{family,sort}] : []);
    const descriptors=words(next,from);
    if (from>next && descriptors.split(' ').some(word=>worlds.lookup(word).some(([role])=>role==='marker'))) continue;
    for (const {family,sort} of [...native,...lexical]) {
      const props={fill:'description',description,head:span(from,end),...(sort ? {sort} : {}),...(mode ? {determiner:mode} : {})};
      bind(family,props);
      if (from===next && !mode && named.test(raw)) bind(family,{fill:'written',name:raw});
    }
    if (owners.size) break;
  }
  // A noun followed by a declared code supplies both descriptions.
  if (end-next>1) {
    const code=span(end-1,end), suffix=idPattern.exec(words(end-1,end))?.[1];
    for (const {family,prefix} of worlds.instanceBindings ?? []) {
      if (suffix!==prefix) continue;
      const description=words(next,end-1);
      if (worlds.lookup(description).some(([role,sense,owner,mode])=>
        role==='target' && sense===act && owner===family && mode==='existing'))
        bind(family,{fill:'written',ids:code,head:span(next,end-1),...(mode ? {determiner:mode} : {})});
    }
  }
  return owners;
}

function closedValue(key, surface, worlds) {
  const values=new Set(key.values.filter(value=>norm(value.replaceAll('_',' '))===surface || norm(value)===surface));
  for (const [body] of worlds.ownerPropertyValues?.get(identity(key.family,surface)) ?? []) {
    const [wire]=parse('@v w.request.constraint '+body);
    if (field(wire,'attribute')!==key.name || !['eq',undefined].includes(field(wire,'operator')) ||
        !['result',undefined].includes(field(wire,'phase')) || wire.attrs.want) continue;
    const raw=field(wire,'value');
    if (raw && (!key.values.length || key.values.includes(raw))) values.add(raw);
  }
  if (values.size===1) return [...values][0];
}

function parseValue(key,source,surface,worlds) {
  const heads=key.head.split('+');
  if (key.values.length || heads.includes('candidate')) {
    const value=closedValue(key,surface,worlds);
    if (value && (atom.test(value) || value===source)) return {value,canonical:true,numeric:false};
    if (key.values.length) return;
  }
  if (heads.includes('number')) {
    const numeral=worlds.nominalNumbers.get(surface);
    if (decimal.test(source) && Number.isFinite(Number(source))) return {value:source,numeric:true};
    if (numeral?.kind==='cardinal' && /^\d+$/u.test(numeral.value)) return {value:numeral.value,numeric:true,canonical:true};
  }
  if (heads.includes('span') || worlds.ownerPropertyOpen?.has(identity(key.family,key.name))) return {value:source,numeric:false};
}

function qualitativeValues(worlds,family,surface) {
  if (worlds.nominalScales?.surfaces.has(surface)) {
    const bank=worlds.nominalScales.byFamily.get(family)?.forms.get(surface);
    if (bank?.size!==1) return [];
    const [{attribute:key,on,value}]=bank.values();
    return [{key,on,value,operator:'degree',canonical:true}];
  }
  const found=new Map();
  for (const [body,evidence] of worlds.ownerPropertyValues.get(identity(family,surface)) ?? []) {
    if (evidence.includes('key_words=')) continue;
    const [wire]=parse('@v w.request.constraint '+body);
    const key=field(wire,'attribute'), value=field(wire,'value');
    if (!key || !value || wire.attrs.open_value || wire.attrs.want ||
        field(wire,'operator')!=='eq' || field(wire,'phase')!=='result') continue;
    const id=identity(key,value), prior=found.get(id);
    // A spelling expansion of a canonical enum is weaker than a declared
    // alias that relates different written wording to the same value.
    const alias=Boolean(prior?.alias || evidence.includes('words=') && norm(value.replaceAll('_',' '))!==surface &&
      norm(value)!==surface);
    found.set(id,{key,value,alias,canonical:true});
  }
  const choices=[...found.values()];
  return choices.length<2 ? choices : choices.filter(choice=>choice.alias);
}

function qualifiedValues(worlds,family,start,first,end,words,span) {
  const readings=[];
  for (const [key,qualifiers] of worlds.ownedEffects?.resultQualifiers?.get(family) ?? []) {
    const cuts=new Set([first]);
    for (let at=first;at<end-1;at++) {
      if (!cuts.has(at)) continue;
      for (const qualifier of qualifiers) {
        const after=at+qualifier.split(' ').length;
        if (after<end && words(at,after)===qualifier) cuts.add(after);
      }
    }
    for (const cut of cuts) {
      if (cut===first) continue;
      for (const value of qualitativeValues(worlds,family,words(cut,end))) {
        if (value.key===key) readings.push({...value,words:span(cut,end),qualifier:span(start,cut)});
      }
    }
  }
  return readings;
}

function prefixStops(parts,input) {
  let starts=[0];
  for (const part of parts) {
    starts=[...new Set(starts.flatMap(start=>[
      ...(part.optional ? [start] : []),
      ...part.forms.filter(form=>hasWords(input,start,form)).map(form=>start+form.length),
    ]))];
    if (!starts.length) break;
  }
  return starts;
}

function admitsPrefix(frame,input) {
  const index=frame.pattern.findIndex(part=>part.mark==='predicate');
  const predicate=frame.pattern[index];
  if (frame.pattern.slice(0,index).some(part=>part.role)) {
    return input.some((_,start)=>predicate.forms.some(form=>hasWords(input,start,form)));
  }
  return prefixStops(frame.pattern.slice(0,index+1),input).length>0;
}

export function nativePropertyPacket(text,ts,quotes,worlds,{questionsOnly=false}={}) {
  if (!worlds.nativePropertyFrames?.length || !ts.length || ts.length>44) return;
  const chars=Array.from(text), input=ts.map(([word])=>word.replaceAll('’',"'"));
  const span=(a,b)=>chars.slice(ts[a][2],ts[b-1][3]).join('');
  const words=(a,b)=>input.slice(a,b).join(' ');
  const hidden=(a,b)=>quotes.some(q=>q.start<ts[b-1][3] && ts[a][2]<q.end);
  let end=ts.length;
  const question=input[end-1]==='?';
  if (['.','!','?'].includes(input[end-1]) && !hidden(end-1,end)) end--;
  if (end<3) return;
  const frames=worlds.nativePropertyFrames.filter(frame=>
    (end>=4 || frame.implicitOwner) && (!questionsOnly || frame.act==='ask') && admitsPrefix(frame,input)).map(frame=>({
    ...frame,pattern:frame.pattern.map(part=>part.forms ? {
      ...part,forms:part.forms.filter(form=>input.some((_,i)=>hasWords(input,i,form))),
    } : part),
  })).filter(frame=>frame.pattern.every(part=>part.role || part.optional || part.forms.length));
  if (!frames.length) return;
  const connectors=frames.flatMap(frame=>frame.pattern.filter(part=>!part.role && !part.mark)
    .flatMap(part=>part.forms));
  for (let i=0;i<end;i++) {
    if (hidden(i,i+1)) continue;
    for (let j=i+1;j<=Math.min(i+5,end);j++) {
      if (hidden(i,j)) break;
      const key=words(i,j);
      if (worlds.negatives.has(key) || worlds.scopeGrammar.negatives.has(key) ||
          worlds.scopeGrammar.conditionals.has(key) ||
          ['sequence','contrast','clause','coordination'].includes(worlds.joiners[key]) ||
          [...worlds.scopeGrammar.endings].some(suffix=>key.replaceAll(' ','').endsWith(suffix))) return;
    }
  }
  const plain=(a,b)=>a<b && !hidden(a,b) && input.slice(a,b).every((token,i)=>
    letters.test(token) || token==='-' && a+i>a && a+i+1<b && ts[a+i-1][3]===ts[a+i][2] && ts[a+i][3]===ts[a+i+1][2]);
  const det=(a,b)=>{
    for (let i=Math.min(a+4,b-1);i>a;i--) {
      const mode=worlds.determiners[words(a,i)];
      if (mode) return {mode,next:i};
    }
    return {next:a};
  };
  const owners=[], attrs=[], values=[], qualitative=[], families=new Set(), properties=new Map();
  const contextAttrs=[], contextValues=[], contextProperties=new Map();
  const contextConnectors=new Map();
  for (const frame of frames.filter(frame=>frame.implicitOwner)) {
    const slot=frame.pattern.findIndex(part=>part.role==='context_attribute');
    const connector=frame.pattern.slice(slot+1,-1);
    for (const position of prefixStops(frame.pattern.slice(0,slot),input)) {
      const choices=contextConnectors.get(position) ?? [];
      choices.push(connector);
      contextConnectors.set(position,choices);
    }
  }
  const acts=[...new Set(frames.filter(frame=>!frame.implicitOwner).map(frame=>frame.act))];
  if (acts.length) {
    for (let a=0;a<end;a++) for (let b=a+1;b<=Math.min(a+10,end);b++) {
      for (const act of acts) {
        for (const item of ownerBindings(worlds,act,ts,words,span,plain,det,a,b).values()) {
          owners.push({a,b,...item});
          families.add(item.family);
        }
      }
    }
  }
  if (!owners.length && !contextConnectors.size) return;
  for (let a=1;a<end;a++) for (let b=a+1;b<=Math.min(a+8,end);b++) {
    if (!families.size && !contextConnectors.has(a)) continue;
    const {next,mode}=det(a,b);
    if (!plain(next,b)) continue;
    for (const family of families) {
      const key=keyFor(worlds,family,words(next,b));
      if (!key) continue;
      attrs.push({a,b,family,key:key.name,words:span(next,b),numeric:key.head.split('+').includes('number')});
      properties.set(identity(family,key.name),key);
    }
    if (contextConnectors.has(a) && (!mode || mode==='definite')) {
      const starts=contextConnectors.get(a).flatMap(connector=>prefixStops(connector,input.slice(b)).map(start=>b+start))
        .filter(start=>start<end);
      if (!starts.length) continue;
      for (const key of contextKeys(worlds,words(next,b))) {
        contextAttrs.push({a,b,family:key.family,key:key.name,words:span(next,b),numeric:key.head.split('+').includes('number')});
        const id=identity(key.family,key.name), entry=contextProperties.get(id) ?? {key,starts:new Set()};
        for (const start of starts) entry.starts.add(start);
        contextProperties.set(id,entry);
      }
    }
  }
  if (!acts.includes('change') && !contextProperties.size) {
    if (attrs.length) return {frames,words:input.slice(0,end),owners,attrs,values,qualitative,contextAttrs,contextValues,question};
    return;
  }
  const canQualify=frames.some(frame=>frame.pattern.some(part=>part.role==='qualitative'));
  for (let a=1;a<end;a++) for (let b=a+1;b<=Math.min(a+15,end);b++) {
    if (!canQualify && !properties.size && b!==end) continue;
    const quoted=quotes.find(q=>q.start===ts[a][2] && q.end===ts[b-1][3]);
    const source=quoted?.value ?? span(a,b);
    if (!source.trim() || !quoted && ((!plain(a,b) && !decimal.test(source)) ||
        connectors.some(form=>a+form.length<=b && hasWords(input,a,form)))) continue;
    const {next,mode}=det(a,b);
    if (canQualify && !quoted) for (const family of families) {
      const direct=next===a ? qualitativeValues(worlds,family,words(a,b)) : [];
      for (const value of direct) qualitative.push({a,b,family,words:source,...value});
      if (b===end && !direct.length && (next===a || mode==='definite')) {
        for (const value of qualifiedValues(worlds,family,a,next,b,words,span)) qualitative.push({a,b,family,...value});
      }
    }
    for (const key of properties.values()) {
      const value=parseValue(key,source,norm(source),worlds) ??
        (!quoted && next>a ? parseValue(key,span(next,b),words(next,b),worlds) : undefined);
      if (!value) continue;
      values.push({a,b,family:key.family,key:key.name,words:source,...value});
    }
    if (b===end) for (const {key,starts} of contextProperties.values()) {
      if (!starts.has(a)) continue;
      const value=parseValue(key,source,norm(source),worlds);
      // This construction has no explicit owner to constrain an open span.
      // Require independent value evidence, or an authored quotation.
      if (!value || (!quoted && !value.canonical && !value.numeric)) continue;
      contextValues.push({a,b,family:key.family,key:key.name,words:source,closed:key.values.includes(value.value),...value});
    }
  }
  if (!values.length && !qualitative.length && !contextValues.length && !acts.includes('ask')) return;
  return {frames,words:input.slice(0,end),owners,attrs,values,qualitative,contextAttrs,contextValues,question};
}

export function nativePropertyReadings(text,proofs) {
  const ts=tokens(text), chars=Array.from(text), span=(a,b)=>chars.slice(ts[a][2],ts[b-1][3]).join('');
  const alternatives=new Map();
  for (const {act,frame,owner,attribute,value,predicate,questionKinds} of proofs) {
    if (value?.qualifier && owner.fill!=='all') continue;
    const key=identity(owner.family,frame), meanings=alternatives.get(key) ?? new Map();
    const binding=JSON.stringify([owner.a,owner.b,attribute?.a,attribute?.b,owner.implicit ? undefined : attribute?.key,
      value?.a,value?.b,attribute && !owner.implicit ? value?.value : undefined]);
    const entries=meanings.get(binding) ?? new Map();
    const writtenPredicate=span(...predicate);
    const asking=act==='ask', question=questionKinds?.[norm(writtenPredicate)];
    if (asking && !question) continue;
    const lines=[
      '@r1 w.request.request act='+quote(act)+' mood='+(asking ? 'ask' : 'do')+
        ' predicate='+quote(writtenPredicate)+' words='+quote(text)+
        (asking ? ' question='+question+' asked='+quote(attribute.key)+' asked_words='+quote(attribute.words) : ''),
      '@r1.t w.request.target request=$r1 family='+quote(owner.family)+' mode=existing fill='+owner.fill+
        (owner.determiner ? ' determiner='+owner.determiner : '')+
        (owner.description ? ' description='+quote(owner.description) : '')+
        (owner.ids ? ' ids='+quote(owner.ids) : '')+(owner.name ? ' name='+quote(owner.name) : '')+
        (owner.sort ? ' sort='+quote(owner.sort)+' sort_words='+quote(owner.sortWords ?? owner.head) :
          owner.head ? ' family_words='+quote(owner.head) : '')+
        (owner.fill==='all' ? ' quantifier=all count_words='+quote(owner.description) : ''),
      ...nominalSelectorLines(owner.selector),
    ];
    if (!asking) {
      const props=value.canonical && (value.numeric || atom.test(value.value)) ? value.value : quote(value.value);
      lines.push('@r1.c w.request.constraint request=$r1 on='+(value.on ?? 'attribute')+' attribute='+quote(attribute?.key ?? value.key)+
        (attribute ? ' key_words='+quote(attribute.words) : '')+
        ' value='+props+(value.words!==value.value ? ' words='+quote(value.words) : '')+
        ' operator='+(value.operator ?? 'eq')+' phase=result');
    }
    if (value?.qualifier) lines.push('@r1.u w.request.unread request=$r1 text='+quote(value.qualifier)+
      ' note='+quote('unresolved result qualifier'));
    if (owner.fill==='description' || owner.implicit) lines.push('@r1.l w.request.lookup request=$r1 target=$r1.t key=thing from=page');
    const sop=lines.join('\n');
    entries.set(sop,{sop,source:'native-property-frame',...(value?.qualifier ? {status:'partial'} : {})});
    meanings.set(binding,entries);
    alternatives.set(key,meanings);
  }
  return [...alternatives.values()].flatMap(meanings=>{
    if (meanings.size!==1) return [];
    const [readings]=meanings.values();
    return [...readings.values()];
  });
}
