import { constraintGrounder } from './grounding.mjs';
import { parse } from './schema.mjs';

const kind = slot => 'w.request.' + slot;
const quote = JSON.stringify;
const decode = value => value?.startsWith('"') ? JSON.parse(value) : value;
const atom = value => /^[\p{L}_][\p{L}\p{M}\p{N}_.-]*$/u.test(value) ? value : quote(value);
const code = /^(\p{L}+)[0-9]+$/u;
const number = /^[0-9]+$/u;
const label = /^\p{Lu}[\p{L}\p{M}_]*$/u;
const letter = /^\p{Lu}$/u;
const predicatesLimit = 8;

function requestHead(ts, worlds, byStart, end) {
  for (let start = Math.min(end - 2, 11); start >= 0; start--) {
    const lead = ts.slice(0,start).map(([form]) => form).filter(form => form !== ',').join(' ');
    if (lead && !worlds.literalGrammar.leads.has(lead) && !worlds.fillerPhrases.has(lead)) continue;
    if (ts[end]?.[0] === '?' && !worlds.literalGrammar.leads.has(lead)) continue;
    const verbs = (byStart.get(start) ?? []).filter(({next,entry:[role,,mood]}) =>
      role === 'act' && (!mood || mood === 'do') && next < end && next <= start + predicatesLimit);
    if (!verbs.length) continue;
    const next = Math.max(...verbs.map(verb => verb.next));
    const native = worlds.lookup(ts.slice(start,next).map(t => t[0]).join(' '))
      .filter(([role,,mood]) => role === 'act' && (!mood || mood === 'do'));
    const senses = verbs.filter(verb => verb.next === next);
    const support = Math.max(...senses.map(({entry}) => entry.at(-1)));
    const selected = native.length ? native : senses.filter(({entry}) => entry.at(-1) === support).map(({entry}) => entry);
    return {start,next,acts:[...new Set(selected.map(entry => entry[1]))]};
  }
}

function wire(id, type, fields) {
  return [`@${id}`,kind(type),...Object.entries(fields).flatMap(([key,value]) =>
    (Array.isArray(value) ? value : [value]).map(item => key + '=' + item))].join(' ');
}

function proposal({act, family, head, target, ids, spatial, result, unread}) {
  const attributes = {request:'$r1',family:quote(family),mode:'existing',
    fill:target?.numbered ? 'description' : 'written'};
  if (target?.sort) {
    attributes.sort = quote(target.sort);
    if (target.sort !== target.noun) attributes.sort_words = quote(target.noun);
  } else if (target?.noun) attributes.family_words = quote(target.noun);
  if (ids.length) attributes.ids = ids.map(quote);
  if (target?.numbered) {
    attributes.description = quote(target.surface);
    attributes.code_words = quote(target.surface);
  }
  const lines = [
    wire('r1','request',{act:quote(act),mood:'do',predicate:quote(head)}),
    wire('r1.t','target',attributes),
  ];
  if (spatial) {
    lines.push(wire('r1.rel','constraint',{request:'$r1',on:'place',attribute:quote(spatial.relationKey),
      value:atom(spatial.value),words:quote(spatial.marker),operator:'relation',phase:'result'}));
    lines.push(wire('r1.anchor','constraint',{request:'$r1',on:'place',attribute:quote(spatial.anchorKey),
      value:quote(spatial.anchor),operator:'relation',phase:'selector'}));
    lines.push(wire('r1.lookup','lookup',{request:'$r1',constraint:'$r1.anchor',key:'thing',from:'page'}));
  }
  if (result) lines.push('@r1.property w.request.constraint request=$r1 ' + result);
  if (unread) lines.push(wire('r1.u1','unread',{request:'$r1',text:quote(unread)}));
  return {sop:lines.join('\n'),source:'instance-reference',support:0,status:unread ? 'partial' : 'matched'};
}

