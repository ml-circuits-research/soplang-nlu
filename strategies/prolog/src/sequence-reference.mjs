import { parse, serialize } from './knowledge.mjs';
import { literalRanges } from './evidence.mjs';
import { tokens } from './lexicon.mjs';
import { quotedSpans } from './literal-roles.mjs';
import { consumeUnread } from './nominal-evidence.mjs';
import { declaresArgumentRoles } from './sentence-requests.mjs';

const type=name=>'w.request.'+name;
const field=(wire,key)=>{
  const raw=wire?.attrs[key]?.[0];
  return raw?.startsWith('"') ? JSON.parse(raw) : raw;
};
const forms=text=>tokens(text).map(t=>t[0]).join(' ');
const operations=new Set(['change','place','remove','pick']);
const liveActions=new Set(['make','change','place','pick']);
const terminal=/^[,;.?!]+$/u;

export function sequenceObjectPronouns(facts) {
  const values=(wire,key)=>(wire.attrs[key] ?? []).map(raw=>raw.startsWith('"') ? JSON.parse(raw) : raw);
  const items=new Map();
  for (const wire of facts('w.lang.en.pron')) {
    const roles=values(wire,'case'), purposes=values(wire,'in'), refers=values(wire,'refers');
    const number=values(wire,'number')[0];
    const kind=roles.includes('locative') && refers.includes('place') && purposes.includes('acts') ? 'place' :
      roles.includes('object') && purposes.includes('continuation') && refers.includes('thing') &&
      values(wire,'person').includes('3') && ['sg','pl'].includes(number) ? number : undefined;
    if (!kind) continue;
    for (const surface of values(wire,'text').map(forms).filter(Boolean)) {
      items.set(surface,items.has(surface) && items.get(surface)!==kind ? null : kind);
    }
  }
  return items;
}

export function sequenceFreshQualifiers(facts) {
  return new Set(facts('pro.reader.fresh_reference').flatMap(wire=>
    (wire.attrs.text ?? []).map(raw=>forms(raw.startsWith('"') ? JSON.parse(raw) : raw))));
}

function interval(text,phrase) {
  const positions=literalRanges(text,phrase);
  return positions.length===1 ? positions[0] : undefined;
}

function connective(text,worlds) {
  const keys=tokens(text).map(t=>t[0]);
  return keys.length>0 && keys.some(key=>worlds.joiners[key] && worlds.joiners[key]!=='list-or-clause') &&
    keys.every(key=>terminal.test(key) || ['sequence','clause','coordination'].includes(worlds.joiners[key]));
}

function ownedNumber(text,target,worlds) {
  const count=field(target,'count'), ids=target.attrs.ids?.length;
  if (count!==undefined || ids) {
    const amount=Number(count ?? ids);
    return Number.isInteger(amount) && amount>0 ? amount===1 ? 'sg' : 'pl' : undefined;
  }
  const number=worlds.nominalNumbers.get(forms(field(target,'count_words') ?? ''));
  if (number?.kind==='cardinal') return Number(number.value)>1 ? 'pl' : number.value==='1' ? 'sg' : undefined;
  if (field(target,'name') || field(target,'code_words')) return 'sg';
  const head=field(target,'sort_words') ?? field(target,'family_words') ?? field(target,'sort');
  if (!head || ['quantified','possessive'].includes(field(target,'determiner'))) return;
  const occurrence=interval(text,head);
  if (!occurrence) return;
  // Require a written singular article. An uncounted noun can be plural.
  const prefix=tokens(text.slice(0,occurrence[0])).map(t=>t[0]);
  for (const token of prefix.reverse()) {
    if (terminal.test(token) || worlds.joiners[token]) break;
    if (worlds.determiners[token]) return worlds.singularArticles.has(token) ? 'sg' : undefined;
  }
}

function objectPronoun(scope,request,worlds,reference) {
  const predicate=field(request,'predicate');
  if (!predicate) return;
  const hit=interval(scope,predicate);
  if (!hit) return;
  const quoteRanges=quotedSpans(scope), chars=Array.from(scope), ts=tokens(scope);
  const point=i=>chars.slice(0,i).join('').length;
  if (quoteRanges.some(q=>point(q.start)<hit[1] && point(q.end)>hit[0])) return;
  const intro=scope.slice(0,hit[0]);
  const lead=forms(intro);
  if (lead && !connective(intro,worlds) && !worlds.literalGrammar.leads.has(lead) &&
      !worlds.fillerPhrases.has(lead)) return;
  if (reference) {
    const where=interval(scope,reference);
    const number=worlds.sequenceObjectPronouns.get(forms(reference));
    if (where && ['sg','pl'].includes(number) && where[0]>hit[0] && where[1]<hit[1]) {
      const [start,stop]=where;
      const before=forms(scope.slice(hit[0],start));
      const after=forms(scope.slice(stop,hit[1]));
      const acts=worlds.referenceCommands.verbs.get(JSON.stringify([before,after]));
      if (acts?.has(field(request,'act'))) {
        return {raw:reference,start,stop,number,intro,predicate:before+' '+after};
      }
    }
  }
  const pos=ts.findIndex(([, ,start])=>point(start)>=hit[1]);
  if (pos<0) return;
  const options=[];
  for (let end=pos+1;end<=Math.min(pos+5,ts.length);end++) {
    const start=point(ts[pos][2]), stop=point(ts[end-1][3]);
    if (!/^\s*$/u.test(scope.slice(hit[1],start)) ||
        quoteRanges.some(q=>point(q.start)<stop && point(q.end)>start)) continue;
    const raw=scope.slice(start,stop), number=worlds.sequenceObjectPronouns.get(forms(raw));
    if (['sg','pl'].includes(number)) options.push({start,stop,end,raw,number,intro,predicate,ts});
  }
  return options.length===1 ? options[0] : undefined;
}

