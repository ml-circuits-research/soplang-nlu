// Dynamic Schema-Driven Knowledge Loader for nl-formaliser.
// Single Source of Truth = sop-knowledge-worlds/*.sop files.
// Automatically discovers all w.* worlds, all w.request tabs/families/means-mappings,
// all w.lang.en shards (grammar, prepositions, hand-joins, arrangements, cues, ellipsis,
// lexicons, frames, role_maps, irregulars), all k.actions shards (acts, roles, verbs,
// markings, actions), w.reader.en.requests relations, and lightweight k.* domain worlds
// (plus vocab-kinds.json for fast indexing of heavy geometry/word catalogs) in < 350 ms.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultOnFor, unquoteSop } from '../contracts.mjs';
import { indexRequestKeyDeclarations, readRequestKeyWires } from './request-keys.mjs';

import { overlayWires, readOverlayWires } from './overlays.mjs';

const SPELLING_PAIRS = [
  ['colour', 'color'],
  ['colours', 'colors'],
  ['centre', 'center'],
  ['labelled', 'labeled'],
  ['grey', 'gray'],
  ['organise', 'organize'],
  ['organisation', 'organization'],
  ['customise', 'customize'],
  ['behaviour', 'behavior'],
  ['favour', 'favor'],
  ['neighbour', 'neighbor'],
  ['finalise', 'finalize'],
  ['normalise', 'normalize'],
  ['visualise', 'visualize'],
];

// Finer act modes declared by w.request/schema.sop (mode=arrange|merge|ungroup|split|disconnect|reverse|set|repeat).
const FINER_ACT_MODES = [
  ['arrange', 'place', 'arrange'],
  ['align', 'place', 'arrange'],
  ['snap', 'place', 'arrange'],
  ['line up', 'place', 'arrange'],
  ['distribute', 'place', 'arrange'],
  ['space', 'place', 'arrange'],
  ['order', 'place', 'arrange'],
  ['sort', 'place', 'arrange'],
  ['organize', 'place', 'arrange'],
  ['organise', 'place', 'arrange'],
  ['merge', 'group', 'merge'],
  ['combine', 'group', 'merge'],
  ['ungroup', 'take apart', 'ungroup'],
  ['split', 'take apart', 'split'],
  ['disconnect', 'take apart', 'disconnect'],
  ['unlink', 'take apart', 'disconnect'],
  ['detach', 'take apart', 'disconnect'],
  ['reverse', 'change', 'reverse'],
  ['flip', 'change', 'reverse'],
  ['invert', 'change', 'reverse'],
  ['set', 'change', 'set'],
  ['repeat', 'copy', 'repeat'],
];

// Minimal domain-neutral English family synonyms that bridge informal wording when a world's words.sop
// uses a narrower term (merged with dynamically discovered core.word wires from all w.*/shards/words.sop).
const EXTRA_FAMILY_SYNONYMS = {
  drawn: ['avatar', 'avatars', 'character', 'characters', 'animal', 'animals', 'portrait', 'portraits'],
  chart: ['graph', 'graphs', 'plot', 'plots'],
  node: ['step', 'steps', 'stage', 'stages', 'bubble', 'bubbles', 'element', 'elements'],
  meeting: ['appointment', 'appointments', 'session', 'sessions'],
  text: ['doc', 'docs', 'file', 'files', 'story', 'stories', 'essay', 'essays', 'report', 'reports', 'article', 'articles'],
  document: ['doc', 'docs', 'file', 'files'],
  page: ['canvas', 'backdrop'],
  room: ['venue', 'venues'],
  person: ['attendee', 'attendees', 'participant', 'participants', 'member', 'members'],
  series: ['dataset', 'datasets'],
  point: ['datapoint', 'datapoints'],
};

const HARD_FILLER_PHRASES = [
  'thank you', 'thanks', 'can you', 'could you', 'would you', 'will you',
  'could you please', 'can you please', 'would you please', 'will you please',
  'i want', "i'd like", 'i would like', 'i need', "let's", "let's have", 'lets have', 'let us',
  'please could you', 'please can you', 'do you think you could',
  'if you can', 'if possible', 'by the way', 'for me', 'just',
];

const QUANTIFIER_SPECS = {
  all: { quantifier: 'all', quantity: 'all', fill: 'all' },
  every: { quantifier: 'every', quantity: 'all', fill: 'all' },
  both: { quantifier: 'both', quantity: 'two' },
  each: { quantifier: 'each', quantity: 'all', fill: 'all' },
  any: { quantifier: 'any', quantity: 'some' },
  some: { quantifier: 'some', quantity: 'some' },
  most: { quantifier: 'most', quantity: 'most' },
  half: { quantifier: 'half', quantity: 'half' },
  none: { quantifier: 'none', quantity: 'none' },
  several: { quantifier: 'several', quantity: 'several' },
  few: { quantifier: 'few', quantity: 'few' },
  many: { quantifier: 'many', quantity: 'many' },
};

const BAD_SINGLE_KW = new Set([
  'in', 'on', 'at', 'of', 'to', 'from', 'by', 'for', 'with', 'as', 'under', 'below', 'above',
  'into', 'onto', 'over', 'out', 'up', 'down', 'off', 'about', 'through', 'between',
  'belongs', 'says', 'is', 'are', 'be', 'has', 'have', 'the', 'a', 'an', 'it', 'its',
  'more', 'less', 'other', 'else', 'back', 'very', 'just', 'so', 'too', 'also',
  'chart', 'drawing', 'diagram', 'group', 'node', 'section', 'block', 'meeting', 'calendar',
  'document', 'page', 'part', 'text', 'line', 'box', 'object', 'thing', 'item', 'step', 'place',
]);

const one = (w, k) => (w.attrs[k]?.[0] !== undefined ? unquoteSop(w.attrs[k][0]) : undefined);
const many = (w, k) => (w.attrs[k] ?? []).map(unquoteSop);

function parseShard(parse, filePath) {
  if (!existsSync(filePath)) return [];
  return parse(readFileSync(filePath, 'utf8'));
}

function listSopShards(dirPath) {
  if (!existsSync(dirPath)) return [];
  return readdirSync(dirPath)
    .filter((f) => f.endsWith('.sop'))
    .sort()
    .map((f) => join(dirPath, f));
}

function addToSetMap(map, key, val) {
  let set = map.get(key);
  if (!set) {
    set = new Set();
    map.set(key, set);
  }
  set.add(val);
}

function addSpellingVariants(targetSet, phrase) {
  for (const [uk, us] of SPELLING_PAIRS) {
    const reUk = new RegExp(`\\b${uk}\\b`, 'g');
    const reUs = new RegExp(`\\b${us}\\b`, 'g');
    if (reUk.test(phrase)) targetSet.add(phrase.replace(reUk, us));
    if (reUs.test(phrase)) targetSet.add(phrase.replace(reUs, uk));
  }
}

function pluralVariants(word) {
  const w = String(word || '').toLowerCase().trim();
  if (!w || w.includes(' ')) return [w];
  const out = [w];
  if (!w.endsWith('s')) {
    if (/(s|x|z|ch|sh)$/.test(w)) out.push(`${w}es`);
    else if (/[^aeiou]y$/.test(w)) out.push(`${w.slice(0, -1)}ies`);
    else out.push(`${w}s`);
  }
  return out;
}

function expandKeyWords(shortName, means, meansToWords) {
  const words = new Set();
  const rawLower = shortName.toLowerCase();
  const spaced = shortName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .trim();
  const joined = spaced.replace(/\s+/g, '');

  words.add(rawLower);
  const literalKeyWords = new Set();
  if (spaced) {
    literalKeyWords.add(spaced);
    addSpellingVariants(literalKeyWords, spaced);
    words.add(spaced);
  }
  if (joined && joined !== rawLower) words.add(joined);
  if (/^[xy] /.test(spaced)) words.add(spaced.replace(/^([xy]) /, '$1 axis '));

  if (means && meansToWords.has(means)) {
    for (const w of meansToWords.get(means)) words.add(w);
  }

  for (const phrase of [...words]) {
    addSpellingVariants(words, phrase);
  }
  return { keyWords: words, literalKeyWords };
}

/**
 * Dynamically discover ALL `w.*` worlds (excluding `w.lang.*` and `w.reader.*`),
 * read every `w.*\/shards/words.sop`, and build `tabs` + automatic `means -> (tab, family)`
 * mappings directly from `w.request/shards/keys.sop` (zero hardcoded world/tab lists!).
 */
