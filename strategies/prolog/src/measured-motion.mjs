import {parse,serialize,str} from './knowledge.mjs';
import {tokens} from './lexicon.mjs';
import {quotedSpans} from './literal-roles.mjs';
import {resolvePropertyUnit} from './owner-property.mjs';
import {evidenceReport,literalRanges} from './evidence.mjs';
import {motionSelector,writtenMotionTargets} from './directional-result.mjs';

const field=(wire,key)=>str(wire.attrs[key]?.[0]);
const fields=(wire,key)=>(wire.attrs[key] ?? []).map(str);
const keys=text=>tokens(text).map(([key])=>key);
const form=text=>keys(text).join(' ');
const quote=JSON.stringify;
const type=role=>'w.request.'+role;
const positive=/^(?:\d+(?:\.\d+)?|\.\d+)$/u;

export function compileMeasuredMotion(facts,catalog) {
  const fractions=new Map(facts('w.lang.en.number').filter(w=>field(w,'kind')==='fraction' &&
    positive.test(field(w,'value') ?? '')).map(w=>[form(field(w,'text')),field(w,'value')]));
  return facts('pro.reader.measured_motion').flatMap(w=>{
    const [family,offsetKey,shiftKey,anchorKey,precisionKey]=
      ['family','offset_key','shift_key','anchor_key','precision_key'].map(k=>field(w,k));
    const bank=catalog.filter(k=>k.family===family);
    if (!bank.some(k=>k.name===offsetKey && k.head.split('+').includes('number')) ||
        shiftKey && !bank.some(k=>k.name===shiftKey && k.head.split('+').includes('number')) ||
        precisionKey && !bank.some(k=>k.name===precisionKey && ['approximate','exact'].every(v=>k.values.includes(v))) ||
        anchorKey && !bank.some(k=>k.name===anchorKey && k.head==='fill+span' && !k.values.length)) return [];
    const units=new Map();
    for (const spec of fields(w,'unit')) {
      const at=spec.indexOf('=');
      if (at>0) units.set(form(spec.slice(0,at)),spec.slice(at+1));
    }
    return [{family,offsetKey,shiftKey,anchorKey,precisionKey,units,fractions,
      prepositions:new Set(fields(w,'from').map(form)),borders:new Set(fields(w,'border').map(form)),
      approximation:new Set(fields(w,'approximation').map(form)),
      exact:new Set(fields(w,'exact').map(form)),
      introducers:new Set(fields(w,'introducer').map(form)),
      acts:new Set(fields(w,'act')),predicates:new Set(fields(w,'predicate').map(form)),
      creationPredicates:new Set(fields(w,'creation_predicate').map(form))}];
  });
}

function measured(phrase,config,worlds,attribute) {
  const ts=tokens(phrase), chars=Array.from(phrase);
  const span=(a,b)=>chars.slice(ts[a][2],ts[b-1][3]).join('');
  const attempts=[];
  for (let i=1;i<Math.min(ts.length,5);i++) {
    const numeral=span(0,i);
    const tail=ts.slice(i).map(([key])=>key).join(' ');
    const key=form(numeral), cardinal=worlds.nominalNumbers.get(key);
    const fraction=config.fractions.get(key) ??
      (i>1 && worlds.singularArticles.has(ts[i-1][0]) ? config.fractions.get(form(span(0,i-1))) : undefined);
    const value=positive.test(numeral) ? numeral.replace(/^\./u,'0.') :
      cardinal?.kind==='cardinal' ? cardinal.value : fraction;
    if (!Number.isFinite(Number(value)) || Number(value)<=0) continue;
    const unit=config.units.get(tail) ?? resolvePropertyUnit(worlds,config.family,attribute,tail,span(i,ts.length));
    if (unit) attempts.push({measure:value,unit,words:numeral});
  }
  return attempts.length===1 ? attempts[0] : undefined;
}

function licensedLead(worlds,lead,question) {
  return worlds.literalGrammar.leads.has(lead) ||
    !question && (!lead || worlds.fillerPhrases.has(lead));
}

function writtenPredicate(config,worlds,head,key,span,question) {
  for (let i=0;i<head-1;i++) {
    if (!licensedLead(worlds,key(0,i).replace(/ ,$/u,''),question)) continue;
    for (let j=i+1;j<head;j++) {
      const predicate=key(i,j);
      if (!config.predicates.has(predicate)) continue;
      if (!worlds.lookup(predicate).some(([role,act,mood])=>role==='act' && config.acts.has(act) &&
          (!mood || mood==='do'))) continue;
      return {form:predicate,predicate:span(i,j),objectStart:j,lead:i ? span(0,i) : undefined};
    }
  }
}

