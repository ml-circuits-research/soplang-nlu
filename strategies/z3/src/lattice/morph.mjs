// Morphology helper for nl-formaliser.
// Generates candidate lowercase base forms (lemmas) and singular noun phrases
// without dropping the original lowercase form.

function lookupIrregular(dict, word) {
  if (!dict) return [];
  let val;
  if (dict instanceof Map) val = dict.get(word);
  else if (typeof dict === 'object') val = Object.hasOwn(dict, word) ? dict[word] : undefined;
  if (!val) return [];
  if (typeof val === 'string') return [val.toLowerCase()];
  if (Array.isArray(val) || val instanceof Set) {
    return [...val].map((x) => String(x).toLowerCase()).filter(Boolean);
  }
  return [];
}

const CONSONANT_RE = /^[bcdfghjklmnpqrstvwxz]$/;

/**
 * Return a deduplicated array of lowercase candidate base forms `[lower, ...]`
 * for a single word using `kb.grammar.irregularPlurals`,
 * `kb.grammar.irregularVerbs`, and standard English suffix rules.
 * Never drops the original lowercase form.
 */
export function lemmatiseWord(word, kb = null) {
  const lower = String(word ?? '').toLowerCase().replace(/\u2019/g, "'").trim();
  if (!lower) return [];

  const out = [];
  const seen = new Set();
  const add = (w) => {
    if (w && !seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  };

  add(lower);

  for (const lemma of lookupIrregular(kb?.grammar?.irregularPlurals, lower)) add(lemma);
  for (const lemma of lookupIrregular(kb?.grammar?.irregularVerbs, lower)) add(lemma);

  // Possessive trailing 's / '
  if (lower.endsWith("'s") && lower.length > 2) add(lower.slice(0, -2));
  if (lower.endsWith("s'") && lower.length > 2) add(lower.slice(0, -1));

  // Plural / 3rd-person singular nouns and verbs
  if (lower.endsWith('ies') && lower.length > 3) {
    add(lower.slice(0, -3) + 'y');
  }
  if (lower.endsWith('ves') && lower.length > 3) {
    add(lower.slice(0, -3) + 'f');
    add(lower.slice(0, -3) + 'fe');
  }
  if (/(ches|shes|xes|zes|sses|oes)$/.test(lower) && lower.length > 3) {
    add(lower.slice(0, -2));
  }
  if (
    lower.endsWith('s') &&
    lower.length > 2 &&
    !lower.endsWith('ss') &&
    !lower.endsWith('us') &&
    !lower.endsWith('is')
  ) {
    add(lower.slice(0, -1));
  }

  // Past tense / past participle (-ied, -ed)
  if (lower.endsWith('ied') && lower.length > 3) {
    add(lower.slice(0, -3) + 'y');
  }
  if (lower.endsWith('ed') && lower.length > 3) {
    const stem = lower.slice(0, -2);
    add(stem);
    add(lower.slice(0, -1)); // moved -> move, resized -> resize
    if (
      stem.length >= 3 &&
      stem[stem.length - 1] === stem[stem.length - 2] &&
      CONSONANT_RE.test(stem[stem.length - 1])
    ) {
      add(stem.slice(0, -1)); // flipped -> flip, labelled -> label
    }
  }

  // Progressive / gerund (-ing)
  if (lower.endsWith('ing') && lower.length > 4) {
    const stem = lower.slice(0, -3);
    add(stem);
    add(stem + 'e'); // moving -> move, making -> make
    if (
      stem.length >= 3 &&
      stem[stem.length - 1] === stem[stem.length - 2] &&
      CONSONANT_RE.test(stem[stem.length - 1])
    ) {
      add(stem.slice(0, -1)); // sitting -> sit, running -> run
    }
    if (stem.endsWith('y') && stem.length >= 2) {
      add(stem.slice(0, -1) + 'ie'); // tying -> tie
    }
  }

  // Comparative (-er, -ier)
  if (lower.endsWith('ier') && lower.length > 4) {
    add(lower.slice(0, -3) + 'y'); // tinier -> tiny
  }
  if (lower.endsWith('er') && lower.length > 3) {
    const stem = lower.slice(0, -2);
    add(stem); // smaller -> small
    add(lower.slice(0, -1)); // larger -> large, wider -> wide
    if (
      stem.length >= 3 &&
      stem[stem.length - 1] === stem[stem.length - 2] &&
      CONSONANT_RE.test(stem[stem.length - 1])
    ) {
      add(stem.slice(0, -1)); // bigger -> big, thinner -> thin
    }
  }

  // Superlative (-est, -iest)
  if (lower.endsWith('iest') && lower.length > 5) {
    add(lower.slice(0, -4) + 'y'); // tiniest -> tiny
  }
  if (lower.endsWith('est') && lower.length > 4) {
    const stem = lower.slice(0, -3);
    add(stem); // smallest -> small
    add(lower.slice(0, -2)); // largest -> large
    if (
      stem.length >= 3 &&
      stem[stem.length - 1] === stem[stem.length - 2] &&
      CONSONANT_RE.test(stem[stem.length - 1])
    ) {
      add(stem.slice(0, -1)); // biggest -> big
    }
  }

  return out;
}

/**
 * Return candidate lowercase base forms for VERB lookup only (no comparative -er/-est stripping,
 * so nouns like "keeper", "marker", "letter", "layer", "slider" never lemmatise into phantom verbs!).
 */
export function lemmatiseVerb(word, kb = null) {
  const lower = String(word ?? '').toLowerCase().replace(/\u2019/g, "'").trim();
  if (!lower) return [];

  const out = [];
  const seen = new Set();
  const add = (w) => {
    if (w && !seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  };

  add(lower);
  for (const lemma of lookupIrregular(kb?.grammar?.irregularVerbs, lower)) add(lemma);

  // 3rd-person singular (-ies, -es, -s)
  if (lower.endsWith('ies') && lower.length > 3) add(lower.slice(0, -3) + 'y');
  if (/(ches|shes|xes|zes|sses|oes)$/.test(lower) && lower.length > 3) add(lower.slice(0, -2));
  if (lower.endsWith('s') && lower.length > 2 && !lower.endsWith('ss') && !lower.endsWith('us') && !lower.endsWith('is')) {
    add(lower.slice(0, -1));
  }

  // Past tense / past participle (-ied, -ed)
  if (lower.endsWith('ied') && lower.length > 3) add(lower.slice(0, -3) + 'y');
  if (lower.endsWith('ed') && lower.length > 3) {
    const stem = lower.slice(0, -2);
    add(stem);
    add(lower.slice(0, -1));
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2] && CONSONANT_RE.test(stem[stem.length - 1])) {
      add(stem.slice(0, -1));
    }
  }

  // Progressive (-ing)
  if (lower.endsWith('ing') && lower.length > 4) {
    const stem = lower.slice(0, -3);
    add(stem);
    add(stem + 'e');
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2] && CONSONANT_RE.test(stem[stem.length - 1])) {
      add(stem.slice(0, -1));
    }
    if (stem.endsWith('y') && stem.length >= 2) add(stem.slice(0, -1) + 'ie');
  }

  // An explicit lexical entry settles the stem. Prefix stripping can introduce a different act
  // for a lexicalized word, for example 'remove' read as 'move'.
  const verbs = kb?.verbs;
  if (lower.startsWith('re') && verbs && out.some((lemma) =>
    (verbs instanceof Map ? verbs.has(lemma) : Object.hasOwn(verbs, lemma)))) return out;

  // Productive English iterative prefix "re-" / "re" for remaining forms.
  if (lower.startsWith('re-') && lower.length >= 6) {
    for (const sub of lemmatiseVerb(lower.slice(3), kb)) add(sub);
  } else if (lower.startsWith('re') && lower.length >= 6 && !lower.startsWith('read') && !lower.startsWith('real') && !lower.startsWith('rest')) {
    const unprefixed = lower.slice(2);
    if (unprefixed.length >= 4) {
      for (const sub of lemmatiseVerb(unprefixed, kb)) add(sub);
    }
  }

  return out;
}

