import { parse, serialize } from './knowledge.mjs';
import { literalField, literalRanges } from './evidence.mjs';
import { tokens } from './lexicon.mjs';
import { quotedSpans } from './literal-roles.mjs';

const type = name => 'w.request.' + name;
const raw = (wire, name) => wire.attrs[name]?.[0];
const decode = value => value?.startsWith('"') ? JSON.parse(value) : value;
const get = (wire, name) => decode(raw(wire,name));
const word = /^[\p{L}\p{M}\p{N}_]+$/u;
const punctuation = new Set(['.', '!', '?']);
const nominalDeterminers = new Set(['definite','indefinite','demonstrative','possessive']);
const creationDeterminers = new Set(['indefinite','quantified']);
const normalized = text => tokens(text).map(([key]) => key).join(' ');

// A quote already owned as literal content cannot supply a second numeric
// setting. A written operand elsewhere, including in a different quote,
// remains eligible as evidence for the setting.
export function numericSettingsInOwnedQuotes(text,wires,worlds) {
  if (!/["'‘“]/u.test(text) || !wires.some(wire=>wire.type===type('constraint') &&
      (get(wire,'on')==='count' || worlds.numericSettingKeys?.has(get(wire,'attribute'))))) return [];
  const chars=Array.from(text);
  const quotes=quotedSpans(text).map(({start,end,value})=>({
    start:chars.slice(0,start).join('').length,end:chars.slice(0,end).join('').length,value,
  }));
  if (!quotes.length) return [];
  const requests=wires.filter(wire=>wire.type===type('request'));
  const owned=Map.groupBy(wires.filter(wire=>raw(wire,'request')),wire=>raw(wire,'request'));
  const conflicts=[];
  for (const request of requests) {
    const scope=get(request,'words');
    const ranges=scope ? literalRanges(text,scope) : requests.length===1 ? [[0,text.length]] : [];
    if (ranges.length!==1) continue;
    const [[start,end]]=ranges;
    const local=owned.get('$'+request.id) ?? [];
    const targets=local.filter(wire=>wire.type===type('target'));
    const families=new Set(targets.map(target=>get(target,'family')));
    const literalKeys=new Set(worlds.literalGrammar.quoteBindings.filter(binding=>
      !families.size || families.has(binding.family)).map(binding=>binding.attribute));
    const content=quotes.filter(quote=>start<=quote.start && quote.end<=end &&
      local.some(wire=>wire.type===type('target') && get(wire,'name')===quote.value ||
        wire.type===type('constraint') && literalKeys.has(get(wire,'attribute')) &&
        wire.attrs.value?.some(value=>decode(value)===quote.value)));
    if (!content.length) continue;
    for (const wire of local) {
      if (wire.type!==type('constraint') || literalKeys.has(get(wire,'attribute')) ||
          !(get(wire,'on')==='count' || worlds.numericSettingKeys?.has(get(wire,'attribute')))) continue;
      const operands=wire.attrs.measure_words ?? wire.attrs.words ?? wire.attrs.value ?? [];
      const evidence=operands.flatMap(value=>literalRanges(text,decode(value),start,end));
      if (evidence.length && evidence.every(([a,b])=>content.some(quote=>quote.start<=a && b<=quote.end)))
        conflicts.push(wire);
    }
  }
  return conflicts;
}

