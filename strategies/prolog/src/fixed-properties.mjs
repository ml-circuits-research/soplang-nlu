import { literalRanges } from './evidence.mjs';
import { tokens } from './lexicon.mjs';
import { consumeUnread } from './nominal-evidence.mjs';
import { parse, serialize } from './knowledge.mjs';

const requestType = 'w.request.request';
const targetType = 'w.request.target';
const constraintType = 'w.request.constraint';
const unreadType = 'w.request.unread';
const decode = value => value?.startsWith('"') ? JSON.parse(value) : value;
const field = (wire,key) => decode(wire.attrs[key]?.[0]);
const values = (wire,key) => (wire.attrs[key] ?? []).map(decode);
const phrase = text => tokens(text).map(token=>token[0]);
const atom = value => /^[\p{L}_][\p{L}\p{M}\p{N}_.-]*$/u.test(value) ? value : JSON.stringify(value);
const keyOf = (family,attribute) => JSON.stringify([family,attribute]);
const terminal = /^[.!。！]$/u;
const word = /[\p{L}\p{N}]/u;

function backingSlots(facts) {
  const index = new Map();
  for (const wire of facts('core.slot')) {
    const owner = field(wire,'of'), key = field(wire,'key');
    if (!owner || !key) continue;
    index.set(wire.id,wire);
    index.set(owner+'.'+key,wire);
  }
  return index;
}

function mappings(facts,requestKeys) {
  const slots = backingSlots(facts);
  const aliases = new Map();
  for (const wire of facts('core.word')) {
    const languages = values(wire,'lang');
    if (languages.length ? !languages.some(lang=>/^en(?:[-_]|$)/iu.test(lang))
      : /^w\.lang\.(?!en\.)/u.test(wire.id)) continue;
    if (values(wire,'of').length) continue;
    for (const means of values(wire,'means')) {
      const slot = slots.get(means);
      if (!slot) continue;
      const surfaces = aliases.get(slot) ?? new Map();
      aliases.set(slot,surfaces);
      for (const text of values(wire,'text')) {
        const keys = phrase(text);
        if (keys.length) surfaces.set(keys.join(' '),keys);
      }
    }
  }
  const explicit = Map.groupBy(facts('pro.reader.fixed_property'), wire =>
    keyOf(field(wire,'family'),field(wire,'attribute')));
  return requestKeys.flatMap(key => {
    if (!key.head.split('+').some(head=>['class','candidate'].includes(head)) || !key.values.length) return [];
    const bindings = explicit.get(keyOf(key.family,key.name));
    return (bindings ?? [undefined]).flatMap(binding => {
      const namedSlot = binding && field(binding,'slot');
      const native = slots.get(key.means), slot = slots.get(namedSlot ?? key.means);
      if (!slot || namedSlot && key.means && slot !== native || !aliases.has(slot)) return [];
      if (!binding && !values(slot,'kind').includes('boolean')) return [];
      const stateValues = new Map();
      for (const state of ['on','off']) {
        const value = (binding && field(binding,state+'_value')) ?? state;
        if (key.values.includes(value)) stateValues.set(state,value);
      }
      return stateValues.size ? [{
        family:key.family, attribute:key.name, stateValues, aliases:[...aliases.get(slot).values()],
      }] : [];
    });
  });
}

