// Unfiltered Lexical Lattice Builder for nl-formaliser.
//
// CRITICAL ARCHITECTURAL RULE:
// `src/lattice/` MUST NOT make semantic disambiguation decisions!
// It enumerates ALL grounded candidate interpretations over token spans from `kb`
// and leaves global disambiguation to Z3.

import {
  HYP_KINDS,
  DETERMINERS,
  CREATION_TYPE_KEYS,
  defaultOnFor,
} from '../contracts.mjs';
import { lemmatiseWord, lemmatiseVerb, singulariseNoun, singularisePhrase } from './morph.mjs';
import { tokenize } from './tokenize.mjs';
import { chartFieldAxisForms, chartFieldEnd, chartFieldRole, matchArtifactOperands, matchBlankArtifactCreation, matchChartDisplayEdits, matchChartFieldAssignments, matchChartFieldEdits, matchChartLegendEdits, matchFrames, matchLeadAt, matchLegendPosition, matchModalWants, matchOptionQuestions, matchZeroBasedAt, pairResultativeFrames, applyFrameMatchesToLattice } from './frames.mjs';
import { wholeSelectionPredicates } from './selection.mjs';
import { findNonDirectiveScopes } from './prohibitions.mjs';

// ---------------------------------------------------------------------------
// Polymorphic KB accessors (compatible with Map, Set, Array, or plain Object)
// ---------------------------------------------------------------------------

function mapGet(m, key) {
  if (!m) return undefined;
  if (m instanceof Map) return m.get(key);
  if (typeof m === 'object' && Object.hasOwn(m, key)) return m[key];
  return undefined;
}

function mapEntries(m) {
  if (!m) return [];
  if (m instanceof Map) return [...m.entries()];
  if (typeof m === 'object') return Object.entries(m);
  return [];
}

function toArray(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (x instanceof Set) return [...x];
  return [x];
}

function vocabMatch(vocab, key) {
  if (!vocab || !key) return null;
  if (vocab instanceof Set) return vocab.has(key) ? key : null;
  if (Array.isArray(vocab)) return vocab.includes(key) ? key : null;
  if (vocab instanceof Map) {
    if (!vocab.has(key)) return null;
    const v = vocab.get(key);
    return unwrapVocabValue(v, key);
  }
  if (typeof vocab === 'object' && Object.hasOwn(vocab, key)) {
    return unwrapVocabValue(vocab[key], key);
  }
  return null;
}

function unwrapVocabValue(v, fallback) {
  if (v === true) return fallback;
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    return v.canonical ?? v.sort ?? v.name ?? v.step ?? v.value ?? fallback;
  }
  return null;
}

const kbCache = new WeakMap();

function getKbHelpers(kb) {
  if (kb && kbCache.has(kb)) return kbCache.get(kb);

  // Precompute separable phrasal verb index: baseVerb -> Array<{ full, particles, entries }>
  const separableIndex = new Map();
  for (const [verbText, rawEntries] of mapEntries(kb?.verbs)) {
    const parts = String(verbText).toLowerCase().trim().split(/\s+/);
    if (parts.length >= 2) {
      const head = parts[0];
      const particles = parts.slice(1);
      const entries = toArray(rawEntries);
      if (!separableIndex.has(head)) separableIndex.set(head, []);
      separableIndex.get(head).push({ full: verbText, particles, entries });
    }
  }

  // Filler phrases set — strictly filter out any phrase containing an action verb like "let us compose"
  const fillerPhrases = new Set([
    'can you',
    'could you',
    'could you please',
    'would you',
    'would you please',
    'will you',
    'thank you',
    'thanks very much',
    'thanks a lot',
    "i'd like",
    'i would like',
    'i want',
    'i want you to',
    'i need',
    'i need you to',
    "let's",
    'let us',
    'that would help',
    'i appreciate it',
    'appreciate it',
    'much appreciated',
    'if possible',
    'if you can',
    'if you could',
    "that's fine",
    'thats fine',
    "it's fine",
    'sounds good',
    'all good',
    'got it',
    'looks good',
    'sure',
    'i need you to',
    'need you to',
    'i want you to',
    'want you to',
    "i'd like you to",
    'i would like you to',
    'let us',
    "let's",
    'we need to',
    'we want to',
    'if it is not too much trouble',
    "if it's not too much trouble",
    "if that's okay",
    'if that is okay',
    'if you would',
    "if you don't mind",
    'for now',
    'just for now',
  ]);
  for (const ph of toArray(kb?.grammar?.fillerPhrases)) {
    const clean = String(ph).toLowerCase().replace(/\u2019/g, "'").trim();
    if (!clean) continue;
    // Only keep multi-word phrases from w.lang.en whose words are filler/grammar or known polite remarks
    const ws = clean.split(/\s+/);
    const hasContentVerb = ws.some((w) => !kb?.isGrammarWord?.(w) && !kb?.isFillerWord?.(w) && mapGet(kb?.verbs, w));
    if (!hasContentVerb || ['that would help', 'i appreciate it', 'appreciate it'].includes(clean)) {
      fillerPhrases.add(clean);
    }
  }

  // Number words map
  const numberWords = new Map([
    ['zero', 0], ['one', 1], ['two', 2], ['three', 3], ['four', 4],
    ['five', 5], ['six', 6], ['seven', 7], ['eight', 8], ['nine', 9],
    ['ten', 10], ['eleven', 11], ['twelve', 12], ['thirteen', 13],
    ['fourteen', 14], ['fifteen', 15], ['sixteen', 16], ['seventeen', 17],
    ['eighteen', 18], ['nineteen', 19], ['twenty', 20], ['thirty', 30],
    ['forty', 40], ['fifty', 50], ['sixty', 60], ['seventy', 70],
    ['eighty', 80], ['ninety', 90], ['hundred', 100], ['thousand', 1000],
    ['half', 0.5], ['quarter', 0.25], ['dozen', 12], ['pair', 2], ['both', 2],
  ]);
  for (const [w, n] of mapEntries(kb?.grammar?.numbers)) {
    if (n && typeof n === 'object') {
      if (!n.ordinal && n.value !== undefined) {
        const num = Number(n.value);
        if (!Number.isNaN(num)) numberWords.set(String(w).toLowerCase(), num);
      }
    } else {
      const num = Number(n);
      if (!Number.isNaN(num)) numberWords.set(String(w).toLowerCase(), num);
    }
  }

  // Dynamically ingest official w.lang.en.cue, w.lang.en.prep/hand-joins, w.lang.en.ellipsis,
  // w.lang.en.determiners, and w.lang.en.lex from sop-knowledge-worlds (Single Source of Truth!).
  const undoCuePhrases = new Set(['put it back', 'put back', 'go back', 'revert', 'as it was', 'edit back', 'step back']);
  const redoCuePhrases = new Set(['do it again', 'one more time', 'start over']);
  const layoutCuePhrases = new Map();
  for (const cue of toArray(kb?.grammar?.cues)) {
    const leads = toArray(cue?.lead).map((x) => String(x).toLowerCase().trim()).filter(Boolean);
    if (cue.name === 'reaction.thanks') {
      for (const l of leads) fillerPhrases.add(l);
    } else if (cue.name === 'reaction.put_back') {
      for (const l of leads) undoCuePhrases.add(l);
    } else if (cue.name === 'reaction.redo') {
      for (const l of leads) if (l.includes(' ')) redoCuePhrases.add(l);
    } else if (cue.on === 'layout' && cue.value) {
      for (const l of leads) layoutCuePhrases.set(l, cue.value);
    }
  }
  // Dynamically ingest `w.lang.en.ellipsis.repeat` ("again", "once more", "same again", "the same thing", ...)
  for (const rep of toArray(kb?.grammar?.ellipsis?.repeats)) {
    const clean = String(rep).toLowerCase().trim();
    if (clean) redoCuePhrases.add(clean);
  }

  // Dynamically build determiner map from `w.lang.en/shards/determiners.sop` (fallback to DET_MAP for mock KBs)
  const detMap = new Map(DET_MAP);
  for (const [w, info] of mapEntries(kb?.grammar?.determiners)) {
    if (info?.det) detMap.set(String(w).toLowerCase(), info.det);
  }
  const pronounRefs = new Map(PRONOUN_REFS);
  for (const [word, info] of mapEntries(kb?.grammar?.pronouns)) {
    if (info.person === '3' && info.cases?.includes('object')) pronounRefs.set(word, 'definite');
  }

  // Dynamically build spatial & temporal relations from `w.lang.en/shards/prepositions.sop` + `hand-joins.sop`
  // + `w.reader.en.requests` (fallback to SPATIAL_RELATIONS / TEMPORAL_RELATIONS for mock KBs)
  const spatialRels = new Map(SPATIAL_RELATIONS);
  const temporalRels = new Map(TEMPORAL_RELATIONS);
  const rolePreps = new Map(); // prepPhrase -> role (from hand-joins.sop: instrument, criterion, arrangement, replacement, source)
  for (const [prep, info] of mapEntries(kb?.grammar?.prepositions)) {
    const p = String(prep).toLowerCase().trim();
    if (!p || !info) continue;
    if (info.role) rolePreps.set(p, info.role);
    if (info.isTime && info.rel && ['before', 'after', 'during', 'between', 'until', 'since'].includes(info.rel)) {
      temporalRels.set(p, info.rel);
    }
    if (info.rel && (info.space === 'static' || info.space === 'direction' || info.layout)) {
      // Preserve `next_to` distinction for `next to`/`beside` while accepting all SOP spatial prepositions!
      if ((p === 'next to' || p === 'beside') && spatialRels.has(p)) continue;
      if (p === 'on top of' && spatialRels.has(p)) continue;
      if (!['to', 'from', 'at', 'of', 'for', 'with'].includes(p)) {
        spatialRels.set(p, info.rel);
      }
    }
  }

  // Dynamically pull `w.lang.en.lex` lexicons (diagram-frames.sop, hand-grammar.sop, etc.)
  const lexicons = kb?.grammar?.lexicons ?? new Map();
  const nameLetterAfter = lexicons.get?.('name.letter.after') ?? new Set(['connect', 'from', 'to', 'between', 'and', 'box', 'node', 'arrow', 'line', 'link', 'called', 'named']);
  const diagramDirectionLex = lexicons.get?.('diagram.direction') ?? new Set();
  const diagramEdgeFromLex = lexicons.get?.('diagram.edge.from') ?? new Set(['from', 'between']);
  const orderCriterionLex = lexicons.get?.('order.criterion') ?? new Set();

  // Dynamically build unit canonical map from `k.units` + fallback UNIT_CANON
  const unitCanon = new Map(UNIT_CANON);
  for (const [uForm, uSpec] of mapEntries(kb?.domain?.units)) {
    const canon = typeof uSpec === 'string' ? uSpec : uSpec?.name;
    if (canon && !unitCanon.has(uForm) && ['minute', 'hour', 'second', 'degree', 'percent', 'pixel', 'inch', 'cm', 'mm'].includes(canon)) {
      unitCanon.set(uForm, canon);
    }
  }

  const helpers = {
    separableIndex,
    fillerPhrases,
    numberWords,
    undoCuePhrases,
    redoCuePhrases,
    layoutCuePhrases,
    detMap,
    pronounRefs,
    spatialRels,
    temporalRels,
    rolePreps,
    nameLetterAfter,
    diagramDirectionLex,
    diagramEdgeFromLex,
    orderCriterionLex,
    unitCanon,
  };
  if (kb && typeof kb === 'object') kbCache.set(kb, helpers);
  return helpers;
}

function normalizeCatalog(tabObj = {}) {
  const keys = new Map();
  for (const [k, spec] of mapEntries(tabObj.keys)) {
    const family = spec?.family ?? (k.includes('.') ? k.split('.')[0] : '');
    const head = spec?.head ?? 'span';
    const values = spec?.values ? new Set([...toArray(spec.values)].map((v) => String(v).toLowerCase())) : null;
    keys.set(k, { name: k, family, head, values, means: spec?.means });
  }

  const families = new Set(toArray(tabObj.families));
  for (const spec of keys.values()) {
    if (spec.family) families.add(spec.family);
  }

  return {
    tabObj,
    keys,
    families: [...families],
    familyWords: tabObj.familyWords ?? null,
    keyWordIndex: tabObj.keyWordIndex ?? null,
    closedValueIndex: tabObj.closedValueIndex ?? null,
    sorts: tabObj.sorts ?? null,
  };
}

// ---------------------------------------------------------------------------
// Static English closed lexical tables (grammar/syntactic cues only)
// ---------------------------------------------------------------------------

const DET_MAP = new Map([
  ['the', 'definite'],
  ['a', 'indefinite'],
  ['an', 'indefinite'],
  ['another', 'indefinite'],
  ['this', 'demonstrative'],
  ['that', 'demonstrative'],
  ['these', 'demonstrative'],
  ['those', 'demonstrative'],
  ['my', 'possessive'],
  ['your', 'possessive'],
  ['ur', 'possessive'],
  ['his', 'possessive'],
  ['her', 'possessive'],
  ['its', 'possessive'],
  ['our', 'possessive'],
  ['their', 'possessive'],
  ['all', 'quantified'],
  ['every', 'quantified'],
  ['each', 'quantified'],
  ['both', 'quantified'],
  ['some', 'quantified'],
  ['any', 'quantified'],
  ['many', 'quantified'],
  ['few', 'quantified'],
  ['several', 'quantified'],
]);

const ORDINAL_MAP = new Map([
  ['first', 'first'], ['1st', 'first'],
  ['second', 'second'], ['2nd', 'second'],
  ['third', 'third'], ['3rd', 'third'],
  ['fourth', 'fourth'], ['4th', 'fourth'],
  ['fifth', 'fifth'], ['5th', 'fifth'],
  ['last', 'last'],
  ['second last', 'second_last'], ['second-last', 'second_last'],
  ['newest', 'newest'], ['latest', 'newest'],
  ['oldest', 'oldest'],
  ['leftmost', 'leftmost'], ['rightmost', 'rightmost'],
  ['topmost', 'topmost'], ['bottommost', 'bottommost'],
]);

const QUANTIFIER_MAP = new Map([
  ['all', 'all'],
  ['every', 'every'],
  ['each', 'each'],
  ['both', 'both'],
  ['some', 'some'],
  ['many', 'many'],
  ['few', 'few'],
  ['a few', 'few'],
  ['several', 'several'],
  ['a couple', 'couple'],
  ['a couple of', 'couple'],
]);

const PRONOUN_REFS = new Map([
  ['it', 'definite'],
  ['them', 'definite'],
  ['one', 'definite'],
  ['this', 'demonstrative'],
  ['that', 'demonstrative'],
  ['these', 'demonstrative'],
  ['those', 'demonstrative'],
  ['this one', 'demonstrative'],
  ['that one', 'demonstrative'],
]);

const UNIVERSAL_REFS = new Set([
  'all',
  'everything',
  'all of them',
  'every one',
  'everyone',
  'both',
  'both of them',
]);

const JOURNAL_STEP_PHRASES = new Set([
  'last change',
  'previous change',
  'last step',
  'previous step',
  'last drawing change',
  'last edit',
  'previous edit',
  'previous action',
  'last action',
  'the last change',
  'the last step',
  'the previous change',
  'the previous step',
]);

const NEG_NOT_ALL = new Set([
  'not all',
  'not only',
  'not every',
  'not just',
  'not everything',
  'not all of them',
]);

const NEG_NO = new Set([
  'not',
  'no',
  'without',
  'never',
  "don't",
  'dont',
  'do not',
  "doesn't",
  'doesnt',
  "didn't",
  'didnt',
  "isn't",
  'isnt',
  "aren't",
  'arent',
  "won't",
  'wont',
  "can't",
  'cant',
  'cannot',
  'instead of',
  'rather than',
  'except',
  'except for',
  'other than',
  'with no',
  'but no',
  'minus',
]);

const NAME_INTRO_WORDS = new Set(['called', 'named', 'labelled', 'labeled', 'titled']);

const KEEPING_VERBS = new Set([
  'keep',
  'leave',
  'stay',
  'spare',
  'remain',
]);

const QUESTION_PHRASES = new Map([
  ['what is', { mood: 'ask', question: 'what', cost: 2 }],
  ['what are', { mood: 'ask', question: 'what', cost: 2 }],
  ["what's", { mood: 'ask', question: 'what', cost: 2 }],
  ['how many', { mood: 'ask', question: 'count', cost: 2 }],
  ['how much', { mood: 'ask', question: 'how_much', cost: 2 }],
  ['is there', { mood: 'check', question: 'exists', cost: 2 }],
  ['are there', { mood: 'check', question: 'exists', cost: 2 }],
  ['where is', { mood: 'ask', question: 'where', cost: 2 }],
  ['where are', { mood: 'ask', question: 'where', cost: 2 }],
  ["where's", { mood: 'ask', question: 'where', cost: 2 }],
  ['when is', { mood: 'ask', question: 'when', cost: 2 }],
  ['when are', { mood: 'ask', question: 'when', cost: 2 }],
  ["when's", { mood: 'ask', question: 'when', cost: 2 }],
  ['who is', { mood: 'ask', question: 'who', cost: 2 }],
  ['who are', { mood: 'ask', question: 'who', cost: 2 }],
  ["who's", { mood: 'ask', question: 'who', cost: 2 }],
  ['which is', { mood: 'ask', question: 'which', cost: 2 }],
  ['which are', { mood: 'ask', question: 'which', cost: 2 }],
  ['tell me', { mood: 'ask', question: 'describe', cost: 2 }],
  ['what', { mood: 'ask', question: 'what', cost: 3 }],
  ['which', { mood: 'ask', question: 'which', cost: 3 }],
  ['where', { mood: 'ask', question: 'where', cost: 3 }],
  ['when', { mood: 'ask', question: 'when', cost: 3 }],
  ['who', { mood: 'ask', question: 'who', cost: 3 }],
  ['why', { mood: 'ask', question: 'why', cost: 3 }],
  ['how', { mood: 'ask', question: 'how', cost: 3 }],
  ['list', { mood: 'ask', question: 'list', cost: 1 }],
  ['count', { mood: 'ask', question: 'count', cost: 1 }],
  ['describe', { mood: 'ask', question: 'describe', cost: 1 }],
  ['explain', { mood: 'ask', question: 'describe', cost: 1 }],
  ['compare', { mood: 'ask', question: 'compare', cost: 1 }],
  ['total', { mood: 'ask', question: 'total', cost: 2 }],
  ['average', { mood: 'ask', question: 'average', cost: 2 }],
  ['max', { mood: 'ask', question: 'max', cost: 2 }],
  ['min', { mood: 'ask', question: 'min', cost: 2 }],
  ['difference', { mood: 'ask', question: 'difference', cost: 2 }],
  ['percent', { mood: 'ask', question: 'percent', cost: 2 }],
]);

const COPULA_QUESTION_WORDS = new Set(['is', 'are', 'was', 'were', 'do', 'does', 'did']);
const SOFT_CHANGE_PREDS = new Set(['should be', 'be', 'want', 'need', 'would like', "i'd like", 'become', 'becomes', 'turn into', 'turns into']);
const PLACE_OR_MAKE_VERBS = new Set(['place', 'put', 'stack', 'stick', 'drop', 'position', 'lay', 'give']);
const PASSIVE_MODAL_PHRASES = new Set(['needs to be', 'need to be', 'has to be', 'have to be', 'must be', 'should be', 'ought to be', 'to be']);
const NOUN_PRECEDING_WORDS = new Set(['the', 'a', 'an', 'this', 'that', 'my', 'your', 'his', 'her', 'its', 'our', 'their', 'per', 'by', 'of', 'in', 'on', 'for', 'from', 'to', 'with', 'without', 'each', 'every', 'first', 'second', 'third', 'last', 'new', 'old', 'next', 'previous']);
const CHART_AGG_WORDS = new Map([
  ['counting', 'count'], ['count', 'count'], ['counts', 'count'], ['number of', 'count'],
  ['sum', 'sum'], ['sum of', 'sum'], ['summing', 'sum'], ['total', 'sum'], ['total of', 'sum'],
  ['average', 'avg'], ['avg', 'avg'], ['mean', 'avg'], ['averaging', 'avg'],
  ['minimum', 'min'], ['min', 'min'], ['lowest', 'min'],
  ['maximum', 'max'], ['max', 'max'], ['highest', 'max'],
  ['median', 'median'],
]);

const COLOUR_SHADES = new Set(['dark', 'light', 'bright', 'pale', 'deep', 'pastel', 'vivid', 'soft', 'sky', 'navy']);

const DEGREE_ADVERBS = new Map([
  ['a bit', 'mild'],
  ['a little', 'mild'],
  ['slightly', 'mild'],
  ['somewhat', 'mild'],
  ['a touch', 'mild'],
  ['much', 'strong'],
  ['a lot', 'strong'],
  ['way', 'strong'],
  ['far', 'strong'],
  ['significantly', 'strong'],
  ['much more', 'strong'],
  ['even', 'mild'],
]);

const COMPARATIVE_SPECS = new Map([
  ['bigger', { dir: 'more', targets: ['size', 'scale', 'markerSize', 'fontSize', 'barWidth', 'barHeight', 'barGap', 'errorCap', 'pieRadius', 'gap'] }],
  ['larger', { dir: 'more', targets: ['size', 'scale', 'markerSize', 'fontSize', 'barWidth', 'barHeight', 'barGap', 'errorCap', 'pieRadius', 'gap'] }],
  ['smaller', { dir: 'less', targets: ['size', 'scale', 'markerSize', 'pieRadius', 'fontSize', 'barWidth', 'barHeight', 'barGap', 'errorCap', 'gap'] }],
  ['tinier', { dir: 'less', targets: ['size', 'scale', 'markerSize', 'fontSize', 'barGap', 'errorCap', 'gap'] }],
  ['wider', { dir: 'more', targets: ['width', 'barWidth', 'lineWidth', 'colourBarWidth', 'gridWidth', 'barEdgeWidth', 'errorCap', 'barGap', 'gap'] }],
  ['narrower', { dir: 'less', targets: ['width', 'barWidth', 'lineWidth', 'colourBarWidth', 'gridWidth', 'barEdgeWidth', 'errorCap', 'barGap', 'gap'] }],
  ['taller', { dir: 'more', targets: ['height', 'barHeight', 'length', 'colourBarLength'] }],
  ['shorter', { dir: 'less', targets: ['length', 'height', 'barHeight', 'colourBarLength'] }],
  ['longer', { dir: 'more', targets: ['length', 'duration', 'colourBarLength', 'barHeight'] }],
  ['thicker', { dir: 'more', targets: ['stroke', 'lineWidth', 'errorCap', 'barEdgeWidth', 'colourBarWidth', 'gridWidth', 'markerEdge', 'width'] }],
  ['thinner', { dir: 'less', targets: ['stroke', 'lineWidth', 'errorCap', 'barEdgeWidth', 'colourBarWidth', 'gridWidth', 'markerEdge', 'width'] }],
  ['darker', { dir: 'less', targets: ['colour', 'color'] }],
  ['lighter', { dir: 'more', targets: ['colour', 'color'] }],
  ['brighter', { dir: 'more', targets: ['colour', 'color'] }],
  ['fainter', { dir: 'less', targets: ['opacity'] }],
  ['clearer', { dir: 'more', targets: ['opacity'] }],
  ['later', { dir: 'more', targets: ['time', 'shift'] }],
  ['earlier', { dir: 'less', targets: ['time', 'shift'] }],
]);

const SUBPART_KEY_REQUIRED_SHORTS = new Set([
  'errorCap', 'barGap', 'barWidth', 'barHeight', 'markerSize', 'markerEdge',
  'pieRadius', 'fontSize', 'colourBarWidth', 'colourBarLength', 'gridWidth', 'barEdgeWidth', 'lineWidth',
]);

const SCALE_DEGREE_MAP = new Map([
  ['tiny', 'tiny'],
  ['minuscule', 'tiny'],
  ['teeny', 'tiny'],
  ['very small', 'tiny'],
  ['small', 'small'],
  ['little', 'small'],
  ['mini', 'small'],
  ['medium', 'medium'],
  ['middle size', 'medium'],
  ['medium size', 'medium'],
  ['default', 'default'],
  ['normal', 'default'],
  ['big', 'big'],
  ['large', 'big'],
  ['huge', 'huge'],
  ['enormous', 'huge'],
  ['giant', 'huge'],
  ['gigantic', 'huge'],
  ['massive', 'huge'],
  ['very big', 'huge'],
  ['very large', 'huge'],
]);

const SPATIAL_RELATIONS = new Map([
  ['in', 'in'],
  ['inside', 'inside'],
  ['within', 'in'],
  ['into', 'in'],
  ['on', 'on'],
  ['onto', 'on'],
  ['right on', 'on'],
  ['on top of', 'above'],
  ['above', 'above'],
  ['right above', 'above'],
  ['over', 'above'],
  ['right below', 'below'],
  ['right under', 'under'],
  ['right behind', 'behind'],
  ['right next to', 'next_to'],
  ['right beside', 'next_to'],
  ['right in front of', 'in_front_of'],
  ['below', 'below'],
  ['under', 'below'],
  ['underneath', 'below'],
  ['beneath', 'below'],
  ['next to', 'next_to'],
  ['beside', 'next_to'],
  ['near', 'near'],
  ['close to', 'near'],
  ['by', 'near'],
  ['behind', 'behind'],
  ['in front of', 'in_front_of'],
  ['to the left of', 'left_of'],
  ['on the left side of', 'left_of'],
  ['left side of', 'left_of'],
  ['left of', 'left_of'],
  ['to the right of', 'right_of'],
  ['on the right side of', 'right_of'],
  ['right side of', 'right_of'],
  ['right of', 'right_of'],
  ['between', 'between'],
  ['outside', 'outside'],
  ['around', 'around'],
  ['along', 'along'],
  ['across', 'across'],
]);

const TEMPORAL_RELATIONS = new Map([
  ['before', 'before'],
  ['ahead of', 'before'],
  ['earlier than', 'before'],
  ['after', 'after'],
  ['behind', 'after'],
  ['later than', 'after'],
  ['during', 'during'],
  ['between', 'between'],
]);

const UNIT_CANON = new Map([
  ['minute', 'minute'], ['minutes', 'minute'], ['min', 'minute'], ['mins', 'minute'],
  ['hour', 'hour'], ['hours', 'hour'], ['hr', 'hour'], ['hrs', 'hour'],
  ['second', 'second'], ['seconds', 'second'], ['sec', 'second'], ['secs', 'second'],
  ['pixel', 'pixel'], ['pixels', 'pixel'], ['px', 'pixel'],
  ['degree', 'degree'], ['degrees', 'degree'], ['deg', 'degree'],
  ['percent', 'percent'], ['%', 'percent'],
  ['word', 'word'], ['words', 'word'],
  ['sentence', 'sentence'], ['sentences', 'sentence'],
  ['paragraph', 'paragraph'], ['paragraphs', 'paragraph'],
  ['chapter', 'chapter'], ['chapters', 'chapter'],
  ['page', 'page'], ['pages', 'page'],
  ['inch', 'inch'], ['inches', 'inch'],
  ['cm', 'cm'], ['mm', 'mm'],
  ['bin', 'bin'], ['bins', 'bin'],
  ['level', 'level'], ['levels', 'level'],
  ['row', 'row'], ['rows', 'row'],
  ['column', 'column'], ['columns', 'column'],
  ['seat', 'seat'], ['seats', 'seat'],
  ['decimal', 'decimal'], ['decimals', 'decimal'],
]);

const WEEKDAYS = new Set([
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]);
const RELATIVE_DAYS = new Set(['today', 'tomorrow', 'yesterday', 'tonight']);
const DAY_MODIFIERS = new Set(['this', 'next', 'last']);
const TIME_OF_DAY_PHRASES = new Map([
  ['in the morning', 'morning'],
  ['this morning', 'morning'],
  ['morning', 'morning'],
  ['in the afternoon', 'afternoon'],
  ['this afternoon', 'afternoon'],
  ['afternoon', 'afternoon'],
  ['in the evening', 'evening'],
  ['this evening', 'evening'],
  ['evening', 'evening'],
  ['at night', 'night'],
  ['tonight', 'night'],
  ['at noon', 'noon'],
  ['noon', 'noon'],
  ['midnight', 'midnight'],
]);

