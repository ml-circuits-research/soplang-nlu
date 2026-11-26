// Dynamic w.lang.en.frame Compiler for nl-formaliser.
// Compiles declarative SOP Lang frames from `kb.grammar.frames` (property-frames.sop,
// diagram-frames.sop, role-frames.sop, shape-frames.sop, frames-acts*.sop, etc.) into
// structured argument-attachment hypotheses for Z3 MaxSMT (`src/smt/encode.mjs`).
//
// Zero hardcoded sentence templates: every frame pattern, lexicon, role, and fixed slot
// is read dynamically from `sop-knowledge-worlds`.

import { HYP_KINDS, ACTS, ACT_MODES, isIndependentValueCandidate } from '../contracts.mjs';
import { lemmatiseVerb, singularisePhrase } from './morph.mjs';
import { tokenize } from './tokenize.mjs';

const VALID_ACT_SET = new Set(ACTS);
const VALID_MODE_SET = new Set(ACT_MODES);
const MAX_FRAME_WINDOW = 28;

// Frame shards & families whose argument-structure roles directly disambiguate
// property-owner-value, old->new transition, diagram kind/topic/layout, edge labels,
// shape arrangements, materials, and replacements.
const SUPPORTED_ROLES = new Set([
  'attribute', 'thing', 'value', 'old', 'replacement', 'topic', 'of', 'whole',
  'criterion', 'rel', 'place', 'source', 'ends', 'link', 'arrangement',
  'kind', 'material', 'part', 'tool', 'target', 'group',
]);

const DET_WORDS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those',
  'my', 'your', 'his', 'her', 'its', 'our', 'their',
  'all', 'every', 'each', 'both', 'some', 'any',
]);

const frameIndexCache = new WeakMap();

/**
 * Build a fast pre-compiled frame index per KB instance (~1 ms once per process).
 */
function getCompiledFrames(kb) {
  if (!kb?.grammar?.frames) return [];
  if (frameIndexCache.has(kb)) return frameIndexCache.get(kb);

  const compiled = [];
  const verbVariants = kb.grammar.ellipsis?.verbVariants ?? new Map();
  const coordinationAnchors = new Set([...verbVariants.values()].flatMap((names) => [...names]));
  for (const frame of kb.grammar.frames.values()) {
    if (!frame?.parts?.length) continue;
    if (!frame.act || !VALID_ACT_SET.has(frame.act)) continue;
    // Skip bare/low-priority statement frames or frames with unsupported role mechanics
    const resultative = frame.act === 'change' && frame.roles?.length === 2 && frame.roles.includes('thing') &&
      frame.parts.some((part) => part.role === 'value' && part.takes === 'lexicon' && part.lexicon === 'value');
    const ellipsisAnchors = resultative && !frame.parts.some((part) => part.is === 'verb' || part.act)
      ? verbVariants.get(frame.name) : null;
    if (frame.priority < 5 && !ellipsisAnchors) continue;
    if (!frame.roles?.some((r) => SUPPORTED_ROLES.has(r))) continue;

    // Only compile frames that have at least one structural anchor (word/verb/lexicon)
    // and at least 2 roles (or 1 role + fixed attribute/thing) so single-role catch-all frames don't explode.
    const roleParts = frame.parts.filter((p) => p.is === 'role');
    if (roleParts.length < 2 && !(roleParts.length === 1 && frame.fixed?.size > 0)) continue;
    const hasAnchor = frame.parts.some(
      (p) => !p.optional && (p.is === 'word' || p.is === 'verb' || (p.is === 'role' && p.takes === 'lexicon')),
    );
    if (!hasAnchor) continue;

    // Pre-split multi-word literal alternatives for fast token matching
    const parts = frame.parts.map((p) => ({
      ...p,
      wordSeqs: (p.words ?? [])
        .map((w) => w.toLowerCase().trim().split(/\s+/).filter(Boolean))
        .filter((s) => s.length > 0)
        .sort((a, b) => b.length - a.length),
    }));
    const contextProperty = frame.act === 'change' && frame.roles?.length === 2 &&
      ['attrs', 'values'].includes(frame.needs) &&
      parts.some((p) => p.role === 'attribute' && p.lexicon === 'attribute') &&
      parts.some((p) => p.role === 'value' && p.takes === 'words');

    // Collect quick-filter anchor tokens from the first required literal/lexicon part
    const reqWordParts = parts.filter((p, index) => !p.optional && p.is === 'word' && p.wordSeqs.length > 0 &&
      !(contextProperty && parts[index - 1]?.role === 'attribute' && parts[index + 1]?.role === 'value'));
    const reqLexParts = parts.filter((p) => !p.optional && p.is === 'role' && p.takes === 'lexicon' && p.lexicon);

    compiled.push({
      name: frame.name,
      act: frame.act,
      mode: VALID_MODE_SET.has(frame.mode) ? frame.mode : (frame.mode === 'layout' ? 'arrange' : 'none'),
      priority: frame.priority,
      sourceShard: frame.sourceShard,
      fixed: frame.fixed ?? new Map(),
      parts,
      reqWordParts,
      reqLexParts,
      ellipsisAnchors,
      contextProperty,
      coordinationAnchor: resultative && coordinationAnchors.has(frame.name),
    });
  }

  compiled.sort((a, b) => b.priority - a.priority || b.parts.length - a.parts.length);
  frameIndexCache.set(kb, compiled);
  return compiled;
}

function matchWordSeqAt(tokens, pos, seq) {
  if (pos + seq.length > tokens.length) return -1;
  for (let j = 0; j < seq.length; j++) {
    if (tokens[pos + j].lower !== seq[j]) return -1;
  }
  return pos + seq.length;
}

// Some questions ask for available choices without naming a target.
// Match the declared literal frames without manufacturing a noun role.
export function matchOptionQuestions(tokens, splitPoints, predicates, kb) {
  const frames = ['acts.more.ask.options.what', 'acts.more.ask.options.show']
    .map((name) => kb.grammar.frames?.get(name))
    .filter((frame) => frame?.act === 'ask' && frame.needs === 'list');
  if (!frames.length) return [];
  const results = [];
  for (const { startTok, endTok, internalJoiners } of frameWindows(tokens, splitPoints, predicates)) {
    if (internalJoiners) continue;
    const starts = [startTok, ...matchLeadAt(tokens, startTok, kb)];
    let best;
    for (const frame of frames) {
      const parts = frame.parts.filter(({ is }) => is !== 'lead');
      if (parts.some(({ is }) => is !== 'word')) continue;
      for (const start of starts) {
        let positions = [start];
        for (const part of parts) {
          positions = [...new Set(positions.flatMap((pos) => [
            ...(part.optional ? [pos] : []),
            ...part.words.map((word) => matchWordSeqAt(tokens, pos, word.split(/\s+/)))
              .filter((next) => next >= 0 && next <= endTok + 1),
          ]))];
          if (!positions.length) break;
        }
        for (const stop of positions) {
          if (stop <= start || !tokens.slice(stop, endTok + 1)
            .every((token) => token.isPunct || token.isFiller)) continue;
          if (!best || stop - start > best.endTok - best.startTok + 1) {
            best = { startTok: start, endTok: stop - 1 };
          }
        }
      }
    }
    if (best) results.push(best);
  }
  return results;
}

function modalHaveLeads(grammar, persons = ['1']) {
  const phrases = grammar.phraseItems;
  if (!phrases?.get('shape.want')?.has('have')) return [];
  const subjects = [...(grammar.pronouns ?? [])].filter(([, pronoun]) => pronoun.cases.includes('subject'));
  const modalWords = phrases.get('shape.can');
  const wishes = phrases.get('shape.wishto') ?? new Set();
  // The options frame distinguishes capability/permission modals from
  // advice. Combine those modals with independently declared subjects.
  const examples = grammar.frames?.get('acts.more.ask.options.what')?.parts.flatMap(({ words }) => words) ?? [];
  const modals = new Set(examples.flatMap((lead) => {
    const [modal, subject, ...rest] = lead.split(/\s+/);
    return !rest.length && modalWords?.has(modal) && subjects.some(([word, pronoun]) =>
      word === subject && pronoun.person === '1') && wishes.has(lead) ? [modal] : [];
  }));
  const allowedSubjects = subjects.filter(([, pronoun]) => persons.includes(pronoun.person)).map(([word]) => word);
  return [...modals].flatMap((modal) => allowedSubjects.map((subject) => [modal, subject]));
}

export function chartFieldAxisForms(kb) {
  const keys = kb.catalog?.keys;
  return ['x', 'y'].flatMap((axis) => {
    if (!keys?.has(`chart.${axis}Field`)) return [];
    const words = [...(keys.get(`chart.${axis}Label`)?.keyWords ?? [])].filter((word) =>
      /^(?:[xy][ -]axis|horizontal axis|vertical axis)$/.test(word));
    return words.flatMap((word) => [word.split(' '), [word.replace(' ', '-')]])
      .map((words) => ({ attribute: `chart.${axis}Field`, words }));
  });
}

export function matchChartFieldAssignments(tokens, splitPoints, predicates, kb) {
  const keys = kb.catalog?.keys;
  const axisForms = chartFieldAxisForms(kb);
  if (!axisForms.some(({ words }) => tokens.some(({ lower }) => lower === words[0]))) return [];

  const modalLeads = modalHaveLeads(kb.grammar);
  const byStart = new Map();
  for (const window of frameWindows(tokens, splitPoints, predicates)) {
    if (window.internalJoiners) continue;
    const starts = [window.startTok, ...matchLeadAt(tokens, window.startTok, kb)];
    for (const start of starts) {
      const direct = predicates.find((p) => p.startTok === start && p.text.toLowerCase() === 'put' &&
        p.licensed?.some(({ act }) => act === 'place'));
      const label = predicates.find((p) => p.startTok === start && p.text.toLowerCase() === 'set' &&
        p.licensed?.some(({ act }) => act === 'change'));
      const lead = modalLeads.find((words) => tokens[matchWordSeqAt(tokens, start, words)]?.lower === 'have');
      if (!direct && !lead && !label) continue;
      const end = direct?.endTok ?? label?.endTok ?? start + lead.length;
      let limit = end + 1;
      while (limit <= window.endTok && !tokens[limit].isPunct) limit++;
      if (label) {
        let axisStart = end + 1;
        if (DET_WORDS.has(tokens[axisStart]?.lower)) axisStart++;
        const axis = axisForms.find(({ words }) => matchWordSeqAt(tokens, axisStart, words) > axisStart);
        if (!axis) continue;
        const cueEnd = axisStart + axis.words.length;
        if (!['title', 'label'].includes(tokens[cueEnd]?.lower)) continue;
        let to = cueEnd + 1;
        let owner;
        if (['on', 'of'].includes(tokens[to]?.lower)) {
          const ownerStart = ++to;
          while (to < limit && tokens[to].lower !== 'to') to++;
          if (to <= ownerStart) continue;
          owner = { startTok: ownerStart, endTok: to - 1 };
        }
        if (to + 1 >= limit || tokens[to].lower !== 'to') continue;
        const attribute = axis.attribute.replace(/Field$/, 'Label');
        if (!keys.has(attribute)) continue;
        if (!byStart.has(start) || byStart.get(start).limit > limit) {
          byStart.set(start, { startTok: start, endTok: end, owner, limit, fields: [
            { attribute, startTok: to + 1, endTok: limit - 1, cueStart: axisStart, cueEnd },
          ] });
        }
        continue;
      }
      const fields = [];
      let fieldStart = end + 1;
      let owner;
      let cursor = fieldStart;
      while (cursor < limit) {
        while (cursor < limit && tokens[cursor].lower !== 'on') cursor++;
        if (cursor >= limit || cursor <= fieldStart) break;
        const marker = cursor++;
        if (DET_WORDS.has(tokens[cursor]?.lower)) cursor++;
        const axis = axisForms.find(({ words }) => matchWordSeqAt(tokens, cursor, words) > cursor);
        if (!axis) break;
        cursor += axis.words.length;
        const field = tokens.slice(fieldStart, marker);
        if (cursor > limit || !field.some((token) => token.kind === 'word' || token.kind === 'quote') ||
            field.some((token) => token.kind !== 'quote' &&
              /^(?:legend|gridlines?|ticks?|axis|labels?|titles?|scale)$/.test(token.lower))) break;
        if (fields.some(({ attribute }) => attribute === axis.attribute)) break;
        fields.push({ attribute: axis.attribute, startTok: fieldStart, endTok: marker - 1,
          cueStart: marker, cueEnd: cursor - 1 });
        if (cursor === limit) break;
        if (['of', 'on'].includes(tokens[cursor].lower) && cursor + 1 < limit) {
          owner = { startTok: cursor + 1, endTok: limit - 1 };
          cursor = limit;
          break;
        }
        if (tokens[cursor].lower !== 'and') break;
        fieldStart = ++cursor;
      }
      if (!fields.length || cursor !== limit || fields.at(-1).cueEnd < fieldStart) continue;
      if (!byStart.has(start) || byStart.get(start).limit > limit) {
        byStart.set(start, { startTok: start, endTok: end, fields, owner, limit });
      }
    }
  }
  return [...byStart.values()];
}