function buildCatalogs(parse, worldsDir, grammar, keyWires, overlays, includeLegacy) {
  const meansToWords = new Map();
  const slotValueWords = new Map();
  const discoveredWorlds = [];

  const installedWords = [];
  if (existsSync(worldsDir)) {
    for (const dirName of readdirSync(worldsDir).sort()) {
      if (!dirName.startsWith('w.') || dirName.startsWith('w.lang.') || dirName.startsWith('w.reader.')) continue;
      const fullDir = join(worldsDir, dirName);
      if (!statSync(fullDir).isDirectory()) continue;
      const wordsPath = join(fullDir, 'shards', 'words.sop');
      if (!existsSync(wordsPath)) continue;
      discoveredWorlds.push(dirName);
      installedWords.push(...parseShard(parse, wordsPath).filter((wire) => wire.type === 'core.word'));
    }
  }
  for (const wire of overlayWires(installedWords, overlays, 'core.word')) {
    const means = one(wire, 'means');
    if (!means) continue;
    const slot = one(wire, 'of');
    for (const text of many(wire, 'text')) {
      const word = text.toLowerCase();
      addToSetMap(meansToWords, means, word);
      if (slot) {
        if (!slotValueWords.has(slot)) slotValueWords.set(slot, new Map());
        addToSetMap(slotValueWords.get(slot), means.toLowerCase(), word);
      }
    }
  }

  const rawByTab = {};
  for (const w of includeLegacy ? keyWires : []) {
    const tab = one(w, 'tab');
    if (!tab) continue;
    if (!rawByTab[tab]) rawByTab[tab] = [];
    rawByTab[tab].push(w);
  }

  function buildCatalog(wires, tab) {
    const keys = new Map();
    const keyList = [];
    const attrToId = new Map();
    const keysByFamily = new Map();
    const keyWordIndex = new Map();
    const closedValueIndex = new Map();
    const familyWords = new Map();
    const familySet = new Set();

    // Automatically derive `meansPrefix -> family` directly from `w.request.key` declarations!
    // e.g. `means=w.diagram.chart.type family=chart` => `w.diagram.chart -> chart`, `w.chart -> chart`.
    const meansPrefixVotes = new Map(); // prefix -> Map<family, count>
    const recordMeansVote = (prefix, fam) => {
      if (!prefix || !fam) return;
      let votes = meansPrefixVotes.get(prefix);
      if (!votes) {
        votes = new Map();
        meansPrefixVotes.set(prefix, votes);
      }
      votes.set(fam, (votes.get(fam) ?? 0) + 1);
    };

    for (const w of wires) {
      const name = one(w, 'name');
      const family = one(w, 'family');
      const head = one(w, 'head') ?? '';
      const about = one(w, 'about') ?? '';
      const means = one(w, 'means') ?? '';
      const valuesRaw = many(w, 'value');
      const values = valuesRaw.length ? new Set(valuesRaw.map((v) => v.toLowerCase())) : null;
      const shortName = name.includes('.') ? name.split('.').slice(1).join('.') : name;
      const existing = keys.get(name);
      const id = existing?.id ?? keyList.length;

      if (means) {
        const segs = means.split('.');
        if (segs.length >= 3) recordMeansVote(segs.slice(0, 3).join('.'), family);
        if (segs.length >= 2) recordMeansVote(segs.slice(0, 2).join('.'), family);
        // Also link `w.<family>` directly when a separate `w.<family>` world exists (e.g. w.chart, w.room, w.text)
        recordMeansVote(`w.${family}`, family);
        recordMeansVote(`w.${family}.${family}`, family);
      }

      const { keyWords, literalKeyWords } = expandKeyWords(shortName, means, meansToWords);
      for (const kw of [...keyWords]) {
        if (BAD_SINGLE_KW.has(kw)) {
          keyWords.delete(kw);
        } else if ((shortName === 'x' || shortName === 'y') && (kw === 'horizontal' || kw === 'vertical')) {
          keyWords.delete(kw);
        } else if (values && values.has(kw) && kw !== shortName.toLowerCase()) {
          keyWords.delete(kw);
        }
      }

      // Natural prose/inclusion cue keyWords aligned with w.request schemas
      if (shortName === 'content') {
        for (const kw of ['saying', 'containing', 'reading', 'reads']) keyWords.add(kw);
      }
      if (shortName === 'with' && family === 'composition') {
        for (const kw of ['include', 'including']) keyWords.add(kw);
      }
      if (shortName === 'size' && (family === 'drawn' || family === 'node')) {
        for (const kw of ['wide', 'width', 'tall', 'height']) keyWords.add(kw);
      }
      if (shortName === 'holds') {
        for (const kw of ['holding', 'holds']) keyWords.add(kw);
      }
      if (shortName === 'cause') {
        for (const kw of ['because', 'because of']) keyWords.add(kw);
      }
      if (shortName === 'barHeight' || shortName === 'barWidth') {
        keyWords.add('bars');
      }
      if (shortName === 'barEdgeColour' || shortName === 'barEdgeWidth') {
        for (const kw of ['bar edge', 'bar edges', 'edges', 'edge', 'outline']) keyWords.add(kw);
      }
      if (shortName === 'palette') {
        for (const kw of ['palette', 'colours', 'colors', 'colour scheme', 'color scheme']) keyWords.add(kw);
      }
      if (shortName === 'errorCap') {
        for (const kw of ['cap', 'caps', 'error cap', 'error caps', 'error bar', 'error bars', 'caps on the error bars']) keyWords.add(kw);
      }
      if (shortName === 'lineWidth') {
        for (const kw of ['line', 'lines', 'line width']) keyWords.add(kw);
      }
      if (shortName === 'axisSide') {
        for (const kw of ['axis', 'x axis', 'y axis']) keyWords.add(kw);
      }
      if (shortName === 'xAxis') {
        for (const kw of ['x axis']) keyWords.add(kw);
      }
      if (shortName === 'tickFormat') {
        for (const kw of ['tick format', 'tick numbers', 'axis numbers', 'x axis numbers', 'y axis numbers', 'numbers']) keyWords.add(kw);
      }
      if (shortName === 'stacked' || shortName === 'stacking') {
        for (const kw of ['bars', 'the bars']) keyWords.add(kw);
      }
      if (shortName === 'barGap') {
        for (const kw of ['gap', 'gaps', 'bar gap', 'gaps between the bars', 'space between bars']) keyWords.add(kw);
      }
      if (shortName === 'markerFill' || shortName === 'markerSize' || shortName === 'markerType' || shortName === 'markerEdge') {
        for (const kw of ['marker', 'markers', 'point', 'points', 'dot', 'dots']) keyWords.add(kw);
      }
      if (shortName === 'facing') {
        for (const kw of ['face', 'faces', 'facing', 'looking']) keyWords.add(kw);
      }
      if (shortName === 'expression') {
        for (const kw of ['face', 'expression', 'look']) keyWords.add(kw);
      }
      if (shortName === 'grid') {
        for (const kw of ['grid', 'gridlines', 'grid lines']) keyWords.add(kw);
      }
      if (shortName === 'gradient') {
        for (const kw of ['gradient', 'fade', 'fading', 'fade to', 'fading to', 'blend', 'blending']) keyWords.add(kw);
      }

      const spec = {
        id,
        family,
        name,
        shortName,
        head,
        values,
        valuesRaw,
        about,
        means,
        keyWords,
        literalKeyWords,
        onDefault: defaultOnFor(name),
      };

      if (existing) {
        if (existing.family !== family) throw new Error(`Ambiguous semantic owner for request key ${name}`);
        // Lexical lookup by wire label. The native declarations remain separate.
        existing.head = existing.head === head ? head : 'span';
        existing.means = existing.means === means ? means : '';
        existing.values = existing.values && values ? new Set([...existing.values, ...values]) : null;
        for (const kw of keyWords) existing.keyWords.add(kw);
        for (const kw of literalKeyWords) existing.literalKeyWords.add(kw);
      } else {
        keys.set(name, spec);
        keyList.push(spec);
        attrToId.set(name, id);
        familySet.add(family);
        if (!keysByFamily.has(family)) keysByFamily.set(family, []);
        keysByFamily.get(family).push(spec);
      }

      for (const kw of keyWords) addToSetMap(keyWordIndex, kw, name);

      for (const rawVal of valuesRaw) {
        const valLower = rawVal.toLowerCase();
        const pushClosed = (form, exact) => {
          let list = closedValueIndex.get(form);
          if (!list) {
            list = [];
            closedValueIndex.set(form, list);
          }
          if (!list.some((x) => x.attr === name && x.value === rawVal && x.exact === exact)) {
            list.push({ attr: name, value: rawVal, family, exact });
          }
        };
        pushClosed(valLower, true);
        for (const alias of slotValueWords.get(means)?.get(valLower) ?? []) {
          if (alias !== valLower) pushClosed(alias, false);
        }
        const spacedVal = valLower.replace(/_/g, ' ');
        const underscoredVal = valLower.replace(/\s+/g, '_');
        if (spacedVal !== valLower) pushClosed(spacedVal, false);
        if (underscoredVal !== valLower) pushClosed(underscoredVal, false);
        const variants = new Set();
        addSpellingVariants(variants, valLower);
        if (spacedVal !== valLower) addSpellingVariants(variants, spacedVal);
        for (const v of variants) {
          if (v !== valLower && v !== spacedVal) pushClosed(v, false);
        }
        // Compositional closed-value surface forms aligned with w.lang.en cues & keys.sop
        if (name === 'chart.type' && rawVal === 'polarArea') {
          pushClosed('polar', false);
          pushClosed('polar area', false);
        }
        if (name === 'chart.markerFill' && rawVal === 'hollow') {
          for (const syn of ['see-through', 'see through', 'transparent', 'unfilled', 'empty']) pushClosed(syn, false);
        }
        if ((shortName === 'at' || name === 'chart.legend' || name === 'chart.axisSide') && ['left', 'right', 'top', 'bottom'].includes(valLower)) {
          pushClosed(`${valLower} side`, false);
          pushClosed(`the ${valLower} side`, false);
          pushClosed(`${valLower} edge`, false);
          pushClosed(`the ${valLower} edge`, false);
          if (valLower === 'bottom') pushClosed('down at the bottom', false);
          if (valLower === 'top') pushClosed('up at the top', false);
          if (valLower === 'left' || valLower === 'right') {
            pushClosed(`${valLower}-hand side`, false);
            pushClosed(`${valLower} hand side`, false);
            pushClosed(`the ${valLower}-hand side`, false);
            pushClosed(`far ${valLower}`, false);
            pushClosed(`far ${valLower} end`, false);
          }
        }
        if (name === 'node.edge' && ['left', 'right', 'top', 'bottom'].includes(valLower)) {
          pushClosed(`${valLower} line`, false);
          pushClosed(`same ${valLower} line`, false);
          pushClosed(`${valLower} edge`, false);
          pushClosed(`same ${valLower} edge`, false);
        }
        if (name === 'link.route' && valLower === 'curved') {
          for (const syn of ['curve', 'smooth curve', 'bend']) pushClosed(syn, false);
        }
        if (name === 'chart.orientation') {
          if (valLower === 'horizontal') pushClosed('horizontally', false);
          else if (valLower === 'vertical') pushClosed('vertically', false);
        }
        if (name === 'chart.horizontal' && (valLower === 'on' || valLower === 'true')) {
          pushClosed('horizontally', false);
        }
        if (name === 'node.axis') {
          if (valLower === 'vertical') {
            for (const syn of ['up and down', 'top to bottom', 'vertically']) pushClosed(syn, false);
          } else if (valLower === 'horizontal') {
            for (const syn of ['left and right', 'side to side', 'left to right', 'horizontally', 'across']) pushClosed(syn, false);
          }
        }
        if (name === 'composition.source' && valLower === 'random') {
          pushClosed('surprise me', false);
          pushClosed('surprise', false);
        }
        if (name === 'page.weather') {
          const legacyAliases = { rain: 'raining', snow: 'snowing', storm: 'thunderstorm' };
          if (legacyAliases[valLower]) pushClosed(legacyAliases[valLower], false);
        }
      }
    }

    const families = [...familySet].sort();
    for (const fam of families) {
      for (const form of pluralVariants(fam)) addToSetMap(familyWords, form, fam);
      for (const syn of EXTRA_FAMILY_SYNONYMS[fam] ?? []) {
        addToSetMap(familyWords, syn, fam);
      }
    }

    // Populate `familyWords` dynamically from ALL discovered `w.*/shards/words.sop` via `meansPrefixVotes`!
    for (const [prefix, votes] of meansPrefixVotes) {
      if (!meansToWords.has(prefix)) continue;
      // Pick the winning family for this prefix (for 3-segment prefixes it's exact; for 2-segment, highest vote).
      let bestFam = null;
      let bestCount = -1;
      for (const [fam, cnt] of votes) {
        if (cnt > bestCount) {
          bestCount = cnt;
          bestFam = fam;
        }
      }
      if (!bestFam || !familySet.has(bestFam)) continue;
      for (const word of meansToWords.get(prefix)) {
        // Never pollute an exact canonical family name (e.g. "calendar") with a different family ("meeting")
        if (familySet.has(word) && word !== bestFam) continue;
        for (const form of pluralVariants(word)) addToSetMap(familyWords, form, bestFam);
      }
    }

    // Also pull `core.word` wires whose `means` matches `w.<world>.<synonym>` for canonical domain types
    // (e.g., `w.drawing.object` -> `drawn`, `w.diagram.edge` -> `link`, `w.calendar.event` -> `meeting`,
    // `w.document.chapter` -> `section`, `w.document.paragraph` -> `block`, `w.face`/`w.person` -> `drawn`).
    for (const [m, wordSet] of meansToWords) {
      const segs = m.split('.');
      if (segs.length < 2 || segs.length > 3) continue;
      const worldSeg = segs[1];
      const typeSeg = segs[2] ?? '';
      let targetFam = null;
      if (typeSeg && familySet.has(typeSeg)) {
        // Only apply if this world relates to the tab (at least one key uses `w.<worldSeg>` or worldSeg === tab)
        if (meansPrefixVotes.has(`w.${worldSeg}`) || worldSeg === tab) targetFam = typeSeg;
      } else if (typeSeg === 'object' && familySet.has('drawn') && worldSeg === 'drawing') {
        targetFam = 'drawn';
      } else if (typeSeg === 'edge' && familySet.has('link') && worldSeg === 'diagram') {
        targetFam = 'link';
      } else if (typeSeg === 'event' && familySet.has('meeting') && (worldSeg === 'calendar' || worldSeg === 'meetings')) {
        targetFam = 'meeting';
      } else if (typeSeg === 'chapter' && familySet.has('section') && worldSeg === 'document') {
        targetFam = 'section';
      } else if (typeSeg === 'paragraph' && familySet.has('block') && worldSeg === 'document') {
        targetFam = 'block';
      } else if ((worldSeg === 'face' || worldSeg === 'person') && !typeSeg && familySet.has('drawn')) {
        targetFam = 'drawn';
      }
      if (targetFam) {
        for (const word of wordSet) {
          if (familySet.has(word) && word !== targetFam) continue;
          for (const form of pluralVariants(word)) addToSetMap(familyWords, form, targetFam);
        }
      }
    }

    // Dynamically enrich `familyWords` from `w.lang.en.lex` (e.g., `diagram.edge` -> `link`, `diagram.kind` -> `diagram`)!
    if (grammar?.lexicons) {
      if (familySet.has('link') && grammar.lexicons.has('diagram.edge')) {
        for (const w of grammar.lexicons.get('diagram.edge')) {
          for (const form of pluralVariants(w)) addToSetMap(familyWords, form, 'link');
        }
      }
      if (familySet.has('section')) {
        for (const w of ['heading', 'paragraph', 'chapter', 'subsection']) {
          for (const form of pluralVariants(w)) addToSetMap(familyWords, form, 'section');
        }
      }
      if (familySet.has('block')) {
        for (const w of ['heading', 'paragraph', 'list', 'quote', 'table']) {
          for (const form of pluralVariants(w)) addToSetMap(familyWords, form, 'block');
        }
      }
    }

    // Auto-infer defaultFamily from key density for dynamic world onboarding
    let defaultFamily = families[0] ?? 'item';
    let bestCount = -1;
    for (const [f, list] of keysByFamily) {
      if (list.length > bestCount) {
        bestCount = list.length;
        defaultFamily = f;
      }
    }

    return {
      families,
      familySet,
      defaultFamily,
      keys,
      keyList,
      attrToId,
      keysByFamily,
      keyWordIndex,
      closedValueIndex,
      familyWords,
      meansPrefixVotes,
    };
  }

  const catalog = buildCatalog(keyWires);
  const tabs = Object.fromEntries(Object.entries(rawByTab).map(([tab, wires]) => [tab, buildCatalog(wires, tab)]));
  return { tabs, catalog, discoveredWorlds, meansToWords };
}

