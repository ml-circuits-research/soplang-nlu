// The strategies of the syntax benchmark: [module, export name]. A strategy takes part once its
// exported object declares `schema: 'syntax'`; until then run.mjs reports it as "not ported".
// The names are those the strategies give themselves; the earlier benchmark called `prolog`
// "prolog-worlds".
export const strategyModules = {
  z3: ['../../../strategies/z3/index.mjs', 'z3'],
  prolog: ['../../../strategies/prolog/index.mjs', 'prolog'],
  'prolog-example-transfer': ['../../../strategies/prolog-example-transfer/index.mjs', 'prologExampleTransfer'],
  'selector-distilbert': ['../../../strategies/selector-distilbert/index.mjs', 'selectorDistilBert'],
  distilbert: ['../../../strategies/distilbert/index.mjs', 'distilBert'],
  'spacy-beam': ['../../../strategies/spacy-beam/index.mjs', 'spacyBeam'],
  'spacy-direct': ['../../../strategies/spacy-direct/index.mjs', 'spacyDirect'],
  'neural-dependencies': ['../../../strategies/neural-dependencies/index.mjs', 'neuralDependencies'],
  'neuro-z3': ['../../../strategies/neuro-z3/index.mjs', 'neuroZ3'],
  'neuro-selector': ['../../../strategies/neuro-selector/index.mjs', 'neuroSelector'],
  'neuro-prolog': ['../../../strategies/neuro-prolog/index.mjs', 'neuroProlog'],
  vss: ['../../../strategies/vss/index.mjs', 'vss']
}

// Strategies of one family read a message from the same source, so that two of them writing the
// same circuit says little. The family is the source of the analysis, not the kind of program:
// neuro-prolog and neuro-z3 read the dependency parse, and the two selectors choose among circuits
// written from it (strategies/neuro-selector/syntax-pool.mjs), so all of them stand with the parser.
// A circuit is settled by agreement only when strategies of enough different families wrote it
// (round.mjs settle, --families).
export const families = {
  vss: ['vss'],
  parser: ['spacy-direct', 'spacy-beam', 'neural-dependencies', 'neuro-prolog', 'neuro-z3', 'neuro-selector', 'selector-distilbert'],
  prolog: ['prolog', 'prolog-worlds', 'prolog-example-transfer'],
  z3: ['z3'],
  distilbert: ['distilbert']
}
/** A function from the name of a strategy to its family; a strategy no family names is a family of its own. */
export function familyFinder(declared = families) {
  const byName = new Map(Object.entries(declared).flatMap(([family, names]) => names.map(name => [name, family])))
  return name => byName.get(name) ?? name
}
