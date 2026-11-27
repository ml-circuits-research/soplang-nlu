[Home](../README.md) › [Evaluation and labels](README.md) › Converting the dataset

# Converting the dataset

This page: how the same tools give every semantic file its syntactic counterpart, through rounds,
the batch conversion and the fixer, and what a round may and may not change. Kind: Explanation.

## Testing and converting are one activity

A conversion round writes syntactic files for some source files of the [dataset](dataset.md), and
reports the same table of [levels](levels.md) as a [benchmark](benchmark.md)
([decision D8](../project/decisions.md#d8)). Each round thus also tests the
[formalizers](../formalizers/README.md) on files they were not tuned on.

## A round in words

`tests/benchmark/syntax/round.mjs` has one sub-command per step:

1. **start**: take the source files that have no syntactic file, the smallest first, until the
   round has at least 500 messages.
2. **run**: run the formalizers on the round's messages (`run.mjs`).
3. **settle**: accept what needs no judge (registry verdicts, labels, [agreement](agreement.md)),
   choose the [audit](audit.md) share, and put the rest into packets.
4. **judges** read the packets and write verdicts.
5. **rewrite-prepare**: the messages with no accepted circuit go to a judge who writes the circuit
   (the *fixer*).
6. **write**: publish the judges' decisions to the registry, and write the syntactic files.
7. **report**: how the messages were settled, and the table of levels.

Since round 2, only what the conversion needs is judged (`settle --judge needed`, owner's decision
[D9](../project/decisions.md#d9): one judge and one fixer per message; the default,
`--judge all`, sends every circuit, as round 1 did). For a message with no accepted circuit, the
judge reads the open circuit that
the most families wrote, then the most formalizers, then the first formalizer of `--prefer`; the
next one goes to a judge only after a rejection. What this saves: [Judges](judging.md#what-judging-costs).

## What a round publishes

- **Registry**: only what a judge decided, that is each circuit a judge read (audited agreed ones
  included) and each circuit a judge wrote. An agreed circuit that no judge read gets no registry
  line.
- **Syntactic file**: every message of the source file once, in order. A message gets the circuit
  accepted in the round, the one most formalizers wrote first; a message for which the round
  accepted nothing new keeps its label.
- **Never a filled cell.** A round never replaces a circuit already in a file. Replacing labels is
  the job of the benchmark publication ([T3](../project/tool-decisions.md#t3)).
- **Cell by cell.** Since commit `9b2831e` (19:26 on 2026-11-27), a file with the same messages in
  the same order is completed cell by cell: its empty cells are filled, and the circuits already
  there stay. Before that commit, a file in which the round would change any circuit was left whole,
  empty cells included. The evaluation report's "the whole file is left untouched" describes that
  earlier behaviour.
- **Open messages.** While a message of a file that does not exist yet has no circuit, `write`
  writes nothing and lists such messages. With `--allow-open` it writes empty cells for them
  instead.

In a round on an existing file, an L10 can report a replacement that `write` does not perform
([Levels: Subtleties](levels.md#subtleties)).

## The fixer

A message whose circuits were all rejected, or that no formalizer wrote a valid circuit for, has no
accepted circuit. `round.mjs rewrite-prepare` puts such messages into `rewriting/packet-<k>.jsonl`,
each with its rejected circuits and the judges' reasons. A judge, in the role of fixer, writes the
circuit. The checker `rewrite-check.mjs` tests each written circuit against the schema and the
message, says in plain words what to correct, and refuses a circuit equal to one already rejected.

A written circuit is accepted with no second judge, and its accuracy is not measured. Its label says
`accepted_by=written` only when no formalizer's circuit of the message was accepted.

## The batch conversion and the refill

After rounds 1 and 2, the rest of the dataset was converted in one pass on 2026-11-27:

1. `batch-run.sh` ran the formalizers over every semantic file with no syntactic file, one folder
   per file under `eval-results/conversion/`.
2. `batch-settle.sh` settled each folder with two families, the `relaxed` key, `--prefer vss` and a
   2% audit.
3. `pool.mjs` gathered the audit lines of all folders into packets of the usual size for judges, and
   handed the verdicts back.
4. `batch-write.sh` wrote each folder with `--allow-open`, leaving empty cells where nothing was
   settled.

Later the same day the batch folders were refilled: VSS and spaCy in their versions of that time
ran again, `settle` used the `variants` key with a 2% audit, and the empty cells were filled (the
journal, and [STATUS.md: Working on now](../STATUS.md#working-on-now)).

`round.mjs plan` now prints "No source file is left for a round.": every semantic file has its
syntactic file. Empty cells are therefore filled through the existing batch folders.
`batch-run.sh` with its third argument `open` runs the formalizers again on the batch files (their
earlier outputs moved aside first); then settle again, judge, and write with a new tag.

The first conversion with its counts: [The first conversion](../project/first-conversion.md). The
state now: [STATUS.md: The dataset](../STATUS.md#the-dataset).

## Open questions

- Should rounds replace labels too, as a benchmark publication does? An open point for the owner,
  in the journal.
- Why are the smallest files taken first? `pickFiles` sorts by size unless `--order name` is given,
  and no reason is recorded. The effect is measured: the early rounds overstate a reader
  ([Limits](validity.md#small-files-and-rounds-scored-on-their-own-rules)).

## How to run it

[Convert or refill the dataset in batch](../guides/batch-conversion.md) and
[Run a conversion round](../guides/conversion-round.md). Every option:
[Conversion tools](../reference/conversion-tools.md).

## Standard, new here, particular

| Label | What |
| --- | --- |
| Standard | Annotation in batches with a quality-control sample. |
| New here | Rounds that test and convert at once, taking the smallest files first; settling by families; one judge and one fixer per message; files completed cell by cell. |
| Particular | The source files of WebMeet, at most 1,000 messages each. |

Next: [Limits of the measurements](validity.md) · Up: [Evaluation and labels](README.md)
