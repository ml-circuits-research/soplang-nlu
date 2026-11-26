import { tokens } from './lexicon.mjs';
import { quotedSpans } from './literal-roles.mjs';
import { literalRanges } from './evidence.mjs';
import { evidenceInText } from './grounding.mjs';
import { parse, serialize } from './knowledge.mjs';
import { directionalResultCandidates, motionSelector, writtenMotionTargets } from './directional-result.mjs';
import { requestScope } from './request-scope.mjs';

const quote=JSON.stringify;
const decode=value=>value?.startsWith('"') ? JSON.parse(value) : value;
const fields=(wire,key)=>(wire.attrs[key] ?? []).map(decode);
const one=(wire,key)=>fields(wire,key)[0];
const keyOf=text=>tokens(text).map(([key])=>key).join(' ');
const word=/^[\p{L}\p{M}\p{N}_]+$/u;
const atom=/^[\p{L}_][\p{L}\p{M}\p{N}_.-]*$/u;
const boundary=new Set([',',';','—','–']);
const request='w.request.request';
const target='w.request.target';
const filler='w.request.filler';
const unread='w.request.unread';

export function compilePreservationAdjuncts(facts,requestKeys) {
  const cues=new Map(facts('w.lang.en.cue').filter(wire=>one(wire,'on')==='reaction' &&
    one(wire,'value')==='keep').map(wire=>[one(wire,'name'),new Set(fields(wire,'lead').map(keyOf))]));
  const frames=[];
  for (const wire of facts('pro.reader.retention')) {
    const native=cues.get(one(wire,'cue')), value=one(wire,'value');
    if (!native || !atom.test(value ?? '')) continue;
    const leads=new Set(fields(wire,'lead').map(keyOf).filter(form=>native.has(form)));
    if (leads.size) for (const form of fields(wire,'adjunct').map(keyOf).filter(Boolean)) leads.add(form);
    const subjectPredicates=new Set(fields(wire,'subject_predicate').map(keyOf).filter(Boolean));
    const tails=new Set(fields(wire,'tail').map(keyOf).filter(Boolean));
    const scopeLeads=new Set(fields(wire,'scope_lead').map(keyOf).filter(Boolean));
    const scopeKey=one(wire,'scope_attribute');
    if (!leads.size && !subjectPredicates.size || !tails.size && !(scopeLeads.size && scopeKey)) continue;
    const keys=new Map();
    for (const binding of facts('pro.reader.preservation')) {
      const family=one(binding,'family'), name=one(binding,'attribute');
      if (!requestKeys.some(key=>key.family===family && key.name===name &&
        key.head==='class' && key.values.includes(value) && (!scopeKey || requestKeys.some(scope=>
          scope.name===scopeKey && scope.head==='span' && !scope.values.length)))) continue;
      const options=keys.get(family) ?? new Set();
      options.add(name);
      keys.set(family,options);
    }
    frames.push({value,leads,tails,keys,scopeLeads,scopeKey,subjectPredicates,pause:new Set(fields(wire,'pause').map(keyOf)),
      reinforcement:new Set(fields(wire,'reinforcement').map(keyOf)),ambient:new Set(fields(wire,'ambient_family')),
      remainder:new Set(fields(wire,'remainder').map(keyOf))});
  }
  return frames;
}

