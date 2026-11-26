import { consumeUnread } from './nominal-evidence.mjs';
import { tokens } from './lexicon.mjs';
import { directHead, nominalSelectors, nominalSelectorLines } from './nominal-selectors.mjs';
import { parse } from './schema.mjs';
import { serialize } from './knowledge.mjs';

const value=(wire,key)=>{
  const raw=wire.attrs[key]?.[0];
  return raw?.startsWith('"') ? JSON.parse(raw) : raw;
};
const keyOf=items=>items.map(([key])=>key).join(' ');
const quotation=JSON.stringify;
const nominal=/^[\p{L}\p{M}\p{N}_]+$/u;

function closedNominalRegion(ts,worlds,phrase,start,end) {
  return ts.slice(start,end).every(([term],i)=>nominal.test(term) && !worlds.negatives.has(term) &&
    !worlds.joiners[term] && !Array.from({length:Math.min(5,end-start-i)},(_unused,n)=>phrase(start+i,start+i+n+1))
      .some(surface=>worlds.scopeGrammar.conditionals.has(surface) || worlds.scopeGrammar.negatives.has(surface)));
}

function matchingContainers(worlds,ts,phrase,start,end) {
  if (!['definite','demonstrative','possessive'].includes(worlds.determiners[ts[start]?.[0]])) return [];
  return worlds.sourceContainers.aliases.filter(({label})=>phrase(start+1,end)===label);
}

function countScope(form,ts,worlds,phrase,start,end) {
  if (start===end) return {neutral:false,containers:[]};
  const suffix=phrase(start,end);
  if (form.neutralTails.has(suffix)) return {neutral:true,containers:[]};
  if (form.scopedTails.has(suffix)) return {neutral:false,containers:[]};
  for (const marker of form.scopes) {
    const at=start+marker.split(' ').length;
    if (at>=end || phrase(start,at)!==marker) continue;
    const containers=form.membership.has(marker) ? matchingContainers(worlds,ts,phrase,at,end) : [];
    return {neutral:false,containers};
  }
}

function nominalSetTargets(ts,worlds,hits,phrase,span,start,end) {
  const native=surface=>(worlds.ownerInventory?.get(JSON.stringify(['change',surface])) ?? [])
    .map(({family,sort})=>['target','change',family,'existing',sort]);
  const noun=phrase(start,end);
  const matching=hits.filter(([a,b])=>a===ts[start][2] && b===ts[end-1][3]).map(([, ,hit])=>hit);
  const plural=worlds.nominalInflection(noun,lemma=>[...worlds.lookup(lemma),...native(lemma)]);
  const words=span(start,end);
  const targets=[...matching,...native(noun),...plural].flatMap(([role,act,family,mode,sort])=>
    role==='target' && mode==='existing' && ['ask','pick','change','place'].includes(act) ?
      [{family,sort,words}] : []);
  for (const binding of worlds.nominalSelectorRules) {
    const resolveHead=surface=>{
      const direct=directHead(surface,binding);
      if (direct?.size) return direct;
      const inflected=worlds.nominalInflection(surface,lemma=>[...(directHead(lemma,binding) ?? [])]
        .map(sort=>['target','ask',binding.family,'existing',sort]));
      return new Set(inflected.map(entry=>entry[4]));
    };
    for (const {sort,sortWords,selector} of nominalSelectors([binding],start,end,phrase,span,resolveHead)) {
      targets.push({family:binding.family,sort,words:sortWords,selector});
    }
  }
  return targets;
}