export function createInstanceReferenceReader(worlds) {
  const byPrefix = new Map(), eligibleFamilies = new Set(), spatialRoles = new Map();
  const actsWith = role => new Set(worlds.acts.filter(wire => wire.attrs.role?.includes(role))
    .map(wire => decode(wire.attrs.name?.[0])));
  const thingActs = actsWith('thing'), spatialActs = actsWith('place');
  for (const {family,prefix} of worlds.instanceBindings ?? []) {
    const families = byPrefix.get(prefix) ?? new Set();
    families.add(family);
    byPrefix.set(prefix,families);
    eligibleFamilies.add(family);
  }
  for (const binding of worlds.spatialBindings) {
    const keys = worlds.requestKeys.filter(key => key.family === binding.family);
    const relation = keys.find(key => key.name === binding.relationKey && key.head === 'class');
    const anchor = keys.find(key => key.name === binding.anchorKey && key.head === 'fill+span' && !key.values.length);
    if (!relation || !anchor) continue;
    const entries = spatialRoles.get(binding.family) ?? [];
    entries.push({...binding,values:new Set(relation.values)});
    spatialRoles.set(binding.family,entries);
  }
  const ground = constraintGrounder();

  return (text, ts, quotes, hits) => {
    if (!ts.some(([form,raw]) => code.test(form) || number.test(form) || letter.test(raw))) return [];
    const chars = Array.from(text);
    const span = (a,b) => chars.slice(ts[a][2],ts[b-1][3]).join('');
    const visible = ts.map(([form,,start,end]) => !quotes.some(q => q.start < end && q.end > start) && form);
    if (visible.some(form => worlds.negatives.has(form) || worlds.joiners[form] === 'condition')) return [];
    let end = ts.length;
    while (['.','!','?'].includes(visible[end-1])) end--;
    const pos = new Map(ts.map(([, ,offset],i) => [offset,i]));
    const after = new Map(ts.map(([, , ,offset],i) => [offset,i+1]));
    const byStart = new Map();
    for (const [start, stop, entry] of hits) {
      if (!['act','target'].includes(entry[0])) continue;
      const at = pos.get(start), next = after.get(stop);
      if (at === undefined || next === undefined || !visible.slice(at,next).every(Boolean)) continue;
      const entries = byStart.get(at) ?? [];
      entries.push({next,entry});
      byStart.set(at,entries);
    }
    const request = requestHead(ts,worlds,byStart,end);
    if (!request) return [];
    const first = ['definite','demonstrative'].includes(worlds.determiners[visible[request.next]])
      ? request.next + 1 : request.next;

    const member = (at,act) => {
      const options = [];
      if (!visible[at]) return options;
      const prefix = code.exec(visible[at])?.[1];
      const families = prefix && byPrefix.get(prefix);
      if (families) options.push({next:at+1,id:ts[at][1],families,coded:true});
      else if (!prefix && label.test(ts[at][1])) options.push({next:at+1,id:ts[at][1],families:eligibleFamilies});
      for (const {next,entry:[role,action,family,mode,sort]} of byStart.get(at) ?? []) {
        const form = visible[next], idPrefix = form && code.exec(form)?.[1];
        if (role !== 'target' || action !== act || mode === 'bound' || !form) continue;
        const numbered = number.test(form);
        if (!numbered && !byPrefix.get(idPrefix)?.has(family) && !letter.test(ts[next][1])) continue;
        if (numbered && visible[next+1] === '.' && number.test(visible[next+2] ?? '') &&
            ts[next][3] === ts[next+1][2] && ts[next+1][3] === ts[next+2][2]) continue;
        options.push({next:next+1,noun:span(at,next),sort,families:new Set([family]),numbered,
          coded:!numbered,id:numbered ? undefined : ts[next][1],surface:span(at,next+1)});
      }
      const max = Math.max(...options.map(option => option.next));
      return options.filter(option => option.next === max);
    };

    // A comma or declared coordinating conjunction may extend the same object
    // role. A new predicate remains in the tail for the normal clause reader.
    const listMember = (next,act) => {
      const comma = worlds.joiners[visible[next]] === 'list-or-clause';
      const conjunction = worlds.joiners[visible[next + Number(comma)]] === 'coordination';
      return comma || conjunction ? member(next + Number(comma) + Number(conjunction),act) : [];
    };
    const relation = (at,act,family) => {
      for (let stop = Math.min(at + 8,end - 1); stop > at; stop--) {
        const form = visible.slice(at,stop).join(' ');
        const markers = worlds.lookup(form).filter(([role,license,slot,value]) =>
          role === 'marker' && value && ((license === '*' && slot === 'spatial') || (license === act && slot === 'place')));
        if (!markers.length) continue;
        const anchorAt = ['definite','demonstrative'].includes(worlds.determiners[visible[stop]]) ? stop+1 : stop;
        for (const anchor of member(anchorAt,act)) {
          if ((!anchor.numbered && !anchor.coded)) continue;
          for (const [,,,value] of markers) {
            const spatial = (spatialRoles.get(family) ?? []).filter(binding => binding.values.has(value));
            if (spatial.length === 1) return {...spatial[0],value,marker:span(at,stop),anchor:span(stop,anchor.next),next:anchor.next};
          }
        }
      }
    };
    const candidates = [];
    for (const act of request.acts.filter(act => thingActs.has(act))) {
      for (const target of member(first,act)) {
        for (const family of target.families) {
          if (!worlds.literalGrammar.licenses(family,act) && !target.noun) continue;
          const ids = target.id ? [target.id] : [];
          let next = target.next, typed = target.coded || target.numbered, conflict = false;
          if (!target.numbered) {
            for (let options; (options = listMember(next,act)).length;) {
              const item = options.find(option => option.families.has(family) && option.id);
              if (!item) { conflict = true; break; }
              ids.push(item.id);
              typed ||= item.coded;
              next = item.next;
            }
          }
          if (conflict || (!typed && ids.length < 2)) continue;
          const spatial = spatialActs.has(act) ? relation(next,act,family) : undefined;
          next = spatial?.next ?? next;
          const result = next < end && !spatial && visible.slice(next,end).every(Boolean) &&
            worlds.lookup(visible.slice(next,end).join(' '))
              .filter(([role,license,owner]) => role === 'constraint' && (license === '*' || license === act) && owner === family)
              .map(entry => ground(entry,span(next,end))?.[3]).filter(body =>
                body && parse('@p w.request.constraint ' + body)[0].attrs.phase?.[0] === 'result');
          candidates.push(proposal({act,family,head:span(request.start,request.next),target,ids:[...new Set(ids)],
            spatial,result:result?.length === 1 ? result[0] : undefined,
            unread: next < end && result?.length !== 1 ? span(next,end) : undefined}));
        }
      }
    }
    return candidates;
  };
}
