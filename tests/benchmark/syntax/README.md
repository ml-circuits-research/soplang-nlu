# The benchmark of the `syntax` schema

A formalization strategy reads one English message and writes one circuit in the `syntax` schema (`docs/syntax-schema.md`). This benchmark runs every strategy over one fixed sample of messages and says, for each strategy, how many of its circuits are acceptable.

A circuit is acceptable when a judge, a language model that follows `rules.md`, says so. A judge is slow and costs money, so every verdict is kept in a registry in the dataset. A circuit that the registry already holds needs no judge again.

All commands are run from the folder `soplang-nlu`. No tool here reads the knowledge repository or the `nlu` schema, except `convert-nlu.mjs`.

## The sample

`eval-results/2026-11-26-fresh-locked-one-percent/sample.json.gz`: 1,831 messages, 1% of the messages of `webmeet-dataset`. Only the `id` and the `text` of a message are read.

## One benchmark, from start to table

Choose a new run folder under `eval-results/`, for example `eval-results/2026-11-27-syntax-benchmark-a`. The steps below write only into that folder, until step 4 publishes the verdicts.

**1. Run the strategies.**

```sh
node tests/benchmark/syntax/run.mjs eval-results/2026-11-27-syntax-benchmark-a
```

Every strategy of `strategies.mjs` whose exported object declares `schema: 'syntax'` is run over the sample through the common reader `createReader({strategy})`, with no knowledge directory. A strategy without that declaration is reported as "not ported". Each strategy runs in a process of its own: when it throws, ends or hangs on a message, that message gets an error and the run goes on.

| Option | Use |
| --- | --- |
| `--only vss,z3` | Run these strategies only. The entries of the other strategies in `summary.json` stay as they are. |
| `--limit 50` | Take the first 50 messages only, for a quick trial. |
| `--reuse <folder>` | When `<folder>/<strategy>.jsonl` exists, take it instead of running the strategy. Every circuit of the file is checked again. The agents that port strategies write such files into `eval-results/2026-11-27-syntax-one-percent/`. |
| `--timeout 120` | Seconds a strategy may take for one message. |
| `--jobs 3` | Run three strategies at the same time. The times per message are then less exact. |
| `--options <file>` | A JSON file `{"<strategy>": {…}}` with what a strategy needs to open, such as the path of its model. A strategy also sees the environment variables it documents. |

**2. Prepare the packets for the judge.**

```sh
node tests/benchmark/syntax/judge-prepare.mjs eval-results/2026-11-27-syntax-benchmark-a --size 200
```

Every circuit is looked up in the registry. The circuits that the registry does not hold are written once each into `judging/packet-<k>.jsonl`, 200 to a packet, however many strategies wrote them. A packet line holds a number, the message and the circuit. It does not say which strategy wrote the circuit.

**3. Judge.** A judge reads `judging/RULES.md` and one packet, and writes `judging/verdicts-<k>.jsonl`: one line `{"n", "grade", "note"}` for each packet line. The grade is L8 for an acceptable circuit, or L1 to L6 for a rejected one. A rejection quotes the words of the message in single quotes. The judge then checks the file:

```sh
node eval-results/2026-11-27-syntax-benchmark-a/judging/check.mjs 3
```

It reports format problems and how many lines are judged. A line with a format problem does not count until it is corrected. The benchmark tools do not start judges.

**4. Publish the verdicts into the registry.**

```sh
node tests/benchmark/syntax/judge-publish.mjs eval-results/2026-11-27-syntax-benchmark-a --tag 2026-11-27-syntax-benchmark-a --judge <model>
```

This writes one new file `<tag>.jsonl` into `webmeet-dataset/annotations/syntax/v1/judged/`. An existing file is never overwritten. Nothing is committed: committing the dataset is a separate decision.

**5. Print the table.**

```sh
node tests/benchmark/syntax/table.mjs eval-results/2026-11-27-syntax-benchmark-a
node tests/benchmark/syntax/agree.mjs eval-results/2026-11-27-syntax-benchmark-a
```

`table.mjs` can be called at any time, also before any judge has worked: the circuits not yet judged stand in the column "waiting".

## The table

One row per strategy. Each message is at one level.

