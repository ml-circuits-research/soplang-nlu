[Home](../README.md) › [Evaluation and labels](README.md) › The WebMeet dataset

# The WebMeet dataset and its labels

This page: what the messages are, how the two mirrored layers are organised, and how a syntactic
file holds a label. Kind: Explanation.

## The messages

The messages come from the WebMeet dataset, the sibling repository `webmeet-dataset`. A message is
one English text that someone typed to one area of a single application:

| Area | The application part |
| --- | --- |
| `drawing` | a drawing canvas |
| `diagram` | a diagram and chart editor |
| `document` | a document editor |
| `calendar` | a calendar |

Many messages are commands. Many drawing messages are long scene descriptions ("a small girl on the
right facing the boy, then a dog…"). There are typos, and messages made from templates. All of this
is **particular** to this data: a [formalizer](../formalizers/README.md) tuned on these messages may
do worse on other English.
The owner's priorities are the drawing and diagram areas (webmeet-dataset README, 2026-11-23).

The code calls an area a **tab**. A *message id* is `<tab>/<file>#<record>`, where the record is
the number of the row in its file, counted from 1 after the header. For example,
`diagram/charts-01.csv#232` is "make a bar chart of the projects by name please".

## How many

The count changes, so it is given here only with its commit:

- 183,094 distinct texts at dataset commit `5c45966`, the commit the benchmark sample was drawn
  from (`sample.lock.json` of the benchmark folder);
- 403 messages added by dataset commit `aff01cb`, none removed. That commit kept the partial
  semantic work of an earlier session, for the history (owner's decision
  [D13](../project/decisions.md#d13)).

The current count is in [STATUS.md](../STATUS.md#the-dataset). This project counts distinct texts;
at commit `5c45966` every row held a distinct text (183,094 rows, 183,094 distinct texts). The
section "Contents (2026-11-23)" of the webmeet-dataset README gives higher totals of an earlier
date; they are not used here.

## Where the messages come from

They were moved from PSys2's official dataset (`psys2/official-dataset`). The webmeet-dataset
README lists them by source (as they stood on 2026-11-23); the main kinds:

| Source | What it is |
| --- | --- |
| `data-drop` | written from real request styles found in public corpora (CoDraw, ChartDialog, NLV, MagicBrush, …); each row checked on import |
| `demo-tool-profile` | the corpus of the deployed reader, authored by Claude Haiku, plus demo tool supplements |
| `main-synthetic` | systematic generation over every editor operation, with human-style variants |
| `ui-*` | case corpora written for specific editor features |
| `human-adapted-*` | real human messages adapted to the drawing and diagram areas |

## Two mirrored layers

| Folder | What it holds |
| --- | --- |
| `semantic/` | the messages with their semantic [circuits](../reference/glossary.md#project-terms): what was asked |
| `syntactic/` | the same messages with their syntactic circuits: how each sentence is built |

The two folders are mirrors: same paths, same messages, same order (owner's decision
[D7](../project/decisions.md#d7)). No file
holds more than 1,000 messages; a larger source is split into parts `<name>.01.csv`,
`<name>.02.csv`, … in the order of its rows. No reason for the limit of 1,000 is recorded.

`node tools/layers.mjs check`, run in webmeet-dataset, verifies the mirror without any language
model. It compares messages only, never circuits, so a wrong or missing circuit passes. How to run
it: [Convert or refill the dataset in batch](../guides/batch-conversion.md).

The two layers are explained in [Syntax and semantics](../concepts/syntax-and-semantics.md).

## A syntactic file

Each row of a syntactic file is one message. It holds the text, its circuit in
[normal form](normal-form.md) (empty while no circuit is settled), its source (the formalizers that
wrote it, or `judge`), and how it was accepted (`agreement`, `judge` or `written`). The exact
columns are in [Where everything is stored](../reference/storage.md).

These files are the only store of labels (owner's decision [D12](../project/decisions.md#d12)): no
other file repeats them. A row holds only the present label. What it held before is in the git
history of webmeet-dataset, and, for the messages of a run, in that run's frozen labels
([Levels](levels.md#the-labels-before-the-run)).

What judges decided is kept apart, in the *registry* `webmeet-dataset/annotations/syntax/v1/judged/`:
every circuit a judge read, with its verdict and reason, and every circuit a judge wrote. A circuit
settled by agreement gets no registry line: while it is the label, its row is its only record. When
a benchmark publication replaces it, the registry keeps it as an accepted reading
([The benchmark](benchmark.md#publication-accepted-circuits-become-labels)).

## How the files are filled

1. Formalizers that read a message from different sources write a circuit for every message. A
   circuit they wrote alike is settled by [agreement](agreement.md), and a judge reads a random
   share of these as a control ([the audit](audit.md)).
2. For the other messages a judge reads one circuit, and it becomes the label when accepted.
3. Where the judge rejects it, a judge writes the circuit (in the role of *fixer*).

Rounds, the batch conversion and the fixer: [Converting the dataset](conversion.md).

## The semantic layer

The semantic files hold circuits of the `w.request` schema, defined in the sibling repository
`sop-knowledge-worlds`: what the message asks the application to do. A row may hold alternative
readings in extra columns `sop1`, `sop2`, … of the same row. That layer is written by its own
rules, in `webmeet-dataset/README.md`: a circuit formalises what is said, not what makes sense, and
judging sense is the job of the later interpretation. This project writes only the syntactic layer;
from the semantic files, its sampling and conversion tools take the messages.

## Standard, new here, particular

| Label | What |
| --- | --- |
| Standard | A [labelled dataset](https://en.wikipedia.org/wiki/Labeled_data) with a [held-out sample](https://en.wikipedia.org/wiki/Training,_validation,_and_test_data_sets); several annotation layers over one corpus, one per kind of analysis; files in [CSV](https://en.wikipedia.org/wiki/Comma-separated_values). |
| New here | Both layers written as [SOP Lang](../concepts/sop-lang.md) circuits, in mirrored files (same paths, messages and order), with a mirror check that needs no language model. |
| Particular | The WebMeet messages, their four areas, their templates and typos. |

Next: [Judges and the judging rule](judging.md) · Up: [Evaluation and labels](README.md)