/**
 * Dynamically load ALL `k.actions` shards (`acts.sop`, `verbs-*.sop`, `actions-*.sop`, `families.sop`)
 * plus frame-licensed verbs extracted from `w.lang.en.frame` wires (single source of truth in SOP!).
 */
function loadActions(parse, worldsDir, grammar) {
  const actionsDir = join(worldsDir, 'k.actions', 'shards');
  const acts = new Set();
  const actRoles = new Map(); // act -> Set<roleName>
  const verbs = new Map();
  const markings = new Map(); // verb -> Array<{ verb, act, marker, role }>
  const markingsByActMarker = new Map(); // `${act}|${marker}` -> Set<role>
  const actionSpecs = new Map(); // actionName -> { name, group, holds, opposite, undoneBy }
  const similarActions = []; // Array<{ name, action }>

  const addVerbEntry = (text, entry) => {
    const key = String(text || '').toLowerCase().trim();
    if (!key) return;
    if (!verbs.has(key)) verbs.set(key, []);
    const list = verbs.get(key);
    const dup = list.some(
      (e) =>
        e.act === entry.act &&
        (e.mode ?? null) === (entry.mode ?? null) &&
        (e.attribute ?? null) === (entry.attribute ?? null) &&
        (e.value ?? null) === (entry.value ?? null),
    );
    if (!dup) list.push({ ...entry, text: key });
  };

  for (const fp of listSopShards(actionsDir)) {
    const fileName = fp.split('/').pop();
    for (const w of parseShard(parse, fp)) {
      if (w.type === 'k.actions.act' && w.attrs.name?.[0]) {
        const name = one(w, 'name');
        acts.add(name);
        for (const r of many(w, 'role')) addToSetMap(actRoles, name, r);
      } else if (w.type === 'k.actions.verb' && fileName.startsWith('verbs-') && w.attrs.text?.[0] && w.attrs.act?.[0]) {
        const text = one(w, 'text').toLowerCase();
        const entry = { text, act: one(w, 'act') };
        if (w.attrs.attribute?.[0]) entry.attribute = one(w, 'attribute');
        if (w.attrs.value?.[0]) entry.value = one(w, 'value');
        if (w.attrs.separable?.[0]) entry.separable = one(w, 'separable') === 'true';
        if (w.attrs.after_particle?.[0]) entry.afterParticle = one(w, 'after_particle');
        addVerbEntry(text, entry);
      } else if (w.type === 'k.actions.marking' && w.attrs.verb?.[0]) {
        const verb = one(w, 'verb').toLowerCase();
        const act = one(w, 'act') ?? '';
        const marker = (one(w, 'marker') ?? '').toLowerCase();
        const role = one(w, 'role') ?? '';
        if (!marker || !role) continue;
        const mEntry = { verb, act, marker, role };
        if (!markings.has(verb)) markings.set(verb, []);
        markings.get(verb).push(mEntry);
        addToSetMap(markingsByActMarker, `${act}|${marker}`, role);
      } else if (w.type === 'k.actions.action' && w.attrs.name?.[0]) {
        const name = one(w, 'name').toLowerCase();
        const group = one(w, 'group') ?? '';
        const holds = one(w, 'holds') ?? '';
        actionSpecs.set(name, {
          name,
          group,
          holds,
          objects: new Set((w.attrs.object ?? []).map((value) => unquoteSop(value).toLowerCase())),
          opposite: one(w, 'opposite') ?? '',
          undoneBy: one(w, 'undone_by') ?? '',
        });
        if (holds && acts.has(holds)) {
          addVerbEntry(name, { text: name, act: holds });
        }
      } else if (w.type === 'k.actions.similar' && w.attrs.name?.[0] && w.attrs.action?.[0]) {
        similarActions.push({
          name: one(w, 'name').toLowerCase().trim(),
          action: one(w, 'action').toLowerCase().trim(),
        });
      }
    }
  }

  // Propagate `k.actions.similar` dynamically to `verbs` when target `action` is a valid request `act`
  // or already resolves to a valid request `act` (without overwriting authoritative `verbs-*.sop` entries).
  const directVerbKeys = new Set(verbs.keys());
  for (const { name, action } of similarActions) {
    if (!name || directVerbKeys.has(name) || name.split(/\s+/).length > 3) continue;
    if (acts.has(action)) {
      addVerbEntry(name, { text: name, act: action });
    } else if (verbs.has(action)) {
      for (const ent of verbs.get(action)) {
        if (acts.has(ent.act)) addVerbEntry(name, { text: name, act: ent.act });
      }
    }
  }

  for (const [text, act, mode] of FINER_ACT_MODES) {
    if (!verbs.has(text)) verbs.set(text, []);
    const list = verbs.get(text);
    if (text === 'set') {
      if (!list.some((e) => e.act === act && e.mode === mode)) {
        list.push({ text, act, mode });
      }
      continue;
    }
    const existing = list.find((e) => e.act === act && !e.mode);
    if (existing) {
      existing.mode = mode;
    } else if (!list.some((e) => e.act === act && e.mode === mode)) {
      list.push({ text, act, mode });
    }
  }

  // Dynamically ingest NEW verbs declared in `w.lang.en.frame` parts (e.g. `diagram-frames.sop`:
  // `show`, `display`, `plot`, `present`, `map out` -> `make`; `caption`, `tag` -> `change`; `orient`, `rearrange`, `set out` -> `place`)!
  // Authoritative rule: NEVER overwrite or broaden a verb already declared in `k.actions/shards/verbs-*.sop`
  // (prevents contextual frames like "delete the colour" -> change or "set up" -> make from polluting `delete`/`set`!).
  const kActionsVerbs = new Set(verbs.keys());
  const FRAME_VERB_STOP = new Set([
    'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'from', 'with', 'as', 'up', 'out', 'off',
    'it', 'them', 'this', 'that', 'these', 'those', 'all', 'both', 'some', 'any', 'no', 'not',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'can', 'could', 'would', 'should', 'will', 'may', 'might', 'must',
    'i', 'you', 'we', 'they', 'he', 'she', 'my', 'your', 'our', 'their', 'here', 'there', 'now', 'then',
    'and', 'or', 'but', 'if', 'so', 'just', 'only', 'also', 'too', 'very', 'more', 'less', 'please', 'thanks',
    'what', 'which', 'where', 'when', 'who', 'whom', 'whose', 'why', 'how', 'yes', 'no',
  ]);
  const ALLOWED_FRAME_ACTS = new Set(['make', 'change', 'place', 'remove', 'connect', 'group', 'take apart', 'pick', 'copy', 'undo', 'redo', 'save', 'load', 'send', 'deselect']);
  if (grammar?.frames) {
    for (const frame of grammar.frames.values()) {
      if (!frame.act || !ALLOWED_FRAME_ACTS.has(frame.act)) continue;
      for (const part of frame.parts) {
        if (part.is === 'lead' || part.is === 'det') continue;
        if (part.is === 'word' && !part.optional && part.words.length > 0 && part.words.length <= 20) {
          for (const rawW of part.words) {
            const w = rawW.toLowerCase().trim();
            if (!w || w.length < 3 || w.includes("'")) continue;
            if (kActionsVerbs.has(w)) continue; // keep k.actions authoritative for existing verbs!
            const toks = w.split(/\s+/);
            if (toks.length > 2) continue;
            if (FRAME_VERB_STOP.has(toks[0])) continue;
            if (toks.length === 1 && (grammar.grammarWords.has(w) || grammar.fillerWords.has(w))) continue;
            if (/^(left|right|top|bottom|front|back|side|same|other|next|last|first|new|old|big|small|more|less|half|full|each|every)$/.test(toks[0])) continue;
            const isExplicitVerbPart = Boolean(part.act) || frame.sourceShard === 'diagram-frames.sop' || frame.sourceShard === 'hand-frames.sop' || frame.sourceShard === 'capacity-frames.sop';
            if (isExplicitVerbPart) {
              addVerbEntry(w, { text: w, act: part.act || frame.act });
            }
          }
        }
        break;
      }
    }
  }

  // Minimal domain-standard verbs not yet present in verbs-*.sop (small residual delta, not a mirror of k.actions)
  const RESIDUAL_VERB_LICENSES = [
    ['book', 'make'], ['schedule', 'make'], ['plan', 'make'], ['reserve', 'make'], ['meet', 'make'],
    ['reschedule', 'place'], ['reschedule', 'change'], ['postpone', 'place'], ['delay', 'place'],
    ['cancel', 'remove'], ['bin', 'remove'], ['trash', 'remove'], ['scrap', 'remove'], ['discard', 'remove'],
    ['compose', 'make'], ['draft', 'make'], ['write', 'make'], ['author', 'make'],
    ['plot', 'make'], ['visualize', 'make'], ['visualise', 'make'], ['display', 'make'], ['show', 'make'], ['show', 'ask'],
    ['try', 'make'], ['surprise', 'make'], ['insert', 'make'], ['invite', 'change'], ['stack', 'change'],
    ['rename', 'change'], ['retitle', 'change'], ['relabel', 'change'], ['recolour', 'change'], ['recolor', 'change'],
    ['resize', 'change'], ['enlarge', 'change'], ['shrink', 'change'], ['widen', 'change'], ['narrow', 'change'],
    ['thicken', 'change'], ['shorten', 'change'], ['lengthen', 'change'],
    ['bold', 'change'], ['italic', 'change'], ['italicize', 'change'], ['italicise', 'change'],
    ['underline', 'change'], ['strikethrough', 'change'], ['highlight', 'change'],
    ['center', 'change'], ['centre', 'change'], ['justify', 'change'],
    ['give', 'change'], ['give', 'place'], ['give', 'make'],
    ['let', 'change'], ['have', 'change'], ['keep', 'change'], ['leave', 'change'],
    ['thin', 'change'], ['dim', 'change'], ['fade', 'change'], ['lighten', 'change'],
    ['brighten', 'change'], ['soften', 'change'], ['sharpen', 'change'],
    ['grab', 'pick'], ['target', 'pick'], ['focus', 'pick'],
  ];
  for (const [text, act] of RESIDUAL_VERB_LICENSES) {
    addVerbEntry(text, { text, act });
  }

  return { acts, actRoles, verbs, markings, markingsByActMarker, actionSpecs };
}

