// Native SOP schema validation and grounding against the text and request key declarations.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { acceptsPropertyFamily } from '../contracts.mjs';
import { indexRequestKeyDeclarations, readRequestKeyWires } from '../kb/request-keys.mjs';

const PHRASES = {
  'w.request.request': ['words', 'predicate', 'asked_words'],
  'w.request.target': ['sort_words', 'name', 'name_words', 'description', 'count_words', 'code_words', 'ids', 'family_words'],
  'w.request.constraint': ['words', 'key_words', 'measure_words'],
  'w.request.lookup': ['words'],
  'w.request.intent': ['words'],
  'w.request.unread': ['text'],
  'w.request.filler': ['text'],
};

const EVIDENCE = [
  'words', 'predicate', 'asked_words',
  'sort_words', 'name', 'name_words', 'description', 'count_words', 'code_words', 'ids', 'family_words',
  'key_words', 'measure_words', 'text',
];

const TOKEN = /[A-Za-z0-9]+(?:['\u2019][A-Za-z]+)?/g;

function tok(v) {
  const s = String(v);
  if (s.startsWith('"')) {
    try { return JSON.parse(s); } catch { return s.slice(1, -1); }
  }
  return s;
}

function one(w, k) {
  return w.attrs[k] ? tok(w.attrs[k][0]) : undefined;
}

function esc(x) {
  return String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function says(phrase, text) {
  return !!phrase && String(phrase).length > 0 && new RegExp(`(?<![\\w])${esc(String(phrase))}(?:e?s)?(?![\\w])`, 'i').test(text);
}

// Capitalised words that are not the first word of a sentence (and not "I" or an abbreviation): names to keep.
export function properNames(text) {
  const out = [];
  for (const m of text.matchAll(/[A-Z][\w'-]*/g)) {
    const before = text.slice(0, m.index).trimEnd();
    if (!before || /[.!?:;"\u201c(\-\u2014]$/.test(before) || /^I('|$)/.test(m[0]) || /\w/.test(text[m.index - 1] ?? ' ')) continue;
    if (/^[A-Z]{2,}s?$/.test(m[0])) continue;
    out.push(m[0]);
  }
  return out;
}

export async function createVerifier({ knowledgeDir, requestKeys } = {}) {
  const KNOWLEDGE = resolve(knowledgeDir);
  if (!existsSync(join(KNOWLEDGE, 'tools', 'sopworld', 'sopworld.mjs'))) {
    throw new Error(`sop-knowledge-worlds not found at ${KNOWLEDGE}`);
  }

  const { World, parse } = await import(pathToFileURL(join(KNOWLEDGE, 'tools', 'sopworld', 'sopworld.mjs')).href);
  const { scanWorlds, library } = await import(pathToFileURL(join(KNOWLEDGE, 'tools', 'lib', 'worlds.mjs')).href);
  const { scanSchemas } = await import(pathToFileURL(join(KNOWLEDGE, 'tools', 'lib', 'schemas.mjs')).href);

  const worlds = scanWorlds(join(KNOWLEDGE, 'docs', 'worlds'));
  const schemas = scanSchemas(join(KNOWLEDGE, 'docs', 'worlds'));
  const base = new World({
    library: {
      ...library(worlds),
      ...Object.fromEntries(schemas.map((x) => [x.id, x.schemaText])),
    },
  });
  base.load('@acts core.use world=std.acts');
  const used = base.use('w.request');
  if (!used.ok) throw new Error('w.request does not load: ' + JSON.stringify(used.violations?.slice(0, 3)));

  // Close referenced world types (k.actions) just like webmeet-dataset/tools/check.mjs lines 73-80.
  for (const id of ['k.actions']) {
    const u = base.use(id);
    if (!u.ok) throw new Error(`${id} does not load: ${JSON.stringify(u.violations?.slice(0, 3))}`);
    const world = worlds.find((w) => w.id === id);
    if (!world) throw new Error(`no world ${id} under ${KNOWLEDGE}`);
    for (const shard of world.shards) base.tell(shard.text, { factsOnly: true });
    for (const w of parse(world.schemaText ?? readFileSync(join(world.dir, 'schema.sop'), 'utf8'))) {
      if (w.type === 'core.type') base.closeType(w.attrs.of[0]);
    }
  }

  // Probe: must refuse unknown act and unknown mood.
  {
    const probe = base.fork().tell('@p w.request.request act=blorp mood=maybe\n@p.t w.request.target request=$p family=drawn mode=new');
    const keys = new Set((probe.violations ?? []).map((v) => v.key));
    if (!keys.has('act') || !keys.has('mood')) {
      throw new Error(`verifier probe failed: ${JSON.stringify(probe)}`);
    }
  }

  // Load grammar and filler words from w.lang.en.
  const LEX = (() => {
    const grammar = new Set();
    const filler = new Set();
    const endings = new Set();
    const contractions = [];
    const dir = join(KNOWLEDGE, 'docs', 'worlds', 'w.lang.en', 'shards');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sop'))) {
      for (const w of parse(readFileSync(join(dir, f), 'utf8'))) {
        const cls = w.attrs.class ? tok(w.attrs.class[0]) : '';
        const texts = (w.attrs.text ?? []).map((t) => tok(t).toLowerCase());
        if (w.type === 'w.lang.en.closed' && ['determiner', 'pronoun', 'preposition', 'conjunction', 'auxiliary', 'particle', 'adverb'].includes(cls)) {
          texts.forEach((t) => grammar.add(t));
        }
        if (w.type === 'w.lang.en.closed' && cls === 'interjection') texts.forEach((t) => filler.add(t));
        if (w.type === 'w.lang.en.skip') texts.forEach((t) => (['politeness', 'filler', 'desire'].includes(cls) ? filler : grammar).add(t));
        if (w.type === 'w.lang.en.imperative.lead') texts.forEach((t) => grammar.add(t));
        if (w.type === 'w.lang.en.contraction') contractions.push([texts[0], tok(w.attrs.expands[0]).toLowerCase()]);
        if (w.type === 'w.lang.en.contraction.ending') endings.add(tok(w.attrs.ending[0]).toLowerCase());
      }
    }
    for (const [t, e] of contractions) if (e.split(/\s+/).every((x) => grammar.has(x))) grammar.add(t);
    return { grammar, filler, endings };
  })();

  const isGrammar = (w) => {
    const x = w.toLowerCase().replace(/\u2019/g, "'");
    const i = x.indexOf("'");
    return LEX.grammar.has(x) || (i > 0 && LEX.grammar.has(x.slice(0, i)) && LEX.endings.has(x.slice(i)));
  };

  const { keys: KEYS, families: FAMILIES } = requestKeys ?? indexRequestKeyDeclarations(
    readRequestKeyWires(parse, join(KNOWLEDGE, 'docs', 'worlds')),
  );

  // Load verb -> acts mapping from k.actions.
  const VERB_ACTS = new Map();
  {
    const dir = join(KNOWLEDGE, 'docs', 'worlds', 'k.actions', 'shards');
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.sop'))) {
      for (const w of parse(readFileSync(join(dir, f), 'utf8'))) {
        if (w.type !== 'k.actions.verb' || !w.attrs.act) continue;
        const t = tok(w.attrs.text[0]).toLowerCase();
        if (!VERB_ACTS.has(t)) VERB_ACTS.set(t, new Set());
        for (const a of w.attrs.act) VERB_ACTS.get(t).add(tok(a));
      }
    }
  }

  const verbActs = (p, words = '') => {
    const x = String(p).toLowerCase();
    const w = ` ${words.toLowerCase()} `;
    for (const c of [
      x,
      x.replace(/s$/, ''),
      x.replace(/ed$/, ''),
      x.replace(/d$/, ''),
      x.replace(/ing$/, ''),
      x.replace(/ing$/, 'e'),
      x.replace(/ied$/, 'y'),
      x.replace(/ies$/, 'y'),
    ]) {
      if (!VERB_ACTS.has(c)) continue;
      const acts = new Set(VERB_ACTS.get(c));
      for (const [t, a] of VERB_ACTS) {
        if (t.startsWith(c + ' ') && t.split(' ').slice(1).every((part) => w.includes(` ${part} `) || w.includes(` ${part},`))) {
          a.forEach((y) => acts.add(y));
        }
      }
      return acts;
    }
    return null;
  };

  function grounding(text, wires) {
    const out = [];
    const targetFamilies = new Map(wires.filter((wire) => wire.type === 'w.request.target')
      .map((target) => [one(target, 'request'), one(target, 'family')]));
    for (const w of wires) {
      if (w.type === 'w.request.context') out.push({ type: w.type, key: '', why: 'page object: not said by the text (write what the text says on the target)' });
      if (w.attrs.thing) out.push({ type: w.type, key: 'thing', why: 'link to a page object: not said by the text' });
      if (w.type === 'w.request.request') {
        if (w.attrs.goes_to) out.push({ type: w.type, key: 'goes_to', why: 'routing is outside request formalisation' });
        if (one(w, 'words') === text) out.push({ type: w.type, key: 'words', why: 'repeats the whole text (leave it out)' });
      }
      if (w.type === 'w.request.target' && w.attrs.family && !FAMILIES.has(one(w, 'family'))) {
        out.push({ type: w.type, key: 'family', why: 'not a declared request family' });
      }
      if (w.type === 'w.request.constraint' && !w.attrs.on) {
        out.push({ type: w.type, key: 'on', why: 'no on= (required by w.request: attribute, place, size, count ...)' });
      }
      if (w.type === 'w.request.constraint' && !w.attrs.attribute) {
        out.push({ type: w.type, key: 'attribute', why: 'no reader key (a meaning without a key is an unread wire with a note)' });
      }
      if (w.type === 'w.request.constraint' && w.attrs.attribute) {
        const declarations = KEYS.get(one(w, 'attribute')) ?? [];
        const ownerFamily = targetFamilies.get(one(w, 'request'));
        const compatible = declarations.filter((key) => !ownerFamily || acceptsPropertyFamily(ownerFamily, key.family));
        if (!declarations.length) {
          out.push({ type: w.type, key: 'attribute', why: 'not a declared request property' });
        } else if (!compatible.length) {
          out.push({ type: w.type, key: 'attribute', why: `property is incompatible with its request target family ${ownerFamily}` });
        } else if (one(w, 'open_value') !== 'true') {
          const values = (w.attrs.value ?? []).map((value) => tok(value).toLowerCase());
          if (!compatible.some((key) => !key.values || values.every((value) => key.values.has(value)))) {
            out.push({ type: w.type, key: 'value', why: 'values match no compatible declaration and are not marked open_value' });
          }
        }
      }
      if (w.type === 'w.request.target') {
        if (w.attrs.sort_words && one(w, 'sort_words') === one(w, 'sort')) {
          out.push({ type: w.type, key: 'sort_words', why: 'repeats sort (leave it out)' });
        }
        if (w.attrs.sort && !w.attrs.sort_words && !says(one(w, 'sort'), text)) {
          out.push({ type: w.type, key: 'sort', why: 'a kind the text does not say' });
        }
        const identified = ['name', 'description', 'sort_words', 'code_words', 'count_words', 'ids'].some((k) => w.attrs[k]) || says(one(w, 'sort'), text);
        const looked = wires.some((l) => l.type === 'w.request.lookup' && String(l.attrs.target?.[0]) === '$' + w.id && one(l, 'key') === 'thing');
        if (one(w, 'mode') !== 'new' && one(w, 'fill') !== 'all' && !identified && !looked) {
          out.push({ type: w.type, key: '', why: 'existing target no words identify and no lookup (add w.request.lookup key=thing)' });
        }
      }
      if (w.type === 'w.request.constraint') {
        if (w.attrs.words && (w.attrs.value ?? []).length === 1 && String(one(w, 'value')) === one(w, 'words')) {
          out.push({ type: w.type, key: 'words', why: 'repeats value (leave it out)' });
        }
        if (!w.attrs.words && !(w.attrs.value ?? []).every((v) => text.includes(tok(v)))) {
          out.push({ type: w.type, key: 'value', why: 'neither words nor a value the text says' });
        }
      }
      if (w.type === 'w.request.constraint' || w.type === 'w.request.unread') {
        for (const v of w.attrs.value ?? []) {
          if (String(v).startsWith('"') && !/^(-?\d+(\.\d+)?|true|false)$/.test(tok(v)) && !text.includes(tok(v))) {
            out.push({ type: w.type, key: 'value', why: 'a phrase the text does not say (keep the words; the system normalises them)' });
          }
        }
      }
    }

    // Request's evidence must lie inside its own words.
    for (const r of wires.filter((w) => w.type === 'w.request.request' && w.attrs.words)) {
      const words = one(r, 'words');
      for (const w of wires.filter((x) => x === r || String(x.attrs.request?.[0]) === '$' + r.id)) {
        for (const k of ['predicate', 'asked_words', 'sort_words', 'name', 'name_words', 'description', 'count_words', 'code_words', 'family_words', 'key_words', 'measure_words']) {
          for (const v of w.attrs[k] ?? []) {
            if (text.includes(tok(v)) && !words.includes(tok(v))) {
              out.push({ type: w.type, key: k, why: "outside its request's words (evidence of another request?)" });
            }
          }
        }
      }
      for (const lookup of wires.filter((w) => w.type === 'w.request.lookup' && String(w.attrs.request?.[0]) === '$' + r.id)) {
        const evidence = one(lookup, 'words');
        if (evidence && !words.includes(evidence)) {
          out.push({ type: lookup.type, key: 'words', why: "outside its request's words (evidence of another request?)" });
        }
      }
      for (const c of wires.filter((x) => x.type === 'w.request.constraint' && String(x.attrs.request?.[0]) === '$' + r.id && !x.attrs.words)) {
        for (const v of c.attrs.value ?? []) {
          if (text.includes(tok(v)) && !words.includes(tok(v))) {
            out.push({ type: c.type, key: 'value', why: "a value outside its request's words (widen the request's words, or write the words it was read from)" });
          }
        }
      }
    }

    // Filler inside a request's words may hold only filler and grammar words.
    const spans = wires
      .filter((w) => w.type === 'w.request.request')
      .map((r) => {
        const sp = one(r, 'words') ?? text;
        const i = text.indexOf(sp);
        return i < 0 ? [0, text.length] : [i, i + sp.length];
      });
    for (const f of wires.filter((w) => w.type === 'w.request.filler')) {
      const ft = one(f, 'text') ?? '';
      const outside = [...text.matchAll(new RegExp(`(?<![\\w])${esc(ft)}(?![\\w])`, 'g'))].some((m) => !spans.some(([a, b]) => a <= m.index && m.index < b));
      let rest = ft.toLowerCase();
      for (const ph of [...LEX.filler].filter((x) => x.includes(' '))) rest = rest.replaceAll(ph, ' ');
      if (!outside && (rest.match(TOKEN) ?? []).some((x) => !isGrammar(x) && !LEX.filler.has(x))) {
        out.push({ type: f.type, key: 'text', why: 'filler hides content words of a request' });
      }
    }
    return out;
  }

  function warningsOf(text, wires) {
    const out = new Set();
    let looseWords = [];
    const covered = new Array(text.length).fill(false);
    const mark = (ph) => {
      if (!ph || String(ph).length < 1) return;
      const re = new RegExp(`(?<![\\w])${esc(String(ph))}(?![\\w])`, 'gi');
      for (const m of text.matchAll(re)) {
        for (let i = m.index; i < m.index + m[0].length; i++) covered[i] = true;
      }
    };

    for (const w of wires) {
      if (w.type === 'w.request.request' || w.type === 'w.request.previous' || w.type === 'w.request.clock') {
        mark(one(w, 'predicate'));
        for (const v of w.attrs.asked_words ?? []) mark(tok(v));
        continue;
      }
      for (const k of EVIDENCE) for (const v of w.attrs[k] ?? []) mark(tok(v));
      if (w.type === 'w.request.target' && says(one(w, 'sort'), text)) mark(one(w, 'sort'));
      if (w.type === 'w.request.constraint' && !w.attrs.words) for (const v of w.attrs.value ?? []) mark(tok(v));
      if (w.type === 'w.request.target' && w.attrs.ordinal) mark(one(w, 'ordinal'));
    }

    for (const u of wires.filter((w) => w.type === 'w.request.unread')) {
      const t = one(u, 'text') ?? '';
      const ws = t.match(/[\w'-]+/g) ?? [];
      if (/^[\w'-]+$/.test(t) && (isGrammar(t) || verbActs(t))) {
        out.add('unread holding a single grammar word or verb (a particle belongs to the predicate, a verb is the predicate or filler)');
      } else if (ws.length > 1 && ws.every((x) => isGrammar(x))) {
        out.add('unread holding only grammar words');
      } else if (ws.filter((x) => !/^(the|a|an|this|that|these|those|its|his|her|their|my|our|your)$/i.test(x)).length === 1 && one(u, 'note') !== 'page.scene') {
        out.add('unread holding a single word (write the phrase it belongs to, or leave it uncovered)');
      }
      if (/misspel|typo/i.test(one(u, 'note') ?? '')) {
        out.add('unread noting a misspelling (a typo is not a meaning: leave it uncovered)');
      }
      if (/^request\.(particle|speed|modality|additionalVerb)$/.test(one(u, 'note') ?? '')) {
        out.add('unread noting a particle, speed or modality (part of the predicate or filler, not a meaning)');
      }
    }

    for (const c of wires.filter((w) => w.type === 'w.request.constraint' && /^chart\.(measure|dimension)$/.test(one(w, 'attribute') ?? ''))) {
      for (const v of c.attrs.value ?? []) {
        const ws = tok(v).match(/[\w'-]+/g) ?? [];
        if (ws.length && ws.every((x) => isGrammar(x) || (verbActs(x) && new RegExp(`(^|\\b(let's|lets|to|you|i|we|please|can|could|will|would|and)\\s+)${esc(x)}\\b`, 'i').test(text)))) {
          out.add('a chart measure or dimension that is a verb or grammar word');
        }
      }
    }

    for (const r of wires.filter((w) => w.type === 'w.request.request' && w.attrs.asked_words)) {
      for (const v of r.attrs.asked_words) {
        if (tok(v) === (one(r, 'words') ?? text).replace(/[?.!]+$/, '') || tok(v).split(/\s+/).length > 4) {
          out.add('asked_words hold the whole request, not the words naming the key asked about');
        }
      }
    }

    {
      const seen = new Set();
      for (const w of wires.filter((x) => x.type === 'w.request.constraint' || x.type === 'w.request.unread')) {
        const k = w.type + ' ' + JSON.stringify(Object.entries(w.attrs).sort());
        if (seen.has(k)) out.add('the same wire twice in one request');
        seen.add(k);
      }
    }

    const loose = [...text.matchAll(TOKEN)].filter((m) => !covered[m.index] && !isGrammar(m[0])).map((m) => m[0]);
    if (loose.length) {
      out.add('words no wire formalizes');
      looseWords = [...new Set(loose)];
    }

    for (const r of wires.filter((w) => w.type === 'w.request.request')) {
      if (one(r, 'act') === 'remove' && /^(keep|keeps|kept|leave|leaves|left|stay|stays|spare|let|remain|remains)$/i.test(one(r, 'predicate') ?? '')) {
        const sel = wires.filter((w) => w.type === 'w.request.constraint' && String(w.attrs.request?.[0]) === '$' + r.id && one(w, 'phase') === 'selector');
        if (sel.length && !sel.some((w) => one(w, 'want') === 'no')) {
          out.add('a removal under a keeping verb whose selector excludes nothing (keep X = remove the others: want=no)');
        }
      }
      const acts = r.attrs.predicate ? verbActs(one(r, 'predicate'), one(r, 'words') ?? text) : null;
      if (acts && acts.size === 1 && acts.has('remove') && !['remove', 'undo'].includes(one(r, 'act'))) {
        out.add('act contradicts the predicate (a removal verb, by k.actions verbs)');
      }
      const words = one(r, 'words') ?? text;
      const mine = wires.filter((w) => String(w.attrs.request?.[0]) === '$' + r.id);
      for (const name of properNames(words)) {
        if (name.toLowerCase() !== String(one(r, 'predicate') ?? '').toLowerCase() && !mine.some((w) => Object.values(w.attrs).flat().some((v) => tok(v).includes(name)))) {
          out.add('proper name of the text missing from the circuit');
        }
      }
      const unread = mine.filter((w) => w.type === 'w.request.unread');
      if (unread.some((u) => one(u, 'text') === words) || (unread.length && !mine.some((w) => w.type === 'w.request.constraint'))) {
        out.add('meaning left unread (no key yet)');
      }
    }

    const warnings = [...out].map((why) => (
      why.startsWith('words no wire') ? { why, words: looseWords.join(' ') } : { why }
    ));
    return { warnings, uncoveredWords: looseWords };
  }

  function check(text, sopText) {
    const rawText = String(text ?? '');
    if (typeof sopText !== 'string') {
      return {
        ok: false,
        schemaValid: false,
        errors: [{ type: '(parse)', key: '', why: 'sopText is not a string' }],
        warnings: [],
        wires: null,
        uncoveredWords: [],
      };
    }

    let wires = null;
    const rawErrors = [];
    try {
      wires = parse(sopText);
    } catch (e) {
      rawErrors.push({ type: '(parse)', key: '', why: String(e.message ?? e).replace(/".*"/, '"…"') });
      return {
        ok: false,
        schemaValid: false,
        errors: rawErrors,
        warnings: [],
        wires: null,
        uncoveredWords: [],
      };
    }

    for (const w of wires) {
      if (!w.type.startsWith('core.') && !base.schema(w.type)) {
        rawErrors.push({ type: w.type, key: '', why: 'type declared by no schema' });
      }
    }
    for (const w of wires) {
      for (const key of PHRASES[w.type] ?? []) {
        for (const v of w.attrs[key] ?? []) {
          if (!rawText.includes(tok(v))) {
            rawErrors.push({ type: w.type, key, why: 'phrase not found in the text' });
          }
        }
      }
    }

    rawErrors.push(...grounding(rawText, wires));
    const { warnings, uncoveredWords } = warningsOf(rawText, wires);

    if (!rawText.trim()) {
      rawErrors.push({ type: '(row)', key: 'text', why: 'empty text' });
    }

    const res = base.fork().tell(sopText);
    for (const v of res.violations ?? []) {
      const wire = wires.find((w) => w.id === v.id);
      const reason = String(v.why ?? v.kind ?? '').replace(/"[^"]*"/g, '"…"').replace(/\b\d+(\.\d+)?\b/g, 'N');
      rawErrors.push({ type: wire?.type ?? '?', key: v.key ?? '', why: reason });
    }

    const seen = new Set();
    const errors = [];
    for (const err of rawErrors) {
      const k = `${err.type} | ${err.key} | ${err.why}`;
      if (seen.has(k)) continue;
      seen.add(k);
      errors.push(err);
    }

    return {
      ok: errors.length === 0,
      schemaValid: wires.length > 0 && !res.violations?.length && wires.every(w => base.schema(w.type)),
      errors,
      warnings,
      wires,
      uncoveredWords,
    };
  }

  return {
    check,
    parse,
    KEYS,
    FAMILIES,
    LEX,
    VERB_ACTS,
    isGrammar,
    knowledgeDir: KNOWLEDGE,
  };
}
