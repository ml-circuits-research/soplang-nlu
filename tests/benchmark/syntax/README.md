# The benchmark of the `syntax` schema

A formalization strategy reads one English message and writes one circuit in the `syntax` schema (`docs/syntax-schema.md`). This benchmark runs every strategy over one sample of messages and says, for each strategy, how many of its circuits are acceptable.

A circuit is acceptable when a judge, a language model that follows `rules.md`, says so. A judge is slow and costs money, so every verdict is kept in the dataset:

- the **registry** `webmeet-dataset/annotations/syntax/v1/judged/` holds every circuit a judge accepted or rejected;
- the **labels** file `webmeet-dataset/annotations/syntax/v1/labels.jsonl` holds, for each message, the accepted circuit that is its label.

A circuit that the registry already holds needs no judge again.

All commands are run from the folder `soplang-nlu`. No tool here reads the knowledge repository or the `nlu` schema, except `convert-nlu.mjs`.

## The sample

A sample is a gzipped JSON array of `{id, text}`. Only the `id` and the `text` of a message are read.

| Sample | Messages | Use |
| --- | ---: | --- |
| `eval-results/2026-11-26-fresh-locked-one-percent/sample.json.gz` | 1,831 | The earlier fixed sample, 1% of the dataset. `run.mjs` takes it when no `--sample` is given. Strategies were tuned on it on 2026-11-27. |
| `eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz` | 1,831 | A fresh 1%, drawn with the seed "syntax-2026-11-27". It shares no message with the fixed sample. |

`sample.mjs` draws a new sample:

```sh
node tests/benchmark/syntax/sample.mjs eval-results/<folder>/sample.json.gz --share 0.01 --seed <text> \
  --exclude eval-results/2026-11-26-fresh-locked-one-percent/sample.json.gz eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz
```

It reads the `text` column of every CSV file of the dataset as committed, keeps each distinct text once, puts the texts in a random order fixed by the seed, and takes the first share of them that stand in no excluded sample. Beside the sample it writes a `.lock.json` with the seed, the share, the dataset commit and the count. The same seed, share, commit and exclusions give the same sample. An existing sample file is never replaced by another one.

## One benchmark, from start to table

Choose a new run folder under `eval-results/`, for example `eval-results/2026-11-27-syntax-benchmark-a`. The steps below write only into that folder, until step 4 publishes the verdicts.

**1. Run the strategies.**

```sh
node tests/benchmark/syntax/run.mjs eval-results/2026-11-27-syntax-benchmark-a --sample eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz
```

Every strategy of `strategies.mjs` whose exported object declares `schema: 'syntax'` is run over the sample through the common reader `createReader({strategy})`, with no knowledge directory. A strategy without that declaration is reported as "not ported". Each strategy runs in a process of its own: when it throws, ends or hangs on a message, that message gets an error and the run goes on.

| Option | Use |
| --- | --- |
| `--sample <file>` | The sample to run. Without it, the earlier fixed sample. |
| `--only vss,z3` | Run these strategies only. The entries of the other strategies in `summary.json` stay as they are. |
| `--limit 50` | Take the first 50 messages only, for a quick trial. |
| `--reuse <folder>` | When `<folder>/<strategy>.jsonl` exists, take it instead of running the strategy. Every circuit of the file is checked again. |
| `--timeout 120` | Seconds a strategy may take for one message. |
| `--jobs 3` | Run three strategies at the same time. The times per message are then less exact. |
| `--options <file>` | A JSON file `{"<strategy>": {…}}` with what a strategy needs to open, such as the path of its model. A strategy also sees the environment variables it documents. |

**2. Prepare the packets for the judge.**

```sh
node tests/benchmark/syntax/judge-prepare.mjs eval-results/2026-11-27-syntax-benchmark-a --size 200
```

Every circuit is looked up in the registry. The circuits that the registry does not hold are written once each into `judging/packet-<k>.jsonl`, 200 to a packet, however many strategies wrote them. A packet line holds a number, the message and the circuit. It does not say which strategy wrote the circuit. The labels of this moment are copied into the run folder, as the labels before the run.

**3. Judge.** A judge reads `judging/RULES.md` and one packet, and writes `judging/verdicts-<k>.jsonl`: one line `{"n", "grade", "note"}` for each packet line. The grade is L8 for an acceptable circuit, or L1 to L6 for a rejected one. A rejection quotes the words of the message in single quotes. The judge then checks the file:

```sh
node eval-results/2026-11-27-syntax-benchmark-a/judging/check.mjs 3
```

It reports format problems and how many lines are judged. A line with a format problem does not count until it is corrected. The benchmark tools do not start judges.

**4. Publish the verdicts into the dataset.**

```sh
node tests/benchmark/syntax/judge-publish.mjs eval-results/2026-11-27-syntax-benchmark-a --tag 2026-11-27-syntax-benchmark-a --judge <model>
```

This writes one new file `<tag>.jsonl` into the registry; an existing file is never overwritten. It also updates the labels: every circuit accepted in this run becomes the label of its message, whatever label the message had before. Nothing is committed: committing the dataset is a separate decision.

**5. Print the table.**

```sh
node tests/benchmark/syntax/table.mjs eval-results/2026-11-27-syntax-benchmark-a
node tests/benchmark/syntax/agree.mjs eval-results/2026-11-27-syntax-benchmark-a
```

`table.mjs` can be called at any time, also before any judge has worked: the circuits not yet judged stand in the column "waiting".

