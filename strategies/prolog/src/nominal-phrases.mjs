import { evidenceReport, literalField, literalRanges } from './evidence.mjs';
import { nativeInventory } from './native-inventory.mjs';
import { tokens } from './lexicon.mjs';
import { quotedSpans } from './literal-roles.mjs';
import { consumeUnread } from './nominal-evidence.mjs';
import { parse, serialize } from './knowledge.mjs';

const requestType = 'w.request.request', targetType = 'w.request.target';
const constraintType = 'w.request.constraint', unreadType = 'w.request.unread';
const lookupType = 'w.request.lookup';
const decode = value => value?.startsWith('"') ? JSON.parse(value) : value;
const field = (wire, key) => decode(wire.attrs[key]?.[0]);
const noun = target => field(target, 'sort_words') ?? field(target, 'family_words') ?? field(target, 'sort');
const word = /^[\p{L}\p{M}\p{N}_]+$/u;
const normalize = text => tokens(text).map(token => token[0]).join(' ');
const encode = value => /^[\p{L}_][\p{L}\p{M}\p{N}_.-]*$/u.test(value) ? value : JSON.stringify(value);
const allowedFields = new Set(['id', 'request', 'attribute', 'on', 'value', 'words', 'key_words', 'open_value', 'operator', 'phase']);
const allowedOperators = new Set(['eq', 'region', 'degree']);
const boundary = /^[,.;:!?—–，。！？；：]$/u;

function nounPosition(ts, head) {
  const words = normalize(head).split(' ');
  if (!words.every(token => word.test(token))) return;
  const matches = ts.flatMap((_, i) => words.every((token, j) => ts[i + j]?.[0] === token) ? [i] : []);
  if (matches.length === 1) return [matches[0], matches[0] + words.length];
}

function matchesAt(ts, from, words) {
  return words.every((token, i) => ts[from+i]?.[0]===token);
}

function lexicalWords(text) {
  const words=text && normalize(text).split(' ');
  return words?.length && words.length<=8 && words.every(token=>word.test(token)) ? words : undefined;
}

function catalogAllows(worlds,family,key,value) {
  return !worlds || worlds.requestKeys.some(prop=>prop.family===family && prop.name===key &&
    prop.head.split('+').some(h=>h==='class' || h==='candidate') &&
    (!prop.values.length || prop.values.includes(value)));
}

function anchoredPart(wire,ts,at,worlds) {
  const value=lexicalWords(field(wire,'value'));
  const marker=lexicalWords(field(wire,'key_words'));
  if (wire.attrs.words) {
    const words=lexicalWords(field(wire,'words'));
    if (!words || !matchesAt(ts,at,words)) return;
    return words;
  }
  if (!value || wire.attrs.key_words && !marker) return;
  if (!marker) return matchesAt(ts,at,value) ? value : undefined;
  const limit=Math.min(ts.length,at+8);
  const addresses=words=>Array.from({length:Math.max(0,limit-at-words.length+1)},(_,i)=>at+i)
    .filter(i=>matchesAt(ts,i,words));
  const candidates=new Map();
  for (const a of addresses(value)) {
    for (const b of addresses(marker)) {
      if (a<b+marker.length && b<a+value.length) continue;
      const stop=Math.max(a+value.length,b+marker.length);
      const words=ts.slice(at,stop).map(t=>t[0]);
      if (!words.every((form,i)=> {
        const p=at+i;
        return p>=a&&p<a+value.length || p>=b&&p<b+marker.length ||
          word.test(form) && !worlds?.joiners[form] && !worlds?.negatives.has(form) &&
          !worlds?.scopeGrammar.conditionals.has(form) && worlds?.evidenceVocabulary.grammar.has(form);
      })) continue;
      candidates.set(words.join(' '),words);
    }
  }
  return candidates.size===1 ? [...candidates.values()][0] : undefined;
}

