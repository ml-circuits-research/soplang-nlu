import { analyse, morphOf } from './knowledge.mjs';
import { tokens } from './lexicon.mjs';

const morphology = {
  cls:'w.lang.en.class', ending:'w.lang.en.ending', irregular:'w.lang.en.irregular_form',
  fold:'w.lang.en.fold', split:'w.lang.en.split', template:'w.lang.en.template', vowel:'w.lang.en.vowel',
};
export const affectedMorphologyTypes = [morphology.cls,morphology.ending,morphology.irregular];

export function createAffectedParticiples(facts) {
  const compiled = morphOf({ofType:type=>affectedMorphologyTypes.includes(type) ? facts(type) : []}, {types:morphology});
  const cache = new Map();
  return form => {
    if (!cache.has(form)) {
      const readings = analyse(compiled,form).filter(row=>row.exact && row.features.vform==='past_participle');
      cache.set(form,[...new Set(readings.map(row=>row.lemma))]);
    }
    return cache.get(form);
  };
}

const encode = value=>JSON.stringify(value);
const words = /^[\p{L}\p{M}\p{N}_]+$/u;
const terminal = /^[.!]$/u;
const determiners = new Set(['definite','demonstrative','possessive']);

function writtenName(ts,start,end,quotes,worlds) {
  if (start>=end) return;
  const quoted = quotes.find(q=>q.start===ts[start][2] && q.end===ts[end-1][3]);
  if (quoted && /[\p{L}\p{N}]/u.test(quoted.value)) return quoted.value;
  const literals = ts.slice(start,end).map(([,literal])=>literal);
  if (literals.every(literal=>/^\p{Lu}[\p{L}\p{M}\p{N}_]*$/u.test(literal))) {
    const name = literals.join(' ');
    if (!worlds.isReference(name)) return name;
  }
}

function sourceRole(act,first,stop,phrase,span,worlds) {
  if (first===stop) return {bindings:[]};
  for (let i=stop-1;i>first;i--) {
    if (!worlds.lookup(phrase(first,i)).some(([role,licensed,kind])=>
      role==='marker' && licensed===act && kind==='source')) continue;
    const marker = phrase(first,i);
    const bindings = (worlds.affectedTargetSources ?? []).filter(binding=>{
      if (binding.act!==act || binding.marker!==marker) return false;
      const keys = worlds.requestKeys.filter(key=>key.family===binding.family && key.name===binding.attribute);
      if (!keys.length || keys.some(key=>key.head!=='span' || key.values.length)) return false;
      const keywordStart = stop-tokens(binding.keyword).length;
      return keywordStart>=i && phrase(keywordStart,stop)===binding.keyword &&
        (keywordStart===i || determiners.has(worlds.determiners[phrase(i,keywordStart)]));
    });
    return {bindings,raw:span(first,stop),value:span(i,stop)};
  }
}

function targetsFor(act,first,last,phrase,span,ts,quotes,worlds,bindings) {
  let start = first, determiner;
  for (let i=last-1;i>first;i--) {
    const kind = worlds.determiners[phrase(first,i)];
    if (!determiners.has(kind)) continue;
    start=i;
    determiner=kind;
    break;
  }
  for (let head=start;head<last;head++) {
    const noun = phrase(head,last);
    const name = head>start && writtenName(ts,start,head,quotes,worlds);
    if (head>start && !name) continue;
    const targets = worlds.lookup(noun).filter(([role,licensed,,mode])=>
      role==='target' && licensed===act && mode==='existing');
    if (targets.length) return targets.map(([, ,family,,sort])=>({
      family,determiner,sort,description:name ? undefined : span(first,last),
      name:name || undefined,noun:span(head,last),
    }));
  }
  const name = writtenName(ts,start,last,quotes,worlds);
  return name ? bindings.map(({family})=>
    ({family,name,determiner:determiner ?? 'definite'})) : [];
}