export function namedRetentionReadings(text,worlds) {
  const ts=tokens(text), chars=Array.from(text);
  if (ts.length<4 || ts.some(([term])=>term==='?') || quotedSpans(text).length) return [];
  const stop=ts.length-Number(['.','!'].includes(ts.at(-1)[0]));
  const phrase=(a,b)=>ts.slice(a,b).map(([key])=>key).join(' ');
  const span=(a,b)=>chars.slice(ts[a][2],ts[b-1][3]).join('');
  if (!['definite','demonstrative','possessive'].includes(worlds.determiners[ts[0][0]])) return [];
  const readings=[];
  for (const frame of worlds.preservationAdjuncts) for (let head=2;head<Math.min(stop-1,10);head++) {
    if (frame.remainder.has(phrase(0,head))) continue;
    for (let after=head+1;after<stop;after++) {
      if (!frame.subjectPredicates.has(phrase(head,after)) || !frame.tails.has(phrase(after,stop))) continue;
      for (const binding of worlds.directionalResults.bindings) {
        const keys=frame.keys.get(binding.family);
        if (keys?.size!==1 || !worlds.literalGrammar.licenses(binding.family,'change')) continue;
        const [key]=keys;
        for (const {target,selector} of writtenMotionTargets(worlds,binding,0,head,phrase,span)) {
          const sop=[
            '@r1 w.request.request act=change mood=do predicate='+quote(span(head,after))+' words='+quote(text),
            '@r1.t w.request.target request=$r1 family='+quote(binding.family)+' mode=existing'+target,
            '@r1.l w.request.lookup request=$r1 target=$r1.t key=thing from=page',
            ...motionSelector(selector),
            '@r1.keep w.request.constraint request=$r1 on=attribute attribute='+quote(key)+
              ' value='+frame.value+' words='+quote(span(0,stop))+' operator=eq phase=result',
          ].join('\n');
          readings.push({sop,source:'written-retention',status:'matched'});
        }
      }
    }
  }
  return readings;
}

export function retentionCorrectionReadings(text,worlds) {
  if (quotedSpans(text).length || text.includes('?')) return [];
  const parts=text.split(/[,;—–]/u).map(part=>part.trim());
  const rejection=parts.length>2 && worlds.scopeGrammar.rejections.has(keyOf(parts[0])) ? parts.shift() : undefined;
  if (parts.length<2 || parts.length>3 || parts.some(part=>!part)) return [];
  const first=parts[0], last=parts.at(-1);
  const pause=parts.length===3 ? parts[1] : undefined;
  const pauseSpans=pause ? literalRanges(text,pause) : [];
  if (pause && (pauseSpans.length!==1 || !worlds.preservationAdjuncts.some(frame=>frame.pause.has(keyOf(pause))))) return [];
  const negative=directionalResultCandidates(last,tokens(last),[],worlds)
    .filter(reading=>reading.source==='directional-prohibition');
  if (!negative.length) return [];
  const firstScope=requestScope(first,first,worlds,[]), lastScope=requestScope(last,last,worlds,[]);
  if (firstScope.restricted || !lastScope.restricted) return [];
  const result=[];
  for (const keeper of namedRetentionReadings(first,worlds)) {
    const keep=parse(keeper.sop), kept=keep.find(wire=>wire.type===target);
    const sort=one(kept,'sort');
    if (one(kept,'fill')!=='description' || !sort || keyOf(one(kept,'sort_words') ?? sort)!==keyOf(sort)) continue;
    for (const ban of negative) {
      const forbidden=parse(ban.sop), t=forbidden.find(wire=>wire.type===target);
      const reference=one(t,'family_words');
      if (one(t,'family')!==one(kept,'family') || !reference ||
          worlds.sequenceObjectPronouns.get(keyOf(reference))!=='sg' || !lastScope.permits(forbidden)) continue;
      t.attrs.mode=['bound'];
      delete t.attrs.fill;
      const wires=[...keep.map(wire=>({id:'keep.'+wire.id,type:wire.type,attrs:Object.fromEntries(
        Object.entries(wire.attrs).map(([key,items])=>[key,items.map(item=>item.startsWith('$') ? '$keep.'+item.slice(1) : item)]))})),
        ...forbidden.filter(wire=>wire.type!=='w.request.lookup')];
      if (rejection) wires.push({id:'correction',type:filler,attrs:{text:[quote(rejection)]}});
      if (pause) {
        wires.find(wire=>wire.id==='r1').attrs.words=[quote(text.slice(pauseSpans[0][0]).trimEnd())];
        wires.push({id:'pause',type:unread,attrs:{request:['$r1'],text:[quote(pause)],note:[quote('stated pause')]}});
      }
      result.push({sop:serialize(wires),source:'retention-correction',status:pause ? 'partial' : 'matched'});
    }
  }
  return result;
}