function partsAt(wires,ts,at,worlds,family,mode) {
  const options=[];
  for (const wire of wires) {
    const key=field(wire,'attribute'), value=field(wire,'value'), on=field(wire,'on');
    const operator=field(wire,'operator') ?? 'eq', phase=field(wire,'phase') ?? 'result';
    if (!key || !value || !on || wire.attrs.value?.length!==1 || (wire.attrs.words?.length ?? 0)>1 ||
        (wire.attrs.key_words?.length ?? 0)>1 || on==='place') continue;
    const words=anchoredPart(wire,ts,at,worlds);
    if (!words) continue;
    const marker=lexicalWords(field(wire,'key_words'));
    if (wire.attrs.key_words && (!marker || !words.some((_,i)=>marker.every((token,j)=>words[i+j]===token)))) continue;
    if (!catalogAllows(worlds,family,key,value)) continue;
    if (words.length===1 && !wire.attrs.words && !marker && worlds?.requestKeys.some(prop=>
      prop.family===family && prop.name!==key && prop.values.includes(value))) continue;
    const usable=(mode!=='new' || phase==='result') && allowedOperators.has(operator) &&
      Object.keys(wire.attrs).every(name=>allowedFields.has(name));
    options.push({words,meaning:usable && JSON.stringify([key,value,on,operator,phase])});
  }
  return options;
}

function uniqueParts(parts) {
  return [...new Map(parts.map(part=>[JSON.stringify([part.words,part.meaning]),part])).values()];
}

function groundedPlacementEnd(wires,ts,at,worlds,family) {
  if (!worlds?.spatialBindings) return;
  const lead=ts[at]?.[0];
  const bridge=worlds.evidenceVocabulary.grammar.has(lead) && !worlds.negatives.has(lead) &&
    !worlds.joiners[lead] && !worlds.scopeGrammar.conditionals.has(lead);
  const bounds=new Map();
  const relations=wires.filter(w=>field(w,'on')==='place' && field(w,'operator')==='relation' &&
    w.attrs.value?.length===1 && !w.attrs.want);
  for (const {relationKey,anchorKey} of worlds.spatialBindings.filter(binding=>binding.family===family)) {
    const markers=relations.filter(w=>field(w,'attribute')===relationKey);
    const anchors=relations.filter(w=>field(w,'attribute')===anchorKey && field(w,'phase')==='selector');
    for (const marker of markers) {
      const prefix=lexicalWords(field(marker,'words') ?? field(marker,'value'));
      if (!prefix) continue;
      for (const anchor of anchors) {
        const name=lexicalWords(field(anchor,'value'));
        if (!name) continue;
        const coversName=prefix.length>name.length && name.every((word,i)=>prefix[prefix.length-name.length+i]===word);
        const words=coversName ? prefix : [...prefix,...name];
        const positions=ts.flatMap((_,i)=>matchesAt(ts,i,words) ? [i] : []);
        const [start]=positions;
        if (positions.length===1 && (start===at || bridge && start===at+1)) {
          const end=start+words.length;
          const meaning=JSON.stringify([start,end,relationKey,anchorKey,field(marker,'value'),field(marker,'phase'),name]);
          bounds.set(meaning,end);
        }
      }
    }
  }
  return bounds.size===1 ? [...bounds.values()][0] : undefined;
}

function spatialPair(wires, constraints, family, surface, worlds, region) {
  const pairs = [];
  for (const {relationKey, anchorKey} of worlds.spatialBindings.filter(binding => binding.family === family)) {
    for (const relation of constraints.filter(w => field(w, 'attribute') === relationKey &&
      field(w, 'on') === 'place' && field(w, 'operator') === 'relation' && w.attrs.value?.length === 1)) {
      const marker = normalize(field(relation, 'words') ?? field(relation, 'value'));
      for (const anchor of constraints.filter(w => field(w, 'attribute') === anchorKey &&
        field(w, 'on') === 'place' && field(w, 'operator') === 'relation' && field(w, 'phase') === 'selector' &&
        w.attrs.value?.length === 1 && !w.attrs.words)) {
        const name=normalize(field(anchor,'value'));
        const phrase=marker.endsWith(' '+name) ? marker : marker+' '+name;
        // A declared region may include a leading emphasis word absent from
        // the lexical relation. Its anchor and marker still have to coincide.
        if (phrase!==surface && (!region || !surface.endsWith(' '+phrase))) continue;
        const lookups = wires.filter(w => w.type === lookupType && field(w, 'constraint') === '$' + anchor.id);
        pairs.push([relation, anchor, ...lookups]);
      }
    }
  }
  if (pairs.length !== 1) return [];
  return detached(wires,pairs[0]);
}

