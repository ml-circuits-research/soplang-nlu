import {nativeInventory} from './native-inventory.mjs';
import {compileNominalSelectors,nominalSelectors,nominalSelectorLines} from './nominal-selectors.mjs';
import { tokens } from './lexicon.mjs';

const values=(wire,key)=>(wire.attrs[key] ?? []).map(value=>value.startsWith('"') ? JSON.parse(value) : value);
const one=(wire,key)=>values(wire,key)[0];
const normal=text=>tokens(text).map(([term])=>term).join(' ');
const quote=JSON.stringify;
const endings=new Set(['.','!','?']);
const existingDeterminers=new Set(['definite','demonstrative','possessive']);
const atom=/^[\p{L}_][\p{L}\p{M}\p{N}_.-]*$/u;
const apostrophe=text=>text.replaceAll('’',"'");

export function compileDirectionalResults(facts,requestKeys,words=facts('core.word'),
  selectorRules=compileNominalSelectors(facts,requestKeys,words)) {
  const placeFrames=new Set(facts('w.lang.en.frame')
    .filter(wire=>one(wire,'act')==='place').map(wire=>one(wire,'name')));
  const parts=facts('w.lang.en.part');
  const directionalFrames=new Set(parts.filter(wire=>one(wire,'is')==='role' &&
    one(wire,'takes')==='lexicon' && one(wire,'lexicon')==='acts.dir' &&
    placeFrames.has(one(wire,'frame'))).map(wire=>one(wire,'frame')));
  const placeVerbs=new Set(facts('k.actions.verb')
    .filter(wire=>one(wire,'act')==='place' && one(wire,'object')==='thing')
    .flatMap(wire=>values(wire,'text').map(normal)));
  const predicates=new Set(parts.filter(wire=>one(wire,'is')==='word' && one(wire,'act')==='place' &&
    directionalFrames.has(one(wire,'frame'))).flatMap(wire=>values(wire,'word').map(normal))
    .filter(form=>placeVerbs.has(form)));
  const degrees=new Set(facts('w.lang.en.phrase').filter(wire=>one(wire,'name')==='degree.slight' ||
    one(wire,'name')==='degree.strong').flatMap(wire=>values(wire,'item').map(normal)));
  const directions=nativeInventory(facts,'k.values.direction',words);
  const plane=new Map(facts('k.values.direction').flatMap(wire=>{
    const [name,x,y]=['name','x','y'].map(key=>one(wire,key));
    return x!==undefined && y!==undefined ? [[name,[Number(x),Number(y)]]] : [];
  }));
  const stoppingLeads=new Set(facts('w.lang.en.prep.time').filter(wire=>one(wire,'span')==='end')
    .flatMap(wire=>values(wire,'text').map(normal)));
  const bindings=[];
  for (const wire of facts('pro.reader.motion')) {
    const [family,act,directionKey,degreeKey,offsetKey,targetType]=
      ['family','act','direction_key','degree_key','offset_key','target_type'].map(key=>one(wire,key));
    const keys=requestKeys.filter(key=>key.family===family);
    const direction=keys.find(key=>key.name===directionKey && key.head.split('+').includes('class'));
    if (!act || !direction?.values.length) continue;
    bindings.push({family,act,directionKey,selectorRules:selectorRules.filter(rule=>rule.family===family),
      directions:new Map([...directions].flatMap(([form,names])=>{
      const allowed=[...names].filter(name=>atom.test(name) && direction.values.includes(name));
      return allowed.length===1 ? [[form,allowed[0]]] : [];
    })),degreeKey:keys.some(key=>key.name===degreeKey && key.head==='candidate' && !key.values.length) ? degreeKey : undefined,
    offsetKey:keys.some(key=>key.name===offsetKey && key.head.split('+').includes('number')) ? offsetKey : undefined,
    targets:targetType ? nativeInventory(facts,targetType,words) : new Map()});
  }
  const negators=facts('pro.reader.scope_cue').filter(wire=>one(wire,'kind')==='predicateNegators')
    .flatMap(wire=>values(wire,'text').map(normal));
  const prohibitions=new Set(facts('w.lang.en.neg.imperative').flatMap(wire=>values(wire,'text'))
    .filter(text=>!text.includes(' ') || negators.some(form=>normal(text).endsWith(' '+form)))
    .map(text=>apostrophe(normal(text))));
  return {predicates,degrees,bindings,prohibitions,plane,stoppingLeads};
}

