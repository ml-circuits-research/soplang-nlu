import {parse,serialize,str} from './knowledge.mjs';
import {evidenceReport,literalRanges} from './evidence.mjs';
import {composeParts} from './composition.mjs';
import {consumeUnread} from './nominal-evidence.mjs';
import {tokens} from './lexicon.mjs';
import {quotedSpans} from './literal-roles.mjs';

const type=name=>'w.request.'+name;
const quote=JSON.stringify;
const word=/^[\p{L}\p{M}\p{N}_]+$/u;
const terminal=new Set(['.','!']);
const values=(wire,key)=>(wire.attrs[key] ?? []).map(str);
const terms=text=>tokens(text).map(([term])=>term);
const matches=(input,at,words)=>words.every((term,i)=>input[at+i]===term);
const one=(wire,key)=>str(wire.attrs[key]?.[0]);
const separators=new Set([',','—','–']);

export function compileStandingPositions(facts,catalog) {
  return facts('pro.reader.standing_position').flatMap(wire=>{
    const [scopeKey]=values(wire,'scope_attribute');
    if (!catalog.some(key=>key.name===scopeKey && key.family==='preference' &&
      key.head==='span' && !key.values.length)) return [];
    const scopes=values(wire,'scope').map(terms).filter(words=>words.length);
    const trailingScopes=values(wire,'trailing_scope').map(terms).filter(words=>words.length);
    const wrappers=[[],...values(wire,'wrapper').map(terms)];
    const predicates=values(wire,'predicate').map(terms).filter(words=>words.length);
    const bodyLeads=[[],...values(wire,'body_lead').map(terms)];
    const exclusions=values(wire,'exclusion').map(terms).filter(words=>words.length);
    return [{scopeKey,scopes,trailingScopes,wrappers,predicates,bodyLeads,exclusions}];
  });
}

export function standingClosings(facts) {
  return facts('w.lang.en.cue').filter(wire=>one(wire,'on')==='reaction' && one(wire,'value')==='thanks')
    .flatMap(wire=>values(wire,'lead').map(terms)).filter(words=>words.length);
}

function trailingStandingPlan(text,worlds) {
  const ts=tokens(text), chars=Array.from(text), input=ts.map(([term])=>term);
  if (!input.some(term=>separators.has(term)) || input.includes('?') || quotedSpans(text).length) return;
  const stop=input.length-Number(terminal.has(input.at(-1)));
  const span=(a,b)=>chars.slice(ts[a][2],ts[b-1][3]).join('');
  const conditional=[...worlds.scopeGrammar.conditionals.keys()].some(form=>
    input.some((_,i)=>matches(input,i,form.split(' '))));
  if (conditional) return;
  const plans=[];
  for (const frame of worlds.standingPositions) for (const scope of frame.trailingScopes) {
    for (let at=3;at<stop;at++) {
      const end=at+scope.length;
      if (!separators.has(input[at-1]) || !matches(input,at,scope) || end<stop && !separators.has(input[end]) ||
          !frame.predicates.some(verb=>input.some((_,i)=>i>0 && i+verb.length<at-1 && matches(input,i,verb)))) continue;
      let start=end+1;
      const coordinated=worlds.joiners[input[start]]==='coordination';
      if (coordinated) start++;
      let finish=stop;
      for (let i=start+1;i<stop-1;i++) {
        if (!['—','–'].includes(input[i])) continue;
        const first=i+1+Number(worlds.joiners[input[i+1]]==='coordination');
        if (worlds.standingClosings.some(lead=>{
          if (!matches(input,first,lead)) return false;
          const rest=input.slice(first+lead.length,stop);
          return !rest.length || worlds.requestIntents.intents.some(({cue,form,role,want})=>
            form==='nominal' && role==='purpose' && want==='yes' && matches(rest,0,cue) &&
            Object.hasOwn(worlds.determiners,rest[cue.length]) && rest.length>cue.length+1 &&
            rest.slice(cue.length+1).every(term=>word.test(term) && !worlds.joiners[term] && !worlds.negatives.has(term) &&
              !worlds.scopeGrammar.modals.has(term) && !worlds.lookup(term).some(([role])=>role==='act')));
        })) {finish=i;break;}
      }
      plans.push({frame,body:span(0,at-1),head:span(0,end),scope:span(at,end),
        following:coordinated && start<finish ? span(start,finish) : undefined,
        closing:finish<stop ? span(finish+1,stop) : undefined,
        remainder:end<stop ? span(end+1,stop) : undefined,
        tail:coordinated && start<finish ? span(start,stop) : undefined});
    }
  }
  return plans.length===1 ? plans[0] : undefined;
}

