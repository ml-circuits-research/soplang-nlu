[Home](../README.md) › [Status](../STATUS.md) › Dataset labels by area

# Dataset labels by area

This page: how many messages of each area of the dataset have a circuit, and how each circuit was accepted. Kind: Reference.

Generated 2026-11-27 22:51 (UTC+01:00) by `node docs/status/build.mjs` · soplang-nlu 94b3036 (147 uncommitted paths) · webmeet-dataset 055a115 (236 uncommitted paths). The main figures are in [The dataset](../STATUS.md#the-dataset) on the status page; the terms are explained in the [Glossary](../reference/glossary.md).

Counted now from the 238 files of `webmeet-dataset/syntactic/` (commit 055a115). Each row of a file is one message with its circuit (the label) in the column `sop`, or an empty cell while no circuit is settled. The column `accepted_by` says how the circuit was accepted: **agreement** (strategies that read the message from different sources wrote the same circuit; no judge read it), **judge** (a judge read and accepted it), **written** (a judge wrote it because no strategy's circuit was acceptable). The area is the first folder of the file.

| Area | Messages |
| --- | --- |
| calendar | **77.7%** have a circuit: 4,010 of 5,158 messages in 14 files. By agreement 3,023; by a judge 969; written by a judge 18. Open (no circuit): 1,148. |
| diagram | **43.3%** have a circuit: 33,266 of 76,875 messages in 91 files. By agreement 31,406; by a judge 1,859; written by a judge 1. Open (no circuit): 43,609. |
| document | **56.1%** have a circuit: 6,140 of 10,948 messages in 19 files. By agreement 5,653; by a judge 474; written by a judge 13. Open (no circuit): 4,808. |
| drawing | **51.3%** have a circuit: 46,447 of 90,516 messages in 114 files. By agreement 44,104; by a judge 2,343; written by a judge 0. Open (no circuit): 44,069. |
| **All** | **49.0%** have a circuit: 89,863 of 183,497 messages in 238 files. By agreement 84,186; by a judge 5,645; written by a judge 32. Open (no circuit): 93,634. |

89,863 of 183,497 messages have a circuit (49.0%): 84,186 by agreement, 5,645 accepted by a judge, 32 written by a judge. No message appears twice.

---

Next: [Agreement and audit in detail](agreement.md) · Up: [Status](../STATUS.md)
