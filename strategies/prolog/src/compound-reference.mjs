import { tokens } from './lexicon.mjs';

const label = /^(?:\p{Lu}[\p{L}\p{M}\p{N}_]*|\p{L}+[0-9]+)$/u;
const quote = JSON.stringify;

function unique(items) {
  return [...new Set(items)];
}

export function createCompoundReferenceReader(worlds) {
  const framesByFamily = new Map();
  for (const frame of worlds.compoundReferences ?? []) {
    const {family,firstKey,secondKey,delimiter} = frame;
    if (firstKey === secondKey || !/^[-\p{L}]+$/u.test(delimiter) || !delimiter?.startsWith('-') ||
        !delimiter.endsWith('-')) continue;
    const keys = worlds.requestKeys.filter(k => k.family === family && k.head === 'fill+span' && !k.values.length);
    if (!keys.some(first => first.name === firstKey &&
        keys.some(second => second.name === secondKey && second.family === first.family))) continue;
    const frames = framesByFamily.get(family) ?? [];
    framesByFamily.set(family,frames);
    frames.push({...frame,markers:tokens(delimiter).map(t=>t[0])});
  }
  const valueActs = new Set(worlds.acts.filter(w=>w.attrs.role?.includes('value'))
    .map(w=>w.attrs.name?.[0]));
  const maxPhrase = 8;
  return (text, ts, quotes=[]) => {
    if (!framesByFamily.size || !ts.some(t=>t[0]==='-')) return [];
    const chars = Array.from(text);
    const span = (a,b) => chars.slice(ts[a][2],ts[b-1][3]).join('');
    const keys = ts.map(t=>t[0]);
    if (ts.some(([, ,start,end])=>quotes.some(q=>q.start<end && q.end>start)) ||
        keys.some(key=>worlds.negatives.has(key) || worlds.joiners[key]==='condition')) return [];
    const end = ['.','!'].includes(keys.at(-1)) ? keys.length-1 : keys.length;
    const lookup = (start,stop) => worlds.lookup(keys.slice(start,stop).join(' '));
    const isLead = stop => !stop || worlds.literalGrammar.leads.has(keys.slice(0,stop).join(' '));
    const isLabel = i => ts[i] && label.test(ts[i][1]) &&
      !worlds.evidenceVocabulary.grammar.has(keys[i]);
    const actAt = (start,stop) => unique(lookup(start,stop)
      .filter(([kind,,mood]) => kind==='act' && (!mood || mood==='do')).map(([,act])=>act));
    const readings = new Map();
    function interpret(first,stop,verbStart,verbEnd) {
      if (!isLabel(first)) return;
      for (const act of actAt(verbStart,verbEnd)) {
        if (valueActs.has(act)) continue;
        for (let noun=Math.max(first+3,stop-maxPhrase);noun<stop;noun++) {
          const second = noun-1;
          if (!isLabel(second) || ts[second][3]>=ts[noun][2]) continue;
          const owners = lookup(noun,stop).filter(([kind,action,,mode]) =>
            kind==='target' && action===act && mode==='existing');
          for (const [,,family,,sort] of owners) {
            for (const {firstKey,secondKey,markers} of framesByFamily.get(family) ?? []) {
              if (second-first!==markers.length+1 || !markers.every((key,i)=>keys[first+1+i]===key) ||
                  !ts.slice(first,second).every((t,i)=>t[3]===ts[first+i+1][2])) continue;
              const firstValue=ts[first][1], secondValue=ts[second][1];
              const predicate=span(verbStart,verbEnd), head=span(noun,stop);
              const sop = [
                '@r1 w.request.request act='+quote(act)+' mood=do predicate='+quote(predicate),
                '@r1.t w.request.target request=$r1 family='+quote(family)+' mode=existing determiner=definite fill=context '+
                  (sort ? 'sort='+quote(sort)+' sort_words='+quote(head) : 'family_words='+quote(head)),
                '@r1.l w.request.lookup request=$r1 target=$r1.t key=thing from=page',
                ...[[firstKey,firstValue],[secondKey,secondValue]].map(([key,value],i)=>
                  '@r1.c'+(i+1)+' w.request.constraint request=$r1 on=attribute attribute='+quote(key)+
                  ' value='+quote(value)+' operator=eq phase=selector')
              ].join('\n');
              readings.set(sop,{sop,source:'compound-reference'});
            }
          }
        }
      }
    }

    // A compact reference can follow the predicate or be introduced as a
    // complete noun phrase picked up immediately by a local object pronoun.
    for (let start=0;start<Math.min(maxPhrase,end);start++) {
      if (!isLead(start)) continue;
      for (let stop=start+1;stop<Math.min(start+maxPhrase,end);stop++) {
        const first=worlds.determiners[keys[stop]]==='definite' ? stop+1 : stop;
        interpret(first,end,start,stop);
      }
    }
    const comma = keys.indexOf(',');
    if (comma>0 && end>comma+2 && worlds.evidenceVocabulary.grammar.has(keys[end-1]) &&
        lookup(end-1,end).some(([kind,,role])=>kind==='reference' && role==='thing')) {
      const first=worlds.determiners[keys[0]]==='definite' ? 1 : 0;
      interpret(first,comma,comma+1,end-1);
    }
    return readings.size===1 ? [...readings.values()] : [];
  };
}
