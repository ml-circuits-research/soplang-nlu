// Stage-1 Hierarchical Clause / Enumeration Segmenter in Z3 (SMT-LIB2 MaxSMT).
// Solves an O(S) Boolean boundary decision problem over candidate separators (dynamically loaded
// from kb.grammar.joiners + punctuation) in ~5-15 ms, allowing arbitrary-length multi-clause
// and comma-enumerated scene utterances (R = 1..12+) without MaxSMT explosion!

import { HYP_KINDS } from '../contracts.mjs';

const STRONG_WORD_SEPS = new Set(['then', 'afterwards', 'next', 'finally', 'plus']);
const COORD_LIST_WORDS = new Set(['and', 'or']);

function isInsideProtectedList(tokens, sepIdx, kb) {
  const prev = sepIdx > 0 ? tokens[sepIdx - 1] : null;
  const next = sepIdx + 1 < tokens.length ? tokens[sepIdx + 1] : null;
  if (!prev || !next) return false;

  // Numeric pairs or comma-separated chart values: "260, 180", "27, 23"
  if (tokens[sepIdx].text === ',' && prev.kind === 'number' && next.kind === 'number') return true;
  // Coordinated code lists: "o1, o2 and o3", "n1 and n2"
  if (prev.kind === 'code' && (next.kind === 'code' || (next.lower === 'and' && tokens[sepIdx + 2]?.kind === 'code'))) {
    return true;
  }
  // Coordinated single-letter names: "A, B and C"
  if (/^[A-Z]$/.test(prev.text) && (/^[A-Z]$/.test(next.text) || (next.lower === 'and' && /^[A-Z]$/.test(tokens[sepIdx + 2]?.text ?? '')))) {
    return true;
  }
  // Coordinated proper names or indexed IDs: "Shop and Sample", "Intro, 2 and 3", "Triage, Testing and Billing"
  if ((prev.isProperCandidate || prev.kind === 'number') && (next.isProperCandidate || next.kind === 'number')) {
    // Only protect short bare lists like "Shop and Sample" or "Intro, 2 and 3", not full clauses!
    const prev2 = sepIdx >= 2 ? tokens[sepIdx - 2] : null;
    if (tokens[sepIdx].lower === 'and' || (tokens[sepIdx].text === ',' && next.kind === 'number')) {
      if (!prev2 || prev2.kind !== 'punct') return true;
    }
  }
  // Never cut inside a trailing polite filler ("..., thanks", "..., please")
  if (tokens[sepIdx].text === ',') {
    const rest = tokens.slice(sepIdx + 1).filter((t) => !t.isPunct);
    if (rest.length > 0 && rest.every((t) => t.isFiller || t.isGrammar || kb?.isFillerWord?.(t.lower))) {
      return true;
    }
  }
  return false;
}

/**
 * Decide whether a sentence benefits from Stage-1 Z3 hierarchical segmentation
 * (long multi-clause utterances or enumerated scene descriptions where joint O(M*R) MaxSMT
 * would either exceed maxRequests=4 or risk timeout).
 */
export function shouldUseHierarchicalSegmenter(lattice, kb, { maxRequests = 4 } = {}) {
  const { tokens, candidates } = lattice;
  // A written clause break lets each scatter orientation retain the other requests
  // without enumerating the whole compound again.
  const hasAlternateAxes = candidates.some(({ chartAxisPair, chartAxisOrder }) =>
    chartAxisPair != null && chartAxisOrder > 0);
  if (hasAlternateAxes && lattice.splitPoints.some(({ isStrong, endTok }) => isStrong && endTok < tokens.length - 1)) {
    return true;
  }
  if (tokens.length < 16) return false;

  const sepCount = candidates.filter((c) => c.kind === HYP_KINDS.SEP && c.canSplitClause).length;
  const colonCount = tokens.filter((t) => t.text === ':').length;
  const indefOrCountSorts = new Set(
    candidates
      .filter(
        (c) =>
          (c.kind === HYP_KINDS.TARGET_SORT || c.kind === HYP_KINDS.TARGET_FAMILY) &&
          (c.det === 'indefinite' || c.count != null),
      )
      .map((c) => c.startTok),
  );

  // Trigger on:
  // 1) Scene colon + multiple enumerated objects ("set up the zoo scene: 4 cages..., 4 parrots..., a keeper...")
  // 2) Long sentences (T >= 26) with >= 3 separators
  // 3) >= 4 independent indefinite/counted object heads separated by commas/conjunctions
  if (colonCount > 0 && indefOrCountSorts.size >= 2 && sepCount >= 2) return true;
  if (indefOrCountSorts.size >= 4 && sepCount >= 3) return true;
  if (tokens.length >= 26 && sepCount >= 3) return true;
  if (sepCount >= maxRequests + 2) return true;
  return false;
}