function nativeFrames(facts) {
  const parts = Map.groupBy(facts('w.lang.en.part'),wire=>field(wire,'frame'));
  const literals = Map.groupBy(facts('w.lang.en.fixed'),wire=>field(wire,'frame'));
  const leads = new Map(facts('w.lang.en.phrase').map(wire=>[field(wire,'name'),values(wire,'item').map(phrase)]));
  const nominalDeterminers = new Set(facts('w.lang.en.closed')
    .filter(wire=>field(wire,'class')==='determiner').flatMap(wire=>values(wire,'text').map(text=>phrase(text).join(' '))));
  const variableFrames=[], fixedFrames=facts('w.lang.en.frame').flatMap(frame=>{
    const act = field(frame,'act'), name = field(frame,'name');
    if (!act || field(frame,'mode')!=='set' || field(frame,'polarity') || field(frame,'mood')) return [];
    const fixed = literals.get(name) ?? [];
    const state = fixed.length===1 && field(fixed[0],'role')==='value' ? field(fixed[0],'value') : undefined;
    const pattern = [...(parts.get(name) ?? [])].sort((a,b)=>Number(field(a,'at'))-Number(field(b,'at')));
    const optional = wire => field(wire,'optional')==='yes';
    const prefix = pattern[0] && field(pattern[0],'is')==='lead' && optional(pattern[0]) ? pattern.shift() : undefined;
    const verb = pattern.shift();
    if (!verb || field(verb,'is')!=='word' || optional(verb)) return [];
    const determiner = pattern[0] && field(pattern[0],'is')==='det' && optional(pattern[0]) ? Boolean(pattern.shift()) : false;
    const attribute = pattern.shift();
    if (!attribute || field(attribute,'is')!=='role' || field(attribute,'role')!=='attribute' ||
        field(attribute,'takes')!=='lexicon' || optional(attribute)) return [];
    const records=values(verb,'word').map(phrase).filter(keys=>keys.length).map(head=>({
      act,state,head,determiner,nominalDeterminers,
      leads:prefix ? (leads.get(field(prefix,'phrase')) ?? []) : [],
    }));
    if (!fixed.length && pattern.length===1 && !optional(pattern[0]) && field(pattern[0],'is')==='role' &&
        field(pattern[0],'role')==='value' && field(pattern[0],'takes')==='lexicon' && field(pattern[0],'lexicon')==='value') {
      variableFrames.push(...records.filter(record=>record.head.length===1));
    }
    if (!['on','off'].includes(state) || pattern.length>1 ||
        pattern.some(piece=>field(piece,'is')!=='word' || !optional(piece))) return [];
    const tails=pattern.flatMap(piece=>values(piece,'word').map(phrase)).filter(keys=>keys.length);
    return records.map(record=>({...record,tails}));
  });
  // A written particle can supply a state when the contiguous form specifies
  // it directly, or when the separable verb shares an act with a fixed cue.
  const verbActs=new Map(), separableForms=new Map();
  for (const verb of facts('k.actions.verb')) {
    const act=field(verb,'act');
    if (!act || field(verb,'object')!=='thing' || ['attribute','complement','after_particle','value']
      .some(name=>field(verb,name))) continue;
    for (const text of values(verb,'text')) {
      const keys=phrase(text), written=keys.join(' ');
      const acts=verbActs.get(written) ?? new Set();
      acts.add(act);
      verbActs.set(written,acts);
      if (keys.length<2 || field(verb,'separable')!=='true') continue;
      const forms=separableForms.get(keys[0]) ?? [];
      forms.push({act,tail:keys.slice(1)});
      separableForms.set(keys[0],forms);
    }
  }
  const splitFrames=[];
  for (const frame of variableFrames) {
    const direct=fixedFrames.filter(fixed=>fixed.act===frame.act && fixed.head.length>1 && fixed.head[0]===frame.head[0]);
    const tailsByState=new Map();
    const add=(tail,state)=>{
      const key=tail.join(' '), states=tailsByState.get(key) ?? new Set();
      states.add(state);
      tailsByState.set(key,states);
    };
    for (const fixed of direct) add(fixed.head.slice(1),fixed.state);
    for (const {act,tail} of separableForms.get(frame.head[0]) ?? []) {
      const compatible=fixedFrames.filter(fixed=>fixed.act===frame.act &&
        verbActs.get(fixed.head.join(' '))?.has(act) && fixed.tails.some(form=>form.join(' ')===tail.join(' ')));
      for (const fixed of compatible) add(tail,fixed.state);
    }
    for (const [tail,states] of tailsByState) {
      if (states.size!==1) continue;
      splitFrames.push({...frame,state:[...states][0],tails:[tail.split(' ')],requiredTail:true});
    }
  }
  return [...fixedFrames,...splitFrames];
}