function request(text,lead,head,act,target,source) {
  const {family,determiner,name,noun,sort,description} = target;
  const lines = [
    '@r1 w.request.request act='+encode(act)+' mood=do words='+encode(text)+' predicate='+encode(head),
    '@r1.t w.request.target request=$r1 family='+encode(family)+' mode=existing'+
      (determiner ? ' determiner='+encode(determiner) : '')+
      (name ? ' fill=written name='+encode(name) : ' fill=description description='+encode(description))+
      (noun ? ' family_words='+encode(noun) : '')+
      (sort ? ' sort='+encode(sort)+' sort_words='+encode(noun) : ''),
    '@f1 w.request.filler text='+encode(lead),
  ];
  if (!name) lines.push('@r1.l1 w.request.lookup request=$r1 target=$r1.t key=thing from=page');
  const sourceKeys = new Map(source.bindings.filter(binding=>binding.family===family)
    .map(binding=>[binding.attribute,binding]));
  const binding = sourceKeys.size===1 && [...sourceKeys.values()][0];
  if (source.raw) {
    if (binding) lines.push('@r1.source w.request.constraint request=$r1 on=place attribute='+
      encode(binding.attribute)+' key_words='+encode(binding.keyword)+' value='+encode(source.value)+
      ' words='+encode(source.raw)+' operator=eq phase=selector');
    else lines.push('@r1.u1 w.request.unread request=$r1 text='+encode(source.raw));
  }
  return {sop:lines.join('\n'),source:'affected-target',support:0,
    status:source.raw && !binding ? 'partial' : 'matched'};
}

export function affectedTargetCandidates(text,ts,quotes,worlds) {
  if (!worlds.affectedTargetLeads?.size || !worlds.affectedParticiples) return [];
  const visible = ts.map(([surface,,start,end])=>quotes.some(q=>start<q.end && q.start<end) ? '' : surface.replaceAll('’',"'"));
  const chars = Array.from(text);
  const span = (start,end)=>chars.slice(ts[start][2],ts[end-1][3]).join('');
  const phrase = (start,end)=>visible.slice(start,end).join(' ');
  let stop = ts.length;
  while (terminal.test(visible[stop-1] ?? '')) stop--;
  let first = 0;
  for (let i=1;i<stop-1;i++) if (worlds.affectedTargetLeads.has(phrase(0,i))) first=i;
  if (!first) return [];
  for (let i=first;i<stop;i++) {
    if (/[!?;:]/u.test(visible[i])) return [];
    for (let j=i+1;j<=Math.min(stop,i+5);j++) {
      const key = phrase(i,j);
      if (worlds.negatives.has(key) || worlds.scopeGrammar.negatives.has(key) ||
          worlds.scopeGrammar.conditionals.has(key) ||
          ['sequence','contrast','clause','coordination'].includes(worlds.joiners[key])) return [];
      if ([...worlds.scopeGrammar.endings].some(ending=>visible.slice(i,j).join('').endsWith(ending))) return [];
    }
  }

  const candidates = new Map();
  for (let i=first+1;i<stop;i++) {
    if (!words.test(visible[i])) continue;
    for (const lemma of worlds.affectedParticiples(visible[i])) {
      for (let end=i+1;end<=Math.min(stop,i+5);end++) {
        const predicate = [lemma,...visible.slice(i+1,end)].join(' ');
        if (!visible.slice(i,end).every(token=>words.test(token))) break;
        for (const [role,act,mood] of worlds.lookup(predicate)) {
          if (role!=='act' || mood && mood!=='do') continue;
          const source = sourceRole(act,end,stop,phrase,span,worlds);
          if (!source) continue;
          for (const target of targetsFor(act,first,i,phrase,span,ts,quotes,worlds,source.bindings)) {
            if (!worlds.literalGrammar.licenses(target.family,act)) continue;
            const candidate = request(text,span(0,first),span(i,end),act,target,source);
            candidates.set(candidate.sop,candidate);
          }
        }
      }
    }
  }
  return [...candidates.values()];
}
