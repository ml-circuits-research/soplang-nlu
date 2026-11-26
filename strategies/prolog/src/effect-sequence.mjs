import { visibleTokens } from './composition.mjs';
import { evidenceReport, literalRanges } from './evidence.mjs';
import { tokens } from './lexicon.mjs';
import { maskQuoted, quotedSpans } from './literal-roles.mjs';
import { requestScope } from './request-scope.mjs';
import { parse, serialize } from './knowledge.mjs';

const request = 'w.request.request';
const target = 'w.request.target';
const lookup = 'w.request.lookup';
const constraint = 'w.request.constraint';
const filler = 'w.request.filler';
const permitted = new Set([request,target,lookup,constraint,filler]);
const exhaustiveSources = new Set(['owned-effects','contextual-effects']);
const separators = /^[,.;—–]$/u;
const decode = raw => raw?.startsWith('"') ? JSON.parse(raw) : raw;
const field = (wire,key) => decode(wire.attrs[key]?.[0]);
const form = text => tokens(text.replaceAll('’',"'")).map(([key])=>key).join(' ');
const literal = (text,word) => literalRanges(text,word).length===1;
const codec = JSON.stringify;

function slices(text) {
  const chars=Array.from(text), ts=tokens(text);
  if (ts.length>64) return [];
  const visible=visibleTokens(chars,ts);
  const cuts=ts.flatMap(([, ,start,end],i)=>i>0 && i+1<ts.length && separators.test(visible[i]) &&
    /^\s$/u.test(chars[end] ?? '') ? [[start,end]] : []);
  if (cuts.length>6) return [];
  const span=(a,b)=>chars.slice(a,b).join('').trim();
  return cuts.map(([a,b])=>({left:span(0,a),right:span(b,chars.length)}));
}

function packet(candidate,scope,keys,worlds) {
  if (!candidate?.sop) return;
  const wires=parse(candidate.sop);
  if (wires.some(w=>!permitted.has(w.type))) return;
  const reqs=wires.filter(w=>w.type===request), targets=wires.filter(w=>w.type===target);
  if (reqs.length!==1 || targets.length!==1) return;
  const [req]=reqs,[owner]=targets;
  if (field(req,'act')!=='change' || ![undefined,'do'].includes(field(req,'mood')) ||
      Object.keys(req.attrs).some(k=>!['act','mood','words','predicate'].includes(k)) ||
      field(owner,'mode')!=='existing' || field(owner,'request')!=='$'+req.id) return;
  const local=field(req,'words'), pred=field(req,'predicate');
  if (local && !literal(scope,local) || pred && !literal(scope,pred)) return;
  const family=field(owner,'family');
  const effects=wires.filter(w=>w.type===constraint);
  const catalog=keys.get(family);
  const licensed=w=>{
    const declarations=catalog?.get(field(w,'attribute')) ?? [];
    const v=field(w,'value');
    return declarations.some(key=>!v || !key.values.length ||
      key.values.some(x=>x.toLowerCase()===v.toLowerCase()) ||
      field(w,'open_value')==='true' && key.head.split('+').includes('candidate'));
  };
  if (!effects.length || effects.some(w=>
    field(w,'request')!=='$'+req.id || field(w,'phase')!=='result' ||
    !licensed(w) || w.attrs.want ||
    !['eq','delta'].includes(field(w,'operator')) ||
    !literal(scope,field(w,'key_words')) || !literal(scope,field(w,'words') ?? field(w,'value')))) return;
  const grounding=wires.filter(w=>w.type===lookup);
  if (grounding.length!==1 || field(grounding[0],'request')!=='$'+req.id ||
      field(grounding[0],'target')!=='$'+owner.id || field(grounding[0],'key')!=='thing' ||
      field(grounding[0],'from')!=='page') return;
  const fill=field(owner,'fill');
  const operand=fill==='written' ? field(owner,'name') : fill==='description' ? field(owner,'description') : undefined;
  if (!['context','written','description'].includes(fill) || fill!=='context' && !literal(scope,operand)) return;
  if (['ids','count','count_words','quantity','ordinal','sort'].some(key=>owner.attrs[key]) ||
      fill==='context' && ['name','description','family_words'].some(key=>owner.attrs[key])) return;
  // The owned-effect parser matches the complete clause against declared
  // grammar, including grammatical heads that have no request wire.
  if (!exhaustiveSources.has(candidate.source)) {
    const {counts}=evidenceReport(scope,wires,worlds.evidenceVocabulary);
    if (counts.uncovered || counts.ambiguous_occurrence) return;
  }
  return {req,owner,family,effects,fill,operand,wires};
}

