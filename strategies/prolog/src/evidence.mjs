// Literal offsets use JavaScript UTF-16 indices into the supplied utterance.
const word = /[\p{L}\p{M}\p{N}_]/u;
const words = /[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*/gu;
const decode = value => value.startsWith('"') ? JSON.parse(value) : value;
const normalized = text => text.toLowerCase().replaceAll('’',"'");
const lexemes = text => [...text.matchAll(words)].map(m=>normalized(m[0]));

export function evidenceVocabulary(facts) {
  const grammar = new Set(), filler = new Set(), endings = new Set(), sentenceAdditions=new Set();
  const values = (w,k)=>(w.attrs[k] ?? []).map(decode);
  const add = (set,w)=>values(w,'text').forEach(v=>set.add(normalized(v)));
  for (const w of facts('w.lang.en.closed')) {
    const [cls] = values(w,'class');
    if (['determiner','pronoun','preposition','conjunction','auxiliary','particle','adverb'].includes(cls)) add(grammar,w);
    if (cls === 'interjection') add(filler,w);
  }
  for (const w of facts('w.lang.en.skip'))
    add(['politeness','filler','desire'].includes(values(w,'class')[0]) ? filler : grammar,w);
  for (const w of facts('pro.reader.trailing_discourse')) add(filler,w);
  for (const w of facts('pro.reader.discourse_edge')) add(filler,w);
  for (const w of facts('pro.reader.body_lead')) if (values(w,'role').includes('action_opening')) add(filler,w);
  for (const w of facts('pro.reader.standing_position')) values(w,'wrapper').forEach(v=>filler.add(normalized(v)));
  for (const w of facts('w.lang.en.imperative.lead')) add(grammar,w);
  for (const w of facts('w.lang.en.neg.imperative')) add(grammar,w);
  for (const w of facts('w.lang.en.contraction.ending')) values(w,'ending').forEach(v=>endings.add(normalized(v)));
  for (const w of facts('w.lang.en.contraction'))
    if (values(w,'expands').some(v=>lexemes(v).every(t=>grammar.has(t)))) add(grammar,w);
  for (const w of facts('pro.reader.sentence_addition')) add(sentenceAdditions,w);
  return {grammar,filler,endings,sentenceAdditions};
}

function previousChar(text,end) {
  if (!end) return '';
  const last=text.charCodeAt(end-1);
  const width=last>=0xdc00 && last<=0xdfff && end>1 ? 2 : 1;
  return text.slice(end-width,end);
}

export function literalRanges(text,literal,from=0,to=text.length) {
  const hits=[];
  if (!literal) return hits;
  for (let i=from;i<=to-literal.length;) {
    const at=text.indexOf(literal,i), end=at+literal.length;
    if (at<0 || end>to) break;
    const before=previousChar(text,at);
    const after=end<text.length ? String.fromCodePoint(text.codePointAt(end)) : '';
    if (!(word.test(String.fromCodePoint(literal.codePointAt(0))) && word.test(before)) && !(word.test(previousChar(literal,literal.length)) && word.test(after))) hits.push([at,end]);
    i=at+1;
  }
  return hits;
}

// WebMeet permits an implicit sort to be written with different case or
// a regular English plural. Return the actual spelling and source offsets.
export function sortRanges(text,sort,start=0,end=text.length) {
  if (!sort) return [];
  const escaped=sort.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const re=new RegExp('(?<![\\p{L}\\p{M}\\p{N}_])'+escaped+'(?:es|s)?(?![\\p{L}\\p{M}\\p{N}_])','giu');
  return [...text.slice(start,end).matchAll(re)].map(m=>[start+m.index,start+m.index+m[0].length]);
}

export function catalogReference(vocabulary,wire,key,raw) {
  return raw.startsWith('$') && vocabulary?.referenceSlots?.get(wire.type)?.has(key);
}

export function literalField(key) {
  return key==='predicate' || key==='words' || key.endsWith('_words') || ['text','name','description','ids'].includes(key);
}

export function evidenceReport(text,wires,vocabulary) {
  const spans=[],missing=[],scopes=new Map();
  let next=0;
  for (const wire of wires.filter(w=>w.type==='w.request.request')) {
    const phrase=wire.attrs.words?.map(decode)[0];
    let bounds=[0,text.length];
    if (phrase) {
      const occurrences=literalRanges(text,phrase);
      const loc=occurrences.find(r=>r[0]>=next);
      if (loc) { bounds=loc; next=loc[1]; }
      else { bounds=[0,0]; missing.push({wire:wire.id,slot:'words',text:phrase}); }
    }
    scopes.set('$'+wire.id,bounds);
  }
  for (const wire of wires) {
    const scope=scopes.get(wire.type==='w.request.request' ? '$'+wire.id : wire.attrs.request?.[0]) ?? [0,text.length];
    const kind=wire.type==='w.request.filler' ? 'filler' : wire.type==='w.request.unread' ? 'unread' : 'grounded';
    for (const [slot,items] of Object.entries(wire.attrs)) {
      if (wire.type==='w.request.request' && slot==='words') continue;
      const fallback=wire.type==='w.request.constraint' && slot==='value' && !wire.attrs.words;
      const optional=wire.type==='w.request.target' && ['sort','ordinal'].includes(slot);
      if (!literalField(slot) && !fallback && !optional) continue;
      for (const item of items) {
        if (catalogReference(vocabulary,wire,slot,item)) continue;
        const phrase=decode(item);
        const ranges=optional && slot==='sort' ? sortRanges(text,phrase,...scope) : literalRanges(text,phrase,...scope);
        if (ranges.length) spans.push({wire:wire.id,slot,kind,text:phrase,ranges});
        else if (!optional || (slot==='sort' && !wire.attrs.sort_words)) missing.push({wire:wire.id,slot,text:phrase});
      }
    }
  }
  const bounds=[...scopes.values()];
  const sentenceConnector=span=>{
    if (!vocabulary.sentenceAdditions?.has(normalized(span.text))) return false;
    const [[start,end]]=span.ranges;
    return bounds.some(([,finish],i)=>{
      const after=bounds[i+1]?.[0];
      return after!==undefined && finish<=start && end<=after &&
        /^[\s,;]*$/u.test(text.slice(finish,start)) && /^\s*$/u.test(text.slice(end,after));
    });
  };
  const counts={},tokens=[];
  for (const match of text.matchAll(words)) {
    const start=match.index,end=start+match[0].length;
    const covering=spans.filter(s=>s.ranges.some(([a,b])=>a<=start && end<=b));
    const unique=covering.filter(s=>s.ranges.length===1);
    const term=normalized(match[0]),suffix=term.indexOf("'");
    const grammatical=vocabulary.grammar.has(term) || (suffix>0 && vocabulary.grammar.has(term.slice(0,suffix)) && vocabulary.endings.has(term.slice(suffix)));
    const validFiller=s=>vocabulary.filler.has(normalized(s.text)) ||
      vocabulary.filler.has(normalized(s.text.replace(/[.!。！]+$/u,''))) || vocabulary.filler.has(term) || grammatical || sentenceConnector(s);
    let status;
    if (unique.some(s=>s.kind==='grounded')) status='grounded';
    else if (unique.some(s=>s.kind==='unread')) status='unread';
    else if (unique.some(s=>s.kind==='filler' && validFiller(s))) status='filler';
    else if (covering.some(s=>s.ranges.length>1)) status='ambiguous_occurrence';
    else status=grammatical ? 'grammar' : 'uncovered';
    counts[status]=(counts[status] ?? 0)+1;
    tokens.push({text:match[0],start,end,status});
  }
  return {offsetUnit:'utf16',counts,tokens,spans,missing};
}