export function* prefixSetQuestions(text,ts,worlds,hits,quotes) {
  const forms=worlds.scopeGrammar.setCounts;
  if (!forms?.size || quotes.length || ts.length<3 || ts.length>45) return;
  const phrase=(a,b)=>keyOf(ts.slice(a,b));
  const chars=Array.from(text);
  const span=(a,b)=>chars.slice(ts[a][2],ts[b-1][3]).join('');
  const end=ts.length-Number(['.','!','?'].includes(ts.at(-1)?.[0]));
  for (let head=Math.min(12,end-1);head>0;head--) {
    const form=forms.get(phrase(0,head));
    if (!form) continue;
    const at=ts.findIndex(([term],index)=>index>=head && index<end && term===',');
    const stop=at<0 ? end : at;
    if (at>=0 && !form.closers.has(phrase(at+1,end))) return;
    const start=head+Number(worlds.determiners[ts[head]?.[0]]==='definite');
    if (start>=stop || !closedNominalRegion(ts,worlds,phrase,start,stop)) return;
    for (let nounEnd=stop;nounEnd>start;nounEnd--) {
      const scope=countScope(form,ts,worlds,phrase,nounEnd,stop);
      if (!scope) continue;
      const targets=nominalSetTargets(ts,worlds,hits,phrase,span,start,nounEnd);
      if (form.genericNouns.has(phrase(start,nounEnd))) {
        for (const {population,affected} of scope.containers) {
          if (affected.includes(population)) targets.unshift({family:population,words:span(start,nounEnd)});
        }
      }
      const options=new Map(targets.filter(({family})=>worlds.literalGrammar.licenses(family,'ask'))
        .map(option=>[JSON.stringify(option),option]));
      if (!options.size) continue;
      for (const {family,sort,words,selector} of options.values()) {
        const described=scope.containers.some(({affected})=>affected.includes(family));
        const unread=nounEnd<stop && !scope.neutral && !described;
        const predicate=span(0,scope.neutral ? stop : head);
        yield {source:'prefix-set-query',status:unread?'partial':'matched',sop:[
          '@r1 w.request.request act=ask mood=ask question=count predicate='+quotation(predicate)+' words='+quotation(text),
          '@r1.t w.request.target request=$r1 family='+quotation(family)+' mode=existing fill=all quantifier=all'+
            (sort ? ' sort='+quotation(sort)+' sort_words='+quotation(words) : ' family_words='+quotation(words))+
            (described ? ' description='+quotation(span(start,stop)) : ''),
          ...nominalSelectorLines(selector),
          ...(unread ? ['@r1.u w.request.unread request=$r1 text='+quotation(span(nounEnd,stop))+' note="unresolved counting scope"'] : []),
          ...(at>=0 ? ['@f1 w.request.filler text='+quotation(span(at+1,end))] : []),
        ].join('\n')};
      }
      return;
    }
    return;
  }
}

function* collectionArguments(form,ts,worlds,phrase,head,end) {
  if (form.layout==='nominal') yield {nounStart:head,nounEnd:end};
  for (let split=head;split<end;split++) {
    for (const marker of form.markers) {
      const after=split+marker.split(' ').length;
      if (after>=end || phrase(split,after)!==marker) continue;
      if (form.layout==='container_first') {
        const containers=matchingContainers(worlds,ts,phrase,head,split);
        if (containers.length) yield {nounStart:after,nounEnd:end,containers};
        continue;
      }
      if ((form.layout==='population') !== (split===head)) continue;
      for (let anchorEnd=end;anchorEnd>after;anchorEnd--) {
        if (anchorEnd!==end && !form.anchorTails.has(phrase(anchorEnd,end))) continue;
        const containers=matchingContainers(worlds,ts,phrase,after,anchorEnd);
        if (containers.length) yield {nounStart:head,nounEnd:split,containers};
      }
    }
  }
}

export function* collectionQuestions(text,ts,worlds,hits,quotes) {
  const forms=worlds.scopeGrammar.collectionQuestions;
  if (!forms?.size || quotes.length || ts.length<3 || ts.length>45) return;
  const end=ts.length-Number(['.','!','?'].includes(ts.at(-1)?.[0]));
  const phrase=(a,b)=>keyOf(ts.slice(a,b));
  const chars=Array.from(text);
  const span=(a,b)=>chars.slice(ts[a][2],ts[b-1][3]).join('');
  for (let head=Math.min(12,end-1);head>0;head--) {
    const form=forms.get(phrase(0,head));
    if (!form || (form.requireQuestionMark && ts.at(-1)?.[0]!=='?')) continue;
    if (!closedNominalRegion(ts,worlds,phrase,head,end)) return;
    const emitted=new Set();
    for (const {nounStart,nounEnd,containers} of collectionArguments(form,ts,worlds,phrase,head,end)) {
      const lead=ts[nounStart][0];
      const declared=worlds.determiners[lead];
      if (form.question==='list' && declared==='indefinite') continue;
      const determiner=form.existentialDeterminers.has(lead) ? 'quantified' :
        ['indefinite','definite'].includes(declared) ? declared : undefined;
      const start=nounStart+Number(Boolean(determiner));
      const options=form.layout==='population' ?
        containers.filter(({population,affected})=>affected.includes(population)).map(({population})=>({family:population})) :
        start<nounEnd ? nominalSetTargets(ts,worlds,hits,phrase,span,start,nounEnd) : [];
      for (const {family,sort,words,selector} of options) {
        if (!worlds.literalGrammar.licenses(family,'ask') ||
            (containers && !containers.some(({affected})=>affected.includes(family)))) continue;
        const sop=[
          '@r1 w.request.request act=ask mood=ask question='+form.question+' predicate='+quotation(span(0,head))+' words='+quotation(text),
          '@r1.t w.request.target request=$r1 family='+quotation(family)+' mode=existing'+
            (form.question==='exists' ? ' fill=description' : ' fill=all quantifier=all')+
            (words ? (sort ? ' sort='+quotation(sort)+' sort_words=' : ' family_words=')+quotation(words) : '')+
            (words && determiner ? ' determiner='+determiner : '')+' description='+quotation(span(head,end)),
          ...nominalSelectorLines(selector),
        ].join('\n');
        if (emitted.has(sop)) continue;
        emitted.add(sop);
        yield {source:'collection-question',status:'matched',sop};
      }
    }
    return;
  }
}

