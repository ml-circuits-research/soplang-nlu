import { HYP_KINDS, isIndependentValueCandidate, unquoteSop } from '../contracts.mjs';

const isTypedHead = (c) => c.kind === HYP_KINDS.TARGET_SORT || c.kind === HYP_KINDS.TARGET_FAMILY;
const isWrittenName = (c) => c.kind === HYP_KINDS.TARGET_REF && c.name && (c.isCode || c.isQuoted || c.isProper);
const isUncounted = (c) => c.count == null && !c.quantifier && !c.ordinal && c.det !== 'indefinite';

function ownerAt(candidates, from, to) {
  const nounStart = (c) => Math.min(c.startTok, c.detTok >= 0 ? c.detTok : c.startTok);
  const startsAt = (c) => nounStart(c) === from;
  const typed = candidates.filter((c) => isTypedHead(c) && isUncounted(c) && startsAt(c) && c.endTok <= to);
  const names = candidates.filter((c) => isWrittenName(c) && isUncounted(c) && c.endTok === to);
  const owners = typed.filter((head) => head.endTok === to);
  for (const name of names) {
    if (startsAt(name)) owners.push(name);
    for (const head of typed) {
      const intro = candidates.find((c) => c.isNameIntro && c.startTok === head.endTok + 1 && c.endTok === name.startTok - 1);
      if (head.endTok + 1 === name.startTok || intro) owners.push({ ...head, name: name.name });
    }
  }
  const partOwners = candidates.filter((c) => c.partHead && c.startTok >= from && c.endTok <= to);
  const ownedParts = partOwners.flatMap((partOwner) => candidates.filter((head) =>
    isTypedHead(head) && isUncounted(head) && head.family === 'part' &&
    head.startTok === partOwner.partHead[0] && head.endTok === partOwner.partHead[1] &&
    Math.min(nounStart(head), partOwner.startTok) === from && Math.max(head.endTok, partOwner.endTok) === to)
    .map((head) => ({ ...head, partOwner })));
  return ownedParts.length ? ownedParts : owners;
}

export function sharedResultReadings(lattice, grammar, keys, maxRequests, partNames) {
  if (maxRequests < 2 || !grammar.constructions.has('coord.shared-suffix')) return [];
  const { text, tokens, candidates, splitPoints } = lattice;
  const separators = splitPoints.filter((cut) => !cut.isStrong && grammar.coordinators.has(cut.text.toLowerCase()));
  const cuts = separators.flatMap((cut, index) => {
    const next = separators[index + 1];
    if (cut.text === ',' && next?.startTok === cut.endTok + 1) return [];
    const prev = separators[index - 1];
    return prev?.text === ',' && prev.endTok + 1 === cut.startTok
      ? [{ ...cut, startTok: prev.startTok }] : [cut];
  });
  if (!cuts.length || cuts.length >= maxRequests) return [];
  // Only a single directive can supply the prefix, and every head must have
  // its own written evidence. A separate instruction remains in the base lattice.
  const predicates = candidates.filter((c) => c.kind === HYP_KINDS.PREDICATE && c.endTok < cuts[0].startTok &&
    tokens.slice(0, c.startTok).every((t) => t.isFiller || t.text === ',') &&
    c.licensed?.some((licence) => licence.act === 'change' && ['none', 'set'].includes(licence.mode ?? 'none')));
  if (!predicates.length) return [];
  const atEnd = (c) => tokens.slice(c.endTok + 1).every((t) => t.isFiller || ['.', '!', '?'].includes(t.text));
  // A result must refer to a declared property. An arrangement phrase on
  // coordinated objects can describe the set as a whole.
  const values = candidates.filter((c) => c.startTok > cuts.at(-1).endTok + 1 && atEnd(c) &&
    c.kind === HYP_KINDS.CONSTRAINT && c.value != null && ['eq', 'degree'].includes(c.operator ?? 'eq') &&
    keys.get(c.attribute)?.means && !grammar.arrangements.has(c.text.toLowerCase()) &&
    (isIndependentValueCandidate(c) || (!c.requiresKeyWord && !c.openValue && !c.needsAnchor && !c.isAnchor &&
      !c.pairedConstraints?.length && (keys.get(c.attribute)?.values?.has(String(c.value).toLowerCase()) ||
        (c.operator === 'degree' && c.phase === 'result')))));
  const readings = [];
  for (const from of new Set(values.map((v) => v.startTok))) {
    const suffixStart = tokens[from].start;
    for (const predicate of predicates) {
      const starts = [predicate.endTok + 1, ...cuts.map((cut) => cut.endTok + 1)];
      const ends = [...cuts.map((cut) => cut.startTok - 1), from - 1];
      const firstOwners = ownerAt(candidates, starts[0], ends[0]);
      const possessive = firstOwners.find((c) => c.det === 'possessive' && c.partOwner?.startTok === starts[0] &&
        c.partOwner.endTok === starts[0])?.partOwner;
      const heads = starts.map((start, index) => {
        const end = ends[index];
        if (start > end) return null;
        let owners = index === 0 ? firstOwners : ownerAt(candidates, start, end);
        if (!owners.length) return null;
        let head = text.slice(tokens[start].start, tokens[end].end);
        let scopeStart = tokens[start].start;
        if (index > 0 && possessive && !owners.some((c) => c.partOwner)) {
          const parts = owners.filter((c) => c.sort && c.det === 'none' &&
            (c.family === 'part' || partNames?.has(c.text.toLowerCase())));
          if (parts.length) {
            owners = parts.map((c) => ({ ...c, family: 'part', partOwner: possessive }));
            head = `${possessive.lookupWords} ${head}`;
            scopeStart = possessive.start;
          }
        }
        const prefix = text.slice(0, tokens[predicate.endTok].end);
        return { owners, start: scopeStart, projectedText: `${prefix} ${head} ${text.slice(suffixStart)}` };
      });
      if (heads.every(Boolean)) readings.push({ heads, predicate, values: values.filter((v) => v.startTok === from) });
    }
  }
  return readings;
}