function pronounOwner(scope,right,worlds) {
  const predicate=field(right.req,'predicate');
  if (!predicate || !worlds.sequenceObjectPronouns?.size) return false;
  const hits=literalRanges(scope,predicate);
  if (hits.length!==1) return false;
  const tail=scope.slice(hits[0][1]).trimStart();
  return [...worlds.sequenceObjectPronouns].find(([surface,number])=>{
    if (number!=='sg') return false;
    const input=form(tail).split(' ').slice(0,surface.split(' ').length).join(' ');
    return input===surface;
  })?.[0];
}

function transfer(wires, ids) {
  if (wires.some(w=>Object.values(w.attrs).flat().some(v=>v.startsWith('$') && !ids.has(v.slice(1))))) return;
  return wires.map(w=>({...w,id:ids.get(w.id),attrs:Object.fromEntries(
    Object.entries(w.attrs).map(([k,values])=>[k,values.map(v=>v.startsWith('$') ? '$'+ids.get(v.slice(1)) : v)]),
  )}));
}

function merge(text,split,left,right,worlds) {
  const pronoun=pronounOwner(split.right,right,worlds);
  const property=field(right.effects[0],'key_words');
  const start=literalRanges(split.right,property)[0]?.[0];
  const prefix=start===undefined ? undefined : form(split.right.slice(0,start));
  const ellipsis=right.fill==='context' && !field(right.req,'predicate') && prefix!==undefined &&
    (!prefix || worlds.determiners[prefix]==='definite');
  const same=left.family===right.family && (
    left.fill==='context' && right.fill==='context' ||
    left.fill===right.fill && left.operand && form(left.operand)===form(right.operand) ||
    pronoun && (right.fill==='context' || right.operand && form(right.operand)===pronoun) ||
    left.fill!=='context' && ellipsis);
  let wires;
  if (same) {
    if (new Set([...left.effects,...right.effects].map(w=>field(w,'attribute'))).size!==left.effects.length+right.effects.length) return;
    const initial=left.wires, addition=right.wires.filter(w=>w.type===constraint || w.type===filler);
    const a=transfer(initial,new Map(initial.map(w=>[w.id,'a.'+w.id])));
    const b=transfer(addition,new Map([[right.req.id,'a.'+left.req.id],[right.owner.id,'a.'+left.owner.id],
      ...addition.map(w=>[w.id,'b.'+w.id])]));
    if (!a || !b) return;
    const req=a.find(w=>w.type===request);
    req.attrs.words=[codec(text)];
    wires=[...a,...b];
  } else {
    // A right-hand pronoun is not a second written identity.
    if (pronoun || right.fill==='context' && left.fill!=='context') return;
    const parts=[left,right].map(({wires},i)=>transfer(wires,new Map(wires.map(w=>[w.id,'s'+i+'.'+w.id]))));
    if (parts.some(wires=>!wires)) return;
    for (const [i,wires] of parts.entries()) {
      wires.find(w=>w.type===request).attrs.words=[codec(i===0 ? split.left : split.right)];
    }
    wires=parts.flat();
  }
  return {sop:serialize(wires).trimEnd(),source:'effect-sequence',status:'matched'};
}

export function createEffectSequence(worlds) {
  const keys=new Map();
  for (const key of worlds.requestKeys) {
    const entries=keys.get(key.family) ?? new Map();
    const declarations=entries.get(key.name) ?? [];
    declarations.push(key);
    entries.set(key.name,declarations);
    keys.set(key.family,entries);
  }
  return async (text,read)=>{
    const splits=slices(text);
    if (!splits.length || requestScope(text,maskQuoted(text,quotedSpans(text)),worlds,[]).preventsSplitting) return [];
    const cache=new Map(), result=new Map();
    async function readings(part) {
      if (!cache.has(part)) {
        const first=await read(part);
        const choices=[first,...(first?.alternatives ?? [])].map(c=>packet(c,part,keys,worlds)).filter(Boolean);
        cache.set(part,choices.slice(0,8));
      }
      return cache.get(part);
    }
    for (const split of splits) {
      const first=await readings(split.left);
      if (!first.length) continue;
      for (const right of await readings(split.right)) for (const left of first) {
        const composed=merge(text,split,left,right,worlds);
        if (composed) result.set(composed.sop,composed);
      }
    }
    return [...result.values()];
  };
}