export function compileFixedProperties(facts,requestKeys) {
  const properties = mappings(facts,requestKeys), index = new Map();
  for (const frame of nativeFrames(facts)) {
    for (const property of properties) {
      const value = property.stateValues.get(frame.state);
      if (!value) continue;
      const records = index.get(frame.head[0]) ?? [];
      records.push({...frame, family:property.family, attribute:property.attribute, aliases:property.aliases, value});
      index.set(frame.head[0],records);
      for (const lead of frame.leads) {
        if (lead[0]===frame.head[0]) continue;
        const starters = index.get(lead[0]) ?? [];
        starters.push(records.at(-1));
        index.set(lead[0],starters);
      }
    }
  }
  return index;
}

function match(keys,start,pattern) {
  return pattern.every((token,i)=>keys[start+i]===token);
}

function frameMatch(entry,keys,worlds) {
  const starts = [0,...entry.leads.filter(lead=>lead.length && match(keys,0,lead))
    .map(lead=>lead.length+Number(keys[lead.length]===','))];
  for (const start of starts.sort((a,b)=>b-a)) {
    if (!match(keys,start,entry.head)) continue;
    const after = start+entry.head.length, nominalStarts = [after];
    if (entry.determiner) {
      for (let end=after+1;end<=Math.min(keys.length,after+4);end++) {
        const surface = keys.slice(after,end).join(' ');
        if (Object.hasOwn(worlds.determiners,surface) || entry.nominalDeterminers.has(surface)) nominalStarts.push(end);
      }
    }
    const matches = nominalStarts.flatMap(from=>entry.aliases.filter(alias=>match(keys,from,alias))
      .map(alias=>({from,to:from+alias.length})));
    if (!matches.length) continue;
    const longest = matches.sort((a,b)=>b.to-a.to || a.from-b.from)[0];
    const tail = entry.tails.filter(form=>match(keys,longest.to,form)).sort((a,b)=>b.length-a.length)[0];
    if (entry.requiredTail && !tail) continue;
    return {start,after,...longest,finish:longest.to+(tail?.length ?? 0)};
  }
}

function scopedTokens(text,ts,quotes,wires) {
  const request = wires?.find(wire=>wire.type===requestType), scope = request && field(request,'words');
  const ranges = scope ? literalRanges(text,scope) : [[0,text.length]];
  if (ranges.length!==1) return;
  const [[from,to]] = ranges;
  const start=Array.from(text.slice(0,from)).length, end=start+Array.from(text.slice(from,to)).length;
  const local = ts.filter(([, ,left,right])=>left>=start && right<=end);
  const keys = local.map(([lower,,left,right])=>quotes.some(q=>q.start<right && left<q.end) ? '' : lower);
  return {local,keys};
}

function blocked(keys,worlds) {
  return keys.some((token,i)=>{
    if (token==='?' || token===';' || terminal.test(token) && keys.slice(i+1).some(next=>word.test(next))) return true;
    for (let end=i+1;end<=Math.min(i+4,keys.length);end++) {
      const form = keys.slice(i,end).join(' ');
      if (worlds.negatives.has(form) || worlds.scopeGrammar.negatives.has(form) ||
          worlds.scopeGrammar.conditionals.has(form) ||
          ['sequence','contrast','clause','coordination'].includes(worlds.joiners[form])) return true;
    }
    return false;
  });
}

