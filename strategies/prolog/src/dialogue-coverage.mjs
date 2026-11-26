import { tokens } from './lexicon.mjs';
import { quotedSpans } from './literal-roles.mjs';

const decode = item => item?.startsWith('"') ? JSON.parse(item) : item;
const values = (wire,key) => (wire.attrs[key] ?? []).map(decode);
const one = (wire,key) => values(wire,key)[0];
const terms = text => tokens(text.replaceAll('’',"'")).map(([key])=>key);
const form = text => terms(text).join(' ');
const separator = /^[,;.!—–]$/u;
const lexical = /^[\p{L}\p{M}\p{N}]+$/u;

export function compileDialogueCoverage(facts) {
  const acts = new Set(facts('k.actions.act').filter(wire=>one(wire,'class')==='dialogue')
    .map(wire=>one(wire,'name')));
  const parts = facts('w.lang.en.part');
  const social = new Set();
  for (const frame of facts('w.lang.en.frame')) {
    const name=one(frame,'name');
    if (!acts.has(one(frame,'act')) || frame.attrs.role) continue;
    const required=parts.filter(part=>one(part,'frame')===name && one(part,'optional')!=='yes');
    if (required.length!==1 || one(required[0],'is')!=='word') continue;
    for (const word of values(required[0],'word')) social.add(form(word));
  }
  const reactions = new Map();
  for (const wire of facts('w.lang.en.cue')) {
    if (one(wire,'on')!=='reaction') continue;
    const value=one(wire,'value');
    for (const lead of values(wire,'lead')) {
      const phrase=form(lead), senses=reactions.get(phrase) ?? new Set();
      senses.add(value);
      reactions.set(phrase,senses);
    }
  }
  const evaluations = new Set([...reactions].filter(([,senses])=>senses.size===1 && senses.has('thanks'))
    .map(([phrase])=>phrase));
  const answers = new Set(facts('w.lang.en.answer').flatMap(wire=>values(wire,'text').map(form)));
  const interjections = new Set(facts('w.lang.en.closed').filter(wire=>one(wire,'class')==='interjection')
    .flatMap(wire=>values(wire,'text').map(form))
    .filter(phrase=>!reactions.has(phrase) && !answers.has(phrase)));
  const pronouns=facts('w.lang.en.pron');
  const pronounForms=predicate=>new Set(pronouns.filter(predicate).flatMap(wire=>values(wire,'text').map(form)));
  const self=pronounForms(wire=>one(wire,'person')==='1' && one(wire,'number')==='sg' &&
    values(wire,'case').includes('subject'));
  const demonstratives=pronounForms(wire=>one(wire,'number')==='sg' && values(wire,'case').includes('demonstrative'));
  const objects=pronounForms(wire=>values(wire,'case').includes('object') && values(wire,'refers').includes('thing'));
  const accompaniment=new Set(facts('w.lang.en.prep').filter(wire=>values(wire,'role').includes('accompaniment'))
    .flatMap(wire=>values(wire,'text').map(form)));
  const feelings=new Set(facts('k.feelings.feeling').filter(wire=>one(wire,'tone')==='pleasant')
    .map(wire=>form(one(wire,'name'))));
  const contractions=facts('w.lang.en.contraction').flatMap(wire=>values(wire,'text').flatMap(surface=>
    values(wire,'expands').map(expansion=>[surface,terms(expansion)])))
    .filter(([,words])=>words.length===2 && (self.has(words[0]) || demonstratives.has(words[0])));
  return {social,evaluations,interjections,self,demonstratives,objects,accompaniment,feelings,contractions};
}

export function createDialogueCoverage(worlds) {
  const grammar=worlds.dialogueCoverage;
  if (!grammar?.social.size) return ()=>undefined;
  const contractions=grammar.contractions.filter(([,words])=>worlds.scopeGrammar.copulas.has(words[1]));
  const expanded=new Map(contractions.map(([surface,words])=>[form(surface),words]));
  const social=grammar.social, evaluations=grammar.evaluations;
  const heads=new Map();
  const index=(phrase,value)=>{
    const words=phrase.split(' '), records=heads.get(words[0]) ?? [];
    records.push({words,value});
    heads.set(words[0],records);
  };
  for (const phrase of social) index(phrase,'social');
  for (const phrase of evaluations) index(phrase,'companion');
  for (const phrase of grammar.interjections) index(phrase,'companion');
  for (const [phrase,words] of expanded) index(phrase,words);
  for (const subject of [...grammar.self,...grammar.demonstratives]) for (const copula of worlds.scopeGrammar.copulas) {
    index(subject+' '+copula,[subject,copula]);
  }
  const tokensMatch=(input,at,words)=>words.every((word,i)=>input[at+i]===word);

  return text=>{
    const input=terms(text);
    if (!input.length || input.length>36 || !heads.has(input[0]) || quotedSpans(text).length ||
        input.some(word=>!lexical.test(word) && !separator.test(word) && word!=="'")) return;
    // Require each content token to participate in a declared dialogue atom
    // and at least one independent social act. A reply or feeling alone can
    // carry substantive information about a pending question or selection.
    const paths=new Map([[0,false]]);
    const note=(end,social)=>paths.set(end,Boolean(paths.get(end) || social));
    for (let at=0;at<input.length;at++) {
      if (!paths.has(at)) continue;
      const anchored=paths.get(at);
      if (separator.test(input[at])) {
        note(at+1,anchored);
        continue;
      }
      for (const {words,value} of heads.get(input[at]) ?? []) {
        if (!tokensMatch(input,at,words)) continue;
        const end=at+words.length;
        if (value==='social' || value==='companion') {
          note(end,anchored || value==='social');
          continue;
        }
        const [subject]=value;
        if (grammar.demonstratives.has(subject)) {
          const tail=input[end];
          if (worlds.scopeGrammar.universals.has(tail)) note(end+1,anchored);
          for (let length=1;length<=Math.min(5,input.length-end);length++) {
            if (evaluations.has(input.slice(end,end+length).join(' '))) note(end+length,anchored);
          }
        } else if (grammar.self.has(subject) && grammar.feelings.has(input[end])) {
          note(end+1,anchored);
          if (grammar.accompaniment.has(input[end+1]) && grammar.objects.has(input[end+2])) note(end+3,anchored);
        }
      }
    }
    if (paths.get(input.length)) return {sop:'@f w.request.filler text='+JSON.stringify(text),source:'dialogue-coverage'};
  };
}
