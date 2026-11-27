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

It reads the `text` column of every CSV file under `semantic/` of the dataset as committed, keeps each distinct text once, puts the texts in a random order fixed by the seed, and takes the first share of them that stand in no excluded sample. The files under `syntactic/` hold the same messages and are never read as a source. Beside the sample it writes a `.lock.json` with the seed, the share, the dataset commit and the count. The same seed, share, commit and exclusions give the same sample. An existing sample file is never replaced by another one.

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

## A conversion round

The dataset keeps its messages in `webmeet-dataset/semantic/<tab>/<file>.csv`. A conversion round gives one or more of these files their counterpart in `webmeet-dataset/syntactic/`, with the syntax circuit of every message. The round is also a test of the formalizers: its report has the same table of levels. Testing and converting are one activity.

`round.mjs` has one sub-command for each step. `<round>` is a new folder under `eval-results/`.

**0. See what the next rounds would take.** This writes nothing.

```sh
node tests/benchmark/syntax/round.mjs plan --rounds 3
```

**1. Start the round.**

```sh
node tests/benchmark/syntax/round.mjs start <round> [--min-messages 500] [--order size|name] [--files drawing/style-01.csv,…]
```

It takes the next source file that has no syntactic file and belongs to no round in progress: the file with the fewest messages first, or the first by name with `--order name`. A round that caught a small file takes another one, until it has at least 500 messages. `--files` names the files instead. The source files are read as they are on disk. It writes `files.json` and `sample.json`: every distinct text of a file once, in the order of the file, with the id `<tab>/<file>#<record number>`.

**2. Run the formalizers** on the sample of the round, as in any benchmark.

```sh
node tests/benchmark/syntax/run.mjs <round> --sample <round>/sample.json
```

**3. Settle what needs no judge, and prepare the rest for the judge.**

```sh
node tests/benchmark/syntax/round.mjs settle <round> [--audit 0.05]
```

For every message the circuits of the formalizers are grouped by their core.

- A circuit that the registry already holds keeps its verdict, accepted or rejected.
- A circuit that formalizers of at least three different families wrote alike is settled by agreement: it counts as accepted, and no judge reads it (`settle --families <n>` changes the number). A family is the source of the analysis, declared in `strategies.mjs`: vss; parser (spacy-direct, spacy-beam, neural-dependencies, and also neuro-prolog, neuro-z3, neuro-selector and selector-distilbert, which read the same dependency parse or choose among circuits written from it); prolog (prolog, prolog-example-transfer); z3; distilbert. Formalizers of one family read a message from the same source, so their agreement settles nothing. Three families, not two: on the first judged sample a judge rejected 14 of 39 circuits that only VSS and Prolog wrote alike, and 3 of 427 that three or four of the earlier families wrote alike.
- Every other circuit goes into `judging/packet-<k>.jsonl`, as in a benchmark.
- A random share of the agreed circuits, 5% unless `--audit` says otherwise, goes to the judge as well. The judge does not see which they are. Their verdicts show how often agreement is right. When the judge rejects such a circuit, the judge's word counts.

It writes `settle.json` with the counts and `key/agreement.jsonl` with the agreed circuits. Judges then work as in step 3 of a benchmark.

**4. Have the missing circuits written.**

```sh
node tests/benchmark/syntax/round.mjs rewrite-prepare <round>
```

A message whose circuits were all rejected, or for which no formalizer wrote a valid circuit, has no accepted circuit. These messages go into `rewriting/packet-<k>.jsonl`, each with its rejected circuits and the judge's reasons. A judge reads `rewriting/REWRITE.md`, writes the correct circuit of each message into `rewriting/written-<k>.jsonl` as lines `{"n", "sop"}`, and runs `node check.mjs <k>` in that folder. The checker tests every written circuit against the schema and the message and says in words what to correct. A message that still has a circuit waiting for a judge is left out; call the command again after the judging.

**5. Write the syntactic files.**