export function matchZeroBasedAt(tokens, startTok) {
  const first = tokens[startTok];
  if (first?.kind !== 'word') return null;
  if (first.lower === 'zero-based') return { startTok, endTok: startTok, value: '0', wordsStart: startTok };
  if (first.lower === 'zero' && tokens[startTok + 1]?.lower === 'based') {
    return { startTok, endTok: startTok + 1, value: '0', wordsStart: startTok };
  }
  return null;
}

export function matchLegendPosition(tokens, start, limit, key) {
  let index = start;
  if (['on', 'at', 'to'].includes(tokens[index]?.lower)) index++;
  if (DET_WORDS.has(tokens[index]?.lower)) index++;
  const token = tokens[index];
  if (index >= limit || token?.kind !== 'word' || ['show', 'hide'].includes(token.lower) || !key.values.has(token.lower)) {
    return null;
  }
  const endTok = index + (index + 1 < limit && tokens[index + 1].lower === 'side' ? 1 : 0);
  return { startTok: index, endTok, value: token.lower, wordsStart: index };
}

function chartClauseQualifier(tokens, separator, end, grammar) {
  const purposeStart = tokens[separator]?.text === ',' ? separator + 1 : separator;
  const purposeEnd = tokens[purposeStart]?.purposeEnd;
  if (purposeEnd !== undefined && purposeEnd <= end) return { startTok: purposeStart, endTok: purposeEnd };
  const tail = tokens.slice(separator + 1, end + 1);
  if (!tail.some(({ isContent }) => isContent)) return null;
  const [joiner, subject] = tail;
  const modal = grammar.phraseItems?.get('shape.can');
  const writtenSubject = DET_WORDS.has(subject?.lower) || grammar.pronouns?.get(subject?.lower)?.cases.includes('subject');
  const finiteContinuation = writtenSubject && tail.slice(2).some(({ lower }) => modal?.has(lower));
  if (tokens[separator]?.text !== ',' || joiner?.lower !== 'so' ||
      !grammar.phraseItems?.get('connective')?.has('so') ||
      !(subject?.lower === 'that' || finiteContinuation)) return false;
  while (end > separator + 1 && tokens[end].isPunct) end--;
  return { startTok: separator + 1, endTok: end };
}

export function chartFieldRole(token, kb) {
  if (token?.kind !== 'word') return null;
  const word = /^(colou?r)-coded$/.exec(token.lower)?.[1] ?? token.lower;
  const lemmas = lemmatiseVerb(word, kb);
  if (kb.catalog.keys.has('chart.colourBy') && lemmas.some((lemma) =>
    /^(?:colour|color)$/.test(lemma) && kb.verbs.get(lemma)?.some(({ act }) => act === 'change'))) {
    return 'chart.colourBy';
  }
  if (kb.catalog.keys.has('chart.seriesDimension') && lemmas.includes('split') &&
      kb.verbs.get('split')?.some(({ act }) => act === 'take apart')) return 'chart.seriesDimension';
  return null;
}

export function chartFieldEnd(tokens, start, limit, kb) {
  if (tokens[start]?.kind === 'quote') return start + 1;
  let end = start;
  while (end < limit && !tokens[end].isPunct && tokens[end].purposeEnd === undefined) {
    const word = tokens[end].lower;
    if (['and', 'then', 'also'].includes(word)) {
      let next = end + 1;
      while (['and', 'then', 'also'].includes(tokens[next]?.lower)) next++;
      if (chartFieldRole(tokens[next], kb) || kb.verbs.has(tokens[next]?.lower) ||
          kb.grammar.phraseItems?.get('shape.want')?.has(tokens[next]?.lower)) break;
    }
    if (tokens[end + 1]?.text === ':' && kb.catalog.keys.get('chart.type')?.values?.has(word)) break;
    if (['as', 'in'].includes(word) && tokens.slice(end + 1, Math.min(end + 5, limit)).some(({ kind, lower }) =>
      kind === 'word' && kb.catalog.familyWords.get(lower)?.has('chart'))) break;
    end++;
  }
  return end;
}

export function matchChartFieldEdits(tokens, splitPoints, predicates, kb) {
  if (!tokens.some(({ lower }) => lower === 'by')) return [];
  const byStart = new Map();
  for (const window of frameWindows(tokens, splitPoints, predicates)) {
    if (window.internalJoiners) continue;
    for (const startTok of [window.startTok, ...matchLeadAt(tokens, window.startTok, kb)]) {
      const attribute = chartFieldRole(tokens[startTok], kb);
      if (!attribute) continue;
      const predicate = predicates.find((candidate) => candidate.startTok === startTok && candidate.endTok === startTok);
      if (!predicate) continue;
      let limit = startTok + 1;
      while (limit <= window.endTok && !tokens[limit].isPunct && tokens[limit].purposeEnd === undefined) limit++;
      const qualifier = chartClauseQualifier(tokens, limit, window.endTok, kb.grammar);
      if (qualifier === false) continue;
      while (limit > startTok + 1 && tokens[limit - 1].isFiller) limit--;
      let chartNoun = false;
      let by = startTok + 1;
      for (; by < limit; by++) {
        const token = tokens[by];
        if (chartNoun && token.lower === 'by') break;
        const families = kb.catalog.familyWords.get(token.lower);
        chartNoun ||= token.kind === 'word' && families?.size === 1 && families.has('chart');
      }
      if (by + 1 >= limit) continue;
      const fieldEnd = chartFieldEnd(tokens, by + 1, limit, kb);
      if (fieldEnd !== limit) continue;
      const reading = { startTok, endTok: startTok, limit, qualifier,
        owner: { startTok: startTok + 1, endTok: by - 1 },
        fields: [{ attribute, startTok: by + 1, endTok: fieldEnd - 1, cueStart: by, cueEnd: by }] };
      if (!byStart.has(startTok) || byStart.get(startTok).limit > limit) byStart.set(startTok, reading);
    }
  }
  return [...byStart.values()];
}

export function matchChartLegendEdits(tokens, splitPoints, predicates, kb) {
  const key = kb.catalog.keys.get('chart.legend');
  const labels = kb.catalog.keys.get('chart.show_values');
  if (!key?.values || !tokens.some(({ kind, lower }) => kind === 'word' && key.keyWords.has(lower))) return [];
  const actions = new Map([
    ['show', 'change'], ['hide', 'change'], ['add', 'make'], ['remove', 'remove'],
    ['set', 'change'], ['make', 'change'],
  ]);
  const visibility = new Map([['show', 'show'], ['hide', 'hide'], ['add', 'show'], ['remove', 'hide']]);
  const labelCues = [...(labels?.keyWords ?? [])].map((words) => words.split(' '));
  const byCue = new Map();
  for (const window of frameWindows(tokens, splitPoints, predicates)) {
    if (window.internalJoiners) continue;
    let clauseStart = window.startTok;
    while (['and', 'then'].includes(tokens[clauseStart]?.lower)) clauseStart++;
    for (const startTok of [clauseStart, ...matchLeadAt(tokens, clauseStart, kb)]) {
      const predicate = predicates.find((p) => p.startTok === startTok &&
        p.licensed?.some(({ act }) => act === 'place' || act === actions.get(p.text.toLowerCase())));
      const verb = predicate?.text.toLowerCase();
      const endTok = predicate?.endTok ?? startTok - 1;
      const fragment = !predicate;
      let limit = endTok + 1;
      while (limit <= window.endTok && !tokens[limit].isPunct && tokens[limit].purposeEnd === undefined) limit++;
      const qualifier = chartClauseQualifier(tokens, limit, window.endTok, kb.grammar);
      if (qualifier === false) continue;

      const cue = endTok + (DET_WORDS.has(tokens[endTok + 1]?.lower) ? 2 : 1);
      if (tokens[cue]?.kind !== 'word' || !key.keyWords.has(tokens[cue].lower)) continue;
      let cursor = cue + 1;
      const toggle = visibility.get(verb);
      const scopeLimit = limit;
      let labelField;
      let owner;
      if (labels?.values?.has(toggle)) {
        for (let joiner = cursor; joiner < limit; joiner++) {
          if (tokens[joiner].lower !== 'and') continue;
          const first = joiner + (DET_WORDS.has(tokens[joiner + 1]?.lower) ? 2 : 1);
          const phrase = labelCues.find((words) => {
            const end = matchWordSeqAt(tokens, first, words);
            if (end < first || end > limit) return false;
            if (joiner === cursor && ['on', 'of', 'for'].includes(tokens[end]?.lower) && end + 1 < limit) {
              owner = { startTok: end + 1, endTok: limit - 1 };
              return true;
            }
            const fillerStart = tokens[end]?.lower === 'as' && tokens[end + 1]?.lower === 'well' ? end + 2 : end;
            return fillerStart <= limit && tokens.slice(fillerStart, limit).every(({ isFiller }) => isFiller);
          });
          if (!phrase) continue;
          labelField = { attribute: labels.name, value: toggle, startTok: first, endTok: first + phrase.length - 1,
            wordsStart: first };
          limit = joiner;
          break;
        }
      }
      while (limit > endTok + 1 && tokens[limit - 1].isFiller) limit--;
      let position = matchLegendPosition(tokens, cursor, limit, key);
      if (toggle === 'hide' && position) continue;
      if (position) cursor = position.endTok + 1;
      const ownerMarkers = ['on', 'of', 'for', ...(verb === 'add' ? ['to'] : []), ...(verb === 'remove' ? ['from'] : [])];
      if (ownerMarkers.includes(tokens[cursor]?.lower)) {
        const first = ++cursor;
        while (cursor < limit && (position || toggle === 'hide' || tokens[cursor].lower !== 'to')) cursor++;
        if (cursor <= first) continue;
        owner = { startTok: first, endTok: cursor - 1 };
        if (!position && cursor < limit) {
          position = matchLegendPosition(tokens, cursor, limit, key);
          if (position) cursor = position.endTok + 1;
        }
      }
      if (cursor !== limit || (!position && (!toggle || !key.values.has(toggle)))) continue;
      const ownerWords = owner ? tokens.slice(owner.startTok, owner.endTok + 1) : [];
      const families = ownerWords.filter(({ kind }) => kind === 'word')
        .map(({ lower }) => kb.catalog.familyWords.get(lower)).filter(Boolean);
      const explicitChart = families.some((entry) => entry.size === 1 && entry.has('chart'));
      if (!explicitChart && (tokens[cue].lower !== 'legend' || families.some((entry) => !entry.has('chart')) ||
          ownerWords.some(({ kind, lower }) => kind === 'word' && ['map', 'sheet', 'spreadsheet'].includes(lower)))) continue;
      const field = position
        ? { ...position, attribute: key.name, cueStart: cue, cueEnd: cue }
        : { attribute: key.name, value: toggle, startTok: cue, endTok: cue, wordsStart: startTok };
      const finalLimit = labelField ? scopeLimit : limit;
      const existing = byCue.get(cue);
      if (!existing || existing.limit > finalLimit || (existing.limit === finalLimit &&
          (existing.startTok > startTok || (existing.startTok === startTok &&
            (existing.qualifier?.endTok ?? finalLimit) > (qualifier?.endTok ?? finalLimit))))) {
        byCue.set(cue, { startTok, endTok, fields: labelField ? [field, labelField] : [field],
          owner, limit: finalLimit, qualifier, fragment });
      }
    }
  }
  return [...byCue.values()];
}