function detached(wires, removable) {
  const drop=new Set(removable);
  const refs=new Set(removable.map(w=>'$'+w.id));
  return wires.some(w=>!drop.has(w) && Object.values(w.attrs).flat().some(value=>refs.has(value))) ? [] : removable;
}

function coarseRegion(wires,owned,family,key,text,from,to,worlds,creates) {
  const relations=new Set(worlds.spatialBindings.filter(binding=>binding.family===family).map(binding=>binding.relationKey));
  const pieces=owned.filter(wire=>{
    const attribute=field(wire,'attribute');
    if (attribute!==key && !relations.has(attribute) || field(wire,'on')!=='attribute' ||
        field(wire,'operator')!=='eq' || field(wire,'phase')!=='result' || wire.attrs.value?.length!==1 ||
        wire.attrs.key_words || Object.keys(wire.attrs).some(slot=>!allowedFields.has(slot))) return false;
    const surface=field(wire,'words') ?? field(wire,'value');
    const spans=normalSpans(text,surface);
    return spans.length===1 && (attribute===key ? from<spans[0][0] && spans[0][1]===to :
      spans[0][0]===from && spans[0][1]<to);
  });
  if (pieces.length===2 && pieces.filter(wire=>field(wire,'attribute')===key).length===1) return detached(wires,pieces);
  if (pieces.length || !creates) return [];
  const directions=new Set(worlds.directionalResults.bindings.filter(binding=>binding.family===family).map(binding=>binding.directionKey));
  const partial=owned.filter(wire=>{
    if (!directions.has(field(wire,'attribute')) || field(wire,'on')!=='attribute' || field(wire,'operator')!=='eq' ||
        field(wire,'phase')!=='result' || wire.attrs.value?.length!==1 || wire.attrs.key_words ||
        Object.keys(wire.attrs).some(slot=>!allowedFields.has(slot))) return false;
    const positions=normalSpans(text,field(wire,'words') ?? field(wire,'value'));
    return positions.length===1 && positions[0][0]===from && positions[0][1]<to;
  });
  return partial.length===1 ? detached(wires,partial) : [];
}

function normalSpans(text, value) {
  return literalRanges(text.toLowerCase(), value.toLowerCase());
}

function separatesPhrase(ts, next, worlds) {
  if (!ts[next] || boundary.test(ts[next][0])) return true;
  for (let end = next + 1; end <= Math.min(ts.length, next + 4); end++) {
    const continuation = ts.slice(next, end).map(token => token[0]).join(' ');
    if (worlds.joiners[continuation] ||
      worlds.lookup(continuation).some(([role, , kind, relation]) =>
        role === 'marker' && kind === 'spatial' && relation)) return true;
  }
  return false;
}

