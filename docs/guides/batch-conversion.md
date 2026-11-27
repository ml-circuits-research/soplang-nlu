[Home](../README.md) › [How-to guides](README.md) › Convert in batch

# Convert or refill the dataset in batch

This page: how to run the batch scripts over many files, or again over the files of the batch conversion; audit the agreements; write the labels; and check the dataset's layers. Kind: How-to guide.

## When to use it

The dataset has two mirrored layers: `semantic/` holds the messages and everything the dataset held before the split, and `syntactic/` holds the same messages, in the same files and order, with one circuit per message in the `sop` cell, or an empty cell ([The dataset](../evaluation/dataset.md)). Every semantic file now has its syntactic file, so `round.mjs plan` reports "No source file is left for a round." Filling the empty cells of those files is done in batch: the formalizers run again over the files, the circuits that formalizers of different [families](../evaluation/agreement.md) wrote alike are settled by agreement, a judge reads a random share of them (the [audit](../evaluation/audit.md)), and the settled circuits are written into the empty cells. Why this works and what it rests on: [Converting the dataset](../evaluation/conversion.md).

Each file gets its own folder, `eval-results/conversion/<tab>__<name>/`: the file path with `/` replaced by `__`, so `calendar/meetings-01.01.csv` becomes `calendar__meetings-01.01`. The arguments of every script are in [Conversion tools](../reference/conversion-tools.md).

## Step 1: run the formalizers

```sh
tests/benchmark/syntax/batch-run.sh 4 vss,spacy-direct,distilbert
```

The arguments are the number of files run in parallel (default 4), the formalizers (default `vss,spacy-direct,distilbert`) and the mode (default `new`).

- `new`: every semantic file with no syntactic file, and not held by a hand-run round, gets a folder (`round.mjs start --files <file> --min-messages 1`), then `run.mjs --reuse` runs the formalizers. Output already in the folder is kept.
- `open`: every file that has a folder under `eval-results/conversion/` and a syntactic file is run again, after the formalizers improved, so that its empty cells can be filled. The script does not look at the cells, so files with no empty cell run too. Move the earlier outputs aside first: `--reuse` keeps any output it finds.

No judge is involved in this step.

## Step 2: settle by agreement

```sh
tests/benchmark/syntax/batch-settle.sh 0.02 8 --key variants
```

The arguments are the audit share (default 0.02), the folders settled in parallel (default 8), `--again` and `--key relaxed|variants|core` (default `relaxed`). For every folder that holds a sample and the circuits of `spacy` or `spacy-direct`, it runs VSS again (it is quick, and its rules change), then `round.mjs settle --families 2 --key <key> --prefer vss --judge audit`. A folder that is settled already is skipped unless `--again` is given. The key says when two circuits count as written alike ([Agreement](../evaluation/agreement.md)).

## Step 3: have the audit judged

Each folder holds only a few audit lines, so the lines are pooled into packets of the usual size:

```sh
node tests/benchmark/syntax/pool.mjs collect \
  eval-results/conversion-audit --size 170 eval-results/conversion/*/
```

The pool folder gets `packet-<k>.jsonl`, `RULES.md`, a check script, and `key.jsonl`, which records the folder, packet and line each pooled line came from. Judges work on the pool ([Judge a packet](judge-a-packet.md)). Then hand the verdicts back:

```sh
node tests/benchmark/syntax/pool.mjs distribute \
  eval-results/conversion-audit
```

Each verdict goes into its folder's `judging/verdicts-<k>.jsonl` under its own number. A verdict a folder already has is kept.

## Step 4: write the labels

```sh
tests/benchmark/syntax/batch-write.sh <tag prefix> [<model>]
```

For each settled folder, one after the other, it runs `round.mjs write --tag <prefix>-<name> --allow-open`. The judge's model defaults to `claude-opus-5-5`. The first batch used the prefix `2026-11-27-agreement`. Circuits settled by agreement go into the syntactic file only, with `accepted_by` "agreement"; a registry file is written only for a folder where a judge decided something. In an existing file only the empty cells are filled; a circuit already there stays. Messages with no settled circuit keep an empty cell, which a later call with another tag can fill.

## Step 5: check the layers

In `webmeet-dataset`:

```sh
node tools/layers.mjs check
```

It checks that every syntactic file mirrors its semantic file: same path, same messages, same order. It compares messages only, never circuits, so a wrong or empty `sop` cell passes.

## Step 6: look for duplicated data (report only)

```sh
node tests/benchmark/syntax/drop-duplicates.mjs
```

It reports registry lines that repeat what the syntactic files hold, and changes nothing without `--apply`. **Do not run it with `--apply`:** its rule removes every agreement line whose message now has a label accepted or written by a judge, whatever that label is. So it would delete the file `2026-11-27-benchmark-random-replaced-agreement.jsonl`, which keeps the agreement labels that the benchmark publication replaced as accepted readings.

## Step 7: the messages left open, and commits

Messages that no agreement settled stay empty. They are filled through the same folders, with the steps of [Run a conversion round](conversion-round.md): settle again (with `--judge needed`, a judge reads only the one circuit each open message needs), have the packets judged, let a fixer write the circuits of the messages whose circuits were all rejected (`rewrite-prepare --now`), then `write` with a new tag, which completes the file. The owner's rule for this is one judge and one fixer per message ([decision D9](../project/decisions.md#d9)).

Commit after each step: the run folders in `soplang-nlu`, the syntactic files and the registry in `webmeet-dataset`.

## What is standard here

| Piece | Kind |
| --- | --- |
| Agreement | Standard idea: trust a label where independent readers agree (compare [co-training](https://en.wikipedia.org/wiki/Co-training)). The procedure and the families are New here. |
| Audit | Standard: a random sample of the settled items is checked by a judge. |
| Thresholds | Particular: two families, a 2% audit, packets of 170. No reason is recorded for 0.02 or 170. |

## Pitfalls

- **The first batch used `spacy-direct`**, not `spacy`: the default of `batch-run.sh`, chosen before the owner kept one spaCy formalizer. Agreement labels therefore say `spacy-direct+vss`.
- **Every formalizer file a folder names counts.** Settlement reads every file that the folder's `summary.json` names, so a third formalizer's file takes part in the agreement too.
- **VSS is rerun at every settle.** The VSS file in a folder is from the last settle; a later `--again` may write circuits no judge has seen. Circuits already agreed stay agreed.
- **`open` mode keeps old outputs** unless they were moved aside first.

Next: [Run a conversion round](conversion-round.md) · Up: [How-to guides](README.md)