| Level | Meaning |
| --- | --- |
| L0 | The strategy returned no valid circuit. |
| L1 to L6 | A judge rejected the circuit. The level is the judge's grade: L1 a wrong clause, L2 a word with content held as a discourse word, L3 words in the wrong wire or a wrong tie, L4 a statement the message does not make, L5 a missing clause, L6 something left untied. `rules.md` defines them. |
| L7 | Unused. In the earlier legend it meant one good and one bad circuit; a strategy now returns one circuit. |
| L8 | A judge accepted the circuit in this run. |
| L9 | The circuit was accepted and already in the registry: no judge was needed. |
| L10 | The circuit is accepted, and a reference circuit of that message is recorded as rejected. |
| waiting | No judge has read the circuit yet. |

**GOAL** is the share of all messages at L8, L9 or L10. A waiting message is not counted in GOAL, so GOAL can only rise while circuits wait. Below the table stands, per strategy, how many accepted circuits leave an attachment open with `attachment=ambiguous`.

`agree.mjs` groups, for every message, the strategies by their circuit. It reports how often all strategies wrote the same circuit, how often more than half did, and the same for each pair. Where the shared circuit has a verdict, it says how often that verdict is "accepted". This figure shows whether agreement between strategies can later stand in for a judge.

## When two circuits are the same

Two circuits of one message are the same when their core is equal. The core comes from `coreOf` of `lib/syntax.mjs`, applied to the normal form of the circuit.

The normal form (`normalForm` in `lib.mjs`) is needed for two reasons. The judge must not see who wrote a circuit, and wire names such as `@x1` would tell. And `coreOf` alone tells apart circuits that say the same: `marker="next to"` against `marker="next" marker="to"`, and `from=$a to=$b` against `to=$b from=$a`. In the normal form:

- wires are named `c`, `n`, `r`, `k` with a number, in the order of their first word;
- `dependent`, `modifier`, `auxiliary`, `negation` and `discourse` hold one word per value;
- `marker` and `conjunction` hold neighbouring words as one value;
- a clause lists its subject, then its complements; a relation `from`, then `to`.

The packets and the registry hold circuits in this form.

## The files of a run folder

| File | Written by | Content |
| --- | --- | --- |
| `<strategy>.jsonl` | `run.mjs` | One line per message: `{"id", "text", "sop", "error", "ms"}`. `sop` is the circuit or null. `error` starts with its kind: `invalid circuit`, `no circuit`, `crash` or `timeout`. |
| `summary.json` | `run.mjs` | Per strategy: status, messages, valid circuits, errors by kind, median milliseconds per message. |
| `logs/<strategy>.log` | `run.mjs` | What the strategy printed. |
| `judging/packet-<k>.jsonl`, `RULES.md`, `check.mjs` | `judge-prepare.mjs` | What a judge needs. |
| `judging/verdicts-<k>.jsonl` | a judge | The verdicts. |
| `key/items.jsonl` | `judge-prepare.mjs` | Which strategies wrote circuit `n`. Not for the judge. |
| `table.md`, `table.json` | `table.mjs` | The levels. |
| `agreement.md`, `agreement.json` | `agree.mjs` | The agreement between strategies. |

`judge-prepare.mjs` can be called again after more strategies were run into the same folder: the numbers already given stay, and new circuits go into new packets.

## Reference circuits

Before this schema, judges accepted and rejected circuits written in the `nlu` schema. `convert-nlu.mjs` rewrites the accepted ones into `syntax` circuits, by the table "How it relates to the `nlu` schema" of `docs/syntax-schema.md`, and writes them into the registry with the source "reference":

```sh
node tests/benchmark/syntax/convert-nlu.mjs --report eval-results/2026-11-27-syntax-benchmark-reference/not-converted.jsonl
```

It rewrites a circuit only when the rules settle every word, and reports the others with the reason. It is the one tool that uses the old checker and the knowledge repository, to find the position of each quoted value. No strategy may depend on it.

A reference circuit counts as accepted, but no judge has read it in the `syntax` schema. `judge-prepare.mjs --audit-references` adds to the packets the reference circuits of the messages that have a circuit to judge. The judge does not see which circuit is a reference. A judge's verdict on a reference circuit counts before the converter's, and a rejected reference is what makes L10 possible.

## Tests

```sh
env -u SOP_KNOWLEDGE_DIR node --test tests/syntax-benchmark.test.mjs
```
