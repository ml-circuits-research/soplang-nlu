import { literalRanges } from './evidence.mjs';
import { tokens } from './lexicon.mjs';
import { maskQuoted, quotedSpans } from './literal-roles.mjs';
import { parse, serialize } from './knowledge.mjs';

const requestType = 'w.request.request';
const targetType = 'w.request.target';
const constraintType = 'w.request.constraint';
const decode = value => value?.startsWith('"') ? JSON.parse(value) : value;
const field = (wire,key) => decode(wire.attrs[key]?.[0]);
const lexemes = text => tokens(text).map(token=>token[0]);
const normalize = text => lexemes(text).join(' ');

function nominal(phrase,target,family,worlds) {
  return ['sort_words','family_words','sort'].some(key=> {
    const evidence = field(target,key);
    return evidence && normalize(evidence) === phrase;
  }) || worlds.lookup(phrase).some(([role,,declared]) => role === 'target' && declared === family);
}

function localSelector(before, after, quoted, target, family, act, worlds) {
  let definite = false, beforeNoun = false, afterNoun = false;
  const prior = lexemes(before);
  for (let i=prior.length; i>0; i--) {
    if (worlds.determiners[prior.slice(0,i).join(' ')] !== 'definite') continue;
    const tail = prior.slice(i).join(' ');
    if (tail && !nominal(tail,target,family,worlds)) continue;
    definite = true;
    beforeNoun = Boolean(tail);
    break;
  }
  if (!definite && prior.length) {
    beforeNoun = quoted && nominal(prior.join(' '),target,family,worlds);
    if (!beforeNoun) return false;
  }
  if (!quoted && !definite) return false;
  const later = lexemes(after);
  if (Object.hasOwn(worlds.determiners,later.at(-1))) later.pop();
  for (let i=0;i<later.length;i++) {
    const tail = later.slice(i).join(' ');
    if (!worlds.lookup(tail).some(([role,licensed,kind]) => role === 'marker' &&
        (['tool','means'].includes(kind) || kind === 'value' && [act,'*'].includes(licensed)))) continue;
    later.splice(i);
    break;
  }
  if (later.length) {
    if (!nominal(later.join(' '),target,family,worlds)) return false;
    afterNoun = true;
  }
  return definite || beforeNoun || afterNoun;
}

function unique(text, terms) {
  if (!terms.length) return;
  const spans = new Map();
  for (const term of new Set(terms)) {
    const found = literalRanges(text,term);
    if (found.length === 1) spans.set(found[0].join(':'),found[0]);
  }
  return spans.size === 1 ? [...spans.values()][0] : undefined;
}

function quotedIdentity(scope, span, quotes, rawValue) {
  const chars = Array.from(scope);
  const touched = quotes.flatMap(({start,end,value}) => {
    const bounds = [chars.slice(0,start).join('').length, chars.slice(0,end).join('').length];
    return bounds[0] < span[1] && span[0] < bounds[1] ? [{bounds,value}] : [];
  });
  if (!touched.length) return {span,quoted:false};
  if (touched.length === 1 && touched[0].value === rawValue) return {span:touched[0].bounds,quoted:true};
}

function simpleScope(scope, quotes, worlds) {
  const masked = maskQuoted(scope,quotes);
  if (/[.!?;]\s+\p{L}/u.test(masked)) return false;
  const visible = lexemes(masked);
  return !visible.some((_,index) => {
    for (let end=index+1; end<=Math.min(visible.length,index+4); end++) {
      const phrase = visible.slice(index,end).join(' ');
      if (worlds.negatives.has(phrase) || worlds.scopeGrammar.negatives.has(phrase) ||
          worlds.scopeGrammar.conditionals.has(phrase) ||
          ['sequence','contrast','clause'].includes(worlds.joiners[phrase])) return true;
      const spelling = visible.slice(index,end).join('').replaceAll('’',"'");
      if ([...worlds.scopeGrammar.endings].some(ending=>spelling.endsWith(ending))) return true;
    }
    return false;
  });
}

function positive(wire) {
  const want = field(wire,'want');
  return !want || want === 'yes';
}

export function identitySelectorReadings(text,candidate,worlds) {
  if (!candidate.sop || !worlds.selectorKeys?.size) return [];
  const wires = parse(candidate.sop);
  const requests = wires.filter(wire=>wire.type===requestType), targets = wires.filter(wire=>wire.type===targetType);
  if (requests.length!==1 || targets.length!==1) return [];
  const [request] = requests, [target] = targets;
  const family = field(target,'family'), keys = worlds.selectorKeys.get(family);
  const ref = '$'+request.id, predicate = field(request,'predicate'), act = field(request,'act');
  if (!keys?.size || field(target,'mode')!=='existing' || field(target,'request')!==ref ||
      act!=='change' || !predicate ||
      worlds.identityAssignmentVerbs?.has(normalize(predicate))) return [];
  const scoped = field(request,'words') ?? text;
  if (literalRanges(text,scoped).length !== 1) return [];
  const quotes = quotedSpans(scoped);
  if (!simpleScope(scoped,quotes,worlds)) return [];
  const constraints = wires.filter(wire=>wire.type===constraintType && field(wire,'request')===ref);
  const identities = constraints.filter(wire=>keys.has(field(wire,'attribute')));
  if (identities.length!==1) return [];
  const [identity] = identities, value = field(identity,'value');
  if ((field(identity,'phase') ?? 'result')!=='result' || field(identity,'operator')!=='eq' ||
      field(identity,'on')!=='attribute' || !positive(identity) || !value ||
      identity.attrs.value.length!==1 || identity.attrs.words?.length>1 || identity.attrs.key_words) return [];

  const resultFrom = [];
  for (const wire of constraints) {
    if (wire===identity || (field(wire,'phase') ?? 'result')!=='result') continue;
    if (!positive(wire) || !wire.attrs.attribute) return [];
    const terms = (wire.attrs.words ?? []).map(decode);
    if (!terms.length) terms.push(...(wire.attrs.value ?? []).map(decode));
    const span = unique(scoped,terms);
    if (!span) return [];
    const labels = (wire.attrs.key_words ?? []).map(decode).flatMap(phrase=>literalRanges(scoped,phrase));
    resultFrom.push(Math.min(span[0],...labels.map(([start])=>start)));
  }
  if (!resultFrom.length) return [];
  const verb = unique(scoped,[predicate]), source = unique(scoped,[field(identity,'words') ?? value]);
  if (!verb || !source) return [];
  if (!literalRanges(maskQuoted(scoped,quotes),predicate).length) return [];
  const head = quotedIdentity(scoped,source,quotes,value), payload = Math.min(...resultFrom);
  if (!head || verb[1]>=head.span[0] || head.span[1]>=payload) return [];
  const identityPhrase = normalize(value);
  if (!head.quoted && !worlds.lookup(identityPhrase).some(([role]) => role==='target') &&
      !['name','ids'].some(key=>(target.attrs[key] ?? []).some(item=>decode(item)===value)) &&
      !/^(?=.*\p{L})(?=.*\p{N})[\p{L}\p{N}_-]+$/u.test(value)) return [];
  if (!localSelector(scoped.slice(verb[1],head.span[0]),scoped.slice(head.span[1],payload),
    head.quoted,target,family,act,worlds)) return [];

  const copy = wires.map(wire=>wire===identity ? {...wire,attrs:{...wire.attrs,phase:['selector']}} : wire);
  return [{...candidate,sop:serialize(copy),source:'identity-selector'}];
}