```sh
node tests/benchmark/syntax/round.mjs write <round> --tag <name> --judge <model>
```

It publishes into the registry file `<tag>.jsonl`:

| What | `verdict` | `judge` | `source` |
| --- | --- | --- | --- |
| A circuit the judge read | accepted or rejected | the model | the formalizers that wrote it |
| A circuit settled by agreement that no judge read | accepted | `agreement` | the formalizers that wrote it |
| A circuit the judge wrote | accepted | the model | `judge` |

Every circuit accepted in the round becomes the label of its message, as `judge-publish.mjs` does. Then each syntactic file of the round is written: every message of the source file once, in order, with the columns `text`, `sop`, `source` and `accepted_by` (`agreement`, `judge` or `written`). The circuit of a message is its label. A message that has no label takes the accepted circuit most formalizers wrote.

The command writes nothing at all, and lists the messages, while a message of the round has no circuit. `--allow-open` writes the files with empty cells for those messages. An existing syntactic file is never written again.

**6. Report.**

```sh
node tests/benchmark/syntax/round.mjs report <round>
```

It can be called at any time. It says how the messages of the round are settled (by agreement, accepted by a judge, written by a judge, still open), how many of the agreed circuits sent to the judge were accepted, and gives the table of levels per formalizer. A circuit settled by agreement counts as accepted for the formalizers that wrote it: L8, or L9 or L10 against the label the message had before the round.

## The labels

A label is the accepted circuit of a message. `labels.jsonl` has one line per message: `{"text", "label", "core", "run", "source", "previous"}`. `label` is the circuit in normal form, `run` the tag that set it, `source` the strategies that wrote it, and `previous` the core of the label it replaced, or null.

`judge-publish.mjs` sets the labels, and `round.mjs write` does for a conversion round. A message has one label. When several circuits of one message were accepted in one run, the label is the one most strategies wrote, and among equals the first by its number in the packets. The other accepted circuits stay accepted in the registry.

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

A conversion round adds:

| File | Written by | Content |
| --- | --- | --- |
| `files.json`, `sample.json` | `round.mjs start` | The source files of the round and their messages. |
| `settle.json`, `key/agreement.jsonl` | `round.mjs settle` | The counts, and the circuits settled by agreement. |
| `rewriting/packet-<k>.jsonl`, `REWRITE.md`, `RULES.md`, `check.mjs` | `round.mjs rewrite-prepare` | What a judge needs to write the missing circuits. |
| `rewriting/written-<k>.jsonl` | a judge | The written circuits. |
| `key/rewrite-items.jsonl` | `round.mjs rewrite-prepare` | The messages sent for writing. |
| `written.json` | `round.mjs write` | What was published and which syntactic files were written. |
| `report.md`, `report.json` | `round.mjs report` | How the messages were settled, and the levels. |

`judge-prepare.mjs` can be called again after more strategies were run into the same folder: the numbers already given stay, and new circuits go into new packets.

For a trial, `--registry <folder>` makes `judge-prepare.mjs`, `judge-publish.mjs`, `table.mjs` and `agree.mjs` use another registry. The labels file is then `labels.jsonl` beside that folder, so a trial never writes into the dataset.

## Reference circuits from the `nlu` schema

Before this schema, judges accepted and rejected circuits written in the `nlu` schema. `convert-nlu.mjs` rewrites the accepted ones into `syntax` circuits, by the table "How it relates to the `nlu` schema" of `docs/syntax-schema.md`, into `webmeet-dataset/annotations/syntax/v1/reference/reference-nlu-v1.jsonl`. It rewrites a circuit only when the rules settle every word, and reports the others with the reason. It is the one tool that uses the old checker and the knowledge repository, to find the position of each quoted value. No strategy may depend on it.

No judge has read these circuits in the `syntax` schema. They are not in the registry, they are no labels, and no level counts them. The file is kept for comparison.

## Tests

```sh
env -u SOP_KNOWLEDGE_DIR node --test tests/syntax-benchmark.test.mjs
```
