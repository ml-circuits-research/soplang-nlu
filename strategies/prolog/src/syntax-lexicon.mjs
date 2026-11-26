// Keep clock values and decimals whole in the spans passed to the SWI grammar.
const wordPattern = /[0-9]{4}-[0-9]{2}-[0-9]{2}(?![\p{L}\p{M}\p{N}_])|[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?(?![\p{L}\p{M}\p{N}_])|[+-]?(?:[0-9]+\.[0-9]+|\.[0-9]+)(?![\p{L}\p{M}\p{N}_])|[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*|[^\s]/gu;
export const lexicalTokens = text => [...text.matchAll(wordPattern)];
const key = text => lexicalTokens(text).map(([token])=>token.toLowerCase()).join(' ');
const clausalClasses = new Set(['verb.cognition','verb.communication','verb.perception']);
const decode = raw => raw?.startsWith('"') ? JSON.parse(raw) : raw;
const values = (wire,slot) => (wire.attrs[slot] ?? []).map(decode);

export function syntaxLexicon(facts,senses,verbFrames) {
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
  words('w.lang.en.closed','adverb',wire=>values(wire,'class').includes('adverb') ? ['adverb'] : []);
  words('w.lang.en.closed','joiner',wire=>values(wire,'from').includes('w.lang.en.choice') ? ['disjunctive'] : []);
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
  words('w.lang.en.prep.time','preposition',wire=>values(wire,'rel'));
  words('k.values.comparative','comparative',wire=>values(wire,'degree').includes('comparative') ? ['comparative'] : []);
  for (const wire of facts('w.lang.en.irregular_form')) {
    const [form]=values(wire,'form'), [vform]=values(wire,'vform');
    if (vform) {
      add(form,'pos','verb');
      const [lemma]=values(wire,'lemma');
      add(form,'lemma',lemma);
    }
    if (vform==='past_participle') add(form,'participle','participle');
  }
  for (const wire of facts('k.actions.action')) for (const surface of values(wire,'name')) {
    if (surface.includes(' ')) add(surface,'action','action');
  }
  add('than','preposition','than');
  for (const wire of facts('w.lang.en.cue').filter(wire=>values(wire,'on').includes('place'))) {
    for (const lead of values(wire,'lead')) for (const relation of values(wire,'relation')) add(lead,'preposition',relation);
  }

  return surface=>{
    if (cache.has(surface)) return cache.get(surface);
    const form = Object.fromEntries(Object.entries(forms.get(surface) ?? {}).map(([slot,bank])=>[slot,[...bank]]));
    const entries=senses(surface);
    const lexical = entries.flatMap(wire=>values(wire,'pos'));
    if (entries.some(wire=>values(wire,'supersense').some(sense=>clausalClasses.has(sense)))) {
      form.clauseTaker=['clauseTaker'];
    }
    const combined = new Set([...(form.pos ?? []),...lexical]);
    const lemmas = new Set([surface,...(form.lemma ?? [])]);
    if (/^\p{L}{3,}$/u.test(surface)) {
      const readStems = (stems, allowed) => [...new Set(stems.filter(Boolean)
        .flatMap(stem=>senses(stem).flatMap(wire=>values(wire,'pos'))))].filter(pos=>allowed.includes(pos));
      if (surface.endsWith('s') && (!combined.has('noun') || !combined.has('verb'))) {
        const stems = [surface.slice(0,-1)];
        if (surface.endsWith('es')) stems.push(surface.slice(0,-2));
        if (surface.endsWith('ies')) stems.push(surface.slice(0,-3)+'y');
        for (const pos of readStems(stems,['noun','verb'])) combined.add(pos);
        for (const stem of stems) lemmas.add(stem);
      }
      if (surface.endsWith('ed') && !form.participle) {
        const stem=surface.slice(0,-2);
        const stems=[stem,surface.slice(0,-1)];
        if (stem.at(-1)===stem.at(-2)) stems.push(stem.slice(0,-1));
        for (const candidate of stems) lemmas.add(candidate);
        if (readStems(stems,['verb']).length) {
          combined.add('verb');
          form.participle=['participle'];
        }
      }
    }
    if (surface.endsWith('ing') && surface.length>4) {
      const stem=surface.slice(0,-3);
      lemmas.add(stem);
      lemmas.add(stem+'e');
      if (stem.at(-1)===stem.at(-2)) lemmas.add(stem.slice(0,-1));
    }
    const exact=verbFrames.get(surface);
    form.frames=exact ? [...exact] : [...new Set([...lemmas].flatMap(lemma=>[...(verbFrames.get(lemma) ?? [])]))];
    form.base=Boolean(exact);
    if (form.comparative) combined.add('adjective');
    if (combined.size) form.pos = [...combined];
    cache.set(surface,form);
    return form;
  };
}