function motionSubjects(worlds,binding,end,predicate,key,span) {
  if (!worlds.literalGrammar.licenses(binding.family,binding.act)) return [];
  const {objectStart,lead}=predicate;
  return writtenMotionTargets(worlds,binding,objectStart,end,key,span).map(({target,selector})=>({sop:[
    '@r1 w.request.request act='+quote(binding.act)+' mood=do predicate='+quote(predicate.predicate),
    '@r1.t w.request.target request=$r1 family='+quote(binding.family)+' mode=existing'+target,
    '@r1.l w.request.lookup request=$r1 target=$r1.t key=thing from=page',
    ...motionSelector(selector),
    ...(lead ? ['@f1 w.request.filler text='+quote(lead)] : []),
  ].join('\n')}));
}

function nominalSubject(candidate,config,predicate) {
  if (candidate.source!=='nominal-creation' || !config.acts.has('make')) return;
  const wires=parse(candidate.sop);
  const request=wires.find(w=>w.type===type('request'));
  if (!request || field(request,'act')!=='make') return;
  request.attrs.predicate=[quote(predicate.predicate)];
  if (predicate.lead) wires.push({id:'lead',type:type('filler'),attrs:{text:[quote(predicate.lead)]}});
  return {sop:serialize(wires)};
}

function completeSubjectCandidate(candidate,body,config,worlds,written) {
  const wires=parse(candidate.sop);
  const requests=wires.filter(w=>w.type===type('request'));
  const targets=wires.filter(w=>w.type===type('target'));
  if (requests.length!==1 || targets.length!==1) return;
  const [request]=requests,[target]=targets;
  const ref='$'+request.id, predicate=field(request,'predicate');
  const mode=field(target,'mode'), act=field(request,'act');
  if (field(target,'request')!==ref || field(target,'family')!==config.family || request.attrs.polarity ||
      !config.acts.has(act) || !predicate || form(predicate)!==written.form ||
      ![undefined,'do','propose'].includes(field(request,'mood')) ||
      (act==='make' ? mode!=='new' || !config.creationPredicates.has(written.form) : mode!=='existing')) return;
  const [predicateSpan]=literalRanges(body,predicate);
  if (!predicateSpan) return;
  const rawLead=body.slice(0,predicateSpan[0]).trim().replace(/,$/u,'').trim();
  const lead=form(rawLead);
  if (!licensedLead(worlds,lead,false)) return;
  for (const w of wires.filter(w=>w.type===type('unread'))) {
    const raw=field(w,'text');
    const normalized=form(raw);
    if (normalized===lead) {
      w.type=type('filler');
      w.attrs={text:[quote(raw)]};
    } else if (worlds.singularArticles.has(normalized)) {
      w.type=type('filler');
      w.attrs={text:[quote(raw)]};
    } else return;
  }
  const evidence=evidenceReport(body,wires,worlds.evidenceVocabulary);
  if (evidence.missing.length || evidence.counts.uncovered) return;
  return {wires,request};
}

function addWire(wires,request,suffix,role,attrs) {
  let id=request.id+'.motion.'+suffix;
  while (wires.some(w=>w.id===id)) id+='_';
  wires.push({id,type:type(role),attrs:Object.fromEntries(Object.entries({request:'$'+request.id,...attrs})
    .map(([key,value])=>[key,[value]]))});
}