function asCircuit(entry,verb,alias,existing,request,consume) {
  const ref = '$'+request.id;
  const wires = existing ?? [request,{
    id:'r1.t',type:targetType,attrs:{request:[ref],family:[atom(entry.family)],mode:['existing'],fill:['context']},
  },{
    id:'r1.l1',type:'w.request.lookup',attrs:{request:[ref],target:['$r1.t'],key:['thing'],from:['page']},
  }];
  const existingIds = new Set(wires.map(wire=>wire.id));
  const stem = request.id+'.fixed';
  let id = stem;
  for (let n=2;existingIds.has(id);n++) id=stem+n;
  return [...consume(wires),{id,type:constraintType,attrs:{
    request:[ref],on:['attribute'],attribute:[atom(entry.attribute)],value:[atom(entry.value)],
    words:[JSON.stringify(verb)],key_words:[JSON.stringify(alias)],operator:['eq'],phase:['result'],
  }}];
}

function contextualTail(keys, worlds) {
  for (let end=1;end<keys.length;end++) {
    const cue = keys.slice(0,end).join(' '), reference = keys.slice(end).join(' ');
    if (worlds.isReference(reference) && worlds.lookup(cue).some(([role,,kind,relation]) =>
      role==='marker' && kind==='spatial' && relation)) return true;
  }
  return false;
}

export function fixedPropertyReadings(text,ts,quotes,candidate,worlds) {
  if (!worlds.fixedProperties?.size || candidate && !candidate.sop) return [];
  const wires = candidate && parse(candidate.sop);
  const requests = wires?.filter(wire=>wire.type===requestType) ?? [];
  const targets = wires?.filter(wire=>wire.type===targetType) ?? [];
  if (wires && (requests.length!==1 || targets.length!==1 || field(targets[0],'mode')!=='existing' ||
      field(targets[0],'request')!=='$'+requests[0].id)) return [];
  const scoped = scopedTokens(text,ts,quotes,wires);
  if (!scoped || blocked(scoped.keys,worlds)) return [];
  const {keys,local} = scoped, entries = worlds.fixedProperties.get(keys[0]) ?? [];
  const chars = Array.from(text);
  const slice = (a,b) => chars.slice(local[a][2],local[b-1][3]).join('');
  const point = offset => chars.slice(0,offset).join('').length;
  const proposals = [];
  for (const entry of entries) {
    if (entry.requiredTail && wires) continue;
    const span = frameMatch(entry,keys,worlds);
    if (!span) continue;
    const {start,after,from,to} = span;
    let {finish} = span;
    const verb = slice(start,after), alias = slice(from,to);
    if (wires && (field(targets[0],'family')!==entry.family || field(requests[0],'act')!==entry.act ||
        field(requests[0],'predicate')!==verb ||
        wires.some(wire=>wire.type===constraintType && field(wire,'attribute')===entry.attribute))) continue;
    let stop=keys.length;
    while (stop>finish && terminal.test(keys[stop-1])) stop--;
    if (entry.requiredTail && finish!==stop) continue;
    if (finish>to && contextualTail(keys.slice(to,stop),worlds)) finish=to;
    if (!wires && finish<stop && !contextualTail(keys.slice(finish,stop),worlds)) continue;
    const request = requests[0] ?? {id:'r1',type:requestType,attrs:{act:[atom(entry.act)],mood:['do'],predicate:[atom(verb)]}};
    const consume = program => consumeUnread(consumeUnread(program,text,point(local[from][2]),point(local[finish-1][3])),
      text,point(local[start][2]),point(local[after-1][3]));
    const circuit = asCircuit(entry,entry.requiredTail ? slice(to,finish) : verb,alias,wires,request,consume);
    const determiner = worlds.determiners[keys.slice(after,from).join(' ')];
    const unread = [];
    if (!wires && from>after && !['definite','indefinite'].includes(determiner)) unread.push(slice(after,from));
    if (!wires && finish<stop) unread.push(slice(finish,stop));
    for (const [i,fragment] of unread.entries()) {
      circuit.push({id:'r1.u'+(i+1),type:unreadType,attrs:{request:['$r1'],text:[JSON.stringify(fragment)]}});
    }
    proposals.push({sop:serialize(circuit),source:'fixed-property',
      status:circuit.some(wire=>wire.type===unreadType) ? 'partial' : 'matched'});
  }
  return proposals;
}
