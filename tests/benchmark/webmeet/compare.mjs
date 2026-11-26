// Fair semantic & annotation-quality comparator for SOP Lang w.request circuits.

import { KEY_ALIASES, unquoteSop } from '../../../strategies/z3/src/contracts.mjs';

const TOKEN_RE = /[A-Za-z0-9]+(?:['\u2019][A-Za-z]+)?/g;

function firstAttr(w, key) {
  const arr = w?.attrs?.[key];
  return arr && arr.length ? unquoteSop(arr[0]) : undefined;
}

function allAttrs(w, key) {
  return (w?.attrs?.[key] ?? []).map((v) => unquoteSop(v));
}

function summarizeWires(wires) {
  if (!Array.isArray(wires)) {
    return { requests: [], fillers: [], unreads: [], lookups: [], previous: null, clock: null };
  }

  const reqMap = new Map();
  const requests = [];
  const fillers = [];
  const unreads = [];
  const lookups = [];
  let previous = null;
  let clock = null;

  for (const w of wires) {
    if (w.type === 'w.request.previous') {
      previous = firstAttr(w, 'text') ?? null;
    } else if (w.type === 'w.request.clock') {
      clock = { now: firstAttr(w, 'now') ?? null, timezone: firstAttr(w, 'timezone') ?? null };
    } else if (w.type === 'w.request.filler') {
      fillers.push({ id: w.id, text: firstAttr(w, 'text') ?? '' });
    } else if (w.type === 'w.request.request') {
      const r = {
        id: w.id,
        act: firstAttr(w, 'act') ?? '',
        mode: firstAttr(w, 'mode') ?? 'none',
        mood: firstAttr(w, 'mood') ?? 'do',
        question: firstAttr(w, 'question') ?? 'none',
        refers: firstAttr(w, 'refers') ?? 'kind',
        asked: firstAttr(w, 'asked') ?? null,
        asked_words: allAttrs(w, 'asked_words'),
        words: firstAttr(w, 'words') ?? null,
        words_origin: firstAttr(w, 'words_origin') ?? null,
        predicate: firstAttr(w, 'predicate') ?? null,
        target: null,
        constraints: [],
        intents: [],
        lookups: [],
        unreads: [],
      };
      reqMap.set('$' + w.id, r);
      requests.push(r);
    }
  }

  for (const w of wires) {
    const reqRef = w.attrs?.request?.[0] ? String(w.attrs.request[0]) : null;
    const req = reqRef ? reqMap.get(reqRef) : null;

    if (w.type === 'w.request.target' && req) {
      req.target = {
        id: w.id,
        family: firstAttr(w, 'family') ?? '',
        mode: firstAttr(w, 'mode') ?? '',
        fill: firstAttr(w, 'fill') ?? 'none',
        determiner: allAttrs(w, 'determiner'),
        sort: firstAttr(w, 'sort') ?? null,
        sort_words: firstAttr(w, 'sort_words') ?? null,
        name: firstAttr(w, 'name') ?? null,
        name_words: allAttrs(w, 'name_words'),
        description: firstAttr(w, 'description') ?? null,
        count: firstAttr(w, 'count') ?? null,
        count_words: firstAttr(w, 'count_words') ?? null,
        quantifier: firstAttr(w, 'quantifier') ?? null,
        quantity: firstAttr(w, 'quantity') ?? null,
        ordinal: firstAttr(w, 'ordinal') ?? null,
        code_words: firstAttr(w, 'code_words') ?? null,
        ids: allAttrs(w, 'ids'),
        family_words: allAttrs(w, 'family_words'),
      };
    } else if (w.type === 'w.request.constraint') {
      const c = {
        id: w.id,
        on: firstAttr(w, 'on') ?? '',
        attribute: firstAttr(w, 'attribute') ?? '',
        values: allAttrs(w, 'value'),
        words: firstAttr(w, 'words') ?? null,
        key_words: allAttrs(w, 'key_words'),
        operator: firstAttr(w, 'operator') ?? 'eq',
        phase: firstAttr(w, 'phase') ?? 'result',
        want: firstAttr(w, 'want') ?? 'yes',
        character: firstAttr(w, 'character') ?? 'requirement',
        step: firstAttr(w, 'step') ?? null,
        measure: firstAttr(w, 'measure') ?? null,
        measure_words: firstAttr(w, 'measure_words') ?? null,
        unit: firstAttr(w, 'unit') ?? null,
        open_value: firstAttr(w, 'open_value') === 'true',
      };
      if (req) req.constraints.push(c);
    } else if (w.type === 'w.request.intent' && req) {
      req.intents.push({
        role: firstAttr(w, 'role') ?? '',
        value: firstAttr(w, 'value') ?? '',
        want: firstAttr(w, 'want') ?? 'yes',
      });
    } else if (w.type === 'w.request.lookup') {
      const l = {
        id: w.id,
        key: firstAttr(w, 'key') ?? '',
        from: firstAttr(w, 'from') ?? 'any',
        words: firstAttr(w, 'words') ?? null,
        target: w.attrs?.target?.[0] ? String(w.attrs.target[0]) : null,
        constraint: w.attrs?.constraint?.[0] ? String(w.attrs.constraint[0]) : null,
        antecedent: w.attrs?.antecedent?.[0] ? String(w.attrs.antecedent[0]) : null,
      };
      lookups.push(l);
      if (req) req.lookups.push(l);
    } else if (w.type === 'w.request.unread') {
      const u = {
        id: w.id,
        text: firstAttr(w, 'text') ?? '',
        note: firstAttr(w, 'note') ?? '',
        values: allAttrs(w, 'value'),
      };
      unreads.push(u);
      if (req) req.unreads.push(u);
    }
  }

  return { requests, fillers, unreads, lookups, previous, clock };
}

function normSpelling(s) {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/\bcolour(ed|s|ing)?\b/g, 'color$1')
    .replace(/\bgrey(ish|s)?\b/g, 'gray$1')
    .replace(/\bcentre\b/g, 'center');
}

function normScalarValue(v, aliasMode) {
  let s = String(v).trim();
  if (aliasMode) {
    s = normSpelling(s).replace(/^(?:the|a|an)\s+/i, '');
    if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(s)) {
      const n = Number(s);
      if (Number.isFinite(n)) return String(n);
    }
  } else {
    s = s.toLowerCase();
  }
  return s;
}