/**
 * Return candidate singular forms for NOUN lookup only (original, irregularPlurals, possessive 's, plural -s/-es/-ies/-ves;
 * never strips -ing/-ed/-er/-est, so "facing" never becomes noun "face" and "heading" never becomes "head"!).
 */
export function singulariseNoun(word, kb = null) {
  const lower = String(word ?? '').toLowerCase().replace(/\u2019/g, "'").trim();
  if (!lower) return [];

  const out = [];
  const seen = new Set();
  const add = (w) => {
    if (w && !seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  };

  add(lower);
  for (const lemma of lookupIrregular(kb?.grammar?.irregularPlurals, lower)) add(lemma);

  if (lower.endsWith("'s") && lower.length > 2) add(lower.slice(0, -2));
  if (lower.endsWith("s'") && lower.length > 2) add(lower.slice(0, -1));
  if (lower.endsWith('ies') && lower.length > 3) add(lower.slice(0, -3) + 'y');
  if (lower.endsWith('ves') && lower.length > 3) {
    add(lower.slice(0, -3) + 'f');
    add(lower.slice(0, -3) + 'fe');
  }
  if (/(ches|shes|xes|zes|sses|oes)$/.test(lower) && lower.length > 3) add(lower.slice(0, -2));
  if (lower.endsWith('s') && lower.length > 2 && !lower.endsWith('ss') && !lower.endsWith('us') && !lower.endsWith('is')) {
    add(lower.slice(0, -1));
  }

  return out;
}

/**
 * Return candidate singular forms of a multi-word phrase by lemmatising its last word.
 */
export function singularisePhrase(phrase, kb = null) {
  const clean = String(phrase ?? '').toLowerCase().replace(/\u2019/g, "'").trim();
  if (!clean) return [];
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return [];
  if (parts.length === 1) return singulariseNoun(parts[0], kb);

  const prefix = parts.slice(0, -1).join(' ');
  const last = parts[parts.length - 1];
  const out = [];
  const seen = new Set();
  const add = (p) => {
    if (p && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  };

  add(parts.join(' '));
  for (const lemma of singulariseNoun(last, kb)) {
    add(`${prefix} ${lemma}`);
  }
  return out;
}