function mapDetKind(kind, definite) {
  if (kind === 'possessive') return 'possessive';
  if (kind === 'demonstrative') return 'demonstrative';
  if (kind === 'quantifier' || kind === 'numeral') return 'quantified';
  if (kind === 'article') return definite === 'yes' ? 'definite' : 'indefinite';
  return 'indefinite';
}

/**
 * Dynamically load ALL shards in `w.lang.en/shards/*.sop` (55 files, ~30 ms!)
 * plus `w.reader.en.requests/shards/*.sop` so EVERY declarative grammar/frame/lexicon/join/ellipsis
 * rule in SOP Lang is automatically available to the lattice and Z3!
 */
function loadGrammar(parse, worldsDir) {
  const enDir = join(worldsDir, 'w.lang.en', 'shards');
  const grammarWords = new Set();
  const fillerWords = new Set();
  const contractionEndings = new Set();
  const contractions = [];
  const fillerPhrases = new Set([
    ...HARD_FILLER_PHRASES,
    'that would help', 'that helps', 'i appreciate it', 'appreciate it', 'much appreciated',
    'thank you so much', 'thanks a lot', 'thanks so much', 'if possible', 'if you can', 'if you could',
    'i need you to', 'i want you to', 'as drawn so far', 'drawn so far',
    'when you get a chance', 'if you get a chance', 'this time', 'for me', 'please and thanks',
    'that works', 'no problem', 'cheers', 'all good', 'sounds good', 'looks good',
    'never mind', 'nevermind', "that's all", "that's it", 'that is it',
  ]);
  const determiners = new Map();
  const pronouns = new Map();
  const prepositions = new Map();
  const joiners = new Map();
  const whWords = new Map();
  const auxiliaries = new Set();
  const negations = new Map();
  const negativeImperative = { leads: [], skip: new Set() };
  const cues = [];
  const numbers = new Map();
  const ordinals = new Map();
  const quantifiers = new Map(Object.entries(QUANTIFIER_SPECS));
  const irregularPlurals = new Map();
  const irregularVerbs = new Map();
  const pastForms = new Set();
  const participles = new Set();
  const arrangements = new Map();
  const lexicons = new Map(); // name -> Set<string>
  const phraseGroups = new Map(); // group -> Set<string>
  const phraseItems = new Map(); // phrase name -> Set<string>
  const frames = new Map(); // name -> { name, act, mode, priority, roles, parts, fixed, sourceShard }
  const constructions = new Set();
  const roleMaps = new Map(); // `${act}.${role}` -> { act, role, actRole, marker, takes }
  const modeMaps = new Map(); // `${act}.${mode}` -> meansAct
  const ellipsis = {
    leads: new Set(),
    trails: new Set(),
    repeats: new Set(),
    starters: new Set(),
    verbVariants: new Map(),
  };
  const coordinators = new Set();
  const calcOps = [];

  const CLOSED_GRAMMAR_CLASSES = new Set([
    'determiner', 'pronoun', 'preposition', 'conjunction', 'auxiliary', 'particle', 'adverb',
  ]);
  const SKIP_FILLER_CLASSES = new Set(['politeness', 'filler', 'desire']);

  const enShardPaths = listSopShards(enDir);
  const rawParts = [];
  const rawFixed = [];
  const alternations = [];
  const questionAlternations = new Map(); // prefix -> { mood, question }
  const benefactiveVerbs = new Set();
  const frameLeads = new Set();
  const corrections = new Set();

  for (const fp of enShardPaths) {
    const fileName = fp.split('/').pop();
    for (const w of parseShard(parse, fp)) {
      const cls = one(w, 'class') ?? '';
      const texts = many(w, 'text').map((t) => t.toLowerCase());

      // Exact check.mjs LEX logic
      if (w.type === 'w.lang.en.closed' && CLOSED_GRAMMAR_CLASSES.has(cls)) {
        for (const t of texts) grammarWords.add(t);
      }
      if (w.type === 'w.lang.en.closed' && cls === 'interjection') {
        for (const t of texts) fillerWords.add(t);
      }
      if (w.type === 'w.lang.en.skip') {
        for (const t of texts) {
          if (SKIP_FILLER_CLASSES.has(cls)) {
            fillerWords.add(t);
            if (t.includes(' ')) fillerPhrases.add(t);
          } else {
            grammarWords.add(t);
          }
        }
      }
      if (w.type === 'w.lang.en.imperative.lead') {
        for (const t of texts) grammarWords.add(t);
      }
      if (w.type === 'w.lang.en.contraction' && texts[0] && w.attrs.expands?.[0]) {
        contractions.push([texts[0], one(w, 'expands').toLowerCase()]);
      }
      if (w.type === 'w.lang.en.contraction.ending' && w.attrs.ending?.[0]) {
        contractionEndings.add(one(w, 'ending').toLowerCase());
      }

      if (w.type === 'w.lang.en.phrase') {
        const grp = (one(w, 'group') ?? '').toLowerCase();
        const name = one(w, 'name');
        for (const item of many(w, 'item')) {
          const phrase = item.toLowerCase();
          if (grp) addToSetMap(phraseGroups, grp, phrase);
          if (name) addToSetMap(phraseItems, name, phrase);
          if (grp === 'politeness and fillers' && phrase.includes(' ')) {
            fillerPhrases.add(phrase);
          }
        }
      }

      if (w.type === 'w.lang.en.det') {
        const kind = one(w, 'kind');
        const det = mapDetKind(kind, one(w, 'definite'));
        const num = one(w, 'number');
        const meaning = one(w, 'meaning');
        for (const t of texts) {
          const info = { det, kind, meaning };
          if (num) info.number = num;
          determiners.set(t, info);
        }
      }

      if (w.type === 'w.lang.en.pron') {
        const kind = one(w, 'refers') ?? one(w, 'case') ?? 'pronoun';
        const num = one(w, 'number');
        for (const t of texts) {
          const info = { kind, cases: many(w, 'case'), person: one(w, 'person') };
          if (num) info.number = num;
          pronouns.set(t, info);
        }
      }

      if (w.type === 'w.lang.en.prep' || w.type === 'w.lang.en.prep.time') {
        const rel = one(w, 'rel') ?? texts[0] ?? '';
        const space = one(w, 'space');
        const layout = one(w, 'layout');
        const role = one(w, 'order') ?? one(w, 'role');
        const isTime = w.type === 'w.lang.en.prep.time' || many(w, 'in').includes('time');
        for (const t of texts) {
          // Bare "next" is an ordinal/sequence marker ("next week", "next snap..."), never spatial `near` (only "next to" is spatial!)
          if (t === 'next') continue;
          const prev = prepositions.get(t) ?? {};
          const info = { ...prev };
          // Prefer hand-joins explicit rel/layout/role over bare fallback
          if (rel && (!info.rel || fileName === 'hand-joins.sop')) info.rel = rel;
          if (space) info.space = space;
          if (layout) info.layout = layout;
          if (role) info.role = role;
          if (isTime) info.isTime = true;
          prepositions.set(t, info);
        }
      }

      if (w.type === 'w.lang.en.frame_lead') {
        for (const t of texts) {
          if (t === 'for now') fillerPhrases.add(t);
          else frameLeads.add(t);
        }
      }
      if (w.type === 'w.lang.en.correction') {
        for (const t of texts) {
          if (t.includes(' ')) corrections.add(t);
        }
      }

      if (w.type === 'w.lang.en.joiner') {
        const kind = one(w, 'kind') ?? '';
        const cut = one(w, 'cut') ?? 'no';
        for (const t of texts) joiners.set(t, { kind, cut });
      }

      if (w.type === 'w.lang.en.wh') {
        const asks = one(w, 'asks') ?? '';
        for (const t of texts) whWords.set(t, { asks });
      }

      if (w.type === 'w.lang.en.aux') {
        for (const t of texts) auxiliaries.add(t);
      }

      if (w.type === 'w.lang.en.neg') {
        for (const t of texts) negations.set(t, { want: 'no' });
      } else if (w.type === 'w.lang.en.neg.imperative') {
        negativeImperative.leads.push(...texts.map((text) => text.split(/\s+/)));
      } else if (w.type === 'w.lang.en.neg.imperative.skip') {
        for (const t of texts) negativeImperative.skip.add(t);
      }

      if (w.type === 'w.lang.en.arrangement' && texts[0]) {
        const entry = {
          layout: one(w, 'layout') ?? null,
          diagramLayout: one(w, 'diagram_layout') ?? null,
          direction: one(w, 'direction') ?? null,
          relation: one(w, 'relation') ?? null,
        };
        for (const t of texts) arrangements.set(t, entry);
      }

      if (w.type === 'w.lang.en.cue') {
        cues.push({
          name: one(w, 'name') ?? '',
          on: one(w, 'on') ?? '',
          want: one(w, 'want'),
          attribute: one(w, 'attribute'),
          value: one(w, 'value'),
          relation: one(w, 'relation'),
          step: one(w, 'step'),
          lead: many(w, 'lead').map((x) => x.toLowerCase()),
          takes: one(w, 'takes'),
          priority: w.attrs.priority?.[0] ? Number(one(w, 'priority')) : undefined,
        });
      }

      if (w.type === 'w.lang.en.lex' && w.attrs.name?.[0]) {
        const lexName = one(w, 'name');
        for (const item of many(w, 'item')) {
          const low = item.toLowerCase();
          addToSetMap(lexicons, lexName, low);
          if (lexName === 'lang.ordinal' && !ordinals.has(low)) {
            ordinals.set(low, low.replace(/[\s-]+/g, '_'));
          }
        }
      }

      if (w.type === 'w.lang.en.frame' && w.attrs.name?.[0]) {
        const fname = one(w, 'name');
        frames.set(fname, {
          name: fname,
          act: one(w, 'act') ?? '',
          mode: one(w, 'mode') ?? '',
          set: one(w, 'set') ?? '',
          priority: Number(one(w, 'priority') ?? 0),
          needs: one(w, 'needs'),
          roles: many(w, 'role'),
          parts: [],
          fixed: new Map(),
          sourceShard: fileName,
        });
      } else if (w.type === 'w.lang.en.part' && w.attrs.frame?.[0]) {
        rawParts.push({
          frame: one(w, 'frame'),
          at: Number(one(w, 'at') ?? 0),
          is: one(w, 'is') ?? '',
          words: many(w, 'word').map((x) => x.toLowerCase()),
          act: one(w, 'act') ?? '',
          role: one(w, 'role') ?? '',
          takes: one(w, 'takes') ?? '',
          lexicon: one(w, 'lexicon') ?? '',
          optional: one(w, 'optional') === 'yes',
          maxWords: w.attrs.max_words?.[0] ? Number(one(w, 'max_words')) : null,
        });
      } else if (w.type === 'w.lang.en.fixed' && w.attrs.frame?.[0]) {
        rawFixed.push({
          frame: one(w, 'frame'),
          role: one(w, 'role') ?? '',
          value: one(w, 'value') ?? '',
        });
      } else if (w.type === 'w.lang.en.role_map' && w.attrs.act?.[0] && w.attrs.role?.[0]) {
        const act = one(w, 'act');
        const role = one(w, 'role');
        roleMaps.set(`${act}.${role}`, {
          act,
          role,
          actRole: one(w, 'act_role') ?? '',
          marker: one(w, 'marker') === 'yes',
          takes: one(w, 'takes') ?? '',
        });
      } else if (w.type === 'w.lang.en.mode_map' && w.attrs.act?.[0] && w.attrs.mode?.[0]) {
        modeMaps.set(`${one(w, 'act')}.${one(w, 'mode')}`, one(w, 'means') ?? '');
      } else if (w.type === 'w.lang.en.alternation' && w.attrs.from?.[0] && w.attrs.to?.[0]) {
        const fromPat = one(w, 'from').toLowerCase().trim();
        const toPat = one(w, 'to').toLowerCase().trim();
        const family = one(w, 'family') ?? '';
        const mode = one(w, 'mode') ?? '';
        const ord = Number(one(w, 'n') ?? 999);
        alternations.push({ name: one(w, 'name') ?? '', n: ord, family, mode, from: fromPat, to: toPat });

        // 1) Request wrappers: from="<prefix> {x}" -> to="{x}" or from="{x} <suffix>" -> to="{x}"
        if (toPat === '{x}' && (mode === 'request' || ['polite word', 'ability question', 'desire', 'suggestion'].includes(family))) {
          if (fromPat.endsWith(' {x}')) {
            const pref = fromPat.slice(0, -4).trim();
            if (pref && pref.split(/\s+/).length >= 2) fillerPhrases.add(pref);
          } else if (fromPat.startsWith('{x} ')) {
            const suf = fromPat.slice(4).trim();
            if (suf && suf.split(/\s+/).length >= 2) fillerPhrases.add(suf);
          }
        }
        // 2) Indirect question alternations: from="tell me where {x}" -> to="where {x}" / "is {x} {y}"
        if (mode === 'question' && family === 'question vs command') {
          const mWh = fromPat.match(/^(.+?)\s+\{x\}$/);
          const toWh = toPat.match(/^(what|where|who|which|how|when|whose)\s+\{x\}$/);
          if (mWh && toWh) {
            const qWord = toWh[1] === 'whose' ? 'who' : toWh[1];
            questionAlternations.set(mWh[1].trim(), { mood: 'ask', question: qWord });
          } else {
            const mIf = fromPat.match(/^(.+?\s+(?:if|whether))\s+\{x\}\s+(?:is|are)\s+\{y\}$/);
            if (mIf) {
              questionAlternations.set(mIf[1].trim(), { mood: 'check', question: 'exists' });
            }
          }
        }
        // 3) Dative / benefactive shift ("draw me {y}" -> "draw {y} for me", "give me {y}" -> "give {y} to me")
        if (family === 'dative shift') {
          const mDat = fromPat.match(/^([a-z]+)\s+(?:me|us|them)\s+\{y\}$/);
          if (mDat) benefactiveVerbs.add(mDat[1]);
        }
      }

      if (w.type === 'w.lang.en.ellipsis.lead') {
        for (const t of texts) ellipsis.leads.add(t);
      } else if (w.type === 'w.lang.en.ellipsis.trail') {
        for (const t of texts) ellipsis.trails.add(t);
      } else if (w.type === 'w.lang.en.ellipsis.repeat') {
        for (const t of texts) ellipsis.repeats.add(t);
      } else if (w.type === 'w.lang.en.ellipsis.starter') {
        for (const t of texts) ellipsis.starters.add(t);
      } else if (w.type === 'w.lang.en.variant' && one(w, 'alternation') === 'verb ellipsis') {
        const frame = one(w, 'frame');
        for (const canonical of many(w, 'canonical')) addToSetMap(ellipsis.verbVariants, frame, canonical);
      } else if (w.type === 'w.lang.en.coord.sep' && many(w, 'in').includes('things')) {
        for (const text of texts) coordinators.add(text);
      } else if (w.type === 'w.lang.en.construction') {
        const name = one(w, 'name');
        if (name) constructions.add(name);
      }

      if (w.type === 'w.lang.en.calc' && texts[0]) {
        calcOps.push({
          text: texts[0],
          kind: one(w, 'kind') ?? '',
          form: one(w, 'form') ?? '',
          calc: one(w, 'calc') ?? '',
          markers: many(w, 'marker').map((m) => m.toLowerCase()),
        });
      }

      if (w.type === 'w.lang.en.numeral' && w.attrs.value?.[0]) {
        const val = Number(one(w, 'value'));
        if (!Number.isNaN(val)) {
          for (const t of texts) numbers.set(t, { value: val, ordinal: false });
        }
      }

      if (w.type === 'w.lang.en.ordinal' && w.attrs.value?.[0]) {
        const val = Number(one(w, 'value'));
        for (const t of texts) {
          if (!Number.isNaN(val)) numbers.set(t, { value: val, ordinal: true });
          if (!ordinals.has(t)) ordinals.set(t, t);
        }
      }

      if (w.type === 'w.lang.en.number' && w.attrs.value?.[0]) {
        const kind = one(w, 'kind');
        const val = Number(one(w, 'value'));
        if (!Number.isNaN(val) && (kind === 'cardinal' || kind === 'ordinal')) {
          const isOrd = kind === 'ordinal';
          for (const t of texts) {
            if (!numbers.has(t)) numbers.set(t, { value: val, ordinal: isOrd });
            if (isOrd && !ordinals.has(t)) ordinals.set(t, t);
          }
        }
      }

      if (w.type === 'w.lang.en.irregular' && w.attrs.singular?.[0] && w.attrs.plural?.[0]) {
        const sg = one(w, 'singular').toLowerCase();
        for (const pl of many(w, 'plural')) {
          const pLow = pl.toLowerCase();
          if (!irregularPlurals.has(pLow)) irregularPlurals.set(pLow, sg);
        }
      }

      if (w.type === 'w.lang.en.irregular_form' && w.attrs.lemma?.[0] && w.attrs.form?.[0]) {
        const lemma = one(w, 'lemma').toLowerCase();
        const form = one(w, 'form').toLowerCase();
        if (w.attrs.vform) {
          if (!irregularVerbs.has(form)) irregularVerbs.set(form, lemma);
          const formKind = one(w, 'vform');
          if (formKind === 'past') pastForms.add(form);
          if (formKind === 'past_participle') participles.add(form);
        } else if (one(w, 'num') === 'pl') {
          if (!irregularPlurals.has(form)) irregularPlurals.set(form, lemma);
        }
      }
    }
  }

  // Attach parts and fixed values to their frames
  for (const p of rawParts) {
    const fr = frames.get(p.frame);
    if (fr) fr.parts.push(p);
  }
  for (const fr of frames.values()) {
    fr.parts.sort((a, b) => a.at - b.at);
  }
  for (const fx of rawFixed) {
    const fr = frames.get(fx.frame);
    if (fr && fx.role) fr.fixed.set(fx.role, fx.value);
  }

  // Enrich spatial/temporal prepositions from `w.reader.en.requests/shards/*.sop` dynamically!
  const readerReqDir = join(worldsDir, 'w.reader.en.requests', 'shards');
  for (const fp of listSopShards(readerReqDir)) {
    for (const w of parseShard(parse, fp)) {
      if (w.type === 'w.reader.en.requests.relation' && w.attrs.value?.[0] && w.attrs.source_id?.[0]) {
        const val = one(w, 'value');
        const srcId = one(w, 'source_id');
        // Extract phrase tail from id like `w.lang.en.prep.join.next_to` or `w.lang.en.prep.to_the_left_of`
        const m = srcId.match(/\.prep(?:\.join)?\.([a-z_]+?)(?:\.word)?$/);
        if (m) {
          const phrase = m[1].replace(/_/g, ' ');
          const prev = prepositions.get(phrase) ?? {};
          // Keep `next_to` canonical for `next to` / `beside` if already distinguished, else adopt SOP value
          if (!prev.rel) prepositions.set(phrase, { ...prev, rel: val, space: prev.space ?? 'static' });
        }
      }
    }
  }

  // Add standard positional/numeric ordinals if not already declared in SOP
  const EXTRA_ORDINALS = {
    '1st': 'first', '2nd': 'second', '3rd': 'third', '4th': 'fourth', '5th': 'fifth',
    '6th': 'sixth', '7th': 'seventh', '8th': 'eighth', '9th': 'ninth', '10th': 'tenth',
    final: 'last', 'second last': 'second_last', 'second-last': 'second_last',
    'second to last': 'second_last', 'next to last': 'second_last', penultimate: 'second_last',
    newest: 'newest', latest: 'newest', 'most recent': 'newest', oldest: 'oldest', earliest: 'oldest',
    leftmost: 'leftmost', rightmost: 'rightmost', topmost: 'topmost', bottommost: 'bottommost',
  };
  for (const [k, v] of Object.entries(EXTRA_ORDINALS)) {
    if (!ordinals.has(k)) ordinals.set(k, v);
  }

  for (const [t, e] of contractions) {
    if (e.split(/\s+/).every((x) => grammarWords.has(x))) grammarWords.add(t);
  }

  for (const negPhrase of phraseGroups.get('negation') ?? []) {
    if (/^not (all|only|every|just)/.test(negPhrase)) negations.set(negPhrase, { want: 'not_all' });
    else if (!negations.has(negPhrase)) negations.set(negPhrase, { want: 'no' });
  }
  negations.set('not all', { want: 'not_all' });
  negations.set('not only', { want: 'not_all' });
  negations.set('not every', { want: 'not_all' });

  return {
    grammarWords,
    fillerWords,
    contractionEndings,
    contractions,
    fillerPhrases,
    determiners,
    pronouns,
    prepositions,
    joiners,
    whWords,
    auxiliaries,
    negations,
    negativeImperative,
    cues,
    numbers,
    ordinals,
    quantifiers,
    irregularPlurals,
    irregularVerbs,
    pastForms,
    participles,
    arrangements,
    lexicons,
    phraseGroups,
    phraseItems,
    frames,
    constructions,
    roleMaps,
    modeMaps,
    ellipsis,
    coordinators,
    calcOps,
    alternations: alternations.sort((a, b) => a.n - b.n),
    questionAlternations,
    benefactiveVerbs,
    frameLeads,
    corrections,
    enShardsLoaded: enShardPaths.length,
  };
}

