import {parse,serialize,str} from './knowledge.mjs';
import {tokens} from './lexicon.mjs';
import {literalRanges,sortRanges} from './evidence.mjs';
import {quotedSpans} from './literal-roles.mjs';

const ns='w.request.';
const types={request:ns+'request',target:ns+'target',constraint:ns+'constraint'};
const one=(wire,key)=>str(wire?.attrs[key]?.[0]);
const all=(wire,key)=>(wire.attrs[key] ?? []).map(str);
const surface=text=>tokens(text ?? '').map(([key])=>key).join(' ');
const word=/^[\p{L}\p{M}\p{N}_]+$/u;
const nominalModes=new Set(['definite','indefinite','possessive','demonstrative']);

export function compileParticipantAdjuncts(facts,catalog) {
  const destinations=new Set(facts('w.lang.en.pron').filter(wire=>
    one(wire,'case')==='locative' && one(wire,'refers')==='place')
    .flatMap(wire=>all(wire,'text').map(surface)));
  return facts('pro.reader.participant_adjunct').flatMap(wire=>{
    const [family,subjectKey,attribute,destination]=
      ['family','subject_key','attribute','destination'].map(key=>one(wire,key));
    const key=name=>catalog.find(row=>row.family===family && row.name===name);
    const subject=key(subjectKey), operand=key(attribute), location=key(destination);
    if (!subject?.values.length || !operand || operand.values.length ||
        !operand.head.split('+').some(head=>head==='candidate' || head==='span') ||
        destination && (!location || location.values.length || !location.head.split('+').includes('span'))) return [];
    const cues=all(wire,'cue').map(text=>surface(text).split(' ')).filter(form=>form.every(term=>word.test(term)));
    const acts=new Set(all(wire,'act'));
    if (!cues.length || !acts.size) return [];
    return [{family,subjectKey,subjects:new Set(subject.values.map(surface)),attribute,destination,destinations,cues,acts}];
  });
}

function adjunct(text,worlds) {
  const ts=tokens(text), chars=Array.from(text);
  const stop=ts.length-(['.','!'].includes(ts.at(-1)?.[0]) ? 1 : 0);
  const split=ts.findIndex(([key])=>key===',');
  if (split<2 || ts.findLastIndex(([key])=>key===',')!==split || stop-split<4) return;
  if (ts.slice(0,stop).some(([key],i)=>i!==split && (!word.test(key) || worlds.joiners[key] ||
      worlds.negatives.has(key) || worlds.scopeGrammar.predicateNegators.has(key)))) return;
  const span=(a,b)=>chars.slice(ts[a][2],ts[b-1][3]).join('');
  const matches=[];
  for (const frame of worlds.participantAdjuncts) for (const cue of frame.cues) {
    if (!cue.every((key,i)=>ts[split+1+i]?.[0]===key)) continue;
    const first=split+1+cue.length;
    if (first+1>=stop || !nominalModes.has(worlds.determiners[ts[first][0]])) continue;
    if (ts.slice(first+1,stop).some(([key])=>worlds.evidenceVocabulary.grammar.has(key) ||
        worlds.lookup(key).some(([role])=>role==='act' || role==='marker'))) continue;
    const locative=frame.destinations.has(ts[split-1][0]);
    if (locative && (!frame.destination || split<3)) continue;
    const bodyEnd=locative ? split-1 : split;
    matches.push({frame,body:span(0,bodyEnd),cue:span(split+1,first),
      participant:span(first,stop),destination:locative ? span(split-1,split) : undefined});
  }
  if (matches.length===1) return matches[0];
}

function bindReading(text,{frame,body,cue,participant,destination},candidate,worlds) {
  if (!candidate?.sop) return;
  const wires=parse(candidate.sop);
  const actions=wires.filter(wire=>wire.type===types.request);
  const objects=wires.filter(wire=>wire.type===types.target);
  if (actions.length!==1 || objects.length!==1) return;
  const [request]=actions,[target]=objects;
  const ref='$'+request.id, act=one(request,'act'), mood=one(request,'mood');
  if (one(target,'request')!==ref || one(target,'family')!==frame.family || !frame.acts.has(act) ||
      !worlds.literalGrammar.licenses(frame.family,act) || mood && mood!=='do' || request.attrs.want) return;
  const sort=one(target,'sort');
  const explicit=one(target,'sort_words') ?? one(target,'family_words');
  if (!sort || (explicit ? literalRanges(body,explicit) : sortRanges(body,sort)).length!==1) return;
  const constraints=wires.filter(wire=>wire.type===types.constraint);
  if (!frame.subjects.has(surface(sort)) && !constraints.some(wire=>one(wire,'request')===ref &&
      one(wire,'attribute')===frame.subjectKey && frame.subjects.has(surface(one(wire,'value'))))) return;
  if (constraints.some(wire=>[frame.attribute,frame.destination].includes(one(wire,'attribute')))) return;
  const add=(suffix,key,value,label)=>{
    let id=request.id+'.'+suffix;
    while (wires.some(wire=>wire.id===id)) id+='_';
    wires.push({id,type:types.constraint,attrs:{request:[ref],on:['attribute'],attribute:[key],
      value:[JSON.stringify(value)],operator:['eq'],phase:['result'],
      ...(label ? {key_words:[JSON.stringify(label)]} : {})}});
  };
  add('participant',frame.attribute,participant,cue);
  if (destination) add('destination',frame.destination,destination);
  request.attrs.words=[JSON.stringify(text)];
  return {...candidate,sop:serialize(wires),source:'participant-adjunct'};
}

export async function participantAdjunctReadings(text,worlds,read,permit) {
  if (!worlds.participantAdjuncts?.length || quotedSpans(text).length || !permit(text,[])) return [];
  const match=adjunct(text,worlds);
  if (!match) return [];
  return (await read(match.body)).map(candidate=>bindReading(text,match,candidate,worlds)).filter(Boolean);
}