function freshTarget(scope,request,target,source,priorText,worlds) {
  if (!target || field(target,'mode')!=='existing' || field(source,'mode')!=='new' ||
      field(target,'family')!==field(source,'family') ||
      ['name','ids','count','count_words','quantity','ordinal','quantifier'].some(key=>target.attrs[key])) return;
  const description=field(target,'description'), predicate=field(request,'predicate');
  const words=description && interval(scope,description), verb=predicate && interval(scope,predicate);
  if (!words || !verb || words[0]<verb[1] || scope.slice(verb[1],words[0]).trim()) return;
  const intro=scope.slice(0,verb[0]), lead=forms(intro);
  if (lead && !connective(intro,worlds) && !worlds.literalGrammar.leads.has(lead) && !worlds.fillerPhrases.has(lead)) return;
  const from=Array.from(scope.slice(0,words[0])).length, to=Array.from(scope.slice(0,words[1])).length;
  if (quotedSpans(scope).some(span=>span.start<to && span.end>from)) return;
  const [article,...nominal]=forms(description).split(' ');
  if (worlds.determiners[article]!=='definite') return;
  const head=[field(target,'family_words'),field(target,'sort_words'),field(target,'sort')]
    .filter(Boolean).map(forms).find(value=>nominal.join(' ').endsWith(' '+value) &&
      worlds.sequenceFreshQualifiers.has(nominal.join(' ').slice(0,-value.length-1)));
  const kind=field(source,'sort'), targetKind=field(target,'sort');
  if (!head || kind && targetKind && forms(kind)!==forms(targetKind) ||
      kind && !targetKind && forms(kind)!==head) return;
  const number=ownedNumber(priorText,source,worlds);
  if (number==='pl' || number!=='sg' && (kind || field(source,'determiner')==='quantified' ||
      ['count','count_words','quantity','quantifier'].some(key=>source.attrs[key]))) return;
  return {raw:description,start:words[0],stop:words[1],predicate,intro,number:'sg'};
}

function localEffects(wires,request) {
  return wires.filter(w=>w.type===type('constraint') && field(w,'request')==='$'+request.id);
}

function preservation(effects,family,worlds) {
  return effects.some(effect=>worlds.preservationBindings.some(binding=>binding.family===family &&
    binding.attribute===field(effect,'attribute')) && field(effect,'phase')==='result' &&
    field(effect,'value')==='place');
}

function hasPlacement(effects,family,worlds) {
  return worlds.spatialBindings.some(({family:owner,relationKey,anchorKey,regionKey})=>owner===family &&
    effects.some(effect=>field(effect,'phase')==='result' && (
      field(effect,'attribute')===regionKey && field(effect,'operator')==='region' && field(effect,'value') ||
      field(effect,'attribute')===relationKey && field(effect,'operator')==='relation' &&
        effects.some(anchor=>field(anchor,'attribute')===anchorKey && field(anchor,'phase')==='selector' &&
          field(anchor,'value') && !worlds.isReference(field(anchor,'value'))))));
}

