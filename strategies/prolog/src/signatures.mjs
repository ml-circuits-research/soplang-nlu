import { str } from './knowledge.mjs';

// Request order is meaningful. Other wire positions and local IDs are incidental.
const REQUEST = 'w.request.request';
const AUXILIARY = new Set(['w.request.filler', 'w.request.unread']);
const EVIDENCE = new Set(['words', 'predicate', 'asked_words', 'name_words', 'key_words', 'measure_words', 'family_words']);

export function signatures(wires, semantic = false) {
  const kept = wires.filter(w => !semantic || !AUXILIARY.has(w.type));
  let requestIndex = 0;
  const records = kept.map(wire => {
    const request = wire.type === REQUEST ? requestIndex++ : null;
    // Without a bound endpoint, this literal is the only written reference.
    const unresolvedThing = semantic && wire.type === 'w.request.lookup' && str(wire.attrs.key?.[0]) === 'thing' &&
      wire.attrs.request?.length && !wire.attrs.target?.length && !wire.attrs.constraint?.length &&
      !wire.attrs.antecedent?.length;
    const slots = Object.entries(wire.attrs).filter(([key]) => {
      if (!semantic || !EVIDENCE.has(key)) return true;
      return key === 'words' && (unresolvedThing || wire.type === 'w.request.constraint' && !wire.attrs.value?.length);
    }).sort(([a], [b]) => a.localeCompare(b));
    const reference = unresolvedThing && slots.find(([key]) => key === 'words');
    if (reference) reference[1] = reference[1].map(value => JSON.stringify(str(value)));
    return { ...wire, request, slots };
  });
  const ids = new Map(records.map(record => [record.id, record]));
  // Resolve links to node descriptions, breaking reverse links and cycles at the
  // destination's local description. This is a structural proxy, not an executor.
  const encode = (record, visiting) => [
    record.type,
    record.request,
    record.slots.map(([key, values]) => [key, values.map(value => {
      const dest = value.startsWith('$') && ids.get(value.slice(1));
      if (!dest) return value;
      if (visiting.has(dest.id)) return ['cycle', dest.type, dest.request];
      return ['ref', encode(dest, new Set([...visiting, dest.id]))];
    })]),
  ];
  return records.map(record => JSON.stringify(encode(record, new Set([record.id])))).sort();
}

export function intersectCount(a, b) {
  let i = 0, j = 0, matched = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      matched++;
      i++;
      j++;
    } else if (a[i] < b[j]) {
      i++;
    } else {
      j++;
    }
  }
  return matched;
}
