import {nativeInventory} from './native-inventory.mjs';
import { tokens } from './lexicon.mjs';
import { nominalSelectors, nominalSelectorLines } from './nominal-selectors.mjs';

const definite = new Set(['definite', 'demonstrative', 'possessive']);
const normalized = text => tokens(text).map(token => token[0]).join(' ');
const quote = JSON.stringify;
const encode = value => /^[\p{L}\p{N}_][\p{L}\p{N}_.-]*$/u.test(value) ? value : quote(value);
const unquotedRemainder = /[\p{L}\p{N}]/u;

export function quotedSpans(text) {
  const quotes = [];
  let offset = 0, previous = 0;
  for (const match of text.matchAll(/"(?:\\.|[^"\\])*"|“[^”]*”|(?<![\p{L}\p{N}])‘[^’\n]*’(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])'(?:\\.|[^'\\\n])*'(?![\p{L}\p{N}])/gu)) {
    offset += Array.from(text.slice(previous, match.index)).length;
    const raw = match[0], end = offset + Array.from(raw).length;
    const value = raw.slice(1, -1);
    quotes.push({start:offset, end, value});
    offset = end;
    previous = match.index + raw.length;
  }
  return quotes;
}

export function maskQuoted(text, quotes) {
  if (!quotes.length) return text;
  const chars = Array.from(text);
  for (const {start,end} of quotes) chars.fill(' ', start, end);
  return chars.join('');
}

function phrases(ts, start, end = ts.length) {
  let surface = '';
  const choices = [];
  for (let i = start; i < Math.min(end, start + 8); i++) {
    surface += (i === start ? '' : ' ') + ts[i][0];
    choices.unshift({surface, start:ts[start][2], end:ts[i][3], next:i+1});
  }
  return choices;
}

function requestHeads(ts, worlds) {
  const heads = [];
  const grammar = worlds.literalGrammar;
  for (let i = 0; i < Math.min(12,ts.length); i++) {
    const head = ts.slice(0,i).map(token => token[0]).filter(token => token !== ',').join(' ');
    if (head && !grammar.leads.has(head) && !worlds.fillerPhrases.has(head)) continue;
    for (const choice of phrases(ts,i)) {
      for (const verb of grammar.verbs(choice.surface)) heads.push({...choice,...verb});
    }
    // An accepted lead may itself span several tokens.
    if (heads.length) break;
  }
  return heads;
}

function openKeys(worlds, surface, family) {
  return worlds.properties(surface).filter(key => key.family === family && key.kind === 'quoted')
    .map(key => key.attribute);
}

function roleKeys(worlds, family, role, surface) {
  return worlds.literalGrammar.bindings.filter(binding => binding.family === family &&
    (!role || binding.role === role) && (!surface || binding.surfaces.includes(surface)))
    .map(binding => binding.attribute);
}

function clauseEnds(ts, next, end) {
  return ts.slice(next).findIndex(token => token[2] >= end);
}

function knownTargets(ts, start, stop, act, worlds) {
  const determiner = phrases(ts,start,stop).find(choice => Object.hasOwn(worlds.determiners,choice.surface));
  const startNominal = determiner?.next ?? start;
  for (const phrase of phrases(ts,startNominal,stop)) {
    const targets = worlds.lookup(phrase.surface).filter(([role, licence]) => role === 'target' && licence === act);
    if (targets.length) return {phrase, targets, startNominal, det:worlds.determiners[determiner?.surface]};
  }
  return {startNominal,det:worlds.determiners[determiner?.surface]};
}

function constraint(key, value, evidence, phase = 'result') {
  return {key,value,phase,keyWords:evidence};
}

