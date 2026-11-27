[Home](../README.md) › [Evaluation and labels](README.md) › Limits of the measurements

# Limits of the measurements

This page: what can make a GOAL misleading, and what is not measured, for a reviewer.
Kind: Explanation.

## Judge consistency

GOAL and the levels are defined in [Levels](levels.md). Each circuit was read by one
[judge](judging.md). How often two judges, or a judge and a person, agree on this schema is not
measured. The nearest figure is from the earlier `nlu` schema: judges accepted only 93% of hmm-rules
readings identical to circuits already accepted. That limits what a measured 99% can mean
([Judges](judging.md#what-is-not-known-about-judges)).

## Leakage

[Data leakage](https://en.wikipedia.org/wiki/Leakage_(machine_learning)) is a score raised because
the model has seen the answer.

- From DistilBERT's checkpoint `syntax-v2` on, the benchmark messages are kept out of every training
  on labels. The two learned prototypes in `experiments/syntax-learned/` left them out as well; their
  reviewer found no benchmark text in training, and 297 benchmark messages with a training text one
  edit away, which does not change the ranking.
- The DistilBERT of the first judging was most probably the "silver" checkpoint, trained on
  agreement circuits that included 576 benchmark messages. Its result there was not a held-out
  measure. Which checkpoint ran is not recorded
  ([DistilBERT: model, output stage, options, checkpoints](../formalizers/distilbert-details.md)).
- hmm-rules learns from the raw text of the whole dataset, benchmark messages included, without their
  labels. That is learning from text, not from labels; its effect on the score of hmm-rules is not measured.

## No longer an unseen sample

The benchmark was drawn as an unseen sample. Since then:

- the rules of hmm-rules from commit `dd562c3` on were checked against its judged circuits, and the rules of
  `fa46cb7` include rules found in its rejected circuits.
- spaCy's repairs of `a55e33f` and `0a7bb62` were checked on its judged benchmark circuits,
  rejected and accepted (their commit messages).
- The study that forced the word tags of hmm-rules (its *stations*) to fit accepted circuits also measured on
  it.
- The judges' rules changed after the first judging (commit `a81dd93`), so a rerun is judged by
  different rules.

A rejudged score on this sample therefore overstates a formalizer. A fresh sample is planned
([the journal](../../improvements-ideas.md), section "Ideas not yet tried"; wide tables, best read on
a computer).

## Labels that count without a judge

A circuit equal to a label is L9 and is never judged, and labels made by agreement credit the
formalizers that agreed. The mechanism: [The benchmark](benchmark.md#how-to-read-a-goal). The dated
split of the first judging: [Results as first measured](../project/first-results.md).

## Small files and rounds scored on their own rules

hmm-rules reached 83.7% and 86.8% GOAL on the first runs of conversion rounds 1 and 2, but 65.9% on the
random sample at the first judging. The rounds take the smallest files first, a
[selection bias](https://en.wikipedia.org/wiki/Selection_bias).

Rules drawn from a round's own files also raise that round's score, as
[overfitting](https://en.wikipedia.org/wiki/Overfitting) does: on round 1, hmm-rules had 83.7% before the
rules drawn from it and 92.3% after them (the round's report). Round reports are also not comparable
with the benchmark: in a round, an agreed circuit counts as accepted for the formalizers that wrote
it. Only files the rules were not drawn from measure a reader.

## Message length

On the random sample, drawing and diagram messages are not longer than average (words split at white
space; counted for the syntax-work report, with the GOAL of hmm-rules at the first judging):

- **drawing**: 876 messages, 13.9 words on average, hmm-rules 68.2%
- **diagram**: 808 messages, 12.4 words, hmm-rules 60.9%
- **document**: 99 messages, 12.3 words, hmm-rules 79.8%
- **calendar**: 48 messages, 14.2 words, hmm-rules 79.2%
- **all**: 1,831 messages, 13.1 words, hmm-rules 65.9%

The journal explains lower scores by "long drawing and chart messages"; the part about length is not
supported by these counts. Acceptance by message length is not measured.

## Statistical uncertainty

On 1,831 messages a GOAL is known to about ±2 points
([The benchmark](benchmark.md#how-to-read-a-goal)).

## Not measured

- two judges on the same circuit;
- a judge against a person;
- the accuracy of circuits written by a judge (the fixer);
- the reliability of agreements involving DistilBERT (23 audited, none rejected);
- exact against relaxed-only agreement (6 of 870 against 4 of 270 audited circuits rejected);
- GOAL on messages from outside the dataset;
- how often the normal form falls back to the circuit as written;
- GOAL on a fresh sample;
- a paired test of the hmm-rules trials on the same messages;
- which DistilBERT checkpoint ran in the first judging.

Current numbers, and what is being measured next: [STATUS.md](../STATUS.md#working-on-now).

Next: [hmm-rules in depth](../hmm-rules/README.md) · Up: [Evaluation and labels](README.md)