function* scopedRetentionMatches(ts,begin,stop,worlds,span,term,hidden) {
  if (worlds.joiners[ts[begin-1][0]]!=='coordination') return;
  const before=boundary.has(ts[begin-2][0]) ? begin-2 : begin-1;
  if (!before || !ts.slice(begin,stop).every(([key],i)=>word.test(key) && !hidden(begin+i))) return;
  const body=span(0,before), suffix=span(begin,stop);
  for (const frame of worlds.preservationAdjuncts.filter(frame=>frame.scopeKey)) {
    for (let head=begin+1;head<Math.min(begin+5,stop-2);head++) {
      if (!frame.leads.has(term(begin,head))) continue;
      for (let marker=head+1;marker<Math.min(head+5,stop-1);marker++) {
        if (worlds.sequenceObjectPronouns.get(term(head,marker))!=='sg') continue;
        for (let operand=marker+1;operand<stop;operand++) {
          if (!frame.scopeLeads.has(term(marker,operand)) || ts.slice(operand,stop).some(([key])=>
            worlds.joiners[key] || worlds.negatives.has(key) || worlds.scopeGrammar.conditionals.has(key))) continue;
          yield {body,suffix,predicate:span(begin,head),target:span(head,marker),value:frame.value,scope:'bound',
            scopeKey:frame.scopeKey,scopeWords:span(marker,stop),keys:frame.keys};
        }
      }
    }
  }
}

function* subjectRetentionMatches(ts,begin,stop,worlds,span,term,hidden) {
  const coordinated=worlds.joiners[ts[begin-1][0]]==='coordination';
  const split=coordinated && boundary.has(ts[begin-2][0]) ? begin-2 : begin-1;
  if (!split || !coordinated && !boundary.has(ts[split][0]) || ts.slice(begin,stop).some((_,i)=>hidden(begin+i))) return;
  const extra=ts.findIndex(([key],i)=>i>begin && i<stop && key===',');
  const end=extra<0 ? stop : extra;
  for (const frame of worlds.preservationAdjuncts) {
    if (!frame.subjectPredicates.size || extra>=0 && !frame.reinforcement.has(term(extra+1,stop))) continue;
    for (let head=begin+1;head<end-1;head++) {
      if (!frame.remainder.has(term(begin,head))) continue;
      for (let after=head+1;after<end;after++) {
        if (!frame.subjectPredicates.has(term(head,after)) || !frame.tails.has(term(after,end))) continue;
        yield {body:span(0,split),suffix:span(begin,stop),predicate:span(head,after),target:span(begin,head),
          value:frame.value,scope:'remainder',keys:frame.keys,ambient:frame.ambient,retentionWords:span(begin,end),
          reinforcement:extra>=0 ? span(extra+1,stop) : undefined};
      }
    }
  }
}

