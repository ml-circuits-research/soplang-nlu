import { tokens } from './lexicon.mjs';
import { parse } from './schema.mjs';

const quote = JSON.stringify;
const decode = value => value?.startsWith('"') ? JSON.parse(value) : value;
const field = (wire,key) => decode(wire.attrs[key]?.[0]);
const properPart = /^\p{Lu}[\p{L}\p{M}\p{N}_]*$/u;
const digits = /^[0-9]+$/u;
const instance = /^(\p{L}+)[0-9]+$/u;
const atom = /^[\p{L}_][\p{L}\p{M}\p{N}_.-]*$/u;
const nounLimit = 8;

function pairFrames(worlds) {
  const frames = new Map();
  const acts = worlds.acts.map(wire=>field(wire,'name'));
  const patterns = acts.flatMap(act=>worlds.argumentPatterns(act));
  for (const frame of worlds.compoundReferences ?? []) {
    const {family,firstKey,secondKey,delimiter} = frame;
    if (!family || !firstKey || !secondKey || firstKey===secondKey) continue;
    const keys = worlds.requestKeys.filter(key=>key.family===family && key.head.split('+').includes('span') &&
      !key.values.length);
    if (!keys.some(left=>left.name===firstKey && keys.some(right=>right.family===left.family && right.name===secondKey))) continue;
    const options = new Map();
    for (const separator of patterns.filter(pattern=>pattern.family===family && pattern.keys?.[0]===firstKey &&
        pattern.keys[1]===secondKey).map(pattern=>pattern.separator)) {
      if (separator) options.set(separator,{terms:separator.split(' '),compact:false});
    }
    const compactTerms=tokens(delimiter ?? '').map(([term])=>term);
    if (compactTerms.length) options.set(delimiter,{terms:compactTerms,compact:true});
    if (!options.size) continue;
    const readings = frames.get(family) ?? [];
    readings.push({...frame,markers:[...options.values()]});
    frames.set(family,readings);
  }
  return frames;
}

function background(terms,start,worlds) {
  if (terms[start-1]!==',' || start<3 || start>14 || !worlds.scopeGrammar.subjects.has(terms[0])) return false;
  return terms.slice(1,start-1).every(word=>word && /^[\p{L}\p{M}\p{N}_]+$/u.test(word) &&
    !worlds.scopeGrammar.modals.has(word) && !worlds.joiners[word] &&
    !worlds.lookup(word).some(([role])=>role==='act'));
}

function endpoint(start,end,ts,visible,quotes,span,worlds,instances) {
  if (start>=end) return;
  const exact = quotes.find(quote=>quote.start===ts[start][2] && quote.end===ts[end-1][3]);
  if (exact && /[\p{L}\p{N}]/u.test(exact.value)) return exact.value;
  const slice = ts.slice(start,end);
  if (slice.some(([key],i)=>!visible[start+i] ||
    worlds.evidenceVocabulary.grammar.has(key) || worlds.negatives.has(key) || worlds.joiners[key])) return;
  const prefix = slice.length===1 && instance.exec(slice[0][0])?.[1];
  if (prefix && instances.has(prefix)) return slice[0][1];
  const labels = slice.map(([,literal])=>literal);
  const names = digits.test(labels.at(-1)) ? labels.slice(0,-1) : labels;
  if (names.length && names.every(part=>properPart.test(part) && !instance.test(part))) return span(start,end);
}

function effect(phrase,family,keys,worlds) {
  const matches = new Map();
  for (const [body,evidence] of worlds.ownerPropertyValues?.get(JSON.stringify([family,phrase])) ?? []) {
    if (evidence.includes('key_words=')) continue;
    const [wire] = parse('@effect w.request.constraint '+body);
    const attribute=field(wire,'attribute'),value=field(wire,'value');
    if (!attribute || !value || keys.includes(attribute) || wire.attrs.open_value ||
        field(wire,'phase')!=='result' || field(wire,'operator')!=='eq' ||
        !worlds.requestKeys.some(key=>key.family===family && key.name===attribute && key.values.includes(value))) continue;
    matches.set(JSON.stringify([attribute,value]),{attribute,value});
  }
  if (matches.size===1) return matches.values().next().value;
}

function proposal({act,family,sort,noun,predicate,scope,description,endpoints,result,preamble,unread}) {
  const lines = [
    '@r1 w.request.request act='+quote(act)+' mood=do predicate='+quote(predicate)+' words='+quote(scope),
    '@r1.t w.request.target request=$r1 family='+quote(family)+' mode=existing determiner=definite fill=context'+
      ' description='+quote(description)+(sort ? ' sort='+quote(sort)+' sort_words='+quote(noun) : ' family_words='+quote(noun)),
    '@r1.l w.request.lookup request=$r1 target=$r1.t key=thing from=page',
  ];
  for (const [i,[attribute,value]] of endpoints.entries()) {
    lines.push('@r1.endpoint'+(i+1)+' w.request.constraint request=$r1 on=attribute attribute='+quote(attribute)+
      ' value='+quote(value)+' operator=eq phase=selector');
  }
  if (result) {
    const value = atom.test(result.value) ? result.value : quote(result.value);
    lines.push('@r1.effect w.request.constraint request=$r1 on=attribute attribute='+quote(result.attribute)+
      ' value='+value+(result.words!==result.value ? ' words='+quote(result.words) : '')+' operator=eq phase=result');
  }
  if (preamble) lines.push('@r1.lead w.request.filler text='+quote(preamble));
  if (unread) lines.push('@r1.background w.request.unread text='+quote(unread));
  return {sop:lines.join('\n'),source:'endpoint-reference',status:unread ? 'partial' : 'matched'};
}