function circuit({span, head, end, target, constraints, lead}) {
  const tail = span(end).replace(/^\s*[.,!?]+\s*/u,'').trim();
  const hasUnread = unquotedRemainder.test(tail);
  const statement = span(head.start,hasUnread ? undefined : end);
  const request = '@r1 w.request.request act=' + encode(head.act) + ' mood=do' +
    (head.implicit ? '' : ' predicate='+encode(span(head.start,head.end))) + (statement === span(0) ? '' : ' words=' + quote(statement));
  const fields = [
    'family=' + encode(target.family), 'mode=' + target.mode,
    target.det && 'determiner=' + target.det,
    target.name !== undefined && 'fill=written name=' + quote(target.name),
    target.description && 'fill=description description=' + quote(target.description),
    target.context && 'fill=context',
    target.sort && 'sort=' + encode(target.sort),
    target.sort && target.surface !== target.sort && 'sort_words=' + quote(target.surface),
    !target.sort && target.surface && 'family_words=' + quote(target.surface),
  ];
  const wires = [request,'@r1.t w.request.target request=$r1 ' + fields.filter(Boolean).join(' ')];
  if (target.context) wires.push('@r1.l1 w.request.lookup request=$r1 target=$r1.t key=thing from=page');
  constraints.forEach(({key,value,phase,keyWords},i) => {
    wires.push('@r1.c' + (i+1) + ' w.request.constraint request=$r1 on=attribute attribute=' +
      encode(key) + ' value=' + encode(value) + ' operator=eq phase=' + phase +
      (keyWords ? ' key_words=' + quote(keyWords) : ''));
  });
  if (hasUnread) wires.push('@r1.u1 w.request.unread request=$r1 text=' + quote(tail));
  if (lead) wires.push('@r1.f1 w.request.filler text=' + quote(lead));
  return {sop:wires.join('\n'),source:'lexicon',support:0,
    ...(lead === undefined ? {} : {status:hasUnread ? 'partial' : 'matched'})};
}

