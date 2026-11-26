import { tokens } from './lexicon.mjs';
import { politeBody } from './trailing-discourse.mjs';

const decode=value=>value?.startsWith('"') ? JSON.parse(value) : value;
const values=(wire,key)=>(wire.attrs[key] ?? []).map(decode);
const one=(wire,key)=>values(wire,key)[0];
const form=text=>tokens(text).map(([key])=>key).join(' ');
const quote=JSON.stringify;

// A reader binding selects a native frame with a closed, role-free body and
// maps its result to the current request act bank.
export function compileClosedRequests(facts,acts) {
  const frames=new Map(facts('w.lang.en.frame').map(frame=>[one(frame,'name'),frame]));
  const parts=Map.groupBy(facts('w.lang.en.part'),part=>one(part,'frame'));
  const phrases=new Map(facts('w.lang.en.phrase').map(wire=>[one(wire,'name'),values(wire,'item').map(form)]));
  const corrective=new Set(facts('w.lang.en.correction').filter(wire=>one(wire,'comma')==='yes')
    .flatMap(wire=>values(wire,'text').map(form)));
  const fixed=new Set(facts('w.lang.en.fixed').map(wire=>one(wire,'frame')));
  return facts('pro.reader.closed_request').flatMap(binding=>{
    const frame=one(binding,'frame'), act=one(binding,'act');
    if (!frames.has(frame) || frames.get(frame).attrs.role || fixed.has(frame) || !acts.has(act)) return [];
    const choices=new Map();
    for (const entry of values(binding,'word')) {
      const match=/^(\d+):(.+)$/u.exec(entry);
      if (!match) return [];
      const [,part,surface]=match;
      const accepted=choices.get(part) ?? new Set();
      accepted.add(form(surface));
      choices.set(part,accepted);
    }
    const ordered=(parts.get(frame) ?? []).slice().sort((a,b)=>Number(one(a,'at'))-Number(one(b,'at')));
    const pattern=[];
    for (const part of ordered) {
      const kind=one(part,'is'), optional=one(part,'optional')==='yes';
      if (kind==='lead' && optional) continue;
      if (kind==='det' && optional) { pattern.push({optional,determiner:true}); continue; }
      const variants=kind==='phrase' ? phrases.get(one(part,'phrase')) :
        kind==='word' ? values(part,'word').map(form).filter(Boolean) : undefined;
      if (!variants?.length) return [];
      const number=one(part,'at');
      const accepted=choices.get(number);
      if (accepted && [...accepted].some(value=>!variants.includes(value))) return [];
      const forms=accepted ? variants.filter(value=>accepted.has(value)) : variants;
      choices.delete(number);
      if (!forms.length) return [];
      const surfaces=kind==='phrase' ? forms.flatMap(value=>{
        const [head,...rest]=value.split(' ');
        return corrective.has(head) && rest.length ? [value,[head,',',...rest].join(' ')] : [value];
      }) : forms;
      pattern.push({optional,forms:surfaces.map(value=>[value,value.split(' ').length])});
    }
    if (choices.size || !pattern.some(part=>!part.optional)) return [];
    const lead=one(binding,'lead');
    if (lead && !phrases.has(lead)) return [];
    return [{act,pattern,courtesy:one(binding,'courtesy')==='true',leads:lead && new Set(phrases.get(lead)),
      exclusive:one(binding,'exclusive')==='true'}];
  });
}

function atEnd(pattern,part,at,end,phrase,determiners) {
  if (part===pattern.length) return at===end;
  const item=pattern[part];
  if (item.optional && atEnd(pattern,part+1,at,end,phrase,determiners)) return true;
  if (at===end) return false;
  if (item.determiner) return Boolean(determiners[phrase(at,at+1)]) &&
    atEnd(pattern,part+1,at+1,end,phrase,determiners);
  return item.forms.some(([value,width])=>at+width<=end && phrase(at,at+width)===value &&
    atEnd(pattern,part+1,at+width,end,phrase,determiners));
}

export function closedRequestReadings(text,ts,worlds,politeness) {
  const ordinary=politeBody(text,ts,politeness,1);
  if (!ordinary) return [];
  const readings=[];
  for (const {act,pattern,courtesy,leads,exclusive} of worlds.closedRequests) {
    const body=leads ? politeBody(text,ts,politeness,1,leads) : ordinary;
    if (!body) continue;
    const {start,end,fillers,phrase,span}=body;
    if (courtesy && !fillers.length || !atEnd(pattern,0,start,end,phrase,worlds.determiners)) continue;
    const opening=start>0 && form(fillers[0]);
    const requestLead=opening && leads?.has(opening) && !politeness.has(opening);
    const fillerWords=requestLead ? fillers.slice(1) : fillers;
    const sop=[
      '@r w.request.request act='+quote(act)+' mood=do words='+quote(text)+' predicate='+quote(span(requestLead ? 0 : start,end)),
      ...fillerWords.map((words,i)=>'@f'+(i+1)+' w.request.filler text='+quote(words)),
    ].join('\n');
    readings.push({sop,source:'closed-request',status:'matched',exclusive});
  }
  return readings;
}
