[Home](../README.md) › [Project](README.md) › The first conversion

# The first conversion (2026-11-27)

This page: the record of conversion rounds 1 and 2, the first batch conversion, the data cleanup, and how the label counts fitted together at the end of 2026-11-27. Kind: Explanation.

> These are dated numbers. The current state of the dataset is in [STATUS.md, The dataset](../STATUS.md#the-dataset).

Converting means giving each message of the dataset's `semantic/` layer a syntactic circuit in the `syntactic/` layer ([The WebMeet dataset](../evaluation/dataset.md)). The terms round, settle, agreement, family, audit, judge and fixer are in the [Glossary](../reference/glossary.md#project-terms). How it works is explained in [Converting the dataset](../evaluation/conversion.md) and [The audit of agreed circuits](../evaluation/audit.md). The sources of this page are [syntax-evaluation-and-conversion.html](../syntax-evaluation-and-conversion.html) (sections "Conversion rounds", "The batch conversion" and "How the label counts fit together") and [syntax-work-2026-11-27.html](../syntax-work-2026-11-27.html).

## Rounds 1 and 2

A round takes the smallest source files that have no syntactic file yet, runs the strategies, settles what it can by agreement, sends the rest to judges, and writes the syntactic files ([D8](decisions.md#d8)). In both rounds a judge or a fixer settled every remaining message, so their files have no empty cells.

### Round 1

| Item | Count |
| --- | --- |
| Files | 17 files, 575 messages |
| Strategies | 10 (Z3 and neuro-z3 were ported later) |
| Circuits | 1,740 distinct |
| Agreed | 263, by three families |
| Audited | none as a share: every circuit went to a judge (`--judge all`); 262 agreed circuits judged, all accepted |
| Judged | 1,798 circuits sent to a judge (1,302 accepted, 496 rejected) |
| Written | 8 circuits written by a fixer |
| Labels | 575: 568 by a judge, 7 written |

The labels follow the round's `written.json`. The commit message of dataset `0124ab9` says 567 by a judge and 8 written. More circuits were written (8) than became written labels (7). A likely reason: when a formalizer's circuit of the same message was also accepted, that circuit becomes the label and the written one stays only in the registry; which case applied was not checked.

### Round 2

| Item | Count |
| --- | --- |
| Files | 4 files, 598 messages |
| Strategies | 12 |
| Circuits | 2,327 distinct |
| Agreed | 345 (for 320 messages), by three families |
| Audited | 17 of the 345, a 5% share, all accepted |
| Judged | 738 circuits sent to a judge (`--judge needed`) |
| Written | 33 circuits written by a fixer |
| Labels | 598: 301 by agreement, 272 by a judge, 25 written |

Later the benchmark publication replaced one agreement label of round 2 with a judge label. One message can have two agreed circuits when two groups of families each agree on a different one; this happened in round 2 (345 agreed circuits for 320 messages). The syntactic file holds one of them; the other is recorded only by the 20 agreement lines kept in the registry file `2026-11-27-round-02.jsonl` ([D12](decisions.md#d12)).

## The first batch conversion

After the two rounds, every remaining source file was converted in one pass, with agreement of two families and a 2% audit instead of a judge for every message ([T1](tool-decisions.md#t1), [T4](tool-decisions.md#t4)). Output in `eval-results/conversion/`, one folder per source file, which git ignores.

- **217 folders.** hmm-rules and spacy-direct ran over all of them; the older DistilBERT ran only on six calendar files.
- **58,103 circuits agreed.** 43,471 were written exactly alike by at least two families; 14,632 matched only when it is ignored where each relation with a marker (a linking word such as "on") starts, its attachment site.
- **Audit: 1,163 agreed circuits read by a judge, 10 rejected** (0.86%). The commit message of dataset `0b58c84` says 10 of 1,154, because it counts the 9 audit circuits of `calendar/meetings-01.01` with the 564 circuits read in that folder.
- **56,940 agreement labels** written into the syntactic files.
- **2,801 rows with `accepted_by` judge**: 1,704 circuits a judge accepted in the batch, and 1,097 labels the registry or earlier files already held.
- **122,583 cells left empty**, for later work (`--allow-open`).
- **60,914 of 183,497 messages** had a label after the batch and the rounds (dataset `0b58c84`).

In `calendar/meetings-01.01` a judge read 564 hmm-rules circuits (one for each of the 555 messages with no agreed circuit, and 9 audit circuits) and accepted 560: on these templated booking messages spacy-direct, not hmm-rules, was wrong.

## Data cleanup

Reasons: [D12](decisions.md#d12). What changed (dataset `95e7739`, soplang-nlu `e52bfc8`, 16:51):

- `annotations/syntax/v1/labels.jsonl` (47.6 MB) was removed, after a check that each of its 60,914 lines was the circuit in the syntactic cell of its message.
- 57,249 registry lines that only said "accepted by agreement" were removed; 20 stay.
- The registry went from 58 MB to 6.7 MB at `95e7739`, and was 15.4 MB after the benchmark publication `6e81e6c` added an 8.7 MB file.

## How the label counts fitted together

Counts of messages, which here equal rows. Agreement · judge · written, then the total:

1. Round 1 (dataset `0124ab9`): 0 · 568 · 7, total 575.
2. Round 2 (dataset `7be6e99`): 301 · 272 · 25, total 598.
3. Batch, 217 files (dataset `0b58c84`): 56,940 · 2,801 · 0, total 59,741.
4. After the batch: 57,241 · 3,641 · 32, total 60,914.
5. Benchmark publication (dataset `6e81e6c`): 1,152 messages get a first judge label.
6. The same publication replaces 318 labels by judge labels: 307 agreement labels (306 from the batch, 1 from round 2) and 11 judge labels.
7. End of the day: 56,934 · 5,100 · 32, total **62,066 of 183,497 messages** (33.8%).

The first judged hmm-rules run on the fixed sample had also given 1,160 judge labels (dataset `e0a20ad`). They are not a separate set of rows: they reached the syntactic files through the writes of the rounds and the batch, and are counted there.

## Later

The refilled conversion, the second audit and the current share of messages with a circuit are on [STATUS.md, The dataset](../STATUS.md#the-dataset).

---

Next: [The nlu-schema period](nlu-period.md) · Up: [Project](README.md)