## The labels

A label is the accepted circuit of a message. `labels.jsonl` has one line per message: `{"text", "label", "core", "run", "source", "previous"}`. `label` is the circuit in normal form, `run` the tag that set it, `source` the strategies that wrote it, and `previous` the core of the label it replaced, or null.

`judge-publish.mjs` sets the labels. A message has one label. When a judge accepted several circuits of one message in one run, the label is the one most strategies wrote, and among equals the first by its number in the packets. The other accepted circuits stay accepted in the registry.

## The table

One row per strategy. Each message is at one level.

| Level | Meaning |
| --- | --- |
| L0 | The strategy returned no valid circuit. |
| L1 to L6 | The circuit is rejected, by a judge of this run or already in the registry. The level is the judge's grade: L1 a wrong clause, L2 a word with content held as a discourse word, L3 words in the wrong wire or a wrong tie, L4 a statement the message does not make, L5 a missing clause, L6 something left untied. `rules.md` defines them. |
| L7 | Unused. In the earlier legend it meant one good and one bad circuit; a strategy now returns one circuit. |
| L8 | The circuit is accepted and is not the label the message had. Either a judge accepted it in this run and the message had no label, or the registry already held it as accepted, so no judge was needed. |
| L9 | The circuit is equal to the label the message had before the run. No judge was needed. |
| L10 | A judge accepted the circuit in this run and the message had another label before. The label is replaced. |
| waiting | No judge has read the circuit yet. |

"Before the run" means the labels as `judge-prepare.mjs` found them the first time it was called for the run. They are kept in `key/labels-before.jsonl`, so the table of a run does not change when later runs replace labels.

**GOAL** is the share of all messages at L8, L9 or L10. A waiting message is not counted in GOAL, so GOAL can only rise while circuits wait. Below the table stands, per strategy, how many accepted circuits leave an attachment open with `attachment=ambiguous`.

`agree.mjs` groups, for every message, the strategies by their circuit. It reports how often all strategies wrote the same circuit, how often more than half did, and the same for each pair. Where the shared circuit has a verdict, it says how often that verdict is "accepted". This figure shows whether agreement between strategies can later stand in for a judge.

## When two circuits are the same

Two circuits of one message are the same when their core is equal. The core comes from `coreOf` of `lib/syntax.mjs`, applied to the normal form of the circuit.

The normal form (`normalForm` in `lib.mjs`) is needed for two reasons. The judge must not see who wrote a circuit, and wire names such as `@x1` would tell. And `coreOf` alone tells apart circuits that say the same: `marker="next to"` against `marker="next" marker="to"`, and `from=$a to=$b` against `to=$b from=$a`. In the normal form:

- wires are named `c`, `n`, `r`, `k` with a number, in the order of their first word;
- `dependent`, `modifier`, `auxiliary`, `negation` and `discourse` hold one word per value;
- `marker` and `conjunction` hold neighbouring words as one value;
- a clause lists its subject, then its complements; a relation `from`, then `to`.

The packets, the registry and the labels hold circuits in this form.

## The files of a run folder

| File | Written by | Content |
| --- | --- | --- |
| `<strategy>.jsonl` | `run.mjs` | One line per message: `{"id", "text", "sop", "error", "ms"}`. `sop` is the circuit or null. `error` starts with its kind: `invalid circuit`, `no circuit`, `crash` or `timeout`. |
| `summary.json` | `run.mjs` | The sample, and per strategy: status, messages, valid circuits, errors by kind, median milliseconds per message. |
| `logs/<strategy>.log` | `run.mjs` | What the strategy printed. |
| `judging/packet-<k>.jsonl`, `RULES.md`, `check.mjs` | `judge-prepare.mjs` | What a judge needs. |
| `judging/verdicts-<k>.jsonl` | a judge | The verdicts. |
| `key/items.jsonl` | `judge-prepare.mjs` | Which strategies wrote circuit `n`. Not for the judge. |
| `key/labels-before.jsonl` | `judge-prepare.mjs` | The labels as they were before the run. |
| `table.md`, `table.json` | `table.mjs` | The levels. |
| `agreement.md`, `agreement.json` | `agree.mjs` | The agreement between strategies. |

`judge-prepare.mjs` can be called again after more strategies were run into the same folder: the numbers already given stay, and new circuits go into new packets.

For a trial, `--registry <folder>` makes `judge-prepare.mjs`, `judge-publish.mjs`, `table.mjs` and `agree.mjs` use another registry. The labels file is then `labels.jsonl` beside that folder, so a trial never writes into the dataset.

## Reference circuits from the `nlu` schema

Before this schema, judges accepted and rejected circuits written in the `nlu` schema. `convert-nlu.mjs` rewrites the accepted ones into `syntax` circuits, by the table "How it relates to the `nlu` schema" of `docs/syntax-schema.md`, into `webmeet-dataset/annotations/syntax/v1/reference/reference-nlu-v1.jsonl`. It rewrites a circuit only when the rules settle every word, and reports the others with the reason. It is the one tool that uses the old checker and the knowledge repository, to find the position of each quoted value. No strategy may depend on it.

No judge has read these circuits in the `syntax` schema. They are not in the registry, they are no labels, and no level counts them. The file is kept for comparison.

## Tests

```sh
env -u SOP_KNOWLEDGE_DIR node --test tests/syntax-benchmark.test.mjs
```
