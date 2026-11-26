import {nominalScaleReading} from './nominal-scales.mjs';
import { identitySelectorReadings } from './identity-selectors.mjs';
import { fixedPropertyReadings } from './fixed-properties.mjs';
import { parse, serialize } from './knowledge.mjs';
import { literalRanges } from './evidence.mjs';
import { tokens } from './lexicon.mjs';
import { quotedSpans } from './literal-roles.mjs';
import { nativeNominalPhraseReadings } from './nominal-phrases.mjs';
import { nominalNumberReading } from './nominal-number.mjs';

const field=(wire,key)=>{
  const raw=wire.attrs[key]?.[0];
  return raw?.startsWith('"') ? JSON.parse(raw) : raw;
};

const requestType='w.request.request', targetType='w.request.target';
const constraintType='w.request.constraint', unreadType='w.request.unread';

function ownedScope(text,request) {
  const words=field(request,'words'), ranges=literalRanges(text,words);
  return ranges.length===1 ? {request,words,range:ranges[0]} : undefined;
}

function afterJoiner(words,worlds) {
  const ts=tokens(words);
  for (let end=Math.min(4,ts.length-1);end>0;end--) {
    const prefix=ts.slice(0,end).map(([token])=>token).join(' ');
    if (!['sequence','addition','coordination'].includes(worlds.joiners[prefix])) continue;
    const next=ts[end]?.[0]===',' ? end+1 : end;
    if (ts[next]) return Array.from(words).slice(ts[next][2]).join('');
  }
  return words;
}

function backing(family,attribute,worlds) {
  const declarations=worlds.requestKeys.filter(key=>key.family===family && key.name===attribute);
  const meanings=new Set(declarations.map(key=>key.means ?? key.name));
  return meanings.size===1 ? [...meanings][0] : undefined;
}

function selectFixed(readings,original,worlds) {
  const ids=new Set(original.map(wire=>wire.id));
  const choices=[...new Set(readings.map(reading=>reading.sop))].flatMap(sop=>{
    const wires=parse(sop);
    const target=wires.find(wire=>wire.type===targetType);
    const family=field(target,'family');
    const addition=wires.find(wire=>wire.type===constraintType && !ids.has(wire.id));
    const attribute=addition && field(addition,'attribute');
    const owner=attribute && backing(family,attribute,worlds);
    return owner ? [{wires,family,addition,owner}] : [];
  });
  if (!choices.length || new Set(choices.map(choice=>JSON.stringify([choice.family,choice.owner]))).size!==1) return;
  if (choices.length===1) return choices[0];
  // The property may have multiple declared request keys for one backing
  // slot. Prefer the single encoding whose value is itself written.
  const literal=choices.filter(({addition})=>field(addition,'value').toLowerCase()===field(addition,'words').toLowerCase());
  return literal.length===1 ? literal[0] : undefined;
}

function fixedPacket(words,request,original,worlds,permit,priorFamilies) {
  if (!worlds.fixedProperties?.size) return;
  const ts=tokens(words),quotes=quotedSpans(words);
  if (!worlds.fixedProperties.has(ts[0]?.[0]) || !permit(words,quotes)) return;
  const temporary=original.map(wire=>wire.id===request.id
    ? {...wire,attrs:{...wire.attrs,words:[JSON.stringify(words)]}} : wire);
  const direct=selectFixed(fixedPropertyReadings(words,ts,quotes,{sop:serialize(temporary)},worlds),original,worlds);
  if (direct) {
    const belongs=original.some(wire=>wire.type===constraintType &&
      backing(direct.family,field(wire,'attribute'),worlds)===direct.owner);
    return belongs ? undefined : direct.wires.map(wire=>wire.id===request.id ? request : wire);
  }
  const native=selectFixed(fixedPropertyReadings(words,ts,quotes,undefined,worlds),[],worlds);
  if (!native || !priorFamilies.has(native.family)) return;
  const asserted=native.wires.find(wire=>wire.type===requestType);
  if (field(asserted,'predicate')!==field(request,'predicate')) return;
  const keyWords=field(native.addition,'key_words'), spans=literalRanges(words,keyWords);
  if (spans.length!==1) return;
  const [[start,end]]=spans;
  const localEvidence=value=>value && literalRanges(words,value).some(([a,b])=>a>=start && b<=end);
  const target=original.find(wire=>wire.type===targetType);
  if (target && (field(target,'mode')!=='existing' || ['name','ids','code_words','ordinal','count'].some(key=>target.attrs[key]) ||
      !localEvidence(field(target,'family_words') ?? field(target,'sort_words') ?? field(target,'sort')))) return;
  if (original.some(wire=>wire.type===constraintType && ((field(wire,'phase') ?? 'result')!=='selector' ||
      !localEvidence(field(wire,'words') ?? field(wire,'value'))))) return;
  if (original.some(wire=>![requestType,targetType,constraintType,unreadType,'w.request.lookup'].includes(wire.type))) return;

  const ids=new Map(native.wires.map(wire=>[wire.id,wire===asserted ? request.id : request.id+'.native.'+wire.id]));
  const revised=native.wires.map(wire=>({
    ...wire,id:ids.get(wire.id),attrs:Object.fromEntries(Object.entries(wire.attrs).map(([key,values])=>[key,values.map(value=>
      value.startsWith('$') && ids.has(value.slice(1)) ? '$'+ids.get(value.slice(1)) : value)])),
  }));
  revised[0].attrs.words=request.attrs.words;
  return revised;
}