function canonicalConstraintTuple(c, aliasMode) {
  let attr = c.attribute || '';
  const want = c.want || 'yes';
  let vals = (c.values ?? []).map((v) => normScalarValue(v, aliasMode));

  if (aliasMode) {
    if (attr === 'chart.horizontal') {
      attr = 'chart.orientation';
      vals = vals.map((v) => (['on', 'true', 'yes', 'horizontal'].includes(v) ? 'horizontal' : ['off', 'false', 'no', 'vertical'].includes(v) ? 'vertical' : v));
    } else if (attr === 'chart.gridlines') {
      attr = 'chart.grid';
      vals = vals.map((v) => (['on', 'true', 'yes', 'show'].includes(v) ? 'show' : ['off', 'false', 'no', 'hide', 'none'].includes(v) ? 'hide' : v));
    } else if (attr === 'chart.showValues' || attr === 'chart.valueLabels' || attr === 'chart.show_values') {
      attr = 'chart.show_values';
      vals = vals.map((v) => (['on', 'true', 'yes', 'show'].includes(v) ? 'show' : ['off', 'false', 'no', 'hide', 'none'].includes(v) ? 'hide' : v));
    } else if (attr === 'chart.showLegend' || attr === 'chart.legend') {
      attr = 'chart.legend';
      vals = vals.map((v) => (['on', 'true', 'yes', 'show'].includes(v) ? 'show' : ['off', 'false', 'no', 'hide', 'none'].includes(v) ? 'hide' : v));
    } else {
      attr = KEY_ALIASES[attr] ?? attr;
    }
  }

  // Fallback to words/measure if value was omitted (e.g., open span or degree)
  if (!vals.length && c.words) vals = [normScalarValue(c.words, aliasMode)];
  const valStr = vals.join('|');
  const stepPart = c.step ? `@step=${c.step}` : '';
  return `${attr}::${valStr}${stepPart}::${want}`;
}

function multisetF1(goldItems, predItems) {
  if (!goldItems.length && !predItems.length) {
    return { precision: 1, recall: 1, f1: 1, tp: 0, fp: 0, fn: 0 };
  }
  const gCounts = new Map();
  for (const x of goldItems) gCounts.set(x, (gCounts.get(x) ?? 0) + 1);
  const pCounts = new Map();
  for (const x of predItems) pCounts.set(x, (pCounts.get(x) ?? 0) + 1);

  let tp = 0;
  for (const [k, gc] of gCounts) {
    tp += Math.min(gc, pCounts.get(k) ?? 0);
  }
  const precision = predItems.length ? tp / predItems.length : 0;
  const recall = goldItems.length ? tp / goldItems.length : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    precision,
    recall,
    f1,
    tp,
    fp: predItems.length - tp,
    fn: goldItems.length - tp,
  };
}

// Intent evidence and local wire IDs are independent of semantic value.
export function compareRequestIntents(goldRequest, predictedRequest) {
  const gold = goldRequest?.intents ?? [];
  const pred = predictedRequest?.intents ?? [];
  const tuple = ({ role, value, want }) => JSON.stringify([role, value.trim(), want]);
  const { tp, fp, fn } = multisetF1(gold.map(tuple), pred.map(tuple));
  if (fp === 0 && fn === 0) return { tp, fp, fn, missingDestination: false, wrongDestination: false };
  const endpoints = (intents, polarity) => intents.filter(({ role, want }) =>
    role === 'destination' && want === polarity).map(({ value }) => value.trim());
  const destinations = ['yes', 'no'].map((want) => multisetF1(endpoints(gold, want), endpoints(pred, want)));
  return {
    tp, fp, fn,
    missingDestination: destinations.some((diff) => diff.fn > 0),
    wrongDestination: destinations.some((diff) => diff.fn > 0 && diff.fp > 0),
  };
}


function hasHullOverlap(text, requests) {
  if (requests.length < 2) return false;
  const spans = [];
  let cursor = 0;
  for (const r of requests) {
    const sp = r.words ?? text;
    let idx = text.indexOf(sp, cursor);
    if (idx < 0) idx = text.indexOf(sp);
    if (idx < 0) {
      spans.push([0, text.length]);
    } else {
      spans.push([idx, idx + sp.length]);
      cursor = Math.max(cursor, idx + 1);
    }
  }
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      if (spans[i][0] < spans[j][1] && spans[j][0] < spans[i][1]) return true;
    }
  }
  return false;
}