export function sequenceReferenceReadings(text,candidate,worlds,permit) {
  if (!candidate.sop || !worlds.sequenceObjectPronouns?.size) return [];
  let wires=parse(candidate.sop);
  const requests=wires.filter(w=>w.type===type('request'));
  if (requests.length<2) return [];
  const scopes=requests.map(request=>{
    const scope=field(request,'words');
    return {request,scope,where:scope && interval(text,scope)};
  });
  if (scopes.some(({where},i)=>!where || (i>0 && scopes[i-1].where[1]>where[0]))) return [];
  const ids=new Set(wires.map(w=>w.id));
  let changed=false;
  const bound=new Map();
  for (let i=1;i<scopes.length;i++) {
    const {request:prior,scope:priorText,where:priorAt}=scopes[i-1];
    const {request,scope,where}=scopes[i];
    if ([prior,request].some(w=>['ask','check'].includes(field(w,'mood')) || w.attrs.polarity) ||
        !operations.has(field(request,'act')) || !permit(priorText,quotedSpans(priorText)) ||
        !permit(scope,quotedSpans(scope))) continue;
    const targets=request=>wires.filter(w=>w.type===type('target') && field(w,'request')==='$'+request.id);
    const earlier=targets(prior), later=targets(request);
    if (earlier.length!==1 || later.length>1) continue;
    const [source]=earlier,[target]=later, family=field(source,'family');
    if (!family || !worlds.literalGrammar.licenses(family,field(request,'act'))) continue;
    const priorAct=field(prior,'act');
    const creates=priorAct==='make' || field(source,'mode')==='new' &&
      declaresArgumentRoles(worlds,priorAct,source,localEffects(wires,prior));
    const unresolvedLookups=wires.filter(wire=>wire.type===type('lookup') &&
      field(wire,'request')==='$'+request.id && field(wire,'key')==='thing' && field(wire,'words') &&
      !wire.attrs.target && !wire.attrs.constraint && !wire.attrs.from && !wire.attrs.antecedent);
    const referenceWords=unresolvedLookups.length===1 ? field(unresolvedLookups[0],'words') : undefined;
    const fresh=creates ? freshTarget(scope,request,target,source,priorText,worlds) : undefined;
    const pronoun=fresh ?? objectPronoun(scope,request,worlds,referenceWords);
    if (!pronoun || !fresh && !liveActions.has(field(prior,'act'))) continue;
    const gap=text.slice(priorAt[1],where[0]);
    if (!connective(gap,worlds) && !(/^\s*[,;.?!]*\s*$/u.test(gap) &&
        connective(pronoun.intro,worlds))) continue;
    const previousMode=field(source,'mode');
    if (previousMode!=='bound' && !['new','existing'].includes(previousMode) ||
        previousMode==='existing' && !['written','description'].includes(field(source,'fill'))) continue;
    const number=fresh?.number ?? bound.get(source.id) ?? ownedNumber(priorText,source,worlds);
    if (number!==pronoun.number) continue;
    const effects=localEffects(wires,request);
    const act=field(request,'act');
    const explicit=worlds.lookup(forms(pronoun.predicate)).some(([role,sense,mood])=>
      role==='act' && sense===act && (!mood || mood==='do'));
    const preserve=preservation(effects,family,worlds);
    if (!explicit && !preserve) continue;
    const locative=pronoun.ts?.slice(pronoun.end).some(([token])=>worlds.sequenceObjectPronouns.get(token)==='place');
    if (locative && preserve && !hasPlacement(localEffects(wires,prior),family,worlds)) continue;
    if (effects.some(w=>w.attrs.want ||
      !worlds.requestKeys.some(key=>key.family===family && key.name===field(w,'attribute')) ||
      field(w,'phase')==='selector' && !worlds.spatialBindings.some(binding=>binding.family===family &&
        binding.anchorKey===field(w,'attribute')))) continue;
    const textual=target && [field(target,'family_words'),field(target,'description')].filter(Boolean);
    if (target && !fresh && (field(target,'mode')!=='existing' || field(target,'family')!==family ||
        ['name','sort','sort_words','ids','count','count_words','ordinal','quantity'].some(key=>target.attrs[key]) ||
        textual.some(value=>forms(value)!==forms(pronoun.raw)))) continue;
    if (!target && field(request,'refers')!=='thing') continue;
    const reference='$'+request.id;
    let id=target?.id ?? request.id+'.bound';
    while (!target && ids.has(id)) id+='_';
    const replaced={id,type:type('target'),attrs:{request:[reference],family:[JSON.stringify(family)],
      mode:['bound'],family_words:[JSON.stringify(pronoun.raw)]}};
    const oldLookups=wires.filter(w=>w.type===type('lookup') && (field(w,'target')==='$'+id ||
      referenceWords===pronoun.raw && w===unresolvedLookups[0]));
    if (oldLookups.some(w=>field(w,'request')!==reference || field(w,'key')!=='thing' ||
        !['page','any',undefined].includes(field(w,'from')))) continue;
    if (wires.some(w=>!oldLookups.includes(w) && Object.values(w.attrs).flat().some(raw=>
      oldLookups.some(lookup=>raw==='$'+lookup.id)))) continue;
    const kept=wires.flatMap(w=>w===target ? [replaced] : oldLookups.includes(w) ? [] : [w]);
    if (!target) kept.push(replaced);
    wires=consumeUnread(kept,text,where[0]+pronoun.start,where[0]+pronoun.stop);
    ids.add(id);
    bound.set(id,number);
    changed=true;
  }
  return changed ? [{sop:serialize(wires),source:'sequence-reference',
    status:wires.some(w=>w.type===type('unread')) ? 'partial' : 'matched'}] : [];
}