export function independentChange(wires, { owners, predicate, values, keys }) {
  const requests = wires.filter((w) => w.type === 'w.request.request');
  const targets = wires.filter((w) => w.type === 'w.request.target');
  const constraints = wires.filter((w) => w.type === 'w.request.constraint');
  const [request] = requests;
  const [target] = targets;
  const attr = (wire, key) => unquoteSop(wire.attrs[key]?.[0] ?? '');
  const results = constraints.filter((wire) => attr(wire, 'phase') === 'result');
  const [result] = results;
  const selectors = constraints.filter((wire) => attr(wire, 'phase') === 'selector' && attr(wire, 'attribute') === 'part.owner');
  const [selector] = selectors;
  if (requests.length !== 1 || targets.length !== 1 || results.length !== 1 ||
      selectors.length > 1 || constraints.length !== results.length + selectors.length ||
      wires.some((w) => w.type === 'w.request.unread') ||
      attr(request, 'act') !== 'change' || attr(request, 'mood') !== 'do' ||
      attr(request, 'predicate') !== predicate.text || attr(target, 'mode') !== 'existing') return null;

  const family = attr(target, 'family');
  const sort = attr(target, 'sort');
  const name = attr(target, 'name');
  const partOwner = selector ? attr(selector, 'value') : '';
  const lookup = selector ? wires.find((wire) => wire.type === 'w.request.lookup' &&
    attr(wire, 'constraint') === `$${selector.id}` && attr(wire, 'key') === 'thing') : null;
  if (!owners.some((owner) => (!owner.family || family === owner.family) &&
      (!owner.sort || sort === owner.sort) && (owner.name ?? '') === name &&
      (owner.partOwner?.value ?? '') === partOwner &&
      (owner.partOwner?.lookupWords ?? '') === (lookup ? attr(lookup, 'words') : ''))) return null;

  const key = keys.get(attr(result, 'attribute'));
  const value = attr(result, 'value');
  const operator = attr(result, 'operator');
  if (!key || key.family !== family) return null;
  const writtenValue = values.find((v) => v.attribute === key.name && String(v.value) === value && (v.operator ?? 'eq') === operator);
  if (!writtenValue) return null;

  return {
    target: JSON.stringify(name ? ['name', name.toLowerCase()] : [family, sort, partOwner]),
    property: key,
    resultEnd: writtenValue.end,
    effect: JSON.stringify([operator, value, attr(result, 'measure'), attr(result, 'unit')]),
  };
}
