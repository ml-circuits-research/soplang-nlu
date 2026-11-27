[Home](../README.md) › [Project](README.md) › Choices recorded in the tools

# Choices recorded in the tools (T1–T4)

This page: the choices written in the code rather than made by the owner, and the choices whose reason is not recorded anywhere. Kind: Explanation.

## How to read this page

These choices are written in the code and its comments, mostly in `tests/benchmark/syntax/` (the benchmark and conversion tools). The session notes do not attribute them to the owner, except where a record says so. Each has a heading (`T1` to `T4`) and the same table as the owner's decisions in [Decisions D1–D14](decisions.md). The source is the report [syntax-work-2026-11-27.html](../syntax-work-2026-11-27.html), section "Decisions recorded in the tools", and the later commits named in the tables.

Terms: *agreement* means that strategies of different *families* (sources of analysis, such as the spaCy parse) wrote the same circuit for a message, which is then accepted without a judge; the *audit* is the random share of agreed circuits a judge reads all the same; *settle* is the step that does both. Definitions: [Glossary](../reference/glossary.md#project-terms).

## T1

**Agreement needs different families: three in rounds, two in the batch conversion.**

| Part | Record |
| --- | --- |
| Decision | `round.mjs settle` accepts a circuit by agreement when strategies of at least three families wrote it (`--families`, default 3). The batch conversion uses two families, with relaxed agreement and an audit (`batch-settle.sh` that day: `--families 2 --relaxed --prefer vss --judge audit --audit 0.02`; since `c8d0a09` the script passes `--key`, `relaxed` by default). |
| Reason | The evidence for each number is explained in [Agreement between formalizers](../evaluation/agreement.md); it is not repeated here. |
| Consequence | The audit of the batch is the only measure of its error rate ([The audit](../evaluation/audit.md)). In 211 of the 217 batch folders only VSS and spacy-direct ran, so two families were all there was. |
| Landed | `9a57cfe`, `40c00a7`, `edb1319`. |

Which DistilBERT ran in the batch: its six files were written at 14:59–15:00, before the syntax-only checkpoint existed (15:15–15:23, file times) and before `9ae0e6f` landed (15:31). These runs therefore used the port of `662a663`, with weights fitted on the old nlu annotations. Nothing in the run folders records the checkpoint. The inference rests on the file times and on the code at `7db7628`, where `strategies/distilbert/index.mjs` still loaded the older model (checked during the review of the report).

## T2

**Relaxed agreement, and VSS's circuit becomes the label.**

| Part | Record |
| --- | --- |
| Decision | Circuits that differ only in where a relation with a marker starts (its attachment site), and in the mark `attachment=ambiguous`, count as written alike. The circuit of the first strategy named by `--prefer` (vss) becomes the label. |
| Reason | The judges' rules accept several attachment sites. For choosing VSS's circuit no reason is recorded: the comment in `round.mjs` says only that the circuit of the first strategy of `--prefer` "stands for them". |
| Consequence | Labels settled this way carry VSS's attachment site. On a labelled message VSS's circuit is usually the label (L9), while spaCy's circuit with the other site needs a judge and, when accepted, replaces the label (L10). In the first judging of the benchmark, VSS had 586 messages at L9 and none at L10. |
| Landed | `40c00a7` (`relaxedCore` and `agreedCircuits` in `tests/benchmark/syntax/lib.mjs`). |

Later, `c8d0a09` added a wider key, `--key variants`: two circuits also count as alike up to eight choices that the judges' rules let pass either way ([Agreement](../evaluation/agreement.md)).

## T3

**A benchmark replaces labels; a conversion round only fills empty cells.**

| Part | Record |
| --- | --- |
| Decision | `judge-publish.mjs` makes every circuit accepted in a benchmark run the label of its message, also over a label settled by agreement; this half is the owner's [D6](decisions.md#d6). `round.mjs write` fills empty cells and never changes a circuit already there; this half is a choice of the tools. |
| Reason | A judge's verdict takes precedence over agreement (D6). For the behaviour of rounds no separate reason is recorded. |
| Consequence | A replaced agreement label was at first recorded nowhere; since 17:45 on 2026-11-27, `judge-publish.mjs` keeps it in the registry as an accepted reading. Whether rounds should replace labels too is an open point of the journal. |
| Landed | `24de853`; `40c00a7` (`--allow-open`, completing a file); `9b2831e` (completing a file cell by cell). |

Before `9b2831e`, `round.mjs write` left a whole file untouched when the round had settled another circuit for even one labelled message; about 16,000 agreed circuits of the refilled conversion were not written for that reason. Since then only the empty cells are filled and an existing label stays (commit message of `9b2831e`).

## T4

**The audit share: 5% in round 2, 2% in the batch.**

| Part | Record |
| --- | --- |
| Decision | A random share of the agreed circuits goes to a judge, unmarked (`chooseAudit`, seeded by the round name); when the judge rejects one, the verdict takes precedence. Round 1 ran with `--judge all`, so no audit share applied; round 2 used `--judge needed` with a 5% audit; the batch `--judge audit` with 2%. |
| Reason | Agreement must be checked to be trusted. Why the batch uses 2% instead of the default 5% is not recorded. |
| Consequence | The results of each audit: [First conversion](first-conversion.md) for 2026-11-27, [The audit](../evaluation/audit.md) for the method. |
| Landed | `9a57cfe`, `edb1319`, `a09047d`. |

## Choices with no recorded reason

No comment, commit message or session note gives a reason for these. Each is a number or default in the code:

- **`--prefer vss`**: VSS's circuit stands for a group under relaxed agreement and becomes the label (T2).
- **Smallest files first**: `pickFiles` in `round.mjs` sorts the free source files by their number of messages unless `--order name` is given. The effect is measured: the early rounds overstate a reader ([Limits](../evaluation/validity.md)).
- **1,000 messages per file**: the limit of [D7](decisions.md#d7); its other half, the mirrored layers, has a reason.
- **An audit share of 0.02** in `batch-settle.sh`, against the default 0.05 of `round.mjs settle` (T4).
- **A packet size of 170** in the batch and in the benchmark (`--size 170`; also the default of `pool.mjs`), against the default of 200 in `round.mjs settle` and `judge-prepare.mjs`. A packet is the file of circuits one judge reads.
- **The VSS loop limit of 4**: at most 4 re-decodings after a doubt about a word, so at most 5 readings. When the limit is reached, the last reading is used even if it still has fresh doubts ([Reading](../vss/reading.md)).

Also not recorded: why DistilBERT ran in only 6 of the 217 batch folders.

## Thresholds whose origin is not recorded

VSS's rules use numbers such as "a word seen as a thing at least 20 times" or "a likeness below 0.3". Three are documented as chosen from counts in this dataset; most others, such as "at least 3", have no recorded origin. The [rule catalogue](../vss/rules.md) marks each kind. Making these numbers learned instead of set is one of the steps in [Making VSS reusable](../vss/reuse.md).

---

Next: [Tried and dropped](tried-and-dropped.md) · Up: [Project](README.md)
