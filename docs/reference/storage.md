[Home](../README.md) › [Reference](README.md) › Where everything is stored

# Where everything is stored

This page: where labels, verdicts, run outputs and conversion folders are stored, the format of each, and the rules each place follows. Kind: Reference.

How the labels are made: [The WebMeet dataset and its labels](../evaluation/dataset.md). How many there are: only on the [status page](../STATUS.md#the-dataset). Terms: [Glossary](glossary.md#project-terms).

**Standard, New here, Particular.** The files are plain [CSV](https://en.wikipedia.org/wiki/Comma-separated_values) and JSON Lines, one JSON object per line ([JSON streaming](https://en.wikipedia.org/wiki/JSON_streaming)). Each fact kept in one place follows the standard idea of a [single source of truth](https://en.wikipedia.org/wiki/Single_source_of_truth); the split into one store of labels and one log of judge decisions is this project's design (new here). The places are particular to this project and its sibling repository webmeet-dataset.

## Syntactic files

`webmeet-dataset/syntactic/<tab>/<file>.csv` is the only store of labels. This is the one page that describes its columns.

| Column | Contents |
| --- | --- |
| `text` | the message, exactly as typed |
| `sop` | its circuit in normal form, one wire per line; empty when no circuit is settled |
| `source` | who wrote the circuit: formalizer names joined by `+`, or `judge` when a judge wrote it |
| `accepted_by` | how it was accepted: `agreement`, `judge`, `written`, or empty when there is no circuit |

The values of `accepted_by`:

- `agreement`: formalizers that read the message from different sources wrote it alike; no judge read it.
- `judge`: a judge read and accepted it.
- `written`: a judge wrote it, because no formalizer's circuit was acceptable.

Rules:

- A file has the path of its file in `semantic/` and holds the same messages in the same order, each once, at most 1,000 per file. `tools/layers.mjs check` checks this mirror ([Batch and dataset tools](batch-tools.md#layersmjs)).
- A file holds only the present label. What a row held before is in the git history of webmeet-dataset, and, for the messages of a run, in that run's `key/labels-before.jsonl`.
- Two tools write labels. `round.mjs write` fills empty cells. `judge-publish.mjs` makes every circuit accepted in a benchmark run the label of its message, also over an agreement label. Both change only the cells of the rows concerned, and keep row order, line ends and message cells, so the mirror check still passes.
- A message that stands in several files gets its label from the first file, in name order, with a non-empty cell. The evaluation report found no such message on 2026-11-27.
- The core of a circuit is not stored here. The tools compute it when they look a message up.

## The registry

`webmeet-dataset/annotations/syntax/v1/judged/<tag>.jsonl` holds what a judge decided: one line per circuit a judge read or wrote.

| Key | Contents |
| --- | --- |
| `text` | the message, exactly as in the dataset |
| `sop` | the circuit in normal form, as the judge read it |
| `core` | `coreOf(text, sop)`; the tools compute it again and never trust this field |
| `verdict` | `accepted` or `rejected` |
| `grade` | `L8`, or `L1` to `L6` |
| `note` | the reason in one sentence; a rejection quotes the message |
| `judge` | the model that judged, or `agreement` (below) |
| `run` | the tag of the run or round; also the name of the file |
| `source` | the formalizers that wrote it, joined by `+`, or `judge` |

Rules:

- One file per run or round in which a judge decided something; a run with no judge decision writes none. The publishing tools never overwrite a file, and the files are not edited by hand. The one tool that rewrites registry files is `drop-duplicates.mjs --apply` ([below](#no-duplicated-data)).
- A circuit is decided once. The first line for a message and a core counts: within a file, the first line; across files, the file first in name order. A circuit the registry holds is never sent to a judge again.
- A circuit settled by agreement that no judge read has no line here. Its row in the syntactic file is its only record.

Other files of the folder:

- `<tag>-replaced-agreement.jsonl`: agreement labels that a benchmark publication replaced, kept as accepted readings with judge `agreement`. One such file exists: `2026-11-27-benchmark-random-replaced-agreement.jsonl`.
- `2026-11-27-agreement-<folder>.jsonl`: the judge lines of the folders of the batch conversion; `2026-11-27-agreement2-<folder>.jsonl`: those of its refill (added with dataset commit `596ff1d`).
- `2026-11-27-round-02.jsonl` still holds 20 lines with judge `agreement`: a second agreed circuit for the same message, recorded nowhere else. Whether to keep, judge or remove them is an open point for the owner.

Beside the registry, `annotations/syntax/v1/reference/reference-nlu-v1.jsonl` holds circuits that `convert-nlu.mjs` rewrote by rule from the nlu schema. No judge read them in the syntax schema, and they count nowhere.

## A run folder

`eval-results/<run>/` holds one benchmark run or one conversion round. One entry per file:

- `<strategy>.jsonl`: one line per message, `{id, text, sop, error, ms}` (`run.mjs`).
- `summary.json`: the sample, and per strategy the status, start-up, messages, valid circuits, errors by kind and median milliseconds (`run.mjs`).
- `logs/<strategy>.log`: what the strategy printed.
- `sample.json.gz` and `sample.lock.json`: a benchmark's sample and how it was drawn (`sample.mjs`).
- `judging/RULES.md`: a copy of `rules.md` from the last preparation. It is not always the version the verdicts were given under: look up `rules.md` in git at the time of the verdicts.
- `judging/check.mjs`: the verdict checker.
- `judging/packet-<k>.jsonl`: lines `{n, text, sop}` for a judge.
- `judging/verdicts-<k>.jsonl`: lines `{n, grade, note}`, written by a judge.
- `key/items.jsonl`: which strategies wrote circuit `n`; not for the judge.
- `key/labels-before.jsonl`: the labels before the run, written once, one line `{text, label, source, accepted_by}` per labelled message. Older runs hold every label of the dataset, with the keys `{text, label, core, run, source, previous}`. Never delete it.
- `key/agreement.jsonl`: the circuits settled by agreement, each with an `audit` flag (`round.mjs settle`).
- `key/rewrite-items.jsonl`: the messages sent for writing (`round.mjs rewrite-prepare`).
- `settle.json`: the counts of `settle`, and its key.
- `files.json`: the source files of a round, each with a sha256.
- `sample.json`: the messages of a round.
- `table.md`, `table.json`: the levels (`table.mjs`).
- `agreement.md`, `agreement.json`: the agreement between strategies (`agree.mjs`).
- `report.md`, `report.json`: how a round's messages were settled, and its levels; a snapshot of when it ran.
- `written.json`: what `round.mjs write` published, and which files it wrote.
- `rewriting/`: the rewriting packets, `REWRITE.md`, `RULES.md`, `check.mjs`, and the judge's `written-<k>.jsonl`.
- `first-run/`: the strategy files of the first run, the circuits the judges saw, kept before reruns overwrote the files beside them.
- `gold-only/`: in the benchmark folder only. A DistilBERT output that, by its name, comes from the checkpoint trained without silver labels; which checkpoint wrote it is not recorded.

## Conversion folders

- `eval-results/conversion/`: one round folder per source file of the batch conversion, named after the file's path with `/` replaced by `__` (`calendar/meetings-01.01.csv` becomes `calendar__meetings-01.01`). Beside each folder stand its `*.log` files. `silver-vss-spacy.jsonl` holds every circuit the batch settled by agreement; despite its name, it also holds the agreements in which DistilBERT took part. Git ignores this folder.
- `eval-results/conversion-audit/`: the pooled audit of the batch conversion (`pool.mjs`): packets, `RULES.md`, `check.mjs`, `key.jsonl`, verdicts.
- `eval-results/conversion-audit-02/`: the pooled audit of the refilled conversion, in the same form.

## No duplicated data

The owner asked for no duplicated data ([decision D12](../project/decisions.md#d12)): the syntactic files are the only store of labels, and the registry keeps only what a judge read or wrote. Until 2026-11-27, `annotations/syntax/v1/labels.jsonl` repeated the labels, and registry lines with judge `agreement` repeated the agreed circuits; `drop-duplicates.mjs` removed both ([Benchmark tools: analysis](analysis-tools.md#drop-duplicatesmjs)).

## Trial runs

A trial can use another registry and another folder of syntactic files, so that it never reads or writes the labels of the dataset: `--registry` and `--syntactic` ([Benchmark tools](run-tools.md#trial-runs)).

Next: [Folders and repositories](folders.md) · Up: [Reference](README.md)
