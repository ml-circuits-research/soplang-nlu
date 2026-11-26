import {catalogIssues} from './catalog.mjs';
import {visibleTokens} from './composition.mjs';
import {catalogReference,evidenceReport,literalRanges} from './evidence.mjs';
import {evidenceInText} from './grounding.mjs';
import {tokens} from './lexicon.mjs';
import {quotedSpans} from './literal-roles.mjs';
import {parse,validate} from './schema.mjs';
import {signatures} from './signatures.mjs';
import {serialize,str} from './knowledge.mjs';

const terminal=new Set(['.','?','!']);
const requestType='w.request.request';
const targetType='w.request.target';
const constraintType='w.request.constraint';
const unreadType='w.request.unread';
const one=(wire,key)=>str(wire.attrs[key]?.[0]);
const word=/[\p{L}\p{N}]/u;

function boundedSentences(text) {
  const chars=Array.from(text), ts=tokens(text);
  const visible=visibleTokens(chars,ts);
  const parts=[];
  let start=0;
  for (let i=0;i<visible.length-1;i++) {
    const mark=visible[i];
    if (!terminal.has(mark)) continue;
    const [, ,at,end]=ts[i];
    if (!/\s/u.test(chars[end] ?? '')) continue;
    // Initials and short dotted identifiers are not independent sentences.
    if (mark==='.' && ts[i-1]?.[3]===at &&
        (/^\p{L}$/u.test(ts[i-1][1]) || ts[i-2]?.[0]==='.' && ts[i-2][3]===ts[i-1][2])) continue;
    const part=chars.slice(start,end).join('').trim();
    if (!word.test(part)) return [];
    parts.push(part);
    if (parts.length===3) return [];
    start=end;
  }
  if (!parts.length) return [];
  const tail=chars.slice(start).join('').trim();
  return word.test(tail) ? [...parts,tail] : [];
}

export function declaresArgumentRoles(worlds,act,target,constraints) {
  const family=one(target,'family'), mode=one(target,'mode');
  return worlds.argumentPatterns(act).some(pattern=>{
    if (pattern.family!==family || pattern.mode!==mode) return false;
    const keys=pattern.relation ? [pattern.relationKey,pattern.anchorKey] : pattern.keys;
    const phases=pattern.relation ? ['result','selector'] : pattern.phases;
    return keys.every((key,index)=>constraints.some(wire=>one(wire,'attribute')===key &&
      one(wire,'value') && one(wire,'phase')===phases[index]));
  });
}

function leadsClause(text,request,target,source,worlds) {
  const predicate=one(request,'predicate');
  if (!predicate) return source==='nominal-creation';
  const quotes=quotedSpans(text);
  return literalRanges(text,predicate).some(([start,end])=>{
    const from=Array.from(text.slice(0,start)).length, to=Array.from(text.slice(0,end)).length;
    if (quotes.some(span=>span.start<to && span.end>from)) return false;
    const lead=tokens(text.slice(0,start)).filter(([key])=>key!==',').map(([key])=>key).join(' ');
    if (lead && !worlds.literalGrammar.leads.has(lead) && !worlds.fillerPhrases.has(lead) &&
        !worlds.scopeGrammar.proposals.has(lead) && !worlds.scopeGrammar.courtesyLeads.has(lead)) return false;
    const act=one(request,'act'), surface=tokens(predicate).map(([key])=>key).join(' ');
    const senses=worlds.lookup(surface).filter(([role])=>role==='act');
    if (act!=='make' || one(target,'mode')!=='new' ||
        !senses.length || senses.some(([,sense])=>sense===act)) return true;
    const [article]=tokens(text.slice(end))[0] ?? [];
    return ['indefinite','quantified'].includes(worlds.determiners[article]);
  });
}

