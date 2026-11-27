[Home](../README.md) › [Evaluation and labels](README.md) › Judges

# Judges and the judging rule

This page: who judges circuits, by which rule, why a judge rather than exact match with the label,
what judging costs, and what is not known about judges. Kind: Explanation.

## Who judges

The judges are language-model agents; the lines of the
[registry](../reference/glossary.md#project-terms) of judge decisions name the model
`claude-opus-5-5`. A judge reads two things:

- `judging/RULES.md`, before every packet and again in the middle of a long one. It is a copy of
  [tests/benchmark/syntax/rules.md](../../tests/benchmark/syntax/rules.md) that the tools put into
  each run folder.
- One packet, `judging/packet-<k>.jsonl`. Each line holds a number, the message and one circuit in
  [normal form](normal-form.md). Nothing tells which [formalizer](../formalizers/README.md) wrote
  the circuit.

The benchmark tools do not start judges. `judge-prepare.mjs` prints the one instruction a judge
needs (read `RULES.md` and one packet, write the verdicts beside it, run the check); how to hand a
packet to a judge is in [Judge a packet](../guides/judge-a-packet.md#start-a-judge). Any further
instruction the agents received on 2026-11-27, and how packets were assigned to them, are not
recorded in the repository.

## The rule in one question

> Can the next layer continue from this circuit by completing it, or must it first undo a wrong
> statement?

The *next layer* is the semantic reading that later takes the circuit, with context, and decides
what the message means ([From a message to an action](../concepts/message-to-action.md)). A circuit
fails only when it states something wrong or loses information the words give. Plausible and
incomplete readings pass.

A rejection must quote the words of the message and name the wrong statement or the lost
information. `rules.md` says: "If you cannot quote the words, the circuit is acceptable." Each line
is judged by itself, and never against the circuit the judge would have written.

An external reviewer proposed this criterion and the owner adopted it
([decision D2](../project/decisions.md#d2)).

The rule speaks of the parts of a circuit: clauses, nominals (the words that describe one thing),
relations, coordinations and the *wires* (lines) that hold them. They are explained in
[The syntax schema in brief](../schema/overview.md) and in the
[glossary](../reference/glossary.md#grammar-terms).

## Why a judge, and not exact match with the label

Several circuits can be right for one message. For example, a phrase with a linking word may start
at the clause or at a nominal of it. The label is only one of the right circuits: when a run accepts
several circuits of one message, the tools keep the one most formalizers wrote, then the one with
the lowest item number (`chooseLabels` in `tests/benchmark/syntax/lib.mjs`). Exact match with the
label would count the other right circuits as wrong. So every circuit that differs from the label is
judged.

## What must be right, what may vary

In short (the exact wording is in [rules.md](../../tests/benchmark/syntax/rules.md); wide tables,
best read on a computer):

- **Must be right**: the split into clauses and their form; the verb of each clause; which words
  form each nominal and its head; the subject and the complements; the end and the linking word of
  every relation, and its start when the words settle it; the members of every coordination.
- **May vary**: where a relation with a linking word starts; which earlier wire a coordination
  joins, when grammar allows several; a word that can be a noun or a verb; a misspelt word.
- **Not judged**: what a complement or modifier means for the verb; which clause holds a word said
  to the listener; the names and order of wires; whether a question is meant as a request; what a
  pronoun refers to; anything only context or world knowledge would settle.

The same criteria, seen from the schema: [What must be right](../schema/correctness.md).

## Grades

A judge gives L8 (acceptable) or the first of L1 to L6 that applies. The number names the first kind
of fault found, not how bad the circuit is. The grades are listed once, in
[Levels: Grades](levels.md#grades).

## Settled cases

Whenever judges ruled differently on the same construction, or asked, the case was written into the
section "Settled cases" of `rules.md`, so that later judges rule alike. Its current number of cases
is in that file. Where the rules came from, all on 2026-11-27:

| Commit | What it added |
| --- | --- |
| `8fb0205` | the criterion, in `strategies/hmm-rules/judging-rules.md` (the earlier `nlu` schema) |
| `615e232`, `9196fe7` | the first settled cases there |
| `e166870` | `tests/benchmark/syntax/rules.md` created, for the syntax schema |
| `24de853` | five settled cases |
| `01695d3` | six settled cases from conversion round 1 |
| `a81dd93` | three settled cases from the benchmark judges |

## What judging costs

Counted on 2026-11-27:

- Round 1 sent every formalizer's circuit to a judge: 1,798 circuits for 575 messages.
- Sending only the circuit the conversion needs (`--judge needed`, owner's decision
  [D9](../project/decisions.md#d9): one judge and one fixer per message) cut this: round 2 sent
  738 circuits for 598 messages.
- The audit of the batch conversion was pooled: 1,718 lines in 11 packets, instead of a judge for
  each of the 217 folders, which held only a few audit lines each.
- The first judging of the benchmark needed 5,858 distinct circuits in 35 packets, because every
  formalizer needs a level there.

No time or money spent on judging is recorded.

## What is not known about judges

- **Two judges**: how often two judges give the same verdict on the same circuit is not measured;
  each circuit was read by one judge. That settled cases had to be written shows that judges
  sometimes disagree.
- **Judge and person**: how often a judge agrees with a human annotator is not measured.
- **A limit from the nlu era** (the earlier, larger schema; see
  [The nlu period](../project/nlu-period.md)): on the morning of 2026-11-27, judges accepted only
  93% of hmm-rules readings identical to circuits already accepted, and the hmm-rules page of that time
  concluded "so no design can measure near 99%" (as cited in the syntax-work report). Whether the
  simpler schema and rules reduce this disagreement is not known.
- **Verdicts written by a script**: two judge agents read all their circuits and then wrote
  all-accept verdict files with a script. An automatic safety check flagged both (session notes,
  not in the repository). The session checked only that they had changed nothing else; no
  spot-check of those packets is recorded.
- **The quote check** of `check.mjs` shows that a rejection points at words of the message, not
  that it is right.

More limits: [Limits of the measurements](validity.md).

## Verdict lines and their check

How a judge writes `verdicts-<k>.jsonl` and checks it: [Judge a packet](../guides/judge-a-packet.md).

## Standard, new here, particular

| Label | What |
| --- | --- |
| Standard | A [large language model](https://en.wikipedia.org/wiki/Large_language_model) as an evaluator ("LLM as a judge"); [blind](https://en.wikipedia.org/wiki/Blinded_experiment) reading, where the judge does not know who wrote the circuit; written annotation guidelines that are extended whenever annotators decide a case differently. |
| New here | The one-question criterion with the quote requirement, and the grades L1–L6. |
| Particular | The settled cases come from this data's messages. |

Next: [Read judged circuits](judged-examples.md) · Up: [Evaluation and labels](README.md)