function scopedPosition(plan,candidate,worlds) {
  let wires=parse(candidate.sop);
  const requests=wires.filter(w=>w.type===type('request')), targets=wires.filter(w=>w.type===type('target'));
  if (requests.length!==1 || targets.length!==1) return;
  const [request]=requests,[target]=targets, owner='$'+request.id, family=one(target,'family');
  const predicate=one(request,'predicate');
  if (!['change','place'].includes(one(request,'act')) || one(request,'mood')!=='do' ||
      one(target,'mode')!=='existing' || one(target,'request')!==owner ||
      !predicate || !plan.frame.predicates.some(words=>words.join(' ')===terms(predicate).join(' '))) return;
  const hits=literalRanges(plan.body,predicate);
  if (hits.length!==1) return;
  const [[before,after]]=hits;
  const subject=plan.body.slice(0,before).trimEnd(), nominal=terms(subject);
  const targetWords=one(target,'description') ?? one(target,'sort_words') ?? one(target,'sort') ?? one(target,'family_words');
  if (!targetWords || !literalRanges(subject,targetWords).length ||
      !['definite','demonstrative','possessive'].includes(worlds.determiners[nominal[0]]) ||
      nominal.some(term=>!word.test(term) || worlds.joiners[term] || worlds.negatives.has(term))) return;
  const effects=wires.filter(w=>w.type===type('constraint') && one(w,'request')===owner);
  if (effects.some(w=>one(w,'attribute')===plan.frame.scopeKey || one(w,'want')==='no')) return;
  const position=terms(plan.body.slice(after)).join(' ');
  const licensed=new Set();
  for (const bind of worlds.spatialBindings.filter(b=>b.family===family)) {
    for (const effect of effects) {
      const words=one(effect,'words') ?? one(effect,'value');
      if (one(effect,'attribute')===bind.regionKey && words && terms(words).join(' ')===position &&
          one(effect,'operator')==='region') licensed.add(effect);
      if (one(effect,'attribute')===bind.relationKey && one(effect,'operator')==='relation' &&
          words && effects.some(anchor=>one(anchor,'attribute')===bind.anchorKey && one(anchor,'phase')==='selector' &&
            one(anchor,'value') && terms(words+' '+one(anchor,'value')).join(' ')===position)) licensed.add(effect);
    }
  }
  if (licensed.size!==1) return;
  const [effect]=licensed;
  effect.attrs.phase=['result'];
  target.attrs.fill=['description'];
  target.attrs.description=[quote(subject)];
  wires=consumeUnread(wires,plan.body,0,before,w=>one(w,'request')===owner);
  const coverage=evidenceReport(plan.body,wires,worlds.evidenceVocabulary);
  if (wires.some(w=>w.type===type('unread')) || coverage.missing.length || coverage.counts.uncovered) return;
  request.attrs.words=[quote(plan.head)];
  let id='scope';
  while (wires.some(w=>w.id===id)) id+='_';
  wires.push({id,type:type('constraint'),attrs:{request:[owner],on:['attribute'],attribute:[plan.frame.scopeKey],
    value:[quote(plan.scope)],operator:['eq'],phase:['result']}});
  return {wires,request};
}

export async function trailingStandingReadings(text,worlds,read,permit,admissible) {
  const plan=trailingStandingPlan(text,worlds);
  if (!plan || !permit(plan.body,[])) return [];
  const heads=(await read(plan.body)).flatMap(candidate=>{
    const scoped=scopedPosition(plan,candidate,worlds);
    return scoped ? [scoped] : [];
  });
  if (!heads.length) return [];
  const continuations=plan.following && permit(plan.following,[]) ? (await read(plan.following)).flatMap(candidate=>{
    const wires=parse(candidate.sop), requests=wires.filter(w=>w.type===type('request'));
    if (requests.length!==1 || !wires.some(w=>w.type===type('target')) ||
        wires.some(w=>w.type===type('unread')) || evidenceReport(plan.following,wires,worlds.evidenceVocabulary).counts.uncovered) return [];
    if (plan.closing) {
      requests[0].attrs.words=[quote(plan.tail)];
      let id='closing';
      while (wires.some(w=>w.id===id)) id+='_';
      wires.push({id,type:type('unread'),attrs:{request:['$'+requests[0].id],text:[quote(plan.closing)],note:[quote('closing remark')]}});
    }
    return [{...candidate,sop:serialize(wires)}];
  }) : [];
  const output=[];
  for (const {wires,request} of heads.slice(0,8)) {
    const first={sop:serialize(wires),source:'standing-position'};
    for (const next of continuations.slice(0,8)) {
      const sop=composeParts([plan.head,plan.following],[first,next]);
      if (sop && admissible(text,sop)) output.push({sop,source:'trailing-standing-position',status:plan.closing ? 'partial' : 'matched'});
    }
    if (plan.remainder) {
      request.attrs.words=[quote(text.trim())];
      let id='following';
      while (wires.some(w=>w.id===id)) id+='_';
      wires.push({id,type:type('unread'),attrs:{request:['$'+request.id],text:[quote(plan.remainder)]}});
    }
    const sop=serialize(wires);
    if (admissible(text,sop)) output.push({sop,source:'trailing-standing-position',status:plan.remainder ? 'partial' : 'matched'});
  }
  return output;
}