export function* postfixSetQuestions(text, ts, worlds, hits, quotes) {
  if (quotes.length || ts.at(-1)?.[0]!=='?' || ts.length<3) return;
  const words=Array.from(text);
  for (let end=1;end<ts.length-1;end++) {
    const head=keyOf(ts.slice(end,-1));
    const question=worlds.scopeGrammar.questions.get(head);
    if (question?.type!=='count' || !worlds.lookup(head).some(([role,act])=>role==='act' && act==='ask')) continue;
    const start=worlds.determiners[ts[0][0]]==='definite' ? 1 : 0;
    if (start>=end || !ts.slice(start,end).every(([key])=>nominal.test(key))) continue;
    const left=ts[start][2], right=ts[end-1][3];
    const name=words.slice(left,right).join('');
    const predicate=words.slice(ts[end][2],ts.at(-2)[3]).join('');
    for (const [a,b,[role,act,family,mode,sort]] of hits) {
      if (a!==left || b!==right || role!=='target' || mode!=='existing' || !['ask','place','change'].includes(act)) continue;
      yield {source:'set-query',status:'partial',sop:[
        '@r1 w.request.request act=ask mood=ask question=count predicate='+quotation(predicate),
        '@r1.t w.request.target request=$r1 family='+quotation(family)+' mode=existing fill=all '+
          (sort ? 'sort='+quotation(sort)+' sort_words=' : 'family_words=')+quotation(name),
      ].join('\n')};
    }
  }
}

export function universalTargetReading(text, ts, worlds, candidate, quotes, requiresResult=false) {
  if (!worlds.scopeGrammar.universals.size) return;
  const wires=parse(candidate.sop);
  const requests=wires.filter(w=>w.type==='w.request.request');
  const targets=wires.filter(w=>w.type==='w.request.target');
  if (requests.length!==1 || targets.length!==1) return;
  const [request]=requests, [target]=targets;
  if (requiresResult && !wires.some(w=>w.type==='w.request.constraint' && value(w,'request')==='$'+request.id &&
      value(w,'phase')==='result' && w.attrs.attribute && w.attrs.value && !w.attrs.want)) return;
  if (value(target,'mode')!=='existing' || ['name','description','ids','thing','count','ordinal','quantity','quantifier','count_words']
      .some(key=>target.attrs[key])) return;
  const head=value(target,'sort_words') ?? value(target,'family_words') ?? value(target,'sort');
  if (!head) return;
  const headKey=keyOf(tokens(head));
  const length=tokens(head).length;
  const starts=ts.flatMap((_,i)=>keyOf(ts.slice(i,i+length))===headKey ? [i] : []);
  if (starts.length!==1) return;
  const [index]=starts;
  for (const form of worlds.scopeGrammar.universals) {
    const before=form.split(' ').length;
    const preceding=ts[index-1]?.[0];
    const numeric=worlds.nominalNumbers.get(preceding) ??
      (/^\d{1,8}$/u.test(preceding ?? '') ? {kind:'cardinal',value:preceding} : undefined);
    const counted=numeric?.kind==='cardinal' && worlds.scopeGrammar.countedUniversals.has(form);
    const end=counted ? index-1 : index;
    const start=end-before;
    if (start<0 || keyOf(ts.slice(start,end))!==form || worlds.negatives.has(ts[start-1]?.[0])) continue;
    const from=ts[start][2], to=ts[index+length-1][3];
    if (quotes.some(q=>q.start<to && q.end>from)) continue;
    const chars=Array.from(text);
    const surface=chars.slice(from,to).join('');
    const clause=value(request,'words');
    if (clause && !clause.includes(surface)) continue;
    // The quantifier supplies target scope. A competing property selector
    // grounded only in that same occurrence must not restrict the selected set.
    const scoped=wires.filter(w=>{
      if (w.type!=='w.request.constraint' || w.attrs.key_words || value(w,'phase')!=='selector') return true;
      const evidence=value(w,'words') ?? value(w,'value');
      if (!evidence) return true;
      const terms=tokens(evidence).map(t=>t[0]);
      const positions=ts.flatMap((_,i)=>terms.every((key,j)=>ts[i+j]?.[0]===key) ? [i] : []);
      return positions.length!==1 || positions[0]<start || positions[0]+terms.length>index;
    });
    const revised=consumeUnread(scoped,text,chars.slice(0,from).join('').length,chars.slice(0,ts[index][2]).join('').length);
    target.attrs={...target.attrs,fill:['all'],quantifier:['all'],count_words:[quotation(surface)],...(counted ? {count:[String(numeric.value)]} : {})};
    delete target.attrs.determiner;
    return {sop:serialize(revised).trimEnd(),source:'universal-target',status:candidate.status};
  }
}
