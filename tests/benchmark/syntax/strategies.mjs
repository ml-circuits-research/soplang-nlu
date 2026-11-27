// The strategies of the syntax benchmark: [module, export name]. The names are those of
// tests/benchmark/strategies.mjs. A strategy takes part once its exported object declares
// `schema: 'syntax'`; until then run.mjs reports it as "not ported".
export const strategyModules = {
  z3: ['../../../strategies/z3/index.mjs', 'z3'],
  'prolog-worlds': ['../../../strategies/prolog/index.mjs', 'prolog'],
  'prolog-example-transfer': ['../../../strategies/prolog-example-transfer/index.mjs', 'prologExampleTransfer'],
  'selector-distilbert': ['../../../strategies/selector-distilbert/index.mjs', 'selectorDistilBert'],
  distilbert: ['../../../strategies/distilbert/index.mjs', 'distilBert'],
  'spacy-beam': ['../../../strategies/spacy-beam/index.mjs', 'spacyBeam'],
  'spacy-direct': ['../../../strategies/spacy-direct/index.mjs', 'spacyDirect'],
  'neuro-z3': ['../../../strategies/neuro-z3/index.mjs', 'neuroZ3'],
  'neuro-selector': ['../../../strategies/neuro-selector/index.mjs', 'neuroSelector'],
  'neuro-prolog': ['../../../strategies/neuro-prolog/index.mjs', 'neuroProlog'],
  vss: ['../../../strategies/vss/index.mjs', 'vss']
}