function loadSimpleNameMap(parse, filePaths, wireType, map) {
  for (const p of filePaths) {
    for (const w of parseShard(parse, p)) {
      if (w.type === wireType && w.attrs.name?.[0]) {
        const canon = one(w, 'name');
        map.set(canon.toLowerCase(), canon);
      } else if (w.type === 'core.word' && w.attrs.means?.[0] && w.attrs.of?.[0] === `${wireType}.name`) {
        const canon = one(w, 'means');
        for (const t of many(w, 'text')) {
          const low = t.toLowerCase();
          if (!map.has(low)) map.set(low, canon);
        }
      }
    }
  }
}

/**
 * Dynamically load ALL lightweight `k.*` semantic domain worlds (scanning shard directories dynamically
 * instead of hardcoding shard filenames) plus `vocab-kinds.json` for fast access to massive catalogs.
 */
function loadDomain(parse, worldsDir, vocabKinds, grammar, catalog) {
  const colours = new Map();
  const shades = new Set();
  const shapes = new Map();
  const scales = new Map();
  const comparatives = new Map();
  const directions = new Map();
  const positions = new Map();
  const objects = new Map();
  const bodyParts = new Map();
  const partNames = new Set();
  const wearables = new Map();
  const feelings = new Map();
  const scenes = new Map();
  const layouts = new Map();
  const styles = new Map();
  const diagrams = new Map();
  const charts = new Map();
  const genres = new Map();
  const units = new Map();
  const givenNames = new Set();
  const fills = new Map();
  const poses = new Map();
  const traits = new Map();
  const expressions = new Map();
  const standIns = new Map(); // standInNoun -> canonicalDrawingNoun
  const valueEquivGroups = []; // Array<string[]> from k.values core.word wires

  // Dynamic directory-based loading for all lightweight `k.*` worlds
  loadSimpleNameMap(parse, listSopShards(join(worldsDir, 'k.colours', 'shards')), 'k.colours.colour', colours);
  // Also load face/hair/eye/skin colours from `k.faces/shards/colours.sop` (hazel, amber, auburn, blond, pale, tan, olive, etc.)!
  loadSimpleNameMap(parse, [join(worldsDir, 'k.faces', 'shards', 'colours.sop')], 'k.faces.colour', colours);
  if (colours.has('blond') && !colours.has('blonde')) colours.set('blonde', colours.get('blond'));
  for (const [k, v] of [...colours.entries()]) {
    if (k.includes('grey')) colours.set(k.replace(/grey/g, 'gray'), v);
    if (k.includes('gray')) colours.set(k.replace(/gray/g, 'grey'), v);
  }
  colours.set('grey', colours.get('grey') ?? 'grey');
  colours.set('gray', colours.get('gray') ?? 'gray');

  // k.values: shades, scales, comparatives, directions, positions, fills, replies — scan ALL shards in k.values dynamically!
  for (const fp of listSopShards(join(worldsDir, 'k.values', 'shards'))) {
    for (const w of parseShard(parse, fp)) {
      if (w.type === 'core.word' && w.attrs.means?.[0]) {
        const mean = one(w, 'means').toLowerCase();
        const syns = many(w, 'text').map((t) => t.toLowerCase());
        if (syns.length > 0) valueEquivGroups.push([mean, ...syns]);
      }
      if (w.type === 'k.values.fill' && w.attrs.name?.[0]) {
        const fn = one(w, 'name');
        fills.set(fn.toLowerCase(), fn);
      } else if (w.type === 'core.word' && one(w, 'of') === 'k.values.fill.name' && w.attrs.means?.[0]) {
        const fn = one(w, 'means');
        for (const t of many(w, 'text')) fills.set(t.toLowerCase(), fn);
      } else if (w.type === 'core.word' && one(w, 'of') === 'k.values.reply.name') {
        for (const t of many(w, 'text')) {
          const tl = t.toLowerCase();
          if (tl.includes(' ') && tl.split(/\s+/).length <= 4) grammar.fillerPhrases.add(tl);
        }
      }
      if (w.type === 'k.values.shade' && w.attrs.name?.[0]) {
        shades.add(one(w, 'name').toLowerCase());
      } else if (w.type === 'core.word' && one(w, 'of') === 'k.values.shade.name') {
        for (const t of many(w, 'text')) shades.add(t.toLowerCase());
      } else if (w.type === 'k.values.step' && w.attrs.name?.[0]) {
        const step = one(w, 'name');
        scales.set(step.toLowerCase(), {
          scale: one(w, 'scale') ?? '',
          step,
          rank: Number(one(w, 'rank') ?? 0),
        });
      } else if (w.type === 'core.word' && one(w, 'of') === 'k.values.step.name') {
        const targetStep = one(w, 'means')?.toLowerCase();
        const entry = targetStep ? scales.get(targetStep) : undefined;
        if (entry) {
          for (const t of many(w, 'text')) {
            if (!scales.has(t.toLowerCase())) scales.set(t.toLowerCase(), entry);
          }
        }
      } else if (w.type === 'k.values.comparative' && w.attrs.text?.[0]) {
        const entry = {
          scale: one(w, 'scale') ?? '',
          way: one(w, 'way') ?? '',
          degree: one(w, 'degree') ?? 'comparative',
        };
        for (const t of many(w, 'text')) comparatives.set(t.toLowerCase(), entry);
      } else if (w.type === 'k.values.direction' && w.attrs.name?.[0]) {
        const canon = one(w, 'name');
        directions.set(canon.toLowerCase(), canon);
      } else if (w.type === 'core.word' && one(w, 'of') === 'k.values.direction.name') {
        const canon = one(w, 'means');
        for (const t of many(w, 'text')) {
          if (!directions.has(t.toLowerCase())) directions.set(t.toLowerCase(), canon);
        }
      } else if (w.type === 'k.values.position' && w.attrs.name?.[0]) {
        const canon = one(w, 'name').replace(/\s+/g, '_');
        positions.set(one(w, 'name').toLowerCase(), canon);
        positions.set(canon.toLowerCase(), canon);
      } else if (w.type === 'core.word' && one(w, 'of') === 'k.values.position.name') {
        const canon = one(w, 'means').replace(/\s+/g, '_');
        for (const t of many(w, 'text')) {
          if (!positions.has(t.toLowerCase())) positions.set(t.toLowerCase(), canon);
        }
      }
    }
  }
  for (const cue of grammar.cues) {
    if (cue.on === 'place' && cue.value) {
      for (const l of cue.lead) {
        if (!positions.has(l)) positions.set(l, cue.value);
      }
    }
  }

  loadSimpleNameMap(parse, listSopShards(join(worldsDir, 'k.shapes', 'shards')), 'k.shapes.shape', shapes);
  loadSimpleNameMap(parse, listSopShards(join(worldsDir, 'k.body', 'shards')), 'k.body.part', bodyParts);
  for (const w of parseShard(parse, join(worldsDir, 'k.faces', 'shards', 'slots.sop'))) {
    if (w.type === 'k.faces.slot' && w.attrs.name?.[0]) {
      const n = one(w, 'name');
      bodyParts.set(n.toLowerCase(), n);
      bodyParts.set(n.toLowerCase().replace(/_/g, ' '), n);
    }
  }
  for (const w of parseShard(parse, join(worldsDir, 'k.faces', 'shards', 'words.sop'))) {
    if (w.type === 'core.word' && one(w, 'of') === 'k.faces.slot.name' && w.attrs.means?.[0]) {
      const mean = one(w, 'means');
      for (const t of many(w, 'text')) {
        if (!bodyParts.has(t.toLowerCase())) bodyParts.set(t.toLowerCase(), mean);
      }
    }
  }
  // Dynamically load figure poses (`k.faces/shards/figure-poses.sop`) and traits/expressions (`k.faces/shards/traits.sop`)!
  for (const w of parseShard(parse, join(worldsDir, 'k.faces', 'shards', 'figure-poses.sop'))) {
    if (w.type === 'k.faces.pose' && w.attrs.name?.[0]) {
      const p = one(w, 'name');
      poses.set(p.toLowerCase(), p);
    } else if (w.type === 'core.word' && one(w, 'of') === 'k.faces.pose.name' && w.attrs.means?.[0]) {
      const p = one(w, 'means');
      for (const t of many(w, 'text')) {
        const tl = t.toLowerCase();
        // Avoid bare noun "seat"/"point"/"hold" colliding with poses unless participial or multi-word!
        if (!['seat', 'point', 'points', 'hold', 'holds', 'stand', 'stands'].includes(tl)) {
          poses.set(tl, p);
        }
      }
    }
  }
  poses.set('lying down', 'lying down');
  poses.set('lying', 'lying down');
  for (const w of parseShard(parse, join(worldsDir, 'k.faces', 'shards', 'traits.sop'))) {
    if (w.type === 'k.faces.trait' && w.attrs.name?.[0]) {
      const tr = one(w, 'name');
      traits.set(tr.toLowerCase(), tr);
    } else if (w.type === 'core.word' && one(w, 'of') === 'k.faces.trait.name' && w.attrs.means?.[0]) {
      const tr = one(w, 'means');
      for (const t of many(w, 'text')) {
        const tl = t.toLowerCase();
        if (!['glasses', 'beard', 'moustache', 'mustache', 'pale', 'tan', 'blond', 'blonde', 'ginger'].includes(tl)) {
          traits.set(tl, tr);
        }
      }
    } else if (w.type === 'core.word' && one(w, 'of') === 'k.faces.expression.name' && w.attrs.means?.[0]) {
      const ex = one(w, 'means');
      for (const t of many(w, 'text')) {
        expressions.set(t.toLowerCase(), ex);
      }
    }
  }
  loadSimpleNameMap(parse, listSopShards(join(worldsDir, 'k.wearables', 'shards')), 'k.wearables.wearable', wearables);
  loadSimpleNameMap(parse, listSopShards(join(worldsDir, 'k.feelings', 'shards')), 'k.feelings.feeling', feelings);
  // Spatial/directional particle "down" ("lying down", "move down", "up and down") is never a standalone face expression!
  feelings.delete('down');
  loadSimpleNameMap(
    parse,
    listSopShards(join(worldsDir, 'k.layouts', 'shards')).filter((p) => !p.includes('outlines-') && !p.includes('anchors-')),
    'k.layouts.layout',
    layouts,
  );

  // k.styles (all shards)
  for (const fp of listSopShards(join(worldsDir, 'k.styles', 'shards'))) {
    for (const w of parseShard(parse, fp)) {
      if (w.type.startsWith('k.styles.') && w.attrs.name?.[0]) {
        const kind = w.type.slice('k.styles.'.length);
        const name = one(w, 'name');
        styles.set(name.toLowerCase(), { kind, name });
      } else if (w.type === 'core.word' && w.attrs.means?.[0] && w.attrs.of?.[0]?.startsWith('k.styles.')) {
        const kind = one(w, 'of').split('.')[2] ?? 'style';
        const name = one(w, 'means');
        for (const t of many(w, 'text')) {
          if (!styles.has(t.toLowerCase())) styles.set(t.toLowerCase(), { kind, name });
        }
      }
    }
  }

  // k.diagrams (core shards + `w.lang.en.lex` `diagram.kind`!)
  for (const fp of listSopShards(join(worldsDir, 'k.diagrams', 'shards')).filter((p) => !p.includes('topics-'))) {
    for (const w of parseShard(parse, fp)) {
      if (w.type === 'k.diagrams.kind' && w.attrs.name?.[0]) {
        const name = one(w, 'name');
        const form = one(w, 'form') ?? name;
        diagrams.set(name.toLowerCase(), form);
        diagrams.set(form.toLowerCase(), form);
      } else if (w.type === 'core.word' && (one(w, 'of') === 'k.diagrams.kind.name' || one(w, 'means') === 'k.diagrams.kind')) {
        const mean = one(w, 'means');
        const canon = mean === 'k.diagrams.kind' ? null : mean;
        for (const t of many(w, 'text')) {
          const low = t.toLowerCase();
          if (!diagrams.has(low)) diagrams.set(low, canon ?? low.replace(/[\s-]+/g, '_'));
        }
      }
    }
  }
  // Enrich diagrams dynamically from `w.lang.en.lex` `diagram.kind` (48 phrases from diagram-frames.sop!)
  for (const phrase of grammar.lexicons?.get('diagram.kind') ?? []) {
    if (!diagrams.has(phrase)) {
      // Infer canonical kind matching existing keys (flowchart, mind_map, org_chart, tree, network, timeline, venn, state_machine)
      let canon = phrase.replace(/[\s-]+/g, '_');
      if (/flow|process|pipeline|stage/.test(phrase)) canon = 'flowchart';
      else if (/mind|concept|idea|spider/.test(phrase)) canon = 'mind_map';
      else if (/org|organi[sz]|hierarchy/.test(phrase)) canon = 'org_chart';
      else if (/time\s*line/.test(phrase)) canon = 'timeline';
      else if (/venn|set diagram/.test(phrase)) canon = 'venn';
      else if (/tree/.test(phrase)) canon = 'tree';
      else if (/network|node/.test(phrase)) canon = 'network';
      diagrams.set(phrase, canon);
    }
  }

  // k.charts (all shards + chart.type closed values from keys.sop!)
  for (const fp of listSopShards(join(worldsDir, 'k.charts', 'shards'))) {
    for (const w of parseShard(parse, fp)) {
      if (w.type === 'k.charts.kind' && w.attrs.name?.[0]) {
        const name = one(w, 'name');
        const form = one(w, 'form') ?? name;
        charts.set(name.toLowerCase(), form);
        charts.set(form.toLowerCase(), form);
      } else if (w.type === 'core.word' && one(w, 'of') === 'k.charts.kind.name') {
        const mean = one(w, 'means');
        for (const t of many(w, 'text')) {
          if (!charts.has(t.toLowerCase())) charts.set(t.toLowerCase(), mean);
        }
      }
    }
  }
  const chartTypeKey = catalog.keys.get('chart.type');
  if (chartTypeKey?.valuesRaw) {
    for (const v of chartTypeKey.valuesRaw) {
      charts.set(v.toLowerCase(), v);
      charts.set(`${v.toLowerCase()} chart`, v);
      charts.set(`${v.toLowerCase()} graph`, v);
      charts.set(`${v.toLowerCase()} plot`, v);
    }
  }

  // k.genres (all shards + text.genre closed values from keys.sop!)
  for (const fp of listSopShards(join(worldsDir, 'k.genres', 'shards'))) {
    for (const w of parseShard(parse, fp)) {
      if (w.type === 'k.genres.genre' && w.attrs.name?.[0]) {
        const name = one(w, 'name');
        genres.set(name.toLowerCase(), name);
      } else if (w.type === 'k.genres.move' && w.attrs.name?.[0]) {
        const name = one(w, 'name');
        if (!genres.has(name.toLowerCase())) genres.set(name.toLowerCase(), name);
      } else if (w.type === 'core.word' && one(w, 'of') === 'k.genres.genre.name') {
        const canon = one(w, 'means');
        for (const t of many(w, 'text')) {
          if (!genres.has(t.toLowerCase())) genres.set(t.toLowerCase(), canon);
        }
      }
    }
  }
  const genreKey = catalog.keys.get('text.genre');
  if (genreKey?.valuesRaw) {
    for (const v of genreKey.valuesRaw) {
      if (!genres.has(v.toLowerCase())) genres.set(v.toLowerCase(), v);
    }
  }

  // k.units (all non-currency shards dynamically!)
  for (const fp of listSopShards(join(worldsDir, 'k.units', 'shards')).filter((p) => !p.includes('currenc'))) {
    for (const w of parseShard(parse, fp)) {
      if (w.type === 'k.units.unit' && w.attrs.name?.[0]) {
        const name = one(w, 'name');
        const quantity = one(w, 'quantity') ?? '';
        const entry = { name, quantity };
        for (const form of pluralVariants(name)) units.set(form, entry);
        if (w.attrs.symbol?.[0]) {
          const sym = one(w, 'symbol').toLowerCase();
          if (!units.has(sym)) units.set(sym, entry);
        }
      } else if (w.type === 'core.word' && one(w, 'of') === 'k.units.unit.name') {
        const canon = one(w, 'means');
        const existing = units.get(canon?.toLowerCase());
        const entry = existing ?? { name: canon, quantity: '' };
        for (const t of many(w, 'text')) {
          for (const form of pluralVariants(t)) {
            if (!units.has(form)) units.set(form, entry);
          }
        }
      }
    }
  }

  // k.time (all calendar/clock shards dynamically!)
  const months = new Map();
  const weekdays = new Map();
  const partsOfDay = new Map();
  const relativeDays = new Map([
    ['today', 'today'], ['tomorrow', 'tomorrow'], ['yesterday', 'yesterday'], ['tonight', 'tonight'],
    ['this week', 'this_week'], ['next week', 'next_week'], ['last week', 'last_week'],
    ['this month', 'this_month'], ['next month', 'next_month'], ['last month', 'last_month'],
  ]);
  for (const fp of listSopShards(join(worldsDir, 'k.time', 'shards')).filter((p) => !p.includes('cycles-'))) {
    for (const w of parseShard(parse, fp)) {
      if (w.type === 'k.time.month' && w.attrs.name?.[0]) {
        const n = one(w, 'name');
        months.set(n.toLowerCase(), n);
      } else if (w.type === 'k.time.weekday' && w.attrs.name?.[0]) {
        const n = one(w, 'name');
        weekdays.set(n.toLowerCase(), n);
      } else if ((w.type === 'k.time.part_of_day' || w.type === 'k.time.span' || w.type === 'k.time.hour') && w.attrs.name?.[0]) {
        const n = one(w, 'name');
        if (w.type !== 'k.time.span' || w.attrs.within) partsOfDay.set(n.toLowerCase(), n);
      } else if (w.type === 'core.word' && w.attrs.means?.[0]) {
        const ofType = one(w, 'of');
        const mean = one(w, 'means');
        if (ofType === 'k.time.month.name') {
          for (const t of many(w, 'text')) months.set(t.toLowerCase(), mean);
        } else if (ofType === 'k.time.weekday.name') {
          for (const t of many(w, 'text')) weekdays.set(t.toLowerCase(), mean);
        } else if (ofType === 'k.time.part_of_day.name' || ofType === 'k.time.span.name' || ofType === 'k.time.hour.name') {
          for (const t of many(w, 'text')) partsOfDay.set(t.toLowerCase(), mean);
        }
      }
    }
  }

  // Fast vocab-kinds.json extraction (covers massive k.objects / k.animals / k.people / k.scenes catalogs in ~80 ms)
  const OBJECT_KINDS = [
    'k.objects.object', 'k.animals.animal', 'k.people.kind',
    'k.people.role', 'k.scenes.thing', 'k.wearables.wearable', 'k.shapes.shape',
  ];
  for (const [word, kinds] of Object.entries(vocabKinds)) {
    const low = word.toLowerCase();
    for (const ok of OBJECT_KINDS) {
      if (kinds[ok]) {
        if (!objects.has(low)) objects.set(low, low);
        break;
      }
    }
    if (kinds['k.body.part'] || kinds['k.wearables.wearable']) {
      if (!bodyParts.has(low)) bodyParts.set(low, low);
    }
    if (kinds['k.parts.name']) partNames.add(low);
    if (kinds['k.scenes.scene']) {
      if (!scenes.has(low)) scenes.set(low, low);
    }
    if (kinds['k.shapes.shape']) {
      if (!shapes.has(low)) shapes.set(low, low);
    }
    if (kinds['k.colours.colour']) {
      if (!colours.has(low)) colours.set(low, low);
    }
    if (kinds['k.people.given_name']) {
      givenNames.add(low);
    }
  }

  for (const w of parseShard(parse, join(worldsDir, 'k.objects', 'shards', 'words.sop'))) {
    if (w.type === 'core.word' && one(w, 'of') === 'k.objects.object.name' && w.attrs.means?.[0]) {
      const mean = one(w, 'means').toLowerCase();
      for (const t of many(w, 'text')) {
        if (!objects.has(t.toLowerCase())) objects.set(t.toLowerCase(), mean);
      }
    }
  }
  // Dynamically load `k.objects.stand_in` shards (e.g. dinghy -> boat, campfire -> bonfire, pirate ship -> ship)
  for (const fp of listSopShards(join(worldsDir, 'k.objects', 'shards')).filter((p) => p.includes('stand-in'))) {
    for (const w of parseShard(parse, fp)) {
      if (w.type === 'k.objects.stand_in' && w.attrs.name?.[0] && w.attrs.drawing?.[0]) {
        const nm = one(w, 'name').toLowerCase();
        const dr = one(w, 'drawing').toLowerCase();
        standIns.set(nm, dr);
        if (!objects.has(nm)) objects.set(nm, nm);
      }
    }
  }

  return {
    colours,
    shades,
    shapes,
    scales,
    comparatives,
    directions,
    positions,
    fills,
    poses,
    traits,
    expressions,
    standIns,
    valueEquivGroups,
    objects,
    bodyParts,
    partNames,
    wearables,
    feelings,
    scenes,
    layouts,
    styles,
    diagrams,
    charts,
    genres,
    units,
    time: { months, weekdays, partsOfDay, relativeDays },
    givenNames,
  };
}