export function preservationAdjunct(text,worlds) {
  if (!worlds.preservationAdjuncts?.length) return;
  const ts=tokens(text), chars=Array.from(text), quotes=quotedSpans(text);
  const span=(a,b)=>chars.slice(ts[a][2],ts[b-1][3]).join('');
  const term=(a,b)=>ts.slice(a,b).map(([key])=>key).join(' ');
  const hidden=i=>quotes.some(q=>q.start<ts[i][3] && ts[i][2]<q.end);
  let stop=ts.length;
  while (stop && ['.','!'].includes(ts[stop-1][0]) && !hidden(stop-1)) stop--;
  if (stop<5 || ts[stop-1][0]==='?') return;
  const matches=new Map();
  for (let begin=Math.max(2,stop-22);begin<stop-2;begin++) {
    if (hidden(begin-1) || hidden(begin)) continue;
    for (const matched of subjectRetentionMatches(ts,begin,stop,worlds,span,term,hidden)) {
      const {body,suffix,predicate,target,value}=matched;
      matches.set(JSON.stringify([body,suffix,predicate,target,value,'subject']),matched);
    }
    let first=begin, split=begin-1;
    if (worlds.joiners[ts[first][0]]==='contrast') first++;
    for (const matched of scopedRetentionMatches(ts,begin,stop,worlds,span,term,hidden)) {
      const {body,suffix,predicate,target,value,scopeKey,scopeWords}=matched;
      matches.set(JSON.stringify([body,suffix,predicate,target,value,scopeKey,scopeWords]),matched);
    }
    if (!boundary.has(ts[split][0])) {
      if (first===begin) continue;
      split=begin;
    }
    if (first>=stop-2 || split===0 || ts.slice(0,split).some(([key],i)=>key==='?' && !hidden(i))) continue;
    const condition=[...worlds.scopeGrammar.conditionals.keys()].some(form=>{
      const terms=form.split(' ');
      return ts.slice(0,split).some((_,start)=>start+terms.length<=split &&
        terms.every((key,i)=>ts[start+i][0]===key && !hidden(start+i)));
    });
    if (condition) continue;
    for (const frame of worlds.preservationAdjuncts) {
      for (let head=first+1;head<Math.min(first+5,stop-1);head++) {
        if (!frame.leads.has(term(first,head))) continue;
        for (let tail=head+1;tail<stop;tail++) {
          if (hidden(tail) || !frame.tails.has(term(tail,stop))) continue;
          const label=span(head,tail);
          const explicit=quotes.find(q=>q.start===ts[head][2] && q.end===ts[tail-1][3]);
          const scope=frame.remainder.has(term(head,tail)) && !explicit ? 'remainder' : 'named';
          const nominal=ts.slice(head,tail);
          const classified=nominal.every(([key,raw])=>word.test(key) &&
            (/^\p{Lu}/u.test(raw) || /\p{L}/u.test(raw) && /\p{N}/u.test(raw)) &&
            !worlds.evidenceVocabulary.grammar.has(key));
          if (scope==='named' && !explicit && (!classified || nominal.some((_,i)=>hidden(head+i)))) continue;
          const body=span(0,split), suffix=span(first,stop), predicate=span(first,head);
          const name=explicit?.value ?? label;
          if (scope==='named' && !/\p{L}/u.test(name)) continue;
          const signature=JSON.stringify([body,suffix,predicate,name,frame.value,scope]);
          matches.set(signature,{body,suffix,predicate,target:name,value:frame.value,scope,keys:frame.keys});
        }
      }
    }
  }
  return matches.size===1 ? [...matches.values()][0] : undefined;
}

