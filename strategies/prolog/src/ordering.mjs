import {tokens} from './lexicon.mjs';

const all=(wire,key)=>(wire.attrs[key] ?? []).map(value=>value.startsWith('"') ? JSON.parse(value) : value);
const one=(wire,key)=>all(wire,key)[0];
const form=text=>tokens(text).map(([term])=>term).join(' ');

export function compileOrdering(facts,isNoun) {
  const phrases=new Map(facts('w.lang.en.phrase').map(w=>[one(w,'name'),all(w,'item').map(form)]));
  const parts=Map.groupBy(facts('w.lang.en.part'),w=>one(w,'frame'));
  const frames=facts('w.lang.en.frame').flatMap(frame=>{
    const [act,mode,needs]=['act','mode','needs'].map(key=>one(frame,key));
    if (mode!=='order' || needs!=='ordered' || frame.attrs.mood || frame.attrs.polarity) return [];
    const ordered=[...(parts.get(one(frame,'name')) ?? [])].sort((a,b)=>Number(one(a,'at'))-Number(one(b,'at')));
    if (ordered.length!==5) return [];
    const [lead,predicate,object,marker,value]=ordered;
    if (one(lead,'is')!=='lead' || one(lead,'optional')!=='yes' || one(predicate,'is')!=='word' ||
        one(predicate,'optional')==='yes' || one(object,'is')!=='word' || one(object,'optional')!=='yes' ||
        one(marker,'is')!=='word' || one(marker,'optional')!=='yes' || one(value,'is')!=='role' ||
        one(value,'role')!=='value' || one(value,'takes')!=='rest' || one(value,'optional')==='yes') return [];
    return [{act,mode,leads:new Set(phrases.get(one(lead,'phrase')) ?? []),
      predicates:new Set(all(predicate,'word').map(form)),objects:new Set(all(object,'word').map(form)),
      markers:new Set(all(marker,'word').map(form))}];
  });
  const prepositions=rel=>new Set(facts('w.lang.en.prep').filter(w=>one(w,'rel')===rel).flatMap(w=>all(w,'text').map(form)));
  const articles=new Set(facts('w.lang.en.det').filter(w=>one(w,'kind')==='article' && one(w,'definite')==='yes')
    .flatMap(w=>all(w,'text').map(form)));
  const references=new Set(facts('w.lang.en.pron').filter(w=>all(w,'in').includes('acts') &&
    (all(w,'case').includes('object') && one(w,'person')==='3' ||
     all(w,'case').includes('demonstrative') && all(w,'refers').includes('thing')))
    .flatMap(w=>all(w,'text').map(form)));
  const extremes=Map.groupBy(facts('k.values.comparative').filter(w=>one(w,'degree')==='superlative'),
    w=>form(one(w,'text')));
  const leads=new Set(frames.flatMap(frame=>[...frame.leads]));
  const predicates=new Set(frames.flatMap(frame=>[...frame.predicates]));
  return {frames,articles,references,extremes,leads,predicates,starts:prepositions('from'),ends:prepositions('to'),isNoun};
}

export function orderingPacket(ts,quotes,worlds) {
  const bank=worlds.ordering;
  if (quotes.length || ts.length<4 || ts.length>26) return;
  const end=ts.length-Number(/^[.!。！]$/u.test(ts.at(-1)[0]));
  const phrase=(start,stop)=>ts.slice(start,stop).map(([term])=>term).join(' ');
  const initials=[0];
  for (let at=1;at<end-3;at++) if (bank.leads.has(phrase(0,at))) initials.push(at);
  const commands=initials.flatMap(start=>{
    const found=[];
    for (let stop=start+1;stop<=Math.min(end-3,start+4);stop++) {
      const surface=phrase(start,stop);
      if (bank.predicates.has(surface)) for (const frame of bank.frames) {
        if (frame.predicates.has(surface) && (!start || frame.leads.has(phrase(0,start))))
          found.push({start,stop,frame});
      }
    }
    return found;
  });
  if (!commands.length || ts.slice(0,end).some(([term])=>!/^[\p{L}\p{M}]+$/u.test(term) ||
      worlds.joiners[term] || worlds.negatives.has(term) || worlds.scopeGrammar.choices.has(term) ||
      worlds.scopeGrammar.conditionals.has(term))) return;
  const explicitNoun=surface=>bank.isNoun(surface) ? [['target']] : [];
  const nominal=(start,stop)=>{
    if (bank.articles.has(phrase(start,start+1)) || worlds.determiners[phrase(start,start+1)]==='demonstrative') start++;
    const surface=phrase(start,stop);
    return start<stop && (worlds.frameTargets(surface).length ||
      worlds.nominalInflection(surface,worlds.frameTargets).length ||
      stop===start+1 && (explicitNoun(surface).length || worlds.nominalInflection(surface,explicitNoun).length));
  };
  const found=[];
  for (const {start,stop,frame} of commands) for (let at=stop;at<end-2;at++) {
    const marker=phrase(at,at+1);
    if (!bank.starts.has(marker) || !frame.markers.has(marker)) continue;
    const object=phrase(stop,at);
    if (object && !(frame.objects.has(object) || bank.references.has(object) || nominal(stop,at))) continue;
    found.push({act:frame.act,mode:frame.mode,predicate:[start,stop],object:[stop,at],start:at});
  }
  if (!found.length) return;
  const separators=[], extremes=[];
  for (let start=0;start<end;start++) {
    if (bank.ends.has(phrase(start,start+1))) separators.push(start);
    const from=bank.articles.has(phrase(start,start+1)) ? start+1 : start;
    for (let stop=from+1;stop<=end;stop++) for (const word of bank.extremes.get(phrase(from,stop)) ?? [])
      extremes.push([start,stop,one(word,'scale'),one(word,'way')]);
  }
  return {commands:found,extremes,separators,end};
}