export function keepOwnedQuotesLiteral(text,reading,worlds) {
  if (!reading.sop?.includes(' w.request.constraint ') || !/["'‘“]/u.test(text)) return reading;
  const wires=parse(reading.sop);
  const shadowed=numericSettingsInOwnedQuotes(text,wires,worlds);
  if (!shadowed.length) return reading;
  const ids=new Set(shadowed.map(wire=>'$'+wire.id));
  if (wires.some(wire=>Object.values(wire.attrs).some(values=>values.some(value=>ids.has(value))))) return reading;
  return {...reading,sop:serialize(wires.filter(wire=>!shadowed.includes(wire))).trimEnd()};
}

function locations(ts, surface, start = 0) {
  const forms = tokens(surface).map(token => token[0]);
  if (!forms.length) return [];
  return ts.flatMap((_,i) => i >= start && forms.every((word,j) => ts[i+j]?.[0] === word)
    ? [[i,i+forms.length]] : []);
}

function roleCues(grammar, family) {
  const cues = new Map();
  for (const {family:owner, attribute, role, surfaces} of grammar.bindings) {
    if (owner !== family || role === 'quoted') continue;
    const forms = role === 'name' ? [...surfaces,...grammar.namingLeads] : surfaces;
    for (const surface of forms) {
      const keys = cues.get(surface) ?? new Set();
      keys.add(attribute);
      cues.set(surface,keys);
    }
  }
  return cues;
}

function attachedCues(ts, headEnd, cues) {
  return [...cues].flatMap(([surface,keys]) => {
    const forms = surface.split(' ');
    return forms.every((form,i) => ts[headEnd+i]?.[0] === form)
      ? [{valueStart:headEnd+forms.length,keys}] : [];
  });
}

// Ground a trailing literal complement on a selected nominal. The input
// reading must leave that complement unread and supply the predicate and kind.
export function literalAttachments(text, candidate, worlds) {
  if (candidate.source !== 'lexicon' || !candidate.sop.includes(type('unread'))) return [];
  const wires = parse(candidate.sop);
  const requests = wires.filter(wire => wire.type === type('request'));
  const targets = wires.filter(wire => wire.type === type('target'));
  if (requests.length !== 1 || targets.length !== 1) return [];
  const [request] = requests, [target] = targets;
  const reference = '$' + request.id;
  const family = get(target,'family'), predicate = get(request,'predicate');
  const targetWords = get(target,'sort_words') ?? get(target,'family_words') ?? get(target,'sort');
  const mood = get(request,'mood');
  if (get(request,'act') !== 'make' || (mood && mood !== 'do') || get(target,'mode') !== 'new' ||
      raw(target,'request') !== reference || raw(target,'name') || !targetWords || !predicate) return [];
  const cues = roleCues(worlds.literalGrammar,family);
  if (!cues.size) return [];
  const ts = tokens(get(request,'words') ?? text);
  const chars = Array.from(get(request,'words') ?? text);
  const span = (first,last) => chars.slice(ts[first][2],ts[last-1][3]).join('');
  const pred = locations(ts,predicate);
  if (pred.length !== 1) return [];
  const [[verbStart,verbEnd]] = pred;
  const lead = ts.slice(0,verbStart).map(([form]) => form).filter(form => form !== ',').join(' ');
  if (!mood && lead && !worlds.literalGrammar.leads.has(lead) && !worlds.fillerPhrases.has(lead)) return [];
  const heads = locations(ts,targetWords,verbEnd)
    .map(([,end]) => ({end,matches:attachedCues(ts,end,cues)}))
    .filter(({matches}) => matches.length);
  if (heads.length !== 1) return [];
  const [{end:cueStart,matches}] = heads;
  let terminal = ts.length;
  while (punctuation.has(ts[terminal-1]?.[0])) terminal--;
  const unread = wires.filter(wire => wire.type === type('unread') && raw(wire,'request') === reference);
  const unreadSpans = unread.flatMap(wire => {
    const ranges = locations(ts,get(wire,'text'));
    return ranges.length === 1 ? [{wire,range:ranges[0]}] : [];
  });
  const grounded = wires.filter(wire => wire.type === type('constraint') && raw(wire,'request') === reference)
    .flatMap(wire => Object.entries(wire.attrs).flatMap(([slot,values]) =>
      (literalField(slot) || slot === 'value') ? values.flatMap(value => locations(ts,decode(value))) : []));
  const readings = [];
  for (const {valueStart,keys} of matches) {
    let end = valueStart;
    while (end < terminal && unreadSpans.some(({range:[a,b]}) => cueStart <= a && a <= end && end < b)) end++;
    if (valueStart >= end || (end < terminal &&
        !(grounded.some(([a]) => a === end) &&
          worlds.lookup(ts[end][0]).some(([role]) => role === 'marker')))) continue;
    const payload = ts.slice(valueStart,end);
    if (!payload.every(([form]) => word.test(form)) ||
        !payload.some(([form]) => /\p{L}/u.test(form))) continue;
    // An unquoted span cannot swallow a new clause or an adjunct. These
    // boundaries depend on the language world, and arbitrary text may be quoted.
    if (payload.some(([form]) => Object.hasOwn(worlds.joiners,form) ||
        worlds.negatives.has(form) || worlds.lookup(form).some(([role]) => role === 'marker'))) continue;
    const value = span(valueStart,end);
    if (worlds.isReference(value) || /[\r\n]/u.test(value)) continue;
    const covered = unreadSpans.filter(({range:[a,b]}) => cueStart <= a && b <= (end === terminal ? ts.length : end));
    if (grounded.some(([a,b]) => a < end && b > cueStart)) continue;
    const removed = new Set(covered.map(({wire}) => wire));
    let id = request.id + '.literal', suffix = 2;
    while (wires.some(wire => wire.id === id)) id = request.id + '.literal' + suffix++;
    for (const key of keys) {
      if (wires.some(wire => wire.type === type('constraint') &&
          get(wire,'attribute') === key && get(wire,'phase') === 'result')) continue;
      const constraint = {id,type:type('constraint'),attrs:{
        request:[reference],on:['attribute'],attribute:[key],value:[JSON.stringify(value)],
        operator:['eq'],phase:['result'],key_words:[JSON.stringify(span(cueStart,valueStart))],
      }};
      const attached = [...wires.filter(wire => !removed.has(wire)),constraint];
      readings.push({...candidate,sop:serialize(attached).trimEnd(),source:'literal-attachment',
        status:attached.some(wire => wire.type === type('unread')) ? 'partial' : 'matched'});
    }
  }
  return readings;
}

function displayedContainer({intro, start, from, to, text, target, request, bindings, worlds}) {
  if (get(request,'act') !== 'make' || get(target,'mode') !== 'new' || get(target,'name')) return;
  const predicate=get(request,'predicate');
  const predicates=literalRanges(text,predicate,from,to);
  if (predicates.length!==1 || !/^\s+$/u.test(text.slice(predicates[0][1],start)) || predicates[0][1]>=start ||
      !worlds.lookup(normalized(predicate)).some(([role,act,mood])=>role==='act' &&
        ['make','place'].includes(act) && (!mood || mood==='do'))) return;
  const lead=normalized(text.slice(from,predicates[0][0])).replace(/ ,$/u,'');
  if (lead && !worlds.literalGrammar.leads.has(lead) && !worlds.fillerPhrases.has(lead)) return;
  const ts=tokens(intro), chars=Array.from(intro), family=get(target,'family'), possibilities=new Map();
  for (let head=1; head<ts.length-1; head++) {
    const det=ts.slice(0,head).map(([key])=>key).join(' ');
    if (!creationDeterminers.has(worlds.determiners[det])) continue;
    for (let cueAt=head+1; cueAt<ts.length; cueAt++) {
      const nominal=chars.slice(ts[head][2],ts[cueAt-1][3]).join('');
      const cue=chars.slice(ts[cueAt][2],ts.at(-1)[3]).join('');
      const sorts=new Set(worlds.lookup(normalized(nominal)).flatMap(([role,act,owner,mode,sort])=>
        role==='target' && act==='make' && owner===family && mode==='new' && sort ? [sort] : []));
      if (sorts.size!==1) continue;
      const [sort]=sorts;
      const written=get(target,'sort_words');
      if ((get(target,'sort') && get(target,'sort')!==sort) ||
          (written && normalized(written)!==normalized(nominal))) continue;
      for (const binding of bindings) {
        if (binding.role!=='quoted' || !binding.containerSort || !binding.surfaces.includes(normalized(cue))) continue;
        const result={attribute:binding.attribute,sort,nominal,cue};
        possibilities.set(JSON.stringify(result),result);
      }
    }
  }
  return possibilities.size===1 ? possibilities.values().next().value : undefined;
}

// A value inherited from another reading can contain a written introducer
// and its quotation marks. Strip those only when the existing typed slot has
// an independent native cue for that exact written construction.
export function quotedLiteralCleanup(text, candidate, worlds) {
  if (!candidate?.sop?.includes(' w.request.constraint ') || !/["'‘“]/u.test(text)) return;
  const chars = Array.from(text);
  const authored = quotedSpans(text).map(({start,end,value}) => ({
    start: chars.slice(0,start).join('').length, end: chars.slice(0,end).join('').length, value,
  }));
  if (!authored.length) return;
  const wires = parse(candidate.sop);
  const requests = wires.filter(wire => wire.type === type('request'));
  let changed = false;
  for (const request of requests) {
    const ref = '$' + request.id;
    const targets = wires.filter(wire => wire.type === type('target') && raw(wire,'request') === ref);
    if (targets.length !== 1 || ![undefined,'do'].includes(get(request,'mood'))) continue;
    const family = get(targets[0],'family');
    const grammar = worlds.literalGrammar;
    if (!grammar?.licenses(family,get(request,'act'))) continue;
    const bindings = grammar.quoteBindings.filter(binding => binding.family === family);
    if (!bindings.length) continue;
    const scoped = get(request,'words');
    const ranges = scoped ? literalRanges(text,scoped) : requests.length === 1 ? [[0,text.length]] : [];
    if (ranges.length !== 1) continue;
    const [[from,to]] = ranges;
    const local=wires.filter(wire=>raw(wire,'request')===ref);
    for (const wire of wires) {
      if (wire.type !== type('constraint') || raw(wire,'request') !== ref || get(wire,'on') !== 'attribute' ||
          get(wire,'operator') !== 'eq' || ![undefined,'result'].includes(get(wire,'phase')) ||
          ![undefined,'yes'].includes(get(wire,'want')) || wire.attrs.value?.length !== 1) continue;
      const value = get(wire,'value'), attribute = get(wire,'attribute');
      if (!bindings.some(binding => binding.attribute === attribute && binding.surfaces.length) ||
          local.some(other=>other!==wire && other.type===type('constraint') && get(other,'attribute')===attribute &&
            [undefined,'result'].includes(get(other,'phase')))) continue;
      const occurrences = literalRanges(text,value,from,to);
      if (occurrences.length !== 1) continue;
      const [[start,end]] = occurrences;
      const matching = authored.filter(q => start <= q.start && q.end <= end);
      if (matching.length !== 1) continue;
      const [literal] = matching;
      if (literal.start <= start || literal.end !== end || !literal.value.trim() || quotedSpans(literal.value).length) continue;
      const intro = text.slice(start,literal.start);
      const terms = tokens(intro).map(([form]) => form);
      if (!/\s$/u.test(intro) || !terms.length || terms.some(form => !word.test(form))) continue;
      const cues = new Set();
      for (let i = 0; i < terms.length; i++) {
        if (i && !nominalDeterminers.has(worlds.determiners[terms.slice(0,i).join(' ')])) continue;
        const cue = terms.slice(i).join(' ');
        for (const binding of bindings) if (!binding.containerSort && binding.surfaces.includes(cue)) cues.add(binding.attribute);
      }
      const container=cues.size===0 ? displayedContainer({intro,start,from,to,text,target:targets[0],request,bindings,worlds}) : undefined;
      if (!(cues.size === 1 && cues.has(attribute)) && container?.attribute!==attribute) continue;
      const words = get(wire,'words'), quoted = text.slice(literal.start,literal.end);
      if (words !== undefined && ![value,quoted,literal.value].includes(words)) continue;
      if (container && wire.attrs.key_words?.some(item=>![intro.trimEnd(),container.cue].includes(decode(item)))) continue;
      wire.attrs.value = [JSON.stringify(literal.value)];
      wire.attrs.words = [JSON.stringify(literal.value)];
      if (container) {
        wire.attrs.key_words=[JSON.stringify(container.cue)];
        targets[0].attrs.sort=[JSON.stringify(container.sort)];
        targets[0].attrs.sort_words=[JSON.stringify(container.nominal)];
      } else wire.attrs.key_words ??= [JSON.stringify(intro.trimEnd())];
      changed = true;
    }
  }
  if (changed) return {...candidate,sop:serialize(wires).trimEnd(),source:'quoted-literal-cleanup'};
}