export function writtenMotionTargets(worlds,binding,start,end,phrase,span) {
  const description=span(start,end), whole=phrase(start,end);
  if (worlds.isReference(whole)) return [{target:' fill=context family_words='+quote(description)}];
  let first=start, determiner;
  for (let i=Math.min(start+5,end-1);i>start;i--) {
    determiner=worlds.determiners[phrase(start,i)];
    if (!determiner) continue;
    if (!existingDeterminers.has(determiner)) return [];
    first=i;
    break;
  }
  const numbered=determiner==='definite' && first+1<end && /^\d+$/u.test(phrase(first,first+1));
  const nounStart=first+Number(numbered);
  const nominal=phrase(nounStart,end);
  if (worlds.scopeGrammar.auxiliary.has(nominal) || worlds.isReference(nominal)) return [];
  const sorts=new Set(binding.targets.get(nominal) ?? []);
  for (const [role,act,family,mode,sort] of worlds.lookup(nominal)) {
    if (role==='target' && (act==='place' || act===binding.act) && family===binding.family &&
      mode!=='new' && sort) sorts.add(sort);
  }
  // A definite number before a singular, typed noun qualifies its written
  // description. An unqualified cardinal or a plural noun can be a count.
  if (numbered && ![...sorts].every(sort=>normal(sort.replaceAll('_',' '))===nominal)) return [];
  const options=numbered ? [] : nominalSelectors(binding.selectorRules,first,end,phrase,span);
  if (sorts.size===1) options.unshift({sort:[...sorts][0],sortWords:span(nounStart,end)});
  return options.map(({sort,sortWords,selector})=>({
    target:' fill=description sort='+quote(sort)+' description='+quote(description)+
      (sort!==sortWords ? ' sort_words='+quote(sortWords) : '')+
      (determiner ? ' determiner='+determiner : ''),
    selector,
  }));
}

export const motionSelector=nominalSelectorLines;

function directionalComponent(start,end,binding,motion,phrase,span) {
  const options=[];
  const add=(first,last,degree)=>{
    const direction=binding.directions.get(phrase(first,last));
    if (direction) options.push({direction,words:span(first,last),degree});
  };
  add(start,end);
  for (let at=start+1;at<end;at++) {
    if (motion.degrees.has(phrase(start,at))) add(at,end,span(start,at));
    if (motion.degrees.has(phrase(at,end))) add(start,at,span(at,end));
  }
  if (options.length===1) return options[0];
}

function directionTail(ts,start,end,binding,motion,worlds,phrase,span) {
  const single=directionalComponent(start,end,binding,motion,phrase,span);
  if (single) return [single];
  for (let at=start+1;at<end-1;at++) {
    if (worlds.joiners[ts[at][0]]!=='coordination') continue;
    const left=directionalComponent(start,at,binding,motion,phrase,span);
    const right=directionalComponent(at+1,end,binding,motion,phrase,span);
    const a=motion.plane.get(left?.direction), b=motion.plane.get(right?.direction);
    if (a && b && a.some(Boolean) && b.some(Boolean) && a[0]*b[0]+a[1]*b[1]===0) return [left,right];
  }
}

function stoppingTail(ts,start,end,motion,worlds,phrase) {
  for (let at=start+2;at<end-1;at++) {
    for (let until=at+1;until<=Math.min(at+4,end-1);until++) {
      if (!motion.stoppingLeads.has(phrase(at,until))) continue;
      const content=ts.slice(until,end);
      if (content.every(([term])=>!worlds.joiners[term])) return at;
    }
  }
  return end;
}