/**
 * Run Stage-1 Z3 MaxSMT clause/enumeration segmentation.
 * Returns an array of clean non-overlapping clause slices covering the original text
 * (with exact character offsets so downstream `words="..."` is 100% grounded!).
 */
export async function segmentClausesZ3(lattice, { kb, runner, timeout = 1500 } = {}) {
  const { text, tokens, candidates } = lattice;
  const T = tokens.length;
  if (T < 6) {
    return { ok: true, segments: [{ startTok: 0, endTok: T - 1, start: 0, end: text.length, text }], usedZ3: false };
  }

  const joiners = kb?.grammar?.joiners;
  // Keep a scoped edit intact before re-reading the extracted sentence slices.
  // A cut inside it would discard the field or turn a dependent verb into a command.
  const chartScopes = candidates.filter((candidate) => candidate.chartEditEnd !== undefined)
    .map((candidate) => ({ start: candidate.chartEditStart ?? candidate.startTok, end: candidate.chartEditEnd }));
  for (const candidate of candidates) {
    if (candidate.chartCreationScope) {
      const [start, end] = candidate.chartCreationScope;
      chartScopes.push({ start, end });
    }
  }
  const protectedScopes = [...chartScopes, ...(lattice.politeSpans ?? []).map(({ startTok, endTok, protectsComma, nominalStart }) =>
    ({ start: nominalStart ?? startTok, end: endTok + Number(Boolean(protectsComma)) }))];
  for (const { purposePredicate, endTok } of lattice.purposeSpans ?? []) {
    protectedScopes.push({ start: purposePredicate, end: endTok });
  }
  const cutsProtectedScope = (start, end) => protectedScopes.some((scope) => start <= scope.end && end >= scope.start);

  // Collect atomic candidate split points (merging multi-token joins like ", and", ", then", "; then", "and then")
  const splitPoints = [];
  const usedTok = new Set();
  for (let i = 1; i < T - 1; i++) {
    if (usedTok.has(i) || cutsProtectedScope(i, i)) continue;
    const tok = tokens[i];
    const next = tokens[i + 1];

    // Never split on "next to" (spatial preposition, not sequence joiner "next")!
    if (tok.lower === 'next' && next?.lower === 'to') continue;

    // Two-token composite joiners: ", and", ", then", ", finally", ", plus", "; then", "; and", "and then", "and also"
    if (
      next &&
      i + 1 < T - 1 &&
      !cutsProtectedScope(i, i + 1) &&
      (((tok.text === ',' || tok.text === ';') && ['and', 'then', 'also', 'next', 'finally', 'plus', 'but'].includes(next.lower) && !(next.lower === 'next' && tokens[i + 2]?.lower === 'to')) ||
        (tok.lower === 'and' && ['then', 'also', 'next', 'finally'].includes(next.lower) && !(next.lower === 'next' && tokens[i + 2]?.lower === 'to')))
    ) {
      if (!isInsideProtectedList(tokens, i, kb) && !isInsideProtectedList(tokens, i + 1, kb)) {
        const strong = tok.text === ';' || STRONG_WORD_SEPS.has(next.lower);
        splitPoints.push({
          id: splitPoints.length,
          startTok: i,
          endTok: i + 1,
          kind: strong ? 'strong' : 'coord',
          text: text.slice(tok.start, next.end),
        });
        usedTok.add(i);
        usedTok.add(i + 1);
        continue;
      }
    }

    const isPunctSep = tok.isPunct && (tok.text === ',' || tok.text === ';' || tok.text === '.' || tok.text === ':');
    const isWordSep =
      tok.kind === 'word' &&
      (joiners?.has(tok.lower) || STRONG_WORD_SEPS.has(tok.lower) || COORD_LIST_WORDS.has(tok.lower) || tok.lower === 'but' || tok.lower === 'also');

    if ((isPunctSep || isWordSep) && !isInsideProtectedList(tokens, i, kb)) {
      const kind =
        tok.text === ':' ? 'colon'
        : (tok.text === '.' || tok.text === ';' || STRONG_WORD_SEPS.has(tok.lower)) ? 'strong'
        : tok.text === ',' ? 'comma'
        : 'coord';
      splitPoints.push({
        id: splitPoints.length,
        startTok: i,
        endTok: i,
        kind,
        text: tok.text,
      });
      usedTok.add(i);
    }
  }

  if (splitPoints.length === 0) {
    return { ok: true, segments: [{ startTok: 0, endTok: T - 1, start: 0, end: text.length, text }], usedZ3: false };
  }

  // Precompute structural features for every elementary chunk between consecutive split points
  const preds = candidates.filter(
    (c) =>
      c.kind === HYP_KINDS.PREDICATE &&
      (c.licensed ?? []).some((l) => !['greet', 'thank', 'farewell'].includes(l.act)) &&
      (c.cost ?? 0) <= 6,
  );
  const objHeads = candidates.filter(
    (c) =>
      (c.kind === HYP_KINDS.TARGET_SORT || c.kind === HYP_KINDS.TARGET_FAMILY) &&
      (c.det === 'indefinite' || c.count != null),
  );
  const anyTargets = candidates.filter(
    (c) => c.kind === HYP_KINDS.TARGET_SORT || c.kind === HYP_KINDS.TARGET_FAMILY || c.kind === HYP_KINDS.TARGET_REF,
  );

  const rangeStats = (sTok, eTok) => {
    let contentCount = 0;
    let nonFillerContent = 0;
    for (let t = sTok; t <= eTok; t++) {
      if (tokens[t]?.isContent) {
        contentCount++;
        if (!tokens[t].isFiller && !kb?.isFillerWord?.(tokens[t].lower)) nonFillerContent++;
      }
    }
    const hasPred = preds.some((p) => p.startTok >= sTok && p.endTok <= eTok);
    const hasTarget = anyTargets.some((h) => h.startTok >= sTok && h.endTok <= eTok);
    const firstNonGram = tokens.slice(sTok, eTok + 1).find((t) => !t.isPunct && !t.isFiller);
    const firstIsIndefOrNum = Boolean(
      firstNonGram &&
        (firstNonGram.lower === 'a' ||
          firstNonGram.lower === 'an' ||
          firstNonGram.kind === 'number' ||
          kb?.grammar?.numbers?.has(firstNonGram.lower)),
    );
    const hasObjHead =
      objHeads.some((h) => h.startTok >= sTok && h.endTok <= eTok) ||
      (firstIsIndefOrNum && nonFillerContent >= 2);
    const startsWithParticiple = Boolean(firstNonGram && firstNonGram.kind === 'word' && firstNonGram.lower.endsWith('ing'));
    const startsWithPrep = Boolean(firstNonGram && kb?.grammar?.prepositions?.has(firstNonGram.lower));
    return { contentCount, nonFillerContent, hasPred, hasObjHead, hasTarget, startsWithParticiple, startsWithPrep };
  };

  // Build compact Z3 SMT-LIB2 MaxSMT problem over `cut_0 .. cut_{S-1}`
  const S = splitPoints.length;
  const smtLines = [];
  const queryVars = [];
  for (let i = 0; i < S; i++) {
    smtLines.push(`(declare-const cut_${i} Bool)`);
    queryVars.push(`cut_${i}`);
  }

  for (let i = 0; i < S; i++) {
    const sp = splitPoints[i];
    const leftStart = i === 0 ? 0 : splitPoints[i - 1].endTok + 1;
    const leftEnd = sp.startTok - 1;
    const rightStart = sp.endTok + 1;
    const rightEnd = i === S - 1 ? T - 1 : splitPoints[i + 1].startTok - 1;

    const L = leftStart <= leftEnd ? rangeStats(leftStart, leftEnd) : { nonFillerContent: 0, hasPred: false, hasObjHead: false, hasTarget: false };
    const R = rightStart <= rightEnd ? rangeStats(rightStart, rightEnd) : { nonFillerContent: 0, hasPred: false, hasObjHead: false, hasTarget: false };

    // Hard guard: never create an empty/filler-only chunk on either immediate side when cutting here
    if (L.nonFillerContent === 0 || R.nonFillerContent === 0) {
      smtLines.push(`(assert (not cut_${i}))`);
      continue;
    }

    // Hard guard: never split off a trailing participial adjunct (", keeping everything else...")
    if (sp.kind === 'comma' && R.startsWithParticiple) {
      smtLines.push(`(assert (not cut_${i}))`);
      continue;
    }

    // Soft preferences (declarative linguistic boundary scoring in Z3)
    if (sp.kind === 'colon') {
      // Keep "set up the zoo scene: four medium grey cages..." attached to its first enumerated item
      // so @r1 inherits the setup predicate, while subsequent comma-separated items split cleanly into @r2..@rK!
      smtLines.push(`(assert-soft (not cut_${i}) :weight 14)`);
    } else if (sp.kind === 'strong') {
      // ".", ";", "then", "and then", "finally"
      if (R.hasPred || R.hasObjHead) {
        smtLines.push(`(assert-soft cut_${i} :weight 38)`);
      } else if (sp.text === ';') {
        // Semicolon attribute specs ("; name Power; x on top") stay attached to the head clause unless predicate present
        smtLines.push(`(assert-soft (not cut_${i}) :weight 18)`);
      } else {
        smtLines.push(`(assert-soft cut_${i} :weight 12)`);
      }
    } else if (sp.kind === 'comma' || sp.kind === 'coord') {
      // Check if R is a short fronted prepositional phrase (", right on the dock, two medium grey nets" or ", and just above the boat, three small white gulls")
      // whose object head stands right after the next comma!
      const nextSp = i + 1 < S ? splitPoints[i + 1] : null;
      const afterNextStart = nextSp ? nextSp.endTok + 1 : -1;
      const afterNextEnd = nextSp ? (i + 2 < S ? splitPoints[i + 2].startTok - 1 : T - 1) : -1;
      const RNext = nextSp && nextSp.kind === 'comma' && afterNextStart <= afterNextEnd
        ? rangeStats(afterNextStart, afterNextEnd)
        : null;
      const prevSp = i > 0 ? splitPoints[i - 1] : null;
      const beforePrevStart = prevSp ? (i >= 2 ? splitPoints[i - 2].endTok + 1 : 0) : -1;
      const beforePrevEnd = prevSp ? prevSp.startTok - 1 : -1;
      const LPrev = prevSp && beforePrevStart >= 0 && beforePrevStart <= beforePrevEnd
        ? rangeStats(beforePrevStart, beforePrevEnd)
        : null;

      const isFrontedPpBeforeObj = !R.hasObjHead && !R.hasPred && R.nonFillerContent <= 4 && Boolean(RNext?.hasObjHead);
      const isCommaInsideFrontedPp = sp.kind === 'comma' && !L.hasObjHead && !L.hasPred && L.nonFillerContent <= 4 && R.hasObjHead && Boolean(LPrev?.hasObjHead || LPrev?.hasPred);

      // Enumerated object list or coordinated verb clauses
      if (isCommaInsideFrontedPp) {
        // Keep the fronted PP ("right on the dock,") attached to its following object ("two medium grey nets")!
        smtLines.push(`(assert-soft (not cut_${i}) :weight 30)`);
      } else if ((R.hasObjHead || isFrontedPpBeforeObj) && (L.hasObjHead || L.hasPred || Boolean(LPrev?.hasObjHead))) {
        smtLines.push(`(assert-soft cut_${i} :weight 28)`);
      } else if (R.hasPred && L.hasPred && !R.startsWithPrep) {
        smtLines.push(`(assert-soft cut_${i} :weight 22)`);
      } else if (R.startsWithPrep || (!R.hasPred && !R.hasObjHead)) {
        smtLines.push(`(assert-soft (not cut_${i}) :weight 26)`);
      } else {
        smtLines.push(`(assert-soft (not cut_${i}) :weight 10)`);
      }
    }
  }

  // Global parsimony: mild penalty per extra cut so trivial clauses stay unified unless strongly justified
  for (let i = 0; i < S; i++) {
    smtLines.push(`(assert-soft (not cut_${i}) :weight 6)`);
  }

  const solved = await runner.solve(smtLines.join('\n'), queryVars, { topK: 1, timeout });
  if (!solved.ok) {
    return { ok: false, segments: [{ startTok: 0, endTok: T - 1, start: 0, end: text.length, text }], usedZ3: true };
  }

  const model = solved.solutions[0];
  const activeCuts = splitPoints.filter((sp) => model.get(`cut_${sp.id}`) === true);
  if (activeCuts.length === 0) {
    return { ok: true, segments: [{ startTok: 0, endTok: T - 1, start: 0, end: text.length, text }], usedZ3: true };
  }

  const segments = [];
  let curStartTok = 0;
  for (const cut of activeCuts) {
    const endTok = cut.startTok - 1;
    if (curStartTok <= endTok) {
      const sChar = tokens[curStartTok].start;
      const eChar = tokens[endTok].end;
      segments.push({
        startTok: curStartTok,
        endTok,
        start: sChar,
        end: eChar,
        text: text.slice(sChar, eChar),
        afterSep: cut.text,
        isColonLead: cut.kind === 'colon',
      });
    }
    curStartTok = cut.endTok + 1;
  }
  if (curStartTok < T) {
    const sChar = tokens[curStartTok].start;
    const eChar = tokens[T - 1].end;
    segments.push({
      startTok: curStartTok,
      endTok: T - 1,
      start: sChar,
      end: eChar,
      text: text.slice(sChar, eChar),
      afterSep: null,
      isColonLead: false,
    });
  }

  return { ok: true, segments, usedZ3: true };
}
