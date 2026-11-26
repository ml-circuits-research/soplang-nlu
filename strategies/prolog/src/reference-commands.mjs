import {tokens} from './lexicon.mjs';
import {politeBody} from './trailing-discourse.mjs';

const quote=JSON.stringify;
const values=(wire,key)=>(wire.attrs[key] ?? []).map(value=>value.startsWith('"') ? JSON.parse(value) : value);
const one=(wire,key)=>values(wire,key)[0];
const terms=text=>tokens(text).map(([key])=>key);
const objectCases=new Set(['object','demonstrative']);
const verbWord=/^[\p{L}\p{M}]+$/u;

export function compileReferenceCommands(facts,acts) {
  const bindings=facts('pro.reader.reference_command').filter(wire=>acts.has(one(wire,'act')));
  const enabled=new Set(bindings.map(wire=>one(wire,'act')));
  const exclusiveActs=new Set(bindings.filter(wire=>one(wire,'exclusive')==='true').map(wire=>one(wire,'act')));
  const references=new Set(facts('w.lang.en.pron').filter(wire=>
    values(wire,'case').some(role=>objectCases.has(role)) && values(wire,'refers').includes('thing') &&
    values(wire,'in').includes('acts')).flatMap(wire=>values(wire,'text').map(text=>terms(text).join(' '))));
  const verbs=new Map(), particles=new Set(), splitTargets=new Map();
  const thingActs=new Set(facts('k.actions.role').filter(wire=>
    one(wire,'name')==='thing' && one(wire,'holds')==='thing' && one(wire,'needed')==='true')
    .map(wire=>one(wire,'act')));
  function add(head,tail,act,index=verbs) {
    const key=quote([head.join(' '),tail.join(' ')]);
    const alternatives=index.get(key) ?? new Set();
    alternatives.add(act);
    index.set(key,alternatives);
  }
  for (const verb of facts('k.actions.verb')) {
    const act=one(verb,'act');
    if (one(verb,'object')!=='thing') continue;
    const separable=one(verb,'separable')==='true';
    for (const text of values(verb,'text')) {
      const words=terms(text);
      if (!words.length || !words.every(word=>verbWord.test(word))) continue;
      const tail=words.slice(1);
      if (separable && tail.length) {
        particles.add(tail.join(' '));
        if (thingActs.has(act) && !['after_particle','attribute','complement','value'].some(key=>one(verb,key))) {
          add(words.slice(0,1),tail,act,splitTargets);
        }
      }
      if (!enabled.has(act)) continue;
      add(words,[],act);
      // Native separability licenses an intervening object after the verb.
      if (separable && tail.length) add(words.slice(0,1),tail,act);
    }
  }
  return {verbs,references,exclusiveActs,particles,splitTargets};
}

export function referenceCommandReadings(text,ts,worlds,politeness) {
  const {verbs,references,exclusiveActs}=worlds.referenceCommands;
  if (!verbs.size) return [];
  const body=politeBody(text,ts,politeness,2);
  if (!body) return [];
  const {start,end,fillers,phrase,span}=body;
  const readings=[];
  for (let first=start+1;first<end;first++) {
    for (let last=first+1;last<=end;last++) {
      if (!references.has(phrase(first,last))) continue;
      for (const act of verbs.get(quote([phrase(start,first),phrase(last,end)])) ?? []) {
        const predicate=span(start,last===end ? first : end);
        const sop=[
          '@r w.request.request act='+quote(act)+' mood=do refers=thing words='+quote(text)+' predicate='+quote(predicate),
          '@l w.request.lookup request=$r key=thing words='+quote(span(first,last)),
          ...fillers.map((words,i)=>'@f'+(i+1)+' w.request.filler text='+quote(words)),
        ].join('\n');
        readings.push({sop,source:'reference-command',status:'matched',exclusive:exclusiveActs.has(act)});
      }
    }
  }
  return readings;
}

// A declared separable verb can enclose a written nominal before its particle.
export function splitTargetPlans(text,ts,worlds,politeness) {
  const frames=worlds.referenceCommands.splitTargets;
  if (!frames.size) return [];
  const body=politeBody(text,ts,politeness,3);
  if (!body) return [];
  const {start,end,fillers,phrase}=body;
  const plans=[];
  for (let cut=start+2;cut<end;cut++) {
    const acts=frames.get(quote([phrase(start,start+1),phrase(cut,end)]));
    if (!acts || ts.slice(start+1,cut).some(([key])=>!verbWord.test(key) && !/^\d{1,8}$/u.test(key) ||
        worlds.joiners[key] || worlds.negatives.has(key) || worlds.scopeGrammar.negatives.has(key) ||
        worlds.scopeGrammar.choices.has(key) || worlds.scopeGrammar.conditionals.has(key))) continue;
    plans.push({
      acts:[...acts],fillers,start:ts[start][2],headEnd:ts[start][3],
      nounStart:ts[start+1][2],nounEnd:ts[cut-1][3],particleStart:ts[cut][2],end:ts[end-1][3],
    });
  }
  return plans;
}
