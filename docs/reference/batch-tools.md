[Home](../README.md) › [Reference](README.md) › Batch and dataset tools

# Batch and dataset tools

This page: the scripts of the batch conversion (`batch-run.sh`, `batch-settle.sh`, `pool.mjs`, `batch-write.sh`) and the dataset's `layers.mjs`, with all their options. Kind: Reference.

Why and how the dataset is converted in batch: [Converting the dataset](../evaluation/conversion.md). Step by step: [Convert or refill the dataset in batch](../guides/batch-conversion.md). The batch scripts call `round.mjs`, whose subcommands are on [Conversion tools](conversion-tools.md). Terms: [Glossary](glossary.md#project-terms).

## Batch scripts

All of them run from `soplang-nlu`, write under `eval-results/conversion/`, and unset `SOP_KNOWLEDGE_DIR`.

### batch-run.sh

```sh
tests/benchmark/syntax/batch-run.sh [parallel] [strategies] [mode]
```

| Argument | Meaning |
| --- | --- |
| parallel | how many files run at once; default 4 |
| strategies | default `hmm-rules,spacy-direct,distilbert` |
| mode | `new` (the default): files with no syntactic file. `open`: the batch files again, after the strategies improved; move the earlier outputs aside first, since `--reuse` keeps them |

- One folder per source file, `eval-results/conversion/<tab>__<name>/`, made with `round.mjs start --files <file> --min-messages 1`; then `run.mjs --only <strategies> --reuse <folder> --jobs 3`.
- Files that a hand-run round holds (`eval-results/*-round-*/files.json`) are left out. No judge is involved.
- It sets `OMP_NUM_THREADS` to 2 unless it is set.

### batch-settle.sh

```sh
tests/benchmark/syntax/batch-settle.sh [audit] [parallel] [flags]
```

| Argument | Meaning |
| --- | --- |
| audit | the audit share; default 0.02 |
| parallel | how many folders run at once; default 8 |
| `--again` | settle also the folders that have a `settle.json` |
| `--key` | `relaxed` (the default), `variants` or `core` |

- For each folder with `sample.json` and `spacy.jsonl` or `spacy-direct.jsonl`, it runs hmm-rules again, then `round.mjs settle --families 2 --key <key> --prefer hmm-rules --judge audit --audit <share> --size 170`.
- It writes nothing into the dataset.

### pool.mjs

```sh
node tests/benchmark/syntax/pool.mjs collect <pool> <round…>
node tests/benchmark/syntax/pool.mjs distribute <pool>
```

| Command | Meaning |
| --- | --- |
| `collect` | gathers every packet line without a verdict from the round folders into `<pool>/packet-<k>.jsonl` (`--size`, 170 lines by default), with `RULES.md` and a check script, and writes `<pool>/key.jsonl`: the round, packet and line of each pooled line |
| `distribute` | writes the pooled verdicts back into each round's `judging/verdicts-<k>.jsonl`, under the round's own numbers; a verdict a round already has is kept |

### batch-write.sh

```sh
tests/benchmark/syntax/batch-write.sh <tag prefix> [judge]
```

| Argument | Meaning |
| --- | --- |
| tag prefix | required, for example `2026-11-27-agreement` |
| judge | the judge model; default `claude-opus-5-5` |

- For each folder with a `settle.json`, one after the other: `round.mjs write --tag <prefix>-<name> --judge <judge> --allow-open`.
- A later call with another tag fills the empty cells once their circuits are judged or written.

## layers.mjs

`webmeet-dataset/tools/layers.mjs` keeps the two layers of the dataset as mirrors. It runs in the `webmeet-dataset` folder, with no language model.

```sh
node tools/layers.mjs split [--max 1000] [--dry]
node tools/layers.mjs check
```

| Command | Meaning |
| --- | --- |
| `split` | splits every semantic file of more than `--max` messages (default 1000) into parts `<name>.01.csv`, `<name>.02.csv`, …, in row order, each with the header. It checks that the parts give back the original before it removes it, and splits a syntactic file of the same path at the same rows. `--dry` changes nothing |
| `check` | checks that every syntactic file has a semantic file with the same path, the same number of rows and the same message in each row. When something differs, it prints it and exits with 1. It compares messages only, never circuits |

---

Next: [Where everything is stored](storage.md) · Up: [Reference](README.md)
