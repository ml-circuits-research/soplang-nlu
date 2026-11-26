import { literalRanges } from './evidence.mjs';
import { tokens } from './lexicon.mjs';

const terminal = new Set(['.','?','!']);
const word = /[\p{L}\p{N}]/u;
const decode = value => value?.startsWith('"') ? JSON.parse(value) : value;
const one = (wire,key) => decode(wire.attrs[key]?.[0]);
const joined = (ts,start,end) => ts.slice(start,end).map(token=>token[0]).join(' ');
function leadEnd(ts, start, forms, boundary = ()=>true) {
  for (let end=Math.min(ts.length,start+12); end>start; end--) {
    if (forms?.has(joined(ts,start,end)) && boundary(ts[end]?.[0])) return end;
  }
  return start;
}

function hasMutatingHead(ts, start, worlds, hits) {
  const offset=ts[start]?.[2];
  if (offset!==undefined && hits.some(([from,to,[role,act,mood,count]])=>
    from===offset && to<=ts.at(-1)[3] && role==='act' && act!=='ask' && mood==='do' && count>=2)) return true;
  for (let end=start+1; end <= Math.min(start+8,ts.length); end++) {
    if (worlds.lookup(joined(ts,start,end)).some(([role,act,mood]) =>
      role==='act' && act!=='ask' && mood!=='ask' && mood!=='check')) return true;
  }
  return false;
}

const asideBoundary = token => token===undefined || token===',' || terminal.has(token);

function firstContent(ts, worlds, polite = false) {
  let first=0;
  while (first<ts.length) {
    if (!word.test(ts[first][0])) { first++; continue; }
    let skip = first;
    for (let end=first+1; end <= Math.min(first+12,ts.length); end++) {
      const phrase=joined(ts,first,end);
      if (worlds.fillerPhrases.has(phrase) || (polite && ((worlds.scopeGrammar.courtesy.has(phrase) &&
          asideBoundary(ts[end]?.[0])) ||
          (worlds.scopeGrammar.conditionals.has(ts[first][0]) && worlds.literalGrammar?.leads.has(phrase))))) skip=end;
    }
    if (skip===first) break;
    first=skip;
  }
  return first;
}

function speech(ts, start, worlds, hits) {
  const head=ts[start]?.[0], second=ts[start+1]?.[0];
  const {questions,subjects,auxiliary,modals,addressees,plainImperatives,copulas,existentialSubjects,proposals,removals}=worlds.scopeGrammar;
  const setCountEnd=leadEnd(ts,start,worlds.scopeGrammar.setCounts);
  if (setCountEnd>start) return {intent:'question',type:'count',head:ts.slice(start,setCountEnd)};
  const proposalEnd=leadEnd(ts,start,proposals);
  if (proposalEnd>start) return {intent:'proposal',lead:ts.slice(start,proposalEnd),after:proposalEnd};
  const courtesyEnd=leadEnd(ts,start,worlds.scopeGrammar.courtesyLeads);
  if (courtesyEnd>start) {
    const action=firstContent(ts.slice(courtesyEnd),worlds)+courtesyEnd;
    const actionStart=ts[action]?.[2];
    if (hits.some(([a,b,[role,act,mood]])=>a===actionStart && b<=ts.at(-1)[3] && role==='act' &&
        act!=='ask' && !['ask','check'].includes(mood))) {
      return {intent:'proposal',lead:ts.slice(start,courtesyEnd),after:action,actionStart};
    }
  }
  const removalEnd=leadEnd(ts,start,removals);
  if (removalEnd>start) return {intent:'removal',lead:ts.slice(start,removalEnd),after:removalEnd};
  for (let end=Math.min(ts.length,start+4); end>start; end--) {
    const surface=joined(ts,start,end), question=questions.get(surface);
    if (question && (!question.requiresAsk || worlds.lookup(surface).some(([role,act])=>role==='act' && act==='ask'))) {
      return {intent:'question',type:question.type,head:ts.slice(start,end)};
    }
  }
  const inverted=subjects.has(second) || Object.hasOwn(worlds.determiners,second);
  if (!auxiliary.has(head) || !inverted) return {};
  if (modals.has(head)) {
    const politeEnd=leadEnd(ts,start,worlds.literalGrammar?.leads);
    if (politeEnd>start+2) return {intent:'proposal',lead:ts.slice(start,politeEnd),after:politeEnd};
    if (politeEnd===start+2 && addressees.has(second)) {
      let action=firstContent(ts.slice(politeEnd),worlds)+politeEnd;
      if (worlds.joiners[ts[action]?.[0]]==='addition') action++;
      if (hasMutatingHead(ts,action,worlds,hits)) return {};
    }
  }
  // A bare do/have form before a named argument also introduces an imperative.
  if (plainImperatives.has(head) && ts.at(-1)?.[0]!=='?' && !subjects.has(second)) return {};
  const existential=existentialSubjects.has(second) && copulas.has(head);
  return {intent:'question',type:existential ? 'exists' : '',head:ts.slice(start,start+(existential ? 2 : 1))};
}

