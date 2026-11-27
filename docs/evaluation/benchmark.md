[Home](../README.md) › [Evaluation and labels](README.md) › The benchmark

# The benchmark

This page: what the benchmark is, how its sample was drawn, what publishing does, and how to read a
GOAL. Kind: Explanation.

## What it is

The benchmark is 1,831 messages, 1% of the [dataset](dataset.md), drawn at random. Every
[formalizer](../formalizers/README.md) runs on all of them, and every circuit is either
[judged](judging.md) or equal to the label of its message. [GOAL](levels.md#goal) on the benchmark
is therefore a full measure, not an estimate from a part of the verdicts. The table of all
formalizers comes from this benchmark, not from every conversion round (owner's decision
[D9](../project/decisions.md#d9)).

## Two samples

| Sample | What it is |
| --- | --- |
| fixed | `eval-results/2026-11-26-fresh-locked-one-percent/`: an earlier 1%. Formalizers were tuned on it on 2026-11-27, so it no longer measures them. `run.mjs` takes it when no `--sample` is given. |
| random | `eval-results/2026-11-27-syntax-benchmark-random/`: seed "syntax-2026-11-27", share 0.01, drawn from the 183,094 distinct texts at dataset commit `5c45966`, with no message of the fixed sample. |

All current figures use the random sample ([decision D6](../project/decisions.md#d6): a random 1% of
the whole dataset).

## How the sample is drawn

`tests/benchmark/syntax/sample.mjs`:

1. reads the text column of every message file of the dataset as committed at a revision (through
   `git show`, so uncommitted edits do not count);
2. keeps each distinct text once, under the id of its first record;
3. orders the texts by `sha256(seed + "\0" + text)`;
4. takes the first `round(share × distinct texts)` of them that stand in no excluded sample.

Beside the sample it writes a `.lock.json` with the seed, the share, the dataset commit, the counts,
the exclusions and the hash of the sample. An existing sample file is never replaced by a different
one. The same seed, share, commit and exclusions give the same sample, so anyone can draw it again.
Ordering by a [hash](https://en.wikipedia.org/wiki/SHA-2) of a seed and the text gives a
[simple random sample](https://en.wikipedia.org/wiki/Simple_random_sample) that can be repeated.

## Publication: accepted circuits become labels

`judge-publish.mjs` does three things:

- **Registry.** It writes one new file `<tag>.jsonl` into the registry, with one line per circuit
  judged in the run. It never overwrites a file, and never adds a second line for a circuit the
  registry already holds.
- **Labels.** Every circuit accepted in the run becomes the label of its message, whatever the row
  held before, also a label settled by agreement: a judge's word counts before agreement
  ([decision D6](../project/decisions.md#d6)). When several circuits of one message were accepted,
  the label is the one most formalizers wrote, then the one with the lowest item number.
- **Replaced agreement labels.** Since 17:45 on 2026-11-27, an agreement label that a publication
  replaces, and that the registry does not hold yet, is kept in the registry as an accepted reading,
  in `<tag>-replaced-agreement.jsonl`. Before that, such a circuit no longer appeared accepted
  anywhere: no registry line held it, and it was no longer the label.

Nothing is committed: committing the dataset is a separate step.

## How to read a GOAL

**Uncertainty.** On 1,831 messages a GOAL is known to about ±2 points: the 95%
[Wilson score interval](https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval#Wilson_score_interval)
that the status page prints. A difference of 1 or 2 points between two separate measurements can be
chance. Trials on the same messages with one change are [paired](https://en.wikipedia.org/wiki/Paired_difference_test)
and so more precise, but no paired test was run.

**L9 credits a formalizer whose circuit became the label.** A circuit equal to the label before the
run is L9 and is never judged. Most labels of the dataset were settled by
[agreement](agreement.md). Under the `relaxed` key, which ignores where a phrase with a linking
word starts ([three keys](agreement.md#written-alike-three-keys)), the circuit of the formalizer
named by `--prefer vss` stood for the group, so VSS's reading became the label
([T2](../project/tool-decisions.md#t2)). Two effects followed at the first
judging (commit `9f57aa3`):

- VSS collected L9 on most messages that had a label before the run, with no judge reading them in
  that run.
- VSS had no message at L10. On a labelled message its circuit usually was the label. The circuits
  of the other formalizers often differed from it, for example in where a phrase starts, so they
  needed a judge and landed at L10 when accepted.

An example is "make a bar chart of the projects by name please"
([Read judged circuits](judged-examples.md#example-4-accepted-with-an-ambiguity-mark)). Its label
before the run was VSS's reading, settled by agreement: L9 for VSS. A judge accepted another reading,
written by prolog, spacy and z3: L10 for them, and that reading replaced the label.

So report a GOAL together with the split between the messages that had a label before the run and
those that did not. The dated split of the first judging is in
[Results as first measured](../project/first-results.md). This page is the one place that explains
the mechanism.

**Rules found on the benchmark** make later scores on it too high: see
[Limits of the measurements](validity.md#no-longer-an-unseen-sample).

## Where the numbers are

- The live table: [STATUS.md: The benchmark, live](../STATUS.md#the-benchmark-live).
- Every judged measurement since the first: [STATUS.md: Progress over time](../STATUS.md#progress-over-time).

## How to run it

[Run the benchmark](../guides/run-benchmark.md), then [Judge a packet](../guides/judge-a-packet.md).
The options of each tool: [Benchmark tools](../reference/run-tools.md). A first hands-on run:
[Measure VSS on 20 messages](first-measurement.md).

## Standard, new here, particular

| Label | What |
| --- | --- |
| Standard | A random held-out sample ([simple random sample](https://en.wikipedia.org/wiki/Simple_random_sample)); a confidence interval for a share (Wilson). |
| New here | GOAL as defined here, judged by the project's rule; publishing every accepted circuit as the label of its message; labels frozen per run. |
| Particular | The sample is drawn from the WebMeet messages. |

Next: [Measure VSS on 20 messages](first-measurement.md) · Up: [Evaluation and labels](README.md)
