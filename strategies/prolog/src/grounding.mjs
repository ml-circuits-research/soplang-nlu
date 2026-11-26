import { quotedPredicates } from './predicate-scope.mjs';
import { catalogReference, literalRanges, literalField, sortRanges } from './evidence.mjs';
import { parse } from './schema.mjs';

const decode = value => value?.startsWith('"') ? JSON.parse(value) : value;

const normalize = text => text.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu,' ');

// Resolve a changed categorical payload only through the same target family or
// property in the current world. Similar spelling alone supplies no semantics.
export function valueResolver(worlds) {
  const keys = new Map();
  for (const row of worlds.requestKeys) {
    const id = JSON.stringify([row.family,row.name]);
    if (!keys.has(id)) keys.set(id,new Map());
    for (const value of row.values) keys.get(id).set(normalize(value),value);
  }
  return ({attribute,family,surface}) => {
    if (!family || !surface) return;
    const term = normalize(surface);
    const values = new Set();
    const closed = keys.get(JSON.stringify([family,attribute]))?.get(term);
    if (closed !== undefined) values.add(closed);
    for (const [role,,target,body] of worlds.lookup(term)) {
      if (target !== family || role !== 'constraint') continue;
      const [wire] = parse('@c w.request.constraint ' + body);
      if (decode(wire.attrs.attribute?.[0]) === attribute && wire.attrs.value?.length === 1) {
        values.add(decode(wire.attrs.value[0]));
      }
    }
    if (values.size === 1) return values.values().next().value;
  };
}

const atom = /^[\p{L}_][\p{L}\p{M}\p{N}_.-]*$/u;
function literal(value) {
  return atom.test(value) ? value : JSON.stringify(value);
}

// Resolve case and aliases against this utterance. An enum stays canonical,
// while words= records the actual evidence that selected it.
export function constraintGrounder() {
  const parsed = new Map();
  return (entry, surface) => {
    const body = entry[3];
    if (!parsed.has(body)) parsed.set(body,parse('@c w.request.constraint ' + body)[0].attrs);
    const attrs = {...parsed.get(body)};
    const lower = surface.toLowerCase();
    for (const key of ['words','key_words','measure_words']) {
      if (!attrs[key]) continue;
      const bounds = attrs[key].map(v => {
        const word = decode(v);
        if (surface.includes(word)) return v;
        const i = lower.indexOf(word.toLowerCase());
        return i < 0 ? null : literal(surface.slice(i,i+word.length));
      });
      if (bounds.includes(null)) return null;
      attrs[key] = bounds;
    }
    if (attrs.value && !attrs.words && attrs.value.some(v => !surface.includes(decode(v)))) attrs.words = [literal(surface)];
    if (attrs.words) {
      attrs.value = (attrs.value ?? []).map(v => {
        const val = decode(v);
        return atom.test(val) && !surface.includes(val) ? val : v;
      });
    }
    const grounded = Object.entries(attrs).flatMap(([k,vs])=>vs.map(v=>k+'='+v)).join(' ');
    return [...entry.slice(0,3),grounded,entry[4]];
  };
}

// Check copied evidence inside the owning request before returning that reading.
export function evidenceInText(text, sop, worlds) {
  const wires = parse(sop);
  if (quotedPredicates(text,wires).length) return false;
  const scopes = new Map(wires.filter(w => w.type === 'w.request.request')
    .map(w => ['$'+w.id,w.attrs.words?.length ? decode(w.attrs.words[0]) : text]));
  const families = new Map();
  for (const {type,attrs} of wires) if (type==='w.request.target' && attrs.request?.length && attrs.family?.length) {
    const req=attrs.request[0], group=families.get(req) ?? new Set();
    group.add(decode(attrs.family[0]));
    families.set(req,group);
  }
  for (const {id,type,attrs} of wires) {
    if (['w.request.clock','w.request.previous','w.request.context'].includes(type)) return false;
    const scope = scopes.get(type === 'w.request.request' ? '$'+id : attrs.request?.[0]) ?? text;
    const present = phrase => literalRanges(scope,phrase).length > 0;
    if (type === 'w.request.target' && attrs.sort && worlds?.isReference?.(decode(attrs.sort_words?.[0] ?? attrs.sort[0]))) {
      return false;
    }
    if (type==='w.request.target' && attrs.sort && !attrs.sort_words && !sortRanges(scope,decode(attrs.sort[0])).length) return false;
    for (const [key,vs] of Object.entries(attrs)) {
      if (literalField(key) && vs.some(v => !catalogReference(worlds?.evidenceVocabulary,{type},key,v) && !literalRanges(key === 'words' && type==='w.request.request' ? text : scope,decode(v)).length)) return false;
    }
    if (type === 'w.request.constraint' && attrs.value?.some(v => {
      if (attrs.words?.length && !v.startsWith('"') || present(decode(v))) return false;
      const owners=families.get(attrs.request?.[0]);
      if (owners?.size!==1 || !attrs.attribute?.length) return true;
      const [family]=owners;
      return !attrs.words?.some(words=>worlds?.declaredValueAlias?.(family,decode(attrs.attribute[0]),decode(words),decode(v)));
    })) return false;
    if (type === 'w.request.intent' && (!attrs.words?.length || attrs.value?.some(v =>
      !literalRanges(decode(attrs.words[0]),decode(v)).length))) return false;
  }
  return true;
}
