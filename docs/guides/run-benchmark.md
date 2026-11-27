[Home](../README.md) › [How-to guides](README.md) › Run the benchmark

# Run the benchmark

This page: how to run the formalizers on the benchmark sample, send their circuits to judges, publish the verdicts, and read the table. Kind: How-to guide.

## Before you start

- What the benchmark is and why it is built this way: [The benchmark](../evaluation/benchmark.md). A first, small walk-through: [Measure hmm-rules on 20 messages](../evaluation/first-measurement.md).
- Choose a new run folder under `eval-results/`, for example `eval-results/2026-11-27-syntax-benchmark-a`. Steps 1 to 3 write only into that folder; step 4 writes into the dataset.
- The sample of the benchmark is `eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz`, a random 1% of the dataset's messages.
- The commands below use two shell variables:

```sh
E=eval-results
B=$E/2026-11-27-syntax-benchmark-random
```

## Step 0: draw a sample (only for a new sample)

```sh
node tests/benchmark/syntax/sample.mjs \
  $E/<folder>/sample.json.gz --share 0.01 --seed <text> \
  --exclude $E/2026-11-26-fresh-locked-one-percent/sample.json.gz \
  $B/sample.json.gz
```

It reads the messages of the dataset as committed (uncommitted edits do not count), orders them by a [SHA-256](https://en.wikipedia.org/wiki/SHA-2) hash of the seed and the text, and takes the first 1% that stand in no excluded sample: a [simple random sample](https://en.wikipedia.org/wiki/Simple_random_sample) that can be drawn again. Beside the sample it writes a `.lock.json` with the seed, the share and the dataset commit. An existing sample file is never replaced by another one.

## Step 1: run the formalizers

```sh
node tests/benchmark/syntax/run.mjs $E/<run> \
  --sample $B/sample.json.gz
```

Every formalizer listed under `strategyModules` in `tests/benchmark/syntax/strategies.mjs` runs over the sample, each in a process of its own, and writes one file `<name>.jsonl`: one line per message, with its circuit or the error. `--only hmm-rules,spacy` runs some of them; a retired formalizer runs only when `--only` names it. A crash or a timeout costs one message, not the run. Options and details: [Benchmark tools](../reference/run-tools.md).

## Step 2: prepare the packets for the judges

```sh
node tests/benchmark/syntax/judge-prepare.mjs $E/<run> --size 170
```

- Every circuit that the [registry](../reference/storage.md) does not hold, and that is not the [label](../evaluation/dataset.md) of its message, goes once into `judging/packet-<k>.jsonl`, however many formalizers wrote it. A packet does not say who wrote a circuit; `key/items.jsonl` does, and it is not for the judges.
- This step freezes the labels the messages have now in `key/labels-before.jsonl`. The [levels](../evaluation/levels.md) L9 (equal to the earlier label) and L10 (accepted, replacing another label) are read against them.
- It copies the judging rules and the check script into `judging/RULES.md` and `judging/check.mjs`.
- `--size` is the number of lines per packet: 200 by default; the benchmark of 2026-11-27 used 170.

## Step 3: have the packets judged

Each judge reads `judging/RULES.md` and one packet, writes `judging/verdicts-<k>.jsonl`, and checks it:

```sh
node $E/<run>/judging/check.mjs <k>
```

The tools do not start judges: hand each packet to one judge (a language-model agent or a person) with the instruction `judge-prepare.mjs` prints at the end of step 2 ([Judge a packet: start a judge](judge-a-packet.md#start-a-judge)). How to judge and what the check reports: [Judge a packet](judge-a-packet.md).

## Step 4: publish the verdicts

```sh
node tests/benchmark/syntax/judge-publish.mjs $E/<run> \
  --tag <tag> --judge <model>
```

- It writes one new file `<tag>.jsonl` into the registry, `webmeet-dataset/annotations/syntax/v1/judged/`. An existing file is never overwritten.
- Every circuit accepted in the run becomes the label of its message, whatever the message held before, also a label settled by agreement. A replaced agreement label that the registry does not hold is kept in `<tag>-replaced-agreement.jsonl`.
- It publishes nothing while any verdict file of the run has a format problem.
- It commits nothing.

## Step 5: read the table and the agreement

```sh
node tests/benchmark/syntax/table.mjs $E/<run>
node tests/benchmark/syntax/agree.mjs $E/<run>
```

`table.mjs` writes `table.md` and `table.json`: one row per formalizer, each message at one [level](../evaluation/levels.md), and GOAL, the share of messages at L8, L9 or L10. It can run at any time; circuits no judge has read yet stand as "waiting". `agree.mjs` writes `agreement.md` and `agreement.json` (see [Benchmark tools: agreement](../reference/analysis-tools.md)).

## Step 6: commit and record

Commit the run folder in `soplang-nlu`, and the registry file and syntactic files in `webmeet-dataset` (committing the dataset is a separate decision). Then add the measurement to the status page: [Refresh the status page](refresh-status.md).

## Run again in the same folder

After a formalizer changes, it can run again into the same folder, and `judge-prepare.mjs` can be called again: the item numbers already given stay, and only new circuits go into new packets. This is how changed circuits are judged without judging the others again ([Find faults](find-faults.md)). First copy the judged files of the formalizer into `first-run/`, as the benchmark folder does, because `run.mjs` overwrites `<name>.jsonl`.

## What is standard here

| Piece | Kind |
| --- | --- |
| Seeded sample | Standard: a random sample fixed by a seed. |
| LLM judges | Standard idea: a [large language model](https://en.wikipedia.org/wiki/Large_language_model) as evaluator. The rules and the levels are New here. |
| Frozen labels | New here: `labels-before.jsonl` and the levels L9 and L10. |
| The messages | Particular: the WebMeet dataset. |

## Pitfalls

- **Keep judged files apart** (`first-run/`) before running a formalizer again in a judged folder.
- **Never delete `key/labels-before.jsonl`.** It is written once; without it L9 and L10 cannot be told apart from L8.
- **`RULES.md` is overwritten** by every call of `judge-prepare.mjs` (and of `round.mjs settle`, `round.mjs rewrite-prepare`, `pool.mjs collect`). The rules behind a verdict file are those of `tests/benchmark/syntax/rules.md` in git at the time of the verdicts.
- **One bad verdict line blocks publication.** Run `check.mjs` on every packet first.
- **`summary.json` records no model path and no options.** Write down which checkpoint a learned formalizer used, for example in the commit message.
- **A repeated judged run on the same benchmark is not an independent measure** once rules were drawn from its rejections ([Limits of the measurements](../evaluation/validity.md)).
- **`run.mjs` without `--sample`** runs the earlier fixed sample, on which the formalizers were tuned.

Next: [Judge a packet](judge-a-packet.md) · Up: [How-to guides](README.md)