/**
 * Dynamically load ALL knowledge from sop-knowledge-worlds (Single Source of Truth).
 *
 * @param {object} [options]
 * @param {string} [options.knowledgeDir]
 * @returns {Promise<object>}
 */
export async function loadKnowledge({ knowledgeDir, worldPaths = [], includeLegacy = true } = {}) {
  const t0 = performance.now();
  if (typeof knowledgeDir !== 'string' || !knowledgeDir.trim()) {
    throw new TypeError('Z3 requires knowledgeDir to point to a sop-knowledge-worlds checkout.');
  }
  const kDir = resolve(knowledgeDir);
  const sopworldPath = join(kDir, 'tools', 'sopworld', 'sopworld.mjs');
  if (!existsSync(sopworldPath)) throw new Error(`sop-knowledge-worlds not found at ${kDir}`);
  const { parse } = await import(pathToFileURL(sopworldPath).href);
  const worldsDir = join(kDir, 'docs', 'worlds');

  const vocabPath = join(worldsDir, 'vocab-kinds.json');
  const vocabKinds = existsSync(vocabPath)
    ? JSON.parse(readFileSync(vocabPath, 'utf8'))
    : {};

  // Order: grammar first (gives lexicons/frames/prepositions to tabs & actions!), then tabs, actions, domain!
  const grammar = loadGrammar(parse, worldsDir);
  const overlays = readOverlayWires(parse, worldPaths);
  const keyWires = overlayWires(readRequestKeyWires(parse, worldsDir), overlays, 'w.request.key');
  const { tabs, catalog, discoveredWorlds, meansToWords } = buildCatalogs(parse, worldsDir, grammar, keyWires, overlays, includeLegacy);
  const { acts, actRoles, verbs, markings, markingsByActMarker, actionSpecs } = loadActions(parse, worldsDir, grammar);
  const domain = loadDomain(parse, worldsDir, vocabKinds, grammar, catalog);

  const normalizeToken = (word) => String(word ?? '').toLowerCase().replace(/\u2019/g, "'");
  const totalKeys = Object.values(tabs).reduce((sum, t) => sum + t.keyList.length, 0);

  return {
    knowledgeDir: kDir,
    sopworldPath,
    ...(includeLegacy ? { tabs } : {}),
    catalog,
    requestKeys: indexRequestKeyDeclarations(keyWires),
    acts,
    actRoles,
    verbs,
    markings,
    markingsByActMarker,
    actionSpecs,
    grammar,
    domain,
    meansToWords,
    meta: {
      discoveredWorlds,
      enShardsLoaded: grammar.enShardsLoaded,
      framesCount: grammar.frames.size,
      lexiconsCount: grammar.lexicons.size,
      markingsCount: [...markings.values()].reduce((s, arr) => s + arr.length, 0),
      ...(includeLegacy ? { tabsCount: Object.keys(tabs).length } : {}),
      totalKeys: includeLegacy ? totalKeys : catalog.keys.size,
      loadMs: performance.now() - t0,
    },
    isGrammarWord(word) {
      const w = normalizeToken(word);
      if (!w) return false;
      if (grammar.grammarWords.has(w)) return true;
      const idx = w.indexOf("'");
      if (idx > 0) {
        const stem = w.slice(0, idx);
        const end = w.slice(idx);
        if (grammar.grammarWords.has(stem) && grammar.contractionEndings.has(end)) return true;
      }
      return false;
    },
    isFillerWord(word) {
      const w = normalizeToken(word);
      return Boolean(w) && (grammar.fillerWords.has(w) || grammar.fillerPhrases.has(w));
    },
  };
}
