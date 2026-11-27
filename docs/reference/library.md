[Home](../README.md) › [Reference](README.md) › Library API

# Library API

This page: the public API of the soplang-nlu package: the reader, the exported functions, how a formalizer uses the schema, speed measurement and environment variables. Kind: Reference.

To run a formalizer step by step: [Run a formalizer](../guides/run-a-formalizer.md). To write one: [Write a new formalizer](../guides/write-a-formalizer.md). Terms: [Glossary](glossary.md#project-terms).

**Standard, New here, Particular.** Many implementations behind one interface, chosen by the caller, is the standard [strategy pattern](https://en.wikipedia.org/wiki/Strategy_pattern); the code calls each implementation a strategy. The contract and the checker of the syntax schema are new here. The word rules of `wordsOf` are particular to English: they split off [clitics](https://en.wikipedia.org/wiki/Clitic), short words written joined to the word before, such as "n't" and "'s".

## The package

- Name `soplang-nlu`, version 0.1.0, ES modules, `"private": true` in package.json: it is not published. Run code from inside a checkout, where a module can import the package by its own name, or install the package from a local path.
- Exports: `.` is `lib/index.mjs`; `./strategies/<name>` exists for hmm-rules (also under its old name, `./strategies/vss`), distilbert, prolog, z3, spacy-beam, spacy-direct, selector-distilbert, neuro-z3, neuro-selector, neuro-prolog and prolog-example-transfer.
- There is no export for `strategies/spacy`, nor for `strategies/neural-dependencies`. The benchmark imports spacy by its file path (`tests/benchmark/syntax/strategies.mjs`).
- `npm test` runs `node --test tests/*.test.mjs`. `npm run benchmark` runs `tests/benchmark/port-run.mjs`, not the syntax benchmark ([Benchmark tools](run-tools.md)).

## The reader

`createReader(options)` in `lib/reader.mjs` opens the strategy and returns `{propose, close}`: `await reader.propose(text)` reads one message, and `await reader.close()` ends the strategy. A complete example, with its output and the fields `propose` returns: [Run a formalizer: read one message from code](../guides/run-a-formalizer.md#read-one-message-from-code).

| Option | Meaning |
| --- | --- |
| `strategy` | the strategy object, for example `hmmRules` |
| `maxReadings` | 1 or 2 (default 2); any other value throws `RangeError`; used only on the legacy path |
| `schemaPaths` | extra schema files for the old checker; used only on the legacy path |
| other keys | passed to `strategy.open(configuration)`, for example the path of a model |

For a strategy that declares `schema: 'syntax'`, `reader.propose(text)` calls `engine.analyse(text)`, takes the first circuit only, and checks it with `validateSyntax`. It returns `{engine, schema, text, candidates, candidateCount, rejected, error}`:

| Field | Meaning |
| --- | --- |
| `engine` | the strategy's name |
| `schema` | `'syntax'` |
| `text` | the message |
| `candidates` | `[{sop, check, …}]` when the circuit is valid; else empty |
| `candidateCount` | 0 or 1 |
| `rejected` | `[{sop, check, …}]` when the circuit failed the check; else empty |
| `error` | null, or why there is no candidate |

The error is the strategy's own error; else "The circuit failed the syntax check."; else "The strategy returned no circuit.". An empty or non-string text gives "Expected a nonempty text string." and no candidate. `reader.close()` calls the engine's `close()` when it has one.

**Legacy path.** A strategy without `schema: 'syntax'` goes through the path of the [nlu-schema period](../project/nlu-period.md). Its circuits are checked with `createAnalysisValidator` only when a `knowledgeDir` option or the variable `SOP_KNOWLEDGE_DIR` names a knowledge repository, and up to `maxReadings` candidates come back. `lib/reader.mjs` also holds `createProviderReader`, an internal entry point that the package does not export.

## Exports of lib/index.mjs

- `createReader`: the reader, above.
- `validateSyntax`, `writeCircuit`, `wordsOf`, `coreOf`: the syntax contract, below.
- `parseCircuit`: not documented elsewhere; see `lib/syntax.mjs` and the table below.
- `syntaxSchema`: an alias of `schema` in `lib/syntax.mjs`; not documented elsewhere.
- `compareAlternatives(references, proposals)`: from the nlu period ("exact serialisation coverage under WebMeet legend v1.2"). It counts the distinct reference circuits that the proposals hold exactly: `{references, proposals, matched, missing, unlisted}`.
- `createAnalysisValidator({knowledgeDir, schemaPaths})`: the old checker of the nlu schema. It loads the SOP parser of the knowledge repository and `schemas/nlu/schema.sop`, and returns `checkAnalysis(text, sop)`. Among the syntax tools, only `convert-nlu.mjs` uses it; older tests, experiments and the legacy path of the reader use it too.

## lib/syntax.mjs

When the module loads, it reads `schemas/syntax/schema.sop` of the package with `node:fs`, and nothing else: no knowledge repository, no other schema.

| Name | What it does |
| --- | --- |
| `wordsOf` | `wordsOf(text)` gives `[{text, start, end}]`: the words in order, with character positions. Punctuation marks are left out. A clitic ("n't", "'s", "'d", "'m", "'re", "'ve", "'ll") is a word of its own. A date (`2026-12-14`), a clock time (`14:00`) and a decimal number stay one word. |
| `writeCircuit` | `writeCircuit(text, wires)` gives the circuit text. A wire is `{id, type, slots}`; a slot is `{key, span: [first, last]}` (word positions), `{key, ref: id}` or `{key, value: atom}`. It orders the wires so that [Rule 1](../schema/rules.md#rule-1-alignment-every-word-exactly-once) (alignment) gives every value its own words back, and writes atoms, then quoted values in word order, then references. It throws when a word is left out or claimed twice, or when repeated words cross so that even the order of the message leaves a word uncovered. |
| `validateSyntax` | `validateSyntax(text, sop)` gives `{valid, findings, placements, words}`. It checks types, keys, values and references against the schema, the constraints on clauses and coordinations, and the alignment of Rule 1. `placements` gives each quoted value's words as `{wire, key, first, last}`; `words` is the number of words. |
| `coreOf` | `coreOf(text, sop)` gives a text that is equal for two circuits that place every word alike and tie the same wires, whatever their wire names; null for an invalid circuit. The tools apply it to the normal form ([When two circuits are the same](../evaluation/normal-form.md)). |
| `parseCircuit` | `parseCircuit(sop)` gives `[{id, type, slots: [[key, raw]]}]`, one wire per line. It throws `SyntaxError` on a line that is no wire, or that holds text which is no `key=value` pair. |
| `readSchema` | `readSchema(source)` gives `{type: {key: {kind, many, required, options, targets}}}` from the `core.slot` lines of a schema text; `kind` is `enum` when the slot lists `enum` values. Exported by `lib/syntax.mjs` only, not by the package root. |
| `schema` | the syntax schema, read at load time with `readSchema`; the package root exports it as `syntaxSchema`. |

### What validateSyntax reports

A circuit is valid when there is no finding. Each finding has a `code`:

- `not-a-circuit`: a line is no wire.
- `empty-circuit`: there is no wire.
- `duplicate-id`: two wires have one id.
- `unknown-type`, `unknown-key`: a type, or a key of the type, that the schema does not declare.
- `repeated-key`: a key repeated that may stand once.
- `unknown-value`: an atom that is not in the slot's `enum`.
- `missing-wire`, `wrong-wire-type`, `refers-to-itself`: a reference to no wire, to a wire of a type the key does not take, or to the wire itself.
- `expected-quoted-words`: an unquoted value under a key that takes words.
- `missing-key`: a required key is missing.
- `fragment-with-verb`, `clause-without-verb`: a fragment with a `verb`, or another clause without one.
- `ellipsis-outside-fragment`, `ellipsis-of-a-clause-without-verb`: `ellipsis` on a clause that is no fragment, or naming a clause with no verb.
- `coordination-needs-two-conjuncts`, `mixed-conjuncts`: fewer than two conjuncts, or one wire named twice as a conjunct; or conjuncts of different types.
- `no-clause`: the circuit has no clause.
- `bad-quote`, `value-without-words`: a quoted value that is not valid JSON, or that holds no word.
- `words-not-in-message`: a value whose words do not stand free in the message.
- `uncovered-words`: words of the message that no value covers.

## How a formalizer uses the schema

Kept word for word from the schema specification (`docs/syntax-schema.md`, section "How a formalizer uses the schema"); its table of four functions is written here as a list:

Everything a formalizer needs is in `soplang-nlu/lib/syntax.mjs`, exported from the package root.

- `wordsOf(text)`: The words of a message, in order, with their positions. Punctuation marks are left out. Every formalizer must use these positions.
- `writeCircuit(text, wires)`: Writes the circuit from wires whose quoted values are given as spans of words. It orders the wires for Rule 1 and refuses a circuit that leaves a word out or claims one twice.
- `validateSyntax(text, circuit)`: Checks a circuit against the schema and against the message. Returns the findings and the position of every value.
- `coreOf(text, circuit)`: A text that is equal for two circuits that say the same, whatever their wire names. Used to compare readings.

A strategy declares `schema: 'syntax'`. Its `analyse(text)` returns `{analyses: [{sop}]}` with one circuit. The common reader `createReader({strategy})` checks that circuit with `validateSyntax` and returns it only when it is valid. No knowledge repository is read, and the environment variable `SOP_KNOWLEDGE_DIR` plays no part.

The rules a circuit must follow: [The five rules](../schema/rules.md). The contract step by step: [Write a new formalizer](../guides/write-a-formalizer.md).

## Measuring speed

`lib/measure-strategy.mjs` exports `measureStrategy(createReader, texts)`. Here `createReader` is a function with no arguments that opens one reader. It reads the texts one after another and returns `{results, latencies, timing}`; `latencies` holds the time of every message, in order.

| Field of timing | Meaning |
| --- | --- |
| `requests` | messages read |
| `workers` | always 1 |
| `startupMs` | time to open the reader |
| `proposalMs` | time from ready to the last result |
| `shutdownMs` | time to close the reader |
| `totalMs` | all of it |
| `requestsPerSecond` | messages per second over `proposalMs` |
| `medianMs`, `p95Ms` | median and 95th-percentile time per message |

The file is not among the package's exports; code inside the checkout imports it by its path. Benchmark runs measure on their own: `run.mjs` records the milliseconds of every message in each strategy file, and the start-up time and the median in `summary.json` ([Benchmark tools](run-tools.md#runmjs)). What to keep in mind when comparing: [Speed and cost](../formalizers/speed.md).

## Environment variables

- `SOP_NLU_SYNTAX_PYTHON`: the Python with spaCy that spacy uses (read in `strategies/neural-dependencies/index.mjs`); default `python3`.
- `SOP_NLU_SYNTAX_MODEL`: the spaCy pipeline; default `en_core_web_sm`. The measured runs used `en_core_web_trf` ([status page](../STATUS.md#speed-and-cost-per-strategy)).
- `SOP_NLU_DISTILBERT_MODEL`: the DistilBERT checkpoint; without it, the one `retrain.mjs` installed under `.local-models/distilbert/syntax-v1`. A checkpoint trained on the older nlu annotations is refused.
- `SOP_NLU_DISTILBERT_PYTHON`: the Python for DistilBERT; default `python3`.
- `SOP_NLU_DISTILBERT_DEVICE`: the device for DistilBERT; default `auto`.
- `SWIPL`: the SWI-Prolog program for prolog; without it, `swipl` on the path, else a copy in the sibling folder `prolog-formaliser/tools/swipl`.
- `SOP_KNOWLEDGE_DIR`: in the library, read only on the legacy path of the reader; some tools of the nlu period read it too. `run.mjs` removes it, and drops a `knowledgeDir` option, before a strategy loads.

Next: [Benchmark tools: sample, run, judge, table](run-tools.md) · Up: [Reference](README.md)