export function matchChartDisplayEdits(tokens, splitPoints, predicates, kb, parseNumeric) {
  const { catalog } = kb;
  const grid = catalog.keys.get('chart.grid');
  const gridStyle = catalog.keys.get('chart.gridStyle');
  const lineStyle = catalog.keys.get('chart.lineStyle');
  const labels = catalog.keys.get('chart.show_values');
  const categorySide = catalog.keys.get('chart.xAxis');
  const valueSide = catalog.keys.get('chart.axisSide');
  const scale = catalog.keys.get('chart.axisScale');
  const minimum = catalog.keys.get('chart.yMin');
  const maximum = catalog.keys.get('chart.yMax');
  if (!grid || !gridStyle || !lineStyle || !labels || !categorySide || !valueSide || !scale) return [];
  const numericBounds = [minimum, maximum].filter(Boolean);
  const boundNumberAt = (index) => tokens[index]?.text.endsWith('%') ? null : parseNumeric(tokens[index]);
  const boundLeads = new Map(numericBounds.flatMap((key) => {
    const verb = key.about?.match(/"([a-z]+) the axis at \d/)?.[1];
    return verb ? [[verb, key]] : [];
  }));

  const compactCue = (phrase) => phrase.replace(/[ _-]/g, '');
  const stockCues = (key, phrases = key.keyWords) => [...phrases].map((phrase) =>
    ({ key, phrase, compact: compactCue(phrase) }));
  const valueAxes = [...valueSide.keyWords].filter((word) => /^(?:y|value) axis side$/.test(word))
    .map((word) => word.replace(/ side$/, ''));
  const categoryAxes = [...categorySide.keyWords].filter((word) => /^(?:x|category) axis side$/.test(word))
    .map((word) => word.replace(/ side$/, ''));
  const axisScaleCues = (axes) => axes.flatMap((axis) => [axis, axis + ' scale']);
  const categoryScaleCues = new Set(axisScaleCues(categoryAxes).map(compactCue));
  const valueScaleCues = new Set(axisScaleCues(valueAxes).map(compactCue));
  const scaleValue = (word) => word === 'logarithmic' && scale.keyWords.has(word) ? 'log' : word;
  const sideKeys = new Set([categorySide, valueSide]);
  const cues = [
    ...[grid, gridStyle, lineStyle, labels, categorySide].flatMap((key) => stockCues(key)),
    ...stockCues(valueSide, [...valueAxes, ...[...valueSide.keyWords].filter((word) => word.endsWith('side'))]),
    ...stockCues(scale, [...axisScaleCues(valueAxes), 'axis scale']),
    ...stockCues(categorySide, axisScaleCues(categoryAxes).filter((word) => !categorySide.keyWords.has(word))),
    ...numericBounds.flatMap((key) => stockCues(key, [...key.keyWords].filter((word) =>
      !['floor', 'cap', 'scale'].includes(word)))),
    ...numericBounds.flatMap((key) => stockCues(key, ['axis', ...valueAxes])),
  ].sort((a, b) => b.compact.length - a.compact.length);
  if (!tokens.some(({ kind, lower }) => kind === 'word' && cues.some(({ compact }) =>
    compact.startsWith(compactCue(lower))))) return [];
  const styleValues = new Set([...gridStyle.values, ...lineStyle.values]);
  const maxStyleWords = Math.max(...[...styleValues].map((value) => value.split('_').length));
  const matchStyleAt = (startTok, limit) => {
    for (let endTok = Math.min(startTok + maxStyleWords, limit) - 1; endTok >= startTok; endTok--) {
      const span = tokens.slice(startTok, endTok + 1);
      if (span.some(({ kind }) => kind !== 'word')) continue;
      const value = span.map(({ lower }) => lower).join('_').replace(/-/g, '_');
      if (styleValues.has(value)) return { startTok, endTok, value, wordsStart: startTok };
    }
    return null;
  };
  const leads = modalHaveLeads(kb.grammar);
  const wish = kb.grammar.frames?.get('acts.more.change.would');
  const wishLeads = wish?.parts.find((part) => part.is === 'word')?.words.map((phrase) => phrase.split(' ')) ?? [];
  if (kb.grammar.phraseItems?.get('shape.want')?.has('try')) wishLeads.push(['try']);
  const isChartNoun = ({ kind, lower }) => {
    const families = catalog.familyWords.get(lower);
    return kind === 'word' && families?.size === 1 && families.has('chart');
  };
  const byStart = new Map();
  for (const window of frameWindows(tokens, splitPoints, predicates)) {
    if (window.internalJoiners) continue;
    let clauseStart = window.startTok;
    while (['and', 'then'].includes(tokens[clauseStart]?.lower)) clauseStart++;
    for (const start of [clauseStart, ...matchLeadAt(tokens, clauseStart, kb)]) {
      const direct = predicates.find((p) => p.startTok === start && p.licensed?.some(({ act }) => act === 'change') &&
        ['show', 'hide', 'make', 'set', 'switch', 'keep', 'have'].includes(p.text.toLowerCase()));
      const move = predicates.find((p) => p.startTok === start && ['put', 'move'].includes(p.text.toLowerCase()) &&
        p.licensed?.some(({ act }) => act === 'place'));
      const lead = leads.find((words) => tokens[matchWordSeqAt(tokens, start, words)]?.lower === 'have');
      const wishEnd = wishLeads.map((words) => matchWordSeqAt(tokens, start, words))
        .find((next) => next > start);
      const boundLead = boundLeads.get(tokens[start]?.lower);
      const end = direct?.endTok ?? move?.endTok ?? (boundLead ? start : lead ? start + lead.length : (wishEnd ?? start) - 1);
      const fragment = end < start;
      const verb = direct?.text.toLowerCase();
      const visibility = labels.values.has(verb);
      let limit = end + 1;
      while (limit <= window.endTok && !tokens[limit].isPunct && tokens[limit].purposeEnd === undefined) limit++;
      const qualifier = chartClauseQualifier(tokens, limit, window.endTok, kb.grammar);
      if (qualifier === false) continue;
      while (limit > end + 1 && tokens[limit - 1].isFiller) limit--;

      let cueStart = end + 1;
      if (DET_WORDS.has(tokens[cueStart]?.lower)) cueStart++;
      let style = !visibility && !move && !boundLead && verb !== 'set' ?
        matchStyleAt(cueStart, limit) ?? matchZeroBasedAt(tokens, cueStart) : null;
      if (style) cueStart = style.endTok + 1;
      const spellings = [];
      for (let i = cueStart; i < Math.min(limit, cueStart + 3) && tokens[i].kind === 'word'; i++) {
        spellings.push((spellings.at(-1) ?? '') + compactCue(tokens[i].lower));
      }
      const matches = cues.filter(({ key, compact }) => spellings.includes(compact) &&
        (visibility ? key.values?.has(verb) : key !== labels) && (!move || sideKeys.has(key)) &&
        (!boundLead || key === boundLead));
      const cue = matches[0];
      if (!cue) continue;
      const categoryScale = cue.key === categorySide && categoryScaleCues.has(cue.compact);

      const cueEnd = cueStart + spellings.indexOf(cue.compact);
      let cursor = cueEnd + 1;
      const propertyCues = matches.filter(({ compact }) => compact === cue.compact);
      const acceptsStroke = propertyCues.some(({ key }) => key === grid || key === gridStyle || key === lineStyle);
      let rangeEnd;
      if (!move && minimum && maximum && boundLead !== maximum && tokens[cursor]?.lower === 'from' &&
          (valueAxes.includes(cue.phrase) || (boundLead === minimum && cue.phrase === 'axis')) &&
          tokens[cursor + 2]?.lower === 'to' && cursor + 3 < limit) {
        const lower = boundNumberAt(cursor + 1);
        const upper = boundNumberAt(cursor + 3);
        if (lower !== null && upper !== null) {
          style = { startTok: cursor + 1, endTok: cursor + 1, value: String(lower), key: minimum, wordsStart: cursor + 1 };
          rangeEnd = { attribute: maximum.name, startTok: cursor + 3, endTok: cursor + 3,
            cueStart: cursor + 2, cueEnd: cursor + 2, value: String(upper), wordsStart: cursor + 3 };
          cursor += 4;
        }
      }
      if (style?.value === '0') {
        if (!minimum || (!rangeEnd && !valueAxes.includes(cue.phrase))) continue;
        style.key = minimum;
      } else if (style && !rangeEnd && !acceptsStroke) continue;
      const matchResultAt = (index) => {
        const stroke = acceptsStroke && matchStyleAt(index, limit);
        if (stroke) return { ...stroke, key: cue.key === lineStyle ? lineStyle : gridStyle };
        const marker = tokens[index]?.lower;
        if (boundLead && index === cueEnd + 1 && marker !== 'at' && !['on', 'of'].includes(marker)) return null;
        let first = index;
        if (['on', 'at', 'to'].includes(marker)) first++;
        if (DET_WORDS.has(tokens[first]?.lower)) first++;
        if (first >= limit) return null;
        const zeroBound = !move && minimum && valueAxes.includes(cue.phrase) && matchZeroBasedAt(tokens, first);
        if (zeroBound) return { ...zeroBound, key: minimum };
        const numeric = boundNumberAt(first);
        const explicitBound = propertyCues.find(({ key, phrase }) => numericBounds.includes(key) &&
          (boundLead ? key === boundLead : phrase !== 'axis' && !valueAxes.includes(phrase)));
        if (numeric !== null && explicitBound && !['on', 'of'].includes(marker)) {
          return { startTok: first, endTok: first, value: String(numeric), key: explicitBound.key, wordsStart: first };
        }
        if (tokens[first].kind !== 'word') return null;
        const word = tokens[first].lower;
        const value = scaleValue(word);
        if (!move && categoryScale && !['on', 'at'].includes(marker) && scale.values.has(value)) {
          return { startTok: first, endTok: first, value, wordsStart: first, unresolvedScale: true };
        }
        const property = propertyCues.find(({ key }) => (sideKeys.has(key) || key === scale) && key.values.has(value) &&
          (!['on', 'at'].includes(marker) || sideKeys.has(key)) &&
          !(categoryScale && cue.phrase.endsWith(' scale')));
        if (!property) return null;
        return { startTok: first, endTok: first, value, key: property.key, wordsStart: first };
      };
      if (!visibility && !style) {
        style = matchResultAt(cursor);
        if (style) cursor = style.endTok + 1;
      }
      let owner;
      if (['on', 'of'].includes(tokens[cursor]?.lower)) {
        const first = ++cursor;
        while (cursor < limit && (visibility || style ||
          (!['to', 'should'].includes(tokens[cursor].lower) &&
            matchResultAt(cursor)?.endTok !== limit - 1))) cursor++;
        if (cursor <= first) continue;
        owner = { startTok: first, endTok: cursor - 1 };
      }
      let styleStart;
      if (!visibility && !style) {
        if (tokens[cursor]?.lower === 'to') cursor++;
        if (fragment && tokens[cursor]?.lower === 'should' && tokens[cursor + 1]?.lower === 'be') {
          styleStart = cursor;
          cursor += 2;
        }
        style = matchResultAt(cursor);
        if (!style) continue;
        cursor = style.endTok + 1;
      }
      let coordinatedScale;
      if (!owner && style && (style.unresolvedScale || style.key === scale) &&
          ['and', 'with', 'plus'].includes(tokens[cursor]?.lower)) {
        let first = cursor + 1;
        const repeatedVerb = verb && tokens[first]?.lower === verb ? first++ : null;
        if (DET_WORDS.has(tokens[first]?.lower)) first++;
        const opposite = style.unresolvedScale ? valueScaleCues : categoryScaleCues;
        for (let endTok = Math.min(first + 2, limit - 1); endTok >= first; endTok--) {
          const axis = tokens.slice(first, endTok + 1);
          if (axis.some(({ kind }) => kind !== 'word') || !opposite.has(compactCue(axis.map(({ lower }) => lower).join(' ')))) continue;
          const valueAt = endTok + (tokens[endTok + 1]?.lower === 'to' ? 2 : 1);
          const value = scaleValue(tokens[valueAt]?.lower);
          if (valueAt >= limit || !scale.values.has(value)) continue;
          const ownerStart = valueAt + 2;
          const sharedOwner = ['on', 'of'].includes(tokens[valueAt + 1]?.lower) && ownerStart < limit;
          if (valueAt !== limit - 1 && !sharedOwner) continue;
          if (sharedOwner) owner = { startTok: ownerStart, endTok: limit - 1 };
          coordinatedScale = { attribute: scale.name, startTok: valueAt, endTok: valueAt, cueStart: repeatedVerb ?? first,
            cueEnd: endTok, wordsStart: valueAt, value, unresolvedScale: !style.unresolvedScale };
          cursor = limit;
          break;
        }
      }
      if (cursor !== limit) continue;

      const ownerWords = owner ? tokens.slice(owner.startTok, owner.endTok + 1) : [];
      const chartOwner = ownerWords.some(isChartNoun);
      const differentOwner = ownerWords.some(({ kind, lower }) => kind === 'word' &&
        ['sheet', 'spreadsheet', 'canvas', 'page', 'document', 'table'].includes(lower));
      if (differentOwner && !chartOwner) continue;
      // Bare “values” and “grid” are also used outside charts.
      const weakCue = ['values', 'numbers', 'grid'].includes(cue.phrase);
      const ownerIsPronoun = ownerWords.length === 1 && kb.grammar.pronouns?.has(ownerWords[0].lower);
      const nearbyChart = (!owner || ownerIsPronoun) && tokens.slice(0, start).some(isChartNoun);
      if (weakCue && !chartOwner && !nearbyChart) continue;

      const styleKey = style?.key ?? (cue.key === lineStyle ? lineStyle : gridStyle);
      const field = visibility
        ? { attribute: cue.key.name, value: verb, startTok: cueStart, endTok: cueEnd, wordsStart: start }
        : { attribute: styleKey.name, startTok: styleStart ?? style.startTok, endTok: style.endTok,
          literalStart: style.startTok, wordsStart: styleStart ?? style.wordsStart, cueStart, cueEnd,
          unresolvedScale: style.unresolvedScale,
          ...(!styleKey.values || styleKey.values.has(style.value) ? { value: style.value } : { allowOpen: true }) };
      const earlier = byStart.get(start);
      if (!earlier || earlier.limit > limit ||
          (earlier.limit === limit && (earlier.qualifier?.endTok ?? limit) > (qualifier?.endTok ?? limit))) {
        byStart.set(start, { startTok: start, endTok: end, owner, limit, qualifier,
          fields: (rangeEnd || coordinatedScale) ? [field, rangeEnd ?? coordinatedScale] : [field], fragment });
      }
    }
  }
  const byOperands = new Map();
  for (const edit of byStart.values()) {
    const key = JSON.stringify(edit.fields.map(({ attribute, startTok, endTok }) => [attribute, startTok, endTok]));
    const previous = byOperands.get(key);
    // Lead matching can expose the main verb of a modal as a second start.
    // Keep the whole written lead when both starts bind the same operands.
    if (!previous || edit.startTok < previous.startTok) byOperands.set(key, edit);
  }
  return [...byOperands.values()];
}

export function matchModalWants(tokens, splitPoints, predicates, candidates, kb) {
  const frame = kb.grammar.frames?.get('acts.data.change.want');
  if (!frame || frame.act !== 'change' || !frame.roles.includes('thing') || !frame.roles.includes('value')) return [];
  const leads = modalHaveLeads(kb.grammar);
  if (!leads.some(([modal]) => tokens.some(({ lower }) => lower === modal))) return [];
  const found = new Map();
  for (const window of frameWindows(tokens, splitPoints, predicates)) {
    if (window.internalJoiners) continue;
    let start = window.startTok;
    while (tokens[start]?.isFiller && start <= window.endTok) start++;
    for (const lead of leads) {
      const end = matchWordSeqAt(tokens, start, lead);
      if (end < 0 || tokens[end]?.lower !== 'have') continue;
      const first = end + 1;
      let last = window.endTok;
      for (let i = first; i <= last; i++) {
        if (tokens[i].isPunct) last = i - 1;
      }
      if (last <= first) continue;
      const nounStart = ({ detTok, startTok }) => detTok >= 0 ? detTok : startTok;
      const heads = candidates.filter((head) => head.startTok >= first && head.endTok <= last &&
        ([HYP_KINDS.TARGET_FAMILY, HYP_KINDS.TARGET_SORT].includes(head.kind) ||
          (head.kind === HYP_KINDS.TARGET_REF && head.isPronoun)));
      const indefinite = kb.grammar.determiners.get(tokens[first].lower)?.det === 'indefinite';
      const create = indefinite && heads.some((head) => nounStart(head) === first && !head.isPronoun);
      if (indefinite && !create) continue;
      let grounded = create ? heads.filter((head) => nounStart(head) === first && !head.isPronoun) : [];
      if (!create) {
        const typedResults = candidates.filter((c) => c.kind === HYP_KINDS.CONSTRAINT && c.startTok >= first &&
          c.endTok <= last && c.phase === 'result' && !c.openValue && !c.isAnchor && !c.needsAnchor &&
          (c.operator === 'delta' || c.endTok === last || predicates.some((p) =>
            p.endTok === last && p.licensed?.some(({ act }) => act === 'change'))));
        grounded = heads.filter((head) => {
          const anchor = nounStart(head);
          const attached = ['on', 'of', 'in'].includes(tokens[anchor - 1]?.lower);
          return (head.isPronoun ? anchor === first : anchor >= first &&
            (anchor === first || attached || tokens.slice(first, head.startTok).every((token) => !token.isPunct))) &&
            typedResults.some((value) => (head.isPronoun || value.family === head.family) &&
              (value.startTok > head.endTok || value.endTok < head.startTok));
        });
      }
      if (!grounded.length || (found.has(start) && found.get(start).last <= last)) continue;
      found.set(start, {
        startTok: start, endTok: end, last, act: create ? 'make' : 'change',
        heads: grounded.map(({ kind, family, startTok, endTok }) => ({ kind, family, startTok, endTok })),
      });
    }
  }
  return [...found.values()];
}

const documentFamilies = new Set(['page', 'document', 'text', 'section', 'block']);
const artifactFamilies = new Set([...documentFamilies, 'diagram', 'chart', 'sketch']);

function artifactNameEnds(tokens, heads, headEnd) {
  if (!['called', 'named', 'titled'].includes(tokens[headEnd + 1]?.lower)) return [];
  return heads.filter((head) => head.kind === HYP_KINDS.TARGET_REF && head.name &&
    head.startTok === headEnd + 2).map(({ endTok }) => endTok);
}

export function matchBlankArtifactCreation(tokens, splitPoints, predicates, candidates, kb) {
  const frame = kb.grammar.frames?.get('acts.text.make.blank');
  if (frame?.act !== 'make' || !frame.roles.includes('thing')) return [];
  const lead = frame.parts.find(({ words }) => words.includes('open'));
  const modifiers = frame.parts.find(({ words }) => words.includes('new') && words.includes('blank'));
  if (!lead || !modifiers) return [];
  const attachedCues = kb.grammar.frames.get('acts.text.make.begin')?.parts
    .find(({ words }) => words.includes('with') && words.includes('using'))?.words ?? [];
  const open = predicates.filter((predicate) => predicate.text.toLowerCase() === 'open' &&
    predicate.licensed?.some(({ act }) => act === 'load'));
  if (!open.length) return [];
  const windows = frameWindows(tokens, splitPoints, predicates).filter(({ internalJoiners }) => !internalJoiners);
  return open.flatMap((predicate) => {
    const first = predicate.endTok + 1;
    const determiner = kb.grammar.determiners.get(tokens[first]?.lower)?.det;
    if (determiner && determiner !== 'indefinite') return [];
    const descriptor = first + Number(Boolean(determiner));
    const modifier = tokens[descriptor];
    if (modifier?.kind !== 'word' || modifier.lower === 'next' || !modifiers.words.includes(modifier.lower)) return [];
    const ends = windows.filter(({ startTok, endTok }) => startTok <= predicate.startTok && endTok > descriptor &&
      tokens.slice(startTok, predicate.startTok).every((token) => !token.isContent || token.isFiller));
    const bareHeads = candidates.filter(({ kind, family, startTok }) =>
      [HYP_KINDS.TARGET_SORT, HYP_KINDS.TARGET_FAMILY].includes(kind) &&
      documentFamilies.has(family) && startTok === descriptor + 1 &&
      ends.some(({ endTok }) => endTok >= startTok));
    const withPurpose = (endTok) => {
      let next = endTok + 1;
      if (tokens[next]?.text === ',') next++;
      return tokens[next]?.purposeEnd ?? endTok;
    };
    const readings = bareHeads.flatMap((head) => [head.endTok, ...artifactNameEnds(tokens, candidates, head.endTok)]
      .map(withPurpose)
      .filter((endTok) => ends.some((window) => endTok <= window.endTok &&
        tokens.slice(endTok + 1, window.endTok + 1).every((token) => token.isPunct || token.isFiller)))
      .map((endTok) => ({ head, endTok })));
    if (readings.length) {
      const endTok = Math.max(...readings.map((reading) => reading.endTok));
      return [{ predicate, descriptor, endTok, heads: readings.filter((reading) => reading.endTok === endTok)
        .map(({ head }) => head) }];
    }
    const qualifiedHeads = bareHeads.filter(({ endTok }) => {
      const marker = tokens[endTok + 1]?.lower;
      return attachedCues.includes(marker) || (marker === 'while' && kb.grammar.pronouns.has(tokens[endTok + 2]?.lower));
    });
    if (!qualifiedHeads.length) return [];
    const targetEnd = Math.max(...qualifiedHeads.map(({ endTok }) => endTok));
    const windowsAfter = ends.filter(({ endTok }) => endTok > targetEnd + 1);
    if (!windowsAfter.length) return [];
    let endTok = Math.min(...windowsAfter.map((window) => window.endTok));
    while (endTok > targetEnd + 1 && (tokens[endTok].isPunct || tokens[endTok].isFiller)) endTok--;
    if (endTok <= targetEnd + 1) return [];
    return [{
      predicate, descriptor, endTok, heads: qualifiedHeads.filter((head) => head.endTok === targetEnd),
      qualifier: { startTok: targetEnd + 1, endTok },
    }];
  });
}

// Artifact names belong before the published output and source markers.
export function matchArtifactOperands(tokens, splitPoints, predicates, candidates, kb) {
  const frames = kb.grammar.frames;
  const cuesFor = (name, role) => {
    const parts = frames?.get(name)?.parts ?? [];
    const slot = parts.findIndex((part) => part.role === role);
    return new Set(parts.slice(0, Math.max(0, slot)).flatMap(({ words }) => words));
  };
  const destinations = cuesFor('acts.save.place', 'place');
  const names = cuesFor('acts.save.thing', 'name');
  const origins = cuesFor('acts.load.from', 'source');
  const exportVerbs = new Set(frames?.get('acts.more.save.download')?.parts.find(({ words }) =>
    words.includes('export'))?.words ?? []);
  const actions = predicates.filter((predicate) => {
    const word = predicate.text.toLowerCase();
    return predicate.licensed?.some(({ act }) => act === 'save') &&
      (word === 'save' || exportVerbs.has(word));
  });
  const copies = frames?.get('acts.copy')?.act === 'copy' ? predicates.filter((predicate) =>
    predicate.licensed?.some(({ act }) => act === 'copy')) : [];
  const loads = origins.size ? predicates.filter((predicate) =>
    predicate.licensed?.some(({ act }) => act === 'load')) : [];
  const isHead = ({ kind }) =>
    [HYP_KINDS.TARGET_SORT, HYP_KINDS.TARGET_FAMILY, HYP_KINDS.TARGET_REF].includes(kind);
  const modalLeads = modalHaveLeads(kb.grammar, ['1', '3']);
  const outputModal = modalLeads.length &&
    kb.markings.get('download')?.some(({ act, marker, role }) => act === 'save' && marker === 'as' && role === 'format');
  if (!actions.length && !copies.length && !loads.length &&
      !(outputModal && modalLeads.some(([modal]) => tokens.some(({ lower }) => lower === modal)))) return [];
  const windows = frameWindows(tokens, splitPoints, predicates).filter((window) => !window.internalJoiners);
  if (outputModal) {
    const fileHeads = candidates.filter((candidate) => candidate.kind === HYP_KINDS.TARGET_FAMILY &&
      ['document', 'text'].includes(candidate.family) && candidate.text.toLowerCase() === 'file');
    const modalStarts = new Set();
    for (const { startTok, endTok } of windows) {
      let start = startTok;
      while (tokens[start]?.isFiller && start <= endTok) start++;
      if (modalStarts.has(start)) continue;
      for (const lead of modalLeads) {
        const have = matchWordSeqAt(tokens, start, lead);
        if (have < 0 || tokens[have]?.lower !== 'have') continue;
        const mentionsFileForm = fileHeads.some((head) => {
          if (head.startTok <= have + 2 || head.endTok > endTok) return false;
          const det = head.detTok >= 0 ? head.detTok : head.startTok;
          return tokens[det - 1]?.lower === 'as' &&
            (head.endTok === endTok || ['from', 'to', 'into'].includes(tokens[head.endTok + 1]?.lower) ||
              tokens.slice(head.endTok + 1, endTok + 1).every((token) => token.isPunct || token.isFiller));
        });
        if (!mentionsFileForm) continue;
        const firstPerson = kb.grammar.pronouns.get(lead[1]).person === '1';
        modalStarts.add(start);
        actions.push({
          kind: HYP_KINDS.PREDICATE,
          startTok: start,
          endTok: have,
          text: tokens.slice(start, have + 1).map((token) => token.text).join(' '),
          licensed: [
            ...(firstPerson ? [{ act: 'save', mood: 'do' }] : []),
            { act: 'ask', mood: 'check' },
          ],
          modalOutput: true,
          cost: 0,
        });
        break;
      }
    }
  }
  const readings = [];
  for (const predicate of new Set([...actions, ...copies, ...loads])) {
    const start = predicate.endTok + 1;
    const word = predicate.text.toLowerCase();
    const loading = loads.includes(predicate);
    const formats = new Set((kb.markings.get(predicate.modalOutput ? 'download' : word) ?? [])
      .filter(({ role }) => role === 'format').map(({ marker }) => marker));
    const fullWindow = windows.filter(({ startTok, endTok }) => startTok <= predicate.startTok && endTok >= start &&
      tokens.slice(startTok, predicate.startTok).every((token) => token.isFiller || token.isGrammar))
      .sort((left, right) => left.endTok - right.endTok)[0];
    if (!fullWindow) continue;
    let operandEnd = start;
    while (operandEnd <= fullWindow.endTok && tokens[operandEnd].purposeEnd === undefined) operandEnd++;
    const window = { ...fullWindow, endTok: operandEnd - 1 };
    const markers = [];
    for (let i = start + 1; !copies.includes(predicate) && i < window.endTok; i++) {
      const token = tokens[i];
      const cue = token.lower;
      if (token.kind !== 'word' || tokens[i + 1].isPunct) continue;
      if (loading) {
        if (origins.has(cue)) markers.push({ index: i, note: 'load.source_or_qualifier' });
      } else if (formats.has(cue) && cue === 'as') markers.push({ index: i, note: 'save.format' });
      // The origin is an operand, but the intent schema has no source role.
      else if (origins.has(cue) && cue === 'from') markers.push({ index: i, note: 'save.source' });
      else if (destinations.has(cue) && ['to', 'into'].includes(cue)) markers.push({ index: i, role: 'destination' });
      else if (word === 'save' && names.has(cue)) markers.push({ index: i, note: 'save.name_or_format' });
    }
    let targetEnd = (markers[0]?.index ?? window.endTok + 1) - 1;
    while (targetEnd >= start && (tokens[targetEnd].isPunct || tokens[targetEnd].isFiller)) targetEnd--;
    const bareReference = candidates.some((head) =>
      head.isPronoun && head.startTok === start && head.endTok === targetEnd);
    const scopeHeads = candidates.filter((candidate) => isHead(candidate) &&
      candidate.startTok >= start && candidate.endTok <= targetEnd);
    if (loading && !scopeHeads.some(({ startTok, detTok }) => startTok === start || detTok === start)) continue;
    const unambiguousLoad = loading && predicate.licensed.every(({ act }) => act === 'load');
    const loadHeads = loading ? scopeHeads.filter(({ family, det, endTok }) =>
      artifactFamilies.has(family) && (unambiguousLoad || ['definite', 'possessive', 'demonstrative'].includes(det)) &&
      (endTok === targetEnd || artifactNameEnds(tokens, scopeHeads, endTok).includes(targetEnd))) : [];
    const physicalObjects = word === 'open' && kb.actionSpecs.get('open')?.objects;
    if (loading && !loadHeads.length && physicalObjects &&
        scopeHeads.some(({ family, sort, endTok }) => family === 'drawn' &&
          physicalObjects.has(sort) && endTok === targetEnd)) {
      readings.push({ predicate, physicalOpen: true });
      continue;
    }
    if (loading && !loadHeads.length && !bareReference && !unambiguousLoad) continue;
    if (!scopeHeads.length || (!markers.length && !bareReference && !loadHeads.length)) continue;
    const roles = markers.flatMap(({ index, role, note }, i) => {
      let endTok = (markers[i + 1]?.index ?? window.endTok + 1) - 1;
      while (endTok > index && (tokens[endTok].isPunct || tokens[endTok].isFiller)) endTok--;
      if (endTok <= index) return [];
      const operand = tokens.slice(index + 1, endTok + 1);
      // Bare format-like symbols after "to" can describe output form. The
      // spelling alone cannot identify a destination or a particular format.
      const bareOperand = operand.length === 1 ? operand[0] : null;
      if (role === 'destination' && bareOperand?.kind === 'word' && !/^[A-Z][a-z]+$/.test(bareOperand.text)) {
        return [{ startTok: index, endTok, note: 'save.destination_or_format' }];
      }
      return [{ startTok: index, endTok, role, note }];
    });
    if (roles.length || bareReference || loadHeads.length) readings.push({ predicate, targetEnd, roles, bareReference, loadHeads });
  }
  return readings;
}

function matchLexiconAt(tokens, pos, lexName, kb, tabSpec) {
  const T = tokens.length;
  const maxLen = Math.min(4, T - pos);
  const hits = [];

  if (lexName === 'attribute') {
    const kwIdx = tabSpec?.keyWordIndex;
    if (!kwIdx) return hits;
    for (let len = maxLen; len >= 1; len--) {
      if (tokens.slice(pos, pos + len).some((t) => t.isPunct)) continue;
      const phrase = tokens.slice(pos, pos + len).map((t) => t.lower).join(' ');
      const forms = new Set(singularisePhrase(phrase, kb));
      for (const f of [...forms]) {
        if (f.includes('colour')) forms.add(f.replace(/colour/g, 'color'));
        if (f.includes('color')) forms.add(f.replace(/color/g, 'colour'));
      }
      let matched = false;
      for (const f of forms) {
        if (kwIdx.has(f)) {
          matched = true;
          break;
        }
      }
      if (matched) hits.push(pos + len);
    }
    return hits;
  }

  const lexSet = kb?.grammar?.lexicons?.get(lexName);
  if (!lexSet || lexSet.size === 0) return hits;
  for (let len = maxLen; len >= 1; len--) {
    if (tokens.slice(pos, pos + len).some((t) => t.isPunct)) continue;
    const phrase = tokens.slice(pos, pos + len).map((t) => t.lower).join(' ');
    const forms = singularisePhrase(phrase, kb);
    if (forms.some((f) => lexSet.has(f))) {
      hits.push(pos + len);
    }
  }
  return hits;
}

function matchVerbAt(tokens, pos, reqAct, kb) {
  const tok = tokens[pos];
  if (!tok || tok.kind !== 'word' || tok.isPunct) return [];
  const verbs = kb?.verbs;
  if (!verbs) return [];
  const lemmas = lemmatiseVerb(tok.lower, kb);
  const out = [];
  // 2-token phrasal verb first, then 1-token
  if (pos + 1 < tokens.length && tokens[pos + 1].kind === 'word') {
    const w2 = tokens[pos + 1].lower;
    for (const l of lemmas) {
      const entries = verbs.get?.(`${l} ${w2}`);
      if (entries && entries.some((e) => e.act === reqAct)) {
        out.push(pos + 2);
        break;
      }
    }
  }
  for (const l of lemmas) {
    const entries = verbs.get?.(l);
    if (entries && entries.some((e) => e.act === reqAct)) {
      out.push(pos + 1);
      break;
    }
  }
  return out;
}

export function matchLeadAt(tokens, pos, kb) {
  const fillerPhrases = kb?.grammar?.fillerPhrases;
  const fillerWords = kb?.grammar?.fillerWords;
  const T = tokens.length;
  const out = [];
  for (let len = Math.min(4, T - pos); len >= 1; len--) {
    if (tokens.slice(pos, pos + len).some((t) => t.isPunct && t.text !== ',')) continue;
    const ph = tokens.slice(pos, pos + len).filter((t) => !t.isPunct).map((t) => t.lower).join(' ');
    if ((len > 1 && fillerPhrases?.has(ph)) || (len === 1 && fillerWords?.has(ph))) {
      let nextPos = pos + len;
      if (nextPos < T && tokens[nextPos].text === ',') nextPos++;
      out.push(nextPos);
    }
  }
  return out;
}

function frameWindows(tokens, splitPoints, predicates) {
  const clauses = [];
  let cStart = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].isPunct && ['.', ';', '?'].includes(tokens[i].text)) {
      if (i > cStart) clauses.push([cStart, i - 1]);
      cStart = i + 1;
    }
  }
  if (cStart < tokens.length) clauses.push([cStart, tokens.length - 1]);

  const predicateStarts = new Set(predicates.map((predicate) => predicate.startTok));
  const cuts = new Map();
  for (const split of splitPoints) {
    if (!predicateStarts.has(split.endTok + 1)) continue;
    const previous = cuts.get(split.endTok);
    if (!previous || split.startTok < previous.startTok) cuts.set(split.endTok, split);
  }
  const windows = clauses.map(([startTok, endTok]) => ({ startTok, endTok }));
  for (const [start, end] of clauses) {
    const localCuts = [...cuts.values()].filter((cut) => cut.startTok > start && cut.endTok < end &&
      predicates.some((predicate) => predicate.startTok >= start && predicate.endTok < cut.startTok))
      .sort((a, b) => a.startTok - b.startTok);
    let left = start;
    const segments = [];
    for (const cut of localCuts) {
      if (cut.startTok <= left) continue;
      segments.push({ startTok: left, endTok: cut.startTok - 1, cut });
      left = cut.endTok + 1;
    }
    if (segments.length === 0) continue;
    segments.push({ startTok: left, endTok: end });
    for (const [i, segment] of segments.entries()) {
      windows.push({ startTok: segment.startTok, endTok: segment.endTok, joinerBounded: true });
      // A weak joiner can be part of a literal property value, even when the
      // word after it has a verb reading. Keep both candidate boundaries.
      for (let j = i - 1; j >= 0; j--) {
        const { startTok, cut } = segments[j];
        if (cut.isStrong || tokens[cut.startTok].isPunct || segment.endTok - startTok + 1 > MAX_FRAME_WINDOW) break;
        if (startTok === start && segment.endTok === end) continue;
        windows.push({ startTok, endTok: segment.endTok, joinerBounded: true,
          internalJoiners: segments.slice(j, i).map((part) => part.cut) });
      }
    }
  }
  return windows;
}