function targetIdentityMatches(gTarget, pTarget) {
  const gSort = gTarget?.sort ? normSpelling(gTarget.sort) : '';
  const pSort = pTarget?.sort ? normSpelling(pTarget.sort) : '';
  const gName = gTarget?.name ? normSpelling(gTarget.name) : '';
  const pName = pTarget?.name ? normSpelling(pTarget.name) : '';
  const gIds = (gTarget?.ids ?? []).map((x) => String(x).toLowerCase()).sort().join(',');
  const pIds = (pTarget?.ids ?? []).map((x) => String(x).toLowerCase()).sort().join(',');
  if (gIds !== pIds) return false;
  if (gSort === pSort && gName === pName) return true;
  // Defensible L4 representation equivalence: same single identifier emitted as sort=X vs name=X (e.g., "make cupboard red")
  if (!gSort && !pName && gName && pSort && gName === pSort) return true;
  if (!pSort && !gName && pName && gSort && pName === gSort) return true;
  return false;
}

function lookupSignatures(request, resolveAntecedent) {
  const constraints = new Map(request.constraints.map((c) => ['$' + c.id, c]));
  const attachments = new Map();
  for (const lookup of request.lookups) {
    const attachment = JSON.stringify([lookup.target, lookup.constraint]);
    let group = attachments.get(attachment);
    if (!group) {
      const constraint = constraints.get(lookup.constraint);
      const target = lookup.target === null ? null :
        lookup.target === '$' + request.target?.id ? 'target' : ['foreign', lookup.target];
      const anchor = lookup.constraint === null ? null : constraint ? [
        canonicalConstraintTuple(constraint, true), constraint.on, constraint.operator,
        constraint.phase, constraint.unit, constraint.measure, constraint.character,
      ] : ['foreign', lookup.constraint];
      group = { target, anchor, lookups: [] };
      attachments.set(attachment, group);
    }
    group.lookups.push(JSON.stringify([
      lookup.key, lookup.from, lookup.words?.trim() ?? null,
      lookup.antecedent === null ? null : resolveAntecedent(lookup.antecedent),
    ]));
  }
  // Group by the attached wire before discarding local IDs. This preserves
  // whether two lookups complete the same operand or two equivalent operands.
  return [...attachments.values()].map(({ target, anchor, lookups }) =>
    ({ attachment: [request.refers, target, anchor], lookups }));
}

export function compareRequestLookups(gold, pred, resolveGold = () => true, resolvePred = () => true) {
  if (!gold.lookups.length && !pred.lookups.length) return { fp: 0, fn: 0 };
  const goldGroups = lookupSignatures(gold, resolveGold);
  const predGroups = lookupSignatures(pred, resolvePred);
  const individual = (groups) => groups.flatMap(({ attachment, lookups }) =>
    lookups.map((lookup) => JSON.stringify([attachment, lookup])));
  const { fp, fn } = multisetF1(individual(goldGroups), individual(predGroups));
  if (fp || fn) return { fp, fn };
  const grouped = (groups) => groups.map(({ attachment, lookups }) =>
    JSON.stringify([attachment, lookups.sort()]));
  const difference = multisetF1(grouped(goldGroups), grouped(predGroups));
  return { fp: difference.fp, fn: difference.fn };
}

export function requestPositions(requests) {
  return new Map(requests.map(({ id }, index) => ['$' + id, index]));
}

function contentTokensOf(str, verifier) {
  const tokens = String(str ?? '').match(TOKEN_RE) ?? [];
  if (!verifier) return tokens.map((t) => t.toLowerCase());
  return tokens
    .map((t) => t.toLowerCase())
    .filter((t) => !verifier.isGrammar(t) && !verifier.LEX.filler.has(t));
}

function damerauLevenshteinAtMost1(a, b) {
  if (a === b) return false;
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;
  if (la === lb) {
    // 1 substitution or 1 adjacent transposition
    if (i + 1 < la && a[i] === b[i + 1] && a[i + 1] === b[i]) {
      return a.slice(i + 2) === b.slice(i + 2);
    }
    return a.slice(i + 1) === b.slice(i + 1);
  }
  if (la < lb) return a.slice(i) === b.slice(i + 1);
  return a.slice(i + 1) === b.slice(i);
}

const COMMON_GLUE_WORDS = new Set(['on', 'in', 'to', 'of', 'at', 'by', 'for', 'the', 'a', 'an', 'it', 'out', 'up']);

function isSplitOrMergeTypo(word, vocab) {
  if (!word || word.length < 4) return false;
  for (let k = 1; k < word.length; k++) {
    const left = word.slice(0, k), right = word.slice(k);
    if (COMMON_GLUE_WORDS.has(left) && (COMMON_GLUE_WORDS.has(right) || (right.length >= 2 && (vocab?.has(right) || damerauLevenshteinAtMost1(right, 'the'))))) {
      return true;
    }
  }
  return false;
}