function regionSurfaces(facts) {
  const attributes=(wire,key)=>(wire.attrs[key] ?? []).map(decode);
  const layouts=new Map(), aliases=new Map();
  for (const slot of facts('k.layouts.slot')) {
    const layout=field(slot,'layout'), value=field(slot,'name');
    if (!layout || !value) continue;
    const names=layouts.get(layout) ?? new Set();
    names.add(value);
    layouts.set(layout,names);
  }
  for (const cue of facts('w.lang.en.cue')) {
    const value=field(cue,'value'), relation=field(cue,'relation');
    if (!value || field(cue,'on')!=='place' || field(cue,'takes')!=='none' ||
        !['in','at'].includes(relation) || cue.attrs.attribute) continue;
    const width=normalize(value.replaceAll('_',' ')).split(' ').length;
    const forms=aliases.get(value) ?? new Set();
    // Only bare, same-width aliases can serve as the region name itself.
    // Multiword cue leads with a preposition remain full phrases.
    for (const lead of attributes(cue,'lead').map(normalize)) {
      if (lead.split(' ').length===width && lead.split(' ').every(token=>word.test(token)))
        forms.add(lead);
    }
    aliases.set(value,forms);
  }
  const phrases=[];
  for (const rule of facts('pro.reader.region_form')) {
    const layout=field(rule,'layout'), values=attributes(rule,'value');
    const heads=attributes(rule,'head'), extra=attributes(rule,'alias');
    const prefixes=attributes(rule,'prefix').map(normalize).filter(Boolean);
    const names=layout ? [...(layouts.get(layout) ?? [])].filter(name=>!values.length || values.includes(name)) : values;
    for (const value of names) {
      const spellings=[value.replaceAll('_',' '),...(aliases.get(value) ?? []),
        ...(values.length===1 ? extra : [])];
      const forms=new Set(spellings.flatMap(name=>layout && name.split(' ').length===2 ?
        [name,name.replace(' ','-')] : [name]));
      for (const prefix of prefixes) for (const name of forms) for (const head of heads.length ? heads : ['']) {
        phrases.push(['region',prefix+' '+name+(head ? ' '+head : ''),[value]]);
      }
    }
  }
  return phrases;
}

export function nominalPositionForms(facts, requestKeys, words=facts('core.word')) {
  const cues = regionSurfaces(facts);
  for (const wire of facts('w.lang.en.cue')) {
    const on=field(wire,'on'), value=field(wire,'value'), relation=field(wire,'relation');
    if (field(wire,'takes')!=='none' || !value) continue;
    const kind=on==='layout' ? 'arrangement' : on==='place' && ['in','at'].includes(relation) &&
      !wire.attrs.attribute ? 'region' : undefined;
    if (kind) for (const surface of wire.attrs.lead ?? []) cues.push([kind,decode(surface),[value]]);
  }
  for (const wire of facts('w.lang.en.arrangement')) {
    const values=[field(wire,'layout'),field(wire,'diagram_layout')].filter(Boolean);
    for (const surface of wire.attrs.text ?? []) cues.push(['arrangement',decode(surface),values]);
  }
  const indexes=new Map();
  const add=(family,entry)=>{
    const [words]=entry;
    if (!indexes.has(family)) indexes.set(family,new Map());
    const byLead=indexes.get(family);
    if (!byLead.has(words[0])) byLead.set(words[0],new Map());
    byLead.get(words[0]).set(JSON.stringify(entry),entry);
  };
  const subjectsByType=new Map();
  function subjectKinds(wire) {
    const types=(wire.attrs.subject_type ?? []).map(decode);
    if (!types.length) return;
    const subjects=new Set();
    for (const type of types) {
      if (!subjectsByType.has(type)) {
        const names=nativeInventory(facts,type,words);
        subjectsByType.set(type,[...names.values()].flatMap(choices=>[...choices].map(normalize)));
      }
      for (const name of subjectsByType.get(type)) subjects.add(name);
    }
    return [...subjects].sort();
  }
  const addValue=(family,wire,words,key,value)=>{
    const subjects=subjectKinds(wire);
    if (subjects?.length===0) return;
    const entry=[words,key,value,'attribute','eq','result'];
    const heading=field(wire,'heading')==='true';
    add(family,heading || subjects ? [...entry,subjects,field(wire,'strict_subject')==='true',heading] : entry);
  };
  for (const wire of facts('pro.reader.nominal_pattern')) {
    const family=field(wire,'family'), key=field(wire,'key');
    const bank=requestKeys.find(prop=>prop.family===family && prop.name===key &&
      prop.head==='class' && prop.values.length);
    if (!bank) continue;
    for (const surface of wire.attrs.pattern ?? []) {
      const pattern=decode(surface);
      if (!/^(?:[\p{L}\p{M}]+ )*\{value\}(?: [\p{L}\p{M}]+)*$/u.test(pattern)) continue;
      for (const value of bank.values) {
        const words=lexicalWords(pattern.replace('{value}',()=>value));
        if (words) addValue(family,wire,words,key,value);
      }
    }
  }
  for (const wire of facts('pro.reader.nominal_value')) {
    const family=field(wire,'family');
    const key=field(wire,'key'), value=field(wire,'value');
    if (!family || !key || !value || !requestKeys.some(prop=>prop.family===family &&
      prop.name===key && prop.head.split('+').includes('class') &&
      prop.values.includes(value))) continue;
    for (const text of wire.attrs.text ?? []) {
      const words=lexicalWords(decode(text));
      if (words) addValue(family,wire,words,key,value);
    }
  }
  for (const wire of facts('pro.reader.spatial')) {
    const family=field(wire,'family');
    const roles={region:field(wire,'region_key'),arrangement:field(wire,'arrangement_key')};
    for (const [kind,surface,values] of cues) {
      const key=roles[kind];
      if (!key) continue;
      const property=requestKeys.find(prop=>prop.family===family && prop.name===key &&
        prop.head.split('+').some(h=>h==='class' || h==='candidate'));
      const value=values.find(value=>property?.values.includes(value));
      const words=normalize(surface).split(' ');
      if (!value || words.length<2 || !words.every((token,i)=>word.test(token) ||
        token==='-' && word.test(words[i-1] ?? '') && word.test(words[i+1] ?? ''))) continue;
      const operator=kind==='region' ? 'region' : 'eq';
      add(family,[words,key,value,'attribute',operator]);
    }
  }
  return new Map([...indexes].map(([family,byLead])=>[family,new Map([...byLead].map(([lead,options])=>
    [lead,[...options.values()]]))]));
}