function owners(input,from,to,worlds) {
  const nominal=input.slice(from,to), [article]=nominal;
  const determiner=Object.hasOwn(worlds.determiners,article) && worlds.determiners[article];
  if (!['definite','demonstrative','possessive'].includes(determiner) || nominal.length<2 ||
      nominal.some(term=>!word.test(term) || worlds.joiners[term] || worlds.negatives.has(term))) return [];
  const families=new Set();
  for (let head=1;head<nominal.length;head++) {
    const surface=nominal.slice(head).join(' ');
    for (const [role,,family] of worlds.lookup(surface)) {
      if (role==='target' && worlds.literalGrammar.licenses(family,'change')) families.add(family);
    }
  }
  return [...families].map(family=>({family,determiner}));
}

function regions(input,at,end,worlds,family) {
  return (worlds.nominalPositions.get(family)?.get(input[at]) ?? []).filter(([surface,attribute,, ,operator])=>
    operator==='region' && at+surface.length===end && matches(input,at,surface) &&
    worlds.requestKeys.some(key=>key.name===attribute && key.family===family));
}

function* standingHeads(input,stop,frames) {
  for (const frame of frames) for (const scope of frame.scopes) {
    if (!matches(input,0,scope)) continue;
    for (const wrapper of frame.wrappers) {
      const boundary=scope.length+wrapper.length;
      if (!matches(input,scope.length,wrapper) || ![',',':','—','–'].includes(input[boundary])) continue;
      for (const lead of frame.bodyLeads) {
        const first=boundary+1+lead.length;
        if (!matches(input,boundary+1,lead)) continue;
        for (let head=first+2;head<Math.min(first+9,stop-1);head++) for (const predicate of frame.predicates) {
          if (matches(input,head,predicate)) yield {frame,scope,wrapper,boundary,first,head,at:head+predicate.length};
        }
      }
    }
  }
}

function regionConstraints(input,at,stop,worlds,family,frame,span) {
  const comma=input.indexOf(',',at), end=comma<0 ? stop : comma;
  const placement=regions(input,at,end,worlds,family);
  if (placement.length!==1) return;
  const [,attribute,value]=placement[0];
  const records=[{id:'placement',type:type('constraint'),attrs:{request:['$r'],on:['attribute'],
    attribute:[attribute],value:[value],operator:['region'],phase:['result'],words:[quote(span(at,end))]}}];
  let pending=end+(comma>=0 ? 1 : 0);
  if (pending<stop) {
    const cue=frame.exclusions.find(words=>matches(input,pending,words));
    const next=input.indexOf(',',pending), denialEnd=next<0 ? stop : next;
    const excluded=cue ? regions(input,pending+cue.length,denialEnd,worlds,family) : [];
    if (excluded.length!==1 || excluded[0][1]!==attribute || excluded[0][2]===value) return;
    records.push({id:'excluded',type:type('constraint'),attrs:{...records[0].attrs,
      value:[excluded[0][2]],want:['no'],words:[quote(span(pending,denialEnd))]}});
    pending=next<0 ? stop : next+1;
  }
  return {records,pending};
}

export function standingPositionReadings(text,worlds) {
  const ts=tokens(text), input=ts.map(([term])=>term), chars=Array.from(text);
  if (input.length<6 || input.includes('?') || quotedSpans(text).length) return [];
  const span=(start,end)=>chars.slice(ts[start][2],ts[end-1][3]).join('');
  const stop=input.length-Number(terminal.has(input.at(-1)));
  const readings=[];
  for (const {frame,scope,wrapper,boundary,first,head,at} of standingHeads(input,stop,worlds.standingPositions)) {
    if ([...worlds.scopeGrammar.conditionals.keys()].some(form=>{
      const words=form.split(' ');
      return input.some((_,i)=>i>=first && matches(input,i,words));
    })) continue;
    for (const {family,determiner} of owners(input,first,head,worlds)) {
      const position=regionConstraints(input,at,stop,worlds,family,frame,span);
      if (!position) continue;
      const {records,pending}=position;
      const wires=[{id:'r',type:type('request'),attrs:{act:['change'],mood:['do'],
        predicate:[quote(span(head,at))],words:[quote(text)]}},
      {id:'t',type:type('target'),attrs:{request:['$r'],family:[family],mode:['existing'],fill:['description'],
        determiner:[determiner],description:[quote(span(first,head))]}},
      {id:'l',type:type('lookup'),attrs:{request:['$r'],target:['$t'],key:['thing'],from:['page']}},
      {id:'scope',type:type('constraint'),attrs:{request:['$r'],on:['attribute'],attribute:[frame.scopeKey],
        value:[quote(span(0,scope.length))],operator:['eq'],phase:['result']}},...records];
      if (wrapper.length) wires.push({id:'wrapper',type:type('filler'),attrs:{text:[quote(span(scope.length,boundary))]}});
      if (pending<stop) wires.push({id:'u',type:type('unread'),attrs:{request:['$r'],text:[quote(span(pending,stop))]}});
      readings.push({sop:serialize(wires),source:'standing-position',status:pending<stop ? 'partial' : 'matched'});
    }
  }
  return readings;
}
