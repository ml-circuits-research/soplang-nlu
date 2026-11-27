// The strategies of the syntax benchmark: [module, export name]. A strategy takes part once its
// exported object declares `schema: 'syntax'`; until then run.mjs reports it as "not ported".
//
// The work goes on with four at most (the owner's decision of 2026-11-27): VSS, the one strategy
// that reads the dependency parse, DistilBERT, and one hand-written grammar. `prolog` and `z3`
// both stand for that fourth place until the 1% benchmark has judged them; one of them leaves then.
export const strategyModules = {
  vss: ['../../../strategies/vss/index.mjs', 'vss'],
  spacy: ['../../../strategies/spacy/index.mjs', 'spacy'],
  distilbert: ['../../../strategies/distilbert/index.mjs', 'distilBert'],
  prolog: ['../../../strategies/prolog/index.mjs', 'prolog'],
  z3: ['../../../strategies/z3/index.mjs', 'z3']
}

// Left out of the rounds and of the benchmark: each is too close to one of the strategies above.
// On the 598 messages of round 2, spacy-direct and neural-dependencies wrote the same circuit for
// 97%, the two selectors for 88% (and 77 to 84% the same as spacy-beam, among whose circuits they
// choose), neuro-prolog 78% the same as spacy-direct, prolog-example-transfer 100% the same as
// prolog (it has no templates yet). The code stays in the repository and still runs by name with
// `run.mjs --only <name>`.
export const retiredModules = {
  'spacy-beam': ['../../../strategies/spacy-beam/index.mjs', 'spacyBeam'],
  'spacy-direct': ['../../../strategies/spacy-direct/index.mjs', 'spacyDirect'],
  'neural-dependencies': ['../../../strategies/neural-dependencies/index.mjs', 'neuralDependencies'],
  'neuro-selector': ['../../../strategies/neuro-selector/index.mjs', 'neuroSelector'],
  'selector-distilbert': ['../../../strategies/selector-distilbert/index.mjs', 'selectorDistilBert'],
  'neuro-prolog': ['../../../strategies/neuro-prolog/index.mjs', 'neuroProlog'],
  'neuro-z3': ['../../../strategies/neuro-z3/index.mjs', 'neuroZ3'],
  'prolog-example-transfer': ['../../../strategies/prolog-example-transfer/index.mjs', 'prologExampleTransfer']
}

// Strategies of one family read a message from the same source, so that two of them writing the
// same circuit says little. The family is the source of the analysis, not the kind of program:
// neuro-prolog and neuro-z3 read the dependency parse, and the two selectors choose among circuits
// written from it (strategies/neuro-selector/syntax-pool.mjs), so all of them stand with the parser.
// A circuit is settled by agreement only when strategies of enough different families wrote it
// (round.mjs settle, --families).
export const families = {
  vss: ['vss'],
  parser: ['spacy', 'spacy-direct', 'spacy-beam', 'neural-dependencies', 'neuro-prolog', 'neuro-z3', 'neuro-selector', 'selector-distilbert'],
  prolog: ['prolog', 'prolog-worlds', 'prolog-example-transfer'],
  z3: ['z3'],
  distilbert: ['distilbert']
}
/** A function from the name of a strategy to its family; a strategy no family names is a family of its own. */
export function familyFinder(declared = families) {
  const byName = new Map(Object.entries(declared).flatMap(([family, names]) => names.map(name => [name, family])))
  return name => byName.get(name) ?? name
}
