[Home](../README.md) › [Reference](README.md) › Benchmark tools: agreement, conversion of old circuits, the library

# Benchmark tools: agreement, conversion of old circuits, the library

This page: the analysis tools of `tests/benchmark/syntax/`, and the key functions of its `lib.mjs` and `strategies.mjs`. Kind: Reference.

What agreement means and why it is trusted: [Agreement between formalizers](../evaluation/agreement.md). How two circuits are compared: [When two circuits are the same](../evaluation/normal-form.md). Levels: [Levels L0–L10 and GOAL](../evaluation/levels.md). Terms: [Glossary](glossary.md#project-terms).

**Standard, New here, Particular.** Comparing outputs by exact match after a [canonical form](https://en.wikipedia.org/wiki/Canonical_form) is standard. New here: the agreement keys `relaxed` and `variants`, which follow what the judges' rules let pass either way. Particular: the families, as declared for this project's strategies.

## The tools

### agree.mjs

Says how often the strategies of a run write the same circuit.

```sh
node tests/benchmark/syntax/agree.mjs <run-folder> [--registry <f>]
```

| Option | Meaning |
| --- | --- |
| `--registry` | another registry, for a trial |

- For every message it groups the strategies by the core of their circuit. It reports how often all of them agree, how often more than half agree, and for each pair the share of messages with the same circuit.
- Where a judge has read the shared circuit, in this run or in the registry, it says how often the judge accepted it. Only a judge's verdict counts here: neither a circuit settled by agreement nor a registry line with judge `agreement`.
- It writes `agreement.md` and `agreement.json` in the run folder.

### agreed.mjs

Lists the circuits that given strategies wrote alike, across any number of run folders.

```sh
node tests/benchmark/syntax/agreed.mjs <out.jsonl> \
  --strategies a,b [--key core] <run-folder…>
```

| Option | Meaning |
| --- | --- |
| `<out.jsonl>` | the output: one line `{text, sop, folder}` per message |
| `--strategies` | two or more names; required |
| `--key` | `core` (the default), `relaxed` or `variants` |
| `<run-folder…>` | folders with `<strategy>.jsonl` files, as `run.mjs` writes them |

- Every named strategy must write a circuit alike to the first strategy's. The line holds the first strategy's circuit, in normal form.
- A folder that lacks the file of one of the strategies is left out.
- No judge is involved: such a line is agreement, not a verdict.

### convert-nlu.mjs

Rewrites the circuits of the older nlu schema that judges accepted into syntax circuits, for comparison only.

```sh
node tests/benchmark/syntax/convert-nlu.mjs [options]
```

| Option | Meaning |
| --- | --- |
| `--out` | the output; default `webmeet-dataset/annotations/syntax/v1/reference/reference-nlu-v1.jsonl` |
| `--nlu` | the folder of judged nlu circuits; default `webmeet-dataset/annotations/nlu/v1/judged` |
| `--knowledge` | the knowledge repository; default `../sop-knowledge-worlds` |
| `--report` | a file for the circuits not converted, with the reason |
| `--dry` | do not write the output (a `--report` file is still written) |

- It follows the table of [From the nlu schema](../schema/nlu-mapping.md), and rewrites a circuit only when the rules settle every word.
- It is the one tool here that uses the old checker and, through it, the knowledge repository. No formalizer may depend on its output.
- Its lines `{text, sop, core, source: "reference", nlu}` are no labels and are not in the registry, and no level counts them. An existing output file is written again.

### drop-duplicates.mjs

Removes from the dataset what its syntactic files already hold.

```sh
node tests/benchmark/syntax/drop-duplicates.mjs [--apply]
```

| Option | Meaning |
| --- | --- |
| `--dataset` | the dataset; default `../webmeet-dataset` beside the package |
| `--apply` | change the files; without it, only report |
| `--report` | a file for the report |

With `--apply`:

- It removes `annotations/syntax/v1/labels.jsonl` when every line of it is the label of its message in the syntactic files.
- It removes a registry line with judge `agreement` when the message's cell holds that circuit with `accepted_by` agreement, or holds any circuit with `accepted_by` judge or written. A registry file left with no line is removed.
- It never changes a syntactic file.

> **Warning: do not run it with `--apply` now.** By the second rule it would remove every line of `2026-11-27-benchmark-random-replaced-agreement.jsonl`, and so delete that file, which keeps the replaced agreement labels as accepted readings. The evaluation report found this in a run without `--apply` ([The full reports](../project/reports.md)).

## lib.mjs: key functions

| Function | What it does |
| --- | --- |
| `normalForm` | `(text, sop)` gives `{sop, core}`: the normal form and its core; null for an invalid circuit |
| `levelOf` | the level of one circuit, decided in this order: L0 without a valid circuit; L9 if equal to the label before the run; a verdict of the run (L10 when the message had a label before); the registry; equal to the label of now (L8); else waiting |
| `tableOf` | the table of a run: per strategy, every level, waiting, GOAL, `atMost` (GOAL if every waiting circuit were accepted), and the accepted circuits with `attachment=ambiguous` |
| `chooseLabels` | one label per message among the circuits accepted in a run: the one most strategies wrote, then the lowest item number |
| `agreedCircuits` | the circuits that enough families wrote alike under a key. The library default is two families; `round.mjs settle` asks for three |
| `relaxedCore` | the core without the start of every relation that has a marker, and without its `attachment=ambiguous` line |
| `agreementKey` | the circuit rewritten one way for each choice that `rules.md` lets pass either way, then its core with the starts left out |
| `chooseAudit` | a seeded random share of the agreed circuits, ordered by a sha256 of the seed, the message and the core |
| `readLabels` | the labels from the syntactic files; a core is computed only when it is asked for |
| `writeLabels` | writes labels into the syntactic files, changing only the cells of those rows |
| `keepLabelsBefore` | writes `key/labels-before.jsonl` once: the first time a run is prepared, settled or published |
| `readLabelsBefore` | reads that file, in either of its two formats; a run without it gets the labels of now |
| `checkVerdicts` | in `check.mjs` (`lib.mjs` reads verdicts through its `checkPacket`): checks the verdict lines of one packet; a line with a wrong grade, no note or an unquoted rejection does not count |

Constants of `lib.mjs`: `LEVELS` (L0 to L10), `GRADES` (L8, L1 to L6), `GOAL_LEVELS` (L8, L9, L10), `AGREEMENT_KEYS` (core, relaxed, variants), and the default places `packageRoot`, `sampleFile`, `defaultRegistryDir`, `defaultSyntacticDir`. Default paths are resolved from the `soplang-nlu` folder, not from the working directory.

## strategies.mjs

| Name | What it is |
| --- | --- |
| `strategyModules` | the five strategies that take part: hmm-rules, spacy, distilbert, prolog, z3, each as `[module path, export name]` |
| `strategyStatus` | the status of each: `active` (spacy) or `experimental` (the four others) |
| `retiredModules` | the eight left out of rounds and benchmark; they still run with `run.mjs --only` |
| `families` | the family of each strategy (below) |
| `familyFinder` | gives the family of a name, old names included; a name no family lists is a family of its own |

The families:

- `hmm-rules`: hmm-rules.
- `parser`: spacy, spacy-direct, spacy-beam, neural-dependencies, neuro-prolog, neuro-z3, neuro-selector, selector-distilbert. They read the spaCy dependency parse, or choose among circuits written from it.
- `prolog`: prolog, prolog-worlds, prolog-example-transfer. `prolog-worlds` is a name kept for an older strategy; it has no module and no folder.
- `z3`: z3.
- `distilbert`: distilbert.

**Old names.** `strategyAliases` in `lib.mjs` maps an old name of a strategy to its name now: `{vss: 'hmm-rules'}`. Every reader of earlier files uses it (`strategyName`): `readOutputs` reads a `vss.jsonl` as hmm-rules unless the folder also holds `hmm-rules.jsonl`; the family of a name, and the sources of registry lines and labels, are looked up by the name now. So the tables and the agreement of old run folders come out unchanged.

Next: [Conversion tools](conversion-tools.md) · Up: [Reference](README.md)