export function directionalResultCandidates(text,ts,quotes,worlds) {
  const motion=worlds.directionalResults;
  if (!motion?.bindings.length || ts.length<3 || quotes.length) return [];
  const chars=Array.from(text);
  const span=(a,b)=>chars.slice(ts[a][2],ts[b-1][3]).join('');
  const phrase=(a,b)=>ts.slice(a,b).map(([part])=>part).join(' ');
  let stop=ts.length;
  while (endings.has(ts[stop-1]?.[0])) stop--;
  if (!stop) return [];
  const question=ts.slice(stop).some(([term])=>term==='?');
  const output=[];
  for (let start=0;start<Math.min(12,stop-2);start++) {
    const lead=phrase(0,start).replace(/ ,$/u,'');
    const negative=motion.prohibitions.has(apostrophe(phrase(0,start)));
    if (negative ? question : (lead || question) && !worlds.literalGrammar.leads.has(lead) &&
      (question || !worlds.fillerPhrases.has(lead))) continue;
    for (let head=start+1;head<Math.min(start+8,stop-1);head++) {
      const predicate=phrase(start,head);
      if (!motion.predicates.has(predicate) ||
          !worlds.lookup(predicate).some(([role,act,mood])=>role==='act' && act==='place' && (!mood || mood==='do'))) continue;
      const content=ts.slice(head,stop).map(([term])=>term);
      if (content.some(term=>!/^[\p{L}\p{M}\p{N}_]+$/u.test(term) || worlds.negatives.has(term) ||
          worlds.joiners[term] && worlds.joiners[term]!=='coordination' || worlds.scopeGrammar.conditionals.has(term))) continue;
      if (negative && [...worlds.scopeGrammar.conditionals.keys()].some(form=>
        (' '+content.join(' ')+' ').includes(' '+form+' '))) continue;
      const motionEnd=stoppingTail(ts,head,stop,motion,worlds,phrase);
      for (const binding of motion.bindings) {
        if (!worlds.literalGrammar.licenses(binding.family,binding.act)) continue;
        for (let from=head+1;from<motionEnd;from++) {
          const components=directionTail(ts,from,motionEnd,binding,motion,worlds,phrase,span);
          if (!components) continue;
          const [{direction,words,degree}]=components;
          const stopping=motionEnd<stop;
          const joint=components.length>1;
          if (negative && (degree || joint || stopping)) continue;
          for (const {target,selector} of writtenMotionTargets(worlds,binding,head,from,phrase,span)) {
            const lines=[
              '@r1 w.request.request act='+quote(binding.act)+' mood=do predicate='+quote(span(start,head))+' words='+quote(text),
              '@r1.t w.request.target request=$r1 family='+quote(binding.family)+' mode=existing'+target,
              '@r1.l w.request.lookup request=$r1 target=$r1.t key=thing from=page',
              ...motionSelector(selector),
            ];
            let source=negative ? 'directional-prohibition' : 'directional-result';
            let unread=false;
            if (joint || stopping) {
              const note=joint ? 'combined direction requires a vector' : 'movement depends on an unresolved stopping condition';
              lines.push('@r1.u1 w.request.unread request=$r1 text='+quote(span(from,motionEnd))+' note='+quote(note));
              if (stopping) lines.push('@r1.u2 w.request.unread request=$r1 text='+quote(span(motionEnd,stop))+
                ' note='+quote('stopping condition'));
              unread=true;
              source='directional-incomplete';
            } else {
              lines.push('@r1.c1 w.request.constraint request=$r1 on=attribute attribute='+quote(binding.directionKey)+
                ' value='+direction+' operator=eq phase=result'+(negative ? ' want=no' : '')+
                (negative || words!==direction ? ' words='+quote(words) : ''));
              if (degree && binding.degreeKey) lines.push('@r1.c2 w.request.constraint request=$r1 on=attribute attribute='+
                quote(binding.degreeKey)+' value='+quote(degree)+' operator=eq phase=result');
              if (degree && !binding.degreeKey) {
                lines.push('@r1.u1 w.request.unread request=$r1 text='+quote(degree)+
                  (binding.offsetKey ? ' note='+quote(binding.offsetKey) : ''));
                unread=true;
              }
            }
            if (start && !negative) lines.push('@f1 w.request.filler text='+quote(span(0,start)));
            if (negative && worlds.fillerPhrases.has(phrase(0,1))) {
              lines.push('@f1 w.request.filler text='+quote(span(0,1)));
            }
            output.push({sop:lines.join('\n'),source,status:unread ? 'partial' : 'matched'});
          }
        }
      }
    }
  }
  return output;
}