export function findSpatialOwners(tokens, heads, relations, anchors) {
  const selectors = [];
  const grammarGap = (left, right) => tokens.slice(left.endTok + 1, right.startTok).every((token) => token.isGrammar);
  for (const relation of relations) {
    const ownerHeads = heads.filter((head) => head.endTok < relation.startTok && grammarGap(head, relation));
    if (ownerHeads.length === 0) continue;
    for (const anchor of anchors) {
      if (anchor.family === relation.family &&
          anchor.startTok > relation.endTok && anchor.startTok - relation.endTok <= 3 && grammarGap(relation, anchor)) {
        selectors.push({ heads: ownerHeads, relation, anchor });
      }
    }
  }
  return selectors;
}

export function findOwnerSelectors(thing, tokens, heads, relations, anchors) {
  return findSpatialOwners(tokens, heads.filter((head) => head.startTok >= thing.startTok),
    relations.filter((relation) => relation.startTok > thing.startTok && relation.endTok < thing.endTok),
    anchors.filter((anchor) => anchor.endTok === thing.endTok));
}

export function partOwnerInThing(owner, thing) {
  return thing && owner.partHead && owner.partHead[0] >= thing.startTok && owner.partHead[1] <= thing.endTok &&
    owner.startTok >= thing.startTok - 1 && owner.endTok <= thing.endTok;
}