const CHART_TYPE_PHRASES = new Map([
  ['bar chart', 'bar'], ['bar graph', 'bar'],
  ['line chart', 'line'], ['line graph', 'line'],
  ['pie chart', 'pie'], ['pie graph', 'pie'],
  ['doughnut chart', 'doughnut'], ['donut chart', 'doughnut'], ['doughnut', 'doughnut'], ['donut', 'doughnut'],
  ['scatter plot', 'scatter'], ['scatter chart', 'scatter'], ['scatter graph', 'scatter'],
  ['area chart', 'area'], ['area graph', 'area'],
  ['radar chart', 'radar'], ['radar graph', 'radar'],
  ['polar area chart', 'polarArea'], ['polar chart', 'polarArea'],
  ['histogram', 'bar'],
]);

const DIAGRAM_KIND_PHRASES = new Map([
  ['flowchart', 'flowchart'], ['flow chart', 'flowchart'],
  ['mind map', 'mind_map'], ['mindmap', 'mind_map'],
  ['org chart', 'org_chart'], ['organisation chart', 'org_chart'], ['organization chart', 'org_chart'],
  ['state machine', 'state_machine'],
  ['sequence diagram', 'sequence'],
  ['venn diagram', 'venn'], ['venn', 'venn'],
  ['timeline', 'timeline'],
  ['tree', 'tree'],
  ['network', 'network'],
  ['table', 'table'],
  ['bar chart', 'bar_chart'],
  ['line chart', 'line_chart'],
  ['pie chart', 'pie_chart'],
  ['doughnut chart', 'doughnut_chart'],
  ['scatter chart', 'scatter_chart'],
  ['radar chart', 'radar_chart'],
  ['area chart', 'area_chart'],
]);

const HOW_QUESTION_KEYS = new Map([
  ['tall', ['height']],
  ['high', ['height']],
  ['wide', ['width']],
  ['broad', ['width']],
  ['long', ['length', 'duration']],
  ['big', ['size']],
  ['large', ['size']],
  ['small', ['size']],
  ['old', ['age']],
  ['far', ['distance']],
  ['many', ['count', 'words', 'chapters', 'rows', 'columns']],
  ['much', ['opacity', 'distance', 'scale']],
  ['thick', ['stroke', 'lineWidth', 'width']],
]);

// ---------------------------------------------------------------------------
// Candidate Builders
// ---------------------------------------------------------------------------

function normalizeVerbEntries(raw, verbText) {
  const out = [];
  for (const e of toArray(raw)) {
    if (!e) continue;
    if (typeof e === 'string') {
      out.push({ act: e, mode: 'none', mood: 'do', question: 'none' });
      continue;
    }
    const acts = e.acts ? toArray(e.acts) : e.act ? [e.act] : [];
    for (const act of acts) {
      out.push({
        act,
        mode: e.mode ?? 'none',
        mood: e.mood ?? 'do',
        question: e.question ?? 'none',
        attribute: e.attribute ?? null,
        value: e.value ?? null,
        keeping: KEEPING_VERBS.has(verbText) && act === 'remove',
      });
    }
  }
  return out;
}

function resolveAttrShortNames(tabKeys, shortNames) {
  const out = [];
  for (const [attr] of tabKeys) {
    const shortKey = attr.includes('.') ? attr.split('.').slice(1).join('.') : attr;
    if (shortNames.includes(shortKey)) out.push(attr);
  }
  return out;
}

function resolveIntrinsicConstraint(tabKeys, shortAttr, rawVal) {
  if (!shortAttr) return [];
  const lowerVal = rawVal ? String(rawVal).toLowerCase() : '';
  let operator = 'eq';
  let step = 'none';
  let value = rawVal ?? '';

  if (['larger', 'bigger', 'wider', 'longer', 'thicker', 'lighter', 'brighter', 'more'].includes(lowerVal)) {
    operator = 'delta';
    step = 'more';
    value = '';
  } else if (['smaller', 'narrower', 'shorter', 'thinner', 'darker', 'less'].includes(lowerVal)) {
    operator = 'delta';
    step = 'less';
    value = '';
  }

  const candidateShorts = [shortAttr];
  if (shortAttr === 'colour') candidateShorts.push('color');
  if (shortAttr === 'thickness') candidateShorts.push('stroke', 'lineWidth');
  if (shortAttr === 'orientation') candidateShorts.push('turn', 'rotation', 'invert');
  if (shortAttr === 'visible') candidateShorts.push('legend', 'grid', 'gridlines', 'mode', 'hidden');

  const attrs = resolveAttrShortNames(tabKeys, candidateShorts);
  return attrs.map((attribute) => ({
    attribute,
    value,
    operator,
    step,
    on: defaultOnFor(attribute, operator),
  }));
}

function spanTextLower(tokens, s, e) {
  return tokens
    .slice(s, e + 1)
    .map((t) => t.lower)
    .join(' ');
}

function hasPunctInSpan(tokens, s, e) {
  for (let i = s; i <= e; i++) {
    if (tokens[i].isPunct) return true;
  }
  return false;
}

function operatorForAttr(attr, value, tabKeys) {
  const shortKey = attr.includes('.') ? attr.split('.').slice(1).join('.') : attr;
  if (['relation', 'position', 'order'].includes(shortKey)) return 'relation';
  if (shortKey === 'at') return 'region';
  if ((shortKey === 'size' || shortKey === 'length') && SCALE_DEGREE_MAP.has(String(value).toLowerCase())) {
    return 'degree';
  }
  const spec = tabKeys.get(attr);
  if (spec && spec.head && spec.head.includes('step') && SCALE_DEGREE_MAP.has(String(value).toLowerCase())) {
    return 'degree';
  }
  return 'eq';
}

function phaseHintForAttr(attr) {
  const shortKey = attr.includes('.') ? attr.split('.').slice(1).join('.') : attr;
  if (['id', 'ids', 'anchor', 'relation_anchor', 'order_anchor', 'behind', 'seat', 'near'].includes(shortKey)) {
    return 'selector';
  }
  return 'result';
}

function isCommandVerbToken(tok, kb) {
  if (!tok || tok.kind !== 'word') return false;
  for (const lemma of lemmatiseVerb(tok.lower, kb)) {
    if (mapGet(kb?.verbs, lemma)) return true;
  }
  return false;
}

function politeFillerSpans(tokens, kb) {
  if (!kb?.grammar?.fillerPhrases) return [];
  const spans = [];
  const startsDirective = (index) => isCommandVerbToken(tokens[index], kb) ||
    kb.grammar.negativeImperative?.leads.some((words) =>
      words.every((word, offset) => tokens[index + offset]?.lower === word) &&
      isCommandVerbToken(tokens[index + words.length], kb));
  const hasDirective = (index) => [index, ...matchLeadAt(tokens, index, kb)].some(startsDirective);
  for (let startTok = 0; startTok < tokens.length; startTok++) {
    const marker = tokens[startTok];
    if (marker.kind !== 'word' || !['when', 'if'].includes(marker.lower)) continue;
    if (startTok > 0 && !/^[,.;!?]$/.test(tokens[startTok - 1].text)) continue;
    const punctuation = tokens.slice(startTok + 1, startTok + 8).findIndex(({ isPunct }) => isPunct);
    if (punctuation < 0) continue;
    const comma = startTok + 1 + punctuation;
    if (tokens[comma].text !== ',') continue;
    const prefix = tokens.slice(startTok, comma);
    if (prefix.some(({ kind }) => kind !== 'word')) continue;
    const phrase = prefix.map(({ lower }) => lower).join(' ');
    const timeToRespond = /^(?:when|if) you have a (?:minute|moment|second)$/.test(phrase);
    if (!kb.grammar.fillerPhrases.has(phrase) && !timeToRespond) continue;
    const following = comma + 1;
    if (!tokens[following] || tokens[following].isPunct) continue;
    spans.push({ startTok, endTok: comma - 1, protectsComma: true });
    if (hasDirective(following)) continue;
    // A declared bare creation can be phrased as a noun followed by its benefit.
    const bare = kb.grammar.frames?.get('acts.more.make.bare.mods');
    if (bare?.act !== 'make' || kb.grammar.determiners.get(tokens[following]?.lower)?.det !== 'indefinite') continue;
    let end = following + 1;
    while (end < tokens.length && !tokens[end].isPunct &&
        !(tokens[end].kind === 'word' && ((tokens[end].lower === 'then' && hasDirective(end + 1)) ||
          (tokens[end].lower === 'and' && tokens[end + 1]?.lower === 'then' && hasDirective(end + 2))))) end++;
    const type = tokens.slice(following + 1, Math.min(end, following + 5)).find(({ kind, lower }) =>
      kind === 'word' && kb.catalog?.familyWords.get(lower)?.size);
    if (!type) continue;
    const benefit = tokens.findIndex((token, index) =>
      type.end <= token.start && index + 1 < end && token.kind === 'word' && token.lower === 'would' &&
      tokens[index + 1].kind === 'word' && tokens[index + 1].lower === 'help');
    if (benefit < 0) continue;
    spans.push({ startTok: benefit, endTok: end - 1, nominalStart: following });
  }
  return spans;
}

function modalPurposeSpans(tokens, kb, predicates) {
  const grammar = kb?.grammar;
  const modalWords = grammar?.phraseItems?.get('shape.can');
  if (!grammar?.phraseItems?.get('connective')?.has('so') || !modalWords ||
      !tokens.some(({ kind, lower }) => kind === 'word' && lower === 'so')) return [];
  const imperative = new Set(predicates.filter(({ startTok, licensed }) =>
    kb.verbs.has(tokens[startTok].lower) && licensed.some(({ act }) =>
      !['ask', 'greet', 'thank', 'farewell'].includes(act))).map(({ startTok }) => startTok));
  const directiveAt = (index) => [index, ...matchLeadAt(tokens, index, kb)].find((start) => imperative.has(start));
  const joiner = (index) => tokens[index].kind === 'word' && ['then', 'and', 'next', 'but'].includes(tokens[index].lower);
  const nextDirective = (index) => {
    while (index < tokens.length && joiner(index)) index++;
    return directiveAt(index);
  };
  const scopes = [];
  for (let startTok = 1; startTok < tokens.length; startTok++) {
    if (tokens[startTok].kind !== 'word' || tokens[startTok].lower !== 'so') continue;
    const first = startTok + (tokens[startTok + 1]?.lower === 'that' ? 2 : 1);
    const subject = grammar.pronouns.get(tokens[first]?.lower);
    const modal = tokens[first + 1]?.lower;
    if (tokens[first]?.kind !== 'word' || subject?.person !== '1' || !subject.cases.includes('subject') ||
        tokens[first + 1]?.kind !== 'word' || !['can', 'could'].includes(modal) || !modalWords.has(modal)) continue;
    let lead = startTok - 1;
    if (tokens[lead]?.text === ',') lead--;
    for (; lead >= 0; lead--) {
      if (/^[.;!?]$/.test(tokens[lead].text) ||
          ((tokens[lead].text === ',' || joiner(lead)) && nextDirective(lead + 1) !== undefined)) break;
    }
    let clauseStart = lead + 1;
    while (tokens[clauseStart]?.isFiller && !imperative.has(clauseStart) && !tokens[clauseStart].isPunct) clauseStart++;
    const predicate = nextDirective(clauseStart);
    if (predicate === undefined || predicate >= startTok) continue;

    let end = first + 2;
    while (end < tokens.length && !tokens[end].isPunct) {
      if (joiner(end) && ((['then', 'next', 'but'].includes(tokens[end].lower) &&
          nextDirective(end + 1) !== undefined) ||
          (tokens[end].lower === 'and' && (tokens[end + 1]?.lower === 'once' ||
            (tokens[end + 1]?.lower === 'then' && nextDirective(end + 2) !== undefined))))) break;
      end++;
    }
    if (end <= first + 2) continue;
    scopes.push({ startTok, endTok: end - 1, first, purposePredicate: predicate });
    startTok = end - 1;
  }
  return scopes;
}

function isPureGrammarOrVerbSpan(tokens, s, e, kb) {
  let allGramOrVerb = true;
  for (let i = s; i <= e; i++) {
    const t = tokens[i];
    if (t.isPunct) return true;
    // Capitalized mid-sentence proper titles ("Planning", "Review", "Draft", "Approve") are names, not verbs!
    if (t.isProperCandidate) {
      allGramOrVerb = false;
      continue;
    }
    if (!t.isGrammar && !isCommandVerbToken(t, kb)) {
      allGramOrVerb = false;
    }
  }
  return allGramOrVerb;
}

/**
 * Build the unfiltered lexical hypothesis lattice for `text` in `tab`.
 *
 * @param {string} text
 * @param {{ tab: string, kb: object, previous?: string|null, clock?: object|null }} opts
 * @returns {{ text: string, tab: string, tokens: Array<object>, candidates: Array<object>, splitPoints: Array<object>, hasQuestionMark: boolean }}
 */