function credible(text,candidate,worlds,coordinated=false) {
  if (!candidate?.sop) return;
  const wires=parse(candidate.sop);
  const requests=wires.filter(wire=>wire.type===requestType);
  const targets=wires.filter(wire=>wire.type===targetType);
  if (requests.length!==1 || targets.length!==1) return;
  const [request]=requests,[target]=targets, ref='$'+request.id;
  const mode=one(target,'mode'), act=one(request,'act');
  if (one(target,'request')!==ref || !one(target,'family') || !mode ||
      coordinated && act==='make' && mode!=='new') return;
  const constraints=wires.filter(wire=>wire.type===constraintType && one(wire,'request')===ref);
  if (!act || !worlds.literalGrammar.licenses(one(target,'family'),act) &&
      (!coordinated || !declaresArgumentRoles(worlds,act,target,constraints))) return;
  if (coordinated && !leadsClause(text,request,target,candidate.source,worlds)) return;
  const typedPartial=!coordinated && candidate.source==='unresolved-owned-choice' && candidate.status==='partial' &&
    act==='change' && mode==='existing' && one(request,'predicate') && leadsClause(text,request,target,candidate.source,worlds);
  const result=constraints.some(wire=>one(wire,'phase')==='result' && !one(wire,'want'));
  if (act==='ask') {
    if (!one(request,'asked') && !one(request,'question') && !constraints.length) return;
    if (coordinated && !one(request,'asked') && !one(request,'question') &&
        !worlds.lookup(tokens(one(request,'predicate') ?? '').map(([key])=>key).join(' '))
          .some(([role,sense])=>role==='act' && sense==='ask')) return;
  } else if (!result && !typedPartial && (act==='change' || !one(request,'predicate') ||
      !['name','description','sort','ids'].some(key=>one(target,key)))) return;
  if (wires.some(wire=>wire.type==='w.request.previous' || wire.type===unreadType && !typedPartial &&
      tokens(one(wire,'text') ?? '').some(([key])=>word.test(key) &&
        !Object.hasOwn(worlds.determiners,key) && !worlds.evidenceVocabulary.filler.has(key)))) return;
  if (catalogIssues(wires,worlds).length || !evidenceInText(text,candidate.sop,worlds)) return;
  return wires;
}

function remap(wires,prefix,text,worlds) {
  const ids=new Map(wires.map(wire=>[wire.id,prefix+wire.id]));
  const catalog=worlds?.validationModules?.catalogIds;
  if (wires.some(wire=>Object.entries(wire.attrs).some(([key,values])=>values.some(value=>
    value.startsWith('$') && !ids.has(value.slice(1)) &&
    !(catalog?.has(value.slice(1)) && catalogReference(worlds.evidenceVocabulary,wire,key,value)))))) return;
  return wires.map(wire=>{
    const attrs=Object.fromEntries(Object.entries(wire.attrs).map(([key,values])=>[key,values.map(value=>
      value.startsWith('$') && ids.has(value.slice(1)) ? '$'+ids.get(value.slice(1)) : value)]));
    if (wire.type===requestType && !attrs.words) attrs.words=[JSON.stringify(text)];
    return {...wire,id:ids.get(wire.id),attrs};
  });
}

function extendCombinations(beam,options) {
  const next=beam.flatMap(prefix=>options.map(option=>
    ({wires:[...prefix.wires,...option.wires],cost:prefix.cost+option.rank})));
  return next.sort((a,b)=>a.cost-b.cost).slice(0,12);
}

