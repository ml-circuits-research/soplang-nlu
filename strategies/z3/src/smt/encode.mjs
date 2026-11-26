// Declarative Z3 SMT-LIB2 MaxSMT encoder for nl-formaliser.
// Translates an unfiltered lexical lattice + tab schema into SMT-LIB2 constraints over smt/prelude.smt2 and smt/axioms.smt2.
// ALL disambiguation (clause splitting, act/mode/mood, target family/mode/fill/lookup, key_word binding,
// selector-vs-result phase, negation, and unread fallback) is decided globally by Z3.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ACTS,
  CREATION_TYPE_KEYS,
  HYP_KINDS,
  isIndependentValueCandidate,
  DEFAULT_TAB_FAMILY,
  acceptsPropertyFamily,
  actToSmt,
  modeToSmt,
  moodToSmt,
  questionToSmt,
  detToSmt,
  phaseToSmt,
  wantToSmt,
} from '../contracts.mjs';
import { findOwnerSelectors, findSpatialOwners, isStructuredPropertyValue, partOwnerInThing } from '../lattice/frames.mjs';
import { overlapsScope } from '../lattice/prohibitions.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_WEIGHTS = JSON.parse(readFileSync(join(HERE, 'weights.json'), 'utf8'));

const VALID_ACT_SET = new Set(ACTS);
const TOKEN_RE = /[A-Za-z0-9]+(?:['\u2019][A-Za-z]+)?/g;
const PLACE_SHORT_KEYS = new Set([
  'relation', 'anchor', 'position', 'order', 'order_anchor', 'relation_anchor',
  'direction', 'at', 'x', 'y', 'place', 'edge', 'side', 'distance', 'distanceGrade', 'offset',
  'from', 'to', 'fromX', 'fromY', 'toX', 'toY', 'shift', 'layout', 'arrangement', 'axis', 'sort',
]);

const smtOr = (xs) => (xs.length === 0 ? 'false' : xs.length === 1 ? xs[0] : `(or ${xs.join(' ')})`);
const smtAnd = (xs) => (xs.length === 0 ? 'true' : xs.length === 1 ? xs[0] : `(and ${xs.join(' ')})`);
const inSpan = (candidate, span) => candidate.startTok >= span.startTok && candidate.endTok <= span.endTok;
const sameSpan = (a, b) => a.startTok === b.startTok && a.endTok === b.endTok;

function atMostOne(vars) {
  if (vars.length <= 1) return null;
  if (vars.length === 2) return `(not (and ${vars[0]} ${vars[1]}))`;
  return `((_ at-most 1) ${vars.join(' ')})`;
}

// Check filler purity with the exact same rule as webmeet-dataset/tools/check.mjs line 164-166.
// IMPORTANT: check.mjs only trusts kb.grammar.fillerWords (w.lang.en LEX.filler), NOT extended fillerPhrases!
function fillerHasHiddenContent(ft, kb) {
  if (typeof kb?.isGrammarWord !== 'function' || !kb?.grammar?.fillerWords) return false;
  const lexFiller = kb.grammar.fillerWords;
  let rest = String(ft || '').toLowerCase().replace(/\u2019/g, "'");
  const fillerPhrases = [...lexFiller].filter((x) => x.includes(' '));
  for (const ph of fillerPhrases) rest = rest.replaceAll(ph, ' ');
  const words = rest.match(TOKEN_RE) ?? [];
  return words.some((w) => !kb.isGrammarWord(w) && !lexFiller.has(w));
}

export function encodeProblem(lattice, { kb, previous = null, clock = null, maxRequests = 4, weights = null, creation } = {}) {
  const W = weights ? { ...DEFAULT_WEIGHTS, ...weights } : DEFAULT_WEIGHTS;
  const { tab, tokens, candidates: rawCandidates, hasQuestionMark } = lattice;
  const nonDirectives = lattice.nonDirectives ?? [];
  const excluded = (span) => overlapsScope(span, nonDirectives);
  const coordinatedChanges = (lattice.coordinatedChanges ?? []).filter((parts) => !parts.some(excluded));
  const tabSpec = lattice.catalog ?? kb.tabs[tab];
  if (!tabSpec) throw new Error(`Unknown tab: ${tab}`);

  // Skip GRAMMAR and general multi-token UNREAD candidates from Z3 variables:
  // - GRAMMAR tokens are non-content and never emit wires.
  // - 1-token UNREAD covers every content token; adjacent unread tokens are merged cleanly in to-sop.mjs.
  const activeCandidates = rawCandidates.filter((c) => {
    if (c.kind === HYP_KINDS.GRAMMAR) return false;
    if (c.kind !== HYP_KINDS.SEP && excluded(c)) return false;
    if (c.kind === HYP_KINDS.UNREAD && c.endTok > c.startTok && !c.propertyQualifier &&
        !c.requestBenefit && c.rolePredicate === undefined &&
        c.chartEditPredicate === undefined && c.chartAxisPair == null) return false;
    return true;
  });

  const T = tokens.length;
  const M = activeCandidates.length;
  const F = tabSpec.families.length;
  const K = tabSpec.keyList.length;
  const famToId = new Map(tabSpec.families.map((f, i) => [f, i]));
  const defaultFamId = lattice.catalog ? null : famToId.get(DEFAULT_TAB_FAMILY[tab] ?? tabSpec.defaultFamily) ?? 0;

  // Identify clause separators and verb positions to compute tight upper bound R.
  const sepToks = new Set();
  const strongClauseSeps = []; // token indices of strong clause splits ("then", "and then", "afterwards", ";", ".")
  for (const c of activeCandidates) {
    if (c.kind === HYP_KINDS.SEP && c.canSplitClause) {
      for (let t = c.startTok; t <= c.endTok; t++) sepToks.add(t);
      if (c.isStrongSplit) {
        const hasBefore = tokens.slice(0, c.startTok).some((tok) => tok.isContent && !tok.isFiller);
        const hasAfter = tokens.slice(c.endTok + 1).some((tok) => tok.isContent && !tok.isFiller);
        if (hasBefore && hasAfter) strongClauseSeps.push({ startTok: c.startTok, endTok: c.endTok, text: c.text });
      }
    }
  }

  // Distinct non-speech predicate start positions
  const predStartToks = new Set(
    activeCandidates
      .filter((c) => c.kind === HYP_KINDS.PREDICATE && (c.licensed ?? []).some((l) => !['greet', 'thank', 'farewell'].includes(l.act)))
      .map((c) => c.startTok)
  );
  // Count plausible clause boundaries: strong seps with content on both sides, OR extra predicates separated by a real SEP!
  // NEVER allow splitting with zero separator between adjacent words (prevents mid-NP splits like "replace Client | delay letter")!
  let plausibleSplits = strongClauseSeps.length;
  const sortedPreds = [...predStartToks].sort((a, b) => a - b);
  for (let i = 1; i < sortedPreds.length; i++) {
    const prevP = sortedPreds[i - 1], curP = sortedPreds[i];
    if (curP - prevP >= 2) {
      let hasSepBetween = false;
      for (let t = prevP + 1; t < curP; t++) if (sepToks.has(t)) { hasSepBetween = true; break; }
      if (hasSepBetween) plausibleSplits = Math.max(plausibleSplits, i);
    }
  }
  plausibleSplits += new Set(coordinatedChanges.map(([first]) => first.endTok)).size;
  const R = T === 0 ? 1 : Math.max(1, Math.min(maxRequests, 1 + plausibleSplits));

  const lines = [];
  const queryVars = [];
  const blockVars = [];
  const semanticBlockVars = [];
  const chartAxisOrderVars = [];
  const elided = new Map(); // c.id -> { phase?, want?, kw? }
  const emit = (s) => lines.push(s);

  emit(`; Problem: T=${T} M=${M} R=${R}`);

  // Collect candidates by kind and build token cover index
  const byKind = Object.fromEntries(Object.values(HYP_KINDS).map((k) => [k, []]));
  const tokCover = Array.from({ length: T }, () => []);
  for (const c of activeCandidates) {
    byKind[c.kind].push(c);
    for (let t = c.startTok; t <= c.endTok && t < T; t++) {
      tokCover[t].push(c);
    }
  }

  const preds = byKind[HYP_KINDS.PREDICATE];
  const keywords = byKind[HYP_KINDS.KEY_WORD];
  const constraints = byKind[HYP_KINDS.CONSTRAINT];
  const negs = byKind[HYP_KINDS.NEG];
  const tSorts = byKind[HYP_KINDS.TARGET_SORT];
  const tFams = byKind[HYP_KINDS.TARGET_FAMILY];
  const tRefs = byKind[HYP_KINDS.TARGET_REF];
  const frameMatches = (lattice.frameMatches ?? []).filter((fm) => VALID_ACT_SET.has(fm.act) && !excluded(fm));
  const propertyFrames = frameMatches.filter((fm) => fm.propertyOwnerMarker || fm.contextProperty);
  const grammarBetween = (left, right) => tokens.slice(left.endTok + 1, right.startTok)
    .every((token) => token.isGrammar && !token.isPunct);

  // Index KEY_WORDs by attrName (only attrs that actually have a KEY_WORD in this sentence can be `asked_r`!)
  const kwByAttr = new Map();
  const usedKwAttrIds = new Set();
  for (const k of keywords) {
    for (const a of k.attrs ?? []) {
      if (!kwByAttr.has(a)) kwByAttr.set(a, []);
      kwByAttr.get(a).push(k);
      const aid = tabSpec.attrToId.get(a);
      if (aid !== undefined) usedKwAttrIds.add(aid);
    }
  }

  // -------------------------------------------------------------------------
  // 1. Per-request declarations & core axioms
  // -------------------------------------------------------------------------
  for (let r = 1; r <= R; r++) {
    emit(`(declare-const active_${r} Bool)`);
    emit(`(declare-const act_${r} Act)`);
    emit(`(declare-const amode_${r} ActMode)`);
    emit(`(declare-const mood_${r} Mood)`);
    emit(`(declare-const q_${r} Question)`);
    emit(`(declare-const asked_${r} Int)`);
    emit(`(declare-const fam_${r} Int)`);
    emit(`(declare-const tmode_${r} TargetMode)`);
    emit(`(declare-const tfill_${r} TargetFill)`);
    emit(`(declare-const tdet_${r} Det)`);
    emit(`(declare-const lookup_${r} Bool)`);
    emit(`(declare-const rstart_${r} Int)`);
    emit(`(declare-const rend_${r} Int)`);
    emit(`(declare-const tpos_${r} Int)`);
    emit(`(declare-const ppos_${r} Int)`);
    emit(`(declare-const ident_${r} Bool)`);

    queryVars.push(
      `active_${r}`, `act_${r}`, `amode_${r}`, `mood_${r}`, `q_${r}`, `asked_${r}`,
      `fam_${r}`, `tmode_${r}`, `tfill_${r}`, `tdet_${r}`, `lookup_${r}`,
      `rstart_${r}`, `rend_${r}`, `tpos_${r}`, `ppos_${r}`, `ident_${r}`,
    );
    blockVars.push(`active_${r}`, `act_${r}`, `fam_${r}`, `tmode_${r}`);
    semanticBlockVars.push(`active_${r}`, `act_${r}`, `q_${r}`, `fam_${r}`);

    // Compact domain for asked_r: only -1 or attrIds that actually have a KEY_WORD in this sentence!
    if (usedKwAttrIds.size === 0) {
      emit(`(assert (= asked_${r} (- 1)))`);
    } else {
      const askedDom = [`(= asked_${r} (- 1))`, ...[...usedKwAttrIds].map((id) => `(= asked_${r} ${id})`)];
      emit(`(assert ${smtOr(askedDom)})`);
    }
    emit(`(assert (and (<= 0 fam_${r}) (< fam_${r} ${F})))`);
    emit(`(assert (and (<= (- 1) tpos_${r}) (< tpos_${r} ${Math.max(1, T)})))`);
    emit(`(assert (and (<= (- 1) ppos_${r}) (< ppos_${r} ${Math.max(1, T)})))`);

    if (T > 0) {
      emit(`(assert (=> active_${r} (and (<= 0 rstart_${r}) (<= rstart_${r} rend_${r}) (< rend_${r} ${T}))))`);
    } else {
      emit(`(assert (and (= rstart_${r} 0) (= rend_${r} 0)))`);
    }
    for (const scope of nonDirectives) {
      emit(`(assert (=> active_${r} (or (< rend_${r} ${scope.startTok}) (> rstart_${r} ${scope.endTok}))))`);
    }
    emit(`(assert (=> (not active_${r}) (and (= rstart_${r} 0) (= rend_${r} 0) (= tpos_${r} (- 1)) (= ppos_${r} (- 1)) (= asked_${r} (- 1)) (not lookup_${r}) (not ident_${r}))))`);

    // Core w.request axioms from smt/axioms.smt2
    emit(`(assert (=> active_${r} (valid-act-mode act_${r} amode_${r})))`);
    emit(`(assert (=> active_${r} (valid-mood-act mood_${r} act_${r} q_${r} asked_${r})))`);
    emit(`(assert (=> active_${r} (valid-act-target-mode act_${r} tmode_${r})))`);
    emit(`(assert (=> active_${r} (valid-verbless-act ppos_${r} act_${r})))`);
    emit(`(assert (=> active_${r} (valid-target-fill tmode_${r} tfill_${r} lookup_${r})))`);
    emit(`(assert (=> active_${r} (lookup-law tmode_${r} tfill_${r} ident_${r} lookup_${r})))`);

    // Speech acts (greet/thank/farewell) are fillers in w.request, not standalone tab requests
    emit(`(assert (=> active_${r} (and (not (= act_${r} ACT_GREET)) (not (= act_${r} ACT_THANK)) (not (= act_${r} ACT_FAREWELL)))))`);
  }

  // Allow 0-request pure-filler conversational circuits ("thanks, that works", "no problem, cheers")
  // ONLY when every content token is covered by FILLER; otherwise activate @r1.
  const canBeZeroReq = T > 0 && tokens.every((tok, idx) =>
    !tok.isContent || tokCover[idx].some((c) => c.kind === HYP_KINDS.FILLER) || nonDirectives.some((span) =>
      span.startTok <= idx && idx <= span.endTok)
  );
  if (nonDirectives.length && !activeCandidates.some((c) => c.kind !== HYP_KINDS.FILLER && c.kind !== HYP_KINDS.SEP)) {
    emit('(assert (not active_1))');
  } else if (canBeZeroReq) {
    emit(`(assert-soft active_1 :weight ${W.zeroReqActivate})`);
  } else {
    emit(`(assert active_1)`);
  }
  // Request 1 can NEVER be TM_BOUND (no earlier request in this message created its referent!)
  emit(`(assert (=> active_1 (not (= tmode_1 TM_BOUND))))`);

  for (let r = 1; r < R; r++) {
    emit(`(assert (=> active_${r + 1} active_${r}))`);
    emit(`(assert (=> active_${r + 1} (< rend_${r} rstart_${r + 1})))`);
    emit(`(assert-soft (not (= tmode_${r + 1} TM_BOUND)) :weight ${W.avoidBound})`);

    const splitGuards = [];
    for (const st of sepToks) {
      splitGuards.push(`(and (< rend_${r} ${st}) (< ${st} rstart_${r + 1}))`);
    }
    if (splitGuards.length > 0) {
      emit(`(assert (=> active_${r + 1} ${smtOr(splitGuards)}))`);
    } else {
      emit(`(assert (not active_${r + 1}))`);
    }
  }

  // Strong clause separator penalty:
  // - For strong word separators ("then", "and then", "afterwards"): require predicates on both sides.
  // - For sentence-ending '.' or ';': fire whenever BOTH sides have non-filler content tokens (handles verbless 2nd clauses like ". font bigger" / "; x on top")!
  if (R > 1) {
    for (const sp of strongClauseSeps) {
      const isWordStrongSep = /\b(then|afterwards)\b/i.test(sp.text);
      const isPunctStrongSep = sp.text === '.' || sp.text === ';';
      const hasPredBefore = [...predStartToks].some((pt) => pt < sp.startTok);
      const hasPredAfter = [...predStartToks].some((pt) => pt > sp.endTok);
      const afterNonFillerContent = tokens.slice(sp.endTok + 1).filter((tok) => tok.isContent && !tok.isFiller).length;
      const afterIsOnlyFillerPhrase = activeCandidates.some(
        (c) => c.kind === HYP_KINDS.FILLER && c.startTok <= sp.endTok + 1 && c.endTok >= T - 2
      );
      const shouldSplit =
        (isWordStrongSep && hasPredBefore && hasPredAfter) ||
        (isPunctStrongSep && afterNonFillerContent >= 1 && !afterIsOnlyFillerPhrase);
      if (shouldSplit) {
        const sepPenalty = isPunctStrongSep ? Math.max(95, W.strongSepNoStraddle) : W.strongSepNoStraddle;
        for (let r = 1; r <= R; r++) {
          emit(`(assert-soft (not (and active_${r} (< rstart_${r} ${sp.startTok}) (> rend_${r} ${sp.endTok}))) :weight ${sepPenalty})`);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 2. Per-candidate declarations & basic ownership rules
  // -------------------------------------------------------------------------
  const outerFillerIds = new Set();
  for (const c of activeCandidates) {
    emit(`(declare-const sel_${c.id} Bool)`);
    emit(`(declare-const own_${c.id} Int)`);
    queryVars.push(`sel_${c.id}`, `own_${c.id}`);
    if (c.kind !== HYP_KINDS.SEP) blockVars.push(`sel_${c.id}`);

    emit(`(assert (and (<= 0 own_${c.id}) (<= own_${c.id} ${R})))`);
    emit(`(assert (=> (not sel_${c.id}) (= own_${c.id} 0)))`);

    const isOuterOnly = c.kind === HYP_KINDS.FILLER || c.kind === HYP_KINDS.SEP;
    if (isOuterOnly) {
      emit(`(assert (= own_${c.id} 0))`);
      if (c.politeFiller) emit(`(assert sel_${c.id})`);
      // Exact check.mjs filler purity enforcement: filler hiding content words MUST sit strictly outside every request!
      if (c.kind === HYP_KINDS.FILLER && (c.politeFiller || fillerHasHiddenContent(c.text, kb))) {
        outerFillerIds.add(c.id);
        for (let r = 1; r <= R; r++) {
          emit(`(assert (=> (and sel_${c.id} active_${r}) (span-outside-req rstart_${r} rend_${r} ${c.startTok} ${c.endTok})))`);
        }
      }
    } else {
      emit(`(assert (=> sel_${c.id} (>= own_${c.id} 1)))`);
      if (c.requestBenefit) emit(`(assert sel_${c.id})`);
      for (let r = 1; r <= R; r++) {
        emit(`(assert (=> (and sel_${c.id} (= own_${c.id} ${r})) (and active_${r} (span-in-req rstart_${r} rend_${r} ${c.startTok} ${c.endTok}))))`);
        if (c.requestBenefit) emit(`(assert (=> (= own_${c.id} ${r}) (<= rstart_${r} ${c.nominalStart})))`);
      }
    }
  }

  // Frame variables also license property-to-value keyword bindings across the owner phrase.
  for (const fm of frameMatches) {
    emit(`(declare-const sel_fr_${fm.id} Bool)`);
    emit(`(declare-const own_fr_${fm.id} Int)`);
    emit(`(assert (and (<= 0 own_fr_${fm.id}) (<= own_fr_${fm.id} ${R})))`);
    emit(`(assert (=> (not sel_fr_${fm.id}) (= own_fr_${fm.id} 0)))`);
    emit(`(assert (=> sel_fr_${fm.id} (>= own_fr_${fm.id} 1)))`);
  }
  const qualifierCandidates = byKind[HYP_KINDS.UNREAD].filter((c) => c.propertyQualifier);
  for (const qualifier of qualifierCandidates) {
    const frames = frameMatches.filter((fm) => {
      const span = fm.unresolvedDuration ?? fm.contextProperty?.unresolved;
      return span && sameSpan(qualifier, span);
    });
    const owners = frames.map((fm) => `(and sel_fr_${fm.id} (= own_${qualifier.id} own_fr_${fm.id}))`);
    emit(`(assert (=> sel_${qualifier.id} ${smtOr(owners)}))`);
    if (qualifier.requiredRelativeTime) emit(`(assert sel_${qualifier.id})`);
  }

  // Pre-compute compatible KEY_WORDs and NEGs for each CONSTRAINT (elide unused Z3 variables!)
  const compatKwsOfConstraint = new Map();
  const constraintsUsingKw = new Map(keywords.map((k) => [k.id, []]));
  const negsTargetingConstraint = new Map(constraints.map((c) => [c.id, []]));

  for (const n of negs) {
    emit(`(declare-const ntgt_${n.id} Int)`);
    queryVars.push(`ntgt_${n.id}`);
    const nearC = constraints.filter((c) => {
      const gap = c.startTok - n.endTok;
      return gap >= 1 && gap <= 4;
    });
    const dom = [`(= ntgt_${n.id} (- 1))`, ...nearC.map((c) => `(= ntgt_${n.id} ${c.id})`)];
    emit(`(assert ${smtOr(dom)})`);
    emit(`(assert (=> (not sel_${n.id}) (= ntgt_${n.id} (- 1))))`);
    for (const c of nearC) negsTargetingConstraint.get(c.id).push(n);
  }

  const phaseExprOf = new Map();
  const wantExprOf = new Map();
  const kwExprOf = new Map();

  for (const c of constraints) {
    const shortKey = c.attribute && c.attribute.includes('.') ? c.attribute.split('.').slice(1).join('.') : '';
    const isSelectorOnly = ['ids', 'anchor', 'relation_anchor', 'order_anchor', 'behind', 'seat'].includes(shortKey) && c.attribute !== 'part.ids';
    const allowedPh = c.allowedPhases?.length
      ? c.allowedPhases
      : isSelectorOnly
        ? ['selector']
        : ['result', 'selector'];

    const elideRec = {};
    if (allowedPh.length === 1) {
      const fixedPh = phaseToSmt(allowedPh[0]);
      phaseExprOf.set(c.id, fixedPh);
      elideRec.phase = fixedPh;
    } else {
      emit(`(declare-const ph_${c.id} Phase)`);
      queryVars.push(`ph_${c.id}`);
      phaseExprOf.set(c.id, `ph_${c.id}`);
    }

    const negList = negsTargetingConstraint.get(c.id) ?? [];
    const intrinsicWant = wantToSmt(c.want ?? 'yes');
    if (negList.length === 0) {
      wantExprOf.set(c.id, intrinsicWant);
      elideRec.want = intrinsicWant;
    } else {
      emit(`(declare-const wnt_${c.id} Want)`);
      queryVars.push(`wnt_${c.id}`);
      wantExprOf.set(c.id, `wnt_${c.id}`);
      const anyNeg = smtOr(negList.map((n) => `(= ntgt_${n.id} ${c.id})`));
      emit(`(assert (=> (not ${anyNeg}) (= wnt_${c.id} ${intrinsicWant})))`);
      for (const n of negList) {
        emit(`(assert (=> (= ntgt_${n.id} ${c.id}) (and sel_${n.id} sel_${c.id} (= own_${c.id} own_${n.id}) (= wnt_${c.id} ${wantToSmt(n.negWant ?? 'no')}))))`);
      }
    }

    // Local keywords retain the normal distance bound. A matched property frame can
    // license its exact keyword and value spans across the intervening owner phrase.
    const kwList = [];
    const longKwFrames = new Map();
    const valueFrames = propertyFrames.filter((fm) => sameSpan(c, fm.valSpan) && fm.expectedAttrs.includes(c.attribute));
    if (c.attribute && kwByAttr.has(c.attribute)) {
      for (const k of kwByAttr.get(c.attribute)) {
        const scopedEdit = k.chartEditPredicate != null || c.chartEditPredicate != null;
        if (scopedEdit && k.chartEditPredicate !== c.chartEditPredicate) continue;
        const scopedAxis = Boolean(k.chartAxisAssignment || c.chartAxisAssignment);
        if (scopedAxis && (!k.chartAxisAssignment || !c.chartAxisAssignment ||
            k.chartAxisPair !== c.chartAxisPair)) continue;
        const overlaps = !(k.endTok < c.startTok || c.endTok < k.startTok);
        if (overlaps) continue;
        const lo = Math.min(k.endTok, c.endTok);
        const hi = Math.max(k.startTok, c.startTok);
        if (!scopedEdit && !scopedAxis && hi - lo > 5) {
          const frames = valueFrames.filter((fm) => sameSpan(k, fm.attrSpan));
          if (frames.length === 0) continue;
          longKwFrames.set(k.id, frames);
        }
        let crossesHardPunct = false;
        for (let t = lo + 1; t < hi; t++) {
          if (tokens[t].isPunct && (tokens[t].text === ';' || tokens[t].text === '.')) {
            crossesHardPunct = true;
            break;
          }
        }
        if (crossesHardPunct) continue;
        kwList.push(k);
        constraintsUsingKw.get(k.id).push(c);
      }
    }
    compatKwsOfConstraint.set(c.id, kwList);

    if (kwList.length === 0) {
      kwExprOf.set(c.id, '(- 1)');
      elideRec.kw = -1;
      if (c.requiresKeyWord) emit(`(assert (not sel_${c.id}))`);
    } else {
      emit(`(declare-const kw_${c.id} Int)`);
      queryVars.push(`kw_${c.id}`);
      kwExprOf.set(c.id, `kw_${c.id}`);
      const kwDom = [`(= kw_${c.id} (- 1))`, ...kwList.map((k) => `(= kw_${c.id} ${k.id})`)];
      emit(`(assert ${smtOr(kwDom)})`);
      emit(`(assert (=> (not sel_${c.id}) (= kw_${c.id} (- 1))))`);
      if (c.requiresKeyWord) emit(`(assert (=> sel_${c.id} (>= kw_${c.id} 0)))`);
      const dist1Kws = [];
      const dist2Kws = [];
      for (const k of kwList) {
        emit(`(assert (=> (= kw_${c.id} ${k.id}) (and sel_${c.id} sel_${k.id} (= own_${c.id} own_${k.id}))))`);
        const frames = longKwFrames.get(k.id);
        if (frames) {
          const licences = frames.map((fm) => `(and sel_fr_${fm.id} (= own_fr_${fm.id} own_${c.id}))`);
          emit(`(assert (=> (= kw_${c.id} ${k.id}) ${smtOr(licences)}))`);
        }
        const dist = k.endTok < c.startTok ? c.startTok - k.endTok : k.startTok - c.endTok;
        if (dist === 1) dist1Kws.push(`(= kw_${c.id} ${k.id})`);
        if (dist <= 2) dist2Kws.push(`(= kw_${c.id} ${k.id})`);
      }
      // Single disjunction per distance band (never conflicting per-k soft clauses that penalize selecting c!)
      if (dist1Kws.length > 0) {
        emit(`(assert-soft (=> (and sel_${c.id} (>= kw_${c.id} 0)) ${smtOr(dist1Kws)}) :weight 10)`);
      }
      if (dist2Kws.length > 0 && dist2Kws.length > dist1Kws.length) {
        emit(`(assert-soft (=> (and sel_${c.id} (>= kw_${c.id} 0)) ${smtOr(dist2Kws)}) :weight 5)`);
      }
    }

    if (Object.keys(elideRec).length > 0) elided.set(c.id, elideRec);
  }

  // -------------------------------------------------------------------------
  // 3. Token Non-Overlap & Complete Content Coverage
  // -------------------------------------------------------------------------
  for (let t = 0; t < T; t++) {
    const cov = tokCover[t];
    const selVars = cov.map((c) => `sel_${c.id}`);
    const amo = atMostOne(selVars);
    if (amo) emit(`(assert ${amo})`);

    if (tokens[t].isContent && selVars.length > 0) {
      emit(`(assert ${smtOr(selVars)})`);
    }
  }

  const reqOwned = activeCandidates.filter((c) => c.kind !== HYP_KINDS.FILLER && c.kind !== HYP_KINDS.SEP);
  const argOwned = activeCandidates.filter((c) =>
    c.kind === HYP_KINDS.TARGET_SORT || c.kind === HYP_KINDS.TARGET_FAMILY ||
    c.kind === HYP_KINDS.TARGET_REF || c.kind === HYP_KINDS.CONSTRAINT || c.kind === HYP_KINDS.UNREAD
  );
  const targetlessPredicates = preds.filter((candidate) => candidate.targetless);
  for (let r = 1; r <= R; r++) {
    const ownsAny = reqOwned.map((c) => `(and sel_${c.id} (= own_${c.id} ${r}))`);
    if (ownsAny.length > 0) {
      emit(`(assert (=> active_${r} ${smtOr(ownsAny)}))`);
    }
    // An extra request slot (r > 1) must carry at least one target/constraint/unread OR be a zero-arg act (undo/redo/save/deselect/copy-repeat);
    // and when splitting (active_2), r = 1 must also carry an argument or be a zero-arg act (never an orphan 1-word verb shell!).
    if (argOwned.length > 0) {
      const hasArg = smtOr(argOwned.map((c) => `(and sel_${c.id} (= own_${c.id} ${r}))`));
      const isZeroArgAct = `(or (= act_${r} ACT_UNDO) (= act_${r} ACT_REDO) (= act_${r} ACT_SAVE) (= act_${r} ACT_DESELECT) (and (= act_${r} ACT_COPY) (= amode_${r} MODE_REPEAT)))`;
      const explicitTargetless = smtOr(targetlessPredicates.map((p) =>
        `(and sel_${p.id} (= own_${p.id} ${r}))`));
      if (r > 1) {
        emit(`(assert (=> active_${r} (or ${hasArg} ${isZeroArgAct} ${explicitTargetless})))`);
      } else if (R > 1) {
        emit(`(assert (=> active_2 (or ${hasArg} ${isZeroArgAct} ${explicitTargetless})))`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. Predicates, Mood, Questions & Keeping-Verb Law
  // -------------------------------------------------------------------------
  const closedQuestions = targetlessPredicates.filter(({ licensed }) =>
    licensed.some(({ act, question }) => act === 'ask' && question === 'list'));
  for (const predicate of targetlessPredicates) {
    const closedQuestion = closedQuestions.includes(predicate);
    if (closedQuestion && closedQuestions.length <= R) {
      emit(`(assert sel_${predicate.id})`);
    } else {
      emit(`(assert-soft sel_${predicate.id} :weight ${W.predicateRole})`);
    }
    for (let r = 1; r <= R; r++) {
      const otherOperands = [...tSorts, ...tFams, ...tRefs, ...constraints].map((candidate) =>
        `(= own_${candidate.id} ${r})`);
      // A targetless question has no emitted family. Freeze the internal
      // family slot so top-K cannot manufacture duplicate question circuits.
      const noOperands = `(not ${smtOr(otherOperands)})`;
      const targetless = closedQuestion ? `(and ${noOperands} (= fam_${r} 0))` : noOperands;
      emit(`(assert (=> (and sel_${predicate.id} (= own_${predicate.id} ${r})) ${targetless}))`);
    }
  }
  const outputPredicates = preds.filter(({ outputTargetEnd }) => outputTargetEnd !== undefined);
  const outputRoles = activeCandidates.filter(({ rolePredicate }) => rolePredicate !== undefined);
  for (const intent of outputRoles.filter(({ purposePredicate }) => purposePredicate !== undefined)) {
    for (let r = 1; r <= R; r++) {
      emit(`(assert (=> (= own_${intent.id} ${r}) (= ppos_${r} ${intent.purposePredicate})))`);
    }
  }
  const outputHeads = [...tSorts, ...tFams, ...tRefs];
  for (const predicate of outputPredicates) {
    const roles = outputRoles.filter(({ rolePredicate }) => rolePredicate === predicate.startTok);
    const artifact = outputHeads.filter((head) =>
      head.startTok > predicate.endTok && head.endTok <= predicate.outputTargetEnd &&
      (!predicate.bareReference || (head.isPronoun && head.startTok === predicate.endTok + 1 &&
        head.endTok === predicate.outputTargetEnd)));
    const loadHeads = predicate.loadHeads?.length ? artifact.filter((candidate) => predicate.loadHeads.some((head) =>
      head.kind === candidate.kind && head.family === candidate.family && sameSpan(head, candidate))) : [];
    if ((!roles.length && !predicate.bareReference && !loadHeads.length) || !artifact.length) continue;
    if (outputPredicates.length <= R) {
      emit(`(assert sel_${predicate.id})`);
    } else {
      emit(`(assert-soft sel_${predicate.id} :weight ${W.predicateRole})`);
    }
    for (let r = 1; r <= R; r++) {
      const owns = (candidate) => `(and sel_${candidate.id} (= own_${candidate.id} ${r}))`;
      const foreign = outputHeads.filter((head) => !artifact.includes(head));
      // A bare artifact reference has no emitted family. Its internal slot
      // must not consume the returned alternatives with arbitrary types.
      const untyped = predicate.bareReference ? [
        `(= fam_${r} 0)`,
        `(= tmode_${r} TM_EXISTING)`,
        `(<= rend_${r} ${Math.max(predicate.outputTargetEnd, ...roles.map(({ endTok }) => endTok))})`,
        `(not ${smtOr(constraints.map(owns))})`,
      ] : [];
      const existingArtifact = loadHeads.length ? `(= tmode_${r} TM_EXISTING) ${smtOr(loadHeads.map(owns))}` : '';
      emit(`(assert (=> ${owns(predicate)} (and ${smtOr(artifact.map(owns))}
        ${[...roles.map(owns), ...untyped].join(' ')} ${existingArtifact} (not ${smtOr(foreign.map(owns))}))))`);
      for (const role of roles) emit(`(assert (=> ${owns(role)} ${owns(predicate)}))`);
      if (predicate.modalOutput) {
        emit(`(assert (=> ${owns(predicate)} (and (= q_${r} Q_NONE) (= asked_${r} (- 1)))))`);
        if (predicate.licensed.some(({ act }) => act === 'save')) {
          emit(`(assert-soft (=> ${owns(predicate)} (= act_${r} ACT_SAVE)) :weight ${W.predicateRole})`);
        }
      }
    }
  }
  const chartEdits = activeCandidates.filter(({ chartEditEnd }) => chartEditEnd !== undefined);
  for (const anchor of chartEdits) {
    const start = anchor.chartEditStart ?? anchor.startTok;
    const operands = activeCandidates.filter((candidate) => candidate.chartEditPredicate === start);
    if (!operands.some(({ kind, unresolvedResult }) => kind === HYP_KINDS.CONSTRAINT || unresolvedResult)) continue;
    if (chartEdits.length + outputPredicates.length <= R) {
      emit(`(assert sel_${anchor.id})`);
    } else {
      emit(`(assert-soft sel_${anchor.id} :weight ${W.predicateRole})`);
    }
    for (let r = 1; r <= R; r++) {
      const owns = (candidate) => `(and sel_${candidate.id} (= own_${candidate.id} ${r}))`;
      const otherHeads = outputHeads.filter((candidate) => candidate.chartEditPredicate !== start);
      const roles = operands.filter((candidate) => candidate.kind === HYP_KINDS.CONSTRAINT)
        .map((candidate) => `(= ${phaseExprOf.get(candidate.id)} PH_RESULT)`);
      const implicit = anchor.chartEditStart === undefined ? '' :
        `(= act_${r} ACT_CHANGE) (= mood_${r} MOOD_DO) (= ppos_${r} (- 1))`;
      const owner = operands.find(({ kind }) => kind === HYP_KINDS.TARGET_REF);
      const fill = owner?.description ? 'TF_DESCRIPTION' : owner?.name ? 'TF_WRITTEN' : 'TF_CONTEXT';
      emit(`(assert (=> ${owns(anchor)} (and (= fam_${r} ${famToId.get('chart')})
        (= tmode_${r} TM_EXISTING) (= tfill_${r} ${fill})
        (<= rend_${r} ${anchor.chartEditEnd}) ${implicit} ${roles.join(' ')} ${operands.map(owns).join(' ')}
        (not ${smtOr(otherHeads.map(owns))}))))`);
      for (const operand of operands) emit(`(assert (=> ${owns(operand)} ${owns(anchor)}))`);
    }
  }
  const groundedPredicates = preds.filter(({ predicateTargetHeads }) => predicateTargetHeads);
  for (const predicate of groundedPredicates) {
    const artifact = outputHeads.filter((candidate) => predicate.predicateTargetHeads.some((head) =>
      head.kind === candidate.kind && head.family === candidate.family && sameSpan(head, candidate)));
    if (!artifact.length) continue;
    if (groundedPredicates.length + outputPredicates.length <= R) {
      emit(`(assert sel_${predicate.id})`);
    } else {
      emit(`(assert-soft sel_${predicate.id} :weight ${W.predicateRole})`);
    }
    for (let r = 1; r <= R; r++) {
      const owns = (candidate) => `(and sel_${candidate.id} (= own_${candidate.id} ${r}))`;
      const grounded = artifact.map((head) => `(and ${owns(head)} (= tpos_${r} ${head.startTok}))`);
      emit(`(assert (=> ${owns(predicate)} ${smtOr(grounded)}))`);
      if (predicate.creationEnd != null) {
        emit(`(assert (=> ${owns(predicate)} (and (= tmode_${r} TM_NEW) (<= rend_${r} ${predicate.creationEnd}))))`);
      }
    }
  }
  for (let r = 1; r <= R; r++) {
    const pInR = preds.map((p) => `(and sel_${p.id} (= own_${p.id} ${r}))`);
    const amo = atMostOne(pInR);
    if (amo) emit(`(assert ${amo})`);

    const anyP = smtOr(pInR);
    emit(`(assert (=> (not ${anyP}) (= ppos_${r} (- 1))))`);
    for (const p of preds) {
      emit(`(assert (=> (and sel_${p.id} (= own_${p.id} ${r})) (= ppos_${r} ${p.startTok})))`);
      const licClauses = [];
      for (const lic of p.licensed ?? []) {
        if (!VALID_ACT_SET.has(lic.act)) continue;
        const parts = [`(= act_${r} ${actToSmt(lic.act)})`];
        if (lic.mode && lic.mode !== 'none') parts.push(`(= amode_${r} ${modeToSmt(lic.mode)})`);
        else parts.push(`(= amode_${r} MODE_NONE)`);
        if (lic.mood) parts.push(`(= mood_${r} ${moodToSmt(lic.mood)})`);
        if (lic.question && lic.question !== 'none') parts.push(`(= q_${r} ${questionToSmt(lic.question)})`);
        licClauses.push(smtAnd(parts));
      }
      if (licClauses.length > 0) {
        emit(`(assert (=> (and sel_${p.id} (= own_${p.id} ${r})) ${smtOr(licClauses)}))`);
      } else {
        emit(`(assert (not (and sel_${p.id} (= own_${p.id} ${r}))))`);
      }

      // Keeping-verb exclusion law (check.mjs line 260):
      // A keeping verb ("keep", "leave", "spare") ONLY acts as `act=remove` when an exclusion cue
      // ("only", "just", "nothing else", "everything else", "rest") or negated selector (W_NO) is present!
      // Otherwise "keep the tick numbers two digits" / "keep the title bold" is `act=change`.
      if ((p.licensed ?? []).some((l) => l.keeping)) {
        const hasExclusionCue = tokens.some((tok) => ['only', 'just', 'else', 'rest', 'except', 'other'].includes(tok.lower));
        const selConsInR = constraints.map(
          (c) => `(and sel_${c.id} (= own_${c.id} ${r}) (= ${phaseExprOf.get(c.id)} PH_SELECTOR))`
        );
        const negSelConsInR = constraints.map(
          (c) => `(and sel_${c.id} (= own_${c.id} ${r}) (= ${phaseExprOf.get(c.id)} PH_SELECTOR) (= ${wantExprOf.get(c.id)} W_NO))`
        );
        if (!hasExclusionCue) {
          if (negSelConsInR.length > 0) {
            emit(`(assert (=> (and sel_${p.id} (= own_${p.id} ${r}) (= act_${r} ACT_REMOVE)) ${smtOr(negSelConsInR)}))`);
          } else {
            emit(`(assert (not (and sel_${p.id} (= own_${p.id} ${r}) (= act_${r} ACT_REMOVE))))`);
          }
        } else if (selConsInR.length > 0) {
          emit(`(assert (=> (and sel_${p.id} (= own_${p.id} ${r}) (= act_${r} ACT_REMOVE) ${smtOr(selConsInR)}) ${smtOr(negSelConsInR)}))`);
        }
      }

      // Clause-edge WH-fronting law (English syntax):
      // Without '?', a WH-word or copula ("where", "which", "who", "when", "what", "how", "is", "are", "do", "does")
      // buried inside a clause (`p.startTok > rstart_r + 1`) is a relative/subordinate clause (e.g. "... keeping everything else where it is",
      // "... which is on the ground floor"), NEVER a main `act=ask` question predicate!
      if (!hasQuestionMark && (p.licensed ?? []).some((l) => l.act === 'ask')
        && /^(what|what's|which|where|when|who|why|how|is|are|was|were|do|does|did)\b/i.test(p.text)) {
        emit(`(assert (=> (and sel_${p.id} (= own_${p.id} ${r}) (= act_${r} ACT_ASK)) (<= ${p.startTok} (+ rstart_${r} 1))))`);
      }

      // Creation verb immediately followed by indefinite article ("make a ...", "create a ...", "add an ...", "build a ...", "write a ...")
      // strongly signals creation (`act=make, tmode=new`) rather than modifying an existing referent!
      const isCreationVerb = (p.licensed ?? []).some((l) => l.act === 'make');
      const nextIsIndef = p.endTok + 1 < T && ['a', 'an'].includes(tokens[p.endTok + 1].lower);
      if (isCreationVerb && nextIsIndef) {
        emit(`(assert-soft (=> (and sel_${p.id} (= own_${p.id} ${r})) (and (= act_${r} ACT_MAKE) (= tmode_${r} TM_NEW))) :weight ${W.creationVerbIndefMakeNew})`);
      }

      // Dynamic `k.actions.marking` alignment in Z3 (Single Source of Truth from SOP k.actions/shards/verbs-*.sop!):
      // When predicate `p` has a declared marking (verb, act, marker, role) AND that marker appears
      // after `p` in the sentence, reward Z3 for selecting the marked `act`!
      if (kb?.markings instanceof Map) {
        const pTok = tokens[p.startTok];
        const verbKeys = pTok?.lemmas ? [p.text.toLowerCase(), ...pTok.lemmas] : [p.text.toLowerCase()];
        const matchedMarkingActs = new Set();
        for (const vk of verbKeys) {
          const mList = kb.markings.get(vk);
          if (!mList) continue;
          for (const mk of mList) {
            if (!VALID_ACT_SET.has(mk.act) || !(p.licensed ?? []).some((l) => l.act === mk.act)) continue;
            // Check if mk.marker appears within 1..8 tokens after p
            const mParts = mk.marker.split(/\s+/);
            for (let j = p.endTok + 1; j <= Math.min(T - mParts.length, p.endTok + 8); j++) {
              let okM = true;
              for (let u = 0; u < mParts.length; u++) {
                if (tokens[j + u]?.lower !== mParts[u]) { okM = false; break; }
              }
              if (okM) {
                matchedMarkingActs.add(mk.act);
                break;
              }
            }
          }
        }
        if (matchedMarkingActs.size === 1) {
          const [onlyAct] = matchedMarkingActs;
          emit(`(assert-soft (=> (and sel_${p.id} (= own_${p.id} ${r})) (= act_${r} ${actToSmt(onlyAct)})) :weight ${W.markingActAlign})`);
        }
      }
    }

    // Without a question predicate, disallow ACT_ASK unless question mark AND no action predicate!
    const askPredsInR = preds
      .filter((p) => (p.licensed ?? []).some((l) => l.act === 'ask'))
      .map((p) => `(and sel_${p.id} (= own_${p.id} ${r}))`);
    if (!hasQuestionMark && askPredsInR.length === 0) {
      emit(`(assert (=> active_${r} (not (= act_${r} ACT_ASK))))`);
    } else if (!hasQuestionMark) {
      emit(`(assert (=> (and active_${r} (= act_${r} ACT_ASK)) ${smtOr(askPredsInR)}))`);
    }
  }

  // -------------------------------------------------------------------------
  // 5. Target Coherence, Family, Position, Identification & Fill
  // -------------------------------------------------------------------------
  if (creation) {
    // In a projected shared-verb argument, bind the creation to the same
    // lexical head and verb positions that licensed the projection.
    const { heads, predicateStart, predicateEnd } = creation;
    const ownedByRequest = (candidate) => `(and sel_${candidate.id} (= own_${candidate.id} 1))`;
    const argumentHeads = [...tSorts, ...tFams].filter((candidate) =>
      candidate.detTok === predicateEnd + 1 && heads.some((head) =>
        candidate.kind === head.kind && candidate.family === head.family &&
        candidate.sort === head.sort && candidate.text === head.text &&
        candidate.startTok - candidate.detTok === head.startTok - head.detTok));
    const writtenVerb = preds.filter(({ startTok, endTok }) =>
      startTok === predicateStart && endTok === predicateEnd);
    const primaryHead = argumentHeads.map((head) =>
      `(and ${ownedByRequest(head)} (= tpos_1 ${head.startTok}))`);
    emit(`(assert (and active_1 (= act_1 ACT_MAKE) (= tmode_1 TM_NEW) (= mood_1 MOOD_DO)
      ${smtOr(writtenVerb.map(ownedByRequest))} ${smtOr(primaryHead)}))`);
  }

  const identifyingCands = [
    ...tSorts,
    ...tRefs.filter((ref) => !ref.isPronoun && (ref.name || ref.ids?.length || ref.codeWords || ref.description || ref.countWords)),
  ];

  for (let r = 1; r <= R; r++) {
    const sInR = tSorts.map((s) => `(and sel_${s.id} (= own_${s.id} ${r}))`);
    const fInR = tFams.map((f) => `(and sel_${f.id} (= own_${f.id} ${r}))`);
    const refInR = tRefs.map((x) => `(and sel_${x.id} (= own_${x.id} ${r}))`);
    if (atMostOne(sInR)) emit(`(assert ${atMostOne(sInR)})`);
    if (atMostOne(fInR)) emit(`(assert ${atMostOne(fInR)})`);
    if (atMostOne(refInR)) emit(`(assert ${atMostOne(refInR)})`);

    const idExprs = identifyingCands.map((h) => `(and sel_${h.id} (= own_${h.id} ${r}))`);
    emit(`(assert (= ident_${r} ${smtOr(idExprs)}))`);

    const posSetters = [];
    for (const s of tSorts) {
      const sFams = s.families ?? (s.family ? [s.family] : []);
      const fids = sFams.map((fn) => famToId.get(fn)).filter((id) => id !== undefined);
      if (fids.length > 0) {
        emit(`(assert (=> (and sel_${s.id} (= own_${s.id} ${r})) ${smtOr(fids.map((id) => `(= fam_${r} ${id})`))}))`);
      }
      emit(`(assert (=> (and sel_${s.id} (= own_${s.id} ${r})) (= tpos_${r} ${s.startTok})))`);
      posSetters.push(`(and sel_${s.id} (= own_${s.id} ${r}))`);
      if (s.det && s.det !== 'none') {
        emit(`(assert-soft (=> (and sel_${s.id} (= own_${s.id} ${r})) (= tdet_${r} ${detToSmt(s.det)})) :weight 20)`);
        if (s.isPostNumId) {
          emit(`(assert-soft (=> (and sel_${s.id} (= own_${s.id} ${r})) (not (= tmode_${r} TM_NEW))) :weight 24)`);
        } else if (s.det === 'indefinite') {
          emit(`(assert-soft (=> (and sel_${s.id} (= own_${s.id} ${r})) (= tmode_${r} TM_NEW)) :weight 18)`);
        } else if (s.det === 'definite' || s.det === 'demonstrative' || s.det === 'possessive') {
          emit(`(assert-soft (=> (and sel_${s.id} (= own_${s.id} ${r})) (not (= tmode_${r} TM_NEW))) :weight 18)`);
        }
      }
      if (s.quantifier && /^(all|every|both|each)$/i.test(s.quantifier)) {
        emit(`(assert (=> (and sel_${s.id} (= own_${s.id} ${r}) (not (= tmode_${r} TM_NEW))) (= tfill_${r} TF_ALL)))`);
      }
    }

    for (const f of tFams) {
      const fid = famToId.get(f.family);
      if (fid !== undefined) {
        emit(`(assert (=> (and sel_${f.id} (= own_${f.id} ${r})) (= fam_${r} ${fid})))`);
      }
      const noSortInR = sInR.length ? `(not ${smtOr(sInR)})` : 'true';
      emit(`(assert (=> (and sel_${f.id} (= own_${f.id} ${r}) ${noSortInR}) (= tpos_${r} ${f.startTok})))`);
      posSetters.push(`(and sel_${f.id} (= own_${f.id} ${r}))`);
      if (f.det && f.det !== 'none') {
        emit(`(assert-soft (=> (and sel_${f.id} (= own_${f.id} ${r})) (= tdet_${r} ${detToSmt(f.det)})) :weight 16)`);
        if (f.det === 'indefinite') {
          emit(`(assert-soft (=> (and sel_${f.id} (= own_${f.id} ${r})) (= tmode_${r} TM_NEW)) :weight 16)`);
        } else if (f.det === 'definite' || f.det === 'possessive' || f.det === 'demonstrative') {
          emit(`(assert-soft (=> (and sel_${f.id} (= own_${f.id} ${r})) (not (= tmode_${r} TM_NEW))) :weight 16)`);
        }
      }
    }

    for (const ref of tRefs) {
      const fids = (ref.families ?? tabSpec.families).map((fn) => famToId.get(fn)).filter((id) => id !== undefined);
      if (fids.length > 0 && fids.length < F) {
        emit(`(assert (=> (and sel_${ref.id} (= own_${ref.id} ${r})) ${smtOr(fids.map((id) => `(= fam_${r} ${id})`))}))`);
      }
      if (ref.isPronoun) {
        const overtTarget = smtOr([...sInR, ...fInR]);
        emit(`(assert (=> (and sel_${ref.id} (= own_${ref.id} ${r})) (and (= tmode_${r} TM_EXISTING) (= tfill_${r} TF_CONTEXT) (not ${overtTarget}))))`);
        if (ref.isPropertyOwner) {
          const owners = propertyFrames.filter((fm) => fm.contextProperty?.ownerToken === ref.startTok)
            .map((fm) => `(and sel_fr_${fm.id} (= own_fr_${fm.id} ${r}))`);
          emit(`(assert (=> (and sel_${ref.id} (= own_${ref.id} ${r})) ${smtOr(owners)}))`);
        }
      } else if (ref.fill === 'all') {
        emit(`(assert (=> (and sel_${ref.id} (= own_${ref.id} ${r}) (not (= tmode_${r} TM_NEW))) (= tfill_${r} TF_ALL)))`);
      } else if (ref.fill === 'journal_step') {
        emit(`(assert (=> (and sel_${ref.id} (= own_${ref.id} ${r})) (and (= tmode_${r} TM_EXISTING) (= tfill_${r} TF_JOURNAL_STEP))))`);
      } else if (ref.fill === 'written') {
        emit(`(assert (=> (and sel_${ref.id} (= own_${ref.id} ${r}) (not (= tmode_${r} TM_NEW))) (= tfill_${r} TF_WRITTEN)))`);
        // Bare proper name or code WITHOUT a preceding name-introducer ("called"/"named"/"labelled"/"titled")
        // strongly refers to an EXISTING named object ("place Sri above...", "move Review to...", "enlarge Process...")!
        const hasPrecedingIntro = keywords.some(
          (k) => k.isNameIntro && k.endTok < ref.startTok && (ref.startTok - k.endTok) <= 2
        );
        if (!hasPrecedingIntro && (ref.isProper || ref.isCode)) {
          emit(`(assert-soft (=> (and sel_${ref.id} (= own_${ref.id} ${r})) (not (= tmode_${r} TM_NEW))) :weight 22)`);
        }
        // On a NEW target (TM_NEW), "called/titled/labelled X" specifies a result attribute (*.title/*.name/*.label/*.content),
        // NOT target.name (which identifies an existing referent!).
        const hasNameAttrOnSpan = constraints.some(
          (c) => c.startTok === ref.startTok && c.endTok === ref.endTok && /\.(title|name|label|content)$/.test(c.attribute ?? '')
        );
        if (hasNameAttrOnSpan) {
          emit(`(assert-soft (not (and sel_${ref.id} (= own_${ref.id} ${r}) (= tmode_${r} TM_NEW))) :weight 45)`);
        }
      }
      if (ref.det && ref.det !== 'none') {
        emit(`(assert-soft (=> (and sel_${ref.id} (= own_${ref.id} ${r})) (= tdet_${r} ${detToSmt(ref.det)})) :weight 14)`);
      }
      const noSortOrFam = (sInR.length + fInR.length) ? `(not ${smtOr([...sInR, ...fInR])})` : 'true';
      emit(`(assert (=> (and sel_${ref.id} (= own_${ref.id} ${r}) ${noSortOrFam}) (= tpos_${r} ${ref.startTok})))`);
      posSetters.push(`(and sel_${ref.id} (= own_${ref.id} ${r}))`);
    }

    emit(`(assert (=> (not ${smtOr(posSetters)}) (= tpos_${r} (- 1))))`);

    const writtenRefInR = tRefs.filter((x) => x.fill === 'written').map((x) => `(and sel_${x.id} (= own_${x.id} ${r}))`);
    const allRefInR = [
      ...tRefs.filter((x) => x.fill === 'all'),
      ...tSorts.filter((s) => s.quantifier && /^(all|every|both|each)$/i.test(s.quantifier)),
    ].map((x) => `(and sel_${x.id} (= own_${x.id} ${r}))`);
    const journalRefInR = tRefs.filter((x) => x.fill === 'journal_step').map((x) => `(and sel_${x.id} (= own_${x.id} ${r}))`);

    emit(`(assert (=> (and active_${r} (not (= tmode_${r} TM_NEW)) (not ident_${r}) (not ${smtOr(allRefInR)}) (not ${smtOr(journalRefInR)})) (= tfill_${r} TF_CONTEXT)))`);
    emit(`(assert-soft (=> (and active_${r} (not (= tmode_${r} TM_NEW)) ${smtOr(sInR)} (not ${smtOr(writtenRefInR)}) (not ${smtOr(allRefInR)})) (= tfill_${r} TF_DESCRIPTION)) :weight 15)`);

    emit(`(assert-soft (=> (and active_${r} (= tmode_${r} TM_NEW)) (= tdet_${r} DET_INDEFINITE)) :weight 4)`);
    emit(`(assert-soft (=> (and active_${r} (not (= tmode_${r} TM_NEW))) (= tdet_${r} DET_DEFINITE)) :weight 4)`);

    // Direct-object proximity: target head right after predicate (1..4 tokens) is strongly preferred
    emit(`(assert-soft (=> (and active_${r} (>= ppos_${r} 0) (>= tpos_${r} 0)) (and (> tpos_${r} ppos_${r}) (<= (- tpos_${r} ppos_${r}) 4))) :weight 10)`);
  }

  // -------------------------------------------------------------------------
  // 6. Constraints, Family Coherence, Key-Word Binding, Phase, Act Alignment & Structural Frames
  // -------------------------------------------------------------------------
  const placeConstraints = [];
  const attrOnlyConstraints = [];
  const partOwners = new Map();
  const predicateRoles = new Map();
  const makePredicates = preds.filter((p) => p.declaredMake);

  for (const dictated of constraints.filter((candidate) => candidate.dictatedContent)) {
    const unanchored = constraints.filter((candidate) =>
      candidate.attribute === dictated.attribute && !candidate.requiresKeyWord);
    for (const candidate of unanchored) {
      // A lexical fallback cannot append content to the same request when
      // a selected dictation cue already supplies that property's value.
      emit(`(assert (not (and sel_${dictated.id} sel_${candidate.id} (= own_${dictated.id} own_${candidate.id}))))`);
    }
  }

  for (const c of constraints) {
    const cFam = c.attrFamily ?? c.family ?? (c.attribute ? c.attribute.split('.')[0] : null);
    const cFamId = cFam ? famToId.get(cFam) : undefined;
    const compatFids = cFam ? tabSpec.families.flatMap((family, id) =>
      acceptsPropertyFamily(family, cFam) ? [id] : []) : [];
    const phExpr = phaseExprOf.get(c.id);
    const shortKey = c.attribute && c.attribute.includes('.') ? c.attribute.split('.').slice(1).join('.') : '';
    const partHeads = c.partHead && [...tSorts, ...tFams].filter((h) => h.family === c.family &&
      h.startTok === c.partHead[0] && h.endTok === c.partHead[1]);
    if (partHeads) {
      const key = `${c.partHead[0]}:${c.startTok}`;
      if (!partOwners.has(key)) partOwners.set(key, []);
      partOwners.get(key).push(`sel_${c.id}`);
    }

    if (c.on === 'place' || PLACE_SHORT_KEYS.has(shortKey)) {
      placeConstraints.push(c);
    } else if (shortKey !== 'id' && shortKey !== 'ids' && !c.partHead) {
      attrOnlyConstraints.push(c);
    }

    const roleOwner = c.predicateRoleFamily ? famToId.get(c.predicateRoleFamily) : cFamId;
    const sourceHeadTypes = c.chartSourceHead ? [...tSorts, ...constraints].filter((candidate) =>
      candidate.family === 'chart' && candidate.startTok === c.chartSourceHead[0] &&
      candidate.endTok <= c.chartSourceHead[1] &&
      (candidate.kind === HYP_KINDS.TARGET_SORT || candidate.attribute === 'chart.type')) : [];
    if (c.chartCreationPredicate != null) {
      emit(`(assert-soft sel_${c.id} :weight ${W.predicateRole})`);
    }
    for (let r = 1; r <= R; r++) {
      if (c.chartCreationPredicate != null) {
        const predicate = c.chartCreationPredicate < 0 ? '(- 1)' : c.chartCreationPredicate;
        emit(`(assert (=> (and sel_${c.id} (= own_${c.id} ${r})) (and (= ppos_${r} ${predicate})
          (= fam_${r} ${famToId.get('chart')}) (= act_${r} ACT_MAKE) (= tmode_${r} TM_NEW) (= ${phExpr} PH_RESULT))))`);
      }
      if (sourceHeadTypes.length) {
        const typeEvidence = sourceHeadTypes.map(({ id }) => `(and sel_${id} (= own_${id} ${r}))`);
        emit(`(assert (=> (and sel_${c.id} (= own_${c.id} ${r})) ${smtOr(typeEvidence)}))`);
      }
      if (lattice.catalog && c.predicateRole != null && roleOwner !== undefined) {
        const bindings = predicateRoles.get(c.predicateRole) ?? [];
        bindings.push(`(and sel_${c.id} (= own_${c.id} ${r}) (= ppos_${r} ${c.predicateRole}) (= fam_${r} ${roleOwner}) (= ${phExpr} PH_RESULT))`);
        predicateRoles.set(c.predicateRole, bindings);
      }
      if (compatFids.length > 0 && compatFids.length < F) {
        emit(`(assert (=> (and sel_${c.id} (= own_${c.id} ${r})) ${smtOr(compatFids.map((id) => `(= fam_${r} ${id})`))}))`);
      }
      if (cFamId !== undefined) {
        emit(`(assert-soft (=> (and sel_${c.id} (= own_${c.id} ${r})) (= fam_${r} ${cFamId})) :weight 12)`);
      }
      emit(`(assert (=> (and sel_${c.id} (= own_${c.id} ${r})) (phase-new-law tmode_${r} ${c.isAnchor ? 'true' : 'false'} ${phExpr})))`);
      if (partHeads) {
        const heads = smtOr(partHeads.map((h) => `(and sel_${h.id} (= own_${h.id} ${r}))`));
        const partPhase = `(ite (= tmode_${r} TM_NEW) PH_RESULT PH_SELECTOR)`;
        emit(`(assert (=> (and sel_${c.id} (= own_${c.id} ${r})) (and ${heads} (= fam_${r} ${cFamId}) (= ${phExpr} ${partPhase}))))`);
        const creates = smtOr(makePredicates.filter((p) => p.endTok < c.partHead[0])
          .map((p) => `(and sel_${p.id} (= own_${p.id} ${r}))`));
        emit(`(assert (=> (and sel_${c.id} (= own_${c.id} ${r}) ${creates}) (= act_${r} ACT_MAKE)))`);
      }
      if (c.creationOnly) {
        emit(`(assert (=> (and sel_${c.id} (= own_${c.id} ${r})) (and (= act_${r} ACT_MAKE) (= tmode_${r} TM_NEW) (= fam_${r} ${cFamId}) (<= 0 ppos_${r}) (< ppos_${r} ${c.startTok}))))`);
      }

      if (phExpr === `ph_${c.id}`) {
        if (shortKey === 'id') {
          emit(`(assert-soft (=> (and sel_${c.id} (= own_${c.id} ${r}) (not (= tmode_${r} TM_NEW))) (= ${phExpr} PH_SELECTOR)) :weight 22)`);
        } else {
          emit(`(assert-soft (=> (and sel_${c.id} (= own_${c.id} ${r}) (not (= tmode_${r} TM_NEW)) (>= tpos_${r} 0) (< ${c.endTok} tpos_${r})) (= ${phExpr} PH_SELECTOR)) :weight 10)`);
          emit(`(assert-soft (=> (and sel_${c.id} (= own_${c.id} ${r}) (not (= tmode_${r} TM_NEW)) (or (< tpos_${r} 0) (> ${c.startTok} tpos_${r}))) (= ${phExpr} PH_RESULT)) :weight 14)`);
        }
      }
    }

    if (c.isAnchor) {
      const relPredecessors = constraints.filter(
        (rel) => rel.needsAnchor && rel.endTok < c.startTok && (c.startTok - rel.endTok) <= 3
      );
      if (relPredecessors.length === 0) {
        emit(`(assert (not sel_${c.id}))`);
      } else {
        emit(`(assert (=> sel_${c.id} ${smtOr(relPredecessors.map((rel) => `(and sel_${rel.id} (= own_${rel.id} own_${c.id}))`))}))`);
      }
    }

    const kws = compatKwsOfConstraint.get(c.id) ?? [];
    if (kws.length > 0) {
      emit(`(assert-soft (=> sel_${c.id} (>= ${kwExprOf.get(c.id)} 0)) :weight 14)`);
    }
  }

  for (const readings of partOwners.values()) {
    emit(`(assert-soft ${smtOr(readings)} :weight ${W.partOwner})`);
  }
  const chartAxisPairs = new Map();
  for (const candidate of activeCandidates) {
    if (candidate.chartAxisPair == null) continue;
    const pair = chartAxisPairs.get(candidate.chartAxisPair) ?? [];
    pair.push(candidate);
    chartAxisPairs.set(candidate.chartAxisPair, pair);
  }
  for (const pair of chartAxisPairs.values()) {
    const axes = pair.filter(({ kind }) => kind === HYP_KINDS.CONSTRAINT);
    const orders = new Map();
    for (const axis of axes) {
      const order = orders.get(axis.chartAxisOrder) ?? [];
      order.push(axis);
      orders.set(axis.chartAxisOrder, order);
    }
    const leaders = [];
    for (const order of orders.values()) {
      if (order.length !== 2) {
        for (const axis of order) emit(`(assert (not sel_${axis.id}))`);
        continue;
      }
      const [left, right] = order;
      const choice = `sel_${left.id}`;
      leaders.push(left.id);
      emit(`(assert (= ${choice} sel_${right.id}))`);
      emit(`(assert (=> ${choice} (= own_${left.id} own_${right.id})))`);
    }
    const selected = leaders.map((id) => `sel_${id}`);
    if (selected.length > 1) {
      emit(`(assert (not (and ${selected.join(' ')})))`);
      semanticBlockVars.push(...selected);
      chartAxisOrderVars.push(selected);
    }
    for (const qualifier of pair.filter(({ kind }) => kind === HYP_KINDS.UNREAD)) {
      if (qualifier.chartAxisAssignment) {
        const keyword = pair.find(({ kind, chartAxisAssignment }) => kind === HYP_KINDS.KEY_WORD && chartAxisAssignment);
        if (keyword) {
          const bindings = axes.filter(({ chartAxisAssignment }) => chartAxisAssignment)
            .map((axis) => `(= ${kwExprOf.get(axis.id)} ${keyword.id})`);
          emit(`(assert (= sel_${keyword.id} ${smtOr(bindings)}))`);
          emit(`(assert (or sel_${keyword.id} sel_${qualifier.id}))`);
        } else {
          emit(`(assert sel_${qualifier.id})`);
        }
        const predicate = qualifier.chartCreationPredicate < 0 ? '(- 1)' : qualifier.chartCreationPredicate;
        for (let r = 1; r <= R; r++) {
          emit(`(assert (=> (= own_${qualifier.id} ${r}) (and
            (= fam_${r} ${famToId.get('chart')}) (= act_${r} ACT_MAKE)
            (= tmode_${r} TM_NEW) (= ppos_${r} ${predicate}))))`);
        }
        continue;
      }
      emit(`(assert (= sel_${qualifier.id} ${smtOr(selected)}))`);
      for (const axisId of leaders) {
        emit(`(assert (=> sel_${axisId} (= own_${axisId} own_${qualifier.id})))`);
      }
    }
  }
  for (const [startTok, readings] of predicateRoles) {
    const writtenPredicate = smtOr(Array.from({ length: R }, (_, i) => `(= ppos_${i + 1} ${startTok})`));
    emit(`(assert (=> ${writtenPredicate} ${smtOr(readings)}))`);
    emit(`(assert-soft ${smtOr(readings)} :weight ${W.predicateRole})`);
  }

  // Act–Constraint Alignment in Z3 (resolves ambiguous verbs like "set"/"put" AND verbless fragments like "stove, please" / "room for 6 called Birch"!)
  const creationHeadCons = constraints.filter((c) => CREATION_TYPE_KEYS.has(c.attribute));
  const modifiedTypeSpans = new Map();
  for (const candidate of creationHeadCons.filter((c) => c.creationOnly)) {
    const span = `${candidate.startTok}:${candidate.endTok}`;
    if (!modifiedTypeSpans.has(span)) modifiedTypeSpans.set(span, []);
    modifiedTypeSpans.get(span).push(candidate);
  }
  const deltaConstraints = constraints.filter((c) => c.operator === 'delta');
  for (let r = 1; r <= R; r++) {
    // Prefer retaining the catalog type over an equally grounded but untyped target description.
    for (const candidates of modifiedTypeSpans.values()) {
      const [{ startTok, endTok }] = candidates;
      const followsMake = `(and (= act_${r} ACT_MAKE) (= tmode_${r} TM_NEW) (<= 0 ppos_${r}) (< ppos_${r} ${startTok}) (span-in-req rstart_${r} rend_${r} ${startTok} ${endTok}))`;
      const withFamilyHead = candidates.filter((c) => c.hasCreationFamilyHead);
      const preferredTypes = withFamilyHead.length ? withFamilyHead : candidates;
      const selectedType = smtOr(preferredTypes.map((c) => `(and sel_${c.id} (= own_${c.id} ${r}))`));
      emit(`(assert-soft (=> ${followsMake} ${selectedType}) :weight ${W.creationTypeEvidence})`);
    }
    const hasPlaceInR = smtOr(placeConstraints.map((c) => `(and sel_${c.id} (= own_${c.id} ${r}))`));
    const hasAttrInR = smtOr(attrOnlyConstraints.map((c) => `(and sel_${c.id} (= own_${c.id} ${r}))`));
    const hasDeltaInR = smtOr(deltaConstraints.map((c) => `(and sel_${c.id} (= own_${c.id} ${r}))`));
    const hasCreationHeadInR = smtOr([
      ...tSorts.map((s) => `(and sel_${s.id} (= own_${s.id} ${r}))`),
      ...tFams.filter((f) => !['definite', 'possessive', 'demonstrative'].includes(f.det)).map((f) => `(and sel_${f.id} (= own_${f.id} ${r}))`),
      ...creationHeadCons.map((c) => `(and sel_${c.id} (= own_${c.id} ${r}))`),
    ]);
    // Comparative delta ("shorter hair", "bigger house", "taller bars") presupposes an EXISTING baseline target!
    if (deltaConstraints.length > 0) {
      emit(`(assert-soft (=> (and active_${r} ${hasDeltaInR}) (and (not (= tmode_${r} TM_NEW)) (not (= act_${r} ACT_MAKE)))) :weight ${W.deltaExisting})`);
    }
    const explicitIndefInR = smtOr([
      ...tSorts.filter((s) => s.det === 'indefinite' || (s.count != null && s.det === 'none')).map((s) => `(and sel_${s.id} (= own_${s.id} ${r}))`),
      ...tFams.filter((f) => f.det === 'indefinite' || (f.count != null && f.det === 'none')).map((f) => `(and sel_${f.id} (= own_${f.id} ${r}))`),
      ...tRefs.filter((x) => x.det === 'indefinite').map((x) => `(and sel_${x.id} (= own_${x.id} ${r}))`),
    ]);
    if (placeConstraints.length > 0) {
      emit(`(assert-soft (=> (and active_${r} ${hasPlaceInR} (not ${explicitIndefInR}) (not (= act_${r} ACT_MAKE)) (not (= act_${r} ACT_REMOVE)) (not (= act_${r} ACT_ASK))) (= act_${r} ACT_PLACE)) :weight ${W.placeActAlign})`);
    }
    if (attrOnlyConstraints.length > 0) {
      emit(`(assert-soft (=> (and active_${r} ${hasAttrInR} (not ${hasPlaceInR}) (not (= act_${r} ACT_MAKE)) (not (= act_${r} ACT_REMOVE)) (not (= act_${r} ACT_ASK))) (= act_${r} ACT_CHANGE)) :weight ${W.changeActAlign})`);
    }
    // Direction vs static region disambiguation in Z3:
    // Under ACT_PLACE without static prep ("move the boat left"), prefer *.direction; with "at/on/in" ("on the left"), prefer *.at!
    const dirConsInR = constraints.filter((c) => c.attribute?.endsWith('.direction') && !(c.startTok > 0 && ['at', 'on', 'in'].includes(tokens[c.startTok - 1]?.lower ?? '')));
    const atConsInR = constraints.filter((c) => c.attribute?.endsWith('.at') && !(c.startTok > 0 && ['at', 'on', 'in'].includes(tokens[c.startTok - 1]?.lower ?? '')));
    if (dirConsInR.length > 0 && atConsInR.length > 0) {
      for (const a of atConsInR) {
        emit(`(assert-soft (not (and active_${r} (= act_${r} ACT_PLACE) sel_${a.id} (= own_${a.id} ${r}))) :weight ${W.placeDirOverAt})`);
      }
    }
    // Resultative "make <existing/bare target> <post-target attribute/size/colour>" ("make the house blue", "make face orange", "make cupboard red", "make boat 67 pixels wide")
    // vs creation "make a blue house" / "make a line chart" (explicit indefinite determiner or chart.type/diagram.kind):
    const chartOrDiagHeadInR = smtOr(creationHeadCons.map((c) => `(and sel_${c.id} (= own_${c.id} ${r}))`));
    const postTargetPropInR = smtOr(
      attrOnlyConstraints
        .filter((c) => !CREATION_TYPE_KEYS.has(c.attribute) && !c.attribute?.endsWith('.title') && !c.attribute?.endsWith('.name') && !c.attribute?.endsWith('.content') && !c.attribute?.endsWith('.about') && !c.attribute?.endsWith('.genre'))
        .map((c) => `(and sel_${c.id} (= own_${c.id} ${r}) (>= tpos_${r} 0) (> ${c.startTok} tpos_${r}))`)
    );
    if (attrOnlyConstraints.length > 0) {
      emit(`(assert-soft (=> (and active_${r} (>= ppos_${r} 0) ${postTargetPropInR} (not ${explicitIndefInR}) (not ${chartOrDiagHeadInR}) (or (= act_${r} ACT_MAKE) (= act_${r} ACT_CHANGE))) (and (= act_${r} ACT_CHANGE) (= tmode_${r} TM_EXISTING))) :weight ${W.resultativeMakeToChange})`);
    }

    // Verbless fragment discipline:
    // - Verbless request never invents a finer mode like mode=arrange unless a layout/arrangement constraint is selected!
    const layoutConsInR = smtOr(
      constraints
        .filter((c) => c.attribute?.endsWith('.layout') || c.attribute?.endsWith('.arrangement'))
        .map((c) => `(and sel_${c.id} (= own_${c.id} ${r}))`)
    );
    emit(`(assert (=> (and active_${r} (< ppos_${r} 0) (not ${layoutConsInR})) (= amode_${r} MODE_NONE)))`);
    // - Verbless layout ("a radial for me, Roadmap") -> ACT_PLACE + MODE_ARRANGE!
    emit(`(assert-soft (=> (and active_${r} (< ppos_${r} 0) ${layoutConsInR}) (and (= act_${r} ACT_PLACE) (= amode_${r} MODE_ARRANGE))) :weight 38)`);
    // - Non-empty change/place requests should carry at least one PH_RESULT constraint when constraints are selected!
    const anyNonAnchorConsInR = smtOr(constraints.filter((c) => !c.isAnchor && !['id', 'ids'].includes(c.attribute?.split('.')[1] ?? '')).map((c) => `(and sel_${c.id} (= own_${c.id} ${r}))`));
    const anyResultConsInR = smtOr(constraints.filter((c) => !c.isAnchor).map((c) => `(and sel_${c.id} (= own_${c.id} ${r}) (= ${phaseExprOf.get(c.id)} PH_RESULT))`));
    if (constraints.length > 0) {
      emit(`(assert-soft (=> (and active_${r} (or (= act_${r} ACT_CHANGE) (= act_${r} ACT_PLACE)) ${anyNonAnchorConsInR}) ${anyResultConsInR}) :weight 22)`);
    }
    // - Suggestion lead ("how about ...", "what about ...") strongly prefers MOOD_DO even when ending with '?'!
    const startsWithSuggestionAbout = tokens.slice(0, 4).some((t, idx) => ['how', 'what'].includes(t.lower) && tokens[idx + 1]?.lower === 'about');
    if (startsWithSuggestionAbout) {
      emit(`(assert-soft (=> active_${r} (= mood_${r} MOOD_DO)) :weight 38)`);
    }
    // - Verbless noun/chart/diagram phrase ("stove, please", "room for 6 called Birch", "bar graph, orange...") -> ACT_MAKE (unless delta comparative!)
    // - Verbless property/delta without creation head ("bigger!", "blue") -> ACT_CHANGE; verbless place/direction -> ACT_PLACE!
    emit(`(assert-soft (=> (and active_${r} (< ppos_${r} 0) ${hasCreationHeadInR} (not ${hasDeltaInR})) (= act_${r} ACT_MAKE)) :weight ${W.verblessCreationMake})`);
    emit(`(assert-soft (=> (and active_${r} (< ppos_${r} 0) (not ${hasCreationHeadInR}) ${hasAttrInR} (not ${hasPlaceInR})) (= act_${r} ACT_CHANGE)) :weight ${W.verblessAttrChange})`);
    emit(`(assert-soft (=> (and active_${r} (< ppos_${r} 0) (not ${hasCreationHeadInR}) ${hasPlaceInR}) (= act_${r} ACT_PLACE)) :weight ${W.verblessPlace})`);
  }

  // Every selected KEY_WORD must serve a purpose
  for (const k of keywords) {
    const users = constraintsUsingKw.get(k.id) ?? [];
    const boundToKeyword = (c) => `(= ${kwExprOf.get(c.id)} ${k.id})`;
    const boundUsers = users.map(boundToKeyword);
    const amoUsers = atMostOne(boundUsers);
    if (amoUsers) emit(`(assert ${amoUsers})`);

    // A complete property name with a nearby value and edit predicate competes with
    // readings that split the name into a target noun and a shorter keyword.
    if (k.startTok < k.endTok && W.compoundKeyBinding > 0) {
      const surface = tokens.slice(k.startTok, k.endTok + 1).map((token) => token.lower).join(' ');
      const exactUsers = users.filter((c) => c.requiresKeyWord && c.startTok > k.endTok &&
        c.startTok - k.endTok <= 3 && tabSpec.keys.get(c.attribute)?.literalKeyWords?.has(surface) &&
        grammarBetween(k, c));
      if (exactUsers.length > 0) {
        const editPredicates = preds.filter((p) => p.endTok < k.startTok &&
          p.licensed?.some((licence) => licence.act === 'change') && grammarBetween(p, k));
        const det = kb.grammar?.determiners?.get(tokens[k.startTok - 1]?.lower)?.det;
        const groundedEdits = [];
        for (let r = 1; r <= R && editPredicates.length > 0; r++) {
          const boundResult = exactUsers.map((c) => {
            const ownerFamily = famToId.get(c.family);
            // The property can identify its own family when there is no separate owner evidence.
            const supportedOwner = ownerFamily === undefined
              ? 'true'
              : `(or (>= tpos_${r} 0) (= fam_${r} ${ownerFamily}))`;
            return `(and ${boundToKeyword(c)} (= own_${c.id} ${r}) (= ${phaseExprOf.get(c.id)} PH_RESULT) ${supportedOwner})`;
          });
          const editPredicate = editPredicates.map((p) => `(and sel_${p.id} (= own_${p.id} ${r}))`);
          const groundedEdit = `(and ${smtOr(boundResult)} ${smtOr(editPredicate)})`;
          groundedEdits.push(groundedEdit);
          if (det === 'definite' || det === 'possessive') {
            emit(`(assert-soft (=> ${groundedEdit} (and (= act_${r} ACT_CHANGE) (= tmode_${r} TM_EXISTING))) :weight ${W.resultativeMakeToChange})`);
          }
        }
        if (groundedEdits.length > 0) emit(`(assert-soft ${smtOr(groundedEdits)} :weight ${W.compoundKeyBinding})`);
      }
    }

    const kAttrIds = (k.attrs ?? []).map((a) => tabSpec.attrToId.get(a)).filter((id) => id !== undefined);
    for (let r = 1; r <= R; r++) {
      const purposes = [...boundUsers];
      if (kAttrIds.length > 0) {
        purposes.push(`(and (= act_${r} ACT_ASK) ${smtOr(kAttrIds.map((id) => `(= asked_${r} ${id})`))})`);
      }
      if (k.isNameIntro) {
        const namedRefs = tRefs
          .filter((ref) => ref.name && ref.startTok > k.endTok && (ref.startTok - k.endTok) <= 3)
          .map((ref) => `(and sel_${ref.id} (= own_${ref.id} ${r}))`);
        if (namedRefs.length > 0) purposes.push(smtOr(namedRefs));
      }
      if (purposes.length === 0) {
        emit(`(assert (not (and sel_${k.id} (= own_${k.id} ${r}))))`);
      } else {
        emit(`(assert (=> (and sel_${k.id} (= own_${k.id} ${r})) ${smtOr(purposes)}))`);
      }
    }
  }

  // If asked_r >= 0 (from usedKwAttrIds only!), some selected KEY_WORD in r must justify asked_r!
  // And prefer asked_r whose attribute family matches fam_r (e.g., node.width on family=node over link.width).
  for (let r = 1; r <= R; r++) {
    for (const aid of usedKwAttrIds) {
      const attrName = tabSpec.keyList[aid].name;
      const kws = (kwByAttr.get(attrName) ?? []).map((k) => `(and sel_${k.id} (= own_${k.id} ${r}))`);
      emit(`(assert (=> (and active_${r} (= asked_${r} ${aid})) ${smtOr(kws)}))`);
      const attrFam = tabSpec.keyList[aid].family;
      const attrFamId = attrFam ? tabSpec.families.indexOf(attrFam) : -1;
      if (attrFamId >= 0) {
        emit(`(assert-soft (=> (and active_${r} (= asked_${r} ${aid})) (= fam_${r} ${attrFamId})) :weight 18)`);
      }
      const subKey = attrName.includes('.') ? attrName.split('.').slice(1).join('.').toLowerCase() : attrName.toLowerCase();
      const exactSubKw = (kwByAttr.get(attrName) ?? []).some((k) => k.text?.toLowerCase() === subKey);
      if (!exactSubKw) {
        emit(`(assert-soft (=> (and active_${r} (>= asked_${r} 0)) (not (= asked_${r} ${aid}))) :weight 4)`);
      }
    }
  }

  // Non-duplication of identical constraints in the same request
  const dupBuckets = new Map();
  for (const c of constraints) {
    const valKey = Array.isArray(c.value) ? c.value.join('\0') : String(c.value ?? '');
    const sig = `${c.attribute ?? ''}|${valKey}|${c.operator ?? ''}|${c.step ?? ''}`;
    if (!dupBuckets.has(sig)) dupBuckets.set(sig, []);
    dupBuckets.get(sig).push(c);
  }
  for (const bucket of dupBuckets.values()) {
    if (bucket.length < 2) continue;
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const a = bucket[i], b = bucket[j];
        emit(`(assert (not (and sel_${a.id} sel_${b.id} (= own_${a.id} own_${b.id}) (= ${phaseExprOf.get(a.id)} ${phaseExprOf.get(b.id)}) (= ${wantExprOf.get(a.id)} ${wantExprOf.get(b.id)}))))`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // 7. MaxSMT Soft Optimization Weights
  // -------------------------------------------------------------------------
  for (const c of activeCandidates) {
    const w = Math.max(0, Math.round(c.cost ?? 0));
    if (w > 0) {
      emit(`(assert-soft (not sel_${c.id}) :weight ${w})`);
    }
  }

  for (let r = 1; r <= R; r++) {
    if (r > 1) {
      emit(`(assert-soft (not active_${r}) :weight ${W.extraRequestPenalty})`);
    }
    emit(`(assert-soft (not lookup_${r}) :weight ${W.lookupPenalty})`);
    // Prefer canonical base act (MODE_NONE) when a verb licenses both MODE_NONE and an optional finer mode (e.g. "set")
    emit(`(assert-soft (=> active_${r} (= amode_${r} MODE_NONE)) :weight ${W.preferModeNone})`);
    emit(`(assert-soft (=> active_${r} (>= ppos_${r} 0)) :weight ${W.preferPredicate})`);
    emit(`(assert-soft (=> (and active_${r} (>= ppos_${r} 0)) (= ppos_${r} rstart_${r})) :weight ${W.preferClauseStartPred})`);
    if (defaultFamId !== null) emit(`(assert-soft (=> active_${r} (= fam_${r} ${defaultFamId})) :weight ${W.defaultFamilyTieBreak})`);
    if (!hasQuestionMark) {
      emit(`(assert-soft (=> active_${r} (= mood_${r} MOOD_DO)) :weight ${W.moodDoNoQ})`);
    } else {
      // Even with a '?', polite "can you / could you / would you" requests are mood=do!
      emit(`(assert-soft (=> active_${r} (= mood_${r} MOOD_DO)) :weight ${W.moodDoWithQ})`);
    }
  }

  // Semantically active closed-class cues (WH question triggers, NEG words, universal quantifiers):
  // Because w.lang.en classifies them as `isGrammar=true`, explicitly reward Z3 for grounding them
  // instead of silently dropping "what's", "how many", "not", "without", "every one", "all"!
  // Note: without '?', bare "when/where/why/how" are often subordinate clauses, and ", which/who/that" after a comma is a RELATIVE clause!
  const STRONG_WH_RE = /^(what's|what is|what are|which|how many|how much|is there|are there|list|count|describe|(?:tell me|do you know|i want to know|i would like to know|i wonder)\s+(?:what|where|who|which|how|when|whose|if|whether))\b/i;
  const ANY_WH_RE = /^(what|what's|which|where|when|who|why|how|how many|how much|is there|are there|any)\b/i;
  for (const p of preds) {
    const isAskPred = (p.licensed ?? []).some((l) => l.act === 'ask');
    const isSuggestionAbout = /^(how|what)\s+about\b/i.test(p.text) || (/^(how|what)$/i.test(p.text) && tokens[p.endTok + 1]?.lower === 'about');
    const isMedialRelWh = !hasQuestionMark && /^(which|who|where|when|what|how)\b/i.test(p.text)
      && p.startTok > 0 && tokens.slice(0, p.startTok).some((t) => t.isContent && !t.isFiller);
    if (isAskPred && !isSuggestionAbout && !isMedialRelWh && (STRONG_WH_RE.test(p.text) || (hasQuestionMark && ANY_WH_RE.test(p.text)))) {
      emit(`(assert-soft sel_${p.id} :weight 45)`);
    }
  }
  for (const n of negs) {
    emit(`(assert-soft (=> sel_${n.id} (>= ntgt_${n.id} 0)) :weight 20)`);
    emit(`(assert-soft sel_${n.id} :weight 24)`);
  }
  for (const ref of tRefs) {
    if (ref.fill === 'all') {
      emit(`(assert-soft sel_${ref.id} :weight 18)`);
    } else if (ref.isPronoun && !ref.isPropertyOwner && ref.text.toLowerCase() !== 'one') {
      // Object pronouns ("make it bold", "move it left", "delete them") are isGrammar=true in w.lang.en;
      // reward grounding them when immediately after a verb/predicate so Z3 does not silently drop "it" into mode=new!
      const afterVerb = ref.startTok > 0 && preds.some((p) => p.endTok === ref.startTok - 1);
      if (afterVerb) {
        emit(`(assert-soft sel_${ref.id} :weight ${W.pronounAfterVerbReward})`);
      }
    }
  }
  // ACT_CONNECT creates a new link by default when family=link exists on this tab
  const linkFamId = famToId.get('link');
  if (linkFamId !== undefined) {
    for (let r = 1; r <= R; r++) {
      emit(`(assert-soft (=> (and active_${r} (= act_${r} ACT_CONNECT)) (and (= fam_${r} ${linkFamId}) (= tmode_${r} TM_NEW))) :weight ${W.connectLinkNew})`);
    }
  }

  const anchoredRelations = constraints.filter((c) => c.needsAnchor);
  const landmarkCandidates = constraints.filter((c) => c.isAnchor);
  const referenceLandmarks = new Map();
  for (const anchor of landmarkCandidates.filter((c) => c.lookupWords)) {
    const key = `${anchor.startTok}:${anchor.endTok}`;
    const bindings = anchoredRelations.filter((rel) => rel.family === anchor.family && rel.endTok + 1 === anchor.startTok)
      .map((rel) => `(and sel_${rel.id} sel_${anchor.id} (= own_${rel.id} own_${anchor.id}))`);
    if (bindings.length) referenceLandmarks.set(key, [...(referenceLandmarks.get(key) ?? []), ...bindings]);
  }
  for (const bindings of referenceLandmarks.values()) {
    emit(`(assert-soft ${smtOr(bindings)} :weight ${W.referenceLandmark})`);
  }
  const selectingActs = new Set(['ask', 'pick', 'deselect', 'remove']);
  // An interior homonym such as 'Focus' in 'book Focus Room' cannot license a selector.
  const clauseStarts = [0, ...(lattice.splitPoints ?? []).map(({ endTok }) => endTok + 1)];
  const selectingPredicates = preds.filter((p) => p.licensed?.length && p.licensed.every((license) => selectingActs.has(license.act)) &&
    clauseStarts.some((start) => start <= p.startTok && tokens.slice(start, p.startTok)
      .every((token) => token.isGrammar || token.isFiller || token.isPunct)));
  if (W.spatialTargetSelector > 0 && selectingPredicates.length > 0) {
    const spatialDescriptions = findSpatialOwners(tokens, [...tSorts, ...tFams, ...tRefs], anchoredRelations, landmarkCandidates);
    for (let r = 1; r <= R; r++) {
      const selected = (c) => `(and sel_${c.id} (= own_${c.id} ${r}))`;
      const readings = new Map();
      for (const { heads, relation, anchor } of spatialDescriptions) {
        const family = famToId.get(relation.family);
        if (family === undefined) continue;
        for (const head of heads) {
          if (!(head.families ?? [head.family]).includes(relation.family) ||
              tokens.slice(head.endTok + 1, relation.startTok).some((token) => token.isPunct || kb.grammar?.coordinators?.has(token.lower))) continue;
          const predicateActs = selectingPredicates.filter((p) => p.endTok < head.startTok).flatMap((p) =>
            [...new Set(p.licensed.map((license) => license.act))].map((act) =>
              `(and ${selected(p)} (= act_${r} ${actToSmt(act)}))`));
          if (predicateActs.length === 0) continue;
          // One preference per cue, using the longest grounded reading with this start.
          // Otherwise a prefix and its extension penalize each other in a phrase like 'in front of'.
          const key = relation.startTok;
          const previous = readings.get(key);
          if (previous && previous.endTok > relation.endTok) continue;
          if (!previous || previous.endTok < relation.endTok) {
            readings.set(key, { endTok: relation.endTok, applicable: new Set(), bindings: new Set() });
          }
          const { applicable, bindings } = readings.get(key);
          applicable.add(`(and ${smtOr(predicateActs)} (span-in-req rstart_${r} rend_${r} ${head.startTok} ${anchor.startTok}))`);
          bindings.add(`(and ${selected(head)} (= tpos_${r} ${head.startTok}) ${selected(relation)} ${selected(anchor)} (= fam_${r} ${family}) (= ${phaseExprOf.get(relation.id)} PH_SELECTOR) (= ${phaseExprOf.get(anchor.id)} PH_SELECTOR))`);
        }
      }
      for (const { applicable, bindings } of readings.values()) {
        emit(`(assert-soft (=> ${smtOr([...applicable])} ${smtOr([...bindings])}) :weight ${W.spatialTargetSelector})`);
      }
    }
  }
  const relationValueAlternatives = new Map();
  for (const rel of anchoredRelations) {
    const anchors = constraints.filter(
      (a) => a.isAnchor && a.startTok > rel.endTok && (a.startTok - rel.endTok) <= 3
    );
    if (anchors.length > 0) {
      emit(`(assert-soft (=> sel_${rel.id} ${smtOr(anchors.map((a) => `(and sel_${a.id} (= own_${a.id} own_${rel.id}))`))}) :weight 16)`);
    }
    if (W.declaredRelationValue > 0 && rel.family && anchors.some((anchor) => anchor.family === rel.family)) {
      const signature = JSON.stringify([rel.family, rel.startTok, rel.endTok, rel.operator, rel.value]);
      if (!relationValueAlternatives.has(signature)) relationValueAlternatives.set(signature, []);
      relationValueAlternatives.get(signature).push(rel);
    }
  }

  // With identical anchored evidence, prefer the slot that declares the value.
  // A separately keyed relation or an open reading with distinct evidence still competes normally.
  for (const alternatives of relationValueAlternatives.values()) {
    if (alternatives.length < 2) continue;
    const declared = alternatives.filter((rel) => tabSpec.keys.get(rel.attribute)?.values?.has(rel.value));
    if (declared.length === 0 || declared.length === alternatives.length) continue;
    const anyReading = smtOr(alternatives.map((rel) => `sel_${rel.id}`));
    const declaredReading = smtOr(declared.map((rel) => `sel_${rel.id}`));
    emit(`(assert-soft (=> ${anyReading} ${declaredReading}) :weight ${W.declaredRelationValue})`);
  }

  // Semantically substantive spatial/temporal relation phrases ("below", "above", "under", "behind", "beside", "next to",
  // "in front of", "on top of", "left of", "right of", "inside", "outside", "between", "before", "after", or "on it/them"):
  // Because prepositions & pronouns are `isGrammar=true` in w.lang.en, reward Z3 for covering them rather than silently dropping "below X" or "on it"!
  const STRONG_SPATIAL_PREP_RE = /^(below|above|under|underneath|beneath|behind|beside|near|close to|next to|in front of|on top of|to the left of|left of|on the left side of|to the right of|right of|on the right side of|inside|outside|between|before|after)$/i;
  const relSpanBuckets = new Map();
  for (const rel of anchoredRelations) {
    const followedByPronoun = rel.text.toLowerCase() === 'on' && ['it', 'them'].includes(tokens[rel.endTok + 1]?.lower ?? '');
    if (!STRONG_SPATIAL_PREP_RE.test(rel.text) && !followedByPronoun) continue;
    const spKey = `${rel.startTok}:${rel.endTok}`;
    if (!relSpanBuckets.has(spKey)) relSpanBuckets.set(spKey, []);
    relSpanBuckets.get(spKey).push(rel);
  }
  for (const [spKey, relGroup] of relSpanBuckets) {
    const [sTokStr, eTokStr] = spKey.split(':');
    const sTok = Number(sTokStr), eTok = Number(eTokStr);
    const allCovVars = new Set(relGroup.map((r) => `sel_${r.id}`));
    for (let t = sTok; t <= eTok; t++) {
      for (const c of tokCover[t] ?? []) allCovVars.add(`sel_${c.id}`);
    }
    emit(`(assert-soft ${smtOr([...allCovVars])} :weight 18)`);
  }

  // -------------------------------------------------------------------------
  // 7b. Declarative w.lang.en.frame Argument-Structure Constraints in Z3
  // -------------------------------------------------------------------------
  const FINER_ACT_MODES = new Set(['arrange', 'merge', 'ungroup', 'split', 'disconnect', 'reverse', 'repeat']);
  for (const fm of frameMatches) {
    const blockedSpatialSet = new Set(fm.blockedSpatialToks ?? []);
    const blockedEndpointSet = new Set(fm.blockedEndpointToks ?? []);
    const ownerMarker = fm.propertyOwnerMarker;
    const context = fm.contextProperty;
    const contextOwners = context?.ownerToken == null ? [] : tRefs.filter((c) => c.isPropertyOwner && c.startTok === context.ownerToken);
    const unresolved = fm.unresolvedDuration ?? context?.unresolved;
    const qualifier = unresolved && qualifierCandidates.find((c) => sameSpan(c, unresolved));
    const spatialBlockedCands = ownerMarker || blockedSpatialSet.size > 0
      ? constraints.filter((c) => {
          const sk = c.attribute?.split('.').slice(1).join('.');
          if (!(c.isAnchor || c.needsAnchor || ['relation', 'position', 'anchor', 'relation_anchor'].includes(sk))) return false;
          if (ownerMarker && c.startTok <= ownerMarker.endTok && c.endTok >= ownerMarker.startTok) return true;
          for (let t = c.startTok; t <= c.endTok; t++) if (blockedSpatialSet.has(t)) return true;
          return false;
        })
      : [];

    const endpointBlockedCands = blockedEndpointSet.size > 0
      ? constraints.filter((c) => {
          if (c.attribute !== 'link.from' && c.attribute !== 'link.to') return false;
          for (let t = c.startTok; t <= c.endTok; t++) if (blockedEndpointSet.has(t)) return true;
          return false;
        })
      : [];

    const ownerCands = fm.thingSpan
      ? [...tRefs, ...tSorts, ...tFams].filter((c) => inSpan(c, fm.thingSpan))
      : [];

    const expAttrSet = fm.expectedAttrs?.length ? new Set(fm.expectedAttrs) : null;
    const valCands = fm.valSpan
      ? constraints.filter(
          (c) =>
            !c.isAnchor &&
            c.attribute !== 'link.from' &&
            c.attribute !== 'link.to' &&
            (!expAttrSet || expAttrSet.has(c.attribute)) &&
            c.startTok >= fm.valSpan.startTok &&
            c.endTok <= fm.valSpan.endTok,
        )
      : [];

    const propertyResults = ownerMarker || context
      ? valCands.filter((value) => {
          if (context) return isStructuredPropertyValue(value, tabSpec.keys.get(value.attribute));
          const numeric = tabSpec.keys.get(value.attribute)?.head === 'number' ||
            fm.numericPropertyFamilies?.includes(value.family);
          return !numeric || (!value.pairedConstraints?.length && (value.operator !== 'eq' ||
            (String(value.value ?? '').trim() !== '' && Number.isFinite(Number(value.value)))));
        }).flatMap((value) => (compatKwsOfConstraint.get(value.id) ?? [])
          .filter((keyword) => sameSpan(keyword, fm.attrSpan) && sameSpan(value, fm.valSpan))
          .map((keyword) => ({ value, keyword })))
      : [];
    const contextResultIds = new Set(context ? propertyResults.map(({ value }) => value.id) : []);
    const contextCompetingValues = context ? constraints.filter((c) => c.startTok <= fm.valSpan.endTok &&
      c.endTok >= fm.attrSpan.startTok && !contextResultIds.has(c.id)) : [];
    const describedOwnerResults = fm.describedOwner
      ? valCands.filter((c) => sameSpan(c, fm.valSpan) && isIndependentValueCandidate(c))
      : [];

    // A relation inside the owner role needs a head before the cue and a landmark
    // that completes the owner phrase. Keep all compatible tuples for the solver.
    const ownerSelectors = ownerMarker || fm.describedOwner
      ? findOwnerSelectors(fm.thingSpan, tokens, ownerCands, anchoredRelations, landmarkCandidates)
      : [];
    const partOwnerSelectors = ownerMarker ? constraints.filter((c) => partOwnerInThing(c, fm.thingSpan)).flatMap((owner) =>
      ownerCands.filter((head) => head.family === owner.family && head.startTok === owner.partHead[0] &&
        head.endTok === owner.partHead[1]).map((head) => ({ head, owner }))) : [];
    const additionalResults = (fm.additionalProperties ?? []).map(({ attrSpan, valSpan, attrs }) => constraints
      .filter((c) => sameSpan(c, valSpan) && attrs.includes(c.attribute) &&
        (isIndependentValueCandidate(c) || isStructuredPropertyValue(c, tabSpec.keys.get(c.attribute))))
      .flatMap((value) => (compatKwsOfConstraint.get(value.id) ?? []).filter((keyword) => sameSpan(keyword, attrSpan))
        .map((keyword) => ({ value, keyword }))));

    const oldCands = fm.oldSpan
      ? constraints.filter(
          (c) =>
            !c.isAnchor &&
            c.attribute !== 'link.from' &&
            c.attribute !== 'link.to' &&
            c.startTok >= fm.oldSpan.startTok &&
            c.endTok <= fm.oldSpan.endTok,
        )
      : [];

    const fromEndCands = fm.endsSpan
      ? constraints.filter((c) => c.attribute === 'link.from' && c.startTok >= fm.endsSpan.startTok && c.endTok <= fm.endsSpan.endTok)
      : [];
    const toEndCands = fm.endsSpan
      ? constraints.filter((c) => c.attribute === 'link.to' && c.startTok >= fm.endsSpan.startTok && c.endTok <= fm.endsSpan.endTok)
      : [];

    for (let r = 1; r <= R; r++) {
      const frInR = `(and sel_fr_${fm.id} (= own_fr_${fm.id} ${r}))`;
      emit(`(assert (=> ${frInR} (and active_${r} (span-in-req rstart_${r} rend_${r} ${fm.startTok} ${fm.endTok}) (= act_${r} ${actToSmt(fm.act)}))))`);
      if (fm.clauseWindow) {
        const { startTok, endTok } = fm.clauseWindow;
        emit(`(assert (=> ${frInR} (and (>= rstart_${r} ${startTok}) (<= rend_${r} ${endTok}))))`);
      }
      if (qualifier) {
        emit(`(assert (=> ${frInR} (and sel_${qualifier.id} (= own_${qualifier.id} ${r}))))`);
      }
      if (fm.mode && FINER_ACT_MODES.has(fm.mode)) {
        emit(`(assert (=> ${frInR} (= amode_${r} ${modeToSmt(fm.mode)})))`);
      }
      for (const c of spatialBlockedCands) {
        emit(`(assert (=> ${frInR} (not (and sel_${c.id} (= own_${c.id} ${r})))))`);
      }
      for (const c of endpointBlockedCands) {
        emit(`(assert (=> ${frInR} (not (and sel_${c.id} (= own_${c.id} ${r})))))`);
      }
      if (context) {
        const selected = (c) => `(and sel_${c.id} (= own_${c.id} ${r}))`;
        const families = context.families.map((family) => `(= fam_${r} ${famToId.get(family)})`);
        const bindings = propertyResults.map(({ value, keyword }) =>
          `(and ${selected(value)} (= ${phaseExprOf.get(value.id)} PH_RESULT) (= ${kwExprOf.get(value.id)} ${keyword.id}) (= fam_${r} ${famToId.get(value.family)}))`);
        const result = qualifier ? selected(qualifier) : smtOr(bindings);
        const owner = context.ownerToken == null ? `(= tpos_${r} (- 1))` : smtOr(contextOwners.map(selected));
        emit(`(assert (=> ${frInR} (and (= tmode_${r} TM_EXISTING) ${owner} ${smtOr(families)} ${result})))`);
        for (const c of contextCompetingValues) {
          emit(`(assert (=> ${frInR} (not ${selected(c)})))`);
        }
      } else if (ownerMarker || fm.describedOwner) {
        const selected = (c) => `(and sel_${c.id} (= own_${c.id} ${r}))`;
        const headInR = (c) => `(and ${selected(c)} (= tpos_${r} ${c.startTok}))`;
        const phaseInR = (c, phase) => `(and ${selected(c)} (= ${phaseExprOf.get(c.id)} ${phase}))`;
        const binding = ({ value, keyword }) =>
          `(and ${phaseInR(value, 'PH_RESULT')} (= ${kwExprOf.get(value.id)} ${keyword.id}))`;
        const selectors = ownerSelectors.map(({ heads, relation, anchor }) =>
          `(and ${smtOr(heads.map(headInR))} ${phaseInR(relation, 'PH_SELECTOR')} ${phaseInR(anchor, 'PH_SELECTOR')})`);
        const partSelectors = partOwnerSelectors.map(({ head, owner }) =>
          `(and ${headInR(head)} ${phaseInR(owner, 'PH_SELECTOR')})`);
        const owners = partSelectors.length ? partSelectors :
          selectors.length || fm.describedOwner ? selectors : ownerCands.map(headInR);
        const boundResults = partSelectors.length ? propertyResults.filter(({ value }) =>
          partOwnerSelectors.some(({ owner }) => owner.family === value.family)) : propertyResults;
        const results = fm.describedOwner
          ? describedOwnerResults.map((c) => phaseInR(c, 'PH_RESULT'))
          : boundResults.map(binding);
        emit(`(assert (=> ${frInR} ${smtOr(owners)}))`);
        emit(`(assert (=> ${frInR} ${smtOr(results)}))`);
        for (const options of additionalResults) {
          emit(`(assert (=> ${frInR} ${smtOr(options.map(binding))}))`);
        }

        if (fm.describedOwner) {
          const sameFamily = ownerSelectors.flatMap(({ relation }) => describedOwnerResults
            .filter((c) => c.family === relation.family)
            .map((c) => `(and ${phaseInR(relation, 'PH_SELECTOR')} ${phaseInR(c, 'PH_RESULT')})`));
          if (sameFamily.length > 0) {
            emit(`(assert-soft (=> ${frInR} ${smtOr(sameFamily)}) :weight 12)`);
          }
        }

        // Resolve keyword aliases and spatial homonyms using the declared slots.
        const directProperties = boundResults.filter(({ value, keyword }) =>
          value.attribute.split('.').at(-1).toLowerCase() === keyword.text.toLowerCase());
        if (directProperties.length > 0) {
          emit(`(assert-soft (=> ${frInR} ${smtOr(directProperties.map(binding))}) :weight 10)`);
        }
        const declaredRelations = ownerSelectors.filter(({ relation }) =>
          tabSpec.keys.get(relation.attribute)?.values?.has(relation.value));
        if (declaredRelations.length > 0) {
          emit(`(assert-soft (=> ${frInR} ${smtOr(declaredRelations.map(({ relation }) => selected(relation)))}) :weight 6)`);
        }
      } else if (ownerCands.length > 0) {
        emit(`(assert (=> ${frInR} ${smtOr(ownerCands.map((c) => `(and sel_${c.id} (= own_${c.id} ${r}))`))}))`);
      }
      if (!context && !ownerMarker && !fm.describedOwner && valCands.length > 0) {
        emit(`(assert (=> ${frInR} ${smtOr(valCands.map((c) => `(and sel_${c.id} (= own_${c.id} ${r}) (= ${phaseExprOf.get(c.id)} PH_RESULT))`))}))`);
      }
      if (oldCands.length > 0) {
        emit(`(assert (=> ${frInR} ${smtOr(oldCands.map((c) => `(and sel_${c.id} (= own_${c.id} ${r}) (= ${phaseExprOf.get(c.id)} PH_SELECTOR))`))}))`);
      }
      if (fromEndCands.length > 0) {
        emit(`(assert (=> ${frInR} ${smtOr(fromEndCands.map((c) => `(and sel_${c.id} (= own_${c.id} ${r}))`))}))`);
      }
      if (toEndCands.length > 0) {
        emit(`(assert (=> ${frInR} ${smtOr(toEndCands.map((c) => `(and sel_${c.id} (= own_${c.id} ${r}))`))}))`);
      }
    }

    const frWeight = 24 + Math.min(16, Math.max(0, Math.round(fm.priority ?? 10))) +
      (fm.describedOwner ? W.describedOwnerFrame : 0) + (context ? W.contextPropertyFrame : 0);
    emit(`(assert-soft sel_fr_${fm.id} :weight ${frWeight})`);
  }

  // At most one structural w.lang.en.frame governs each request slot r
  if (frameMatches.length > 1) {
    for (let r = 1; r <= R; r++) {
      const inR = frameMatches.map((fm) => `(and sel_fr_${fm.id} (= own_fr_${fm.id} ${r}))`);
      emit(`(assert ((_ at-most 1) ${inR.join(' ')}))`);
    }
  }

  // The verb-free variant borrows the selected act from its adjacent written
  // predicate frame. Each request owns its own full result and target spans.
  for (const parts of coordinatedChanges) {
    const roles = parts.map((part) => {
      const heads = [...tSorts, ...tFams].filter((head) => sameSpan(head, part.thing));
      const values = constraints.filter((value) => sameSpan(value, part.value) && isIndependentValueCandidate(value));
      return heads.flatMap((head) => values.filter((value) => value.family === head.family)
        .map((value) => ({ head, value })));
    });
    if (roles.some((group) => group.length === 0)) continue;
    const readings = [];
    for (let r = 1; r < R; r++) {
      const requests = parts.map((part, i) => {
        const slot = r + i;
        const selected = (candidate) => `(and sel_${candidate.id} (= own_${candidate.id} ${slot}))`;
        const ownsRoles = roles[i].map(({ head, value }) =>
          `(and ${selected(head)} (= tpos_${slot} ${head.startTok}) ${selected(value)} (= ${phaseExprOf.get(value.id)} PH_RESULT))`);
        return `(and active_${slot} (= act_${slot} ACT_CHANGE) (= ppos_${slot} ${part.predicate < 0 ? '(- 1)' : part.predicate}) (= rstart_${slot} ${part.startTok}) (= rend_${slot} ${part.endTok}) ${smtOr(ownsRoles)})`;
      });
      readings.push(`(and ${requests.join(' ')})`);
    }
    if (readings.length > 0 && W.coordinatedChange > 0) {
      emit(`(assert-soft ${smtOr(readings)} :weight ${W.coordinatedChange})`);
    }
  }

  return {
    smtBody: lines.join('\n'),
    queryVars,
    blockVars,
    semanticBlockVars,
    chartAxisOrderVars,
    meta: { R, T, M, F, K, tab, tabSpec, previous, clock, elided, activeCandidates, outerFillerIds, nonDirectives },
  };
}
