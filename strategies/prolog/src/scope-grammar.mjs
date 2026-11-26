import { tokens } from './lexicon.mjs';

const decode=value=>value?.startsWith('"') ? JSON.parse(value) : value;
const all=(wire,key)=>(wire.attrs[key] ?? []).map(decode);
const one=(wire,key)=>all(wire,key)[0];
const phrase=text=>tokens(text).map(token=>token[0]).join(' ');

export function scopeGrammar(facts) {
  const conditionals=new Map();
  const choices=new Set(facts('w.lang.en.closed')
    .filter(w=>all(w,'from').includes('w.lang.en.choice')).flatMap(w=>all(w,'text').map(phrase)));
  const questions=new Map(), setCounts=new Map(), collectionQuestions=new Map();
  const auxiliary=new Set(), modals=new Set(), copulas=new Set(), plainImperatives=new Set();
  const subjects=new Set(), addressees=new Set(), existentialSubjects=new Set(), singularReferents=new Set();
  const presentSingularCopulas=new Set(), predicateNegators=new Set();
  const courtesy=new Set(), negatives=new Set(), proposals=new Set(), rejections=new Set(), removals=new Set();
  const courtesyLeads=new Set(), universals=new Set(), countedUniversals=new Set();
  for (const wire of facts('w.lang.en.joiner')) {
    if (one(wire,'kind')==='condition') for (const text of all(wire,'text')) conditionals.set(phrase(text),'positive');
  }
  for (const wire of facts('w.lang.en.copula')) {
    if (wire.attrs.number) for (const text of all(wire,'text')) copulas.add(phrase(text));
  }
  for (const wire of facts('w.lang.en.aux')) {
    for (const text of all(wire,'text')) {
      const surface=phrase(text);
      auxiliary.add(surface);
      if (copulas.has(surface) && one(wire,'tense')==='present' && one(wire,'number')==='sg') {
        presentSingularCopulas.add(surface);
      }
      if (wire.attrs.modal) modals.add(surface);
      if (wire.attrs.support && !wire.attrs.number && one(wire,'tense')!=='past') {
        plainImperatives.add(surface);
      }
    }
  }
  for (const wire of facts('w.lang.en.pron')) {
    const cases=all(wire,'case');
    for (const text of all(wire,'text')) {
      const surface=phrase(text);
      if (cases.some(value=>['subject','demonstrative','locative'].includes(value))) subjects.add(surface);
      if (one(wire,'person')==='2' || (one(wire,'person')==='1' && one(wire,'number')==='pl' && cases.includes('subject'))) {
        addressees.add(surface);
      }
      if (cases.includes('locative')) existentialSubjects.add(surface);
      if (cases.includes('subject') && one(wire,'number')==='sg' && all(wire,'refers').includes('thing')) singularReferents.add(surface);
    }
  }
  const questionKinds=new Map(facts('pro.reader.question_kind').map(wire=>[one(wire,'asks'),one(wire,'question')]));
  for (const wire of facts('w.lang.en.wh')) {
    const type=questionKinds.get(one(wire,'asks'));
    if (type) for (const text of all(wire,'text')) questions.set(phrase(text),{type});
  }
  for (const wire of facts('pro.reader.set_count')) {
    const scopes=new Set(all(wire,'scope_lead').map(phrase));
    const closers=new Set(all(wire,'closer').map(phrase));
    const neutralTails=new Set(all(wire,'neutral_tail').map(phrase));
    const scopedTails=new Set(all(wire,'scope_tail').map(phrase));
    const membership=new Set(all(wire,'membership').map(phrase));
    const genericNouns=new Set(all(wire,'generic_noun').map(phrase));
    for (const text of all(wire,'text')) {
      const surface=phrase(text);
      if (surface) setCounts.set(surface,{scopes,closers,neutralTails,scopedTails,membership,genericNouns});
    }
  }
  for (const wire of facts('pro.reader.collection_question')) {
    const form={
      question:one(wire,'question'),
      layout:one(wire,'layout'),
      markers:new Set(all(wire,'marker').map(phrase)),
      anchorTails:new Set(all(wire,'anchor_tail').map(phrase)),
      existentialDeterminers:new Set(all(wire,'existential_det').map(phrase)),
      requireQuestionMark:one(wire,'require_question_mark')==='true',
    };
    for (const text of all(wire,'text')) {
      const surface=phrase(text);
      if (surface && form.question && form.layout) collectionQuestions.set(surface,form);
    }
  }
  const vocabulary={auxiliary,modals,copulas,subjects,addressees,courtesy,courtesyLeads,universals,countedUniversals,negatives,proposals,rejections,removals,predicateNegators};
  for (const wire of facts('pro.reader.scope_cue')) {
    const kind=one(wire,'kind'), type=one(wire,'question');
    for (const text of all(wire,'text')) {
      const surface=phrase(text);
      if (kind==='condition') conditionals.set(surface,one(wire,'polarity') ?? 'positive');
      else if (kind==='question' && type) questions.set(surface,{type,requiresAsk:true});
      else if (Object.hasOwn(vocabulary,kind)) vocabulary[kind].add(surface);
    }
  }
  for (const form of copulas) auxiliary.add(form);
  const endings=new Set(facts('w.lang.en.neg').flatMap(wire=>all(wire,'ending')).map(text=>text.toLowerCase().replaceAll('’',"'")));
  return {
    conditionals, choices, questions, setCounts, collectionQuestions, auxiliary, modals, copulas, plainImperatives, subjects,
    addressees, existentialSubjects, singularReferents, courtesy, courtesyLeads, universals, countedUniversals,
    universalHeads:new Set([...universals].map(form=>form.split(" ")[0])), negatives, proposals, rejections, removals, presentSingularCopulas, predicateNegators, endings,
  };
}
