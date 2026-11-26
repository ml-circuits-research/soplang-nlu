// Shared contracts and schema constants for nl-formaliser.
// All enums match sop-knowledge-worlds/docs/worlds/w.request/schema.sop and smt/prelude.smt2 1-to-1.

export const TABS = ['drawing', 'diagram', 'document', 'calendar'];
export const CREATION_TYPE_KEYS = new Set(['chart.type', 'diagram.kind']);

export const ACTS = [
  'make',
  'change',
  'place',
  'remove',
  'ask',
  'connect',
  'group',
  'take apart',
  'pick',
  'copy',
  'undo',
  'redo',
  'save',
  'load',
  'send',
  'deselect',
  'greet',
  'thank',
  'farewell',
];

export const ACT_MODES = [
  'none',
  'arrange',
  'merge',
  'ungroup',
  'split',
  'disconnect',
  'reverse',
  'set',
  'repeat',
];

export const MOODS = ['do', 'ask', 'check', 'propose'];

export const QUESTIONS = [
  'none',
  'count',
  'exists',
  'list',
  'what',
  'which',
  'where',
  'when',
  'who',
  'describe',
  'why',
  'how',
  'how_much',
  'compare',
  'total',
  'average',
  'max',
  'min',
  'difference',
  'percent',
];

export const TARGET_MODES = ['new', 'existing', 'bound'];

export const TARGET_FILLS = ['none', 'written', 'context', 'description', 'all', 'journal_step'];

export const DETERMINERS = ['none', 'definite', 'indefinite', 'quantified', 'possessive', 'demonstrative'];

export const PHASES = ['result', 'selector'];

export const WANTS = ['yes', 'no', 'not_all'];

export const OPERATORS = ['eq', 'degree', 'delta', 'factor', 'relation', 'region', 'less.equal', 'greater.equal'];

export const ONS = ['attribute', 'place', 'size', 'count', 'kind', 'extent', 'manner', 'layout', 'with', 'about', 'length'];

export const STEPS = ['none', 'more', 'much_more', 'less', 'much_less'];

export const HYP_KINDS = Object.freeze({
  FILLER: 'FILLER',
  GRAMMAR: 'GRAMMAR',
  SEP: 'SEP',
  PREDICATE: 'PREDICATE',
  TARGET_SORT: 'TARGET_SORT',
  TARGET_FAMILY: 'TARGET_FAMILY',
  TARGET_REF: 'TARGET_REF',
  KEY_WORD: 'KEY_WORD',
  CONSTRAINT: 'CONSTRAINT',
  INTENT: 'INTENT',
  NEG: 'NEG',
  UNREAD: 'UNREAD',
});

export function isIndependentValueCandidate(candidate) {
  return candidate.kind === HYP_KINDS.CONSTRAINT &&
    !candidate.requiresKeyWord && !candidate.openValue &&
    !candidate.isAnchor && !candidate.needsAnchor && !candidate.pairedConstraints?.length &&
    candidate.valueEvidence;
}

// Default target family per tab when no explicit sort or family word is present.
export const DEFAULT_TAB_FAMILY = Object.freeze({
  drawing: 'drawn',
  diagram: 'node',
  document: 'section',
  calendar: 'meeting',
});

// Existing reader relationships between a target and related property families.
const RELATED_PROPERTY_FAMILIES = new Map([
  ['drawn', ['page', 'part', 'group', 'composition', 'preference']],
  ['part', ['drawn', 'page']],
  ['page', ['drawn', 'composition', 'preference', 'diagram', 'chart', 'node']],
  ['group', ['drawn', 'node', 'chart', 'diagram', 'page']],
  ['composition', ['drawn', 'page', 'diagram', 'chart', 'node']],
  ['preference', ['page', 'drawn', 'diagram', 'chart']],
  ['chart', ['group', 'series', 'point', 'page', 'diagram', 'composition', 'preference']],
  ['node', ['link', 'group', 'diagram', 'page', 'sketch', 'preference']],
  ['link', ['node', 'diagram', 'page']],
  ['diagram', ['node', 'link', 'group', 'chart', 'page', 'composition', 'preference']],
  ['series', ['chart', 'point']],
  ['point', ['chart', 'series']],
  ['sketch', ['node', 'link', 'diagram']],
  ['section', ['block', 'text', 'document', 'inline']],
  ['block', ['section', 'inline', 'text', 'document']],
  ['text', ['section', 'block', 'inline', 'document']],
  ['document', ['section', 'block', 'inline', 'text']],
  ['inline', ['section', 'block', 'text', 'document']],
  ['meeting', ['calendar', 'room', 'person']],
  ['calendar', ['meeting', 'room', 'person']],
  ['room', ['meeting']],
  ['person', ['meeting']],
]);

export function acceptsPropertyFamily(targetFamily, propertyFamily) {
  return targetFamily === propertyFamily || Boolean(RELATED_PROPERTY_FAMILIES.get(targetFamily)?.includes(propertyFamily));
}