// Bind qualifiers against the words owned by each request.
export function clauseQualifiers(text, worlds, permit, scaleOptions) {
  const cache=new Map(), fixedCache=new Map();
  const fixedAllowed=worlds.fixedProperties?.size && permit(text,quotedSpans(text));
  return candidate=>{
    const wires=parse(candidate.sop);
    const requests=wires.filter(w=>w.type===requestType);
    if (requests.length<2) return;
    const replacements=new Map(), added=[];
    const ids=new Set(wires.map(w=>w.id));
    let changed=false;
    const scopes=requests.map(request=>ownedScope(text,request)).filter(Boolean);
    for (const {request,words,range} of scopes) {
      const original=wires.filter(w=>w===request || field(w,'request')==='$'+request.id);
      const packet=serialize(original);
      if (!cache.has(packet)) {
        const ts=tokens(words),quotes=quotedSpans(words);
        let result={sop:packet};
        if (permit(words,quotes)) {
          result=nominalScaleReading(words,ts,quotes,result,worlds,scaleOptions) ?? result;
          result=identitySelectorReadings(words,result,worlds)[0] ?? result;
          result=nominalNumberReading(words,result,worlds.nominalNumbers,quotes) ?? result;
          result=nativeNominalPhraseReadings(words,ts,quotes,result,worlds.nominalPositions,worlds)[0] ?? result;
        }
        cache.set(packet,result.sop===packet ? null : parse(result.sop));
      }
      let revised=cache.get(packet);
      if (fixedAllowed && scopes.every(scope=>scope.request===request || scope.range[1]<=range[0] || scope.range[0]>=range[1])) {
        const prior=scopes.filter(scope=>scope.range[1]<=range[0]);
        const preceding=prior.map(scope=>'$'+scope.request.id);
        const priorFamilies=new Set(wires.filter(wire=>wire.type===targetType && preceding.includes(field(wire,'request')))
          .map(wire=>field(wire,'family')));
        const local=prior.length ? afterJoiner(words,worlds) : words;
        const key=JSON.stringify([packet,local,[...priorFamilies].sort()]);
        if (!fixedCache.has(key)) fixedCache.set(key,fixedPacket(local,request,revised ?? original,worlds,permit,priorFamilies));
        revised=fixedCache.get(key) ?? revised;
      }
      if (!revised) continue;
      const oldIds=new Set(original.map(w=>w.id));
      const extras=revised.filter(w=>!oldIds.has(w.id));
      if (extras.some(w=>ids.has(w.id))) continue;
      const byId=new Map(revised.map(w=>[w.id,w]));
      const replaced=new Set(original.filter(w=>JSON.stringify(w.attrs)!==JSON.stringify(byId.get(w.id)?.attrs))
        .map(w=>'$'+w.id));
      if (wires.some(w=>!oldIds.has(w.id) && Object.values(w.attrs).flat().some(value=>replaced.has(value)))) continue;
      for (const w of original) replacements.set(w.id,byId.get(w.id));
      for (const w of extras) { ids.add(w.id);added.push(w); }
      changed=true;
    }
    if (changed) return {sop:serialize([...wires.map(w=>replacements.has(w.id) ? replacements.get(w.id) : w).filter(Boolean),...added]),
      source:'clause-qualifiers',status:'partial'};
  };
}