export function preservationAdjunctReading(text,split,candidate,worlds) {
  if (!candidate?.sop) return;
  const bodyRanges=literalRanges(text,split.body), suffixRanges=literalRanges(text,split.suffix);
  if (bodyRanges.length!==1 || suffixRanges.length!==1) return;
  const [[start,stop]]=bodyRanges, [[suffixStart,suffixEnd]]=suffixRanges;
  if (stop>=suffixStart) return;
  const tailEnd=/^[\s.!]*$/u.test(text.slice(suffixEnd)) ? text.length : suffixEnd;
  const removed=new Set();
  const wires=[];
  for (const wire of parse(candidate.sop)) {
    if ([filler,unread].includes(wire.type)) {
      const written=one(wire,'text');
      const hits=literalRanges(text,written);
      if (hits.length===1) {
        const [[a,b]]=hits;
        if (suffixStart<=a && a<suffixEnd && b<=tailEnd) {
          removed.add('$'+wire.id);
          continue;
        }
        if (wire.type===unread && a>=start && a<stop && b>suffixStart && b<=tailEnd &&
            !wire.attrs.note && !wire.attrs.value && !wire.attrs.n) {
          wire.attrs.text=[quote(text.slice(a,stop))];
        }
      }
    }
    wires.push(wire);
  }
  if (removed.size && wires.some(wire=>Object.values(wire.attrs).flat().some(value=>removed.has(value)))) return;
  const requests=wires.filter(wire=>wire.type===request);
  const last=requests.at(-1);
  if (!last || ![undefined,'do'].includes(one(last,'mood'))) return;
  const localTargets=req=>wires.filter(wire=>wire.type===target && wire.attrs.request?.[0]==='$'+req.id);
  const isAmbient=(req,t)=>split.ambient?.has(one(t,'family')) && one(t,'mode')==='existing' &&
    one(req,'act')==='change' && wires.some(w=>w.type==='w.request.constraint' && one(w,'request')==='$'+req.id &&
      one(w,'phase')==='result' && worlds.requestKeys.some(key=>key.name===one(w,'attribute') && key.family===one(t,'family')));
  const objectRequests=requests.filter(req=>{
    const local=localTargets(req);
    return local.length!==1 || !isAmbient(req,local[0]);
  });
  const anchor=objectRequests.at(-1);
  if (!anchor) return;
  const targets=localTargets(anchor);
  if (targets.length!==1) return;
  const family=one(targets[0],'family'), keys=split.keys.get(family);
  if (keys?.size!==1 || !worlds.literalGrammar.licenses(family,one(anchor,'act')) ||
    !worlds.literalGrammar.licenses(family,'change')) return;
  if (split.scope==='remainder' && objectRequests.some(req=>{
    const local=localTargets(req);
    return local.length!==1 || one(local[0],'family')!==family;
  })) return;
  let cursor=start;
  for (const req of requests) {
    const words=one(req,'words');
    if (!words && requests.length===1) {
      req.attrs.words=[quote(split.body)];
      continue;
    }
    const hits=literalRanges(text,words);
    if (hits.length!==1) return;
    const [[a,b]]=hits;
    if (a<cursor || a>=stop) return;
    if (b>stop) {
      if (req!==last || b>tailEnd) return;
      req.attrs.words=[quote(text.slice(a,stop))];
    }
    cursor=Math.min(b,stop);
  }
  // Any inferred action, property or relation must still have its evidence
  // inside the original base clause after removing preservation bookkeeping.
  const body=serialize(wires);
  if (!evidenceInText(split.body,body,worlds)) return;
  const [key]=keys;
  if (split.scope==='bound') {
    const [owner]=targets;
    if (requests.length!==1 || one(owner,'mode')!=='existing' ||
        !['written','description'].includes(one(owner,'fill')) || (owner.attrs.ids?.length ?? 0)>1 ||
        owner.attrs.quantifier || owner.attrs.quantity || Number(one(owner,'count') ?? 1)!==1 ||
        !wires.some(w=>w.type==='w.request.constraint' && one(w,'request')==='$'+last.id &&
          one(w,'phase')==='result' && one(w,'want')!=='no' && one(w,'attribute')!==key)) return;
  }
  const usesPrior=split.scope==='bound';
  let id='preserve';
  while (wires.some(wire=>wire.id===id || wire.id.startsWith(id+'.'))) id+='_';
  const description=split.scope==='remainder' ? 'fill=description description=' : 'fill=written name=';
  // The open selector is resolved against the current page. It does not expand
  // the rest of the scene into new targets or assert a universal target.
  const suffix=[
    '@'+id+' '+request+' act=change mood=do predicate='+quote(split.predicate)+' words='+quote(split.suffix),
    '@'+id+'.t '+target+' request=$'+id+' family='+quote(family)+(usesPrior ?
      ' mode=bound family_words=' : ' mode=existing '+description)+quote(split.target),
    ...usesPrior ? [] : ['@'+id+'.l w.request.lookup request=$'+id+' target=$'+id+'.t key=thing from=page'],
    '@'+id+'.c w.request.constraint request=$'+id+' on=attribute attribute='+quote(key)+
      ' value='+split.value+' words='+quote(split.retentionWords ?? split.suffix)+' operator=eq phase=result',
    ...split.reinforcement ? ['@'+id+'.u '+unread+' request=$'+id+' text='+quote(split.reinforcement)+
      ' note='+quote('additional preservation requirement')] : [],
    ...usesPrior ? ['@'+id+'.scope w.request.constraint request=$'+id+' on=attribute attribute='+quote(split.scopeKey)+
      ' value='+quote(split.scopeWords)+' operator=eq phase=result'] : [],
  ].join('\n');
  return {sop:body+'\n'+suffix,
    source:'preservation-adjunct',status:split.reinforcement ? 'partial' :
      usesPrior ? (wires.some(w=>w.type===unread) ? 'partial' : 'matched') : candidate.status};
}