function shotRanges(ts, chars, worlds) {
  const ranges=[];
  let begin=0;
  const lastWord=ts.findLastIndex(token=>word.test(token[0]));
  for (let i=0; i<ts.length; i++) {
    const [term,,start,end]=ts[i];
    if (terminal.has(term)) {
      if (term==='.' && chars[end] && !/\s/u.test(chars[end])) continue;
      if (i<lastWord) {
        ranges.push({ts:ts.slice(begin,i+1),start:ts[begin][2],end,sentenceEnd:true});
        begin=i+1;
      }
      continue;
    }
    let delimiter=i, kind;
    for (let j=i+1; j<=Math.min(i+5,ts.length); j++) {
      const joiner=worlds.joiners[joined(ts,i,j)];
      if (['sequence','contrast','clause'].includes(joiner)) {
        delimiter=j;
        kind=joiner;
      }
    }
    if (delimiter===i && term!==';') continue;
    if (begin<i) ranges.push({ts:ts.slice(begin,i),start:ts[begin][2],end:start,nextJoiner:kind});
    begin=Math.max(i+1,delimiter);
    i=begin-1;
  }
  if (begin<ts.length) ranges.push({ts:ts.slice(begin),start:ts[begin][2],end:chars.length});
  return ranges;
}

export function requestScope(text, masked, worlds, hits) {
  const chars=Array.from(text);
  const grammar=worlds.scopeGrammar;
  let dependent=false, hasCondition=false, interrogative=false, extendsQuestion=false;
  const regions=shotRanges(tokens(masked),chars,worlds).map((region,index,shots)=>{
    const {ts,start,end}=region;
    let content=firstContent(ts,worlds,true);
    for (let end=leadEnd(ts,content,grammar.rejections,token=>token===','); end>content;
      end=leadEnd(ts,content,grammar.rejections,token=>token===',')) {
      content=firstContent(ts.slice(end+1),worlds,true)+end+1;
    }
    const reading=speech(ts,content,worlds,hits);
    const questionScope=interrogative || reading.intent==='question';
    if (interrogative) extendsQuestion=true;
    interrogative=questionScope && !region.sentenceEnd;
    let negative, condition, guarded=dependent;
    for (let i=reading.after ?? content; i<ts.length; i++) {
      const courtesyEnd=leadEnd(ts,i,grammar.courtesy,asideBoundary);
      if (courtesyEnd>i) {
        i=courtesyEnd-1;
        continue;
      }
      for (let j=i+1; j<=Math.min(i+4,ts.length); j++) {
        const phrase=joined(ts,i,j);
        const polarity=grammar.conditionals.get(phrase);
        if (polarity) {
          guarded=true; hasCondition=true;
          const finish=i===content ? ts.find((token,k)=>k>=j && token[0]===',')?.[2] ?? end : end;
          condition ??= {start:ts[j-1][3],end:finish,polarity};
        }
        const inNominal=j===i+1 && worlds.determiners[ts[i-1]?.[0]]==='indefinite' && word.test(ts[j]?.[0] ?? '');
        if (!inNominal && (worlds.negatives.has(phrase) || grammar.negatives.has(phrase))) negative ??= ts[i][2];
      }
      let endToken=i;
      while (ts[endToken+1] && ts[endToken][3]===ts[endToken+1][2] && endToken-i<3) endToken++;
      const spelling=chars.slice(ts[i][2],ts[endToken][3]).join('').toLowerCase().replaceAll('’',"'");
      if ([...grammar.endings].some(ending=>spelling.endsWith(ending))) negative ??=ts[i][2];
    }
    dependent=guarded && !region.sentenceEnd;
    if (questionScope) return {...region,intent:'question',limit:negative ?? end,reading};
    const targetBeforeNegation=negative!==undefined && hits.some(([a,b,[role]])=>
      a>=start && b<=negative && ['target','reference'].includes(role));
    if (guarded || (negative!==undefined && !targetBeforeNegation)) {
      const negativeClause=negative!==undefined && hits.some(([a,b,[role,act]])=>
        a>=start && b<=end && role==='act' && act!=='ask');
      const localExclusion=shots[index-1]?.nextJoiner==='contrast' && !negativeClause;
      return {...region,intent:'guarded',limit:start,negative,condition,localExclusion};
    }
    return {...region,intent:reading.intent ?? 'action',limit:negative ?? end,negative,reading};
  });
  const restricted=regions.some(r=>!['action','proposal'].includes(r.intent) || r.limit<r.end);
  const preventsSplitting=hasCondition || extendsQuestion ||
    regions.some(r=>r.intent==='guarded' && r.negative!==undefined && !r.localExclusion);
  const regionText=(a,b)=>chars.slice(a,b).join('');
  const present=(candidate,value)=>value && literalRanges(candidate,value).length;
  const negativeZones=regions.filter(r=>r.negative!==undefined)
    .map(r=>regionText(r.negative,r.end));
  function directlyTypedNegation(dependents, clause) {
    return negativeZones.some(zone=>clause.includes(zone.trim()) && dependents.some(wire=>
      wire.type==='w.request.constraint' && ['no','not_all'].includes(one(wire,'want')) &&
      [one(wire,'value'),one(wire,'words')].some(value=>present(zone,value)))) &&
      !dependents.some(wire=>wire.type==='w.request.constraint' &&
        (one(wire,'phase') ?? 'result')==='result' && !['no','not_all'].includes(one(wire,'want')));
  }
  function directlyTypedCondition(dependents,predicate,clause) {
    if (!predicate || !dependents.some(wire=>wire.type==='w.request.target')) return false;
    const parts=regions.flatMap(r=>r.condition ? [{
      text:regionText(r.condition.start,r.condition.end),
      negative:r.condition.polarity==='negative' || (r.negative>=r.condition.start && r.negative<r.condition.end),
    }] : []).filter(part=>part.text.trim() && clause.includes(part.text.trim()));
    return parts.length>0 && parts.every(part=> !present(part.text,predicate) &&
      dependents.some(wire=>wire.type==='w.request.constraint' && one(wire,'phase')==='selector' &&
        part.negative===['no','not_all'].includes(one(wire,'want')) &&
        [one(wire,'value'),one(wire,'words')].some(value=>present(part.text,value))));

  }
  return {
    preventsSplitting, restricted,
    windows:regions.filter(region=>region.limit>region.start)
      .map(({start,limit,intent,reading})=>[reading?.actionStart ?? start,limit,intent,reading?.type ?? '']),
    intentHits:regions.flatMap(({reading,intent})=>{
      const head=intent==='removal' ? reading.lead : reading?.head;
      if (!head?.length) return [];
      const act=intent==='removal' ? 'remove' : 'ask';
      const mood=intent==='removal' ? 'do' : reading.type ? 'ask' : 'check';
      return [[head[0][2],head.at(-1)[3],['act',act,mood,0],0]];
    }),
    permits(wires) {
      if (!restricted) return true;
      for (const req of wires.filter(wire=>wire.type==='w.request.request')) {
        const act=one(req,'act'), mood=one(req,'mood');
        if (act==='ask' || ['ask','check','propose'].includes(mood)) continue;
        const predicate=one(req,'predicate'), clause=one(req,'words') ?? text;
        const eligible=regions.filter(r=>present(clause,regionText(r.start,r.end).trim()) ||
          regionText(r.start,r.end).includes(clause));
        const scoped=eligible.length ? eligible : regions;
        const active=scoped.filter(r=>(['action','proposal'].includes(r.intent) || (r.intent==='removal' && act==='remove')) &&
          (!predicate || present(regionText(r.start,r.limit),predicate)));
        const dependents=wires.filter(wire=>wire.attrs.request?.[0]==='$'+req.id);
        if (!active.length) {
          if (!scoped.some(r=>r.intent==='guarded') ||
              (!directlyTypedNegation(dependents,clause) &&
               !directlyTypedCondition(dependents,predicate,clause))) return false;
          continue;
        }
        for (const wire of dependents) {
          if (['no','not_all'].includes(one(wire,'want'))) continue;
          const fields=wire.type==='w.request.target'
            ? ['sort_words','name','description','family_words','sort']
            : wire.type==='w.request.constraint' ? ['value','key_words'] : [];
          for (const value of fields.flatMap(key=>(wire.attrs[key] ?? []).map(decode))) {
            if (negativeZones.some(zone=>present(zone,value)) &&
                !active.some(r=>present(regionText(r.start,r.limit),value))) return false;
          }
        }
      }
      return true;
    },
  };
}
