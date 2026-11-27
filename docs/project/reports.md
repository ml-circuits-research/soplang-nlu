[Home](../README.md) › [Project](README.md) › The full reports

# The full reports (HTML)

This page: the three long HTML reports of 2026-11-27: what each covers, when it was written, what in it is superseded, and how to open it. Kind: Reference.

## How to open them

The reports are self-contained HTML files in `docs/`. GitHub shows HTML from a private repository only as source code, so open them in a browser from a local checkout. They stay unchanged; the wiki pages cover the same ground in short pages and link to them as "full report (HTML, open from a local checkout)".

Each report was written on 2026-11-27 and revised the same day after two reviews, and all three were committed together in `51606f5` (18:30). Their numbers are dated: the current numbers are only in [STATUS.md](../STATUS.md).

## vss-architecture.html

[vss-architecture.html](../vss-architecture.html), "The VSS reader: architecture".

| Item | Detail |
| --- | --- |
| Covers | How VSS reads one message and writes its circuit: what it learns from raw text, what is declared by hand, the order of the steps, and every rule the code holds. |
| For | A reviewer who has not read the code and wants to judge the design, what is particular to WebMeet, and what a reusable engine would need. |
| Describes | `strategies/vss` at commit `fa46cb7` (17:49). Rules that first appeared there carry the mark "(fa46cb7)". |
| Written | First version 17:31–17:45 from the working tree; revised at about 18:00 after two reviews. |
| Sections | 16: purpose and constraints; terms; files; training and reading; training step by step; the legend; reading step by step; internal names to syntax keys; the rule catalogue; learned and declared; commands; results; changes since the old VSS page; limits; reuse; sources. |
| Superseded | Its numbers (now in STATUS); the lever-study estimates of its section 15, made before the trials were judged; the rules added after `fa46cb7`, such as `83fce90` and `71f0dd2`. |

Where the wiki covers the same topics: the section [VSS in depth](../vss/README.md) and the page [VSS](../formalizers/vss.md); in this section, [Tool choices](tool-decisions.md), [Tried and dropped](tried-and-dropped.md), [First results](first-results.md) and [The nlu-schema period](nlu-period.md).

## syntax-work-2026-11-27.html

[syntax-work-2026-11-27.html](../syntax-work-2026-11-27.html), "Decisions and insights of the syntax work, 2026-11-27".

| Item | Detail |
| --- | --- |
| Covers | What was decided that day and why, what was measured, what surprised, what was tried and dropped, and what was still open. |
| For | A reviewer who has to judge the decisions, and whoever continues the work. |
| Holds | The owner's decisions D1–D14; the decisions recorded in the tools T1–T4; the insights I1–I12; what was tried and dropped; the state at the end of the day; the open points; the chronology; the sources. |
| Superseded | The end-of-day state (benchmark table, strategies, dataset) and the open points: the current state is in STATUS and the journal. |

Where the wiki covers the same topics: in this section, [Decisions D1–D14](decisions.md), [Tool choices T1–T4](tool-decisions.md), [Tried and dropped](tried-and-dropped.md), [History in brief](history.md), [First results](first-results.md) and [First conversion](first-conversion.md); in [Evaluation and labels](../evaluation/README.md), the pages on [agreement](../evaluation/agreement.md) and on the [limits of the measurements](../evaluation/validity.md).

## syntax-evaluation-and-conversion.html

[syntax-evaluation-and-conversion.html](../syntax-evaluation-and-conversion.html), "How syntactic labels are made and measured".

| Item | Detail |
| --- | --- |
| Covers | How a circuit becomes the label of its message, and how formalizers are measured against labels: levels and GOAL, judges and their rules, the benchmark, conversion rounds, agreement, the batch conversion, storage, commands and pitfalls. |
| For | A reviewer who checks the method, and a newcomer who runs each step. |
| Describes | The tools, folders and files as they stood at about 18:00. |
| Superseded | The relaxed agreement key, which now has a wider sibling, `--key variants` (`c8d0a09`); the behaviour of `round.mjs write`, which since `9b2831e` fills empty cells one by one instead of leaving a whole file untouched; its counts of the dataset. |

Where the wiki covers the same topics: most of [Evaluation and labels](../evaluation/README.md); the reference pages on the [benchmark tools](../reference/run-tools.md), the [conversion tools](../reference/conversion-tools.md) and [storage](../reference/storage.md); the guides to [run the benchmark](../guides/run-benchmark.md), [judge a packet](../guides/judge-a-packet.md), [convert in batch](../guides/batch-conversion.md) and [run a conversion round](../guides/conversion-round.md); and in this section [First results](first-results.md) and [First conversion](first-conversion.md).

## How the reports mark their evidence

- Every number says what it counts and where it was counted. Numbers recounted from files carry "recounted for this document"; numbers the reviewers computed from the git history carry "checked during review".
- A number is cited at the commit named with it, since the run folders changed afterwards.
- **Session notes** are the notes of the working session of 2026-11-27. They are not in the repository. The claims taken only from them are listed in syntax-work-2026-11-27.html, section "Sources": the 41 of 1,831 circuits changed by counting word kinds from accepted circuits; VSS right on 77 of 77 sampled calendar circuits; the sample counts of the three area analyses; the false alarms of an automatic safety check on two judge agents; the experiment relating "goes" to "go".

## Older pages and records

- The former index of docs/ from the nlu period, `docs/history/nlu-schema-period.md` (its text as it stood: `git show 97a1b83:docs/history/nlu-schema-period.md`), summarised in [The nlu-schema period](nlu-period.md).
- The two learned prototypes: [experiments/syntax-learned/README.md](../../experiments/syntax-learned/README.md), summarised in [Tried and dropped](tried-and-dropped.md).
- The design of strict-vss: [strategies/strict-vss/DESIGN.md](../../strategies/strict-vss/DESIGN.md).

---

Next: [Home](../README.md) · Up: [Project](README.md)
