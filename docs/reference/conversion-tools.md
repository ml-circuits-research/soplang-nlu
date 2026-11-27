[Home](../README.md) › [Reference](README.md) › Conversion tools

# Conversion tools

This page: `round.mjs`, the tool of conversion rounds, and the check of written circuits, with all their options. The batch scripts and the dataset's `layers.mjs` are on [Batch and dataset tools](batch-tools.md). Kind: Reference.

Why and how the dataset is converted: [Converting the dataset](../evaluation/conversion.md). Step by step: [Run a conversion round](../guides/conversion-round.md) and [Convert or refill the dataset in batch](../guides/batch-conversion.md). Terms: [Glossary](glossary.md#project-terms).

**Standard, New here, Particular.** Reading a random sample of accepted items as a control is standard [acceptance sampling](https://en.wikipedia.org/wiki/Acceptance_sampling). New here: the round, which converts files and measures the strategies in one pass. Particular: the defaults chosen for this dataset. Why the batch reads an audit share of 0.02 and packets of 170 lines, against 0.05 and 200 in a round, is not recorded.

## round.mjs

```sh
node tests/benchmark/syntax/round.mjs <command> <round> [options]
```

`<round>` is a new folder under `eval-results/`. The commands, in order: `plan`, `start`, then `run.mjs`, `settle`, `rewrite-prepare`, `write`, `report`. Every command takes:

| Option | Meaning |
| --- | --- |
| `--dataset` | the dataset; default the one in the round's `files.json`, else `../webmeet-dataset` beside the package |
| `--registry` | another registry; default `<dataset>/annotations/syntax/v1/judged` |

Source files are read as they are on disk, not from git.

### plan

Shows which files the next rounds would take. It writes nothing and takes no `<round>`.

| Option | Meaning |
| --- | --- |
| `--rounds` | how many rounds to show; default 3 |
| `--min-messages` | the size of a round; default 500 |
| `--order` | `size` (fewest messages first; the default) or `name` |
| `--rounds-dir` | where rounds in progress are looked for; default `eval-results` |

### start

Takes the next source files that have no syntactic file and belong to no round in progress.

| Option | Meaning |
| --- | --- |
| `--min-messages` | add files until the round has this many messages; default 500 |
| `--order` | `size` (the default) or `name` |
| `--files` | `drawing/style-01.csv,…`: exactly these files |

- It writes `files.json`, with a sha256 of each source, and `sample.json`: each distinct non-empty text once, with the id `<tab>/<file>#<record>`.
- It refuses a folder that is a round already, and a file that has a syntactic file.
- Since the batch conversion every source file has a syntactic file, so `plan` and `start` find no file; work goes on through the existing folders.

Next the strategies run on the round: `run.mjs <round> --sample <round>/sample.json` ([Benchmark tools](run-tools.md#runmjs)).

### settle

Settles what needs no judge, and prepares the rest for a judge.

| Option | Meaning |
| --- | --- |
| `--families` | how many different families must write a circuit alike; default 3 |
| `--key` | what "alike" means: `core` (the default), `relaxed` or `variants` |
| `--relaxed` | the same as `--key relaxed`; still accepted |
| `--prefer` | `vss,…`: under `relaxed` or `variants`, the circuit of the first of these stands for the group and becomes the label |
| `--judge` | `all` (the default): every circuit not yet decided. `needed`: per open message, only the circuit with the most families, then the next after a rejection. `audit`: only the audit share and `--focus` |
| `--focus` | `vss,…`: the circuits of these strategies always go to a judge |
| `--audit` | the share of agreed circuits a judge reads; default 0.05 |
| `--seed` | the seed of the audit choice; default the round folder's name |
| `--size` | lines per packet; default 200 |
| `--strategies` | another strategies file, whose families are used |

- A circuit the registry holds keeps its verdict; a circuit equal to the label is accepted already; a circuit enough families wrote alike is settled by agreement.
- It writes `settle.json` (the counts and the key), `key/agreement.jsonl` (the agreed circuits, each with an `audit` flag), packets as in a benchmark, and the first time `key/labels-before.jsonl`.
- What an earlier call settled by agreement stays settled, also when the strategy files have changed since.

### rewrite-prepare

Prepares packets of the messages with no accepted circuit, for a judge who writes the circuit (a fixer).

| Option | Meaning |
| --- | --- |
| `--size` | messages per packet; default 100 |
| `--now` | take also messages that still have a circuit waiting for a judge |

- It writes `rewriting/packet-<k>.jsonl`, one line `{n, text, rejected: [{sop, note}]}` per message, with `REWRITE.md`, `RULES.md` and `check.mjs`, and `key/rewrite-items.jsonl`.
- `--now` is needed after `settle --judge needed`, which never sends the other strategies' circuits to a judge.

### write

Publishes what a judge decided, then writes the syntactic files.

| Option | Meaning |
| --- | --- |
| `--tag` | required; letters, digits, `.`, `_` and `-`; names the registry file `<tag>.jsonl` |
| `--judge` | the model; default `unknown`, with no warning |
| `--allow-open` | write empty cells for messages that have no circuit |

- Registry: each circuit a judge read, also an audited agreed one, and each circuit a judge wrote. An agreed circuit no judge read gets no line. When no judge decided anything, no file is written.
- Syntactic files: every message of the source once, in order, with the columns `text`, `sop`, `source`, `accepted_by`. The circuit is the label if it is accepted, else the accepted circuit most strategies wrote.
- Without `--allow-open` it writes nothing, and lists the messages, while any message of a new file has no circuit.
- An existing file with the same messages in the same order is completed: its empty cells are filled, and a cell that holds a circuit stays as it is. A file with other messages or another order is left alone. This is the rule since commit `9b2831e`; the evaluation report describes the earlier one.
- It writes `written.json`. It refuses an existing tag, and any verdict file or written file with a problem.

### report

Says how the messages of the round are settled, how many audited agreed circuits a judge accepted, and gives the table of levels. It writes `report.md` and `report.json`, and can run at any time: the report is a snapshot of that moment.

## rewrite-check.mjs and rewrite.md

- `rewrite.md` holds the instructions for the judge who writes circuits. `rewrite-prepare` writes it into the round as `rewriting/REWRITE.md`, with the paths of `schemas/syntax/schema.sop` and of the specification (`docs/syntax-schema.md`) filled in.
- The written lines are `{"n", "sop"}` in `rewriting/written-<k>.jsonl`.
- `node check.mjs <k>` in that folder calls `rewrite-check.mjs`. It checks each circuit against the schema and the message with `validateSyntax`, and says in words what to correct. It also refuses a circuit equal to one already rejected for that message. A line with a problem does not count.

---

Next: [Batch and dataset tools](batch-tools.md) · Up: [Reference](README.md)