export function strictNominalSubjects(positions) {
  const index=new Map();
  for (const [family,byLead] of positions) {
    for (const entries of byLead.values()) for (const [,key,value,,,,subjects,strict] of entries) {
      if (!strict) continue;
      const id=JSON.stringify([family,key,value.toLowerCase()]);
      const known=index.get(id) ?? new Set();
      for (const subject of subjects) known.add(subject);
      index.set(id,known);
    }
  }
  return index;
}

function attachPhrase(text, ts, quotes, wires, request, target, start, at, entry, worlds, followed = false) {
  const [keys, key, value, on, operator, requestedPhase]=entry;
  const family=field(target,'family'), ref='$'+request.id;
  if (!followed && !separatesPhrase(ts, at + keys.length, worlds)) return;
  const fromChar = ts[at][2], toChar = ts[at + keys.length - 1][3];
  const headChar = ts[start][2];
  if (quotes.some(q => q.start < Math.max(toChar,headChar) && q.end > Math.min(fromChar,headChar))) return;

  const chars = Array.from(text);
  const from = chars.slice(0, fromChar).join('').length;
  const to = chars.slice(0, toChar).join('').length;
  const namedScope = field(request, 'words');
  const scopes = namedScope ? literalRanges(text, namedScope) : [[0, text.length]];
  if (scopes.length !== 1 || Math.min(from,chars.slice(0,headChar).join('').length) < scopes[0][0] || to > scopes[0][1]) return;
  const scopeTokens = tokens(text.slice(...scopes[0])).map(token => token[0]);
  if (scopeTokens.some((token, i) => {
    for (let end = i + 1; end <= Math.min(i + 4, scopeTokens.length); end++) {
      const phrase = scopeTokens.slice(i, end).join(' ');
      if (worlds.negatives.has(phrase) || worlds.scopeGrammar.negatives.has(phrase) ||
          worlds.scopeGrammar.conditionals.has(phrase) ||
          [...worlds.scopeGrammar.endings].some(ending => scopeTokens.slice(i, end).join('').endsWith(ending))) return true;
    }
    return false;
  })) return;
  if (!catalogAllows(worlds,family,key,value)) return;

  const constraints = wires.filter(w => w.type === constraintType);
  if (constraints.some(w => ['no', 'not_all'].includes(field(w, 'want')))) return;
  const owned = constraints.filter(w => field(w, 'request') === ref);
  const spatial=spatialPair(wires, owned, family, keys.join(' '), worlds, operator==='region');
  const fragments=operator==='region' && field(target,'mode')==='new' && !spatial.length
    ? coarseRegion(wires,owned,family,key,text,from,to,worlds,field(request,'act')==='make') : [];
  if (constraints.some(w=>field(w,'attribute')===key && !fragments.includes(w))) return;
  const phase=requestedPhase ?? (spatial.length ? field(spatial[0],'phase') ?? 'result'
    : field(target,'mode')==='new' || field(request,'act')==='place' ? 'result' : undefined);
  if (!phase) return;
  const drop = new Set([...spatial,...fragments]);
  const overlap = (wire, fields) => fields.some(name => wire.attrs[name].some(item =>
    normalSpans(text, decode(item)).some(([a,b]) => a < to && b > from)));
  const observed = wires.filter(w => w.type === unreadType && field(w, 'request') === ref);
  if (!spatial.length && !observed.some(w => overlap(w, ['text']))) return;
  for (const w of wires) {
    if (drop.has(w) || w.type === unreadType || w.id === request.id) continue;
    const evidence = Object.keys(w.attrs).filter(literalField);
    if (w.type === constraintType && w.attrs.value && !w.attrs.words) evidence.push('value');
    if (overlap(w, evidence)) return;
  }
  const ids = new Set(wires.map(w => w.id));
  const stem = target.id + '.phrase';
  let id = stem;
  for (let suffix = 2; ids.has(id); suffix++) id = stem + suffix;
  const kept = consumeUnread(wires.filter(w => !drop.has(w)), text, from, to);
  const support = {
    id, type:constraintType,
    attrs:{request:[ref], on:[on], attribute:[encode(key)], value:[encode(value)],
      words:[JSON.stringify(text.slice(from,to))], operator:[operator], phase:[phase]},
  };
  return {sop:serialize([...kept, support]), source:requestedPhase ? 'nominal-phrase' : 'nominal-position',
    status:kept.some(w => w.type === unreadType) ? 'partial' : 'matched'};
}

