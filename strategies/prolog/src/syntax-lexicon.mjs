const wordPattern = /[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*|[^\s]/gu;
export const lexicalTokens = text => [...text.matchAll(wordPattern)];
const key = text => lexicalTokens(text).map(([token])=>token.toLowerCase()).join(' ');
const decode = raw => raw?.startsWith('"') ? JSON.parse(raw) : raw;
const values = (wire,slot) => (wire.attrs[slot] ?? []).map(decode);

export function syntaxLexicon(facts,senses) {
  const forms = new Map(), cache = new Map();
  function add(surface,slot,value) {
    if (!surface || !value) return;
    const spelling = key(surface);
    const form = forms.get(spelling) ?? {};
    (form[slot] ??= new Set()).add(value);
    forms.set(spelling,form);
  }
  const words = (type,slot,feature) => {
    for (const wire of facts(type)) for (const surface of values(wire,'text')) {
      for (const value of feature(wire)) add(surface,slot,value);
    }
  };
  words('w.lang.en.closed','pos',wire=>values(wire,'class'));
  words('w.lang.en.skip','cues',wire=>values(wire,'class'));
  words('w.lang.en.det','pos',()=>['determiner']);
  words('w.lang.en.pron','pos',()=>['pronoun']);
  words('w.lang.en.pron','pronoun',wire=>values(wire,'case'));
  words('w.lang.en.aux','auxiliary',()=>['auxiliary']);
  words('w.lang.en.copula','copula',()=>['copula']);
  words('w.lang.en.wh','question',wire=>values(wire,'asks'));
  for (const wire of facts('w.lang.en.neg')) for (const surface of values(wire,'text')) {
    if (['not','never','cannot'].includes(surface)) add(surface,'negation','negative');
  }
  words('w.lang.en.neg.imperative','negation',()=>['negative']);
  words('w.lang.en.joiner','joiner',wire=>values(wire,'kind'));
  words('w.lang.en.prep','preposition',wire=>values(wire,'rel'));
  for (const wire of facts('w.lang.en.cue').filter(wire=>values(wire,'on').includes('place'))) {
    for (const lead of values(wire,'lead')) for (const relation of values(wire,'relation')) add(lead,'preposition',relation);
  }

  return surface=>{
    if (cache.has(surface)) return cache.get(surface);
    const form = Object.fromEntries(Object.entries(forms.get(surface) ?? {}).map(([slot,bank])=>[slot,[...bank]]));
    const lexical = senses(surface).flatMap(wire=>values(wire,'pos'));
    if (lexical.length || form.pos) form.pos = [...new Set([...(form.pos ?? []),...lexical])];
    cache.set(surface,form);
    return form;
  };
}