export function createEndpointReferenceReader(worlds) {
  const frames = pairFrames(worlds);
  const instances = new Set((worlds.instanceBindings ?? []).map(binding=>binding.prefix));
  const valueActs = new Set(worlds.acts.filter(wire=>wire.attrs.role?.includes('value')).map(wire=>field(wire,'name')));
  return (text,ts,quotes=[]) => {
    if (!frames.size || ts.length<5 || ts.length>45) return [];
    const chars = Array.from(text), terms = ts.map(([term])=>term.replaceAll('’',"'"));
    const span = (start,end)=>chars.slice(ts[start][2],ts[end-1][3]).join('');
    const visible = ts.map(([, ,start,end],i)=>quotes.some(q=>q.start<end && start<q.end) ? '' : terms[i]);
    const phrase = (start,end)=>visible.slice(start,end).join(' ');
    let end = ts.length;
    while (['.','!'].includes(visible[end-1])) end--;
    for (let start=0;start<end;start++) {
      for (let stop=start+1;stop<=Math.min(start+5,end);stop++) {
        const key=phrase(start,stop);
        if (worlds.negatives.has(key) || worlds.scopeGrammar.negatives.has(key) ||
            worlds.scopeGrammar.conditionals.has(key) ||
            [...worlds.scopeGrammar.endings].some(ending=>key.replaceAll(' ','').endsWith(ending))) return [];
      }
    }
    const hasMarker = [...frames.values()].some(options=>options.some(frame=>frame.markers.some(({terms})=>
      visible.some((_,i)=>terms.every((term,j)=>visible[i+j]===term)))));
    if (visible.includes('?') || !hasMarker) return [];
    const results = new Map();
    for (let v=0;v<Math.min(15,end-4);v++) {
      const lead=phrase(0,v).replace(/\s+,\s*$/u,'');
      const polite=lead && (worlds.literalGrammar.leads.has(lead) || worlds.fillerPhrases.has(lead));
      const explained=v>0 && !polite && background(visible,v,worlds);
      if (v && !polite && !explained) continue;
      for (let p=v+1;p<Math.min(v+nounLimit,end-3);p++) {
        if (!visible.slice(v,p).every(Boolean)) break;
        const acts=worlds.lookup(phrase(v,p)).filter(([role,,mood])=>role==='act' && (!mood || mood==='do'));
        const first=worlds.determiners[visible[p]]==='definite' ? p+1 : p;
        for (let left=first+1;left<Math.min(first+nounLimit,end-2);left++) {
          const from=endpoint(first,left,ts,visible,quotes,span,worlds,instances);
          if (!from) continue;
          for (const [family,patterns] of frames) for (const pattern of patterns) for (const marker of pattern.markers) {
            if (!marker.terms.every((term,i)=>visible[left+i]===term)) continue;
            const right=left+marker.terms.length;
            if (marker.compact && !ts[right]) continue;
            if (marker.compact && !ts.slice(left-1,right).every((part,i)=>part[3]===ts[left+i][2])) continue;
            for (let n=right+1;n<Math.min(right+nounLimit,end);n++) {
              const to=endpoint(right,n,ts,visible,quotes,span,worlds,instances);
              if (!to) continue;
              for (let stop=n+1;stop<=Math.min(n+nounLimit,end);stop++) {
                if (!visible.slice(n,stop).every(Boolean)) break;
                const owners=worlds.lookup(phrase(n,stop)).filter(([role,,owner,mode])=>
                  role==='target' && owner===family && mode==='existing');
                for (const [,act] of acts) for (const [,ownerAct,,,sort] of owners) {
                  if (act!==ownerAct || !worlds.literalGrammar.licenses(family,act)) continue;
                  const keys=[pattern.firstKey,pattern.secondKey];
                  let result;
                  if (stop<end && valueActs.has(act)) {
                    for (let payload=stop;payload<Math.min(end,stop+4);payload++) {
                      if (payload!==stop && !worlds.lookup(phrase(stop,payload)).some(([role,sense,kind])=>
                        role==='marker' && sense===act && kind==='value')) continue;
                      const candidate=effect(phrase(payload,end),family,keys,worlds);
                      if (candidate) { result={...candidate,words:span(payload,end)}; break; }
                    }
                  }
                  if (valueActs.has(act) ? !result : stop!==end) continue;
                  const reading=proposal({act,family,sort,noun:span(n,stop),predicate:span(v,p),
                    scope:span(v,end),description:span(p,stop),endpoints:[[keys[0],from],[keys[1],to]],result,
                    preamble:polite ? span(0,v).replace(/,\s*$/u,'') : undefined,
                    unread:explained ? span(0,v-1) : undefined});
                  results.set(reading.sop,reading);
                }
              }
            }
          }
        }
      }
    }
    return [...results.values()];
  };
}