export function nativeNominalPhraseReadings(text, ts, quotes, candidate, index, worlds) {
  if (!index?.size || !candidate.sop) return [];
  let wires=parse(candidate.sop);
  const targets=wires.filter(w=>w.type===targetType), requests=wires.filter(w=>w.type===requestType);
  if (targets.length!==1 || requests.length!==1) return [];
  const [target]=targets, [request]=requests;
  const family=field(target,'family'), head=noun(target);
  const byLead=index.get(family), position=head && nounPosition(ts,head);
  if (!byLead || !position || field(target,'request')!=='$'+request.id) return [];
  const [start,after]=position;
  const mode=field(target,'mode'), ref='$'+request.id;
  const createsTarget=mode==='new' && field(request,'act')==='make';
  const owned=()=>wires.filter(w=>w.type===constraintType && field(w,'request')===ref);
  const grounded=at=>uniqueParts(partsAt(owned(),ts,at,worlds,family,mode));
  const placement=at=>groundedPlacementEnd(owned(),ts,at,worlds,family);
  // An explicit phase marks a value on a newly created nominal. Spatial
  // forms still use the phase of their existing local relation.
  const targetKind=normalize(field(target,'sort') ?? head);
  const options=at=>[...new Map((byLead.get(ts[at]?.[0]) ?? [])
    .filter(([words,,,,,phase,subjects,,headingOnly])=>
      !headingOnly && (!phase || createsTarget) &&
      (!subjects || subjects.includes(targetKind)) && matchesAt(ts,at,words))
    .map(entry=>[JSON.stringify(entry.slice(0,6)),entry])).values()];
  let revised;
  // A sentence-initial region before a comma can modify the one target in
  // this local packet. Its phrase must end before the target nominal starts.
  const preposed=options(0).filter(entry=>entry[4]==='region' &&
    entry[0].length<start && ts[entry[0].length][0]===',');
  if (preposed.length===1) {
    revised=attachPhrase(text,ts,quotes,wires,request,target,start,0,preposed[0],worlds);
    if (revised) wires=parse(revised.sop);
  }
  for (let at=after;at<ts.length;) {
    const entries=options(at), existing=grounded(at);
    const length=Math.max(0,...entries.map(([words])=>words.length));
    const best=entries.filter(([words])=>words.length===length);
    if (existing.length>1 || best.length>1) break;
    const [entry]=best, [covered]=existing;
    if (covered) {
      const agrees=covered.meaning && (!entry || covered.words.join(' ')===entry[0].join(' ') &&
        JSON.stringify(JSON.parse(covered.meaning).slice(0,entry[5] ? 5 : 4))===JSON.stringify(entry.slice(1,entry[5] ? 6 : 5)));
      if (agrees) {
        at+=covered.words.length;
        continue;
      }
      if (entry?.[4]!=='region') break;
    }
    if (!entry) break;
    const next=at+length;
    const following=options(next).length===1 || grounded(next).some(part=>part.meaning) || Boolean(placement(next));
    const attached=attachPhrase(text,ts,quotes,wires,request,target,start,at,entry,worlds,following);
    if (!attached?.sop) break;
    revised=attached;
    wires=parse(attached.sop);
    at=next;
  }
  return revised ? [revised] : [];
}

