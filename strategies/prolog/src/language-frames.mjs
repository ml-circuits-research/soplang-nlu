// Compile the supported fragment of native w.lang.en frames once per snapshot.
// A domain prerequisite or an unsupported part invalidates the entire frame.
import { literalRanges } from './evidence.mjs';
import { tokens } from './lexicon.mjs';

const decode=v=>v?.startsWith('"') ? JSON.parse(v) : v;
const all=(wire,key)=>(wire.attrs[key] ?? []).map(decode);
const one=(wire,key)=>all(wire,key)[0];
const surface=text=>tokens(text).map(t=>t[0]).join(' ');
export function languageFrames(facts) {
  const lexicon=new Map(), parts=new Map(), rules=new Map(), fixedPredicates=new Set();
  let maxLength=1;
  function addEvent(text,kind,value) {
    const key=surface(text);
    if (!key) return;
    const items=lexicon.get(key) ?? [];
    if (!items.some(e=>e[0]===kind && e[1]===value)) items.push([kind,value]);
    lexicon.set(key,items);
    maxLength=Math.max(maxLength,key.split(' ').length);
  }
  for (const w of facts('w.lang.en.part')) {
    const key=one(w,'frame');
    if (!parts.has(key)) parts.set(key,[]);
    parts.get(key).push(w);
  }
  const fixedFrames=new Set(facts('w.lang.en.fixed').map(w=>one(w,'frame')));
  const phraseBank=new Map(facts('w.lang.en.phrase').map(w=>[one(w,'name'),all(w,'item')]));
  for (const w of facts('w.lang.en.frame')) {
    const name=one(w,'name'),act=one(w,'act');
    if (!act || fixedFrames.has(name) || w.attrs.needs || w.attrs.mode || w.attrs.mood || w.attrs.polarity) continue;
    const ordered=(parts.get(name) ?? []).slice().sort((a,b)=>Number(one(a,'at'))-Number(one(b,'at')));
    const pattern=[];
    for (const p of ordered) {
      const kind=one(p,'is'),optional=one(p,'optional')==='yes';
      let value;
      if (kind==='verb') value=one(p,'act');
      if (kind==='role' && one(p,'takes')==='words') value=one(p,'role');
      if (kind==='lead') {
        value=one(p,'phrase');
        if (!phraseBank.has(value)) break;
      }
      if (kind==='det') value='det';
      if (kind==='word' && all(p,'word').length) value=p.id;
      if (!value || (kind==='role' && optional)) break;
      pattern.push([kind,value,optional]);
    }
    const first=pattern.findIndex(p=>p[0]==='verb');
    if (pattern.length!==ordered.length || first<0 || pattern[first][1]!==act ||
        pattern.some((p,i)=>i<first && p[0]!=='lead') ||
        pattern.filter(p=>p[0]==='verb').length!==1 || !pattern.some(p=>p[0]==='role')) continue;
    // Two word spans must have an obligatory lexical delimiter.
    let open=false,ambiguous=false;
    for (const [kind,,optional] of pattern) {
      if (kind==='role') { if (open) ambiguous=true; open=true; }
      else if (!optional) open=false;
    }
    if (ambiguous) continue;
    for (const [i,[kind,value]] of pattern.entries()) {
      if (kind==='lead') for (const text of phraseBank.get(value)) addEvent(text,kind,value);
      if (kind==='word') for (const text of all(ordered[i],'word')) addEvent(text,kind,value);
    }
    if (!rules.has(act)) rules.set(act,[]);
    rules.get(act).push({name,act,parts:pattern});
  }
  for (const w of facts('k.actions.verb')) {
    const act=one(w,'act');
    if (!rules.has(act)) continue;
    for (const text of all(w,'text')) {
      addEvent(text,'verb',act);
      const key=surface(text);
      if (key.includes(' ') && one(w,'object') && one(w,'separable')!=='true') fixedPredicates.add(key);
    }
  }
  for (const w of facts('w.lang.en.det')) for (const text of all(w,'text')) addEvent(text,'det','det');
  return {
    fixedPredicates,
    bindings:facts('pro.reader.evidence_role').map(w=>({role:one(w,'role'),type:one(w,'type'),slot:one(w,'slot'),phase:one(w,'phase')})),
    prepare(ts,quotes,worlds) {
      const events=[],acts=new Set();
      let length=ts.length;
      while (length && /^[.!]$/.test(ts[length-1][0])) length--;
      for (let i=0;i<length;i++) {
        let key='';
        for (let j=i;j<Math.min(i+maxLength,length);j++) {
          const [t,,s,e]=ts[j];
          if (quotes.some(q=>s<q.end && e>q.start)) break;
          key+=(j===i?'':' ')+t;
          if (worlds.negatives.has(key) || worlds.joiners[key] || worlds.scopeGrammar.choices.has(key) || ['?',';'].includes(t))
            return {frames:[],events:[],length};
          for (const [kind,value] of lexicon.get(key) ?? []) {
            events.push([i,j+1,kind,value]);
            if (kind==='verb' && (i===0 || events.some(([a,b,k])=>a===0 && b===i && k==='lead'))) acts.add(value);
          }
        }
      }
      return {length,events,frames:[...acts].flatMap(act=>rules.get(act))};
    }
  };
}

// A matching construction supports an act and lexical head. A differently
// interpreted head remains a possible reading because a catalog can be incomplete.
export function frameSupport(wires,proofs,ts,text,worlds) {
  const requests=wires.filter(w=>w.type==='w.request.request');
  if (requests.length!==1 || !proofs.length) return;
  const request=requests[0], act=one(request,'act'),predicate=one(request,'predicate');
  const chars=Array.from(text);
  const phrase=([i,j])=>chars.slice(ts[i][2],ts[j-1][3]).join('');
  const licensed=new Set(worlds.lookup(surface(predicate ?? '')).filter(e=>e[0]==='act').map(e=>e[1]));
  const bindings=worlds.languageFrames.bindings;
  const options=[];
  const competing=new Set();
  for (const proof of proofs) {
    if (predicate!==phrase(proof.predicate)) continue;
    if (act!==proof.act) { competing.add(proof.act); continue; }
    const roles=proof.roles.map(r=>({role:r.role,text:phrase(r.range)})),conflicts=[];
    for (const {role,type,slot,phase} of bindings) {
      if (!roles.some(r=>r.role===role)) continue;
      for (const w of wires.filter(w=>w.type===type && (!phase || one(w,'phase')===phase))) {
        for (const literal of all(w,slot)) {
          const inRoles=roles.filter(r=>literalRanges(r.text,literal).length);
          if (inRoles.length && inRoles.every(r=>r.role!==role))
            conflicts.push({code:'argument_role_conflict',wire:w.id,slot,literal,expectedRole:role,observedRoles:inRoles.map(r=>r.role)});
        }
      }
    }
    options.push({frame:proof.frame,act,predicate,roles,conflicts,discriminating:licensed.size===1 || roles.length>1});
  }
  if (!options.length)
    return competing.size && !licensed.has(act) ? {predicate,act,conflicts:[{code:'competing_frame_act',licensedActs:[...competing]}]} : undefined;
  // Prefer a frame that distinguishes more arguments. On equivalent frames
  // keep the interpretation with the fewest conflicting literal bindings.
  options.sort((a,b)=>b.roles.length-a.roles.length || a.conflicts.length-b.conflicts.length);
  return options[0];
}