function detectInputTypo({ text, goldReqs, predSummary, verifier, knownVocab }) {
  // 1. Explicit typo in gold sort_words or predicate (e.g. sort=table sort_words=atble, predicate=selct)
  for (const r of goldReqs) {
    const sw = r.target?.sort_words?.toLowerCase();
    const s = r.target?.sort?.toLowerCase();
    if (sw && s && sw !== s && !sw.includes(' ') && sw !== s + 's' && sw !== s + 'es' && damerauLevenshteinAtMost1(sw, s)) {
      return true;
    }
    for (const fwRaw of r.target?.family_words ?? []) {
      const fw = String(fwRaw).toLowerCase();
      if (fw && fw.includes(' ') && !knownVocab?.has(fw)) {
        const joined = fw.replace(/\s+/g, '');
        if (isSplitOrMergeTypo(joined, knownVocab)) return true;
      }
    }
    const pr = r.predicate?.toLowerCase();
    if (pr && !pr.includes(' ') && pr.length >= 4 && verifier?.VERB_ACTS && !verifier.VERB_ACTS.has(pr)) {
      for (const v of verifier.VERB_ACTS.keys()) {
        if (!v.includes(' ') && damerauLevenshteinAtMost1(pr, v)) return true;
      }
    }
  }
  // 2. Unread lowercase tokens AND raw lowercase tokens in text that are OOV and 1-edit or split/merge from knownVocab
  if (knownVocab && knownVocab.size > 0) {
    const isKnownOrVariant = (w) => {
      if (!w || w.length < 2) return true;
      if (knownVocab.has(w) || verifier?.isGrammar(w) || verifier?.LEX?.filler?.has(w)) return true;
      const norm = normSpelling(w);
      if (norm !== w && knownVocab.has(norm)) return true;
      // Common regular inflections of known words
      if (w.endsWith('s') && knownVocab.has(w.slice(0, -1))) return true;
      if (w.endsWith('es') && knownVocab.has(w.slice(0, -2))) return true;
      if (w.endsWith('ed') && (knownVocab.has(w.slice(0, -2)) || knownVocab.has(w.slice(0, -1)))) return true;
      if (w.endsWith('ing') && (knownVocab.has(w.slice(0, -3)) || knownVocab.has(w.slice(0, -3) + 'e'))) return true;
      if (w.endsWith('ly') && knownVocab.has(w.slice(0, -2))) return true;
      if (w.endsWith('er') && (knownVocab.has(w.slice(0, -2)) || knownVocab.has(w.slice(0, -1)))) return true;
      if (w.endsWith('est') && (knownVocab.has(w.slice(0, -3)) || knownVocab.has(w.slice(0, -2)))) return true;
      return false;
    };

    // Check raw lowercase adjacent pairs for split/shifted-space typos ("stando ut", "theb ars", "ch art")
    // Skip capitalized tokens (proper names) and numeric/code tokens.
    const rawWords = String(text || '').match(/[A-Za-z]+/g) ?? [];
    for (let i = 0; i + 1 < rawWords.length; i++) {
      const a = rawWords[i], b = rawWords[i + 1];
      if (a[0] !== a[0].toLowerCase() || b[0] !== b[0].toLowerCase()) continue;
      if ((!isKnownOrVariant(a) || !isKnownOrVariant(b)) && (knownVocab.has(a + b) || isSplitOrMergeTypo(a + b, knownVocab))) {
        return true;
      }
    }

    const candidateToks = new Set([
      ...predSummary.unreads.flatMap((u) => (String(u.text || '').match(/[a-z]{3,}/g) ?? [])),
      ...rawWords.filter((w) => w.length >= 3 && w[0] === w[0].toLowerCase()),
    ]);

    for (const tok of candidateToks) {
      if (isKnownOrVariant(tok)) continue;
      if (isSplitOrMergeTypo(tok, knownVocab)) return true;
      if (tok.length >= 4) {
        for (const v of knownVocab) {
          if (Math.abs(v.length - tok.length) <= 1 && v[0] === tok[0] && damerauLevenshteinAtMost1(tok, v)) {
            return true;
          }
          if (v.length === tok.length && tok.length >= 4 && v[0] === tok[1] && v[1] === tok[0] && damerauLevenshteinAtMost1(tok, v)) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

export function compareCircuits({ text, goldSop, predSop, verifier, knownVocab = null }) {
  const goldCheck = verifier.check(text, goldSop);
  const predCheck = verifier.check(text, predSop);

  const goldSummary = summarizeWires(goldCheck.wires);
  const predSummary = summarizeWires(predCheck.wires);

  const goldReqs = goldSummary.requests;
  const predReqs = predSummary.requests;

  const predValid = Boolean(predCheck.ok);
  const goldValid = Boolean(goldCheck.ok);
  const predZeroWarn = predCheck.warnings.length === 0;
  const goldZeroWarn = goldCheck.warnings.length === 0;

  const bothParsed = goldCheck.wires !== null && predCheck.wires !== null;
  const reqCountExact = bothParsed && predReqs.length === goldReqs.length;
  const nonEmptyReqs = reqCountExact && goldReqs.length > 0;

  const primaryActMatch = bothParsed && goldReqs.length > 0 && predReqs.length > 0 && goldReqs[0].act === predReqs[0].act;
  const actExact = bothParsed && reqCountExact && goldReqs.every((g, i) => g.act === predReqs[i].act);
  const actModeExact = bothParsed && reqCountExact && goldReqs.every((g, i) => (g.mode || 'none') === (predReqs[i].mode || 'none'));
  const moodExact = bothParsed && reqCountExact && goldReqs.every((g, i) => (g.mood || 'do') === (predReqs[i].mood || 'do'));
  const questionExact = bothParsed && reqCountExact && goldReqs.every((g, i) => (g.question || 'none') === (predReqs[i].question || 'none'));

  const targetFamilyExact = nonEmptyReqs && goldReqs.every((g, i) => (g.target?.family ?? '') === (predReqs[i].target?.family ?? ''));
  const targetModeExact = nonEmptyReqs && goldReqs.every((g, i) => (g.target?.mode ?? '') === (predReqs[i].target?.mode ?? ''));
  const targetSortOrNameMatch = nonEmptyReqs && goldReqs.every((g, i) => targetIdentityMatches(g.target, predReqs[i].target));
  const goldPositions = requestPositions(goldReqs);
  const predPositions = requestPositions(predReqs);
  const lookupDiffs = nonEmptyReqs ? goldReqs.map((g, i) => compareRequestLookups(g, predReqs[i],
    (ref) => goldPositions.get(ref) ?? ['unresolved', ref],
    (ref) => predPositions.get(ref) ?? ['unresolved', ref])) : [];
  const lookupMatch = reqCountExact && lookupDiffs.every(({ fp, fn }) => fp === 0 && fn === 0);
  const extraLookup = lookupDiffs.some(({ fp }) => fp > 0);
  const wrongLookup = extraLookup && lookupDiffs.some(({ fn }) => fn > 0);

  const goldStrictCs = goldReqs.flatMap((r) => r.constraints.map((c) => canonicalConstraintTuple(c, false)));
  const predStrictCs = predReqs.flatMap((r) => r.constraints.map((c) => canonicalConstraintTuple(c, false)));
  const constraintStrictF1 = multisetF1(goldStrictCs, predStrictCs);

  const goldAliasCs = goldReqs.flatMap((r) => r.constraints.map((c) => canonicalConstraintTuple(c, true)));
  const predAliasCs = predReqs.flatMap((r) => r.constraints.map((c) => canonicalConstraintTuple(c, true)));
  const constraintAliasF1 = multisetF1(goldAliasCs, predAliasCs);

  const intentDiffs = Array.from({ length: Math.max(goldReqs.length, predReqs.length) }, (_, index) =>
    compareRequestIntents(goldReqs[index], predReqs[index]));
  const intentExact = intentDiffs.every(({ fp, fn }) => fp === 0 && fn === 0);
  const intentMissing = intentDiffs.some(({ fn }) => fn > 0);
  const intentExtra = intentDiffs.some(({ fp }) => fp > 0);
  const wrongEndpoint = intentDiffs.some(({ wrongDestination }) => wrongDestination);
  const missingEndpoint = intentDiffs.some(({ missingDestination }) => missingDestination);

  const semanticExact =
    bothParsed &&
    reqCountExact &&
    actExact &&
    actModeExact &&
    moodExact &&
    questionExact &&
    targetFamilyExact &&
    targetModeExact &&
    targetSortOrNameMatch &&
    lookupMatch &&
    constraintAliasF1.f1 === 1 && intentExact;

  // Detect gold annotation flaws.
  const goldIssueReasons = [];
  if (!goldValid) goldIssueReasons.push('gold_has_errors');
  if (goldCheck.warnings.some((w) => w.why.startsWith('words no wire formalizes'))) {
    goldIssueReasons.push('gold_uncovered_words');
  }
  if (
    goldSummary.unreads.length > 0 ||
    goldCheck.warnings.some((w) => w.why.startsWith('meaning left unread') || w.why.startsWith('unread '))
  ) {
    goldIssueReasons.push('gold_left_unread');
  }

  // Check if gold dumped content/schema words into a filler:
  // (a) filler sitting INSIDE a request span with content words, OR
  // (b) filler holding content words that pred formalized as a closed-value or key_words-bound constraint!
  const goldReqSpans = goldReqs.map((r) => {
    const sp = r.words ?? text;
    const idx = text.indexOf(sp);
    return idx < 0 ? [0, text.length] : [idx, idx + sp.length];
  });
  const goldFillerContentTokens = new Set();
  let goldBadInnerFiller = false;
  for (const f of goldSummary.fillers) {
    const ft = f.text ?? '';
    if (!ft) continue;
    let rest = ft.toLowerCase();
    for (const ph of [...verifier.LEX.filler].filter((x) => x.includes(' '))) rest = rest.replaceAll(ph, ' ');
    const toks = contentTokensOf(rest, verifier);
    for (const tok of toks) goldFillerContentTokens.add(tok);
    if (toks.length > 0) {
      const escFt = ft.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const outside = [...text.matchAll(new RegExp(`(?<![\\w])${escFt}(?![\\w])`, 'g'))].some(
        (m) => !goldReqSpans.some(([a, b]) => a <= m.index && m.index < b),
      );
      if (!outside) goldBadInnerFiller = true;
    }
  }

  const predConstraintTokens = new Set();
  const predStructuredConstraintTokens = new Set();
  for (const r of predReqs) {
    for (const c of r.constraints) {
      const declarations = verifier.KEYS?.get(c.attribute);
      const isStructured = Boolean(declarations?.some((key) => key.values) || (c.key_words && c.key_words.length > 0));
      for (const s of [c.words, ...(c.key_words ?? []), ...(c.values ?? [])]) {
        for (const tok of contentTokensOf(s, verifier)) {
          predConstraintTokens.add(tok);
          if (isStructured) predStructuredConstraintTokens.add(tok);
        }
      }
    }
  }
  const goldFillerHitStructured = [...goldFillerContentTokens].some((t) => predStructuredConstraintTokens.has(t));
  if (goldBadInnerFiller || goldFillerHitStructured) {
    goldIssueReasons.push('gold_bad_filler');
  }

  const goldHullOverlap = hasHullOverlap(text, goldReqs);
  const predHullOverlap = hasHullOverlap(text, predReqs);
  if (goldHullOverlap) {
    goldIssueReasons.push('gold_hull_overlap');
  }
  if (goldCheck.warnings.some((w) => w.why.startsWith('proper name of the text missing'))) {
    goldIssueReasons.push('gold_missing_proper_name');
  }
  if (goldCheck.warnings.some((w) => w.why.startsWith('act contradicts the predicate'))) {
    goldIssueReasons.push('gold_contradicts_predicate');
  }
  if (goldCheck.warnings.length > 0 && goldIssueReasons.length === 0) {
    goldIssueReasons.push('gold_other_warning');
  }

  const goldAnnotationFlawed = goldIssueReasons.length > 0;

  // Determine whether pred is strictly cleaner than flawed gold.
  const goldUncoveredTokens = new Set(goldCheck.uncoveredWords.map((w) => w.toLowerCase()));
  const goldUnreadTokens = new Set(goldSummary.unreads.flatMap((u) => contentTokensOf(u.text, verifier)));
  const predFormalizedGoldMissed =
    goldBadInnerFiller ||
    goldFillerHitStructured ||
    [...goldUncoveredTokens].some((t) => predConstraintTokens.has(t)) ||
    [...goldUnreadTokens].some((t) => predConstraintTokens.has(t));

  const strictlyCleaner =
    predValid &&
    predCheck.warnings.length <= goldCheck.warnings.length &&
    (
      predCheck.errors.length < goldCheck.errors.length ||
      predCheck.warnings.length < goldCheck.warnings.length ||
      (predCheck.warnings.length === 0 && (predFormalizedGoldMissed || (goldHullOverlap && !predHullOverlap)))
    );

  // Strict core-intent + family + constraint fidelity for pred_better_than_gold (watertight fairness guard):
  const goldActContradicts = goldIssueReasons.includes('gold_contradicts_predicate') ||
    goldReqs.some((g) => g.act === 'change' && /^(can|could|would|will)$/i.test(g.predicate ?? ''));
  const hasRealConstraintAgreement = (goldAliasCs.length > 0 || predAliasCs.length > 0) && constraintAliasF1.f1 >= 0.5;
  const constraintPreserved = goldAliasCs.length === 0 || (constraintAliasF1.recall >= 0.5 && constraintAliasF1.f1 >= 0.5);
  const agreesForBetterGold = intentExact && lookupMatch && (
    (actExact && moodExact && targetFamilyExact && constraintPreserved) ||
    (goldActContradicts && targetFamilyExact && (hasRealConstraintAgreement || goldAliasCs.length === 0)));
  const agreesForPartial = actExact || (primaryActMatch && moodExact) || hasRealConstraintAgreement;

  // Mutually exclusive fair category.
  let fairCategory;
  if (predValid && semanticExact) {
    fairCategory = 'exact_match';
  } else if (predValid && goldAnnotationFlawed && strictlyCleaner && agreesForBetterGold) {
    fairCategory = 'pred_better_than_gold';
  } else if (predValid && goldAnnotationFlawed && agreesForPartial) {
    fairCategory = 'gold_noisy_both_partial';
  } else if (predValid && agreesForPartial) {
    fairCategory = 'pred_partial';
  } else {
    fairCategory = 'pred_wrong';
  }

  // Diagnostic error reasons for pred.
  const predErrorReasons = [];
  for (const e of predCheck.errors) predErrorReasons.push(`err:${e.type}:${e.key}:${e.why}`);
  for (const w of predCheck.warnings) predErrorReasons.push(`warn:${w.why}`);
  if (predValid && !semanticExact && fairCategory !== 'pred_better_than_gold') {
    if (!reqCountExact) predErrorReasons.push('diff:req_count');
    if (!actExact) predErrorReasons.push('diff:act');
    if (!moodExact) predErrorReasons.push('diff:mood');
    if (!questionExact) predErrorReasons.push('diff:question');
    if (!targetFamilyExact) predErrorReasons.push('diff:target_family');
    if (!targetModeExact) predErrorReasons.push('diff:target_mode');
    if (!targetSortOrNameMatch) predErrorReasons.push('diff:target_identity');
    if (constraintAliasF1.f1 < 1) predErrorReasons.push('diff:constraints');
    if (!intentExact) predErrorReasons.push('diff:intent');
    if (!lookupMatch) predErrorReasons.push('diff:lookup');
  }

  // Check equivalence when stripping Gold's redundant *.id / *.ids echo of target.name (annotation style variation).
  const goldTargetNames = new Set(goldReqs.map((r) => r.target?.name ? normScalarValue(r.target.name, true) : '').filter(Boolean));
  const predTargetNames = new Set(predReqs.map((r) => r.target?.name ? normScalarValue(r.target.name, true) : '').filter(Boolean));
  const stripMirroredNameCons = (reqs, otherTargetNames) =>
    reqs.flatMap((r) => {
      const tNameNorm = r.target?.name ? normScalarValue(r.target.name, true) : '';
      return r.constraints
        .filter((c) => {
          const vals = (c.values ?? []).map((v) => normScalarValue(v, true));
          if (vals.length !== 1) return true;
          const isEchoId = (c.attribute.endsWith('.id') || c.attribute.endsWith('.ids')) && c.phase === 'selector' && tNameNorm && vals[0] === tNameNorm;
          if (isEchoId) return false;
          const isMirroredName = (c.attribute.endsWith('.name') || c.attribute.endsWith('.title')) && otherTargetNames.has(vals[0]);
          return !isMirroredName;
        })
        .map((c) => canonicalConstraintTuple(c, true));
    });
  const goldNonRedundantAliasCs = stripMirroredNameCons(goldReqs, predTargetNames);
  const predNonRedundantAliasCs = stripMirroredNameCons(predReqs, goldTargetNames);
  const equivRedundantId =
    predValid &&
    !semanticExact &&
    bothParsed &&
    intentExact &&
    lookupMatch &&
    reqCountExact &&
    actExact &&
    actModeExact &&
    moodExact &&
    questionExact &&
    targetFamilyExact &&
    targetModeExact &&
    (targetSortOrNameMatch ||
      goldReqs.every((g, i) => {
        const p = predReqs[i];
        const gSort = g.target?.sort ? normSpelling(g.target.sort) : '';
        const pSort = p.target?.sort ? normSpelling(p.target.sort) : '';
        return gSort === pSort;
      })) &&
    (goldNonRedundantAliasCs.length < goldAliasCs.length || predNonRedundantAliasCs.length < predAliasCs.length) &&
    multisetF1(goldNonRedundantAliasCs, predNonRedundantAliasCs).f1 === 1;

  const inputHasTypo = !semanticExact && detectInputTypo({ text, goldReqs, predSummary, verifier, knownVocab });

  // Mutually exclusive root-cause attribution (Gold vs Input Typo vs Z3 Formaliser):
  let attribution;
  if (fairCategory === 'exact_match') {
    attribution = 'success_exact';
  } else if (fairCategory === 'pred_better_than_gold') {
    attribution = 'success_z3_better_than_gold';
  } else if (equivRedundantId) {
    attribution = 'equiv_gold_redundant_id';
  } else if (goldAnnotationFlawed) {
    attribution = 'fail_gold_annotation_flawed';
  } else if (inputHasTypo) {
    attribution = 'fail_input_typo';
  } else if ((goldReqs.length === 0) !== (predReqs.length === 0)) {
    attribution = 'fail_z3_zero_req_filler';
  } else if (!reqCountExact || !actExact || !moodExact || !questionExact) {
    attribution = 'fail_z3_act_or_mood';
  } else if (!targetFamilyExact || !targetModeExact) {
    attribution = 'fail_z3_family_or_mode';
  } else {
    attribution = 'fail_z3_constraints_or_target';
  }

  // WebMeet formalisation grades · v1.2 (webmeet-dataset/LEGEND.md):
  // Assign L3 if normalized SOP text matches reference identically (and is valid/reasonable),
  // L4 if semantically equivalent / alias-equivalent / redundant-id-equivalent / Z3 cleaner than flawed Gold,
  // otherwise first applicable primary error grade in exact LEGEND.md order: L0, L1a, L1b, L1c, L1d, L2 (L2a/L2b/L2c).
  const normSopText = (s) => String(s ?? '').replace(/\r\n/g, '\n').trim();
  const textIdentical = predValid && normSopText(goldSop) === normSopText(predSop);
  const allContentUnread =
    predReqs.length > 0 &&
    predSummary.unreads.length > 0 &&
    predReqs.every((r) => r.constraints.length === 0 && r.intents.length === 0 && r.lookups.length === 0 &&
      !r.target?.sort && !r.target?.name && !(r.target?.ids?.length));

  let legendGrade;
  if (textIdentical && !goldAnnotationFlawed) {
    legendGrade = 'L3';
  } else if (predValid && (semanticExact || fairCategory === 'pred_better_than_gold' || equivRedundantId)) {
    legendGrade = textIdentical ? 'L3' : 'L4';
  } else if (!predValid || (goldReqs.length > 0 && predReqs.length === 0) || allContentUnread) {
    legendGrade = 'L0';
  } else if (
    (reqCountExact && (!actExact || !moodExact || !questionExact)) ||
    (goldReqs.length > 0 && predReqs.length > 0 && !primaryActMatch)
  ) {
    legendGrade = 'L1a';
  } else if (reqCountExact && (!targetFamilyExact || !targetModeExact || wrongEndpoint || wrongLookup)) {
    legendGrade = 'L1b';
  } else if (reqCountExact && ((constraintAliasF1.fp > 0 && constraintAliasF1.fn > 0) || (intentMissing && intentExtra))) {
    legendGrade = 'L1c';
  } else if (
    predReqs.length > goldReqs.length ||
    (goldReqs.length === 0 && predReqs.length > 0) ||
    (constraintAliasF1.fp > 0 && constraintAliasF1.fn === 0) || intentExtra || extraLookup
  ) {
    legendGrade = 'L1d';
  } else if (predReqs.length < goldReqs.length) {
    legendGrade = 'L2a';
  } else if (!targetSortOrNameMatch || !lookupMatch || missingEndpoint) {
    legendGrade = 'L2b';
  } else {
    legendGrade = 'L2c';
  }

  return {
    verdict: fairCategory,
    fairCategory,
    attribution,
    legendGrade,
    equivRedundantId,
    inputHasTypo,
    goldAnnotationFlawed,
    goldIssueReasons,
    predErrorReasons,
    predValid,
    goldValid,
    predZeroWarn,
    goldZeroWarn,
    reqCountExact,
    actExact,
    actModeExact,
    moodExact,
    questionExact,
    targetFamilyExact,
    targetModeExact,
    targetSortOrNameMatch,
    lookupMatch,
    constraintStrictF1,
    constraintAliasF1,
    intentExact,
    semanticExact,
    goldCheck,
    predCheck,
    goldSummary,
    predSummary,
  };
}

// WebMeet formalisation grades · v1.2 (webmeet-dataset/LEGEND.md) ordering for proposal-set grading:
// Assign L3 if any proposal is L3, else L4 if any is L4, else grade the closest usable proposal.
// Never assemble a successful answer from fragments of separate proposals.
const LEGEND_GRADE_RANK = {
  L3: 9,
  L4: 8,
  L2c: 7,
  L2b: 6,
  L2a: 5,
  L1d: 4,
  L1c: 3,
  L1b: 2,
  L1a: 1,
  L0: 0,
};

// Resolve complete proposal/reference pairs, while retaining every reference's diagnostics.
export function selectReferenceComparison(comparisons) {
  let best = comparisons[0];
  let bestMechanicalRank = -1;
  let mechanicalLegendGrade = 'L0';
  const referenceIssues = [];
  for (const entry of comparisons) {
    const { column, result } = entry;
    if (entry.missing || result.goldIssueReasons.length) {
      referenceIssues.push({
        column,
        reasons: entry.missing ? ['gold_missing_reference'] : result.goldIssueReasons,
        errors: result.goldCheck.errors,
        warnings: result.goldCheck.warnings,
      });
    }
    if (!result.goldValid || entry.missing) continue;
    const rank = LEGEND_GRADE_RANK[result.legendGrade];
    const bestRank = LEGEND_GRADE_RANK[best.result.legendGrade];
    if (!best.result.goldValid || rank > bestRank ||
        (rank === bestRank && result.constraintAliasF1.f1 > best.result.constraintAliasF1.f1)) {
      best = entry;
    }
    const mechanical = result.mechanicalLegendGrade ?? result.legendGrade;
    if (LEGEND_GRADE_RANK[mechanical] > bestMechanicalRank) {
      bestMechanicalRank = LEGEND_GRADE_RANK[mechanical];
      mechanicalLegendGrade = mechanical;
    }
  }
  const goldIssueReasons = [...new Set(referenceIssues.flatMap(({ reasons }) => reasons))];
  const goldValid = best.result.goldValid && !best.missing;
  return {
    ...best.result,
    goldValid,
    ...(!goldValid && {
      verdict: 'gold_noisy_both_partial',
      fairCategory: 'gold_noisy_both_partial',
      attribution: 'fail_gold_annotation_flawed',
      legendGrade: 'L0',
      z3SemanticGrade: best.result.z3SemanticGrade && 'L0',
      semanticExact: false,
      equivRedundantId: false,
      predErrorReasons: best.result.predErrorReasons.filter((reason) => !reason.startsWith('diff:')),
    }),
    mechanicalLegendGrade,
    bestReferenceColumn: goldValid ? best.column : null,
    goldAnnotationFlawed: goldIssueReasons.length > 0,
    goldIssueReasons,
    referenceIssues,
  };
}

export function compareProposals({ goldReferences, ...options }) {
  if (!goldReferences) return compareSingleReference(options);
  const references = goldReferences.length ? goldReferences : [{ column: null, sop: '', missing: true }];
  return selectReferenceComparison(references.map(({ column, sop, missing }) => ({
    column,
    missing,
    result: compareSingleReference({ ...options, goldSop: sop }),
  })));
}

function compareSingleReference({ text, tab, goldSop, proposals, verifier, knownVocab = null }) {
  const list = Array.isArray(proposals) && proposals.length > 0 ? proposals : [{ sop: '', tab }];
  let bestCmp = null;
  let bestRank = -1;
  let bestProposalIdx = 0;
  let tabHit = false;

  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const pSop = typeof p === 'string' ? p : (p?.sop ?? '');
    const pTab = typeof p === 'string' ? tab : (p?.tab ?? tab);
    if (pTab === tab) tabHit = true;

    const cmp = compareCircuits({
      text,
      goldSop,
      predSop: pSop,
      verifier,
      knownVocab,
    });

    const rank = LEGEND_GRADE_RANK[cmp.legendGrade] ?? 0;
    const isBetter =
      !bestCmp ||
      rank > bestRank ||
      (rank === bestRank && (
        (cmp.predValid && !bestCmp.predValid) ||
        (cmp.predValid === bestCmp.predValid && (cmp.constraintAliasF1?.f1 ?? 0) > (bestCmp.constraintAliasF1?.f1 ?? 0)) ||
        (cmp.predValid === bestCmp.predValid &&
          (cmp.constraintAliasF1?.f1 ?? 0) === (bestCmp.constraintAliasF1?.f1 ?? 0) &&
          Number(cmp.actExact) + Number(cmp.targetFamilyExact) > Number(bestCmp.actExact) + Number(bestCmp.targetFamilyExact))
      ));

    if (isBetter) {
      bestCmp = cmp;
      bestRank = rank;
      bestProposalIdx = i;
    }
  }

  return {
    ...bestCmp,
    proposalCount: list.length,
    bestProposalIdx,
    tabHit,
  };
}