export async function nominalHeadingReadings(text, ts, worlds, readNominal) {
  const colon=ts.findIndex(([key])=>key===':');
  if (colon<1 || colon>8 || ts.at(-1)?.[0]==='?' ||
      !worlds.singularArticles.has(ts[colon+1]?.[0])) return [];
  const chars=Array.from(text);
  const headingEnd=ts[colon-1][3];
  if (quotedSpans(text).some(quote=>quote.start<=headingEnd)) return [];
  const headings=new Map();
  for (const [family,byLead] of worlds.nominalPositions) {
    const entries=(byLead.get(ts[0][0]) ?? []).filter(([words,,,,,,,,heading])=>
      heading && words.length===colon && matchesAt(ts,0,words));
    if (entries.length) headings.set(family,entries);
  }
  if (!headings.size) return [];
  const body=chars.slice(ts[colon+1][2]).join('');
  const result=await readNominal(body);
  const surface=JSON.stringify(chars.slice(ts[0][2],headingEnd).join(''));
  const readings=[];
  for (const candidate of [result,...result.alternatives]) {
    if (candidate.source!=='nominal-creation') continue;
    const wires=parse(candidate.sop);
    const target=wires.find(w=>w.type===targetType);
    const request=wires.find(w=>w.type===requestType);
    const subject=normalize(field(target,'sort') ?? noun(target) ?? '');
    const entries=headings.get(field(target,'family')) ?? [];
    for (const [,key,value,on,operator,phase,subjects] of entries) {
      if (subjects && !subjects.includes(subject) ||
          wires.some(w=>field(w,'attribute')===key)) continue;
      const support={id:target.id+'.heading',type:constraintType,attrs:{
        request:['$'+request.id],attribute:[encode(key)],value:[encode(value)],
        on:[on],operator:[operator],phase:[phase],words:[surface],
      }};
      const packet=[...wires,support];
      const proof=evidenceReport(text,packet,worlds.evidenceVocabulary);
      if (!proof.missing.length && !proof.counts.uncovered && !proof.counts.unread) {
        readings.push({sop:serialize(packet),source:'nominal-heading',status:'matched'});
      }
    }
  }
  return readings;
}