function propertyAttributes(span, kb, tabSpec) {
  const forms = singularisePhrase(span.text.toLowerCase(), kb);
  return new Set(forms.flatMap((form) => [...(tabSpec?.keyWordIndex?.get(form) ?? [])]));
}

function structuredContextKeys(span, tokens, candidates, kb, tabSpec) {
  const det = kb.grammar.determiners?.get(tokens[span?.startTok - 1]?.lower)?.det;
  if (!span || ['indefinite', 'quantified'].includes(det)) return [];
  const matched = [...propertyAttributes(span, kb, tabSpec)].map((name) => tabSpec.keys.get(name)).filter(Boolean);
  const direct = matched.filter((key) => key.literalKeyWords?.has(span.text.toLowerCase()));
  const keys = direct.length ? direct : matched;
  if (keys.some((key) => key.head === 'span') || !keys.some((key) =>
    key.head.startsWith('number') || key.values?.size || key.name === 'meeting.time')) return [];
  const head = candidates.some((c) => [HYP_KINDS.TARGET_SORT, HYP_KINDS.TARGET_FAMILY].includes(c.kind) &&
    c.startTok === span.startTok && c.endTok === span.endTok);
  return head ? [] : keys;
}

export function isStructuredPropertyValue(candidate, key) {
  if (!key || candidate.kind !== HYP_KINDS.CONSTRAINT || candidate.openValue || candidate.isAnchor ||
      candidate.needsAnchor || candidate.pairedConstraints?.length) return false;
  const value = String(candidate.value ?? '').trim();
  return Boolean(value && ((key.head.startsWith('number') && candidate.operator === 'eq' && Number.isFinite(Number(value))) ||
    (['eq', 'degree'].includes(candidate.operator) && key.values?.has(value.toLowerCase()))));
}

function hasExactNumericKey(keys, span) {
  return keys.length > 0 && keys.every((key) => key.head === 'number' && key.literalKeyWords?.has(span.text.toLowerCase()));
}

function contextValues(candidates, keys, span) {
  return candidates.filter((c) => c.startTok === span.startTok && c.endTok === span.endTok &&
    keys.some((key) => key.name === c.attribute && isStructuredPropertyValue(c, key)));
}

function isGroundedPropertyValue(candidate, keys) {
  return isIndependentValueCandidate(candidate) || isStructuredPropertyValue(candidate, keys.get(candidate.attribute));
}

