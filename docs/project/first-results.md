[Home](../README.md) › [Project](README.md) › Results as first measured

# Results as first measured (2026-11-27)

This page: the first measurements of 2026-11-27, each attributed to its commit, kept for the record. Kind: Explanation.

> These are dated numbers. They do not describe the current state. The current numbers are only in [STATUS.md](../STATUS.md), and every later judged measurement is in [STATUS.md, Progress over time](../STATUS.md#progress-over-time).

The strategy hmm-rules was called `vss` when these numbers were measured; it was renamed on 2026-11-27 ([hmm-rules: Name](../formalizers/hmm-rules.md#name)).

The levels L0 to L10 and GOAL are explained in [Levels L0–L10 and GOAL](../evaluation/levels.md); the benchmark in [The benchmark](../evaluation/benchmark.md).

## The first judged hmm-rules result in the syntax schema

63.4% (1,160 of 1,831 messages accepted) on the earlier fixed sample (the 1% sample of `eval-results/2026-11-26-fresh-locked-one-percent/`), in the run `eval-results/2026-11-27-syntax-benchmark-1/` (commit `24de853`, 13:45). Its 1,160 accepted circuits became labels (dataset `e0a20ad`). Strategies were tuned on that sample during the day, so it does not measure unseen text. The hmm-rules results of the nlu period used another schema and other rules and are not comparable ([The nlu-schema period](nlu-period.md)).

## The first judging of the random benchmark

The random benchmark is 1% of the whole dataset (1,831 messages), drawn at random at 13:40 with no message of the fixed sample ([D6](decisions.md#d6)). Its run is `eval-results/2026-11-27-syntax-benchmark-random/`, table at commit `9f57aa3` (16:39): 5,858 distinct circuits of the five [formalizers](../formalizers/README.md) judged in 35 [packets](../reference/glossary.md#project-terms), none waiting; level L7 unused. The folder now also holds later reruns, so it is cited at that commit; the circuits of this first pass are kept in its `first-run/` folder (`87a221e`). One table per strategy, converted from the wide table of `table.md`. The levels: L0 no valid circuit; L1 a wrong clause (its form or its verb); L2 a content word held as a discourse word; L3 words in the wrong wire, or a wrong tie (a relation between wires); L4 a statement the message does not make; L5 a clause not written; L6 something left untied, related to nothing; L8 accepted; L9 equal to the label the message had before the run; L10 accepted, and replacing that label.

### spacy

| Level | Messages |
| --- | --- |
| L0 | 0 |
| L1 | 132 |
| L2 | 10 |
| L3 | 166 |
| L4 | 0 |
| L5 | 2 |
| L6 | 10 |
| L8 | 922 |
| L9 | 406 |
| L10 | 183 |
| GOAL | 82.5% |
| Ambiguous | 277 of 1,511 accepted (18.3%) |

### distilbert

| Level | Messages |
| --- | --- |
| L0 | 0 |
| L1 | 72 |
| L2 | 6 |
| L3 | 363 |
| L4 | 5 |
| L5 | 9 |
| L6 | 61 |
| L8 | 728 |
| L9 | 563 |
| L10 | 24 |
| GOAL | 71.8% |
| Ambiguous | 72 of 1,315 accepted (5.5%) |

### hmm-rules

| Level | Messages |
| --- | --- |
| L0 | 0 |
| L1 | 195 |
| L2 | 4 |
| L3 | 342 |
| L4 | 0 |
| L5 | 39 |
| L6 | 45 |
| L8 | 620 |
| L9 | 586 |
| L10 | 0 |
| GOAL | 65.9% |
| Ambiguous | 67 of 1,206 accepted (5.6%) |

### prolog

| Level | Messages |
| --- | --- |
| L0 | 41 |
| L1 | 229 |
| L2 | 1 |
| L3 | 383 |
| L4 | 7 |
| L5 | 37 |
| L6 | 4 |
| L8 | 658 |
| L9 | 238 |
| L10 | 233 |
| GOAL | 61.7% |
| Ambiguous | 542 of 1,129 accepted (48.0%) |

### z3

| Level | Messages |
| --- | --- |
| L0 | 0 |
| L1 | 236 |
| L2 | 10 |
| L3 | 460 |
| L4 | 0 |
| L5 | 31 |
| L6 | 9 |
| L8 | 599 |
| L9 | 250 |
| L10 | 236 |
| GOAL | 59.3% |
| Ambiguous | 505 of 1,085 accepted (46.5%) |

"Ambiguous" counts the accepted circuits that leave an attachment open (`attachment=ambiguous`); the rules let that pass, and Prolog and Z3 used it in nearly half of their accepted circuits.

### The grades of the 5,858 circuits

The judges accepted 3,115 circuits and rejected 2,743. A judge gives the first grade that applies, so these count first faults: L3 1,640; L1 834; L5 115; L6 111; L2 31; L4 12 (verdict files 1 to 35 of the run).

## Reading the table: what was counted without a judge

- **593 messages had a label before the run.** The [batch conversion](first-conversion.md#the-first-batch-conversion) (14:59–16:14) ran over the files of most sample messages and did not exclude the sample, which had been drawn at 13:40. A circuit equal to the label is L9 with no judge in this run. The mechanism: [The benchmark](../evaluation/benchmark.md).
- **The two reports group the 593 differently.** [syntax-work-2026-11-27.html](../syntax-work-2026-11-27.html): 574 batch agreement labels, 6 hmm-rules circuits a judge accepted in the batch, 13 labels of rounds 1 and 2. [syntax-evaluation-and-conversion.html](../syntax-evaluation-and-conversion.html): 576 circuits of the batch's agreement file, 4 hmm-rules circuits a judge accepted in `calendar__meetings-01.01`, 13 round labels. The difference is 2 circuits that stand in the agreement file and were also audit lines a judge accepted.
- **GOAL split by the 576 messages labelled by the batch**, as all 1,831 · the 576 · the other 1,255:
  - spacy: 82.5% · 99.7% · 74.7%
  - distilbert: 71.8% · 99.3% · 59.2%
  - hmm-rules: 65.9% · 100.0% · 50.2%
  - prolog: 61.7% · 79.5% · 53.5%
  - z3: 59.3% · 81.9% · 48.8%
- **hmm-rules has no message at L10** because labels settled by [relaxed agreement](../evaluation/agreement.md) carry the circuit of hmm-rules ([T2](tool-decisions.md#t2)).
- **DistilBERT's 71.8% is not a held-out measure.** The checkpoint is not recorded; most probably it was `syntax-v1-silver`, trained on agreement circuits of 576 benchmark messages ([Limits](../evaluation/validity.md)).

## DistilBERT checkpoints of the day

All from `distilbert-base-uncased`. The result is the share of development circuits equal to the label. The development sets and the numbers of epochs differ, so the results are not directly comparable. Details: [DistilBERT details](../formalizers/distilbert-details.md).

- **syntax-v1** ("gold-only", `9ae0e6f`): 2,328 labels, 2,103 to train, 225 to develop; 121 of 225 (53.8%) after 20 epochs.
- **syntax-v1-without-round-02**: the same labels without round 2; 97 of 170 (57.1%). On round 2, held out: 253 of 598 (42.3%; the commit says 42%).
- **syntax-v1-silver**: the 2,328 labels plus the 58,103 batch agreement circuits at weight 0.3; 138 of 225 (61.3%), at most 6 epochs.
- **syntax-v2** (17:38): the labels of the time, benchmark messages held out; 260 of 356 (73.0%). On the benchmark 73.1% (`5c87955`).
- **syntax-v3**: the grown labels, benchmark held out; 73.5% of 404 by its `training-summary.json` (a git-ignored file). On the benchmark 77.3% (journal; judged in `6af9b97`).

## hmm-rules rule batches of the afternoon

From `59066d1` on, each batch was checked against 8,000 accepted circuits of the dataset (how they were chosen is not stated) and, from `dd562c3` on, also against the judged benchmark. For `e33cc24` and `71faa24` the commits record no such check. Rule catalogue: [The rule catalogue in brief](../hmm-rules/rules.md).

- **`e33cc24`** (14:27), from round 1, where hmm-rules had 83.7% accepted before: degree words, particles, "these two", mentioned words, addresses.
- **`71faa24`** (14:57), from round 2 (86.8% before): list items, nouns with a run of names, verbs that take a bare infinitive.
- **`59066d1`** (16:29), from the calendar analysis: helping verbs and their subjects, words seen only as things, day words, comma series. 8 of 8,000 change.
- **`1c0b4f6`** (16:30), from the diagram and document analysis: where a nominal ends. None of 8,000 change.
- **`dd562c3`** (16:56), from the drawing analysis, first part: the words around a verb fix it (helping verbs, "like"), and an embedded question ("tell me what it shows") is a declarative clause. 2 of 8,000 change, both for the better; on the benchmark 5 accepted and 105 rejected circuits change.
- **`fa46cb7`** (17:49), the rest of the drawing and diagram analyses, and rules found in the benchmark rejections. 18 of 8,000 newly differ from their label; on the benchmark 22 accepted and 118 rejected circuits change. The hmm-rules rerun at this commit, with every batch above, judged: 72.0% (verdicts `0f9b5c3`).
- **`83fce90`** (18:13), the prototypes measured by the lever study. 17 of 8,000 newly differ; on the benchmark 31 accepted and 153 rejected circuits change. Judged: 75.5% (verdicts `1809b31`).

So by 18:24 hmm-rules had gone from 65.9% to 72.0% to 75.5% on the benchmark; later rounds are in [STATUS.md](../STATUS.md#progress-over-time). These are not independent measures: some rules were found in, or checked on, this benchmark's rejections, and the judges' rules changed after the first pass (`a81dd93`). See [Limits of the measurements](../evaluation/validity.md).

---

Next: [The first conversion](first-conversion.md) · Up: [Project](README.md)