// Equivalent key aliases across keys.sop (used ONLY in eval/compare.mjs for fair alias-aware metrics).
export const KEY_ALIASES = Object.freeze({
  'drawn.color': 'drawn.colour',
  'drawn.side': 'drawn.at',
  'drawn.edge': 'drawn.at',
  'part.color': 'part.colour',
  'part.value': 'part.variant',
  'chart.showValues': 'chart.show_values',
  'chart.valueLabels': 'chart.show_values',
  'chart.showLegend': 'chart.legend',
  'chart.gridlines': 'chart.grid',
  'chart.stacked': 'chart.stacking',
  'chart.horizontal': 'chart.orientation',
  'chart.layout': 'chart.type',
  'chart.label': 'chart.title',
  'chart.max': 'chart.yMax',
  'chart.min': 'chart.yMin',
  'group.layout': 'chart.type',
  'group.label': 'chart.title',
  'group.values': 'chart.values',
  'group.labels': 'chart.labels',
  'node.kind': 'node.shape',
  'diagram.background': 'page.background',
  'block.mark': 'inline.format',
  'section.mark': 'inline.format',
  'document.title': 'text.title',
  'document.genre': 'text.genre',
  'document.words': 'text.words',
  'document.chapters': 'text.chapters',
  'document.topic': 'text.about',
  'meeting.agenda': 'meeting.notes',
  'meeting.participants': 'meeting.people',
  'meeting.duration': 'meeting.length',
  'room.seats': 'room.capacity',
});

// Map a JS act string to its SMT-LIB2 Act constructor symbol.
export function actToSmt(act) {
  return 'ACT_' + String(act).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

export function modeToSmt(mode) {
  return 'MODE_' + String(mode || 'none').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

export function moodToSmt(mood) {
  return 'MOOD_' + String(mood || 'do').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

export function questionToSmt(q) {
  return 'Q_' + String(q || 'none').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

export function tmodeToSmt(m) {
  return 'TM_' + String(m || 'existing').toUpperCase();
}

export function tfillToSmt(f) {
  return 'TF_' + String(f || 'none').toUpperCase();
}

export function detToSmt(d) {
  return 'DET_' + String(d || 'none').toUpperCase();
}

export function phaseToSmt(p) {
  return 'PH_' + String(p || 'result').toUpperCase();
}

export function wantToSmt(w) {
  return 'W_' + String(w || 'yes').toUpperCase();
}

// Inverse maps from SMT symbols to w.request values.
export const SMT_TO_ACT = Object.fromEntries(ACTS.map((a) => [actToSmt(a), a]));
export const SMT_TO_MODE = Object.fromEntries(ACT_MODES.map((m) => [modeToSmt(m), m]));
export const SMT_TO_MOOD = Object.fromEntries(MOODS.map((m) => [moodToSmt(m), m]));
export const SMT_TO_QUESTION = Object.fromEntries(QUESTIONS.map((q) => [questionToSmt(q), q]));
export const SMT_TO_TMODE = Object.fromEntries(TARGET_MODES.map((m) => [tmodeToSmt(m), m]));
export const SMT_TO_TFILL = Object.fromEntries(TARGET_FILLS.map((f) => [tfillToSmt(f), f]));
export const SMT_TO_DET = Object.fromEntries(DETERMINERS.map((d) => [detToSmt(d), d]));
export const SMT_TO_PHASE = Object.fromEntries(PHASES.map((p) => [phaseToSmt(p), p]));
export const SMT_TO_WANT = Object.fromEntries(WANTS.map((w) => [wantToSmt(w), w]));

// Infer default `on=` from a w.request attribute name and operator (matches official-dataset/sop_dataset.py).
export function defaultOnFor(attribute, operator = 'eq') {
  if (!attribute) return 'attribute';
  const shortKey = attribute.includes('.') ? attribute.split('.').slice(1).join('.') : attribute;
  if (operator === 'relation') return 'place';
  if (shortKey === 'relation' || shortKey === 'anchor' || shortKey === 'position' || shortKey === 'order' || shortKey === 'order_anchor' || shortKey === 'relation_anchor') {
    return 'place';
  }
  if (shortKey === 'count' || shortKey === 'n') return 'count';
  if ((operator === 'degree' || operator === 'delta' || operator === 'factor') && ['size', 'scale', 'width', 'height', 'length'].includes(shortKey)) {
    return 'size';
  }
  return 'attribute';
}

// Unquote a SOP Lang token value cleanly.
export function unquoteSop(v) {
  if (v === undefined || v === null) return '';
  const s = String(v);
  if (s.startsWith('"') && s.endsWith('"')) {
    try { return JSON.parse(s); } catch { return s.slice(1, -1); }
  }
  return s;
}

// Format a value as a valid SOP Lang atom or JSON-quoted string.
const SOP_ATOM_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const SOP_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

export function fmtSopValue(v, { asString = false, forceRaw = false } = {}) {
  if (forceRaw) return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  const s = String(v);
  if (!asString && SOP_DATETIME_RE.test(s)) return s;
  if (!asString && SOP_ATOM_RE.test(s) && s !== 'true' && s !== 'false') return s;
  return JSON.stringify(s);
}
