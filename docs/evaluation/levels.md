[Home](../README.md) › [Evaluation and labels](README.md) › Levels and GOAL

# Levels L0–L10 and GOAL

This page: the exact definitions of the levels, the grades and GOAL, the order in which the tools
decide a level, and the frozen labels a run is compared with. Kind: Reference.

The table of a run has one row per [formalizer](../formalizers/README.md) and puts each message at
one level. `table.mjs` writes it for a [benchmark](benchmark.md) and `round.mjs report` for a
[conversion round](conversion.md). Both call `tableOf` and `levelOf` in
`tests/benchmark/syntax/lib.mjs`. The terms *label*, *registry* and *verdict* are in the
[glossary](../reference/glossary.md#project-terms).

## The levels

| Level | Meaning |
| --- | --- |
| L0 | The formalizer returned no valid circuit. |
| L1–L6 | Rejected, by a judge of this run or already in the registry. The level is the judge's grade (below). |
| L7 | Unused. In the earlier scale it meant one good and one bad reading; a formalizer now returns one circuit. |
| L8 | Accepted, but neither L9 nor L10. This covers: accepted earlier, in the registry; accepted in this run (by a judge, or by agreement in a round) for a message with no label before the run; equal to a label set after the run started. |
| L9 | Equal to the label the message had before the run. No judge was needed. Since every accepted circuit becomes a label, a formalizer that writes the same circuit again is at L9 ([The benchmark: publication](benchmark.md#publication-accepted-circuits-become-labels)). |
| L10 | Accepted in this run (by a judge, or by agreement in a round) for a message that had another label before the run. |
| waiting | No judge has read the circuit yet. |

## Grades

A judge gives L8, or the first of L1 to L6 that applies, checked in this order:

| Grade | When |
| --- | --- |
| L8 | Acceptable. |
| L1 | A clause is wrong: its form, its verb, an auxiliary or negation in the wrong place, words of one clause held in another, a missing or wrong ellipsis. |
| L2 | A word with content is held as a word said to the listener (`discourse`), so its place in the sentence is lost. |
| L3 | Words in the wrong wire, or a wrong tie: a nominal split or merged, a wrong head or subject, a complement of the wrong clause, a relation with a wrong end, a marker that is no linking word or a start the words rule out, a linking word held as a modifier or dependent, a wrong member of a coordination. |
| L4 | A statement the message does not make: an ellipsis, subject, relation or coordination the words do not give. |
| L5 | A clause not written: its verb is held as a modifier, dependent, head or discourse word. |
| L6 | Something left untied, or a pairing the words give not written ("x 120" with "120" tied to nothing). |

The exact criteria are in the section "Grades" of
[rules.md](../../tests/benchmark/syntax/rules.md). Grades and levels share their numbers: a judge's
grade L8 becomes level L8 or L10.

## GOAL

GOAL = (L8 + L9 + L10) / all messages of the run. The constant `GOAL_LEVELS` in `lib.mjs` lists the
three levels.

- A waiting message counts in the denominator, but not as accepted. While circuits wait, GOAL is
  therefore a [lower bound](https://en.wikipedia.org/wiki/Upper_and_lower_bounds): it can only rise
  as verdicts arrive.
- `atMost`, also given by `tableOf`, is the upper bound: GOAL if every waiting circuit were accepted.
- The table also counts the accepted circuits that carry `attachment=ambiguous`.

The aim of over 99%, and the owner's refusal to restate it as "precision plus coverage", are in
[decision D1](../project/decisions.md#d1).

## How levelOf decides, in order

1. No valid circuit (no core): L0.
2. The core equals the core of the label before the run: L9. This is checked before any verdict.
3. The run has a verdict for the circuit: a judge's line in `judging/verdicts-<k>.jsonl`, or, in a
   conversion round, settlement by agreement (`key/agreement.jsonl`, counted as grade L8). Rejected:
   the grade. Accepted: L10 if the message had a label before the run, else L8.
4. The registry holds the circuit: accepted gives L8, rejected gives its grade.
5. The circuit equals the label of now, because it became the label after the run started: L8.
6. Otherwise: waiting.

## The labels before the run

L9 and L10 compare with the labels as they were before the run, not with the labels of now.

- **The file**: `<run>/key/labels-before.jsonl`. `keepLabelsBefore` in `lib.mjs` writes it the
  first time `judge-prepare.mjs`, `round.mjs settle` or `round.mjs write` is called for the run, or
  `judge-publish.mjs` when it has something to publish. It is never changed after that.
- **Why**: a publication replaces labels ([The benchmark](benchmark.md)). Without frozen labels, a
  run's table would change after every later publication: a formalizer whose circuit was the label
  would drop from L9 to waiting, because an agreement label may have no registry line.
- **A run with no such file** is compared with the labels of now.
- **Never delete it**: it is the only record of what L9 and L10 were measured against.

It exists in two formats; `readLabelsBefore` reads both:

| Format | Lines |
| --- | --- |
| current | one line `{text, label, source, accepted_by}` per message of the run that had a label |
| earlier | every label of the dataset, keys `{text, label, core, run, source, previous}`, no `accepted_by` |

The random benchmark's file is in the earlier format. Where the file sits among the other files of
a run: [Where everything is stored](../reference/storage.md).

## Subtleties

- L9 is decided before any verdict: a circuit equal to the label before the run is L9 even if the
  registry holds a rejection of it.
- In a round, agreement can give L8 or L10 without a judge. Such an L10 reports a replacement that
  `round.mjs write` does not perform ([Converting the dataset](conversion.md)).
- An audited agreed circuit counts as accepted (L8 or L10) until its verdict arrives. It never shows
  as waiting.
- A label is never sent to a judge again: `collectItems` leaves out every circuit equal to the
  label. Agreement labels are trusted until a publication replaces them; the only check on them is
  [the audit](audit.md).
- A verdict line with a format problem does not count, and its circuit stays waiting
  ([Judge a packet](../guides/judge-a-packet.md)).

## A constructed test

The test "levels and GOAL from the labels, the registry and the verdicts of the run" in
`tests/syntax-benchmark.test.mjs` fixes the procedure on ten messages:

- "move it": equal to the label before the run → L9
- "lift it": accepted in the registry, not the label → L8
- "drop it": rejected in the registry with L3 → L3
- "turn it": a judge accepts it in this run; the message had another label → L10
- "hide it": a judge accepts it; the message had no label → L8
- "show it": a judge rejects it with L5 → L5
- "bend it": no judge yet → waiting
- "fold it": no circuit → L0
- "tear it": an invalid circuit → L0
- "put the cat next to the red box": a judge accepts a reading with `attachment=ambiguous` → L8

GOAL is 5/10 = 50%, and `atMost` is 6/10.

## Shorter definitions elsewhere

Other pages give the levels in one line each, such as "L8 accepted" on the status page. This page
is the precise one; where a shorter wording seems to differ, this page holds.

## Standard, new here, particular

| Label | What |
| --- | --- |
| Standard | A score as the share of items accepted; lower and upper bounds while items wait; a reference set kept fixed for each measurement. |
| New here | The level scale L0–L10 and GOAL as defined here, with L9 and L10 measured against the labels frozen per run. |
| Particular | None: the levels do not depend on the data. |

Next: [When two circuits are the same](normal-form.md) · Up: [Evaluation and labels](README.md)