function splitPartProperties(value, connector, attributes, families, tokens, candidates, kb, tabKeys) {
  const values = candidates.filter((c) => families.has(c.family) && isGroundedPropertyValue(c, tabKeys));
  const keywords = candidates.filter((c) => c.kind === HYP_KINDS.KEY_WORD && c.startTok > value.startTok);
  const properties = [];
  let endTok = value.endTok;
  for (let cut = endTok - 1; cut > value.startTok; cut--) {
    if (!kb.grammar.coordinators?.has(tokens[cut].lower)) continue;
    const afterCut = cut + 1;
    const first = kb.grammar.determiners?.get(tokens[afterCut].lower)?.det === 'definite' ? afterCut + 1 : afterCut;
    for (const attrSpan of keywords.filter((c) => c.startTok === first)) {
      const startTok = matchWordSeqAt(tokens, attrSpan.endTok + 1, connector);
      const attrs = values.filter((c) => c.startTok === startTok && c.endTok === endTok &&
        attrSpan.attrs.includes(c.attribute)).map((c) => c.attribute);
      if (attrs.length === 0) continue;
      properties.unshift({ attrSpan, valSpan: { startTok, endTok }, attrs: [...new Set(attrs)] });
      endTok = cut - 1;
      if (tokens[endTok].text === ',') endTok--;
      break;
    }
  }
  const typed = values.some((c) => c.startTok === value.startTok && c.endTok === endTok && attributes.includes(c.attribute));
  const literal = attributes.some((attribute) => {
    const key = tabKeys.get(attribute);
    return key && families.has(key.family) && ['span', 'candidate'].includes(key.head) && !key.values?.size;
  }) && tokens.slice(value.startTok, endTok + 1).some((token) => token.isContent || token.kind === 'quote');
  if (!properties.length || (!typed && !literal)) {
    return { endTok: value.endTok, properties: [] };
  }
  return { endTok, properties };
}

function relativeTimeOperand(keys, tokens, start, end, kb, candidates) {
  const timeKeys = keys.filter((key) => ['page.time', 'meeting.time'].includes(key.name));
  if (!timeKeys.length || !kb.grammar.constructions?.has('pp.time')) return null;
  let grammarPrefix = true;
  for (let first = start; first < end; first++) {
    for (let last = first; last < Math.min(end, first + 3); last++) {
      const phrase = tokens.slice(first, last + 1).map((t) => t.lower).join(' ');
      const prep = kb.grammar.prepositions.get(phrase);
      if (prep?.isTime && ['before', 'after', 'since', 'until', 'between'].includes(prep.rel) &&
          !tokens[last + 1].isPunct) {
        const grounded = candidates.some((c) => c.kind === HYP_KINDS.CONSTRAINT && c.startTok > last && c.endTok === end &&
          !c.openValue && !c.requiresKeyWord && timeKeys.some((key) => key.name === c.attribute));
        // Calendar also has a native meeting-to-meeting relation. Restrict
        // this fallback there to independently identified time-of-day anchors.
        if (grounded || (grammarPrefix && timeKeys.some((key) => key.name === 'page.time'))) return { grounded };
      }
    }
    grammarPrefix &&= tokens[first].isGrammar;
  }
  return null;
}

/**
 * Match declared frames within hard punctuation boundaries. Candidate clause
 * separators also license local windows when they precede a predicate.
 */