export async function measuredMotionReadings(text,worlds,read,permit) {
  const configs=worlds.measuredMotion;
  if (!configs?.length || quotedSpans(text).length || !permit(text,[])) return [];
  const ts=tokens(text), chars=Array.from(text);
  const stop=ts.length-Number(['.','!','?'].includes(ts.at(-1)?.[0]));
  if (stop<5 || stop>32) return [];
  const question=ts.at(-1)?.[0]==='?';
  const span=(a,b)=>chars.slice(ts[a][2],ts[b-1][3]).join('');
  const key=(a,b)=>ts.slice(a,b).map(([k])=>k).join(' ');
  const output=[];
  const reads=new Map();
  const readOnce=body=>{
    if (!reads.has(body)) reads.set(body,read(body));
    return reads.get(body);
  };
  for (const config of configs) {
    const locations=worlds.directionalResults.bindings.filter(b=>b.family===config.family);
    const shifts=config.shiftKey ? locations : [];
    const plans=[];
    for (let split=2;split<stop-1;split++) {
      for (let end=split+1;config.anchorKey && end<stop;end++) {
        if (!config.prepositions.has(key(end,end+1)) || end+2>=stop ||
            !config.borders.has(key(end+1,stop))) continue;
        const approximate=config.approximation.has(key(split,split+1));
        const start=split+Number(approximate);
        if (start>=end || approximate && !config.precisionKey) continue;
        const amount=measured(span(start,end),config,worlds,config.offsetKey);
        if (amount) plans.push({head:split,amount,amountWords:span(start,end),anchor:span(end+1,stop),
          marker:span(end,end+1),precision:approximate ? ['approximate',span(split,start)] : undefined});
      }
      for (const binding of shifts) {
        for (let from=split;from<stop;from++) for (let to=from+1;to<=Math.min(from+3,stop);to++) {
          const direction=binding.directions.get(key(from,to));
          if (!direction || from!==split && to!==stop) continue;
          const start=from===split ? to : split;
          const after=from===split ? stop : from;
          if (start>=after) continue;
          const introduced=config.introducers.has(key(start,start+1));
          const first=start+Number(introduced);
          const approximate=config.approximation.has(key(first,first+1));
          const exactBefore=config.exact.has(key(first,first+1));
          const exactAfter=config.exact.has(key(after-1,after));
          if (Number(approximate)+Number(exactBefore)+Number(exactAfter)>1 ||
              (approximate || exactBefore || exactAfter) && !config.precisionKey) continue;
          const lead=first+Number(approximate || exactBefore);
          const before=after-Number(exactAfter);
          if (lead>=before) continue;
          const amount=measured(span(lead,before),config,worlds,config.shiftKey);
          if (amount) plans.push({head:split,amount,amountWords:span(lead,before),direction,binding,
            directionWords:span(from,to),marker:introduced ? span(start,first) : undefined,
            precision:approximate ? ['approximate',span(first,lead)] : exactBefore ? ['exact',span(first,lead)] :
              exactAfter ? ['exact',span(before,after)] : undefined});
        }
      }
    }
    for (const plan of plans) {
      const predicate=writtenPredicate(config,worlds,plan.head,key,span,question);
      if (!predicate) continue;
      const body=span(0,plan.head);
      const candidates=[...(await readOnce(body))];
      for (const binding of plan.direction ? [plan.binding] : locations) {
        if (!config.acts.has(binding.act) || config.creationPredicates.has(predicate.form)) continue;
        candidates.push(...motionSubjects(worlds,binding,plan.head,predicate,key,span));
      }
      if (plan.anchor && config.creationPredicates.has(predicate.form)) for (const candidate of await readOnce(span(predicate.objectStart,plan.head))) {
        const nominal=nominalSubject(candidate,config,predicate);
        if (nominal) candidates.push(nominal);
      }
      const attribute=plan.direction ? config.shiftKey : config.offsetKey;
      const directionKey=plan.binding?.directionKey;
      for (const candidate of candidates) {
        const typed=completeSubjectCandidate(candidate,body,config,worlds,predicate);
        if (!typed) continue;
        const {wires,request}=typed;
        if (plan.direction && field(request,'act')!==plan.binding.act ||
            wires.some(w=>w.type===type('constraint') && [attribute,config.anchorKey,directionKey,config.precisionKey]
              .filter(Boolean).includes(field(w,'attribute')))) continue;
        request.attrs.mood ??= ['do'];
        request.attrs.words=[quote(text)];
        const {measure,unit,words}=plan.amount;
        addWire(wires,request,'amount','constraint',{on:'place',attribute:quote(attribute),
          operator:plan.direction ? 'delta' : 'eq',phase:'result',value:quote(plan.amountWords),
          words:quote(plan.amountWords),measure,unit:quote(unit),measure_words:quote(words),
          ...(plan.direction && plan.marker ? {key_words:quote(plan.marker)} : {})});
        if (plan.anchor) {
          addWire(wires,request,'anchor','constraint',{on:'place',attribute:quote(config.anchorKey),operator:'relation',
            phase:'selector',value:quote(plan.anchor),key_words:quote(plan.marker)});
        }
        if (plan.direction) {
          addWire(wires,request,'direction','constraint',{on:'attribute',attribute:quote(directionKey),operator:'eq',
            phase:'result',value:quote(plan.direction),words:quote(plan.directionWords)});
        }
        if (plan.precision) {
          addWire(wires,request,'precision','constraint',{on:'attribute',attribute:quote(config.precisionKey),
            operator:'eq',phase:'result',value:plan.precision[0],words:quote(plan.precision[1])});
        }
        output.push({sop:serialize(wires),source:'measured-motion',status:'matched'});
      }
    }
  }
  return output;
}