function replacement(span, ts, quotes, head, worlds) {
  const readings = [];
  for (let i = head.next + 1; i < ts.length; i++) {
    for (const marker of phrases(ts,i)) {
      if (quotes.some(({start,end}) => start < marker.end && end > marker.start)) continue;
      if (!worlds.lookup(marker.surface).some(([role,act,slot]) =>
        role === 'marker' && act === head.act && slot === 'replacement')) continue;
      const left = span(ts[head.next][2], marker.start).trim();
      if (!left) continue;
      const after = ts[marker.next]?.[2];
      const rightQuote = quotes.find(item => item.start === after);
      const firstQuote = quotes.find(item => item.start === ts[head.next][2] && item.end <= marker.start);
      const backwards = head.object === 'replacement';
      const value = backwards ? firstQuote?.value : rightQuote?.value;
      const end = rightQuote?.end ?? ts.at(-1)[3];
      if (value === undefined) continue;
      if (backwards && span(firstQuote.end,marker.start).trim()) continue;
      const last = backwards ? ts.length : i;
      const start = backwards ? marker.next : head.next;
      const selected = knownTargets(ts,start,last,head.act,worlds);
      const surface = selected.phrase && span(selected.phrase.start,selected.phrase.end);
      const selectedText = backwards ? span(after,rightQuote?.end).replace(/[.?!]+$/u,'').trim() : left;
      if (!selectedText || worlds.isReference(selectedText)) continue;
      const named = backwards ? rightQuote?.value : firstQuote?.value;
      const explicit = selected.targets?.filter(([, ,family]) => worlds.literalGrammar.licenses(family,head.act));
      const payloadFamilies = worlds.literalGrammar.bindings.filter(({role,family}) => role === 'payload' &&
        worlds.literalGrammar.licenses(family,head.act)).map(({family}) => family);
      const families = explicit?.map(([, ,family]) => family) ?? payloadFamilies;
      const lead = span(0,head.start).replace(/,\s*$/u,'').trim();
      for (const family of new Set(families)) {
        const kindHit = explicit?.find(target => target[2] === family);
        const extra = kindHit && span(selected.phrase.end,backwards ? rightQuote?.end : marker.start).trim();
        const selectedQuote = extra && quotes.find(item => item.start === selected.phrase.end +
          Array.from(span(selected.phrase.end).match(/^\s*/u)[0]).length);
        const attribute = extra && openKeys(worlds,normalized(extra),family);
        const keys = attribute?.length ? attribute : roleKeys(worlds,family,'payload');
        for (const key of new Set(keys)) {
          const target = {family,mode:'existing',det:selected.det,sort:kindHit?.[4],surface};
          const constraints = [constraint(key,value,span(marker.start,marker.end))];
          if (named !== undefined && !kindHit) {
            target.description = selectedText;
            constraints.unshift(constraint(key,named,undefined,'selector'));
          } else if (selectedQuote) target.name = selectedQuote.value;
          else if (!kindHit) target.name = selectedText;
          else if (extra && !attribute?.length) target.name = extra;
          else target.context = true;
          readings.push(circuit({span,head,end,target,constraints,lead}));
        }
      }
      // A catalogue noun may also be the start of a written title. Preserve
      // that reading alongside the kind-based reading for a bare title span.
      const bareTitle = !backwards && selected.phrase && !selected.det && !firstQuote &&
        /^\p{Lu}[\p{L}\p{M}\p{N}_ '’\-]*$/u.test(left) &&
        !worlds.properties(normalized(span(selected.phrase.end,marker.start))).length &&
        ts.slice(head.next,i).every(([key]) => !worlds.scopeGrammar.conditionals.has(key));
      if (bareTitle) for (const family of new Set(payloadFamilies)) {
        for (const key of new Set(roleKeys(worlds,family,'payload'))) {
          readings.push(circuit({span,head,end,lead,target:{family,mode:'existing',name:left},
            constraints:[constraint(key,value,span(marker.start,marker.end))]}));
        }
      }
      if (readings.length) return readings;
    }
  }
  return readings;
}

function writtenReplacement(span,ts,head,worlds) {
  const markers=worlds.requestIntents.replacementMarkers.get(head.surface);
  if (!markers?.length || ['?','？'].includes(ts.at(-1)?.[0])) return [];
  const end=ts.length-Number(/^[.!。！]$/u.test(ts.at(-1)?.[0] ?? ''));
  if (end-head.next<3 || end-head.next>24 || ts.slice(head.next,end).some(([key])=>
    !/^[\p{L}\p{M}\p{N}_]+$/u.test(key) || worlds.joiners[key] || worlds.negatives.has(key) ||
    worlds.scopeGrammar.choices.has(key) || worlds.scopeGrammar.conditionals.has(key))) return [];
  const separators=ts.slice(head.next+1,end).flatMap((_,offset)=>{
    const at=head.next+1+offset;
    const width=markers.find(marker=>marker.every((term,i)=>ts[at+i]?.[0]===term))?.length;
    return width && at+width<end ? [{at,after:at+width}] : [];
  });
  if (separators.length!==1) return [];
  const [{at,after}]=separators, backwards=head.object==='replacement';
  const text=(start,stop)=>span(ts[start][2],ts[stop-1][3]);
  const [start,stop]=backwards ? [after,end] : [head.next,at];
  const selected=knownTargets(ts,start,stop,head.act,worlds);
  const particles=worlds.referenceCommands.particles;
  if (!selected.det && (particles.has(ts[start][0]) ||
      worlds.lookup(ts[start][0]).some(([role])=>role==='marker' || role==='act'))) return [];
  if (selected.phrase?.next!==stop && particles.has(ts[stop-1][0])) return [];
  const stateTails=worlds.fixedProperties.get(head.surface) ?? [];
  if (stateTails.some(frame=>frame.tails.some(tail=>tail.length<stop-start &&
      tail.every((term,i)=>ts[stop-tail.length+i][0]===term)))) return [];
  const targetWords=text(start,stop), replacementWords=backwards ? text(head.next,at) : text(at,end);
  const request='@r1 w.request.request act='+encode(head.act)+' mode=replace mood=do predicate='+encode(span(head.start,head.end));
  const prefix=span(0,head.start).trim().replace(/,$/u,'');
  const unread=(id,words,role)=>'@'+id+' w.request.unread request=$r1 text='+quote(words)+' note='+quote(role);
  const common=[request,unread('r1.replacement',replacementWords,'replacement operand')];
  if (prefix) common.push('@r1.lead w.request.filler text='+quote(prefix));
  if (backwards) common.push('@r1.marker w.request.filler text='+quote(text(at,after)));
  const targets=(selected.phrase?.next===stop ? selected.targets : [])
    .filter(([, ,family,mode])=>mode==='existing' && worlds.literalGrammar.licenses(family,head.act))
    .map(([, ,family,,sort])=>({family,sort,sortWords:span(selected.phrase.start,selected.phrase.end)}));
  const phrase=(a,b)=>ts.slice(a,b).map(([key])=>key).join(' ');
  const nominal=phrase(selected.startNominal,stop);
  const lookup=noun=>(worlds.ownerInventory.get(quote([head.act,noun])) ?? [])
    .map(({family,sort})=>['target',head.act,family,'existing',sort]);
  const direct=lookup(nominal);
  for (const [,,family,,sort] of direct.length ? direct : worlds.nominalInflection(nominal,lookup)) {
    if (!worlds.literalGrammar.licenses(family,head.act) || targets.some(t=>t.family===family && t.sort===sort)) continue;
    targets.push({family,sort,sortWords:text(selected.startNominal,stop)});
  }
  const selectorRules=worlds.nominalSelectorRules.filter(rule=>worlds.literalGrammar.licenses(rule.family,head.act));
  for (const rule of selectorRules) {
    for (const target of nominalSelectors([rule],selected.startNominal,stop,phrase,text)) {
      targets.push({...target,family:rule.family});
    }
  }
  const make=lines=>({sop:lines.join('\n'),source:'written-replacement',status:'partial'});
  if (!targets.length) return [make([...common,unread('r1.affected',targetWords,'replaced operand')])];
  return targets.map(({family,sort,sortWords,selector})=>make([...common,
    '@r1.t w.request.target request=$r1 family='+encode(family)+' mode=existing fill=description description='+quote(targetWords)+
      (selected.det ? ' determiner='+selected.det : '')+
      (sort ? ' sort='+encode(sort)+' sort_words='+quote(sortWords) : ''), ...nominalSelectorLines(selector)]));
}

function keysForCue(worlds, surface, family) {
  const direct = [...openKeys(worlds,surface,family), ...roleKeys(worlds,family,undefined,surface)];
  if (direct.length) return [...new Set(direct)];
  if (worlds.literalGrammar.namingLeads.has(surface)) return roleKeys(worlds,family,'name');
  if (worlds.literalGrammar.contentLeads.has(surface)) return roleKeys(worlds,family,'payload');
  return [];
}

function creation(span, ts, quotes, head, worlds) {
  const stop = ts.findIndex(token => token[2] === quotes[0].start);
  const known = knownTargets(ts,head.next,stop,head.act,worlds);
  if (!known.targets || definite.has(known.det)) return [];
  const readings = [];
  for (const [, ,family,mode,sort] of known.targets) {
    if (mode !== 'new') continue;
    const cueList = (start,limit) => phrases(ts,start,limit)
      .map(cue => ({...cue,keys:keysForCue(worlds,cue.surface,family)})).filter(cue => cue.keys.length);
    const constraints = [];
    let pos = known.phrase.next, end = known.phrase.end, quoted = false;
    while (pos < ts.length) {
      const cue = cueList(pos,ts.length)[0];
      if (!cue) break;
      const literal = quotes.find(item => item.start === ts[cue.next]?.[2]);
      const cueWords = span(cue.start,cue.end);
      if (literal) {
        constraints.push(cue.keys.map(key => constraint(key,literal.value,cueWords)));
        end = literal.end;
        const distance = clauseEnds(ts,cue.next,end);
        quoted = true;
        if (distance < 0) break;
        pos = cue.next + distance;
      } else {
        let following = stop;
        for (let i = cue.next + 1; i < stop; i++) {
          if (cueList(i,stop).some(candidate => candidate.next === stop)) { following = i; break; }
        }
        if (following === stop) break;
        const value = span(ts[cue.next][2],ts[following][2]).trim();
        constraints.push(cue.keys.map(key => constraint(key,value,cueWords)));
        pos = following;
      }
    }
    if (!quoted) continue;
    const target = {family,mode,sort,det:known.det,surface:span(known.phrase.start,known.phrase.end)};
    const preferred = constraints.map(([first]) => first);
    readings.push(circuit({span,head,end,target,constraints:preferred}));
    // Retain each genuine alternative without combining unrelated ambiguities.
    constraints.forEach(([, ...rest], i) => {
      for (const choice of rest) {
        const fields = preferred.with(i,choice);
        readings.push(circuit({span,head,end,target,constraints:fields}));
      }
    });
  }
  return readings;
}

export function compileCreationRoles(facts,requestKeys,words) {
  const get = (wire,key) => (wire.attrs[key] ?? []).map(raw => raw.startsWith('"') ? JSON.parse(raw) : raw);
  const byCue=new Map(), preposed=[], named=[];
  for (const wire of facts('pro.reader.creation_role')) {
    const [family]=get(wire,'family'), [attribute]=get(wire,'attribute');
    const sortKeys=get(wire,'sort_key'), sorts=get(wire,'sort');
    const keys=requestKeys.filter(key=>key.family===family);
    if (!keys.some(key=>key.name===attribute && key.head.split('+').includes('span') && !key.values.length)) continue;
    const banks=sortKeys.map(name=>keys.find(key=>key.name===name)?.values);
    if (banks.some(bank=>!bank?.length)) continue;
    const bank=banks.flat();
    const cues=get(wire,'text').map(normalized).filter(Boolean);
    const rule={family,attribute,sorts:new Map(sorts.map(sort=>[normalized(sort.replaceAll('_',' ')),sort])),
      bank:new Map(bank.map(sort=>[normalized(sort.replaceAll('_',' ')),sort]))};
    for (const cue of cues) {
      const list=byCue.get(cue) ?? [];
      list.push(rule);
      byCue.set(cue,list);
    }
    if (get(wire,'preposed')[0]==='true' && (bank.length || sorts.length)) preposed.push(rule);
    const [type]=get(wire,'value_type');
    if (type) named.push({...rule,values:nativeInventory(facts,type,words)});
  }
  return {byCue,preposed,named};
}

function plainCreationTail(ts,start,end,worlds) {
  const input=ts.slice(start,end);
  if (!input.length || !input.some(([key])=>/\p{L}/u.test(key))) return false;
  return input.every(([key,,a,b],i)=>{
    if (/^[\p{L}\p{M}\p{N}_]+$/u.test(key)) {
      if (worlds.negatives.has(key) || worlds.joiners[key]) return false;
      return !phrases(ts,start+i,end).some(({surface})=>
        worlds.scopeGrammar.negatives.has(surface) || worlds.scopeGrammar.conditionals.has(surface) ||
        worlds.lookup(surface).some(([role])=>role==='marker'));
    }
    return ['-',"'",'’'].includes(key) && input[i-1]?.[3]===a && input[i+1]?.[2]===b;
  });
}

function declaredCreation(span,ts,quotes,head,worlds) {
  const roles=worlds.literalGrammar.creationRoles;
  if (!roles || ts.at(-1)?.[0]==='?' && head.start===0) return [];
  const stop=ts.length-Number(['.','!','?'].includes(ts.at(-1)?.[0]));
  const det=phrases(ts,head.next,stop).find(choice=>Object.hasOwn(worlds.determiners,choice.surface));
  if (definite.has(worlds.determiners[det?.surface])) return [];
  const noun=det?.next ?? head.next;
  if (noun>=stop) return [];
  const readings=new Map();
  function addLiteral(rule,value,sort,kind,cue) {
    const target={family:rule.family,mode:'new',sort,surface:kind,det:worlds.determiners[det?.surface]};
    const candidate=circuit({span,head,end:ts[stop-1][3],target,constraints:[constraint(rule.attribute,value,cue)]});
    const choices=readings.get(rule.family) ?? new Map();
    choices.set(candidate.sop,{...candidate,source:'literal-creation',status:'matched'});
    readings.set(rule.family,choices);
  }
  for (const nominal of phrases(ts,noun,stop)) {
    const cueStart=nominal.next+Number(ts[nominal.next]?.[0]===',');
    for (const cue of phrases(ts,cueStart,stop)) {
      if (cue.next>=stop || quotes.some(q=>q.start<cue.end && q.end>nominal.start)) continue;
      const pending=roles.byCue.get(cue.surface);
      if (!pending?.length) continue;
      const literal=quotes.find(q=>q.start===ts[cue.next][2] && q.end===ts[stop-1][3]);
      if (!literal && (quotes.length || !plainCreationTail(ts,cue.next,stop,worlds))) continue;
      const value=literal?.value ?? span(ts[cue.next][2],ts[stop-1][3]);
      if (!value.trim() || (!literal && worlds.isReference(value))) continue;
      const matches=worlds.lookup(nominal.surface)
        .filter(([role,act,,mode])=>role==='target' && act===head.act && mode==='new');
      for (const rule of pending) {
        const {family,sorts,bank}=rule;
        const sense=matches.find(([, ,owner])=>owner===family);
        const sort=bank.get(nominal.surface) ?? (sense && sorts.get(nominal.surface));
        if (!sort && (sorts.size || bank.size || !sense)) continue;
        addLiteral(rule,value,sort || sense?.[4],span(nominal.start,nominal.end),span(cue.start,cue.end));
      }
    }
  }
  if (!head.implicit) {
    const properToken=([,raw])=>/^\p{Lu}[\p{L}\p{N}\p{M}_-]*$/u.test(raw);
    if (!det && !quotes.length && ts.slice(noun,stop).every(properToken)) {
      const value=span(ts[noun][2],ts[stop-1][3]);
      for (const rule of roles.named) {
        if (rule.values.get(normalized(value))?.size===1 && worlds.literalGrammar.licenses(rule.family,head.act))
          addLiteral(rule,value);
      }
    }
    for (let at=noun+1;at<stop && at<=noun+8;at++) {
      const kind=span(ts[at][2],ts[stop-1][3]);
      const quoted=quotes.find(q=>q.start===ts[noun][2] && q.end===ts[at-1][3]);
      if (!quoted && (!det || !ts.slice(noun,at).every(properToken))) continue;
      const value=quoted?.value ?? span(ts[noun][2],ts[at-1][3]);
      if (!value || worlds.isReference(value)) continue;
      for (const rule of roles.preposed) {
        const sort=rule.bank.get(normalized(kind)) ?? rule.sorts.get(normalized(kind));
        if (!sort || !worlds.literalGrammar.licenses(rule.family,head.act)) continue;
        if (!quoted && ts.slice(noun,at).some(([key])=>worlds.lookup(key).some(([role,,family])=>
          role==='constraint' && family===rule.family))) continue;
        addLiteral(rule,value,sort,kind);
      }
    }
  }
  return [...readings.values()].flatMap(choices=>choices.size===1 ? [...choices.values()] : []);
}

export function literalRoleCandidates(text, ts, quotes, worlds) {
  if (!worlds.literalGrammar || !ts.length) return [];
  const chars = Array.from(text);
  const span = (start,end) => chars.slice(start,end).join('');
  const scope = maskQuoted(text,quotes);
  if (/\b(?:not|never|without|except|instead|but)\b|n['’]t\b/iu.test(scope)) return [];
  const heads=requestHeads(ts,worlds);
  // An overt naming cue and a typed nominal can license a creation fragment
  // even when the speaker supplies no verb. Keep the predicate unwritten.
  const fragment={act:'make',next:0,start:0,end:0,implicit:true};
  return [...declaredCreation(span,ts,quotes,fragment,worlds),...heads.flatMap(head => {
    if (head.act==='make') return [
      ...declaredCreation(span,ts,quotes,head,worlds),
      ...(quotes.length ? creation(span,ts,quotes,head,worlds) : [])
    ];
    return quotes.length ? replacement(span,ts,quotes,head,worlds) : writtenReplacement(span,ts,head,worlds);
  })];
}
