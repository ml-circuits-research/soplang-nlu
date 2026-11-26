import { inflectBy, str } from './knowledge.mjs';

const rule = 'w.lang.en.inflect';
const irregular = 'w.lang.en.irregular';
const form = 'w.lang.en.irregular_form';
const exception = 'w.lang.en.noun.exception';
export const nominalInflectionTypes = [rule, irregular, form, exception];

const word = /^[\p{L}\p{M}]+$/u;
const field = (wire, key) => str(wire.attrs[key]?.[0]);

function index(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

export function createNominalInflection(facts) {
  const irregulars = new Map(), byLemma = new Map(), explicit = new Map();
  for (const wire of facts(irregular)) {
    const singular = field(wire, 'singular'), plural = field(wire, 'plural');
    for (const label of new Set([singular, plural])) index(irregulars, label, wire);
    index(explicit, plural, singular);
  }
  for (const wire of facts(form)) {
    if (field(wire, 'num') !== 'pl') continue;
    const lemma = field(wire, 'lemma'), surface = field(wire, 'form');
    index(byLemma, lemma, wire);
    index(explicit, surface, lemma);
  }

  const rules = facts(rule), exceptions = facts(exception), reverse = new Map();
  function inflect(text, op) {
    const world = {ofType(type) {
      if (type === irregular) return irregulars.get(text) ?? [];
      if (type === form) return byLemma.get(text) ?? [];
      return type === exception ? exceptions : rules;
    }};
    return inflectBy(world, text, op, {all:true});
  }
  function lemmas(text) {
    if (!reverse.has(text)) {
      const declarations = explicit.get(text);
      const candidates = declarations ?? inflect(text, 'singular')
        .filter(lemma => inflect(lemma, 'plural').includes(text));
      reverse.set(text, [...new Set(candidates)].filter(lemma => lemma && lemma !== text));
    }
    return reverse.get(text);
  }

  return (surface, lookup) => {
    const parts = surface.split(' '), head = parts.at(-1);
    if (!word.test(head) || (!head.endsWith('s') && !explicit.has(head)) ||
        parts.some(part => !word.test(part))) return [];
    const prefix = parts.length > 1 ? parts.slice(0,-1).join(' ') + ' ' : '';
    const candidates = lemmas(head).map(lemma => lookup(prefix + lemma).filter(([role]) => role === 'target'))
      .filter(senses => senses.length);
    // When the language supplies two different licensed noun lemmas, neither
    // is a reliable fallback. A single lemma can still have multiple senses.
    return candidates.length === 1 ? candidates[0] : [];
  };
}