export function matchFrames(tokens, text, { kb, tabSpec, splitPoints = [], predicates = [], candidates = [] }) {
  if (!tokens?.length || !kb?.grammar?.frames) return [];
  const compiled = getCompiledFrames(kb);
  if (compiled.length === 0) return [];

  const tokenLowSet = new Set(tokens.map((t) => t.lower));
  const windows = frameWindows(tokens, splitPoints, predicates);
  const relations = candidates.filter((c) => c.needsAnchor);
  const anchors = candidates.filter((c) => c.isAnchor);
  const partOwners = candidates.filter((c) => c.partHead);
  const heads = candidates.filter((c) =>
    [HYP_KINDS.TARGET_FAMILY, HYP_KINDS.TARGET_SORT, HYP_KINDS.TARGET_REF].includes(c.kind));
  const valueEnds = new Map();
  // The grammar's value slot can use typed values already recognised in this tab.
  // Use this evidence for changes with a relational description of the owner.
  const coordinatedWindows = new Map();
  const changePredicates = predicates.filter((predicate) => predicate.licensed?.some((licence) =>
    licence.act === 'change' && ['none', 'set'].includes(licence.mode ?? 'none')));
  for (const cut of splitPoints) {
    if (!kb.grammar.coordinators?.has(cut.text.toLowerCase()) || cut.isStrong) continue;
    for (const window of windows) {
      if (window.internalJoiners || cut.startTok - window.startTok < 3 || window.endTok - cut.endTok < 2 ||
          window.endTok - window.startTok + 1 > MAX_FRAME_WINDOW) continue;
      if (!changePredicates.some((predicate) => predicate.startTok >= window.startTok && predicate.endTok < cut.startTok)) continue;
      const key = `${window.startTok}:${cut.startTok}:${window.endTok}`;
      coordinatedWindows.set(key, [
        { startTok: window.startTok, endTok: cut.startTok - 1, pairKey: key, side: 'first' },
        { startTok: cut.endTok + 1, endTok: window.endTok, pairKey: key, side: 'second' },
      ]);
    }
  }
  const candidateWindows = [...windows, ...[...coordinatedWindows.values()].flat()];
  if ((relations.length > 0 && anchors.length > 0) || coordinatedWindows.size > 0) {
    for (const c of candidates.filter(isIndependentValueCandidate)) {
      if (!valueEnds.has(c.startTok)) valueEnds.set(c.startTok, new Set());
      valueEnds.get(c.startTok).add(c.endTok + 1);
    }
  }

  const rawMatches = [];

  for (const frame of compiled) {
    const mayHaveLiteralValue = frame.act === 'change' && frame.parts.some((part) => part.role === 'attribute') &&
      frame.parts.some((part) => part.role === 'value' && part.takes === 'words');
    // Fast pre-filter: every required literal word part must have at least one alternative whose first word exists in the sentence!
    let preOk = true;
    for (const wp of frame.reqWordParts) {
      if (!wp.wordSeqs.some((seq) => tokenLowSet.has(seq[0]))) {
        preOk = false;
        break;
      }
    }
    if (!preOk) continue;

    for (const window of candidateWindows) {
      if (window.side === 'first' && !frame.coordinationAnchor) continue;
      if (window.side === 'second' && !frame.ellipsisAnchors) continue;
      if (!window.side && frame.priority < 5) continue;
      const { startTok: clStart, endTok: clEnd } = window;
      const clLen = clEnd - clStart + 1;
      if (clLen < (window.side ? 2 : 3) || clLen > MAX_FRAME_WINDOW || (window.internalJoiners && !mayHaveLiteralValue)) continue;

      // Try matching starting at clause start (or after a leading filler/conjunction)
      const startPositions = [clStart];
      if (clStart + 1 <= clEnd && (tokens[clStart].isFiller || ['and', 'then', 'so', 'ok', 'hey', 'next', 'also', 'please'].includes(tokens[clStart].lower))) {
        let p = clStart + 1;
        while (p <= clEnd && (tokens[p].isPunct || tokens[p].isFiller)) p++;
        if (p <= clEnd) startPositions.push(p);
      }

      for (const s0 of startPositions) {
        const parts = frame.parts;
        const P = parts.length;
        let bestInClause = null;
        let steps = 0;

        const dfs = (pIdx, tIdx, roles, wordAnchors, predSpan) => {
          if (++steps > 500) return;
          if (bestInClause && bestInClause.endTok === clEnd) return;
          if (pIdx === P) {
            // Require frame to consume cleanly to clause end (or optional trailing politeness/punct)
            let rem = tIdx;
            while (rem <= clEnd && (tokens[rem].isPunct || tokens[rem].isFiller)) rem++;
            let contextKeys;
            let relativeTime;
            const thing = roles.get('thing');
            const attribute = roles.get('attribute');
            const value = roles.get('value');
            if (mayHaveLiteralValue && thing && attribute && value && partOwners.length) {
              if (partOwners.some((owner) => owner.partHead[0] >= thing.startTok && owner.partHead[1] <= thing.endTok &&
                owner.endTok > thing.endTok && owner.endTok <= value.endTok)) return;
              const families = new Set(partOwners.filter((owner) => partOwnerInThing(owner, thing)).map((owner) => owner.family));
              if (families.size) {
                const attrs = propertyAttributes(attribute, kb, tabSpec);
                const swallowsDirective = splitPoints.some((cut) => cut.startTok > value.startTok && cut.endTok < value.endTok &&
                  predicates.some((p) => p.startTok === cut.endTok + 1) && candidates.some((c) =>
                    c.startTok === value.startTok && c.endTok === cut.startTok - 1 && families.has(c.family) &&
                    attrs.has(c.attribute) && isGroundedPropertyValue(c, tabSpec.keys)));
                if (swallowsDirective) return;
              }
            }
            if (frame.contextProperty) {
              const value = roles.get('value');
              const attribute = roles.get('attribute');
              const keys = structuredContextKeys(attribute, tokens, candidates, kb, tabSpec);
              relativeTime = value && relativeTimeOperand(keys, tokens, value.startTok, value.endTok, kb, candidates);
              if (value && keys.length && (relativeTime || hasExactNumericKey(keys, attribute) || contextValues(candidates, keys, value).length)) {
                if (rem <= clEnd || splitPoints.some((cut) => cut.startTok >= value.startTok && cut.endTok < tIdx &&
                  ((!relativeTime && cut.isStrong) || predicates.some((p) => p.startTok === cut.endTok + 1)))) return;
                contextKeys = keys;
              }
            }
            if (window.side && (rem <= clEnd || !roles.get('value')?.groundedValue)) return;
            if (window.side === 'first' && !changePredicates.some((predicate) =>
              predicate.startTok === predSpan?.startTok && predicate.endTok === predSpan?.endTok)) return;
            if (window.internalJoiners) {
              const value = roles.get('value');
              const attribute = roles.get('attribute');
              if (rem <= clEnd || !value || !attribute || !roles.has('thing') ||
                  window.internalJoiners.some((cut) => cut.startTok <= value.startTok || cut.endTok >= value.endTok) ||
                  ![...propertyAttributes(attribute, kb, tabSpec)].some((key) => tabSpec.keys.get(key)?.head === 'span')) return;
            }
            if (rem > clEnd || (clEnd - tIdx) <= 2) {
              const candEnd = Math.min(clEnd, Math.max(s0, tIdx - 1));
              if (!bestInClause || candEnd > bestInClause.endTok) {
                bestInClause = {
                  startTok: s0,
                  endTok: candEnd,
                  roles: new Map(roles),
                  wordAnchors: [...wordAnchors],
                  predSpan,
                  contextKeys,
                  relativeTime,
                };
              }
            }
            return;
          }
          if (tIdx > clEnd + 1) return;

          const part = parts[pIdx];

          if (part.is === 'lead') {
            for (const nxt of matchLeadAt(tokens, tIdx, kb)) {
              if (nxt <= clEnd + 1) dfs(pIdx + 1, nxt, roles, wordAnchors, predSpan);
            }
            if (part.optional) dfs(pIdx + 1, tIdx, roles, wordAnchors, predSpan);
            return;
          }

          if (part.is === 'det') {
            if (tIdx <= clEnd && DET_WORDS.has(tokens[tIdx].lower)) {
              dfs(pIdx + 1, tIdx + 1, roles, wordAnchors, predSpan);
            }
            if (part.optional) dfs(pIdx + 1, tIdx, roles, wordAnchors, predSpan);
            return;
          }

          if (part.is === 'verb') {
            const reqAct = part.act || frame.act;
            for (const nxt of matchVerbAt(tokens, tIdx, reqAct, kb)) {
              if (nxt <= clEnd + 1) {
                dfs(pIdx + 1, nxt, roles, wordAnchors, { startTok: tIdx, endTok: nxt - 1 });
              }
            }
            if (part.optional) dfs(pIdx + 1, tIdx, roles, wordAnchors, predSpan);
            return;
          }

          if (part.is === 'word') {
            let boundValueConnector = false;
            for (const seq of part.wordSeqs) {
              const nxt = matchWordSeqAt(tokens, tIdx, seq);
              if (nxt > 0 && nxt <= clEnd + 1) {
                const nextPred = part.act ? { startTok: tIdx, endTok: nxt - 1 } : predSpan;
                const nextPart = parts.slice(pIdx + 1).find((p) => p.is !== 'det');
                if (mayHaveLiteralValue && parts[pIdx - 1]?.role === 'thing' && nextPart?.role === 'value' &&
                    roles.has('attribute') && partOwners.some((owner) => partOwnerInThing(owner, roles.get('thing')))) {
                  boundValueConnector = true;
                }
                const nextAnchors = [...wordAnchors, {
                  text: seq.join(' '), startTok: tIdx, endTok: nxt - 1,
                  partAt: part.at,
                  afterRole: parts[pIdx - 1]?.role,
                  beforeRole: nextPart?.role,
                }];
                dfs(pIdx + 1, nxt, roles, nextAnchors, nextPred);
              }
            }
            // A canonical time phrase can directly follow an explicit time
            // property. Keep the relative scope without supplying a missing connector.
            if (frame.contextProperty && parts[pIdx - 1]?.role === 'attribute' && parts[pIdx + 1]?.role === 'value' &&
                relativeTimeOperand(structuredContextKeys(roles.get('attribute'), tokens, candidates, kb, tabSpec),
                  tokens, tIdx, clEnd, kb, candidates)) {
              dfs(pIdx + 1, tIdx, roles, wordAnchors, predSpan);
            }
            if (part.optional && !boundValueConnector) dfs(pIdx + 1, tIdx, roles, wordAnchors, predSpan);
            return;
          }

          if (part.is === 'role') {
            if (part.takes === 'lexicon') {
              let ends = matchLexiconAt(tokens, tIdx, part.lexicon, kb, tabSpec);
              const thing = roles.get('thing');
              const coordinatedValue = window.side && thing && part.role === 'value' && part.lexicon === 'value' &&
                tokens.slice(thing.startTok, thing.endTok + 1).every((token) => !kb.grammar.prepositions.has(token.lower)) &&
                heads.some((head) => head.kind !== HYP_KINDS.TARGET_REF && head.family &&
                  head.startTok === thing.startTok && head.endTok === thing.endTok);
              const localValues = frame.act === 'change' && part.role === 'value' && part.lexicon === 'value' &&
                thing && !roles.has('attribute') && valueEnds.has(tIdx) &&
                (window.side ? coordinatedValue : findOwnerSelectors(thing, tokens, heads, relations, anchors).length > 0)
                ? valueEnds.get(tIdx)
                : null;
              if (localValues) {
                ends = [...new Set([...ends, ...localValues])].sort((a, b) => b - a);
              }
              for (const nxt of ends) {
                if (nxt <= clEnd + 1) {
                  const nextRoles = new Map(roles);
                  nextRoles.set(part.role, {
                    startTok: tIdx,
                    endTok: nxt - 1,
                    text: text.slice(tokens[tIdx].start, tokens[nxt - 1].end),
                    lexicon: part.lexicon,
                    describedOwner: !window.side && (localValues?.has(nxt) ?? false),
                    groundedValue: localValues?.has(nxt) ?? false,
                  });
                  dfs(pIdx + 1, nxt, nextRoles, wordAnchors, predSpan);
                }
              }
              if (part.optional) dfs(pIdx + 1, tIdx, roles, wordAnchors, predSpan);
              return;
            }

            if (part.takes === 'prep') {
              if (tIdx <= clEnd && kb?.grammar?.prepositions?.has(tokens[tIdx].lower)) {
                const nextRoles = new Map(roles);
                nextRoles.set(part.role, {
                  startTok: tIdx,
                  endTok: tIdx,
                  text: tokens[tIdx].text,
                });
                dfs(pIdx + 1, tIdx + 1, nextRoles, wordAnchors, predSpan);
              }
              if (part.optional) dfs(pIdx + 1, tIdx, roles, wordAnchors, predSpan);
              return;
            }

            // `takes === 'words'` (open role span, bounded by maxWords or 5 tokens, never crossing comma/punct)
            const maxW = part.maxWords ?? (pIdx === P - 1 ? 6 : 4);
            let maxEnd = Math.min(clEnd, tIdx + maxW - 1);
            if (part.role === 'thing' && mayHaveLiteralValue && roles.has('attribute')) {
              for (const owner of partOwners) {
                if (owner.partHead[0] >= tIdx && owner.partHead[1] <= maxEnd && owner.endTok <= clEnd) {
                  maxEnd = Math.max(maxEnd, owner.endTok);
                }
              }
            }
            // If this is the last required part, prefer longer spans; otherwise try shortest-first to hit next anchor cleanly
            const lengths = [];
            for (let end = tIdx; end <= maxEnd; end++) {
              if (tokens[end].isPunct && end > tIdx) break;
              if (tokens[end].isPunct && end === tIdx) break;
              lengths.push(end);
            }
            if (part.role === 'value' && mayHaveLiteralValue && roles.has('thing') && roles.has('attribute')) {
              const connector = wordAnchors.find((word) => word.afterRole === 'thing' && word.beforeRole === 'value');
              const families = new Set(partOwners.filter((owner) => partOwnerInThing(owner, roles.get('thing'))).map((owner) => owner.family));
              let last = clEnd;
              while (last > tIdx && (tokens[last].isPunct || tokens[last].isFiller)) last--;
              if (connector && families.size && last > (lengths.at(-1) ?? tIdx)) {
                const attributes = [...propertyAttributes(roles.get('attribute'), kb, tabSpec)];
                const split = splitPartProperties({ startTok: tIdx, endTok: last }, connector.text.split(' '), attributes,
                  families, tokens, candidates, kb, tabSpec.keys);
                if (split.properties.length) lengths.push(last);
              }
            }
            if (pIdx === P - 1) lengths.reverse();
            for (const end of lengths) {
              const nextRoles = new Map(roles);
              nextRoles.set(part.role, {
                startTok: tIdx,
                endTok: end,
                text: text.slice(tokens[tIdx].start, tokens[end].end),
              });
              dfs(pIdx + 1, end + 1, nextRoles, wordAnchors, predSpan);
            }
            if (part.optional) dfs(pIdx + 1, tIdx, roles, wordAnchors, predSpan);
          }
        };

        dfs(0, s0, new Map(), [], null);
        if (bestInClause) {
          rawMatches.push({
            frameName: frame.name,
            act: frame.act,
            mode: frame.mode,
            priority: frame.priority,
            sourceShard: frame.sourceShard,
            fixed: frame.fixed,
            clauseWindow: window.joinerBounded ? window : null,
            coordination: window.side ? window : null,
            ellipsisAnchors: frame.ellipsisAnchors,
            ...bestInClause,
          });
          break; // one match per frame per clause
        }
      }
    }
  }

  // Reserve a ranked match for each observed clause start before filling the remaining budget.
  rawMatches.sort((a, b) => b.priority - a.priority || (b.endTok - b.startTok) - (a.endTok - a.startTok));
  const seen = new Set();
  const bestByStart = new Map();
  const alternatives = [];
  const coordinated = [];
  const context = [];
  for (const m of rawMatches) {
    if (m.coordination) {
      coordinated.push(m);
      continue;
    }
    const scope = m.clauseWindow;
    const key = `${m.frameName}:${m.startTok}:${m.endTok}:${scope?.startTok ?? ''}:${scope?.endTok ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (m.contextKeys) context.push(m);
    if (bestByStart.has(m.startTok)) alternatives.push(m);
    else bestByStart.set(m.startTok, m);
  }
  const ranked = [...bestByStart.values(), ...alternatives].slice(0, 6);
  return [...new Set([...ranked, ...context]), ...coordinated].map((m, id) => ({ id, ...m }));
}

export function pairResultativeFrames(matches) {
  const firstMatches = matches.filter((match) => match.coordination?.side === 'first' && match.predSpan);
  const pairs = new Map();
  for (const second of matches.filter((match) => match.coordination?.side === 'second')) {
    for (const first of firstMatches) {
      if (first.coordination.pairKey !== second.coordination.pairKey ||
          !second.ellipsisAnchors.has(first.frameName)) continue;
      const parts = [first, second].map((match) => ({
        startTok: match.startTok, endTok: match.endTok, predicate: match.predSpan?.startTok ?? -1,
        thing: match.roles.get('thing'), value: match.roles.get('value'),
      }));
      const key = JSON.stringify(parts);
      if (!pairs.has(key)) pairs.set(key, parts);
    }
  }
  return [...pairs.values()];
}

/**
 * Enrich lattice candidates with grounded argument-structure hypotheses from matched `w.lang.en.frame` instances
 * and attach explicit candidate-ID bindings so `src/smt/encode.mjs` can encode Z3 frame-attachment laws!
 */
export function applyFrameMatchesToLattice(frameMatches, { tokens, text, kb, tabSpec, candidates, emit, emitConstraint, parseNumeric }) {
  if (!frameMatches?.length) return [];

  const tabKeys = tabSpec?.keys ?? new Map();
  const tabFamilies = tabSpec?.families ?? [];
  const enriched = [];

  for (const fm of frameMatches) {
    if (fm.coordination) continue;
    const blockedSpatialToks = new Set();
    const blockedEndpointToks = new Set();
    const expectedAttrs = new Set();
    const numericPropertyFamilies = new Set();
    const requiredCandGroups = []; // each group is an array of candidate IDs (at least one must be selected if frame active)
    const forceResultCandIds = new Set();
    const forceSelectorCandIds = new Set();

    const attrSpan = fm.roles.get('attribute');
    const thingSpan = fm.roles.get('thing');
    const valSpan = fm.roles.get('value');
    // An open noun phrase cannot end in an article, as in the spurious
    // owner "add a" in a creation directive with a named object.
    if (thingSpan && thingSpan.startTok < thingSpan.endTok &&
        kb.grammar.determiners?.get(tokens[thingSpan.endTok].lower)?.kind === 'article') continue;
    let resultSpan = valSpan;
    let additionalProperties = [];
    let unresolvedDuration = null;
    let contextProperty = null;
    const oldSpan = fm.roles.get('old');
    const topicSpan = fm.roles.get('topic');
    const wholeSpan = fm.roles.get('whole');
    const critSpan = fm.roles.get('criterion');
    const endsSpan = fm.roles.get('ends');
    const arrSpan = fm.roles.get('arrangement');
    const relSpan = fm.roles.get('rel');
    const matSpan = fm.roles.get('material');
    const replSpan = fm.roles.get('replacement');
    const propertyOwnerMarker = attrSpan && thingSpan && valSpan
      ? fm.wordAnchors.find((wa) => wa.afterRole === 'attribute' && wa.beforeRole === 'thing')
      : null;
    const describedOwner = Boolean(valSpan?.describedOwner && !attrSpan);

    if (fm.contextKeys) {
      const keys = fm.contextKeys;
      const families = [...new Set(keys.map((key) => key.family))];
      const token = tokens[valSpan.startTok];
      if (valSpan.startTok === valSpan.endTok && token.kind === 'quote') {
        const inner = tokenize(token.inner, kb);
        const scalar = inner.length === 1 && inner[0].kind === 'number' ? parseNumeric?.(inner[0]) : null;
        if (scalar != null) {
          for (const key of keys.filter((key) => key.head.startsWith('number'))) {
            emitConstraint(key.name, String(scalar), valSpan.startTok, valSpan.endTok, { phase: 'result', requiresKeyWord: true, cost: 1 });
          }
        }
      }
      const valid = fm.relativeTime ? [] : contextValues(candidates, keys, valSpan);
      for (const c of valid) expectedAttrs.add(c.attribute);
      const unresolved = valid.length ? null : { startTok: attrSpan.startTok, endTok: valSpan.endTok };
      if (unresolved) emit({ kind: HYP_KINDS.UNREAD, ...unresolved, propertyQualifier: true,
        note: fm.relativeTime ? 'pp.time' : fm.frameName, requiredRelativeTime: Boolean(fm.relativeTime), cost: 9 });
      const beforeAttribute = attrSpan.startTok - 1;
      const determiner = tokens[beforeAttribute];
      const ownerToken = beforeAttribute >= fm.startTok && determiner?.kind === 'word' &&
        kb.grammar.determiners?.get(determiner.lower)?.kind === 'possessive' ? beforeAttribute : null;
      if (ownerToken !== null) {
        emit({ kind: HYP_KINDS.TARGET_REF, startTok: ownerToken, endTok: ownerToken,
          isPronoun: true, isPropertyOwner: true, fill: 'context', det: 'possessive', families, cost: 3 });
      }
      contextProperty = { families, ownerToken, unresolved, groundedRelativeTime: fm.relativeTime?.grounded ?? false };
    }

    // 1. Property-owner-value frame (`acts.change.property.on`: "Set the width on the node to 15",
    //    `acts.ask.property.have`: "What width does the node have?"):
    //    The matched part between attribute and thing introduces the owner.
    //    The part between thing and value introduces the result, not a link endpoint.
    if (attrSpan && thingSpan) {
      for (const wa of fm.wordAnchors) {
        if (valSpan && wa.afterRole === 'thing' && wa.beforeRole === 'value') {
          for (let t = wa.startTok; t <= valSpan.endTok; t++) blockedEndpointToks.add(t);
        }
      }
      // Find attributes matching attrSpan in tabSpec.keyWordIndex
      const matchedAttrs = [...propertyAttributes(attrSpan, kb, tabSpec)].filter((attr) => {
        const key = tabKeys.get(attr);
        return key && (!fm.clauseWindow?.internalJoiners || key.head === 'span');
      });
      if (valSpan && matchedAttrs.length > 0) {
        const partFamilies = new Set(candidates.filter((c) => partOwnerInThing(c, thingSpan)).map((c) => c.family));
        const connector = fm.wordAnchors.find((word) => word.afterRole === 'thing' && word.beforeRole === 'value');
        if (propertyOwnerMarker && partFamilies.size && connector) {
          const split = splitPartProperties(valSpan, connector.text.split(' '), matchedAttrs, partFamilies, tokens, candidates, kb, tabKeys);
          additionalProperties = split.properties;
          if (split.endTok !== valSpan.endTok) {
            resultSpan = { ...valSpan, endTok: split.endTok, text: text.slice(tokens[valSpan.startTok].start, tokens[split.endTok].end) };
          }
        }
        const surface = attrSpan.text.toLowerCase();
        for (const attr of matchedAttrs) {
          const key = tabKeys.get(attr);
          if (key.head === 'number' && key.literalKeyWords?.has(surface)) numericPropertyFamilies.add(key.family);
        }
        if (propertyOwnerMarker && numericPropertyFamilies.size > 0) {
          // A duration following a complete numeric property value qualifies the
          // change. The request schema has no slot for this duration.
          const duration = candidates.find((c) => c.measure != null && ['second', 'minute', 'hour'].includes(c.unit) &&
            c.startTok > valSpan.startTok + 1 && c.endTok === valSpan.endTok && tokens[c.startTok - 1].lower === 'for');
          if (duration) {
            const endTok = duration.startTok - 2;
            const hasValue = candidates.some((c) => matchedAttrs.includes(c.attribute) &&
              numericPropertyFamilies.has(c.family) && c.startTok === valSpan.startTok && c.endTok === endTok &&
              c.value.trim() !== '' && Number.isFinite(Number(c.value)) && !c.pairedConstraints?.length);
            if (hasValue) {
              resultSpan = {
                startTok: valSpan.startTok,
                endTok,
                text: text.slice(tokens[valSpan.startTok].start, tokens[endTok].end),
              };
              unresolvedDuration = { startTok: duration.startTok - 1, endTok: duration.endTok };
              emit({ kind: HYP_KINDS.UNREAD, ...unresolvedDuration, propertyQualifier: true, cost: 8 });
            }
          }
        }
        // Ordinary numbers and measures already have structured lattice candidates.
        // A quoted scalar is numeric here only when the complete inner text is one number.
        const quoted = resultSpan.startTok === resultSpan.endTok ? tokens[resultSpan.startTok] : null;
        const inner = quoted?.kind === 'quote' ? tokenize(quoted.inner, kb) : [];
        const quotedNumber = inner.length === 1 && inner[0].kind === 'number' ? parseNumeric?.(inner[0]) : null;
        for (const attr of matchedAttrs) {
          expectedAttrs.add(attr);
          const key = tabKeys.get(attr);
          const numeric = key.head === 'number' || numericPropertyFamilies.has(key.family);
          if (numeric && quotedNumber == null) continue;
          let value = resultSpan.text;
          if (numeric) value = String(quotedNumber);
          else if (key.head === 'span' && quoted?.kind === 'quote') value = quoted.inner;
          emitConstraint(attr, value, resultSpan.startTok, resultSpan.endTok, {
            phase: 'result',
            requiresKeyWord: true,
            allowOpen: true,
            cost: 1.0,
          });
        }
      }
      // Ensure owner span has a grounded TARGET_REF if no sort/family/ref already covers it
      const hasOwnerCand = candidates.some(
        (c) =>
          (c.kind === HYP_KINDS.TARGET_REF || c.kind === HYP_KINDS.TARGET_SORT || c.kind === HYP_KINDS.TARGET_FAMILY) &&
          c.startTok >= thingSpan.startTok &&
          c.endTok <= thingSpan.endTok,
      );
      const startsWithDirective = candidates.some((candidate) =>
        candidate.kind === HYP_KINDS.PREDICATE && candidate.startTok === thingSpan.startTok &&
        candidate.endTok < thingSpan.endTok && DET_WORDS.has(tokens[candidate.endTok + 1]?.lower));
      if (!hasOwnerCand && !startsWithDirective && thingSpan.text && !DET_WORDS.has(thingSpan.text.toLowerCase())) {
        emit({
          kind: HYP_KINDS.TARGET_REF,
          startTok: thingSpan.startTok,
          endTok: thingSpan.endTok,
          fill: 'written',
          name: thingSpan.text,
          isProper: true,
          det: 'definite',
          detTok: -1,
          families: tabFamilies,
          cost: 2.5,
        });
      }
    }

    // 2. Old -> new transition (`acts.change.from`: "Change the car from red to blue")
    if (oldSpan && valSpan) {
      for (const wa of fm.wordAnchors) {
        if (['from', 'to', 'into'].includes(wa.text)) {
          for (let t = wa.startTok; t <= valSpan.endTok; t++) blockedEndpointToks.add(t);
        }
      }
    }

    // 3. Diagram kind + topic + criterion (`diagram-frames.sop`: "Make a flowchart of making tea", "Draw the planets on a timeline")
    if (tabKeys.has('diagram.kind') && topicSpan && thingSpan?.lexicon?.startsWith('diagram.kind')) {
      for (const wa of fm.wordAnchors) {
        if (['on', 'in', 'onto', 'into', 'as'].includes(wa.text)) {
          for (let t = wa.startTok; t <= thingSpan.endTok; t++) blockedSpatialToks.add(t);
        }
      }
      const topicEnd = wholeSpan ? wholeSpan.endTok : topicSpan.endTok;
      const topicText = text.slice(tokens[topicSpan.startTok].start, tokens[topicEnd].end);
      if (tabKeys.has('diagram.about') && topicText) {
        emitConstraint('diagram.about', topicText, topicSpan.startTok, topicEnd, { phase: 'result', cost: 1.2 });
      }
      if (critSpan && tabKeys.has('diagram.by')) {
        emitConstraint('diagram.by', critSpan.text, critSpan.startTok, critSpan.endTok, { phase: 'result', cost: 1.2 });
      }
    }

    // 4. Edge-label frames (`acts.change.label.edge.ends`: "Label the arrow from A to B no", `acts.change.label.edge`: "Call the arrow yes")
    if (fm.fixed.get('attribute') === 'label' && valSpan && tabKeys.has('link.label')) {
      emitConstraint('link.label', valSpan.text, valSpan.startTok, valSpan.endTok, {
        phase: 'result',
        allowOpen: true,
        cost: 0.8,
      });
      if (endsSpan) {
        // Parse "<from> to/and <to>" inside endsSpan
        const eToks = tokens.slice(endsSpan.startTok, endsSpan.endTok + 1);
        const sepIdx = eToks.findIndex((t) => t.lower === 'to' || t.lower === 'and');
        if (sepIdx > 0 && sepIdx < eToks.length - 1) {
          const fromEnd = endsSpan.startTok + sepIdx - 1;
          const toStart = endsSpan.startTok + sepIdx + 1;
          const fromText = text.slice(tokens[endsSpan.startTok].start, tokens[fromEnd].end);
          const toText = text.slice(tokens[toStart].start, tokens[endsSpan.endTok].end);
          if (tabKeys.has('link.from')) emitConstraint('link.from', fromText, endsSpan.startTok, fromEnd, { phase: 'selector', cost: 1.0 });
          if (tabKeys.has('link.to')) emitConstraint('link.to', toText, toStart, endsSpan.endTok, { phase: 'selector', cost: 1.0 });
        }
      }
    }

    // 5. Layout-direction frames (`diagram-frames.sop`: "Make the arrows go left to right")
    if (relSpan?.lexicon === 'diagram.direction') {
      const low = relSpan.text.toLowerCase();
      const dirVal = /bottom to top|upward/.test(low)
        ? 'bottom_up'
        : /top to bottom|downward|vertical|down the page|above|below|under/.test(low)
          ? 'top_down'
          : /right to left/.test(low)
            ? 'right_left'
            : 'left_right';
      if (tabKeys.has('diagram.direction')) {
        emitConstraint('diagram.direction', dirVal, relSpan.startTok, relSpan.endTok, { phase: 'result', allowOpen: true, cost: 1.0 });
      }
      if (tabKeys.has('node.axis')) {
        const axisVal = (dirVal === 'top_down' || dirVal === 'bottom_up') ? 'vertical' : 'horizontal';
        emitConstraint('node.axis', axisVal, relSpan.startTok, relSpan.endTok, { phase: 'result', cost: 1.2 });
      }
    }

    // 6. Shape-arrangement frames (`shape-frames.sop`: "Make a diagram in the shape of a house", "Lay the boxes out star-shaped")
    if (arrSpan?.lexicon?.startsWith('outline.')) {
      for (const wa of fm.wordAnchors) {
        if (wa.text.includes('shape') || wa.text.includes('form') || wa.text === 'in' || wa.text === 'as' || wa.text === 'of') {
          for (let t = wa.startTok; t <= arrSpan.endTok; t++) blockedSpatialToks.add(t);
        }
      }
      const shapeVal = arrSpan.text.toLowerCase().replace(/[\s-]+shaped$/, '').trim();
      for (const attr of ['drawn.arrangement', 'diagram.layout', 'node.layout']) {
        if (tabKeys.has(attr)) {
          expectedAttrs.add(attr);
          emitConstraint(attr, shapeVal, arrSpan.startTok, arrSpan.endTok, { phase: 'result', allowOpen: true, cost: 0.6 });
        }
      }
    }

    // 7. Material & replacement frames (`role-frames.sop`: "Make a boat out of paper", "Replace the hat with a crown")
    if (matSpan && tabKeys.has('drawn.material')) {
      for (const wa of fm.wordAnchors) {
        for (let t = wa.startTok; t <= matSpan.endTok; t++) blockedSpatialToks.add(t);
      }
      expectedAttrs.add('drawn.material');
      emitConstraint('drawn.material', matSpan.text.toLowerCase(), matSpan.startTok, matSpan.endTok, { phase: 'result', allowOpen: true, cost: 1.2 });
    }
    if (replSpan) {
      if (tabKeys.has('drawn.kind')) emitConstraint('drawn.kind', replSpan.text.toLowerCase(), replSpan.startTok, replSpan.endTok, { phase: 'result', allowOpen: true, cost: 1.2 });
      if (tabKeys.has('part.variant')) emitConstraint('part.variant', replSpan.text.toLowerCase(), replSpan.startTok, replSpan.endTok, { phase: 'result', allowOpen: true, cost: 1.5 });
    }

    // Only emit Z3 frame constraints for structurally informative argument-structure frames
    // (skip generic 1-role <verb> <thing> frames from frames-acts.sop that carry no argument-attachment structure).
    const hasArgumentStructure =
      describedOwner ||
      blockedSpatialToks.size > 0 ||
      blockedEndpointToks.size > 0 ||
      Boolean(attrSpan || oldSpan || topicSpan || wholeSpan || critSpan || endsSpan || arrSpan || matSpan || replSpan);
    if (!hasArgumentStructure) continue;

    enriched.push({
      id: enriched.length,
      frameName: fm.frameName,
      act: fm.act,
      mode: fm.mode,
      priority: fm.priority,
      startTok: fm.startTok,
      endTok: fm.endTok,
      clauseWindow: fm.clauseWindow,
      propertyOwnerMarker,
      additionalProperties,
      describedOwner,
      unresolvedDuration,
      contextProperty,
      blockedSpatialToks: [...blockedSpatialToks],
      blockedEndpointToks: [...blockedEndpointToks],
      oldSpan: oldSpan ? { startTok: oldSpan.startTok, endTok: oldSpan.endTok } : null,
      valSpan: resultSpan ? { startTok: resultSpan.startTok, endTok: resultSpan.endTok } : (arrSpan ? { startTok: arrSpan.startTok, endTok: arrSpan.endTok } : null),
      attrSpan: attrSpan ? { startTok: attrSpan.startTok, endTok: attrSpan.endTok } : null,
      thingSpan: thingSpan ? { startTok: thingSpan.startTok, endTok: thingSpan.endTok } : null,
      endsSpan: endsSpan ? { startTok: endsSpan.startTok, endTok: endsSpan.endTok } : null,
      expectedAttrs: [...expectedAttrs],
      numericPropertyFamilies: [...numericPropertyFamilies],
      requiredCandGroups,
      forceResultCandIds: [...forceResultCandIds],
      forceSelectorCandIds: [...forceSelectorCandIds],
    });
  }

  return enriched;
}
