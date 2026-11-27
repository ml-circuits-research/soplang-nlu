[Home](../README.md) › [Reference](README.md) › Folders and repositories

# Folders and repositories

This page: a map of this repository's folders, of the files of the VSS folder and of the status files, and the sibling repositories. Kind: Reference.

Where data and run outputs are stored, file by file: [Where everything is stored](storage.md).

## This repository

| Folder | What it holds |
| --- | --- |
| `lib/` | the common reader and the checker of the syntax schema ([Library API](library.md)) |
| `schemas/syntax/` | `schema.sop`: the syntax schema, version 3 |
| `schemas/nlu/` | the earlier nlu schema, with more than 50 keys |
| `strategies/` | one folder per formalizer ([below](#strategies)) |
| `tests/` | the tests; `npm test` runs `tests/*.test.mjs` |
| `eval-results/` | every run and round, with its sample, outputs and verdicts, so that each number can be checked again |
| `experiments/` | measured prototypes: `syntax-learned/` (two learned methods, not adopted) and older ones |
| `docs/` | this documentation ([below](#docs)) |
| `worlds/` | `en.valency/`: English verb frames imported from WordNet 3.1 |
| `.local-models/` | trained models, kept out of git, such as the DistilBERT checkpoints |

In `lib/`:

- `index.mjs`: the exports of the package.
- `reader.mjs`: `createReader`, the common reader.
- `syntax.mjs`: the syntax contract: `wordsOf`, `parseCircuit`, `validateSyntax`, `writeCircuit`, `coreOf`.
- `measure-strategy.mjs`: `measureStrategy`, for speed.
- `check-analysis.mjs`, `compare-alternatives.mjs`: the old checker and comparison of the nlu-schema period.
- `directed-graph.mjs`: a comparison of circuits of the nlu schema, imported by older tools and experiments.
- `verb-frames.mjs`: reads the verb frames of `worlds/en.valency`; the prolog and z3 strategies import it.

In `tests/`: `tests/benchmark/syntax/` holds the evaluation and labelling tools ([Benchmark tools](run-tools.md), [Conversion tools](conversion-tools.md)). The other files of `tests/benchmark/` are older evaluation tools; `npm run benchmark` runs one of them, `port-run.mjs`.

In `experiments/`: `syntax-learned/` with its README, and the older prototypes `distilbert/`, `native-curation/`, `native-teacher/`, `proposal-selection/`, `sequence-graph/` and `spacy-adaptation/`.

## Strategies

Active, worked on:

- `vss/`: the project's own reader, the main focus ([below](#the-vss-folder)).
- `spacy/`: the spaCy dependency parse written as a circuit. It is spacy-beam under one name; its code stays in `spacy-beam/` (the beam), `spacy-direct/` (the repairs) and `neural-dependencies/` (the Python transport and the circuit writer).
- `distilbert/`: DistilBERT fine-tuned on syntax circuits; `retrain.mjs` trains it.

Parked, still measured:

- `prolog/`: a hand-written grammar in SWI-Prolog.
- `z3/`: a hand-written grammar written as constraints and solved by the Z3 solver; it has its own `package.json` and `node_modules/`.

Retired: left out of rounds and benchmark, and still run by name with `run.mjs --only`:

- `spacy-beam/`: the parse with repairs and the parser's beam; now `spacy`.
- `spacy-direct/`: the parse with repairs, no beam; spacy uses its repair files.
- `neural-dependencies/`: the parse written as it stands; spacy uses its transport and writer.
- `neuro-selector/`: four parse-based strategies each write a circuit, and a fitted ranker returns the best one.
- `selector-distilbert/`: the circuit of neuro-selector, read against the circuit of distilbert.
- `neuro-prolog/`: a Prolog program that turns the spaCy parse into a circuit; the grammar of `prolog` takes no part.
- `neuro-z3/`: the Z3 model of `z3`, with the parser's word classes, nominals and attachments as weighted evidence.
- `prolog-example-transfer/`: the Prolog grammar plus patterns learned from labelled examples.

In design:

- `strict-vss/`: a reader whose analysis goes through a vector-symbolic sentence state. `DESIGN.md` (first draft in commit `f5be34c`, revised the same day) and the first measurements in `m0/`; nothing is trained yet.

Each one: [Formalizers](../formalizers/README.md) and [Retired formalizers](../formalizers/retired.md).

## The VSS folder

`strategies/vss/`, grouped by use as at commit `fa46cb7`. A file marked T runs during training: a change to it changes the model, so the model must be retrained ([Retrain the VSS model](../guides/retrain-vss.md)). A file marked R is used only to read. Later commits changed the contents of several files but added or removed none. Terms such as HMM, EM, Viterbi and chunker: [Glossary](glossary.md#nlp-and-statistics).

Training (T):

- `train.mjs`: the training driver; it writes `model/model.json`.
- `legend.sop`: the legend; copied into the model.
- `src/corpus.mjs`: reads the distinct message texts of the dataset.
- `src/variants.mjs`: spelling variants, by edit distance and vector likeness.
- `src/anchors.mjs`: counts of each word in frames fixed by function words (verb, thing, quality).
- `src/habits.mjs`: the habits of words, counted on the text as the trained HMM reads it; its attachment score is also used in reading.

Reading (R):

- `index.mjs`: the strategy object `vss` (`schema: 'syntax'`); it loads the model.
- `model/model.json`: the trained model, with a copy of the legend.
- `src/reader.mjs`: opens the model, builds the lexicon and the linker's context, runs the reading loop; its `openModel` also serves training.
- `src/links.mjs`: the linker: clauses, roles, relations and coordinations, as internal `nlu.*` wires.
- `src/emit-syntax.mjs`: turns the internal wires into syntax wires and calls `writeCircuit`.
- `src/emit.mjs`, `src/flags.mjs`: for nlu output only.

Both (T and R):

- `src/tokens.mjs`, `src/observe.mjs`, `src/legend.mjs`, `src/forms.mjs`, `src/occurrence.mjs`, `src/space.mjs`, `src/meaning.mjs`.
- `src/routes.mjs`: the HMM: vocabulary, training by EM, Viterbi decoding, the verb budget.
- `src/units.mjs`: the chunker: units from stations, merges, doubts.

Obsolete:

- `src/syntax.mjs`: rewrites into version 1 of the syntax schema; imported only by `judged.mjs`.
- `src/units.mjs.orig`: a copy of an earlier `units.mjs`, imported by nothing.
- `core.mjs`, `compare.mjs`, `evaluate.mjs`, `judged.mjs`, `triage.mjs`: measurement tools of the nlu period; they need the sop-knowledge-worlds checkout.
- `judging-rules.md`, `judging-rules-syntax.md`: judging rules of the nlu schema and of version 1; superseded by `tests/benchmark/syntax/rules.md`.

What each part does: [VSS in depth](../vss/README.md).

## docs

- `README.md`: the home page of this documentation, and the section folders `concepts/`, `schema/`, `formalizers/`, `evaluation/`, `vss/`, `guides/`, `reference/`, `project/`.
- The three full reports in HTML: `vss-architecture.html`, `syntax-work-2026-11-27.html`, `syntax-evaluation-and-conversion.html` ([The full reports](../project/reports.md)). GitHub shows HTML from a private repository only as source: open them from a local checkout.
- `STATUS.md` and `status.html`: the status page, generated. `STATUS.md` holds the main figures and links one page per section under `status/`; `status.html` holds everything on one page with charts (open it from a local checkout).
- `status/`: the generator, its hand-written inputs and the generated section pages ([below](#the-status-files)).
- Pointer pages: short pages kept at the old paths, so that old links still lead somewhere. Each says where its content now lives and how to read its old text from git:
  - [syntax-schema.md](../syntax-schema.md), the former single-file specification of the schema;
  - [history/nlu-schema-period.md](../history/nlu-schema-period.md), the former notes of the nlu period;
  - `strategies/`, the former strategy pages: [vss](../strategies/vss.md), [spacy](../strategies/spacy.md), [distilbert](../strategies/distilbert.md), [prolog](../strategies/prolog.md), [z3](../strategies/z3.md), [spacy-direct](../strategies/spacy-direct.md), [spacy-beam](../strategies/spacy-beam.md), [neural-dependencies](../strategies/neural-dependencies.md), [neuro-selector](../strategies/neuro-selector.md), [selector-distilbert](../strategies/selector-distilbert.md), [prolog-example-transfer](../strategies/prolog-example-transfer.md).
- `tools/`: the check of this documentation, `check-docs.mjs` (links, anchors, tables, the page template, reachability). How to run it: [Refresh the status page and check the docs](../guides/refresh-status.md).

## The status files

| File | What it is |
| --- | --- |
| `build.mjs` | the generator: `node docs/status/build.mjs` writes `docs/status.html`, `docs/STATUS.md` and the section pages from the repositories as they are |
| `now.md` | written by hand, with no scores: the latest steps and what comes next; shown under "Working on now" |
| `history.json` | written by hand: one entry per judged measurement, `{time, strategy, goal, commit, note, sample, trial?}` |
| `last-build.json` | kept by `build.mjs`: the numbers of the last build that changed, for the "Since the build of" line |
| Section pages | generated: [benchmark.md](../status/benchmark.md), [progress.md](../status/progress.md), [speed.md](../status/speed.md), [dataset.md](../status/dataset.md), [agreement.md](../status/agreement.md), [journal.md](../status/journal.md) (the journal with its wide tables as lists), [commits.md](../status/commits.md) |

The generator changes nothing else. What STATUS.md records about itself:

- in its first line, the time it was generated, the soplang-nlu commit with the number of uncommitted paths (entries of `git status`; a new folder counts once), and the webmeet-dataset commit;
- in the "Since the build of …" line, what changed since the last build;
- in its footer, how long the build took and which hand-written files it read.

## Sibling repositories

They stand beside this one, in the same parent folder; the tools find `../webmeet-dataset` from the `soplang-nlu` folder, not from the working directory.

- `webmeet-dataset/`: the data: the messages, the semantic and syntactic layers, the registry, `tools/layers.mjs`.
- `soplang-words-lib/`: SOP Lang's definition (`docs/language.md`) and the sopworld library that runs worlds.
- `sop-knowledge-worlds/`: worlds of knowledge in SOP Lang; the formalizers do not read it.
- `vsa-semantic-space/`: the earlier vector-symbolic reader whose name VSS kept ([History in brief](../project/history.md)).

Next: [Project](../project/README.md) · Up: [Reference](README.md)