export async function coordinatedRequestReadings(parts,worlds,read,permit,{text}={}) {
  if (parts.length<2) return [];
  let beam=[{wires:[],cost:0}];
  let matched=beam;
  const understood=[];
  for (const [index,part] of parts.entries()) {
    if (!permit(part,quotedSpans(part))) return [];
    const candidates=await read(part);
    const seen=new Map();
    const options=[];
    for (const [rank,candidate] of candidates.entries()) {
      const wires=credible(part,candidate,worlds,true);
      if (!wires || evidenceReport(part,wires,worlds.evidenceVocabulary).counts.uncovered) continue;
      const key=JSON.stringify(signatures(wires,false));
      if (seen.has(key)) {
        if (candidate.status==='matched') seen.get(key).matched=true;
        continue;
      }
      const mapped=remap(wires,'clause'+(index+1)+'.',part,worlds);
      if (!mapped) continue;
      const request=mapped.find(wire=>wire.type===requestType);
      request.attrs.mood ??= [one(request,'act')==='ask' ? 'ask' : 'do'];
      const option={wires:mapped,rank,matched:candidate.status==='matched'};
      seen.set(key,option);
      options.push(option);
    }
    if (!options.length) {
      if (text===undefined) return [];
      continue;
    }
    understood.push(index);
    beam=extendCombinations(beam,options);
    // Complete local readings can be ranked below lexical fallbacks on every
    // clause. Give their combinations space independently of the mixed beam.
    matched=extendCombinations(matched,options.filter(option=>option.matched));
  }
  if (!understood.length) return [];
  const partial=understood.length<parts.length;
  const groups=[];
  if (partial) {
    const bounds=[];
    let cursor=0;
    for (const part of parts) {
      const location=literalRanges(text,part,cursor)[0];
      if (!location) return [];
      bounds.push(location);
      cursor=location[1];
    }
    for (const [i,index] of understood.entries()) {
      const from=i ? index : 0;
      const to=understood[i+1] ?? parts.length;
      if (to-from===1) continue;
      const words=text.slice(bounds[from][0],bounds[to-1][1]);
      const gaps=parts.slice(from,to).filter((_,offset)=>from+offset!==index);
      groups.push({prefix:'clause'+(index+1)+'.',words,gaps});
    }
  }
  const combined=new Set([...beam,...matched].map(({wires})=>{
    const bounded=[...wires];
    for (const {prefix,words,gaps} of groups) {
      const ownerIndex=bounded.findIndex(wire=>wire.type===requestType && wire.id.startsWith(prefix));
      const request=bounded[ownerIndex];
      // Unread wires require a request owner, and literal evidence must be in
      // its scope. Widen only the source span, after certifying the clause.
      bounded[ownerIndex]={...request,attrs:{...request.attrs,words:[JSON.stringify(words)]}};
      for (const [i,gap] of gaps.entries()) {
        bounded.push({id:'gap.'+prefix+i,type:unreadType,
          attrs:{request:['$'+request.id],text:[JSON.stringify(gap)]}});
      }
    }
    return serialize(bounded);
  }));
  return [...combined].map(sop=>({sop,source:'coordinated-requests',status:partial ? 'partial' : 'matched'}));
}

function alternatives(part,index,worlds) {
  const choices=[{body:part}];
  if (!index) return choices;
  const ts=tokens(part), chars=Array.from(part);
  for (let end=1;end<Math.min(ts.length,5);end++) {
    const head=ts.slice(0,end).map(([key])=>key).join(' ');
    if (!worlds.sentenceAdditions?.has(head) && !['addition','coordination','sequence'].includes(worlds.joiners[head])) continue;
    const [, ,start]=ts[end];
    choices.push({body:chars.slice(start).join(''),lead:chars.slice(0,start).join('').trim()});
  }
  return choices;
}

function fragmentSurfaces(body) {
  const alternate=body.endsWith('.') && !body.endsWith('..') ? body.slice(0,-1).trimEnd() : body;
  return alternate===body ? [body] : [body,alternate];
}

export async function combineIndependentRequests(parts,worlds,read,permit) {
  if (parts.length<2 || parts.length>3) return [];
  let beam=[[]];
  for (const [index,part] of parts.entries()) {
    const options=[];
    const seen=new Set();
    for (const {body,lead} of alternatives(part,index,worlds)) {
      if (!permit(body,quotedSpans(body))) continue;
      let candidates=await read(body);
      const surfaces=fragmentSurfaces(body);
      if (surfaces.length>1 && !candidates.some(candidate=>credible(body,candidate,worlds))) {
        candidates=await read(surfaces[1]);
      }
      for (const candidate of candidates) {
        const wires=credible(body,candidate,worlds);
        if (!wires) continue;
        const prefix='sentence'+(index+1)+'.';
        const mapped=remap(wires,prefix,body,worlds);
        if (!mapped) continue;
        const signature=serialize(mapped);
        if (seen.has(signature)) continue;
        seen.add(signature);
        if (lead) {
          let id=prefix+'lead';
          while (mapped.some(wire=>wire.id===id)) id+='_';
          mapped.unshift({id,type:'w.request.filler',attrs:{text:[JSON.stringify(lead)]}});
        }
        options.push(mapped);
        if (options.length===4) break;
      }
      if (options.length===4) break;
    }
    if (!options.length) return [];
    beam=beam.flatMap(previous=>options.map(option=>[...previous,...option])).slice(0,12);
  }
  return beam.map(wires=>serialize(wires)).filter(sop=>validate(sop,worlds))
    .map(sop=>({sop,source:'sentence-requests',status:sop.includes(' w.request.unread ') ? 'partial' : 'matched'}));
}

export async function sentenceRequestReadings(text,worlds,read,permit) {
  const parts=boundedSentences(text);
  if (!parts.length || !permit(text,quotedSpans(text))) return [];
  return combineIndependentRequests(parts,worlds,read,permit);
}
