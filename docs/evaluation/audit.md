[Home](../README.md) › [Evaluation and labels](README.md) › The audit

# The audit of agreed circuits

This page: how a random share of the agreed circuits is judged, to estimate how often agreement
labels are wrong. Kind: Explanation.

## What it is

A seeded random share of the circuits settled by [agreement](agreement.md) goes to a judge, mixed
with the other circuits and unmarked, so the judge cannot tell which they are. When the judge
rejects one, the judge's word counts.

`chooseAudit` in `tests/benchmark/syntax/lib.mjs` orders the agreed circuits by the
[SHA-256](https://en.wikipedia.org/wiki/SHA-2) hash of the seed, the message and the core (joined
by a zero character) and takes the first `round(share × count)`. The seed is the round
folder's name unless `--seed` gives another. The choice depends only on the seed, the messages and
the circuits, so the same call gives the same audit.

This is [acceptance sampling](https://en.wikipedia.org/wiki/Acceptance_sampling), as used in
[quality control](https://en.wikipedia.org/wiki/Quality_control): a random sample is inspected to
judge the whole batch.

## Shares by process

| Process | What was judged |
| --- | --- |
| round 1 | every circuit (`--judge all`): 262 agreed circuits read, all accepted |
| round 2 | a 5% audit (`--judge needed`): 17 of 345 agreed circuits, all accepted |
| batch | a 2% audit (`--judge audit`) |
| refill | a 2% audit, with the `variants` key |

These settings are recorded in the tools, not attributed to the owner
([T4](../project/tool-decisions.md#t4)). Why the batch uses 2% and not the default 5% is not
recorded. The audit lines of the 217 batch folders were pooled into packets of the usual size
(`pool.mjs`), and the verdicts handed back to each folder.

## What it tells

The audit is the only measure of the error rate of agreement labels. Apart from it, an agreement
label is never read by a judge: a circuit equal to the label is never sent again
([Levels: Subtleties](levels.md#subtleties)). A publication may later replace it with a circuit a
judge accepted.

## The counts

Three totals of audited circuits appear in the sources. They do not contradict each other: each
counts a different part.

| Total | What it counts |
| --- | --- |
| 1,154 read | 10 rejected. The first batch conversion, as the commit message of dataset `0b58c84`, the journal and the README of `webmeet-dataset/syntactic/` give it. |
| 1,163 read | 10 rejected. The same first batch, recounted in the evaluation report: the 1,154 leaves out 9 audit lines of `calendar/meetings-01.01`, which were counted with the 564 VSS circuits a judge read in that folder. |
| The status page | Every audit recorded in the conversion folders now: the first batch and the later refills of the conversion, recomputed at every build ([Agreement and audit in detail](../status/agreement.md)). |

When this page was written, the status page counted 1,715 read and 17 rejected. That total is the
sum of three pooled audits, each a folder of verdicts under `eval-results/`:

- `conversion-audit`: the first batch, 1,163 audit circuits read, 10 rejected;
- `conversion-audit-02`: a refill of the conversion, 433 read, 431 accepted (2 rejected);
- `conversion-audit-03`: the next refill, 119 read, 114 accepted (5 rejected; commit `aef741e`).

1,163 + 433 + 119 = 1,715, and 10 + 2 + 5 = 17. The first folder holds 1,718 verdict lines in all,
because its pooled packets also held other circuits of the conversion folders
([Judges: what judging costs](judging.md#what-judging-costs)).

## The first batch, by families

By the families that agreed (the recount at 18:00 on 2026-11-27):

- **parser + vss**: 57,087 agreed, 1,140 read, 10 rejected (0.88%)
- **distilbert + vss**: 793 agreed, 18 read, none rejected
- **distilbert + parser + vss**: 114 agreed, 2 read, none rejected
- **distilbert + parser**: 109 agreed, 3 read, none rejected
- **all**: 58,103 agreed, 1,163 read, 10 rejected

Current totals: [Status: Agreement between VSS and spaCy](../STATUS.md#agreement-between-vss-and-spacy).

## Exact against relaxed matches

In the first batch audit, parser–VSS circuits written exactly alike: 870 read, 6 rejected. Circuits
alike only under the `relaxed` key: 270 read, 4 rejected. The counts are too small to tell the two
error rates apart.

## Three rejected examples

Judges' notes on circuits that VSS and the parser agreed on (from
`eval-results/conversion-audit/verdicts-*.jsonl`):

- L1: "'Have the legend switched on.' is a command with 'Have' as its verb and 'the legend' as its
  complement, but the circuit writes an interrogative clause".
- L3: "'the two people in green' has 'in green' start at 'a man', which states the man is in green
  and loses the description of the two people".
- L3: "'a girl arms up' is merged into one nominal with head 'arms', but 'a girl' is the thing that
  is there and 'arms up' describes her".

## Limits

- Each audited circuit is read by one judge, whose verdict is not checked in turn
  ([Judges](judging.md#what-is-not-known-about-judges)).
- Agreements with DistilBERT: 23 audited, none rejected, too few to say anything.
- More: [Limits of the measurements](validity.md).

## Standard, new here, particular

| Label | What |
| --- | --- |
| Standard | Acceptance sampling; a seeded, repeatable random choice. |
| New here | The audit as these tools run it: seeded by the round folder's name, mixed blind into judge packets, pooled across folders. |
| Particular | The shares 5% and 2% were chosen for this project's rounds and batch. |

Next: [Converting the dataset](conversion.md) · Up: [Evaluation and labels](README.md)
