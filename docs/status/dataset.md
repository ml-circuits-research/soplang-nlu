[Home](../README.md) › [Status](../STATUS.md) › Dataset labels by area

# Dataset labels by area

This page: how many messages of each area of the dataset have a circuit, and how each circuit was accepted. Kind: Reference.

Generated 2026-11-27 22:24 (UTC+01:00) by `node docs/status/build.mjs` · soplang-nlu 7ffdbd4 (61 uncommitted paths) · webmeet-dataset 0a01d23. The main figures are in [The dataset](../STATUS.md#the-dataset) on the status page; the terms are explained in the [Glossary](../reference/glossary.md).

Counted now from the 238 files of `webmeet-dataset/syntactic/` (commit 0a01d23). Each row of a file is one message with its circuit (the label) in the column `sop`, or an empty cell while no circuit is settled. The column `accepted_by` says how the circuit was accepted: **agreement** (strategies that read the message from different sources wrote the same circuit; no judge read it), **judge** (a judge read and accepted it), **written** (a judge wrote it because no strategy's circuit was acceptable). The area is the first folder of the file.

| Area | Messages |
| --- | --- |
| calendar | **77.7%** have a circuit: 4,010 of 5,158 messages in 14 files. By agreement 3,023; by a judge 969; written by a judge 18. Open (no circuit): 1,148. |
| diagram | **43.3%** have a circuit: 33,265 of 76,875 messages in 91 files. By agreement 31,406; by a judge 1,858; written by a judge 1. Open (no circuit): 43,610. |
| document | **56.0%** have a circuit: 6,135 of 10,948 messages in 19 files. By agreement 5,653; by a judge 469; written by a judge 13. Open (no circuit): 4,813. |
| drawing | **51.3%** have a circuit: 46,445 of 90,516 messages in 114 files. By agreement 44,106; by a judge 2,339; written by a judge 0. Open (no circuit): 44,071. |
| **All** | **49.0%** have a circuit: 89,855 of 183,497 messages in 238 files. By agreement 84,188; by a judge 5,635; written by a judge 32. Open (no circuit): 93,642. |

89,855 of 183,497 messages have a circuit (49.0%): 84,188 by agreement, 5,635 accepted by a judge, 32 written by a judge. No message appears twice.

---

Next: [Agreement and audit in detail](agreement.md) · Up: [Status](../STATUS.md)