export function buildLattice(text, { tab = 'drawing', catalog, kb = null, previous = null, clock = null } = {}) {
  const src = String(text ?? '');
  const tokens = tokenize(src, kb);
  const T = tokens.length;
  const {
    separableIndex,
    fillerPhrases,
    numberWords,
    undoCuePhrases,
    redoCuePhrases,
    layoutCuePhrases,
    detMap,
    pronounRefs,
    spatialRels,
    temporalRels,
    rolePreps,
    nameLetterAfter,
    diagramDirectionLex,
    diagramEdgeFromLex,
    unitCanon,
  } = getKbHelpers(kb);
  const {
    keys: tabKeys,
    families: tabFamilies,
    familyWords,
    keyWordIndex,
    closedValueIndex,
    sorts: tabSorts,
  } = normalizeCatalog(catalog ?? kb?.tabs?.[tab]);
  const hasDrawingKeys = !catalog ? tab === 'drawing' : tabKeys.has('drawn.colour');
  const hasDiagramKeys = !catalog ? tab === 'diagram' : tabKeys.has('node.position');
  const hasDocumentKeys = !catalog ? tab === 'document' : tabKeys.has('section.mark');
  const hasMeetingKeys = !catalog ? tab === 'calendar' : tabKeys.has('meeting.title');
  const politeSpans = politeFillerSpans(tokens, kb);
  let purposeSpans = [];
  for (const { startTok, endTok } of politeSpans) {
    for (let tok = startTok; tok <= endTok; tok++) tokens[tok].isFiller = true;
  }
  const nonDirectives = findNonDirectiveScopes(tokens, kb);

  const rawCandidates = [];
  const splitPoints = [];
  const splitSeen = new Set();
  const isNamingContinuationAt = (index) => tokens[index]?.lower === 'and' &&
    ['call', 'name', 'label', 'title'].includes(tokens[index + 1]?.lower) &&
    ['it', 'them', 'this', 'that'].includes(tokens[index + 2]?.lower);
  const hasPartOwners = tabKeys.has('part.owner');

  const genitiveOwner = (index) => {
    const token = tokens[index];
    if (token?.kind !== 'word') return null;
    const value = token.text.match(/^(.+)['’]s$/i)?.[1];
    if (!value || pronounRefs.has(value.toLowerCase()) ||
        (!token.isProperCandidate && !vocabMatch(kb?.domain?.objects, value.toLowerCase()))) return null;
    return value;
  };

  const emit = (cand) => {
    if (!cand.politeFiller && !cand.requestBenefit && politeSpans.some(({ startTok, endTok }) =>
      cand.startTok <= endTok && startTok <= cand.endTok)) return;
    if (cand.purposePredicate === undefined && purposeSpans.some(({ startTok, endTok }) =>
      cand.startTok <= endTok && startTok <= cand.endTok)) return;
    const start = tokens[cand.startTok].start;
    const end = tokens[cand.endTok].end;
    rawCandidates.push({
      ...cand,
      start,
      end,
      text: src.slice(start, end),
    });
  };
  for (const span of politeSpans) {
    if (span.nominalStart == null) {
      emit({ ...span, kind: HYP_KINDS.FILLER, politeFiller: true, cost: 0 });
    } else {
      emit({ ...span, kind: HYP_KINDS.UNREAD, requestBenefit: true, note: 'request.benefit', cost: 0 });
    }
  }

  const emitConstraint = (attr, value, startTok, endTok, extra = {}) => {
    const spec = tabKeys.get(attr);
    if (!spec) return;
    const operator = extra.operator ?? operatorForAttr(attr, value, tabKeys);
    const on = extra.on ?? defaultOnFor(attr, operator);
    const phase = extra.phase ?? phaseHintForAttr(attr);
    const step = extra.step ?? 'none';
    const openValue =
      extra.openValue ??
      Boolean(
        spec.values &&
          value !== '' &&
          !spec.values.has(String(value).toLowerCase())
      );

    // Never hallucinate invalid open values on closed-list schema keys unless explicitly allowed
    // (prevents bogus cross-family parses like drawn.font=shadow, group.size="a lot", or node.kind=dot hijacking fam_r).
    if (openValue && spec.values && !extra.allowOpen) return;

    const rawCost = extra.cost ?? 4;
    const cost = openValue
      ? (extra.allowOpen && extra.requiresKeyWord ? Math.max(rawCost, 8) : Math.max(rawCost, 35))
      : rawCost;

    emit({
      kind: HYP_KINDS.CONSTRAINT,
      startTok,
      endTok,
      family: spec.family,
      attribute: attr,
      value: String(value),
      values: extra.values ?? null,
      on,
      operator,
      phase,
      step,
      openValue,
      valueEvidence: Boolean(extra.valueEvidence),
      requiresKeyWord: Boolean(extra.requiresKeyWord),
      prefersKeyWord: Boolean(extra.prefersKeyWord),
      predicateRole: extra.predicateRole ?? null,
      chartEditPredicate: extra.chartEditPredicate ?? null,
      chartCreationPredicate: extra.chartCreationPredicate ?? null,
      chartCreationScope: extra.chartCreationScope ?? null,
      chartAxisPair: extra.chartAxisPair ?? null,
      chartAxisOrder: extra.chartAxisOrder ?? 0,
      chartAxisAssignment: extra.chartAxisAssignment ?? false,
      chartSourceHead: extra.chartSourceHead ?? null,
      predicateRoleFamily: extra.predicateRoleFamily ?? null,
      dictatedContent: Boolean(extra.dictatedContent),
      needsAnchor: Boolean(extra.needsAnchor),
      isAnchor: Boolean(extra.isAnchor),
      lookupWords: extra.lookupWords ?? null,
      partHead: extra.partHead ?? null,
      words: extra.words ?? null,
      pairedConstraints: extra.pairedConstraints ?? null,
      measure: extra.measure ?? null,
      unit: extra.unit ?? null,
      measureWords: extra.measureWords ?? null,
      character: extra.character ?? null,
      cost,
    });
  };

  // Helper: check preceding determiner before `tokIdx` using dynamic SOP determiners (`detMap`)
  // Looks 1..3 tokens back across up to 2 adjectives/modifiers (e.g. "a small green parrot", "a medium brown bench")
  const checkDetBefore = (tokIdx) => {
    if (tokIdx <= 0) return { det: 'none', detTok: -1 };
    for (let step = 1; step <= 3 && tokIdx - step >= 0; step++) {
      const cand = tokens[tokIdx - step];
      if (cand.kind === 'word' && detMap.has(cand.lower)) {
        return { det: detMap.get(cand.lower), detTok: tokIdx - step };
      }
      if (cand.kind !== 'word' || cand.isPunct || cand.isGrammar || isCommandVerbToken(cand, kb)) {
        break;
      }
    }
    return { det: 'none', detTok: -1 };
  };

  // Helper: parse numeric value of token
  const parseNumeric = (tok) => {
    if (!tok) return null;
    if (tok.kind === 'number') {
      const cleaned = tok.text.endsWith('%') ? tok.text.slice(0, -1) : tok.text;
      const n = Number(cleaned);
      return Number.isNaN(n) ? null : n;
    }
    if (tok.kind === 'word' && numberWords.has(tok.lower)) {
      return numberWords.get(tok.lower);
    }
    return null;
  };

  // Pre-collect key groups on this tab for fast emission
  const colourKeys = [];
  const nameLikeKeys = [];
  const numberKeys = [];
  const idKeys = [];
  const relationKeys = [];
  const anchorKeys = [];
  const spanKeys = [];

  for (const [attr, spec] of tabKeys) {
    const shortKey = attr.includes('.') ? attr.split('.').slice(1).join('.') : attr;
    if (
      ['colour', 'color', 'outline', 'gradient', 'background', 'titleColour', 'barEdgeColour', 'textColour', 'highlight_colour'].includes(shortKey)
    ) {
      colourKeys.push(attr);
    }
    if (['name', 'label', 'title'].includes(shortKey)) {
      nameLikeKeys.push(attr);
    }
    if (spec.head === 'number' || spec.head.includes('number')) {
      numberKeys.push(attr);
    }
    if (['id', 'ids', 'members', 'nodes'].includes(shortKey)) {
      idKeys.push(attr);
    }
    if (['relation', 'position', 'order'].includes(shortKey)) {
      relationKeys.push(attr);
    }
    if (['anchor', 'relation_anchor', 'order_anchor'].includes(shortKey)) {
      anchorKeys.push(attr);
    }
    if (['title', 'label', 'name', 'text', 'content', 'agenda', 'items', 'values'].includes(shortKey) || (spec.head.includes('span') && shortKey !== 'ids' && shortKey !== 'id')) {
      spanKeys.push(attr);
    }
  }

  // Coordinate-capable families on this tab
  const coordFamilies = [];
  for (const fam of tabFamilies) {
    if (tabKeys.has(`${fam}.x`) && tabKeys.has(`${fam}.y`)) {
      coordFamilies.push(fam);
    }
  }

  // -------------------------------------------------------------------------
  // 1. FILLER, 2. GRAMMAR, 3. SEP, 4. NEG
  // -------------------------------------------------------------------------
  for (let i = 0; i < T; i++) {
    const tok = tokens[i];

    // 2. GRAMMAR (single tokens with isGrammar && !isProperCandidate)
    if (tok.isGrammar && !tok.isProperCandidate) {
      emit({
        kind: HYP_KINDS.GRAMMAR,
        startTok: i,
        endTok: i,
        cost: 0,
      });
    }

    // 1. FILLER (single token — including single-word fillerPhrases like "cheers", "perfect", "great", or aspectual "try" before V-ing)
    const isAspectualTry = tok.lower === 'try' && i + 1 < T && tokens[i + 1].kind === 'word' && tokens[i + 1].lower.endsWith('ing') && isCommandVerbToken(tokens[i + 1], kb);
    if (tok.isFiller || fillerPhrases.has(tok.lower) || isAspectualTry) {
      emit({
        kind: HYP_KINDS.FILLER,
        startTok: i,
        endTok: i,
        isPureFiller: tok.isFiller || tok.isGrammar,
        cost: isAspectualTry ? 1.5 : tok.isFiller ? 4 : 6,
      });
    }

    // 1. FILLER (multi-word phrases up to 7 tokens, e.g. "if it is not too much trouble")
    for (let len = 2; len <= 7 && i + len <= T; len++) {
      const e = i + len - 1;
      if (hasPunctInSpan(tokens, i, e)) break;
      const ph = spanTextLower(tokens, i, e);
      if (fillerPhrases.has(ph)) {
        const isPure = tokens.slice(i, e + 1).every((t) => t.isFiller || t.isGrammar || t.isPunct);
        emit({
          kind: HYP_KINDS.FILLER,
          startTok: i,
          endTok: e,
          isPureFiller: isPure,
          cost: 1,
        });
      }
      // Passive modal wrapper ("needs to be", "has to be", "should be") before a past-participle verb
      if (PASSIVE_MODAL_PHRASES.has(ph) && e + 1 < T && tokens[e + 1].kind === 'word' && isCommandVerbToken(tokens[e + 1], kb)) {
        emit({
          kind: HYP_KINDS.FILLER,
          startTok: i,
          endTok: e,
          isPureFiller: true,
          cost: 2,
        });
      }
    }

    // Conversational discourse framing fillers:
    // (a) Colon-delimited conversational lead-in ("Long day, ... quick mercy check:", "quick question:", "sanity check:")
    if (i === 0) {
      const colonIdx = tokens.findIndex((t, idx) => idx >= 3 && t.text === ':');
      if (colonIdx > 0 && colonIdx < T - 2) {
        const preColon = spanTextLower(tokens, Math.max(0, colonIdx - 4), colonIdx - 1);
        if (/\b(quick\s+(?:\w+\s+)?(?:check|question)|mercy\s+check|sanity\s+check|long\s+story\s+short|bottom\s+line|so\s+anyway|anyway)$/.test(preColon)) {
          emit({ kind: HYP_KINDS.FILLER, startTok: 0, endTok: colonIdx, isPureFiller: false, cost: 2 });
        }
      }
      // (b) Subordinate narrative background lead ("when the board dials in ... , so (for their sake)? <command>")
      if (tok.lower === 'when') {
        for (let k = 3; k < T - 2; k++) {
          if (tokens[k].text === ',' && tokens[k + 1]?.lower === 'so') {
            let endLead = k + 1;
            if (tokens[k + 2]?.lower === 'for' && tokens[k + 4]?.lower === 'sake') endLead = k + 4;
            emit({ kind: HYP_KINDS.FILLER, startTok: 0, endTok: endLead, isPureFiller: false, cost: 2 });
            if (tokens[0].lower === 'when' && tokens[1]?.lower === 'the') {
              emit({ kind: HYP_KINDS.FILLER, startTok: 2, endTok: endLead, isPureFiller: false, cost: 2.5 });
            }
            break;
          }
        }
      }
    }
    // (c) Trailing commentary after em-dash ("— and that is the whole scene — the way the drawing looks so far")
    // or temporal meeting aside in non-calendar tabs ("before the meeting starts") or trailing "on the canvas?"
    if (tok.text === '—' && i + 2 < T) {
      const restLow = spanTextLower(tokens, i + 1, T - 1);
      if (/^(and\s+)?(that\s+is|that's)\s+the\s+(whole|entire|full)\s+(scene|drawing|diagram|picture)|^the\s+way\s+the\s+(drawing|diagram|chart|scene|page)\s+looks/.test(restLow)) {
        emit({ kind: HYP_KINDS.FILLER, startTok: i, endTok: T - 1, isPureFiller: false, cost: 1.5 });
      }
    }
    if (!hasMeetingKeys && tok.lower === 'before' && i + 3 < T && tokens[i + 1].lower === 'the' && ['meeting', 'call', 'demo', 'presentation', 'session'].includes(tokens[i + 2].lower) && ['starts', 'begins'].includes(tokens[i + 3].lower)) {
      emit({ kind: HYP_KINDS.FILLER, startTok: i, endTok: i + 3, isPureFiller: false, cost: 2 });
      emit({ kind: HYP_KINDS.FILLER, startTok: i + 2, endTok: i + 3, isPureFiller: false, cost: 2.5 });
    }
    if (['on', 'in'].includes(tok.lower) && i + 2 < T && tokens[i + 1].lower === 'the' && ['canvas', 'drawing', 'page', 'screen'].includes(tokens[i + 2].lower) && (i + 2 === T - 1 || (i + 3 === T - 1 && tokens[i + 3].text === '?'))) {
      emit({ kind: HYP_KINDS.FILLER, startTok: i, endTok: T - 1, isPureFiller: false, cost: 3 });
    }
    // (d) List-ordering discourse lead ("the next thing on my list is", "next on my list is", "first on my list is")
    if (i === 0 && ['the', 'next', 'first'].includes(tok.lower)) {
      for (let k = 3; k <= Math.min(T - 2, 7); k++) {
        const leadLow = spanTextLower(tokens, 0, k);
        if (/^(the\s+)?(next|first|last)\s+(thing|item|one)?\s*(on\s+(my|the|our)\s+list\s+)?is$/.test(leadLow)) {
          emit({ kind: HYP_KINDS.FILLER, startTok: 0, endTok: k, isPureFiller: false, cost: 1.5 });
        }
      }
    }
    // (e) Trailing rationale/workflow subordinate clause ("before we export, since the chart has to match ...")
    if (tok.lower === 'before' && i + 2 < T && ['we', 'i', 'you', 'they'].includes(tokens[i + 1].lower) && ['export', 'send', 'share', 'present', 'print', 'publish', 'leave', 'finish'].includes(tokens[i + 2].lower)) {
      emit({ kind: HYP_KINDS.FILLER, startTok: i, endTok: T - 1, isPureFiller: false, cost: 1.8 });
    }
    if (tok.text === ',' && i + 3 < T && ['since', 'because', 'as'].includes(tokens[i + 1].lower) && ['the', 'it', 'we', 'i', 'they'].includes(tokens[i + 2].lower)) {
      emit({ kind: HYP_KINDS.FILLER, startTok: i + 1, endTok: T - 1, isPureFiller: false, cost: 2.2 });
    }
    if (tok.lower === 'together' && (i === T - 1 || (i === T - 2 && tokens[T - 1].isPunct))) {
      emit({ kind: HYP_KINDS.FILLER, startTok: i, endTok: i, isPureFiller: false, cost: 2.0 });
    }

    // 3. SEP (punctuation & joiners)
    if (tok.isPunct && (tok.text === ',' || tok.text === ';' || tok.text === '.' || (tok.text === '?' && i + 1 < T))) {
      const isStrong = tok.text !== ',';
      emit({
        kind: HYP_KINDS.SEP,
        startTok: i,
        endTok: i,
        canSplitClause: true,
        isStrongSplit: isStrong,
        cost: 0,
      });
      const spKey = `${i}:${i}`;
      if (!splitSeen.has(spKey)) {
        splitSeen.add(spKey);
        splitPoints.push({ startTok: i, endTok: i, start: tok.start, end: tok.end, text: tok.text, isStrong });
      }
    }

    if (tok.kind === 'word' && ['and', 'then', 'also', 'but', 'afterwards', 'next'].includes(tok.lower)) {
      // Never split "and call it <Name>" / "and name it <Name>" / "and label it <Name>" into a separate request!
      if (!isNamingContinuationAt(i)) {
        const isStrong = ['then', 'afterwards', 'next'].includes(tok.lower);
        emit({
          kind: HYP_KINDS.SEP,
          startTok: i,
          endTok: i,
          canSplitClause: true,
          isStrongSplit: isStrong,
          cost: 0,
        });
        const spKey = `${i}:${i}`;
        if (!splitSeen.has(spKey)) {
          splitSeen.add(spKey);
          splitPoints.push({ startTok: i, endTok: i, start: tok.start, end: tok.end, text: tok.text, isStrong });
        }
      }
    }

    if (i + 1 < T) {
      const two = `${tokens[i].lower} ${tokens[i + 1].lower}`;
      if (['and then', 'and also', 'and next', ', then', ', and', '; then', '; and'].includes(two)) {
        const isStrong = two.endsWith('then') || two.endsWith('next') || two.startsWith(';');
        emit({
          kind: HYP_KINDS.SEP,
          startTok: i,
          endTok: i + 1,
          canSplitClause: true,
          isStrongSplit: isStrong,
          cost: 0,
        });
        const spKey = `${i}:${i + 1}`;
        if (!splitSeen.has(spKey)) {
          splitSeen.add(spKey);
          splitPoints.push({
            startTok: i,
            endTok: i + 1,
            start: tokens[i].start,
            end: tokens[i + 1].end,
            text: src.slice(tokens[i].start, tokens[i + 1].end),
            isStrong,
          });
        }
      }
    }

    // 4. NEG (1..4 token phrases)
    for (let len = 1; len <= 4 && i + len <= T; len++) {
      const e = i + len - 1;
      if (hasPunctInSpan(tokens, i, e)) break;
      const ph = spanTextLower(tokens, i, e);
      if (NEG_NOT_ALL.has(ph)) {
        emit({
          kind: HYP_KINDS.NEG,
          startTok: i,
          endTok: e,
          negWant: 'not_all',
          cost: 2,
        });
      } else if (NEG_NO.has(ph)) {
        emit({
          kind: HYP_KINDS.NEG,
          startTok: i,
          endTok: e,
          negWant: 'no',
          cost: 2,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 5. PREDICATE
  // -------------------------------------------------------------------------
  for (let i = 0; i < T; i++) {
    const tok = tokens[i];
    if (tok.kind !== 'word') continue;

    // 5a. Verbs from kb.verbs (1..3 tokens) — use verb-specific morphology (no -er/-est stripping!)
    const verbLemmas = lemmatiseVerb(tok.lower, kb);
    for (let len = 1; len <= 3 && i + len <= T; len++) {
      const e = i + len - 1;
      if (hasPunctInSpan(tokens, i, e)) break;
      const rest = len > 1 ? ' ' + spanTextLower(tokens, i + 1, e) : '';
      const headCandidates = len === 1 ? verbLemmas : [tok.lower, ...verbLemmas];
      const licensed = [];
      const licensedSeen = new Set();
      const intrinsic = [];
      const intrinsicSeen = new Set();
      let isKeeping = false;

      const addLicensed = (entry) => {
        const key = `${entry.act}|${entry.mode}|${entry.mood}|${entry.question}|${entry.keeping ? 1 : 0}|${entry.particle ?? ''}`;
        if (!licensedSeen.has(key)) {
          licensedSeen.add(key);
          licensed.push({
            act: entry.act,
            mode: entry.mode || 'none',
            mood: entry.mood || 'do',
            question: entry.question || 'none',
            ...(entry.keeping ? { keeping: true } : {}),
            ...(entry.particle ? { particle: entry.particle } : {}),
          });
        }
        if (entry.keeping) isKeeping = true;
        if (entry.attribute || entry.value) {
          for (const ic of resolveIntrinsicConstraint(tabKeys, entry.attribute, entry.value)) {
            const icKey = `${ic.attribute}|${ic.value}|${ic.operator}|${ic.step}`;
            if (!intrinsicSeen.has(icKey)) {
              intrinsicSeen.add(icKey);
              intrinsic.push(ic);
            }
          }
        }
      };

      for (const h of headCandidates) {
        const probe = h + rest;
        const raw = mapGet(kb?.verbs, probe);
        if (raw) {
          for (const ent of normalizeVerbEntries(raw, probe)) {
            if (ent.act === 'ask' && ent.question === 'none' && QUESTION_PHRASES.has(probe)) {
              ent.question = QUESTION_PHRASES.get(probe).question;
            }
            addLicensed(ent);
          }
        }
      }

      // Separable phrasal verbs when len === 1: look ahead for particle within local clause
      if (len === 1) {
        for (const h of verbLemmas) {
          const sepList = separableIndex.get(h);
          if (!sepList) continue;
          for (const sep of sepList) {
            const plen = sep.particles.length;
            for (let j = i + 1; j <= Math.min(T - plen, i + 7); j++) {
              if (tokens[j].isPunct && [';', '.', '?', '!'].includes(tokens[j].text)) break;
              if (hasPunctInSpan(tokens, j, j + plen - 1)) continue;
              const candPart = spanTextLower(tokens, j, j + plen - 1);
              if (candPart === sep.particles.join(' ')) {
                for (const ent of normalizeVerbEntries(sep.entries, sep.full)) {
                  addLicensed({ ...ent, particle: candPart });
                }
                break;
              }
            }
          }
        }
      }

      const declaredMake = licensed.length > 0 && licensed.every((l) => l.act === 'make');
      // Placement & feature-addition verbs ("place", "put", "give") also license act=make;
      // "add" / "draw" / "include" / "show" also license act=change (adding a feature/legend/gridlines to an existing chart/object!).
      if (len === 1 && verbLemmas.some((l) => PLACE_OR_MAKE_VERBS.has(l))) {
        addLicensed({ act: 'make', mode: 'none', mood: 'do', question: 'none' });
      }
      if (len === 1 && verbLemmas.some((l) => ['add', 'draw', 'include', 'show', 'put', 'give'].includes(l))) {
        addLicensed({ act: 'change', mode: 'none', mood: 'do', question: 'none' });
      }

      // Keeping verb marker (even if not in mock kb.verbs)
      if (len === 1 && KEEPING_VERBS.has(tok.lower)) {
        addLicensed({ act: 'remove', mode: 'none', mood: 'do', question: 'none', keeping: true });
      }

      // Document verb intrinsic shortcuts when kb.verbs marks bold/italicize/underline or tab has them
      if (len === 1 && hasDocumentKeys) {
        if (['bold', 'embolden'].includes(tok.lower)) {
          for (const attr of resolveAttrShortNames(tabKeys, ['mark', 'format'])) {
            intrinsic.push({ attribute: attr, value: 'bold', operator: 'eq', step: 'none', on: 'attribute' });
          }
        } else if (['italic', 'italicize', 'italicise'].includes(tok.lower)) {
          for (const attr of resolveAttrShortNames(tabKeys, ['mark', 'format'])) {
            intrinsic.push({ attribute: attr, value: 'italic', operator: 'eq', step: 'none', on: 'attribute' });
          }
        } else if (tok.lower === 'underline') {
          for (const attr of resolveAttrShortNames(tabKeys, ['mark', 'format'])) {
            intrinsic.push({ attribute: attr, value: 'underline', operator: 'eq', step: 'none', on: 'attribute' });
          }
        } else if (['strike', 'strikethrough'].includes(tok.lower)) {
          for (const attr of resolveAttrShortNames(tabKeys, ['mark', 'format'])) {
            intrinsic.push({ attribute: attr, value: 'strike', operator: 'eq', step: 'none', on: 'attribute' });
          }
        }
      }

      // Naming continuation ("and call it <Name>", "and name it <Name>", "and label it <Name>") is a name-introducer
      // on the SAME request, never a separate verb predicate!
      if (len === 1 && isNamingContinuationAt(i - 1)) {
        emit({
          kind: HYP_KINDS.KEY_WORD,
          startTok: i,
          endTok: i,
          attrs: nameLikeKeys,
          isNameIntro: true,
          cost: 1.5,
        });
        continue;
      }

      if (licensed.length > 0) {
        // Pure speech acts ("thanks", "hello", "bye") stay as fillers, not action predicates.
        const actionLicensed = licensed.filter((l) => !['greet', 'thank', 'farewell'].includes(l.act));
        // Gerund/noun & attributive participle guard:
        // - "-ing" / nominalized word right after determiner/preposition ("the drawing", "a heading", "last edit")
        // - or 2 tokens after determiner/preposition across a modifier ("a striped fill", "the profit chart", "the Plan chapter")
        // - "-ed" attributive participle right after determiner followed by noun ("a paired view", "the dashed line")
        const prevWord = i > 0 && tokens[i - 1].kind === 'word' ? tokens[i - 1].lower : '';
        const prev2Word = i > 1 && tokens[i - 2].kind === 'word' && !tokens[i - 1].isPunct ? tokens[i - 2].lower : '';
        const NOMINAL_AMBIG = new Set(['edit', 'change', 'step', 'move', 'swap', 'copy', 'group', 'link', 'line', 'label', 'title', 'name', 'chart', 'plot', 'graph', 'table', 'list', 'text', 'note', 'block', 'section', 'meeting', 'event', 'room', 'place', 'spot', 'point', 'cut', 'fill', 'scale', 'order', 'sort', 'filter', 'frame', 'shadow', 'glow', 'outline', 'stroke', 'mirror', 'turn', 'bend', 'split', 'merge', 'stack', 'drop', 'mix', 'plan', 'role', 'gap', 'view', 'format', 'style', 'grid', 'row', 'column', 'level', 'mark', 'quote', 'review']);
        const detOrPrepBefore = NOUN_PRECEDING_WORDS.has(prevWord) || (NOUN_PRECEDING_WORDS.has(prev2Word) && !isCommandVerbToken(tokens[i - 1], kb));
        const isNominalizedAfterDetOrPrep = len === 1 && detOrPrepBefore
          && (tok.lower.endsWith('ing') || (tok.lower.endsWith('ed') && i + 1 < T && tokens[i + 1].kind === 'word') || NOMINAL_AMBIG.has(tok.lower) || (NOUN_PRECEDING_WORDS.has(prevWord) && tok.lower.endsWith('s')));
        // Passive/embedded finite clause & participial-after-comma guard: "are distributed across...", "points joined fair", ", keeping everything else..."
        const isParticipleAfterComma = len === 1 && i > 0 && tokens[i - 1].text === ',' && tok.lower.endsWith('ing');
        const isGerundAfterTry = len === 1 && prevWord === 'try' && tok.lower.endsWith('ing');
        const isInflectedNonImperative = len === 1 && !isGerundAfterTry && (
          isParticipleAfterComma ||
          (tok.lower.endsWith('s') && tok.lemmas.some((l) => l !== tok.lower && mapGet(kb?.verbs, l))) ||
          (tok.lower.endsWith('ed') && !['be', 'been', 'get'].includes(prevWord))
        );
        // Past-tense directional homonym "left" ("from left to right", "should face left", "two spaces left") is never an imperative command verb!
        const isDirectionalLeft = len === 1 && tok.lower === 'left' && !['be', 'is', 'are', 'was', 'were'].includes(prevWord);
        // A key-like word ("name", "label", "title") sitting right after ';' inside a spec (e.g. "; name Power")
        // is a KEY_WORD field spec, never the main predicate of the preceding clause!
        const isSemiFieldSpec = len === 1 && i > 0 && tokens[i - 1].text === ';' && ['name', 'label', 'title'].includes(tok.lower);
        const isSpecKeyAfterSemi = len === 1 && i > 0 && (tokens[i - 1].text === ';' || tokens[i - 1].text === ',')
          && ['name', 'label', 'title', 'sort', 'order', 'group', 'scale'].includes(tok.lower);
        // Mid-sentence capitalized word (not after sentence punct) or title-initial plural before "by/per/of/:" ("Orders by weekday:", "Fix to Plan") is a Proper Name/Title, not an imperative verb!
        const isMidSentCapProper = len === 1 && i > 0 && !tokens[i - 1].isPunct && /^[A-Z][a-z]+$/.test(tok.text) && tok.lower !== 'i';
        const isTitlePluralBeforePrep = len === 1 && /^[A-Z][a-z]+s$/.test(tok.text) && i + 1 < T && ['by', 'per', 'of', 'over', 'for', ':'].includes(tokens[i + 1].lower);
        if (actionLicensed.length > 0 && !isDirectionalLeft && !isNominalizedAfterDetOrPrep && !isParticipleAfterComma && !isSemiFieldSpec && !isTitlePluralBeforePrep) {
          emit({
            kind: HYP_KINDS.PREDICATE,
            startTok: i,
            endTok: e,
            licensed: actionLicensed,
            declaredMake,
            isKeepingVerb: isKeeping,
            intrinsicConstraints: intrinsic,
            cost: isMidSentCapProper ? 12 : isSpecKeyAfterSemi ? 10 : isInflectedNonImperative ? 14 : (len === 1 ? 2 : 1),
          });
        }
      }
    }

    // 5b. Question predicates (1..2 tokens + indirect-question alternations up to 6 tokens from alternations.sop!)
    const prevQWord = i > 0 && tokens[i - 1].kind === 'word' ? tokens[i - 1].lower : '';
    const NOMINAL_Q_NOUNS = new Set(['list', 'count', 'total', 'average', 'max', 'min', 'difference', 'percent']);
    if (kb?.grammar?.questionAlternations?.size) {
      for (let len = 2; len <= 6 && i + len <= T; len++) {
        const e = i + len - 1;
        if (hasPunctInSpan(tokens, i, e)) break;
        const ph = spanTextLower(tokens, i, e);
        const qa = kb.grammar.questionAlternations.get(ph);
        if (qa) {
          emit({
            kind: HYP_KINDS.PREDICATE,
            startTok: i,
            endTok: e,
            licensed: [{ act: 'ask', mode: 'none', mood: qa.mood, question: qa.question }],
            isKeepingVerb: false,
            intrinsicConstraints: [],
            cost: 0.5,
          });
        }
      }
    }
    for (let len = 1; len <= 2 && i + len <= T; len++) {
      const e = i + len - 1;
      if (hasPunctInSpan(tokens, i, e)) break;
      const ph = spanTextLower(tokens, i, e);
      if (len === 1 && NOMINAL_Q_NOUNS.has(ph) && (NOUN_PRECEDING_WORDS.has(prevQWord) || (e + 1 < T && tokens[e + 1].lower === 'of'))) continue;
      if (QUESTION_PHRASES.has(ph)) {
        const qSpec = QUESTION_PHRASES.get(ph);
        // "which events / which meetings / which rooms / what items..." asks to LIST matching items!
        const nextTok = e + 1 < T ? tokens[e + 1] : null;
        const nextIsPluralNoun = nextTok && nextTok.kind === 'word' && !nextTok.isGrammar && nextTok.lower.endsWith('s') && nextTok.lower.length > 3;
        if ((ph === 'which' || ph === 'what') && nextIsPluralNoun) {
          emit({
            kind: HYP_KINDS.PREDICATE,
            startTok: i,
            endTok: e,
            licensed: [{ act: 'ask', mode: 'none', mood: 'ask', question: 'list' }],
            isKeepingVerb: false,
            intrinsicConstraints: [],
            cost: 1.5,
          });
        }
        // "how about <X>?" / "what about <X>?" is primarily a polite suggestion (mood=do: change/make)!
        if ((ph === 'how' || ph === 'what') && nextTok && nextTok.lower === 'about') {
          emit({
            kind: HYP_KINDS.PREDICATE,
            startTok: i,
            endTok: e + 1,
            licensed: [
              { act: 'change', mode: 'none', mood: 'do', question: 'none' },
              { act: 'make', mode: 'none', mood: 'do', question: 'none' },
            ],
            isKeepingVerb: false,
            intrinsicConstraints: [],
            cost: 1.2,
          });
        }
        emit({
          kind: HYP_KINDS.PREDICATE,
          startTok: i,
          endTok: e,
          licensed: [{ act: 'ask', mode: 'none', mood: qSpec.mood, question: qSpec.question }],
          isKeepingVerb: false,
          intrinsicConstraints: [],
          cost: (ph === 'how' || ph === 'what') && nextTok && nextTok.lower === 'about' ? 6 : qSpec.cost,
        });
      }
    }

    // Copula / auxiliary yes-no question words ("is/are/do/does/did") ONLY license act=ask at clause start
    // when THIS clause (before ';' / '.' / '!') actually ends with '?'!
    const isClauseStartQ = i === 0 || tokens[i - 1].isPunct;
    let clauseEndsWithQ = false;
    if (isClauseStartQ) {
      for (let k = i + 1; k < T; k++) {
        if (tokens[k].text === '?') { clauseEndsWithQ = true; break; }
        if (tokens[k].isPunct && [';', '.', '!'].includes(tokens[k].text)) break;
      }
    }
    if (COPULA_QUESTION_WORDS.has(tok.lower) && clauseEndsWithQ) {
      emit({
        kind: HYP_KINDS.PREDICATE,
        startTok: i,
        endTok: i,
        licensed: [
          { act: 'ask', mode: 'none', mood: 'check', question: 'exists' },
          { act: 'ask', mode: 'none', mood: 'ask', question: 'what' },
        ],
        isKeepingVerb: false,
        intrinsicConstraints: [],
        cost: 5,
      });
    } else if (tok.lower === 'any' && clauseEndsWithQ) {
      emit({
        kind: HYP_KINDS.PREDICATE,
        startTok: i,
        endTok: i,
        licensed: [{ act: 'ask', mode: 'none', mood: 'check', question: 'exists' }],
        isKeepingVerb: false,
        intrinsicConstraints: [],
        cost: 3,
      });
    } else if (['total', 'count'].includes(tok.lower) && src.includes('?') && ['for', 'of'].includes(tokens[i + 1]?.lower ?? '')) {
      emit({
        kind: HYP_KINDS.PREDICATE,
        startTok: i,
        endTok: i,
        licensed: [
          { act: 'ask', mode: 'none', mood: 'ask', question: 'count' },
          { act: 'ask', mode: 'none', mood: 'ask', question: 'total' },
        ],
        isKeepingVerb: false,
        intrinsicConstraints: [],
        cost: 1.2,
      });
    } else if (tok.lower === 'grand' && tokens[i + 1]?.lower === 'total' && ['of', 'for'].includes(tokens[i + 2]?.lower ?? '')) {
      emit({
        kind: HYP_KINDS.PREDICATE,
        startTok: i,
        endTok: i,
        licensed: [{ act: 'ask', mode: 'none', mood: 'ask', question: 'total' }],
        isKeepingVerb: false,
        intrinsicConstraints: [],
        cost: 1.0,
      });
    } else if (tok.lower === 'surprise' && tokens[i + 1]?.lower === 'me' && tabKeys.has('composition.source')) {
      emit({
        kind: HYP_KINDS.PREDICATE,
        startTok: i,
        endTok: i,
        licensed: [{ act: 'make', mode: 'none', mood: 'do', question: 'none' }],
        isKeepingVerb: false,
        intrinsicConstraints: [{ attribute: 'composition.source', value: 'random', operator: 'eq', step: 'none', on: 'attribute' }],
        cost: 0.8,
      });
    }

    // 5c. Copula / desire predicates ("should be", "be", "want", "need", "would like")
    for (let len = 1; len <= 2 && i + len <= T; len++) {
      const e = i + len - 1;
      if (hasPunctInSpan(tokens, i, e)) break;
      const ph = spanTextLower(tokens, i, e);
      if (SOFT_CHANGE_PREDS.has(ph)) {
        const lic = [{ act: 'change', mode: 'none', mood: 'do', question: 'none' }];
        if (ph === 'want' || ph === 'need' || ph === 'would like' || ph === "i'd like") {
          lic.push({ act: 'make', mode: 'none', mood: 'do', question: 'none' });
        }
        emit({
          kind: HYP_KINDS.PREDICATE,
          startTok: i,
          endTok: e,
          licensed: lic,
          isKeepingVerb: false,
          intrinsicConstraints: [],
          cost: 6,
        });
      }
    }

    // 5d. Reaction undo/redo & ellipsis-repeat cues from w.lang.en.cue & w.lang.en/shards/ellipsis.sop
    for (let len = 1; len <= 4 && i + len <= T; len++) {
      const e = i + len - 1;
      if (hasPunctInSpan(tokens, i, e)) break;
      const ph = spanTextLower(tokens, i, e);
      if (len >= 2 && undoCuePhrases.has(ph)) {
        emit({
          kind: HYP_KINDS.PREDICATE,
          startTok: i,
          endTok: e,
          licensed: [{ act: 'undo', mode: 'none', mood: 'do', question: 'none' }],
          isKeepingVerb: false,
          intrinsicConstraints: [],
          cost: 1.5,
        });
      } else if (['as a group', 'into a group'].includes(ph)) {
        emit({
          kind: HYP_KINDS.PREDICATE,
          startTok: i,
          endTok: e,
          licensed: [{ act: 'group', mode: 'none', mood: 'do', question: 'none' }],
          isKeepingVerb: false,
          intrinsicConstraints: [],
          cost: 1.5,
        });
      } else if (redoCuePhrases.has(ph) && (len >= 2 || ph === 'again')) {
        // Guard: "the same <noun/adj>" ("the same bottom line", "the same size") is a comparison modifier, not `redo`!
        const followedByModNoun = e + 1 < T && tokens[e + 1].kind === 'word' && !tokens[e + 1].isPunct && !tokens[e + 1].isFiller
          && /^the same$/i.test(ph);
        // Guard: "same again, another tree..." — discourse ellipsis lead before a new noun phrase is a FILLER!
        const followedByCommaNP = e + 2 < T && tokens[e + 1].text === ',' && ['another', 'a', 'an'].includes(tokens[e + 2].lower);
        if (followedByCommaNP) {
          emit({ kind: HYP_KINDS.FILLER, startTok: i, endTok: e, isPureFiller: false, cost: 2 });
        } else if (!followedByModNoun) {
          emit({
            kind: HYP_KINDS.PREDICATE,
            startTok: i,
            endTok: e,
            licensed: [
              { act: 'redo', mode: 'none', mood: 'do', question: 'none' },
              { act: 'copy', mode: 'repeat', mood: 'do', question: 'none' },
            ],
            isKeepingVerb: false,
            intrinsicConstraints: [],
            cost: len >= 2 ? 2 : 5,
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 6. TARGET_FAMILY & 7. TARGET_SORT
  // -------------------------------------------------------------------------
  for (let i = 0; i < T; i++) {
    for (let len = 1; len <= 3 && i + len <= T; len++) {
      const e = i + len - 1;
      if (hasPunctInSpan(tokens, i, e)) break;
      const rawPhrase = src.slice(tokens[i].start, tokens[e].end);
      const forms = singularisePhrase(spanTextLower(tokens, i, e), kb);

      // 6. TARGET_FAMILY
      const matchedFamilies = new Set();
      for (const f of forms) {
        const famVal = mapGet(familyWords, f);
        for (const fam of toArray(famVal)) {
          if (fam) matchedFamilies.add(String(fam));
        }
      }
      if (matchedFamilies.size > 0) {
        const { det, detTok } = checkDetBefore(i);
        // Guard: "face" after modal/infinitive ("should face left", "to face the house") or inside "with a <adj> face" is KEY_WORD(drawn.facing / drawn.expression), not TARGET_FAMILY!
        const prevLow = i > 0 ? tokens[i - 1].lower : '';
        const isVerbOrExprFace = rawPhrase.toLowerCase() === 'face' && (
          ['to', 'should', 'must', 'can', 'could', 'would', 'will'].includes(prevLow) ||
          (i >= 3 && tokens[i - 3].lower === 'with' && ['a', 'an'].includes(tokens[i - 2].lower))
        );
        const isSentStartImperative = len === 1 && tokens[i].isSentenceStart && det === 'none' && isCommandVerbToken(tokens[i], kb);
        for (const family of matchedFamilies) {
          emit({
            kind: HYP_KINDS.TARGET_FAMILY,
            startTok: i,
            endTok: e,
            family,
            familyWords: rawPhrase,
            det,
            detTok,
            count: null,
            countWords: null,
            ordinal: null,
            quantifier: null,
            quantity: null,
            cost: (isVerbOrExprFace || isSentStartImperative) ? 15 : 3,
          });

          // Preceding count / ordinal / quantifier before TARGET_FAMILY (e.g. "first paragraph", "two charts")
          if (i >= 1) {
            const m1 = tokens[i - 1];
            const num1 = parseNumeric(m1);
            if (num1 !== null && Number.isInteger(num1) && num1 >= 0) {
              const outerDet = checkDetBefore(i - 1);
              emit({
                kind: HYP_KINDS.TARGET_FAMILY,
                startTok: i - 1,
                endTok: e,
                family,
                familyWords: rawPhrase,
                det: outerDet.det,
                detTok: outerDet.detTok,
                count: num1,
                countWords: m1.text,
                ordinal: null,
                quantifier: null,
                quantity: null,
                cost: 2.5,
              });
            } else if (ORDINAL_MAP.has(m1.lower)) {
              const outerDet = checkDetBefore(i - 1);
              emit({
                kind: HYP_KINDS.TARGET_FAMILY,
                startTok: i - 1,
                endTok: e,
                family,
                familyWords: rawPhrase,
                det: outerDet.det,
                detTok: outerDet.detTok,
                count: null,
                countWords: null,
                ordinal: ORDINAL_MAP.get(m1.lower),
                quantifier: null,
                quantity: null,
                cost: 2.5,
              });
            } else if (QUANTIFIER_MAP.has(m1.lower) && !m1.isGrammar) {
              const outerDet = checkDetBefore(i - 1);
              emit({
                kind: HYP_KINDS.TARGET_FAMILY,
                startTok: i - 1,
                endTok: e,
                family,
                familyWords: rawPhrase,
                det: outerDet.det !== 'none' ? outerDet.det : 'quantified',
                detTok: outerDet.detTok,
                count: null,
                countWords: null,
                ordinal: null,
                quantifier: m1.text,
                quantity: QUANTIFIER_MAP.get(m1.lower),
                cost: 2.5,
              });
            } else if (
              m1.kind === 'word' &&
              !m1.isGrammar &&
              !m1.isFiller &&
              !isCommandVerbToken(m1, kb) &&
              !vocabMatch(kb?.domain?.colours, m1.lower) &&
              !SCALE_DEGREE_MAP.has(m1.lower) &&
              !mapGet(closedValueIndex, m1.lower) &&
              i >= 2 &&
              DET_MAP.has(tokens[i - 2].lower)
            ) {
              // Compound modified family target: "the profit chart", "the sales chart", "the Garden room", "the dentist appointment"
              const outerDet = DET_MAP.get(tokens[i - 2].lower);
              const descSpan = src.slice(tokens[i - 2].start, tokens[e].end);
              emit({
                kind: HYP_KINDS.TARGET_FAMILY,
                startTok: i - 1,
                endTok: e,
                family,
                familyWords: rawPhrase,
                description: descSpan,
                det: outerDet,
                detTok: i - 2,
                count: null,
                countWords: null,
                ordinal: null,
                quantifier: null,
                quantity: null,
                cost: 2.2,
              });
            }
          }
        }
      }

      // 7. TARGET_SORT
      const sortMatches = []; // { sort, family }
      const sortSeen = new Set();
      const addSort = (sort, family) => {
        if (!sort || !family) return;
        const k = `${family}|${sort}`;
        if (!sortSeen.has(k)) {
          sortSeen.add(k);
          sortMatches.push({ sort: String(sort), family: String(family) });
        }
      };

      // Prefer singularized forms first so plural nouns ("clouds") canonically emit sort=cloud sort_words=clouds
      const singularFirst = forms.length > 1 ? [...forms.slice(1), forms[0]] : forms;
      for (const f of singularFirst) {
        // Explicit tab sorts map if provided by kb
        const explicitSort = mapGet(tabSorts, f);
        if (explicitSort) {
          for (const ent of toArray(explicitSort)) {
            if (typeof ent === 'string') addSort(ent, tabFamilies[0] ?? 'drawn');
            else if (ent && ent.sort) addSort(ent.sort, ent.family ?? tabFamilies[0]);
          }
        }

        if (hasDrawingKeys) {
          const bp = vocabMatch(kb?.domain?.bodyParts, f);
          if (bp) addSort(bp, 'part');
          if (hasPartOwners && kb?.domain?.partNames?.has(f) && (checkDetBefore(i).det === 'possessive' ||
              genitiveOwner(i - 1) || rolePreps.get(tokens[e + 1]?.lower) === 'part')) {
            addSort(f, 'part');
          }
          const obj = vocabMatch(kb?.domain?.objects, f);
          if (obj) addSort(obj, 'drawn');
          const ppl = vocabMatch(kb?.domain?.people, f);
          if (ppl) addSort(ppl, 'drawn');
          const ani = vocabMatch(kb?.domain?.animals, f);
          if (ani) addSort(ani, 'drawn');
          const shp = vocabMatch(kb?.domain?.shapes, f);
          if (shp) addSort(shp, 'drawn');
        }
        if (hasDiagramKeys) {
          const shp = vocabMatch(kb?.domain?.shapes, f);
          if (shp) addSort(shp, 'node');
          const diag = vocabMatch(kb?.domain?.diagrams, f);
          if (diag) addSort(diag, 'diagram');
          const ch = vocabMatch(kb?.domain?.charts, f);
          if (ch) addSort(ch, 'chart');
        }
        if (hasDocumentKeys) {
          const gen = vocabMatch(kb?.domain?.genres, f);
          if (gen) {
            if (tabFamilies.includes('text')) addSort(gen, 'text');
            if (tabFamilies.includes('document')) addSort(gen, 'document');
          }
          // Structural section/inline sorts matching w.request conventions
          if (['heading', 'paragraph'].includes(f) && tabFamilies.includes('section')) {
            addSort(f, 'section');
          }
          if (['list', 'bullet list', 'numbered list'].includes(f) && tabFamilies.includes('inline')) {
            addSort('list', 'inline');
          }
        }
        // Once singular matched a sort for this span, stop so plural duplicate ("clouds") isn't emitted alongside "cloud"
        if (sortMatches.length > 0 && f !== forms[0]) break;
      }

      for (const { sort, family } of sortMatches) {
        const sortWords = rawPhrase.toLowerCase() !== sort.toLowerCase() ? rawPhrase : null;
        const { det, detTok } = checkDetBefore(i);
        // When a drawing noun is ALSO a declared body/face part, keep both hypotheses
        // but give `part` a clean prior advantage over standalone `drawn` object (e.g., "shift the nose up").
        // When a bare noun (no determiner) is ALSO a colour ("orange", "gold", "rose", "lime"), prefer colour over fruit/object sort!
        const isAlsoBodyPart = hasDrawingKeys && family === 'drawn' && sortMatches.some((x) => x.family === 'part');
        const isBareColourNoun = det === 'none' && Boolean(vocabMatch(kb?.domain?.colours, sort.toLowerCase()));
        const isBareMidSentProper = len === 1 && tokens[i].isProperCandidate && det === 'none';
        const isSceneContainerWord = hasDrawingKeys && ['picture', 'drawing', 'scene', 'canvas'].includes(sort.toLowerCase())
          && i > 0 && Boolean(vocabMatch(kb?.domain?.scenes, tokens[i - 1].lower));
        const baseSortCost = isAlsoBodyPart ? 14 : isSceneContainerWord ? 14 : isBareColourNoun ? 10 : isBareMidSentProper ? 8.5 : 2.5;
        emit({
          kind: HYP_KINDS.TARGET_SORT,
          startTok: i,
          endTok: e,
          family,
          sort,
          sortWords,
          det,
          detTok,
          count: null,
          countWords: null,
          ordinal: null,
          quantifier: null,
          quantity: null,
          cost: baseSortCost,
        });

        // Post-nominal cardinal identifier ("block 9", "node 3", "step 2", "part 2", "room 4"):
        // In English, singular noun + post-nominal number identifies an EXISTING numbered item, never `count=9`!
        if (len === 1 && !rawPhrase.toLowerCase().endsWith('s') && e + 1 < T) {
          const postNum = parseNumeric(tokens[e + 1]);
          if (postNum !== null && Number.isInteger(postNum) && postNum >= 1 && postNum <= 99 && !UNIT_CANON.has(tokens[e + 2]?.lower ?? '')) {
            const descSpan = src.slice(tokens[i].start, tokens[e + 1].end);
            emit({
              kind: HYP_KINDS.TARGET_SORT,
              startTok: i,
              endTok: e + 1,
              family,
              sort,
              sortWords,
              description: descSpan,
              isPostNumId: true,
              det: det !== 'none' ? det : 'definite',
              detTok,
              count: null,
              countWords: null,
              ordinal: null,
              quantifier: null,
              quantity: null,
              cost: 1.2,
            });
          }
        }

        // Also check immediate preceding modifier (count / ordinal / quantifier)
        if (i >= 1) {
          const m1 = tokens[i - 1];
          const num1 = parseNumeric(m1);
          if (num1 !== null && Number.isInteger(num1) && num1 >= 0) {
            const outerDet = checkDetBefore(i - 1);
            emit({
              kind: HYP_KINDS.TARGET_SORT,
              startTok: i - 1,
              endTok: e,
              family,
              sort,
              sortWords,
              det: outerDet.det,
              detTok: outerDet.detTok,
              count: num1,
              countWords: m1.text,
              ordinal: null,
              quantifier: null,
              quantity: null,
              cost: 1.5,
            });
          } else if (ORDINAL_MAP.has(m1.lower)) {
            const outerDet = checkDetBefore(i - 1);
            emit({
              kind: HYP_KINDS.TARGET_SORT,
              startTok: i - 1,
              endTok: e,
              family,
              sort,
              sortWords,
              det: outerDet.det,
              detTok: outerDet.detTok,
              count: null,
              countWords: null,
              ordinal: ORDINAL_MAP.get(m1.lower),
              quantifier: null,
              quantity: null,
              cost: 1.5,
            });
          } else if (QUANTIFIER_MAP.has(m1.lower) && !m1.isGrammar) {
            const outerDet = checkDetBefore(i - 1);
            emit({
              kind: HYP_KINDS.TARGET_SORT,
              startTok: i - 1,
              endTok: e,
              family,
              sort,
              sortWords,
              det: outerDet.det !== 'none' ? outerDet.det : 'quantified',
              detTok: outerDet.detTok,
              count: null,
              countWords: null,
              ordinal: null,
              quantifier: m1.text,
              quantity: QUANTIFIER_MAP.get(m1.lower),
              cost: 1.5,
            });
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // 8. TARGET_REF (pronouns, universal, journal_step, codes, proper names, quotes)
  // -------------------------------------------------------------------------
  const nominalDeterminers = new Set(rawCandidates.filter((c) =>
    [HYP_KINDS.TARGET_SORT, HYP_KINDS.TARGET_FAMILY].includes(c.kind) && c.detTok >= 0).map((c) => c.detTok));
  const referenceAt = (i) => {
    if (i >= T || tokens[i].kind !== 'word') return null;
    for (const length of [2, 1]) {
      const end = i + length - 1;
      if (end >= T || (length === 1 && nominalDeterminers.has(i))) continue;
      const pronoun = spanTextLower(tokens, i, end);
      const det = pronounRefs.get(pronoun);
      if (det) return { end, det };
    }
    return null;
  };
  for (let i = 0; i < T; i++) {
    const tok = tokens[i];

    const reference = referenceAt(i);
    if (reference) {
      emit({
        kind: HYP_KINDS.TARGET_REF,
        startTok: i,
        endTok: reference.end,
        fill: 'context',
        isPronoun: true,
        det: reference.det,
        families: tabFamilies,
        cost: 3,
      });
    }

    // Universal references (1..2 tokens)
    for (let len = 1; len <= 2 && i + len <= T; len++) {
      const e = i + len - 1;
      if (hasPunctInSpan(tokens, i, e)) break;
      const ph = spanTextLower(tokens, i, e);
      if (UNIVERSAL_REFS.has(ph)) {
        emit({
          kind: HYP_KINDS.TARGET_REF,
          startTok: i,
          endTok: e,
          fill: 'all',
          quantifier: src.slice(tokens[i].start, tokens[e].end),
          det: 'quantified',
          families: tabFamilies,
          cost: 3,
        });
      }
    }

    // Universal 3-token ("all of them", "both of them") & journal steps (2..4 tokens)
    for (let len = 2; len <= 4 && i + len <= T; len++) {
      const e = i + len - 1;
      if (hasPunctInSpan(tokens, i, e)) break;
      const ph = spanTextLower(tokens, i, e);
      if (UNIVERSAL_REFS.has(ph)) {
        emit({
          kind: HYP_KINDS.TARGET_REF,
          startTok: i,
          endTok: e,
          fill: 'all',
          quantifier: src.slice(tokens[i].start, tokens[e].end),
          det: 'quantified',
          families: tabFamilies,
          cost: 3,
        });
      }
      if (JOURNAL_STEP_PHRASES.has(ph)) {
        const { det, detTok } = checkDetBefore(i);
        emit({
          kind: HYP_KINDS.TARGET_REF,
          startTok: i,
          endTok: e,
          fill: 'journal_step',
          description: src.slice(tokens[i].start, tokens[e].end),
          det: det !== 'none' ? det : 'definite',
          detTok,
          families: tabFamilies,
          cost: 2,
        });
      }
    }

    // Spoken letter + number-word codes ("g one", "n two", "o three", "b two", "c one")
    if (
      tok.kind === 'word' &&
      /^[a-z]$/i.test(tok.text) &&
      !['a', 'i'].includes(tok.lower) &&
      i + 1 < T &&
      tokens[i + 1].kind === 'word' &&
      numberWords.has(tokens[i + 1].lower)
    ) {
      const codePrefixMap = { g: 'group', n: 'node', c: 'chart', l: 'link', b: 'block', s: 'section', o: 'drawn', p: 'part', r: 'room', m: 'meeting' };
      const prefFam = codePrefixMap[tok.lower];
      const fams = prefFam && tabFamilies.includes(prefFam) ? [prefFam] : tabFamilies;
      const spokenCode = src.slice(tok.start, tokens[i + 1].end);
      emit({
        kind: HYP_KINDS.TARGET_REF,
        startTok: i,
        endTok: i + 1,
        fill: 'written',
        name: spokenCode,
        isCode: true,
        det: 'definite',
        detTok: -1,
        families: fams,
        cost: 1.8,
      });
    }

    // Definite chart-mark plurals ("the bars", "the slices", "the markers", "the points", "the dots") select the existing chart!
    if (hasDiagramKeys && i > 0 && tokens[i - 1].lower === 'the' && ['bars', 'slices', 'markers', 'points', 'dots'].includes(tok.lower) && tabFamilies.includes('chart')) {
      emit({
        kind: HYP_KINDS.TARGET_FAMILY,
        startTok: i,
        endTok: i,
        family: 'chart',
        familyWords: tok.text,
        det: 'definite',
        detTok: i - 1,
        count: null,
        countWords: null,
        ordinal: null,
        quantifier: null,
        quantity: null,
        cost: 1.6,
      });
    }
    // "on the <noun> <chartType>" ("on the order scatter", "on the sales bar") selects an existing chart by description!
    if (
      hasDiagramKeys &&
      i >= 2 &&
      tokens[i - 2].lower === 'on' &&
      tokens[i - 1].lower === 'the' &&
      i + 1 < T &&
      tok.kind === 'word' &&
      !tok.isGrammar &&
      Boolean(vocabMatch(kb?.domain?.charts, tokens[i + 1].lower)) &&
      tabFamilies.includes('chart')
    ) {
      emit({
        kind: HYP_KINDS.TARGET_FAMILY,
        startTok: i,
        endTok: i + 1,
        family: 'chart',
        description: src.slice(tok.start, tokens[i + 1].end),
        det: 'definite',
        detTok: i - 1,
        count: null,
        countWords: null,
        ordinal: null,
        quantifier: null,
        quantity: null,
        cost: 1.2,
      });
    }
    // "turn the scene/room/picture into ..." selects `family=page`, and "surprise me with a scene ..." creates `family=composition, sort=scene`!
    if (hasDrawingKeys && i > 0 && tokens[i - 1].lower === 'the' && ['scene', 'room', 'picture', 'canvas'].includes(tok.lower) && tokens[i + 1]?.lower === 'into' && tabFamilies.includes('page')) {
      emit({
        kind: HYP_KINDS.TARGET_FAMILY,
        startTok: i - 1,
        endTok: i,
        family: 'page',
        familyWords: src.slice(tokens[i - 1].start, tok.end),
        det: 'definite',
        detTok: i - 1,
        count: null,
        countWords: null,
        ordinal: null,
        quantifier: null,
        quantity: null,
        cost: 1.0,
      });
    }
    if (hasDrawingKeys && ['scene', 'drawing', 'picture'].includes(tok.lower) && /\bsurprise\s+me\b/i.test(src) && tabFamilies.includes('composition')) {
      const { det, detTok } = checkDetBefore(i);
      emit({
        kind: HYP_KINDS.TARGET_SORT,
        startTok: i,
        endTok: i,
        family: 'composition',
        sort: 'scene',
        det: det !== 'none' ? det : 'indefinite',
        detTok,
        count: null,
        countWords: null,
        ordinal: null,
        quantifier: null,
        quantity: null,
        cost: 1.0,
      });
    }
    // Lowercase event names right after existing-event calendar verbs ("reschedule review for 10:00 UTC...", "postpone standup...")
    if (
      hasMeetingKeys &&
      i > 0 &&
      ['reschedule', 'postpone', 'delay', 'cancel'].includes(tokens[i - 1].lower) &&
      tok.kind === 'word' &&
      !tok.isGrammar &&
      !tok.isFiller
    ) {
      emit({
        kind: HYP_KINDS.TARGET_REF,
        startTok: i,
        endTok: i,
        fill: 'written',
        name: tok.text,
        isProper: true,
        det: 'definite',
        detTok: -1,
        families: ['meeting'],
        cost: 2.0,
      });
      if (tabKeys.has('meeting.id')) {
        emitConstraint('meeting.id', tok.text, i, i, { phase: 'selector', cost: 2.5 });
      }
    }

    // Code tokens (n1, o2, b2, g1, c1, a1, e2, s1, p1...)
    if (tok.kind === 'code') {
      const { det, detTok } = checkDetBefore(i);
      emit({
        kind: HYP_KINDS.TARGET_REF,
        startTok: i,
        endTok: i,
        fill: 'written',
        name: tok.text,
        ids: [tok.text],
        codeWords: tok.text,
        isCode: true,
        det,
        detTok,
        families: tabFamilies,
        cost: 2,
      });

      for (const attr of idKeys) {
        emitConstraint(attr, tok.text, i, i, { phase: 'selector', cost: 2.5 });
      }

      // Coordinated codes: "o1 and o2", "o1, o2 and o3"
      if (i + 2 < T && tokens[i + 1].lower === 'and' && tokens[i + 2].kind === 'code') {
        const ids = [tok.text, tokens[i + 2].text];
        emit({
          kind: HYP_KINDS.TARGET_REF,
          startTok: i,
          endTok: i + 2,
          fill: 'written',
          ids,
          codeWords: src.slice(tok.start, tokens[i + 2].end),
          isCode: true,
          det,
          detTok,
          families: tabFamilies,
          cost: 1.5,
        });
        for (const attr of idKeys) {
          if (attr.endsWith('.ids') || attr.endsWith('.members') || attr.endsWith('.nodes')) {
            emitConstraint(attr, ids.join(', '), i, i + 2, {
              values: ids,
              phase: 'selector',
              cost: 2,
            });
          }
        }
      }
      if (
        i + 4 < T &&
        tokens[i + 1].text === ',' &&
        tokens[i + 2].kind === 'code' &&
        tokens[i + 3].lower === 'and' &&
        tokens[i + 4].kind === 'code'
      ) {
        const ids = [tok.text, tokens[i + 2].text, tokens[i + 4].text];
        emit({
          kind: HYP_KINDS.TARGET_REF,
          startTok: i,
          endTok: i + 4,
          fill: 'written',
          ids,
          codeWords: src.slice(tok.start, tokens[i + 4].end),
          isCode: true,
          det,
          detTok,
          families: tabFamilies,
          cost: 1.2,
        });
        for (const attr of idKeys) {
          if (attr.endsWith('.ids') || attr.endsWith('.members') || attr.endsWith('.nodes')) {
            emitConstraint(attr, ids.join(', '), i, i + 4, {
              values: ids,
              phase: 'selector',
              cost: 1.8,
            });
          }
        }
      }
    }

    // Single capital letter names driven dynamically by `w.lang.en.lex` `name.letter.after` (diagram-frames.sop):
    // e.g. "connect A to C", "the arrow from A to B", "box A", "A, B and C"!
    if (
      tok.kind === 'word' &&
      /^[A-Z]$/.test(tok.text) &&
      i > 0 &&
      (nameLetterAfter.has(tokens[i - 1].lower) ||
        (tokens[i - 1].text === ',' && i >= 2 && /^[A-Z]$/.test(tokens[i - 2].text)))
    ) {
      emit({
        kind: HYP_KINDS.TARGET_REF,
        startTok: i,
        endTok: i,
        fill: 'written',
        name: tok.text,
        isProper: true,
        det: 'definite',
        detTok: -1,
        families: tabFamilies,
        cost: 3,
      });
      for (const attr of idKeys) {
        if (attr.endsWith('.id')) {
          emitConstraint(attr, tok.text, i, i, { phase: 'selector', cost: 4 });
        }
      }
    }

    // Capitalized proper names (mid-sentence, or sentence-start non-verb/non-grammar)
    // Also supports English title/sentence-case multi-word names like "Monthly goals", "Terms of service",
    // "Quote request", "Bin collection update", "Weekly shop", "Team review", "Work 4"!
    const canStartProper =
      tok.isProperCandidate ||
      (tok.kind === 'word' &&
        tok.isCapitalized &&
        tok.isSentenceStart &&
        !tok.isGrammar &&
        !tok.isFiller &&
        !isCommandVerbToken(tok, kb) &&
        !/^[A-Z]{2,}s?$/.test(tok.text));

    if (canStartProper && !tok.isTimezone) {
      const { det, detTok } = checkDetBefore(i);
      const prevIsObliquePrep = i > 0 && tokens[i - 1].kind === 'word'
        && ['on', 'in', 'at', 'to', 'from', 'with', 'for', 'by', 'into', 'onto', 'of'].includes(tokens[i - 1].lower);
      // 1..4 consecutive proper/sentence-case title tokens (or [Proper, number/numberWord] like "Work 6", "Background one", or title before family noun like "the Lab safety note section")
      for (let len = 1; len <= 4 && i + len <= T; len++) {
        const e = i + len - 1;
        if (hasPunctInSpan(tokens, i, e)) break;
        const lastTok = tokens[e];
        const followedByFamilyNoun = e + 1 < T && Boolean(mapGet(familyWords, tokens[e + 1].lower));
        if (len === 4 && !followedByFamilyNoun) break;
        const isLowerTitleWord =
          lastTok.kind === 'word' &&
          !lastTok.isGrammar &&
          !lastTok.isFiller &&
          !['containing', 'saying', 'called', 'named', 'titled', 'labelled', 'labeled', 'approximately', 'roughly', 'around', 'ahead', 'behind'].includes(lastTok.lower) &&
          !vocabMatch(kb?.domain?.colours, lastTok.lower) &&
          !SCALE_DEGREE_MAP.has(lastTok.lower) &&
          !COMPARATIVE_SPECS.has(lastTok.lower) &&
          !SPATIAL_RELATIONS.has(lastTok.lower) &&
          !TEMPORAL_RELATIONS.has(lastTok.lower) &&
          !mapGet(familyWords, lastTok.lower) &&
          (!isCommandVerbToken(lastTok, kb) || ['update', 'request', 'shop', 'review', 'plan', 'report', 'service', 'track', 'draft', 'appeal', 'note'].includes(lastTok.lower));
        const isMidConnector = len === 2 && ['of', 'by', 'per', 'over', 'across', 'vs', 'for'].includes(lastTok.lower) && i + 2 < T && tokens[i + 2].kind === 'word';
        const hasMidConnector = len >= 3 && ['of', 'by', 'per', 'over', 'across', 'vs', 'for'].includes(tokens[i + 1]?.lower ?? '');
        const validTail =
          len === 1 ||
          lastTok.isProperCandidate ||
          isLowerTitleWord ||
          isMidConnector ||
          (len === 2 && ((lastTok.kind === 'number' && !lastTok.text.includes('%')) || numberWords.has(lastTok.lower)));
        if (!validTail) break;
        if (isMidConnector) continue; // don't emit dangling "Terms of" / "Orders by", keep going to "Orders by weekday"
        const nameText = src.slice(tokens[i].start, tokens[e].end);
        const basePropCost = followedByFamilyNoun && det === 'definite'
          ? 2
          : hasMidConnector && followedByFamilyNoun
            ? 1.2
            : hasMidConnector
              ? 2.5
              : (tok.isSentenceStart ? 6 : 4) + (prevIsObliquePrep ? 15 : 0) + (len > 1 ? 1 : 0);
        emit({
          kind: HYP_KINDS.TARGET_REF,
          startTok: i,
          endTok: e,
          fill: 'written',
          name: nameText,
          isProper: true,
          det,
          detTok,
          families: hasMidConnector && tabFamilies.includes('chart') ? ['chart', ...tabFamilies.filter((f) => f !== 'chart')] : tabFamilies,
          cost: basePropCost,
        });
        for (const attr of idKeys) {
          if (attr.endsWith('.id')) {
            emitConstraint(attr, nameText, i, e, { phase: 'selector', cost: hasMidConnector ? 2.0 : basePropCost + 2 });
          }
        }
      }
      // Coordinated proper-name IDs ("Approve and Ship", "Start and Review") -> node.ids / group.ids
      if (
        hasDiagramKeys &&
        i + 2 < T &&
        tokens[i + 1].lower === 'and' &&
        tokens[i + 2].isProperCandidate
      ) {
        const ids = [tok.text, tokens[i + 2].text];
        for (const attr of idKeys) {
          if (attr.endsWith('.ids')) {
            emitConstraint(attr, ids.join(', '), i, i + 2, { values: ids, phase: 'selector', cost: 1.8 });
          }
        }
      }
    }

    // Quoted names ("Start", "Review", "nose")
    if (tok.kind === 'quote' && tok.inner) {
      const { det, detTok } = checkDetBefore(i);
      emit({
        kind: HYP_KINDS.TARGET_REF,
        startTok: i,
        endTok: i,
        fill: 'written',
        name: tok.inner,
        nameWords: tok.text,
        isQuoted: true,
        isProper: true,
        det,
        detTok,
        families: tabFamilies,
        cost: 4,
      });
    }
  }

  // -------------------------------------------------------------------------
  // 9. KEY_WORD
  // -------------------------------------------------------------------------
  for (let i = 0; i < T; i++) {
    for (let len = 1; len <= 5 && i + len <= T; len++) {
      const e = i + len - 1;
      if (hasPunctInSpan(tokens, i, e)) break;
      const forms = singularisePhrase(spanTextLower(tokens, i, e), kb);
      const attrs = new Set();
      const fams = new Set();

      for (const f of forms) {
        const hits = mapGet(keyWordIndex, f);
        for (const h of toArray(hits)) {
          if (typeof h === 'string') {
            if (tabKeys.has(h)) {
              // Avoid generic verb "place" falsely triggering catch-all page.scene
              if (f === 'place' && h === 'page.scene') continue;
              attrs.add(h);
              fams.add(tabKeys.get(h).family);
            }
          } else if (h && h.attr && tabKeys.has(h.attr)) {
            if (f === 'place' && h.attr === 'page.scene') continue;
            attrs.add(h.attr);
            fams.add(h.family ?? tabKeys.get(h.attr).family);
          }
        }
      }
      if (hasDiagramKeys && len === 1 && (tokens[i].lower === 'x' || tokens[i].lower === 'y')) {
        const axisKey = tokens[i].lower === 'x' ? 'chart.xAxis' : 'chart.axisSide';
        if (tabKeys.has(axisKey)) {
          attrs.add(axisKey);
          fams.add('chart');
        }
      }

      if (attrs.size > 0) {
        // Never treat a mid-sentence capitalized compound proper name ("Room 12", "Work 4", "Hall 2") as a bare KEY_WORD!
        const isProperNumHead = len === 1 && tokens[i].isCapitalized && !tokens[i].isSentenceStart && i + 1 < T && tokens[i + 1].kind === 'number';
        if (!isProperNumHead) {
          emit({
            kind: HYP_KINDS.KEY_WORD,
            startTok: i,
            endTok: e,
            attrs: [...attrs],
            families: [...fams],
            isNameIntro: false,
            cost: 2,
          });
        }
      }
    }

    const tok = tokens[i];
    if (tok.kind === 'word' && (NAME_INTRO_WORDS.has(tok.lower) || (i > 0 && (tokens[i - 1].text === ';' || tokens[i - 1].text === ',') && ['name', 'title', 'label'].includes(tok.lower))) && nameLikeKeys.length > 0) {
      emit({
        kind: HYP_KINDS.KEY_WORD,
        startTok: i,
        endTok: i,
        attrs: [...nameLikeKeys],
        families: [...new Set(nameLikeKeys.map((a) => tabKeys.get(a).family))],
        isNameIntro: true,
        cost: 1,
      });
    }

    // Dimension adjective key_words right after a number/unit ("67 pixels wide", "100 tall", "200 long")
    const DIM_ADJ_KEYS = { wide: ['width', 'size'], tall: ['height', 'size'], high: ['height', 'size'], long: ['length', 'duration'], thick: ['stroke', 'lineWidth', 'width'] };
    if (tok.kind === 'word' && DIM_ADJ_KEYS[tok.lower] && i > 0) {
      const dimAttrs = resolveAttrShortNames(tabKeys, DIM_ADJ_KEYS[tok.lower]);
      const followsMeasure = tokens[i - 1].kind === 'number' || UNIT_CANON.has(tokens[i - 1].lower);
      if (dimAttrs.length > 0) {
        emit({
          kind: HYP_KINDS.KEY_WORD,
          startTok: i,
          endTok: i,
          attrs: dimAttrs,
          families: [...new Set(dimAttrs.map((a) => tabKeys.get(a).family))],
          isNameIntro: false,
          cost: followsMeasure ? 0.5 : 1.5,
        });
      }
    }

    // "how <adj>" / "what <key>" question cues
    if (i > 0 && tokens[i - 1].lower === 'how' && HOW_QUESTION_KEYS.has(tok.lower)) {
      const qAttrs = resolveAttrShortNames(tabKeys, HOW_QUESTION_KEYS.get(tok.lower));
      if (qAttrs.length > 0) {
        emit({
          kind: HYP_KINDS.KEY_WORD,
          startTok: i,
          endTok: i,
          attrs: qAttrs,
          families: [...new Set(qAttrs.map((a) => tabKeys.get(a).family))],
          isNameIntro: false,
          isQuestionCue: true,
          cost: 2,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 10. CONSTRAINT
  // -------------------------------------------------------------------------
  for (let i = 0; i < T; i++) {
    const tok = tokens[i];

    // 10a. Closed-list values (1..4 tokens)
    for (let len = 1; len <= 4 && i + len <= T; len++) {
      const e = i + len - 1;
      if (hasPunctInSpan(tokens, i, e)) break;
      const lowerSpaced = spanTextLower(tokens, i, e);
      const dehyphen = lowerSpaced.replace(/-/g, ' ');
      const forms = [
        lowerSpaced,
        dehyphen,
        lowerSpaced.replace(/[\s-]+/g, '_'),
        ...singularisePhrase(lowerSpaced, kb),
        ...(dehyphen !== lowerSpaced ? singularisePhrase(dehyphen, kb) : []),
      ];
      const seenHits = new Set();
      for (const f of forms) {
        const hits = mapGet(closedValueIndex, f);
        for (const h of toArray(hits)) {
          if (!h || !h.attr || !tabKeys.has(h.attr)) continue;
          const hk = `${h.attr}|${h.value}`;
          if (seenHits.has(hk)) continue;
          seenHits.add(hk);
          // Give drawn.base/drawn.preset higher prior cost than TARGET_SORT unless bound by KEY_WORD (preset/kind),
          // and give capitalized proper-name tokens higher cost on lowercase closed-list homonyms (e.g. "Power" vs chart.tickFormat=power).
          // Generic boolean/toggle words ("show", "hide", "on", "off", "yes", "no", "true", "false", "none") MUST bind a KEY_WORD!
          const GENERIC_TOGGLE_VALS = new Set(['show', 'hide', 'on', 'off', 'yes', 'no', 'true', 'false', 'none']);
          const needsToggleKw = (len === 1 && GENERIC_TOGGLE_VALS.has(String(h.value).toLowerCase()))
            || h.attr === 'chart.gridAxis';
          let closedCost = len > 1 ? 2 : 4;
          if (h.attr === 'drawn.base' || h.attr === 'drawn.preset') closedCost = 9;
          else if (h.attr === 'drawn.at') closedCost = len > 1 ? 1.5 : 3;
          else if (h.attr === 'drawn.edge' || h.attr === 'drawn.side' || h.attr === 'drawn.facing') closedCost = 6.5;
          else if (h.attr === 'link.tail' || h.attr === 'link.head' || h.attr === 'part.value' || h.attr === 'part.variant' || h.attr === 'diagram.by') closedCost = 9;
          if (len === 1 && tokens[i].isProperCandidate && !['UTC', 'GMT'].includes(tokens[i].text)) closedCost += 8;
          // Intensifier adverbs ("right next to", "right on", "right above", "down at the bottom", "up at the top")
          // are NOT standalone region `at=right` or `direction=down/up`!
          if (
            len === 1 &&
            ((tokens[i].lower === 'right' && i + 1 < T && ['next', 'on', 'above', 'below', 'under', 'behind', 'beside', 'in', 'at'].includes(tokens[i + 1].lower)) ||
              (tokens[i].lower === 'down' && i + 3 < T && tokens[i + 1].lower === 'at' && tokens[i + 2].lower === 'the' && tokens[i + 3].lower === 'bottom') ||
              (tokens[i].lower === 'up' && i + 3 < T && tokens[i + 1].lower === 'at' && tokens[i + 2].lower === 'the' && tokens[i + 3].lower === 'top'))
          ) {
            closedCost = 18;
          }
          emitConstraint(h.attr, h.value, i, e, {
            requiresKeyWord: needsToggleKw,
            valueEvidence: true,
            cost: closedCost,
          });
        }
      }
    }

    // 10b. Colours (+ optional shade prefix like "dark blue", "light green")
    for (let len = 1; len <= 2 && i + len <= T; len++) {
      const e = i + len - 1;
      if (hasPunctInSpan(tokens, i, e)) break;
      const isShade =
        COLOUR_SHADES.has(tokens[i].lower) ||
        Boolean(vocabMatch(kb?.domain?.shades, tokens[i].lower));
      if (len === 2 && !isShade) continue;
      const tailColour =
        vocabMatch(kb?.domain?.colours, tokens[e].lower) ??
        (tokens[e].lower === 'blonde' ? vocabMatch(kb?.domain?.colours, 'blond') : null);
      if (tailColour) {
        const val = len === 2 ? `${tokens[i].lower} ${tailColour}` : tailColour;
        for (const attr of colourKeys) {
          const shortKey = attr.split('.').slice(1).join('.');
          // Secondary colour keys (titleColour, barEdgeColour, textColour, outline, gradient, highlight_colour)
          // require or strongly prefer their explicit KEY_WORD unless plain colour/color!
          const isPrimaryColour = shortKey === 'colour' || shortKey === 'color';
          const isGradientContext = shortKey === 'gradient' && (
            (i > 0 && ['fade', 'fading', 'gradient', 'blend', 'blending'].includes(tokens[i - 1].lower)) ||
            (i > 1 && tokens[i - 1].lower === 'to' && ['fade', 'fading', 'gradient', 'blend', 'blending'].includes(tokens[i - 2].lower))
          );
          emitConstraint(attr, val, i, e, {
            requiresKeyWord: !isPrimaryColour && ['titleColour', 'barEdgeColour', 'textColour', 'gradient', 'highlight_colour'].includes(shortKey),
            valueEvidence: true,
            cost: isGradientContext ? 1.2 : isPrimaryColour ? (len === 2 ? 3 : 4) : 8,
          });
        }
      }
    }

    // 10c. Scales, Degrees & Comparatives (including degree adverb + comparative)
    // Scale degrees (1..2 tokens)
    for (let len = 1; len <= 2 && i + len <= T; len++) {
      const e = i + len - 1;
      if (hasPunctInSpan(tokens, i, e)) break;
      const ph = spanTextLower(tokens, i, e);
      const isAcknowledgmentFine = ph === 'fine' && !(e + 1 < T && tokens[e + 1].kind === 'word' && !tokens[e + 1].isGrammar);
      const scaleHit = isAcknowledgmentFine ? null : (SCALE_DEGREE_MAP.get(ph) ?? vocabMatch(kb?.domain?.scales, ph));
      if (scaleHit) {
        // Guard: when a word is ALSO a face/skin colour ("pale", "light") right next to a body part or colour slot, keep scale cost higher so part.colour wins!
        // Also guard "the default" (standing preference scope) from firing drawn.size=default!
        const alsoFaceColour = ['pale', 'light'].includes(ph) && Boolean(vocabMatch(kb?.domain?.colours, ph));
        const isTheDefault = ph === 'default' && i > 0 && tokens[i - 1].lower === 'the';
        for (const attr of resolveAttrShortNames(tabKeys, ['size', 'length'])) {
          emitConstraint(attr, scaleHit, i, e, { operator: 'degree', cost: isTheDefault ? 14 : alsoFaceColour ? 6.5 : (len === 2 ? 1.5 : 2) });
        }
        for (const attr of resolveAttrShortNames(tabKeys, ['markerSize', 'fontSize', 'barGap', 'gap', 'barWidth'])) {
          emitConstraint(attr, scaleHit, i, e, { operator: 'degree', requiresKeyWord: true, allowOpen: true, cost: 1 });
        }
      }
    }

    // Comparatives with optional degree adverb ("a lot bigger", "much tinier", "a bit shorter", "a bit later")
    const kbComp = mapGet(kb?.domain?.comparatives, tok.lower);
    if (tok.kind === 'word' && (COMPARATIVE_SPECS.has(tok.lower) || kbComp)) {
      const spec =
        COMPARATIVE_SPECS.get(tok.lower) ??
        {
          dir: kbComp?.way === 'less' ? 'less' : 'more',
          targets: kbComp?.scale ? [kbComp.scale, 'size'] : ['size'],
        };
      const step = spec.dir === 'less' ? 'less' : 'more';
      const targetAttrs = resolveAttrShortNames(tabKeys, spec.targets);
      for (const attr of targetAttrs) {
        const shortK = attr.split('.').slice(1).join('.');
        const needsSubKw = SUBPART_KEY_REQUIRED_SHORTS.has(shortK);
        const isPrimary = shortK === spec.targets[0] || shortK === 'size';
        emitConstraint(attr, '', i, i, {
          operator: 'delta',
          step,
          requiresKeyWord: needsSubKw,
          cost: needsSubKw ? 0.5 : isPrimary ? 1.5 : 5,
        });
      }
    }
    for (let advLen = 1; advLen <= 2 && i + advLen < T; advLen++) {
      const advEnd = i + advLen - 1;
      if (hasPunctInSpan(tokens, i, advEnd + 1)) break;
      const advPh = spanTextLower(tokens, i, advEnd);
      const strength = DEGREE_ADVERBS.get(advPh);
      if (!strength) continue;
      const compTok = tokens[advEnd + 1];
      const kbAdvComp = mapGet(kb?.domain?.comparatives, compTok.lower);
      const spec =
        COMPARATIVE_SPECS.get(compTok.lower) ??
        (kbAdvComp
          ? {
              dir: kbAdvComp.way === 'less' ? 'less' : 'more',
              targets: kbAdvComp.scale ? [kbAdvComp.scale, 'size'] : ['size'],
            }
          : null);
      if (spec) {
        const step =
          spec.dir === 'less'
            ? strength === 'strong'
              ? 'much_less'
              : 'less'
            : strength === 'strong'
              ? 'much_more'
              : 'more';
        for (const attr of resolveAttrShortNames(tabKeys, spec.targets)) {
          const shortK = attr.split('.').slice(1).join('.');
          const needsSubKw = SUBPART_KEY_REQUIRED_SHORTS.has(shortK);
          const isPrimary = shortK === spec.targets[0] || shortK === 'size';
          emitConstraint(attr, '', i, advEnd + 1, {
            operator: 'delta',
            step,
            requiresKeyWord: needsSubKw,
            cost: needsSubKw ? 0.5 : isPrimary ? 1 : 4.5,
          });
        }
      }
    }
    // Multiplicative comparatives: "twice as big", "half as wide"
    if (i + 2 < T && ['twice', 'half'].includes(tok.lower) && tokens[i + 1].lower === 'as') {
      const factorVal = tok.lower === 'twice' ? '2' : '0.5';
      for (const attr of resolveAttrShortNames(tabKeys, ['size', 'scale', 'width', 'height', 'length'])) {
        emitConstraint(attr, factorVal, i, i + 2, { operator: 'factor', cost: 1.5 });
      }
    }

    // 10d. Spatial & Temporal Relations (1..5 tokens) — dynamically from w.lang.en/prepositions.sop + hand-joins.sop!
    for (let len = 1; len <= 5 && i + len <= T; len++) {
      const e = i + len - 1;
      if (hasPunctInSpan(tokens, i, e)) break;
      const ph = spanTextLower(tokens, i, e);
      const spRel = spatialRels.get(ph);
      const tmRel = temporalRels.get(ph);
      if (spRel || tmRel) {
        for (const attr of relationKeys) {
          const isTemporalAttr = attr === 'meeting.relation' || attr === 'section.order';
          const relVal = isTemporalAttr ? tmRel ?? spRel : spRel ?? tmRel;
          if (!relVal) continue;
          // Restrict section.order / meeting.relation to values valid for that key if closed
          const spec = tabKeys.get(attr);
          if (spec.values && !spec.values.has(relVal)) continue;
          // After transformation verbs ("turn X into Y", "change X into Y"), "into" is a resultative marker, not spatial `in`!
          const isResultativeInto = ph === 'into' && tokens.slice(Math.max(0, i - 4), i).some((t) => ['turn', 'turns', 'turned', 'turning', 'change', 'make', 'convert'].includes(t.lower));
          if (isResultativeInto) continue;
          emitConstraint(attr, relVal, i, e, {
            operator: 'relation',
            on: 'place',
            phase: 'result',
            needsAnchor: true,
            // In diagram tab, "by" almost always marks chart.dimension/colourBy rather than node.position=near!
            cost: (hasDiagramKeys && ph === 'by') ? 7 : (len > 1 ? 1.5 : 2.5),
          });
        }
      }
    }

    // 10e. Coordinates (atomic "260,180" OR "[number, ',', number]")
    if (tok.kind === 'coord') {
      for (const fam of coordFamilies) {
        emitConstraint(`${fam}.x`, tok.coordX, i, i, {
          on: 'place',
          pairedConstraints: [
            { attribute: `${fam}.x`, value: tok.coordX, on: 'place' },
            { attribute: `${fam}.y`, value: tok.coordY, on: 'place' },
          ],
          cost: 1,
        });
      }
    } else if (
      tok.kind === 'number' &&
      i + 2 < T &&
      tokens[i + 1].text === ',' &&
      tokens[i + 2].kind === 'number'
    ) {
      const cx = tok.text;
      const cy = tokens[i + 2].text;
      for (const fam of coordFamilies) {
        emitConstraint(`${fam}.x`, cx, i, i + 2, {
          on: 'place',
          pairedConstraints: [
            { attribute: `${fam}.x`, value: cx, on: 'place' },
            { attribute: `${fam}.y`, value: cy, on: 'place' },
          ],
          cost: 1.5,
        });
      }
    } else if (
      tok.kind === 'number' &&
      i + 1 < T &&
      tokens[i + 1].kind === 'number' &&
      Number(tok.text) >= 10 &&
      Number(tokens[i + 1].text) >= 10
    ) {
      // Bare space-separated integer pair ("260 400", "400 30") -> (width, height) or (x, y)
      const n1 = tok.text;
      const n2 = tokens[i + 1].text;
      for (const fam of coordFamilies) {
        emitConstraint(`${fam}.x`, n1, i, i + 1, {
          on: 'place',
          pairedConstraints: [
            { attribute: `${fam}.x`, value: n1, on: 'place' },
            { attribute: `${fam}.y`, value: n2, on: 'place' },
          ],
          cost: 2.5,
        });
        if (tabKeys.has(`${fam}.width`) && tabKeys.has(`${fam}.height`)) {
          emitConstraint(`${fam}.width`, n1, i, i + 1, {
            on: 'attribute',
            pairedConstraints: [
              { attribute: `${fam}.width`, value: n1, on: 'attribute' },
              { attribute: `${fam}.height`, value: n2, on: 'attribute' },
            ],
            cost: 2,
          });
        }
      }
    } else if (
      tok.kind === 'number' &&
      i + 2 < T &&
      ['by', 'x'].includes(tokens[i + 1].lower) &&
      tokens[i + 2].kind === 'number'
    ) {
      // Dimension pair ("400 by 30", "400 x 30") -> (width, height)
      const wVal = tok.text;
      const hVal = tokens[i + 2].text;
      for (const fam of tabFamilies.length ? tabFamilies : coordFamilies) {
        if (tabKeys.has(`${fam}.width`) && tabKeys.has(`${fam}.height`)) {
          emitConstraint(`${fam}.width`, wVal, i, i + 2, {
            on: 'attribute',
            pairedConstraints: [
              { attribute: `${fam}.width`, value: wVal, on: 'attribute' },
              { attribute: `${fam}.height`, value: hVal, on: 'attribute' },
            ],
            cost: 1.5,
          });
        }
      }
    }

    // 10f. Numbers & Number+Unit (including multi-word compound numbers like "four hundred", "twenty five", "two spaces left", and chart lists)
    if (hasDiagramKeys && tok.kind === 'number' && tabKeys.has('chart.values') && i + 2 < T && tokens[i + 1].text === ',' && tokens[i + 2].kind === 'number') {
      let endIdx = i + 2;
      while (endIdx + 2 < T && tokens[endIdx + 1].text === ',' && tokens[endIdx + 2].kind === 'number') {
        endIdx += 2;
      }
      const listVal = src.slice(tok.start, tokens[endIdx].end);
      emitConstraint('chart.values', listVal, i, endIdx, { cost: 1.5 });
    }
    // Chart inline label=value pairs ("A is 3, B is 7") and comma-separated category lists ("October,November,December")
    if (hasDiagramKeys && i + 5 < T && tok.kind === 'word' && ['is', 'are', '='].includes(tokens[i + 1].lower) && tokens[i + 2].kind === 'number' && tokens[i + 3].text === ',' && tokens[i + 4].kind === 'word' && ['is', 'are', '='].includes(tokens[i + 5].lower)) {
      const pairs = [];
      let cur = i;
      while (cur + 2 < T && tokens[cur].kind === 'word' && ['is', 'are', '='].includes(tokens[cur + 1].lower) && tokens[cur + 2].kind === 'number') {
        pairs.push({ lbl: tokens[cur].text, val: tokens[cur + 2].text, end: cur + 2 });
        if (cur + 3 < T && (tokens[cur + 3].text === ',' || tokens[cur + 3].lower === 'and')) cur += 4;
        else break;
      }
      if (pairs.length >= 2 && tabKeys.has('chart.labels') && tabKeys.has('chart.values')) {
        const endPair = pairs[pairs.length - 1].end;
        const paired = [
          ...pairs.map((p) => ({ attribute: 'chart.labels', value: p.lbl, on: 'attribute' })),
          ...pairs.map((p) => ({ attribute: 'chart.values', value: p.val, on: 'attribute' })),
        ];
        emitConstraint('chart.labels', pairs[0].lbl, i, endPair, { pairedConstraints: paired, cost: 1 });
      }
    }
    if (hasDiagramKeys && tabKeys.has('chart.labels') && tok.kind === 'word' && tok.isCapitalized && i + 4 < T && tokens[i + 1].text === ',' && tokens[i + 2].kind === 'word' && tokens[i + 2].isCapitalized && tokens[i + 3].text === ',' && tokens[i + 4].kind === 'word' && tokens[i + 4].isCapitalized) {
      let endCat = i + 4;
      while (endCat + 2 < T && tokens[endCat + 1].text === ',' && tokens[endCat + 2].kind === 'word' && tokens[endCat + 2].isCapitalized) {
        endCat += 2;
      }
      emitConstraint('chart.labels', src.slice(tok.start, tokens[endCat].end), i, endCat, { cost: 1.5 });
    }

    // Compound English multi-word numbers ("four hundred" = 400, "twenty five" = 25, "two hundred and fifty" = 250)
    let compoundValue = null;
    let compoundEnd = i;
    if (tok.kind === 'word' && (numberWords.has(tok.lower) || tok.lower === 'a') && i + 1 < T && tokens[i + 1].kind === 'word') {
      const n0 = tok.lower === 'a' ? 1 : numberWords.get(tok.lower);
      const n1 = numberWords.get(tokens[i + 1].lower);
      if (n0 >= 1 && n0 <= 19 && tokens[i + 1].lower === 'hundred') {
        compoundValue = n0 * 100;
        compoundEnd = i + 1;
        if (i + 2 < T && tokens[i + 2].lower === 'and' && i + 3 < T && numberWords.has(tokens[i + 3].lower)) {
          compoundValue += numberWords.get(tokens[i + 3].lower);
          compoundEnd = i + 3;
        } else if (i + 2 < T && numberWords.has(tokens[i + 2].lower) && numberWords.get(tokens[i + 2].lower) < 100) {
          compoundValue += numberWords.get(tokens[i + 2].lower);
          compoundEnd = i + 2;
        }
      } else if (n0 >= 20 && n0 <= 90 && n0 % 10 === 0 && n1 >= 1 && n1 <= 9) {
        compoundValue = n0 + n1;
        compoundEnd = i + 1;
      }
      if (compoundValue !== null) {
        const hasApprox = i > 0 && ['about', 'around', 'roughly', 'approximately'].includes(tokens[i - 1].lower);
        const startC = hasApprox ? i - 1 : i;
        for (const attr of resolveAttrShortNames(tabKeys, ['size', 'width', 'height', 'words', 'distance'])) {
          const sk = attr.split('.').slice(1).join('.');
          emitConstraint(attr, String(compoundValue), startC, compoundEnd, {
            requiresKeyWord: !['size', 'distance'].includes(sk),
            cost: sk === 'size' ? 2 : 4.5,
          });
        }
      }
    }

    // Grid/step movement grade ("two spaces left", "3 steps up") -> distanceGrade + direction
    if ((tok.kind === 'number' || numberWords.has(tok.lower)) && i + 1 < T && ['space', 'spaces', 'step', 'steps', 'square', 'squares'].includes(tokens[i + 1].lower)) {
      if (tabKeys.has('drawn.distanceGrade')) {
        emitConstraint('drawn.distanceGrade', src.slice(tok.start, tokens[i + 1].end), i, i + 1, { allowOpen: true, cost: 1.2 });
      }
    }

    const isArticleUnit = tok.kind === 'word' && (tok.lower === 'a' || tok.lower === 'an') && i + 1 < T && UNIT_CANON.has(tokens[i + 1].lower);
    const numVal = isArticleUnit ? 1 : parseNumeric(tok);
    if (numVal !== null || compoundValue !== null) {
      // Check an atomic or compound number followed by a unit.
      let matchedUnit = false;
      const unitTok = compoundEnd + 1;
      if (unitTok < T && UNIT_CANON.has(tokens[unitTok].lower)) {
        const unit = UNIT_CANON.get(tokens[unitTok].lower);
        const quantity = compoundValue ?? numVal;
        const mWords = src.slice(tok.start, tokens[unitTok].end);
        const isDurationFor = i > 0 && ['for', 'of'].includes(tokens[i - 1].lower);
        const isShiftTrail = unitTok + 1 < T && ['later', 'earlier', 'ahead', 'back', 'forward'].includes(tokens[unitTok + 1].lower);
        let unitTargets = [];
        if (['minute', 'hour'].includes(unit)) {
          unitTargets = isShiftTrail ? ['shift', 'length', 'duration'] : isDurationFor ? ['length', 'duration'] : ['length', 'duration', 'shift'];
        } else if (unit === 'second') unitTargets = ['duration', 'length'];
        else if (unit === 'degree') unitTargets = ['rotation', 'skew'];
        else if (unit === 'word') unitTargets = ['words'];
        else if (unit === 'chapter') unitTargets = ['chapters'];
        else if (unit === 'bin') unitTargets = ['bins'];
        else if (unit === 'row') unitTargets = ['rows'];
        else if (unit === 'column') unitTargets = ['columns'];
        else if (unit === 'seat') unitTargets = ['seats', 'capacity'];
        else if (unit === 'level') unitTargets = ['level', 'contourLevels'];
        else if (unit === 'decimal') unitTargets = ['precision'];
        else if (unit === 'percent') unitTargets = ['scale', 'size', 'opacity', 'width', 'height'];
        else if (['pixel', 'inch', 'cm', 'mm'].includes(unit)) {
          unitTargets = ['width', 'height', 'size', 'distance', 'offset', 'stroke', 'x', 'y'];
        }
        const attrs = resolveAttrShortNames(tabKeys, unitTargets);
        const APPROX_WORDS = new Set(['approximately', 'roughly', 'around', 'about']);
        const hasApproxBefore = i > 0 && tokens[i - 1].kind === 'word' && APPROX_WORDS.has(tokens[i - 1].lower);
        for (const attr of attrs) {
          matchedUnit = true;
          const shortK = attr.split('.').slice(1).join('.');
          const unitCost = shortK === 'shift' && !isShiftTrail ? 6
            : shortK === 'length' ? 1.5
            : shortK === 'duration' ? 3
            : 2;
          emitConstraint(attr, String(quantity), i, unitTok, {
            measure: quantity,
            unit,
            measureWords: mWords,
            requiresKeyWord: false,
            cost: unitCost,
          });
          if (hasApproxBefore) {
            emitConstraint(attr, String(quantity), i - 1, unitTok, {
              measure: quantity,
              unit,
              measureWords: src.slice(tok.start, tokens[compoundEnd].end),
              character: 'preference',
              requiresKeyWord: false,
              cost: unitCost - 0.5,
            });
          }
        }
      }

      // Calendar "at 3" -> meeting.time / meeting.start, and "for 1" -> meeting.length
      if (hasMeetingKeys && i > 0 && tokens[i - 1].lower === 'at' && tok.kind === 'number' && numVal >= 0 && numVal <= 24) {
        if (tabKeys.has('meeting.time')) emitConstraint('meeting.time', tok.text, i, i, { cost: 2 });
        if (tabKeys.has('meeting.start')) emitConstraint('meeting.start', tok.text, i, i, { cost: 2.5 });
      }
      if (hasMeetingKeys && i > 0 && tokens[i - 1].lower === 'for' && tok.kind === 'number' && !matchedUnit && numVal > 0 && numVal <= 12) {
        if (tabKeys.has('meeting.length')) emitConstraint('meeting.length', tok.text, i, i, { cost: 2 });
      }

      // Coordinated / indexed integer IDs right after a named entity or comma/and list:
      // e.g., "sections Intro, 2 and 3", "blocks Intro 2,3", "part Intro, row 2"
      if (tok.kind === 'number' && Number.isInteger(numVal) && numVal >= 1 && numVal <= 99 && i >= 2) {
        const p1 = tokens[i - 1];
        const p2 = tokens[i - 2];
        const afterNamedList =
          (p1.text === ',' || p1.lower === 'and') &&
          (p2.isProperCandidate || p2.kind === 'number' || p2.kind === 'code');
        if (afterNamedList) {
          for (const attr of idKeys) {
            if (attr.endsWith('.id')) {
              emitConstraint(attr, tok.text, i, i, { phase: 'selector', cost: 2.5 });
            }
          }
        }
      }

      // Bare number constraints for number keys on the tab (NEVER allow bare word "pair"/"one" as x/y coordinates!)
      if (numVal !== null && (!matchedUnit || tok.kind === 'number')) {
        const isFractionalUnit = tok.kind === 'number' && numVal > 0 && numVal <= 1 && tok.text.includes('.');
        const isPartIndex = i > 0 && tokens[i - 1].lower === 'part' && Number.isInteger(numVal);
        if (isPartIndex && tabKeys.has('part.index')) {
          emitConstraint('part.index', String(numVal), i, i, { requiresKeyWord: false, cost: 1.5 });
        }
        const prevAxisTok = i > 0 && ['x', 'y'].includes(tokens[i - 1].lower) ? tokens[i - 1].lower : null;
        for (const attr of numberKeys) {
          const shortKey = attr.split('.').slice(1).join('.');
          const isInt = Number.isInteger(numVal);
          // Prevent swapped coordinates on "with y 80 and x 120": right after 'y', never bind 'x' (and vice versa)!
          if (prevAxisTok && (shortKey === 'x' || shortKey === 'y') && shortKey !== prevAxisTok) continue;
          // Bare distance ("move it 40") only for digit numbers NOT preceding an adjective/noun phrase (never bare word "one" in "except one"!)
          const nextIsModOrNoun = i + 1 < T && tokens[i + 1].kind === 'word' && !tokens[i + 1].isGrammar && !tokens[i + 1].isPunct && !UNIT_CANON.has(tokens[i + 1].lower);
          const allowBare = (['values', 'value'].includes(shortKey))
            || (isInt && shortKey === 'count' && numVal >= 1 && numVal <= 20)
            || (isInt && ['level', 'bins', 'index'].includes(shortKey) && numVal >= 1 && numVal <= 50)
            || (isInt && shortKey === 'distance' && tok.kind === 'number' && !nextIsModOrNoun)
            || (isFractionalUnit && ['barWidth', 'opacity', 'scale', 'pieRadius', 'labelPosition'].includes(shortKey));
          const bareCost = isFractionalUnit && shortKey === 'barWidth' ? 2
            : shortKey === 'count' ? (nextIsModOrNoun ? 2 : 2.5)
            : shortKey === 'distance' ? 6
            : 6;
          const axisBoost = prevAxisTok && shortKey === prevAxisTok ? 0.5 : null;
          emitConstraint(attr, String(numVal), i, i, {
            requiresKeyWord: !allowBare,
            cost: axisBoost ?? (allowBare ? bareCost : 4),
          });
        }
      }
    }

    // 10g. Dates, Times, Timezones (calendar & page.time)
    if (tok.kind === 'date' && tabKeys.has('meeting.day')) {
      emitConstraint('meeting.day', tok.text, i, i, { cost: 1 });
    }
    if (tok.kind === 'word' && (WEEKDAYS.has(tok.lower) || RELATIVE_DAYS.has(tok.lower))) {
      if (tabKeys.has('meeting.day')) {
        emitConstraint('meeting.day', tok.lower, i, i, { cost: 1.5 });
      }
      if (i > 0 && DAY_MODIFIERS.has(tokens[i - 1].lower) && tabKeys.has('meeting.day')) {
        emitConstraint('meeting.day', `${tokens[i - 1].lower} ${tok.lower}`, i - 1, i, { cost: 1 });
      }
    }

    if (tok.kind === 'time') {
      const hasEndPrep = i > 0 && ['to', 'until', 'till'].includes(tokens[i - 1].lower);
      if (tabKeys.has('meeting.time')) {
        emitConstraint('meeting.time', tok.text, i, i, { cost: hasEndPrep ? 3 : 1.5 });
      }
      if (tabKeys.has('meeting.end')) {
        emitConstraint('meeting.end', tok.text, i, i, { cost: hasEndPrep ? 1 : 3.5 });
      }
    } else if (tok.kind === 'number' && i + 1 < T && ['am', 'pm'].includes(tokens[i + 1].lower)) {
      const tVal = src.slice(tok.start, tokens[i + 1].end);
      const hasEndPrep = i > 0 && ['to', 'until', 'till'].includes(tokens[i - 1].lower);
      if (tabKeys.has('meeting.time')) {
        emitConstraint('meeting.time', tVal, i, i + 1, { cost: hasEndPrep ? 3 : 1.5 });
      }
      if (tabKeys.has('meeting.end')) {
        emitConstraint('meeting.end', tVal, i, i + 1, { cost: hasEndPrep ? 1 : 3.5 });
      }
    }

    for (let len = 1; len <= 3 && i + len <= T; len++) {
      const e = i + len - 1;
      if (hasPunctInSpan(tokens, i, e)) break;
      const ph = spanTextLower(tokens, i, e);
      const time = TIME_OF_DAY_PHRASES.get(ph);
      if (time && tabKeys.has('meeting.time')) emitConstraint('meeting.time', time, i, e, { cost: 1.5 });
      if (tabKeys.has('page.time')) {
        const pageTime = time ?? vocabMatch(kb?.domain?.time?.partsOfDay, ph);
        if (pageTime) emitConstraint('page.time', pageTime, i, e, { cost: 2 });
      }
    }

    if (tok.isTimezone && tabKeys.has('meeting.timezone')) {
      emitConstraint('meeting.timezone', tok.text, i, i, { cost: 1 });
    }

    // 10h-0. Official w.lang.en/shards/hand-arrangements.sop phrases (100% generic across any world with layout/arrangement keys!)
    if (kb?.grammar?.arrangements?.size) {
      for (let len = 1; len <= 4 && i + len <= T; len++) {
        const e = i + len - 1;
        if (hasPunctInSpan(tokens, i, e)) break;
        const ph = spanTextLower(tokens, i, e);
        const arrSpec = kb.grammar.arrangements.get(ph);
        if (!arrSpec) continue;
        const candVals = [arrSpec.layout, arrSpec.diagramLayout, arrSpec.direction].filter(Boolean);
        for (const [attr, spec] of tabKeys) {
          const sk = attr.split('.').slice(1).join('.');
          if (!['arrangement', 'layout', 'direction', 'compare', 'gap', 'spacing'].includes(sk)) continue;
          for (const cv of candVals) {
            const normCv = cv === 'ring' && spec.values?.has('circle') ? 'circle' : cv;
            if (!spec.values || spec.values.has(normCv.toLowerCase())) {
              emitConstraint(attr, normCv, i, e, { cost: len > 1 ? 1.5 : 2.5 });
              break;
            }
          }
        }
      }
    }

    // 10h. Domain knowledge values per tab
    for (let len = 1; len <= 3 && i + len <= T; len++) {
      const e = i + len - 1;
      if (hasPunctInSpan(tokens, i, e)) break;
      const ph = spanTextLower(tokens, i, e);
      const forms = singularisePhrase(ph, kb);

      if (hasDrawingKeys) {
        if (ph === 'drop shadow' || ph === 'shadow') {
          if (tabKeys.has('drawn.effect')) emitConstraint('drawn.effect', 'shadow', i, e, { cost: 1.5 });
          if (tabKeys.has('part.effect')) emitConstraint('part.effect', 'shadow', i, e, { cost: 1.5 });
        }
        if (/^(looking|facing) (left|right|up|down|forward|back)$/.test(ph)) {
          const dir = ph.split(' ')[1];
          if (tabKeys.has('drawn.facing')) emitConstraint('drawn.facing', dir, i, e, { cost: 1.5 });
        }
        if (len === 1 && tabKeys.has('drawn.pose')) {
          const POSE_BASE = { run: 'running', walk: 'walking', sit: 'sitting', stand: 'standing', jump: 'jumping', wave: 'waving', dance: 'dancing', sleep: 'sleeping', fly: 'flying', swim: 'swimming' };
          // Guard: "stand 120 in height" is a copular measure verb, not drawn.pose=standing!
          const isMeasureStand = ph === 'stand' && i + 1 < T && tokens[i + 1].kind === 'number';
          if (POSE_BASE[ph] && !isMeasureStand) emitConstraint('drawn.pose', POSE_BASE[ph], i, e, { cost: 2 });
        }
        // Dynamic poses, traits, and expressions from `k.faces`!
        const poseHit = vocabMatch(kb?.domain?.poses, ph);
        if (poseHit && tabKeys.has('drawn.pose')) {
          emitConstraint('drawn.pose', poseHit, i, e, { allowOpen: poseHit === 'lying down', cost: len > 1 ? 1.2 : 2 });
        }
        const traitHit = vocabMatch(kb?.domain?.traits, ph);
        if (traitHit && tabKeys.has('drawn.trait')) {
          emitConstraint('drawn.trait', traitHit, i, e, { cost: len > 1 ? 1.5 : 2.5 });
        }
        const exprHit = vocabMatch(kb?.domain?.expressions, ph);
        if (exprHit && tabKeys.has('drawn.expression')) {
          emitConstraint('drawn.expression', exprHit, i, e, { cost: len > 1 ? 1.5 : 2 });
        }
        // Scene container header ("the full kitchen picture", "the harbour scene") -> page.scene!
        if (len >= 2 && ['picture', 'drawing', 'scene', 'canvas'].includes(tokens[e].lower) && tabKeys.has('page.scene')) {
          const scWord = tokens.slice(i, e).find((t) => vocabMatch(kb?.domain?.scenes, t.lower));
          if (scWord) {
            const detB = checkDetBefore(i);
            const sIdx = detB.detTok >= 0 ? detB.detTok : i;
            emitConstraint('page.scene', vocabMatch(kb?.domain?.scenes, scWord.lower), sIdx, e, { cost: 1.2 });
          }
        }
        // "with a <adj> face" -> drawn.expression=<adj> (open_value allowed when bound to `face`!)
        if (len === 1 && i >= 2 && i + 1 < T && tokens[i - 2].lower === 'with' && ['a', 'an'].includes(tokens[i - 1].lower) && tokens[i + 1].lower === 'face' && tabKeys.has('drawn.expression')) {
          emitConstraint('drawn.expression', tok.lower, i, i, { allowOpen: true, requiresKeyWord: true, cost: 1.2 });
        }
        // "<adj> composition" ("centred composition", "symmetrical composition") -> page.composition
        if (len === 2 && tokens[e].lower === 'composition' && tabKeys.has('page.composition')) {
          emitConstraint('page.composition', src.slice(tokens[i].start, tokens[e].end), i, e, { cost: 1.4 });
        }
        // "that has [a] [<adj>]* <noun>" in random scene compositions ("surprise me with a scene that has a red car") -> composition.with=<noun>
        if (len === 1 && tabKeys.has('composition.with') && /\bsurprise\s+me\b/i.test(src) && i >= 2 && ['has', 'with'].includes(tokens[i - 1]?.lower ?? '')) {
          let headIdx = i;
          if (DET_MAP.has(tokens[headIdx]?.lower ?? '')) headIdx++;
          while (headIdx + 1 < T && tokens[headIdx + 1].kind === 'word' && !tokens[headIdx + 1].isGrammar && !SPATIAL_RELATIONS.has(tokens[headIdx + 1].lower)) {
            headIdx++;
          }
          if (headIdx < T && tokens[headIdx].kind === 'word') {
            emitConstraint('composition.with', singulariseNoun(tokens[headIdx].lower, kb)[0] ?? tokens[headIdx].lower, i, headIdx, { cost: 1.2 });
          }
        }
        // Deadjectival -ier / -y / -en material modifiers ("stonier" -> stone, "wooden" -> wood, "golden" -> gold, "sandy" -> sand, "rocky" -> rock, "icy" -> ice, "metallic" -> metal)
        if (len === 1 && tabKeys.has('drawn.material')) {
          const MAT_DERIV = new Map([
            ['stonier', 'stone'], ['stony', 'stone'], ['rockier', 'rock'], ['rocky', 'rock'],
            ['sandier', 'sand'], ['sandy', 'sand'], ['icier', 'ice'], ['icy', 'ice'],
            ['grassier', 'grass'], ['grassy', 'grass'], ['wooden', 'wood'], ['woodier', 'wood'], ['woody', 'wood'],
            ['golden', 'gold'], ['metallic', 'metal'], ['glassy', 'glass'], ['rustier', 'rust'], ['rusty', 'rust'],
          ]);
          const matVal = MAT_DERIV.get(tok.lower);
          if (matVal) emitConstraint('drawn.material', matVal, i, i, { allowOpen: true, cost: 1.8 });
        }
        for (const f of forms) {
          const sc = vocabMatch(kb?.domain?.scenes, f);
          // Guard: "two spaces left" is a movement step, and "turn the scene/room into ..." or "surprise me with a scene" is not `page.scene=scene`!
          const isGridSpaceUnit = (f === 'space' || ph === 'spaces') && i > 0 && (tokens[i - 1].kind === 'number' || numberWords.has(tokens[i - 1].lower));
          const isTautScene = ['scene', 'picture', 'drawing', 'canvas', 'room'].includes(f) && (tokens[e + 1]?.lower === 'into' || /\bsurprise\s+me\b/i.test(src));
          if (sc && !isGridSpaceUnit && !isTautScene && tabKeys.has('page.scene')) emitConstraint('page.scene', sc, i, e, { cost: 2 });

          const fl = vocabMatch(kb?.domain?.feelings, f);
          // Guard: "surprise me" is composition.source=random, not drawn.expression=surprised!
          const isSurpriseMe = tok.lower === 'surprise' && i + 1 < T && tokens[i + 1].lower === 'me';
          if (fl && !isSurpriseMe && tabKeys.has('drawn.expression')) emitConstraint('drawn.expression', fl, i, e, { cost: 2 });

          const stRaw = mapGet(kb?.domain?.styles, f);
          const stName = unwrapVocabValue(stRaw, f);
          const stKind = stRaw && typeof stRaw === 'object' ? stRaw.kind : null;
          if (stName) {
            const styleAttrMap = {
              material: ['drawn.material'],
              font: ['drawn.font'],
              filter: ['page.filter'],
              effect: ['drawn.effect', 'part.effect'],
              fill: ['drawn.fill'],
              frame: ['drawn.frame'],
              style: ['page.style'],
            };
            const allowedStyleAttrs = (stKind && styleAttrMap[stKind]) ? styleAttrMap[stKind] : ['page.style'];
            for (const attr of allowedStyleAttrs) {
              if (tabKeys.has(attr)) emitConstraint(attr, stName, i, e, { cost: 2.5 });
            }
          }

          const wr = vocabMatch(kb?.domain?.wearables, f);
          if (wr) {
            if (tabKeys.has('drawn.wear')) emitConstraint('drawn.wear', wr, i, e, { cost: 2 });
            if (tabKeys.has('part.variant')) emitConstraint('part.variant', wr, i, e, { cost: 2.5 });
            if (tabKeys.has('part.value')) emitConstraint('part.value', wr, i, e, { cost: 2.5 });
          }

          const fillVal = vocabMatch(kb?.domain?.fills, f);
          if (fillVal && tabKeys.has('drawn.fill')) {
            emitConstraint('drawn.fill', fillVal, i, e, { cost: len > 1 ? 1.5 : 2.5 });
          }

          const bp = vocabMatch(kb?.domain?.bodyParts, f);
          if (bp && tabKeys.has('part.ids')) {
            emitConstraint('part.ids', bp, i, e, { phase: 'selector', cost: 7 });
          }

          const ly = vocabMatch(kb?.domain?.layouts, f);
          if (ly && tabKeys.has('drawn.arrangement')) {
            // Bare shape/object noun ("circle object", "a yellow table", "a tree") is a TARGET_SORT unless preceded by arrangement prep ("in a circle", "as a row", "into a grid")!
            const prev1 = i > 0 ? tokens[i - 1].lower : '';
            const prev2 = i > 1 ? tokens[i - 2].lower : '';
            const hasArrPrep = ['in', 'as', 'into'].includes(prev1) || (['a', 'an', 'the'].includes(prev1) && ['in', 'as', 'into'].includes(prev2));
            const alsoShapeOrObj = Boolean(vocabMatch(kb?.domain?.shapes, f) || vocabMatch(kb?.domain?.objects, f));
            emitConstraint('drawn.arrangement', ly, i, e, { cost: (alsoShapeOrObj && !hasArrPrep) ? 14 : 2 });
          }
        }
      }
      if (hasDiagramKeys) {
        if (len === 1 && tok.lower === 'stack' && tabKeys.has('chart.stacked')) {
          emitConstraint('chart.stacked', 'stacked', i, i, { allowOpen: true, requiresKeyWord: true, cost: 0.8 });
        }
        if (len === 1 && ['exponential', 'scientific', 'logarithmic', 'engineering'].includes(tok.lower) && tabKeys.has('chart.tickFormat')) {
          emitConstraint('chart.tickFormat', tok.lower, i, i, { allowOpen: true, requiresKeyWord: true, cost: 1.0 });
        }
        if (len === 1 && ['darker', 'lighter', 'brighter', 'pastel', 'warm', 'cool', 'monochrome'].includes(tok.lower) && tabKeys.has('chart.palette')) {
          emitConstraint('chart.palette', tok.lower, i, i, { allowOpen: true, requiresKeyWord: true, cost: 1.0 });
        }
        if (len === 2 && tabKeys.has('chart.sort')) {
          if (['highest first', 'largest first', 'biggest first', 'most first'].includes(ph)) {
            emitConstraint('chart.sort', 'desc', i, e, { cost: 0.8 });
          } else if (['lowest first', 'smallest first', 'least first'].includes(ph)) {
            emitConstraint('chart.sort', 'asc', i, e, { cost: 0.8 });
          }
        }
        if (len === 3 && tabKeys.has('chart.sort')) {
          if (['largest to smallest', 'highest to lowest', 'most to least', 'biggest to smallest'].includes(ph)) {
            const sIdx = i > 0 && tokens[i - 1].lower === 'from' ? i - 1 : i;
            emitConstraint('chart.sort', 'desc', sIdx, e, { cost: 0.8 });
          } else if (['smallest to largest', 'lowest to highest', 'least to most'].includes(ph)) {
            const sIdx = i > 0 && tokens[i - 1].lower === 'from' ? i - 1 : i;
            emitConstraint('chart.sort', 'asc', sIdx, e, { cost: 0.8 });
          }
        }
        if (['same gap', 'equal gap', 'even gap', 'equal spacing', 'same spacing'].includes(ph)) {
          if (tabKeys.has('node.gap')) emitConstraint('node.gap', 'equal', i, e, { cost: 1.5 });
          if (tabKeys.has('diagram.spacing')) emitConstraint('diagram.spacing', 'equal', i, e, { cost: 2 });
        }
        if (['paired view', 'paired', 'side by side'].includes(ph)) {
          if (tabKeys.has('chart.compare')) emitConstraint('chart.compare', 'side_by_side', i, e, { cost: 1.5 });
        }
        const chPhrase = CHART_TYPE_PHRASES.get(ph);
        if (chPhrase) {
          if (tabKeys.has('chart.type')) emitConstraint('chart.type', chPhrase, i, e, { cost: 1.5 });
          if (tabKeys.has('chart.layout')) emitConstraint('chart.layout', chPhrase, i, e, { cost: 6 });
        }
        const aggVal = CHART_AGG_WORDS.get(ph);
        if (aggVal && tabKeys.has('chart.aggregate')) {
          emitConstraint('chart.aggregate', aggVal, i, e, { cost: 2 });
        }
        const dkPhrase = DIAGRAM_KIND_PHRASES.get(ph);
        if (dkPhrase && tabKeys.has('diagram.kind')) {
          const isChartKind = dkPhrase.endsWith('_chart');
          emitConstraint('diagram.kind', dkPhrase, i, e, { cost: isChartKind ? 16 : 3 });
        }
        for (const f of forms) {
          const ch = vocabMatch(kb?.domain?.charts, f);
          if (ch) {
            // Definite plural mark ("make the bars blue") or selector ("on the order scatter") refers to an existing chart, not creating a new chart!
            const isDefPluralMark = len === 1 && i > 0 && tokens[i - 1].lower === 'the' && ph.endsWith('s');
            const isOnTheModifiedChart = len === 1 && i >= 3 && tokens[i - 3].lower === 'on' && tokens[i - 2].lower === 'the';
            const chCost = (isDefPluralMark || isOnTheModifiedChart) ? 11 : 1.5;
            if (tabKeys.has('chart.type')) emitConstraint('chart.type', ch, i, e, { cost: chCost });
            if (tabKeys.has('chart.layout')) emitConstraint('chart.layout', ch, i, e, { cost: chCost + 4 });
          }
          const dg = vocabMatch(kb?.domain?.diagrams, f);
          if (dg && !String(dg).endsWith('_chart') && !String(dg).includes(' ') && tabKeys.has('diagram.kind')) {
            emitConstraint('diagram.kind', dg, i, e, { cost: 2.5 });
          }
          const sh = vocabMatch(kb?.domain?.shapes, f);
          if (sh) {
            const hasShapeKw = i > 0 && ['shape', 'kind', 'marker', 'symbol'].includes(tokens[i - 1].lower);
            for (const attr of ['node.shape', 'node.kind', 'chart.markerType']) {
              if (tabKeys.has(attr)) emitConstraint(attr, sh, i, e, { cost: hasShapeKw ? 2 : 6 });
            }
          }
          const ly = vocabMatch(kb?.domain?.layouts, f);
          if (ly) {
            for (const attr of ['diagram.layout', 'group.layout', 'node.layout']) {
              // Bare "line" is usually a line-style key_word ("the line dash-dot"), not diagram.layout=row!
              if (tabKeys.has(attr)) emitConstraint(attr, ly, i, e, { cost: (len === 1 && f === 'line') ? 8 : 2.5 });
            }
          }
        }
      }
      if (hasDocumentKeys) {
        if (['in the centre', 'in the center', 'in the middle', 'centred', 'centered'].includes(ph)) {
          for (const attr of ['block.align', 'section.align', 'inline.align']) {
            if (tabKeys.has(attr)) emitConstraint(attr, 'center', i, e, { cost: 2 });
          }
        }
        if (['top level', 'level 1', 'level one'].includes(ph)) {
          for (const attr of ['section.level', 'block.level']) {
            if (tabKeys.has(attr)) emitConstraint(attr, '1', i, e, { cost: 2 });
          }
        }
        for (const f of forms) {
          const gen = vocabMatch(kb?.domain?.genres, f);
          if (gen) {
            if (tabKeys.has('text.genre')) emitConstraint('text.genre', gen, i, e, { cost: 4 });
            if (tabKeys.has('document.genre')) emitConstraint('document.genre', gen, i, e, { cost: 4.5 });
          }
        }
      }
    }

    // Standing preference scope, key & value triggers from `clauses.sop` (`w.lang.en.frame_lead`) + "the default" / "as the standard"
    if (tabKeys.has('preference.scope')) {
      for (let len = 2; len <= 4 && i + len <= T; len++) {
        const e = i + len - 1;
        if (hasPunctInSpan(tokens, i, e)) break;
        const ph = spanTextLower(tokens, i, e);
        if (['the default', 'by default', 'as the default', 'as default', 'as the standard', 'as standard'].includes(ph) || kb?.grammar?.frameLeads?.has?.(ph)) {
          emitConstraint('preference.scope', src.slice(tokens[i].start, tokens[e].end), i, e, { cost: 1.5 });
        }
      }
      if (/\b(the default|by default|as the default|as default|as the standard|as standard|from now on|in future|in the future|as a rule)\b/i.test(src) && tok.kind === 'word') {
        const PREF_KEYS = new Set(['legend', 'grid', 'gridlines', 'background', 'font', 'colour', 'color', 'size', 'layout', 'style', 'theme', 'orientation', 'stroke']);
        const PREF_VALS = new Set(['left', 'right', 'top', 'bottom', 'center', 'centre', 'on', 'off', 'show', 'hide', 'horizontal', 'vertical', 'thicker', 'thinner', 'bigger', 'smaller', 'wider', 'narrower', 'larger']);
        if (PREF_KEYS.has(tok.lower) && tabKeys.has('preference.key')) {
          emitConstraint('preference.key', tok.lower === 'gridlines' ? 'grid' : tok.lower, i, i, { cost: 1.4 });
        }
        const colHit = vocabMatch(kb?.domain?.colours, tok.lower);
        if ((PREF_VALS.has(tok.lower) || colHit) && tabKeys.has('preference.value')) {
          emitConstraint('preference.value', colHit ?? tok.lower, i, i, { cost: 1.4 });
        }
      }
    }

    // 10i. Quoted open spans anywhere (multi-word prose strictly prefers *.content over *.text / *.name / *.title)
    if (tok.kind === 'quote' && tok.inner) {
      const isProseQuote = tok.inner.includes(' ') || /[.!?]$/.test(tok.inner);
      for (const attr of spanKeys) {
        const sk = attr.split('.').slice(1).join('.');
        const qCost = isProseQuote
          ? (sk === 'content' ? 1.2 : sk === 'text' ? 3.5 : 5)
          : 3;
        emitConstraint(attr, tok.inner, i, i, { cost: qCost });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 10j. Preposition / Cue / Key-Word-Anchored Open Spans
  // -------------------------------------------------------------------------
  if (hasPartOwners) {
    const heads = rawCandidates.filter((c) => c.kind === HYP_KINDS.TARGET_SORT || c.kind === HYP_KINDS.TARGET_FAMILY);
    const writtenNames = rawCandidates.filter((c) => c.kind === HYP_KINDS.TARGET_REF && c.name);
    for (const head of heads.filter((c) => c.family === 'part')) {
      const partHead = [head.startTok, head.endTok];
      const emitOwner = (value, start, end, options = {}) => emitConstraint('part.owner', value, start, end, {
        phase: 'selector', cost: 2, partHead, ...options,
      });
      if (head.det === 'possessive' && head.detTok >= 0) {
        const owner = tokens[head.detTok].text;
        emitOwner(owner, head.detTok, head.detTok, { lookupWords: owner });
      }
      const genitiveTok = head.startTok - 1;
      const genitive = genitiveOwner(genitiveTok);
      if (genitive) emitOwner(genitive, genitiveTok, genitiveTok, { words: tokens[genitiveTok].text });

      const prep = head.endTok + 1;
      if (rolePreps.get(tokens[prep]?.lower) !== 'part' || prep + 1 >= T) continue;
      const ownerStart = prep + 1;
      const reference = referenceAt(ownerStart);
      if (reference) {
        const words = src.slice(tokens[ownerStart].start, tokens[reference.end].end);
        emitOwner(words, ownerStart, reference.end, { lookupWords: words });
      } else {
        const owners = [...heads, ...writtenNames].filter((c) => c.startTok === ownerStart || c.detTok === ownerStart);
        for (const owner of owners) {
          emitOwner(src.slice(tokens[ownerStart].start, tokens[owner.endTok].end), ownerStart, owner.endTok);
        }
      }
    }
  }

  // Collect KeyWord triggers (index -> attrs) so open spans right after KEY_WORD get emitted
  const kwTriggerAtEndTok = new Map();
  for (const c of rawCandidates) {
    if (c.kind !== HYP_KINDS.KEY_WORD) continue;
    if (!kwTriggerAtEndTok.has(c.endTok)) kwTriggerAtEndTok.set(c.endTok, new Set());
    for (const a of c.attrs) kwTriggerAtEndTok.get(c.endTok).add(a);
  }

  const OPEN_SPAN_BARRIERS = new Set([
    'above', 'below', 'under', 'underneath', 'beneath', 'behind', 'near', 'beside',
    'between', 'inside', 'outside', 'around', 'along', 'across', 'before', 'after', 'ahead',
    'in', 'on', 'at', 'for', 'from', 'to', 'into', 'onto', 'with', 'by', 'per', 'about', 'regarding',
    'containing', 'saying', 'called', 'named', 'titled', 'labelled', 'labeled',
    'approximately', 'roughly', 'then', 'but', 'however', 'whereas', 'together',
  ]);

  const emitOpenSpansStartingAt = (s, targetAttrs, opts = {}) => {
    const maxLen = opts.maxLen ?? 4;
    for (let len = 1; len <= maxLen && s + len <= T; len++) {
      const e = s + len - 1;
      if (hasPunctInSpan(tokens, s, e)) break;
      // Never swallow dates, times, or quotes into a multi-word unquoted open span
      if (len > 1 && (tokens[e].kind === 'date' || tokens[e].kind === 'time' || tokens[e].kind === 'quote')) break;
      // Stop if span hits a structural preposition, cue, or spatial/temporal relation barrier
      if (tokens[e].kind === 'word' && OPEN_SPAN_BARRIERS.has(tokens[e].lower)) break;
      if (tokens[e].kind === 'word' && ['and', 'also'].includes(tokens[e].lower) && len === 1) break;
      if (isPureGrammarOrVerbSpan(tokens, s, e, kb)) continue;
      // Never start/end open span with determiner-only or trailing prep
      if (tokens[s].isGrammar && !tokens[s].isProperCandidate) continue;
      if (len > 1 && tokens[e].isGrammar && !tokens[e].isProperCandidate) continue;

      const spanVal =
        len === 1 && tokens[s].kind === 'quote'
          ? tokens[s].inner
          : src.slice(tokens[s].start, tokens[e].end);

      for (const attr of targetAttrs) {
        if (!tabKeys.has(attr)) continue;
        // Enforce check.mjs rule: chart.measure / chart.dimension never all grammar/verb
        if (/^chart\.(measure|dimension)$/.test(attr) && isPureGrammarOrVerbSpan(tokens, s, e, kb)) {
          continue;
        }
        const coverStart = opts.includeTriggerTok !== undefined ? opts.includeTriggerTok : s;
        // Scale open-span cost with token length so structured parses beat giant catch-all open spans!
        const baseCost = opts.cost ?? 10;
        const attrExtra = (attr === 'diagram.about' || attr === 'page.scene' || attr === 'drawn.about') ? 8 : 0;
        emitConstraint(attr, spanVal, coverStart, e, {
          phase: opts.phase ?? phaseHintForAttr(attr),
          operator: opts.operator ?? operatorForAttr(attr, spanVal, tabKeys),
          isAnchor: Boolean(opts.isAnchor),
          requiresKeyWord: Boolean(opts.requiresKeyWord),
          allowOpen: Boolean(opts.allowOpen),
          predicateRole: opts.predicateRole,
          cost: baseCost + attrExtra + (len - 1) * 4,
        });
      }
    }
  };

  for (let i = 0; i < T; i++) {
    const tok = tokens[i];
    // Skip optional determiner immediately after trigger at i
    const nextStart =
      i + 1 < T && tokens[i + 1].kind === 'word' && DET_MAP.has(tokens[i + 1].lower) && !tokens[i + 1].isProperCandidate
        ? i + 2
        : i + 1;

    // Key-word triggered open span (also allows explicitly key-word-anchored open_value on closed non-number keys!)
    if (kwTriggerAtEndTok.has(i) && nextStart < T) {
      const kwAll = [...kwTriggerAtEndTok.get(i)];
      const nextClosedHits = toArray(mapGet(closedValueIndex, tokens[nextStart].lower));
      const hasMarkerFillClosed = nextClosedHits.some((h) => h?.attr === 'chart.markerFill');
      const NUMERIC_DIM_SHORT_RE = /(width|height|size|radius|opacity|scale|gap|count|level|index|bins|fontSize|stroke|thickness)$/i;
      const kwSpanAttrs = kwAll.filter((a) => {
        if (a === 'chart.markerEdge' && hasMarkerFillClosed) return false;
        const sp = tabKeys.get(a);
        const sk = a.includes('.') ? a.split('.').slice(1).join('.') : a;
        return sp && !sp.head.includes('number') && !NUMERIC_DIM_SHORT_RE.test(sk) && (sp.head.includes('span') || sp.head.includes('candidate'));
      });
      if (kwSpanAttrs.length > 0) {
        emitOpenSpansStartingAt(nextStart, kwSpanAttrs, { requiresKeyWord: true, cost: 2.5 });
        if (nextStart !== i + 1 && i + 1 < T) {
          emitOpenSpansStartingAt(i + 1, kwSpanAttrs, { requiresKeyWord: true, cost: 3 });
        }
      }
    }
    // "<KEY_WORD> of <target> to <VAL>" (e.g. "set the role of the diamond to connector", "set the background of the diagram to Background one"):
    if (tok.kind === 'word' && tok.lower === 'to' && nextStart < T) {
      const nearbyKwAttrs = new Set();
      for (let back = Math.max(0, i - 5); back < i; back++) {
        if (kwTriggerAtEndTok.has(back)) {
          for (const a of kwTriggerAtEndTok.get(back)) nearbyKwAttrs.add(a);
        }
      }
      if (nearbyKwAttrs.size > 0) {
        emitOpenSpansStartingAt(nextStart, [...nearbyKwAttrs], { requiresKeyWord: true, allowOpen: true, cost: 3.5, maxLen: 2 });
        if (tokens[nextStart].isCapitalized && nextStart + 1 < T && (tokens[nextStart + 1].kind === 'number' || numberWords.has(tokens[nextStart + 1].lower))) {
          const compName = src.slice(tokens[nextStart].start, tokens[nextStart + 1].end);
          for (const attr of nearbyKwAttrs) {
            if (tabKeys.has(attr)) emitConstraint(attr, compName, nextStart, nextStart + 1, { requiresKeyWord: true, allowOpen: true, cost: 1.5 });
          }
        }
      }
    }

    // Spatial / temporal / order relation anchor triggers (up to 5 tokens) — dynamically from SOP prepositions!
    for (let rLen = 1; rLen <= 5 && i - rLen + 1 >= 0; rLen++) {
      const rStart = i - rLen + 1;
      if (hasPunctInSpan(tokens, rStart, i)) break;
      const rPh = spanTextLower(tokens, rStart, i);
      if ((spatialRels.has(rPh) || temporalRels.has(rPh)) && i + 1 < T) {
        if (anchorKeys.length > 0) {
          emitOpenSpansStartingAt(nextStart, anchorKeys, {
            phase: 'selector',
            operator: 'relation',
            isAnchor: true,
            cost: 2.5,
          });
          const reference = referenceAt(i + 1);
          if (reference) {
            const words = src.slice(tokens[i + 1].start, tokens[reference.end].end);
            for (const ak of anchorKeys) {
              if (tabKeys.has(ak)) {
                emitConstraint(ak, words, i + 1, reference.end, {
                  phase: 'selector',
                  operator: 'relation',
                  isAnchor: true,
                  lookupWords: words,
                  cost: 2.0,
                });
              }
            }
          }
        }
        if (hasDrawingKeys && rPh === 'behind' && tabKeys.has('drawn.behind')) {
          emitOpenSpansStartingAt(nextStart, ['drawn.behind'], { phase: 'selector', cost: 2.5 });
        }
        if (hasDrawingKeys && rPh === 'on' && tabKeys.has('drawn.seat')) {
          emitOpenSpansStartingAt(nextStart, ['drawn.seat'], { phase: 'selector', cost: 7 });
        }
      }
      // Dynamically support `diagram.edge.from` ("going from A", "leading from A", "between A and B") from diagram-frames.sop!
      if (hasDiagramKeys && diagramEdgeFromLex.has(rPh) && nextStart < T) {
        emitOpenSpansStartingAt(nextStart, ['link.from'], { phase: 'result', cost: 3.5, maxLen: 2 });
        if (rPh === 'between' && nextStart + 2 < T && tokens[nextStart + 1].lower === 'and') {
          emitOpenSpansStartingAt(nextStart + 2, ['link.to'], { phase: 'result', cost: 3.5, maxLen: 2 });
        }
      }
      // Dynamically support `capacity-frames.sop` triggers ("seating 6", "that seats 6", "with room for 6", "with seats for 6")!
      if (['seating', 'that seats', 'with room for', 'with seats for', 'with places for'].includes(rPh) && nextStart < T) {
        const capNum = parseNumeric(tokens[nextStart]);
        if (capNum !== null && Number.isInteger(capNum)) {
          if (tabKeys.has('room.seats')) emitConstraint('room.seats', String(capNum), nextStart, nextStart, { cost: 1.5 });
          if (tabKeys.has('room.capacity')) emitConstraint('room.capacity', String(capNum), nextStart, nextStart, { cost: 2 });
        }
      }
      // Dynamically support `hand-joins.sop` role=criterion markers ("according to", "in order of") -> diagram.by / chart.dimension!
      if (rolePreps.get(rPh) === 'criterion' && nextStart < T) {
        if (tabKeys.has('diagram.by')) emitOpenSpansStartingAt(nextStart, ['diagram.by'], { phase: 'result', cost: 2.5, maxLen: 2 });
        if (tabKeys.has('chart.dimension')) emitOpenSpansStartingAt(nextStart, ['chart.dimension'], { phase: 'result', cost: 3, maxLen: 2 });
      }
    }

    // Specific preposition & structural verb triggers
    if (tok.kind === 'word' && nextStart < T) {
      if (tok.lower === 'from') {
        const isSortRange = ['largest', 'smallest', 'highest', 'lowest', 'biggest', 'most', 'least'].includes(tokens[nextStart]?.lower ?? '')
          && tokens[nextStart + 1]?.lower === 'to';
        if (hasDiagramKeys && !isSortRange) emitOpenSpansStartingAt(nextStart, ['link.from', 'chart.datasets', 'chart.dateRange'], { phase: 'result', cost: 4 });
      } else if (tok.lower === 'to' || tok.lower === 'into') {
        const isSortRangeEnd = tok.lower === 'to' && i >= 2 && tokens[i - 2].lower === 'from'
          && ['largest', 'smallest', 'highest', 'lowest', 'biggest', 'most', 'least'].includes(tokens[i - 1].lower);
        if (hasDiagramKeys && !isSortRangeEnd) emitOpenSpansStartingAt(nextStart, ['link.to'], { phase: 'result', cost: 2.5 });
        if (hasDocumentKeys) {
          emitOpenSpansStartingAt(nextStart, ['inline.link_target', 'section.text', 'block.text', 'text.title'], { phase: 'result', cost: 6 });
        }
        // After rename/retitle/relabel ... to <newName>
        if (hasMeetingKeys) {
          const hasRenameBefore = tokens.slice(Math.max(0, i - 4), i).some((t) => ['rename', 'renamed', 'retitle', 'call', 'called', 'named'].includes(t.lower));
          if (hasRenameBefore && tokens[nextStart].kind !== 'time' && tokens[nextStart].kind !== 'date') {
            emitOpenSpansStartingAt(nextStart, ['meeting.title', 'calendar.name', 'room.name'], { phase: 'result', cost: 3 });
          }
        }
      } else if (hasDiagramKeys && ['connect', 'link', 'join', 'wire'].includes(tok.lower)) {
        emitOpenSpansStartingAt(nextStart, ['link.from'], { phase: 'result', cost: 2.0, maxLen: 2 });
      } else if (hasDiagramKeys && CHART_AGG_WORDS.has(tok.lower)) {
        emitOpenSpansStartingAt(nextStart, ['chart.measure'], { phase: 'result', cost: 3, maxLen: 3 });
      } else if (tok.lower === 'of') {
        if (hasDiagramKeys) {
          const isOwnerFamily = ['diagram', 'chart', 'graph', 'page', 'node', 'group'].includes(tokens[nextStart]?.lower ?? '');
          emitOpenSpansStartingAt(nextStart, isOwnerFamily ? ['chart.measure'] : ['chart.measure', 'diagram.about'], { phase: 'result', cost: 4 });
        }
      } else if (tok.lower === 'for') {
        if (hasDiagramKeys) {
          emitOpenSpansStartingAt(nextStart, ['chart.measure', 'diagram.about'], { phase: 'result', cost: 4 });
          // Coordinated chart labels after "for" ("for Shop and Sample", "for Triage, Testing and Billing")
          if (tabKeys.has('chart.labels') && tokens[nextStart]?.isProperCandidate) {
            let endLbl = nextStart;
            while (endLbl + 2 < T && (tokens[endLbl + 1].lower === 'and' || tokens[endLbl + 1].text === ',') && tokens[endLbl + 2].isProperCandidate) {
              endLbl += 2;
            }
            if (endLbl > nextStart) {
              emitConstraint('chart.labels', src.slice(tokens[nextStart].start, tokens[endLbl].end), nextStart, endLbl, { cost: 2 });
            }
          }
        }
        if (hasDrawingKeys) {
          // "swap the dog for a cat" / "substitute X for Y" -> drawn.kind!
          emitOpenSpansStartingAt(nextStart, ['drawn.kind'], { phase: 'result', cost: 4, maxLen: 2 });
        }
        if (hasMeetingKeys) {
          // "book Hall for Planning" -> meeting.title; "room for 6" -> room.seats / room.capacity!
          const nt = tokens[nextStart];
          const numFor = parseNumeric(nt);
          if (numFor !== null && Number.isInteger(numFor) && nextStart + 1 <= T && !UNIT_CANON.has(tokens[nextStart + 1]?.lower ?? '')) {
            if (tabKeys.has('room.seats')) emitConstraint('room.seats', String(numFor), nextStart, nextStart, { cost: 2 });
            if (tabKeys.has('room.capacity')) emitConstraint('room.capacity', String(numFor), nextStart, nextStart, { cost: 2.5 });
          } else if (nt && nt.kind !== 'number' && !numberWords.has(nt.lower)) {
            emitOpenSpansStartingAt(nextStart, ['meeting.title'], { phase: 'result', cost: 3, maxLen: 3 });
          }
        }
      } else if (hasDrawingKeys && tok.lower === 'because' && i + 1 < T && tokens[i + 1].lower === 'of') {
        const afterOf = (i + 2 < T && DET_MAP.has(tokens[i + 2].lower)) ? i + 3 : i + 2;
        if (afterOf < T) emitOpenSpansStartingAt(afterOf, ['drawn.cause'], { requiresKeyWord: true, cost: 2, maxLen: 3 });
      } else if (hasDrawingKeys && (tok.lower === 'holding' || tok.lower === 'holds')) {
        emitOpenSpansStartingAt(nextStart, ['drawn.holds'], { requiresKeyWord: true, cost: 2, maxLen: 2 });
      } else if (hasMeetingKeys && ['book', 'schedule', 'reserve'].includes(tok.lower)) {
        // "book Room 4 for Planning" vs "book Planning in Hall": if "for <non-number>" follows, the direct object is room/venue!
        const hasForNonNum = tokens.slice(nextStart + 1, Math.min(T, nextStart + 5)).some((t, idx, arr) =>
          t.lower === 'for' && arr[idx + 1] && arr[idx + 1].kind !== 'number' && !numberWords.has(arr[idx + 1].lower)
        );
        emitOpenSpansStartingAt(nextStart, ['meeting.room'], { phase: 'result', cost: hasForNonNum ? 1.5 : 3.5, maxLen: 2, predicateRole: catalog ? i : undefined });
        emitOpenSpansStartingAt(nextStart, ['meeting.title'], { phase: 'result', cost: hasForNonNum ? 4.5 : 2.5, maxLen: 3, predicateRole: catalog ? i : undefined });
      } else if (tok.lower === 'by' || tok.lower === 'per' || tok.lower === 'across' || tok.lower === 'versus' || tok.lower === 'vs' || tok.lower === 'against') {
        if (hasDiagramKeys) {
          const isChartTitleModifier = tok.lower === 'by' && i > 0 && tokens[i - 1].isCapitalized && nextStart + 1 < T && ['chart', 'graph', 'plot', 'diagram'].includes(tokens[nextStart + 1].lower);
          if (!isChartTitleModifier) {
            emitOpenSpansStartingAt(nextStart, ['chart.dimension', 'chart.colourBy'], { phase: 'result', cost: 2.5 });
            emitOpenSpansStartingAt(nextStart, ['chart.dimension'], {
              includeTriggerTok: i,
              phase: 'result',
              cost: 2.5,
            });
          }
        }
      } else if (tok.lower === 'about' || tok.lower === 'regarding') {
        if (hasDocumentKeys) emitOpenSpansStartingAt(nextStart, ['text.about', 'document.topic', 'section.content'], { cost: 4 });
        if (hasDiagramKeys) emitOpenSpansStartingAt(nextStart, ['diagram.about'], { cost: 6 });
        if (hasDrawingKeys) emitOpenSpansStartingAt(nextStart, ['drawn.about', 'drawn.cause'], { cost: 6 });
      } else if (hasDrawingKeys && (tok.lower === 'face' || tok.lower === 'facing') && i > 0 && ['to', 'should', 'must', 'can', 'could', 'would', 'will'].includes(tokens[i - 1].lower)) {
        emitOpenSpansStartingAt(nextStart, ['drawn.facing'], { requiresKeyWord: true, allowOpen: true, cost: 1.5, maxLen: 2 });
      } else if (tok.lower === 'with') {
        if (hasMeetingKeys) emitOpenSpansStartingAt(nextStart, ['meeting.people', 'meeting.participants'], { cost: 4 });
        if (hasDrawingKeys) {
          // Never blindly spray arbitrary `with <X>` spans into `drawn.wear` (wearables are already matched from `kb.domain.wearables` at cost 2)!
          // Support `"with the word 'BAKERY'"` / `"with text 'X'"` -> `drawn.text`!
          if (['word', 'words', 'text', 'sign'].includes(tokens[nextStart]?.lower ?? '') && nextStart + 1 < T && tokens[nextStart + 1].kind === 'quote') {
            emitConstraint('drawn.text', tokens[nextStart + 1].inner, nextStart, nextStart + 1, { cost: 1.5 });
          } else if (!kwTriggerAtEndTok.has(nextStart) && !['scene', 'drawing', 'picture'].includes(tokens[nextStart]?.lower ?? '')) {
            emitOpenSpansStartingAt(nextStart, ['composition.with'], { cost: 8 });
          }
        }
        if (hasDiagramKeys && !kwTriggerAtEndTok.has(nextStart)) {
          emitOpenSpansStartingAt(nextStart, ['composition.with'], { cost: 8 });
        }
      } else if (tok.lower === 'in' || tok.lower === 'at' || tok.lower === 'on') {
        if (hasMeetingKeys) {
          // Type discipline: meeting.room / meeting.calendar NEVER capture time or date tokens ("at 10:00", "on 2026-11-18")!
          // Prepositional semantics: "on <Work 4>" -> meeting.calendar; "in/at <Hall / Room 4>" -> meeting.room!
          const nt = tokens[nextStart];
          if (nt && nt.kind !== 'time' && nt.kind !== 'date' && !WEEKDAYS.has(nt.lower) && !RELATIVE_DAYS.has(nt.lower) && !TIME_OF_DAY_PHRASES.has(nt.lower)) {
            if (tabKeys.has('room.location') && tokens.slice(nextStart, Math.min(T, nextStart + 3)).some((t) => ['floor', 'building', 'wing', 'level', 'tower', 'annex'].includes(t.lower))) {
              emitOpenSpansStartingAt(nextStart, ['room.location'], { includeTriggerTok: i, cost: 2, maxLen: 3 });
            }
            if (tok.lower === 'on') {
              emitOpenSpansStartingAt(nextStart, ['meeting.calendar'], { cost: 2.5 });
              emitOpenSpansStartingAt(nextStart, ['meeting.room'], { cost: 6.5 });
            } else {
              emitOpenSpansStartingAt(nextStart, ['meeting.room'], { cost: 2.5 });
              emitOpenSpansStartingAt(nextStart, ['meeting.calendar'], { cost: 6.5 });
            }
          }
        }
        if (hasDrawingKeys) emitOpenSpansStartingAt(nextStart, ['page.scene', 'page.style'], { cost: 10 });
      }
    }
  }

  let writtenPredicates = rawCandidates.filter(({ kind }) => kind === HYP_KINDS.PREDICATE);
  if (catalog) {
    purposeSpans = modalPurposeSpans(tokens, kb, writtenPredicates);
    purposeSpans = purposeSpans.filter(({ purposePredicate, startTok, endTok }) =>
      !nonDirectives.some((scope) => purposePredicate <= scope.endTok && scope.startTok <= endTok) &&
      !politeSpans.some((scope) => startTok <= scope.endTok && scope.startTok <= endTok));
    if (purposeSpans.length) {
      for (let i = rawCandidates.length - 1; i >= 0; i--) {
        if (purposeSpans.some(({ startTok, endTok }) =>
          rawCandidates[i].startTok <= endTok && startTok <= rawCandidates[i].endTok)) rawCandidates.splice(i, 1);
      }
      writtenPredicates = rawCandidates.filter(({ kind }) => kind === HYP_KINDS.PREDICATE);
      for (const { first, startTok, endTok, purposePredicate } of purposeSpans) {
        tokens[startTok].purposeEnd = endTok;
        emit({
          kind: HYP_KINDS.INTENT, role: 'purpose', startTok, endTok, purposePredicate,
          rolePredicate: purposePredicate, value: src.slice(tokens[first].start, tokens[endTok].end), cost: 0,
        });
      }
    }
  }
  for (const span of wholeSelectionPredicates(tokens, kb.grammar, splitPoints, writtenPredicates)) {
    emit({
      ...span, kind: HYP_KINDS.PREDICATE, targetless: true,
      licensed: [{ act: 'deselect', mode: 'none', mood: 'do' }], cost: 0,
    });
  }
  for (const span of matchOptionQuestions(tokens, splitPoints, writtenPredicates, kb)) {
    emit({
      ...span, kind: HYP_KINDS.PREDICATE, targetless: true,
      licensed: [{ act: 'ask', mode: 'none', mood: 'ask', question: 'list' }], cost: 0,
    });
  }

  if (catalog) {
    for (const { predicate, descriptor, endTok, heads, qualifier } of matchBlankArtifactCreation(tokens, splitPoints, writtenPredicates, rawCandidates, kb)) {
      const expanded = heads.map((head) => ({ ...head, startTok: descriptor, det: 'indefinite' }));
      for (const head of expanded) emit(head);
      Object.assign(predicate, {
        licensed: [{ act: 'make', mode: 'none', mood: 'do' }],
        predicateTargetHeads: expanded,
        creationEnd: endTok,
      });
      if (qualifier) {
        predicate.outputTargetEnd = qualifier.startTok - 1;
        emit({
          kind: HYP_KINDS.UNREAD, ...qualifier, rolePredicate: predicate.startTok,
          note: 'create.artifact_detail', cost: 0,
        });
      }
    }
    for (const { predicate, targetEnd, roles, bareReference, loadHeads, physicalOpen } of matchArtifactOperands(tokens, splitPoints, writtenPredicates, rawCandidates, kb)) {
      if (physicalOpen) {
        predicate.licensed = predicate.licensed.filter(({ act }) => act === 'change');
        continue;
      }
      if (predicate.modalOutput) emit({ ...predicate, outputTargetEnd: targetEnd, bareReference });
      else {
        Object.assign(predicate, { outputTargetEnd: targetEnd, bareReference, loadHeads });
        if (loadHeads.length) predicate.licensed = predicate.licensed.filter(({ act }) => act === 'load');
      }
      for (const { startTok, endTok, role, note } of roles) {
        emit({
          kind: role ? HYP_KINDS.INTENT : HYP_KINDS.UNREAD,
          startTok, endTok, role, note, cost: 0,
          rolePredicate: predicate.startTok,
          ...(role ? { value: src.slice(tokens[startTok + 1].start, tokens[endTok].end) } : {}),
        });
      }
    }
  }

  const chartAssignments = catalog ? [
    ...matchChartFieldAssignments(tokens, splitPoints, writtenPredicates, kb),
    ...matchChartFieldEdits(tokens, splitPoints, writtenPredicates, kb),
    ...matchChartDisplayEdits(tokens, splitPoints, writtenPredicates, kb, parseNumeric),
    ...matchChartLegendEdits(tokens, splitPoints, writtenPredicates, kb),
  ] : [];
  for (const { startTok, endTok, fields, owner, limit, fragment, qualifier } of chartAssignments) {
    const scopeEnd = qualifier?.endTok ?? limit - 1;
    if (!fragment) {
      emit({
        kind: HYP_KINDS.PREDICATE, startTok, endTok, chartEditEnd: scopeEnd,
        licensed: [{ act: 'change', mode: 'none', mood: 'do' }], cost: 0,
      });
    }
    if (qualifier) {
      emit({ kind: HYP_KINDS.UNREAD, ...qualifier, chartEditPredicate: startTok, cost: 0 });
    }
    for (const [index, field] of fields.entries()) {
      const implicitAnchor = fragment && index === 0 ? { chartEditEnd: scopeEnd, chartEditStart: startTok } : {};
      if (field.unresolvedScale) {
        const separateOwner = owner && owner.startTok > field.cueEnd && owner.endTok < field.startTok;
        emit({
          kind: HYP_KINDS.UNREAD, startTok: field.cueStart,
          endTok: separateOwner ? field.cueEnd : field.endTok,
          note: 'x-axis scale', unresolvedResult: true, chartEditPredicate: startTok, cost: 0, ...implicitAnchor,
        });
        if (separateOwner) {
          emit({
            kind: HYP_KINDS.UNREAD, startTok: field.startTok, endTok: field.endTok,
            note: 'x-axis scale', unresolvedResult: true, chartEditPredicate: startTok, cost: 0,
          });
        }
        continue;
      }
      const hasCue = field.cueStart !== undefined;
      if (hasCue) {
        emit({
          kind: HYP_KINDS.KEY_WORD, startTok: field.cueStart, endTok: field.cueEnd,
          attrs: [field.attribute], families: ['chart'], cost: 0, chartEditPredicate: startTok,
          ...implicitAnchor,
        });
      }
      const valueToken = tokens[field.literalStart ?? field.startTok];
      const end = tokens[field.endTok].end;
      const value = field.value ?? (valueToken.kind === 'quote' && field.startTok === field.endTok
        ? valueToken.inner : src.slice(valueToken.start, end));
      const words = field.wordsStart === undefined ? null : src.slice(tokens[field.wordsStart].start, end);
      emitConstraint(field.attribute, value, field.startTok, field.endTok, {
        phase: 'result', words, requiresKeyWord: hasCue, chartEditPredicate: startTok, cost: 1,
        allowOpen: field.allowOpen,
      });
    }
    if (owner) {
      const { startTok: first, endTok: last } = owner;
      const written = src.slice(tokens[first].start, tokens[last].end);
      const reference = first === last && tokens[first].kind === 'word' && pronounRefs.has(tokens[first].lower);
      const description = DET_MAP.has(tokens[first].lower) || ['chart', 'graph', 'plot'].includes(tokens[last].lower);
      const name = first === last && tokens[first].kind === 'quote' ? tokens[first].inner : written;
      emit({
        kind: HYP_KINDS.TARGET_REF, ...owner, family: 'chart', families: ['chart'],
        ...(reference ? { isPronoun: true } : description ? { description: written } : { name }),
        fill: reference ? 'context' : description ? 'description' : 'written',
        det: 'definite', chartEditPredicate: startTok, cost: 0,
      });
    }
  }

  if (catalog) {
    const modalOutputs = new Set(rawCandidates.filter(({ modalOutput, chartEditEnd }) => modalOutput || chartEditEnd).map(({ startTok }) => startTok));
    for (const { startTok, endTok, act, heads } of matchModalWants(tokens, splitPoints, writtenPredicates, rawCandidates, kb)) {
      if (modalOutputs.has(startTok)) continue;
      emit({
        kind: HYP_KINDS.PREDICATE, startTok, endTok, predicateTargetHeads: heads,
        licensed: [{ act, mode: 'none', mood: 'do' }], cost: 0,
      });
    }
  }

  // A creation modifier belongs to the same evidence as a catalog type name.
  // Preserve a type-bearing candidate alongside the extended target description.
  const creationPredicates = rawCandidates.filter((c) => c.kind === HYP_KINDS.PREDICATE &&
    c.licensed?.some((licence) => licence.act === 'make'));
  const legendKey = tabKeys.get('chart.legend');
  if (catalog && tokens.some(({ lower }) => ['with', 'without', 'legend', 'by', 'against', 'versus', 'vs'].includes(lower))) {
    const chartHeads = rawCandidates.filter((head) =>
      [HYP_KINDS.TARGET_FAMILY, HYP_KINDS.TARGET_SORT].includes(head.kind) &&
      head.family === 'chart' && ['indefinite', 'none'].includes(head.det) &&
      mapGet(familyWords, tokens[head.endTok].lower)?.has('chart'))
      .sort((a, b) => a.startTok - b.startTok || b.endTok - a.endTok);
    const scatterLabelAt = (index) => tokens[index]?.kind === 'word' && tokens[index].lower === 'scatter' &&
      tokens[index + 1]?.text === ':';
    const scatterLabels = rawCandidates.filter((head) => head.kind === HYP_KINDS.TARGET_SORT &&
      head.family === 'chart' && ['indefinite', 'none'].includes(head.det) &&
      head.startTok === head.endTok && scatterLabelAt(head.startTok));
    const startsClause = (start, boundary) =>
      tokens.slice(boundary + 1, start).every((token) => !token.isContent || token.isFiller);
    const headStart = (head) => head.detTok >= 0 ? head.detTok : head.startTok;
    const bodyMarker = (head) => ['of', ':'].includes(tokens[head.endTok + 1]?.lower);
    const directiveStarts = new Set(writtenPredicates.filter(({ startTok, endTok }) =>
      !(tokens[endTok + 1]?.lower === 'by' && (chartFieldRole(tokens[startTok], kb) ||
        tokens[startTok].lower.endsWith('ed')))).map(({ startTok }) => startTok));
    const boundaries = splitPoints.filter(({ isStrong, endTok }) => isStrong || directiveStarts.has(endTok + 1));
    const sourceDimensions = new Set();
    const emitField = (field, predicate) => {
      if (field.cueStart !== undefined) {
        emit({
          kind: HYP_KINDS.KEY_WORD, startTok: field.cueStart, endTok: field.cueEnd, attrs: [field.attribute],
          families: ['chart'], chartAxisPair: field.chartAxisAssignment ? field.chartAxisPair : null,
          chartAxisAssignment: field.chartAxisAssignment, cost: 0,
        });
      }
      emitConstraint(field.attribute, field.value, field.startTok, field.endTok, {
        phase: 'result', requiresKeyWord: field.cueStart !== undefined, chartCreationPredicate: predicate.startTok,
        chartCreationScope: [predicate.scopeStart ?? predicate.startTok, Math.max(field.endTok, predicate.scopeEnd ?? -1)],
        chartAxisPair: field.chartAxisPair,
        chartAxisOrder: field.chartAxisOrder,
        chartAxisAssignment: field.chartAxisAssignment,
        chartSourceHead: field.chartSourceHead,
        words: src.slice(tokens[field.wordsStart].start, tokens[field.endTok].end), cost: 1,
      });
    };
    const literalField = (startTok, endTok) => tokens[startTok].kind === 'quote' && startTok === endTok
      ? tokens[startTok].inner : src.slice(tokens[startTok].start, tokens[endTok].end);
    if (tabKeys.has('chart.measure') && tabKeys.has('chart.dimension')) {
      for (const { nominalStart, startTok: benefit } of politeSpans) {
        if (nominalStart == null) continue;
        const owner = chartHeads.find((head) => headStart(head) === nominalStart &&
          head.endTok < benefit && tokens[head.endTok + 1]?.lower === 'of');
        if (!owner) continue;
        const first = owner.endTok + 2;
        const grouping = tokens.slice(first, benefit).findIndex(({ kind, lower }) => kind === 'word' && lower === 'by') + first;
        if (grouping <= first || grouping + 1 >= benefit ||
            chartFieldRole(tokens[grouping - 1], kb) ||
            tokens.slice(grouping + 1, benefit).some(({ kind, lower }) => kind === 'word' && lower === 'by') ||
            tokens.slice(first, grouping).some(({ kind, lower }) =>
              kind === 'word' && ['against', 'versus', 'vs'].includes(lower)) ||
            tokens.slice(first, benefit).some(({ kind }) => kind !== 'word' && kind !== 'quote')) continue;
        const measureStart = tokens[first].lower === 'the' && first + 1 < grouping ? first + 1 : first;
        const creation = { startTok: -1, scopeStart: owner.startTok, scopeEnd: benefit - 1 };
        const chartSourceHead = [owner.startTok, owner.endTok];
        emitField({ attribute: 'chart.measure', value: literalField(measureStart, grouping - 1),
          startTok: measureStart, endTok: grouping - 1, wordsStart: first, chartSourceHead }, creation);
        emitField({ attribute: 'chart.dimension', value: literalField(grouping + 1, benefit - 1),
          startTok: grouping + 1, endTok: benefit - 1, wordsStart: grouping + 1,
          cueStart: grouping, cueEnd: grouping, chartSourceHead }, creation);
      }
    }
    for (let i = 0; i < T; i++) {
      const marker = tokens[i].lower;
      if (tokens[i].kind === 'word' && ['against', 'versus', 'vs'].includes(marker) &&
          tabKeys.has('chart.xField') && tabKeys.has('chart.yField')) {
        const boundary = boundaries.reduce((last, { endTok }) => endTok < i ? Math.max(last, endTok) : last, -1);
        const limit = boundaries.reduce((next, { startTok }) => startTok > i ? Math.min(next, startTok) : next, T);
        const owner = [...chartHeads, ...scatterLabels].find((head) => head.startTok > boundary && head.endTok < limit &&
          tokens.slice(Math.max(boundary + 1, head.startTok - 1), head.endTok + 1).some(({ kind, lower }) =>
            kind === 'word' && lower === 'scatter'));
        if (owner) {
          const predicate = creationPredicates.find((p) =>
            p.startTok > boundary && p.endTok < Math.min(owner.startTok, i) &&
            startsClause(p.startTok, boundary));
          const bare = owner.endTok < i && bodyMarker(owner) && startsClause(headStart(owner), boundary);
          const creation = predicate ? { ...predicate, scopeEnd: owner.endTok } :
            bare ? { startTok: -1, scopeStart: owner.startTok, scopeEnd: owner.endTok } : null;
          let labelEnd = owner.endTok;
          if (owner.endTok < i) {
            for (let j = owner.endTok + 1; j + 2 < i; j++) {
              if (scatterLabelAt(j)) labelEnd = j;
            }
          }
          const yStart = owner.endTok < i ? labelEnd + 2 : (predicate?.endTok ?? i) + 1;
          const plotted = marker === 'against' && tokens[i - 1]?.kind === 'word' &&
            lemmatiseVerb(tokens[i - 1].lower, kb).includes('plot');
          const cue = plotted ? i - 1 : i;
          let xEnd = chartFieldEnd(tokens, i + 1, limit, kb);
          for (let j = i + 2; j < xEnd; j++) {
            if (tokens[j].kind === 'word' && ['for', 'from', 'only', 'just', 'with'].includes(tokens[j].lower)) {
              xEnd = j;
              break;
            }
          }
          const ownerMarker = headStart(owner) - 1;
          const ownerLinked = owner.endTok < i ? bodyMarker(owner) || labelEnd !== owner.endTok :
            ['as', 'in', 'on'].includes(tokens[ownerMarker]?.lower) && ownerMarker >= xEnd;
          const fields = [tokens.slice(yStart, cue), tokens.slice(i + 1, xEnd)];
          if (creation && ownerLinked && fields.every((span) => span.length > 0 &&
              (span.length === 1 && span[0].kind === 'quote' || span.every(({ kind, lower }) =>
                kind === 'word' && !['against', 'versus', 'vs'].includes(lower))))) {
            let orders = marker === 'against' ? [['chart.yField', 'chart.xField']] :
              [['chart.yField', 'chart.xField'], ['chart.xField', 'chart.yField']];
            const qualifierStart = xEnd + (tokens[xEnd]?.text === ',' ? 1 : 0);
            const qualifier = tokens[qualifierStart]?.lower;
            let assignment;
            if (orders.length > 1 && qualifier === 'with') {
              const forms = chartFieldAxisForms(kb);
              for (const [fieldIndex, field] of fields.entries()) {
                const on = qualifierStart + 1 + field.length;
                const axisStart = on + (tokens[on + 1]?.lower === 'the' ? 2 : 1);
                if (tokens[on]?.lower !== 'on' || !field.every((token, offset) => {
                  const written = tokens[qualifierStart + 1 + offset];
                  return written?.kind === token.kind && written.lower === token.lower;
                })) continue;
                const limitWith = chartFieldEnd(tokens, axisStart, limit, kb);
                const axis = forms.find(({ words }) => axisStart + words.length === limitWith &&
                  words.every((word, offset) => tokens[axisStart + offset]?.kind === 'word' &&
                    tokens[axisStart + offset].lower === word));
                if (!axis) continue;
                orders = orders.filter((order) => order[fieldIndex] === axis.attribute);
                assignment = { fieldIndex, cueStart: qualifierStart, cueEnd: limitWith - 1,
                  chartAxisAssignment: true };
              }
            }
            if (assignment && orders.length) {
              emit({
                kind: HYP_KINDS.UNREAD, startTok: assignment.cueStart, endTok: assignment.cueEnd,
                note: 'scatter axis assignment', chartAxisPair: i, chartAxisAssignment: true,
                chartCreationPredicate: creation.startTok,
                chartCreationScope: [creation.scopeStart ?? creation.startTok, assignment.cueEnd], cost: 0,
              });
            }
            for (const [chartAxisOrder, [left, right]] of orders.entries()) {
              const comparison = { cueStart: cue, cueEnd: i };
              emitField({ attribute: left, value: literalField(yStart, cue - 1),
                startTok: yStart, endTok: cue - 1, wordsStart: yStart, chartAxisPair: i, chartAxisOrder,
                ...(assignment?.fieldIndex === 0 ? assignment : assignment ? comparison : {}) }, creation);
              emitField({ attribute: right, value: literalField(i + 1, xEnd - 1),
                startTok: i + 1, endTok: xEnd - 1, wordsStart: i + 1,
                ...(assignment?.fieldIndex === 1 ? assignment : comparison),
                chartAxisPair: i, chartAxisOrder }, creation);
            }
            if (['for', 'just'].includes(qualifier)) {
              const qualifierEnd = chartFieldEnd(tokens, qualifierStart, limit, kb);
              const words = tokens.slice(qualifierStart + 1, qualifierEnd);
              if (words.some(({ isContent }) => isContent) &&
                  (qualifier === 'just' || words.some(({ lower }) => lower === 'only'))) {
                emit({
                  kind: HYP_KINDS.UNREAD, startTok: qualifierStart, endTok: qualifierEnd - 1,
                  note: 'scatter qualifier', chartAxisPair: i,
                  chartCreationScope: [creation.scopeStart ?? creation.startTok,
                    Math.max(qualifierEnd - 1, creation.scopeEnd)], cost: 0,
                });
              }
            }
          }
        }
      }
      if (tokens[i + 1]?.lower === 'by' && i + 2 < T) {
        const colourCode = tokens[i].kind === 'word' && tokens[i].lower === 'coded' &&
          /^(?:colour|color)$/.test(tokens[i - 1]?.lower);
        const cueStart = colourCode ? i - 1 : i;
        const attribute = chartFieldRole(tokens[cueStart], kb);
        if (attribute) {
          const boundary = boundaries.reduce((last, { endTok }) => endTok < i ? Math.max(last, endTok) : last, -1);
          const limit = boundaries.reduce((next, { startTok }) => startTok > i ? Math.min(next, startTok) : next, T);
          let fieldEnd = chartFieldEnd(tokens, i + 2, limit, kb);
          while (fieldEnd > i + 2 && tokens[fieldEnd - 1].isFiller) fieldEnd--;
          const owner = chartHeads.find((head) => head.startTok > boundary && head.endTok < limit &&
            (head.endTok < i || (head.startTok > fieldEnd && ['as', 'in'].includes(tokens[fieldEnd]?.lower))));
          const predicate = owner?.det === 'indefinite' && creationPredicates.find((p) =>
            p.startTok > boundary && p.endTok < Math.min(owner.startTok, i) &&
            startsClause(p.startTok, boundary));
          const bareChart = owner && owner.endTok < i && bodyMarker(owner) && startsClause(headStart(owner), boundary);
          const creation = predicate ? { ...predicate, scopeEnd: owner.endTok } : bareChart ? {
            startTok: -1, endTok: owner.startTok - 1, scopeStart: owner.startTok, scopeEnd: owner.endTok,
          } : null;
          if (creation && fieldEnd > i + 2) {
            let fieldAttribute = attribute;
            const bodyStart = owner.endTok < i ? owner.endTok + 1 : creation.endTok + 1;
            const body = tokens.slice(bodyStart, i);
            const writtenSeries = tokens[i - 1]?.lower === 'series' ||
              (tokens[i - 1]?.lower === 'line' && tokens[i - 2]?.lower === 'a' && tokens[i - 3]?.lower === 'with' &&
                tabKeys.get('chart.type')?.values?.has('line'));
            if (attribute === 'chart.seriesDimension' && !writtenSeries &&
                !body.some(({ lower }, offset) => lower === 'by' && !chartFieldRole(tokens[bodyStart + offset - 1], kb))) {
              // A distribution over one field is the primary dimension.
              // An additional series field needs separate grouping evidence.
              if (!tabKeys.has('chart.dimension') || !body.some(({ lower }) => lower === 'how')) continue;
              fieldAttribute = 'chart.dimension';
              const how = body.findIndex(({ lower }) => lower === 'how');
              const subject = bodyStart + how + 1;
              if (tabKeys.has('diagram.about') && subject < i &&
                  tokens.slice(subject, i).every(({ kind }) => kind === 'word')) {
                const introducer = tokens[subject - 2]?.lower;
                const showing = introducer && lemmatiseVerb(introducer, kb).includes('show');
                emitField({ attribute: 'diagram.about', value: literalField(subject, i - 1),
                  startTok: subject, endTok: i - 1, wordsStart: subject,
                  ...(showing ? { cueStart: subject - 2, cueEnd: subject - 1 } : {}) }, creation);
              }
            }
            emitField({ attribute: fieldAttribute, value: literalField(i + 2, fieldEnd - 1), startTok: i + 2,
              endTok: fieldEnd - 1, wordsStart: i + 2, cueStart, cueEnd: i + 1 }, creation);
            if (tabKeys.has('chart.dimension') && !sourceDimensions.has(owner.startTok) &&
                owner.endTok < i && tokens[owner.endTok + 1]?.lower === 'of') {
              const first = owner.endTok + 2;
              let end = first;
              while (end < i && !tokens[end].isPunct) end++;
              const grouping = tokens.slice(first, end).findIndex(({ lower }) => lower === 'by') + first;
              if (grouping > first && grouping + 1 < end && !chartFieldRole(tokens[grouping - 1], kb) &&
                  !tokens.slice(grouping + 1, end).some(({ lower }) => lower === 'by')) {
                const valueEnd = chartFieldEnd(tokens, grouping + 1, end, kb);
                if (valueEnd > grouping + 1) {
                  emitField({ attribute: 'chart.dimension', value: literalField(grouping + 1, valueEnd - 1),
                    startTok: grouping + 1, endTok: valueEnd - 1, wordsStart: grouping + 1,
                    cueStart: grouping, cueEnd: grouping }, creation);
                  sourceDimensions.add(owner.startTok);
                }
              }
            }
          }
        }
      }
      if (!['with', 'without', ','].includes(marker)) continue;
      const negated = tokens[i + 1]?.lower === 'no';
      const first = i + (negated || DET_MAP.has(tokens[i + 1]?.lower) ? 2 : 1);
      let field;
      if (marker === 'with' && tabKeys.has('chart.yMin')) {
        const zero = matchZeroBasedAt(tokens, first);
        if (zero) {
          const cueStart = zero.endTok + 1;
          const axisEnd = ['y', 'value'].includes(tokens[cueStart]?.lower) && tokens[cueStart + 1]?.lower === 'axis'
            ? cueStart + 1 : tokens[cueStart]?.lower === 'y-axis' ? cueStart : -1;
          if (axisEnd >= 0) field = { ...zero, attribute: 'chart.yMin', cueStart, cueEnd: axisEnd };
        }
      }
      if (!field && legendKey?.values && tokens[first]?.kind === 'word' && tokens[first].lower === 'legend') {
        const hide = marker === 'without' || negated;
        const position = hide ? null : matchLegendPosition(tokens, first + 1, T, legendKey);
        if (position) field = { ...position, attribute: legendKey.name, cueStart: first, cueEnd: first };
        else if (marker !== ',' || negated) {
          const value = hide ? 'hide' : 'show';
          if (legendKey.values.has(value)) {
            field = { attribute: legendKey.name, value, startTok: hide ? i : first, endTok: first, wordsStart: i };
          }
        }
      }
      if (!field) continue;
      const stop = (field.endTok > (field.cueEnd ?? -1) ? field.endTok : field.cueEnd) + 1;
      if (tokens[stop]?.isContent && !tokens[stop]?.isFiller) continue;
      const boundary = boundaries.reduce((last, { endTok }) => endTok < i ? Math.max(last, endTok) : last, -1);
      const owner = chartHeads.find((head) => head.det === 'indefinite' && head.startTok > boundary && head.endTok < i);
      const predicate = owner && creationPredicates.find((p) =>
        p.startTok > boundary && p.endTok < owner.startTok &&
        tokens.slice(boundary + 1, p.startTok).every((token) => !token.isContent || token.isFiller));
      if (!predicate) continue;
      emitField(field, predicate);
    }
  }
  const typeMentions = rawCandidates.filter((c) => CREATION_TYPE_KEYS.has(c.attribute) &&
    c.startTok < c.endTok && !c.requiresKeyWord && tabKeys.get(c.attribute)?.values?.has(c.value.toLowerCase()));
  for (const c of typeMentions) {
    const startTok = c.startTok - 1;
    const modifier = mapGet(kb?.grammar?.determiners, tokens[startTok]?.lower);
    if (modifier?.kind !== 'modifier' || modifier.meaning !== 'one-more') continue;
    const { det, detTok } = checkDetBefore(startTok);
    if (det !== 'none' && det !== 'indefinite') continue;
    const nounStart = detTok >= 0 ? detTok : startTok;
    const followsCreation = creationPredicates.some((pred) => pred.endTok < nounStart &&
      tokens.slice(pred.endTok + 1, nounStart).every((tok) => tok.isGrammar && !tok.isPunct));
    if (!followsCreation) continue;
    const head = tokens[c.endTok].lower;
    const familiesForHead = toArray(mapGet(familyWords, head));
    emit({
      ...c, startTok, creationOnly: true,
      hasCreationFamilyHead: head === c.family || (familiesForHead.length === 1 && familiesForHead[0] === c.family),
      words: src.slice(tokens[startTok].start, tokens[c.endTok].end),
    });
  }

  // A typed chart or diagram with an explicit subject complement uses the
  // declared diagram topic role. The full operand is literal topic evidence.
  const diagramTopicFrame = kb.grammar.frames?.get('acts.make.diagram');
  const topicIndex = diagramTopicFrame?.parts.findIndex(({ role }) => role === 'topic') ?? -1;
  const explicitTopicCue = diagramTopicFrame?.parts.slice(0, topicIndex)
    .some(({ words }) => words.includes('about'));
  if (catalog && explicitTopicCue && tabKeys.has('diagram.about') && tokens.some(({ lower }) => lower === 'about')) {
    const heads = rawCandidates.filter((head) =>
      [HYP_KINDS.TARGET_FAMILY, HYP_KINDS.TARGET_SORT].includes(head.kind) &&
      ['chart', 'diagram'].includes(head.family) && tokens[head.endTok + 1]?.lower === 'about');
    const predicates = rawCandidates.filter(({ kind }) => kind === HYP_KINDS.PREDICATE);
    const predicateStarts = new Set(predicates.map(({ startTok }) => startTok));
    const directiveStarts = new Set(splitPoints.filter(({ isStrong, endTok }) => isStrong ||
      predicateStarts.has(endTok + 1)).map(({ startTok }) => startTok));
    for (const head of heads) {
      const nounStart = head.detTok >= 0 ? head.detTok : head.startTok;
      const predicate = creationPredicates.find(({ endTok }) => endTok < nounStart &&
        tokens.slice(endTok + 1, nounStart).every((token) => token.isGrammar && !token.isPunct));
      if (!predicate) continue;
      const cue = head.endTok + 1;
      const first = cue + 1;
      if (!tokens[first] || tokens[first].isPunct || directiveStarts.has(first)) continue;
      let last = first;
      if (tokens[first].kind !== 'quote') {
        while (last + 1 < T && !tokens[last + 1].isPunct && !directiveStarts.has(last + 1) &&
            !isNamingContinuationAt(last + 1) && !NAME_INTRO_WORDS.has(tokens[last + 1].lower)) last++;
      }
      const value = tokens[first].kind === 'quote' ? tokens[first].inner :
        src.slice(tokens[first].start, tokens[last].end);
      if (!value.trim()) continue;
      emit({
        kind: HYP_KINDS.KEY_WORD, startTok: cue, endTok: cue, attrs: ['diagram.about'],
        families: [head.family], cost: 0,
      });
      emitConstraint('diagram.about', value, first, last, {
        phase: 'result', requiresKeyWord: true, predicateRole: predicate.startTok,
        predicateRoleFamily: head.family, cost: 1,
      });
    }
  }

  // A textual creation frame distinguishes dictated content from title/name
  // cues. The contents can begin with a preposition or contain a conjunction.
  const textCreationFrame = kb.grammar.frames?.get('acts.text.make.text');
  const valueSlot = textCreationFrame?.parts.findIndex(({ role }) => role === 'value') ?? -1;
  const dictationCues = textCreationFrame?.parts[valueSlot - 1]?.words
    .filter((cue) => /^(?:that (?:says|reads)|says|with the text)$/.test(cue)) ?? [];
  if (dictationCues.length) {
    const nounHeads = rawCandidates.filter(({ kind }) =>
      [HYP_KINDS.TARGET_SORT, HYP_KINDS.TARGET_FAMILY].includes(kind));
    const nounStartOf = ({ detTok, startTok }) => detTok >= 0 ? detTok : startTok;
    const bodyText = tabKeys.get('text.content')?.means;
    const declaredContent = (head) => {
      const content = `${head.family}.content`;
      if (tabKeys.has(content)) return content;
      const text = `${head.family}.text`;
      return bodyText && tabKeys.get(text)?.means === bodyText ? text : null;
    };
    const contentAttribute = (head) => {
      const content = declaredContent(head);
      if (content) return content;
      // In a compound such as "text box", a textual modifier licenses
      // the declared written label of the selected diagram node.
      if (head.family === 'node' && tabKeys.has('node.label') &&
          !nounHeads.some((other) => other.startTok === head.startTok && other.endTok === head.endTok && declaredContent(other)) &&
          nounHeads.some((modifier) => modifier.endTok + 1 === head.startTok &&
            nounStartOf(modifier) === nounStartOf(head) && declaredContent(modifier))) return 'node.label';
      return null;
    };
    const typedHeads = nounHeads.flatMap((head) => {
      const attribute = contentAttribute(head);
      return attribute ? [{ ...head, attribute }] : [];
    });
    const namedRefs = rawCandidates.filter(({ kind, name, isPronoun }) =>
      kind === HYP_KINDS.TARGET_REF && name && !isPronoun);
    const cues = new Map();
    for (let start = 0; start < T; start++) {
      for (const phrase of dictationCues) {
        const length = phrase.split(' ').length;
        if (spanTextLower(tokens, start, start + length - 1) === phrase) cues.set(start, length);
      }
    }
    const predicates = rawCandidates.filter(({ kind }) => kind === HYP_KINDS.PREDICATE);
    const creations = predicates.filter(({ licensed }) => licensed?.some(({ act }) => act === 'make'));
    const targetStarts = new Set(rawCandidates.filter(({ kind }) =>
      [HYP_KINDS.TARGET_SORT, HYP_KINDS.TARGET_FAMILY, HYP_KINDS.TARGET_REF].includes(kind))
      .map(({ detTok, startTok }) => detTok >= 0 ? detTok : startTok));
    const directiveCuts = new Set(splitPoints.filter((cut) =>
      cut.isStrong || predicates.some((candidate) => candidate.startTok === cut.endTok + 1 &&
        (targetStarts.has(candidate.endTok + 1) || candidate.licensed?.some(({ act }) => ['undo', 'redo'].includes(act)))) ||
      typedHeads.some(({ detTok }) => detTok === cut.endTok + 1)).map(({ startTok }) => startTok));
    for (const head of typedHeads) {
      let cueStart = head.endTok + 1;
      let parent;
      const parentKey = `${head.family}.parent`;
      if (!cues.has(cueStart) && tabKeys.has(parentKey) && tokens[cueStart]?.lower === 'under') {
        parent = namedRefs.find((ref) => ref.startTok === cueStart + 1 && cues.has(ref.endTok + 1));
        if (parent) cueStart = parent.endTok + 1;
      }
      if (!cues.has(cueStart)) continue;
      const nounStart = nounStartOf(head);
      const predicate = creations.find((candidate) => candidate.endTok < nounStart &&
        tokens.slice(candidate.endTok + 1, nounStart).every((token) => token.isGrammar && !token.isPunct));
      if (!predicate) continue;
      const valStart = cueStart + cues.get(cueStart);
      if (valStart >= T || tokens[valStart].isPunct) continue;
      let valEnd = valStart;
      if (tokens[valStart].kind !== 'quote') {
        while (valEnd + 1 < T && !tokens[valEnd + 1].isPunct && !directiveCuts.has(valEnd + 1)) {
          valEnd++;
        }
      }
      const attr = head.attribute;
      emit({
        kind: HYP_KINDS.KEY_WORD,
        startTok: cueStart,
        endTok: valStart - 1,
        attrs: [attr],
        families: [head.family],
        cost: 0,
      });
      const value = tokens[valStart].kind === 'quote' ? tokens[valStart].inner :
        src.slice(tokens[valStart].start, tokens[valEnd].end);
      if (!value.trim()) continue;
      emitConstraint(attr, value, valStart, valEnd, {
        phase: 'result', requiresKeyWord: true, predicateRole: predicate.startTok, dictatedContent: true, cost: 1,
      });
      if (parent) {
        emitConstraint(parentKey, parent.name, head.endTok + 1, parent.endTok, {
          phase: 'result', words: parent.text, cost: 1,
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 10k. Dynamic w.lang.en.frame Compiler (SOP Lang argument-structure frames)
  // -------------------------------------------------------------------------
  const rawFrameMatches = matchFrames(tokens, src, {
    kb, tabSpec: catalog ?? kb.tabs[tab], splitPoints, candidates: rawCandidates,
    predicates: rawCandidates.filter((c) => c.kind === HYP_KINDS.PREDICATE && c.licensed?.length),
  });
  const frameMatches = applyFrameMatchesToLattice(rawFrameMatches, {
    tokens,
    text: src,
    kb,
    tabSpec: catalog ?? kb.tabs[tab],
    candidates: rawCandidates,
    emit,
    emitConstraint,
    parseNumeric,
  });

  // -------------------------------------------------------------------------
  // 11. UNREAD fallback candidates (every content token + 2..3 token phrases)
  // -------------------------------------------------------------------------
  for (let i = 0; i < T; i++) {
    if (!tokens[i].isContent) continue;
    emit({
      kind: HYP_KINDS.UNREAD,
      startTok: i,
      endTok: i,
      cost: 120,
    });

    for (let len = 2; len <= 3 && i + len <= T; len++) {
      const e = i + len - 1;
      if (hasPunctInSpan(tokens, i, e)) break;
      if (!tokens[e].isContent) continue;
      let contentCount = 0;
      for (let k = i; k <= e; k++) {
        if (tokens[k].isContent) contentCount++;
      }
      if (contentCount < 2) continue;
      emit({
        kind: HYP_KINDS.UNREAD,
        startTok: i,
        endTok: e,
        cost: 105 * contentCount,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Deduplicate identical candidates (keeping lowest cost) & assign IDs
  // -------------------------------------------------------------------------
  const deduped = new Map();
  for (const c of rawCandidates) {
    const key = [
      c.kind,
      c.startTok,
      c.endTok,
      c.attribute ?? '',
      c.value ?? '',
      c.family ?? '',
      c.sort ?? '',
      c.fill ?? '',
      c.name ?? '',
      c.negWant ?? '',
      c.operator ?? '',
      c.step ?? '',
      c.phase ?? '',
      c.isAnchor ? 1 : 0,
      c.partHead?.join(':') ?? '',
      c.isPropertyOwner ? 1 : 0,
      c.requiresKeyWord ? 1 : 0,
      c.rolePredicate ?? '',
      c.chartEditPredicate ?? '',
      c.chartCreationPredicate ?? '',
      c.chartAxisPair ?? '',
      c.chartAxisOrder ?? 0,
      c.chartAxisAssignment ? 1 : 0,
      c.chartSourceHead?.join(':') ?? '',
      c.chartEditEnd ? 1 : 0,
      c.modalOutput ? 1 : 0,
      c.predicateTargetHeads ? 1 : 0,
      c.predicateRole ?? '',
      c.predicateRoleFamily ?? '',
      c.dictatedContent ? 1 : 0,
      c.targetless ? 1 : 0,
      c.creationOnly ? 1 : 0,
      c.pairedConstraints ? JSON.stringify(c.pairedConstraints) : '',
      c.attrs ? c.attrs.join(',') : '',
    ].join('|');

    const prev = deduped.get(key);
    if (!prev || c.cost < prev.cost) {
      if (prev?.valueEvidence) c.valueEvidence = true;
      deduped.set(key, c);
    } else if (c.valueEvidence) {
      prev.valueEvidence = true;
    }
  }

  const candidates = [...deduped.values()].sort(
    (a, b) => a.startTok - b.startTok || a.endTok - b.endTok || a.kind.localeCompare(b.kind) || a.cost - b.cost
  );
  for (let idx = 0; idx < candidates.length; idx++) {
    candidates[idx].id = idx;
  }

  return {
    text: src,
    ...(catalog ? { catalog } : { tab }),
    previous,
    clock,
    tokens,
    candidates,
    frameMatches,
    coordinatedChanges: pairResultativeFrames(rawFrameMatches),
    nonDirectives,
    politeSpans,
    purposeSpans,
    splitPoints,
    hasQuestionMark: src.includes('?'),
  };
}
