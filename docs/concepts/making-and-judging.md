[Home](../README.md) › [Concepts](README.md) › Written, judged, measured

# How circuits are written, judged and measured

This page: the terms formalizer, judge, label, agreement, audit, level, GOAL and benchmark, each in a few
lines with a link to its own page, before any later section uses them. Kind: Explanation.

## Formalizers

A **formalizer** is a program that reads one message and writes its circuit. The code calls it a
*strategy*; in NLP terms it is a parser. Each formalizer reads English from a different source of
knowledge, on purpose. Five are measured:

- **vss**: the project's own reader. It learns classes of words from raw text, with no labels; hand-written
  rules about English, which name only function words, then build the circuit.
- **spacy**: an outside [dependency parser](grammar-notation.md#the-dependency-tree) (spaCy's English
  transformer model) plus this project's layer that writes its parse as a circuit, with repairs.
- **distilbert**: a small [transformer](https://en.wikipedia.org/wiki/Transformer_(deep_learning)) language
  model (DistilBERT), pretrained by its makers on English text and then trained further (fine-tuned) on
  this project's labels.
- **prolog** and **z3**: hand-written grammars, one in [Prolog](https://en.wikipedia.org/wiki/Prolog) and
  one written as constraints and solved by the [Z3](https://en.wikipedia.org/wiki/Z3_Theorem_Prover)
  solver. Both are parked: still measured, not improved for now.

Formalizers that read the same source (for example several built on the same spaCy parse) form one
**family**. More: [Formalizers](../formalizers/README.md).

## Judges

A **judge** is a language-model agent that reads a message and one circuit and accepts or rejects the
circuit by written rules (`tests/benchmark/syntax/rules.md`). It does not know which formalizer wrote the
circuit. It asks one question:

> Can the next layer continue from this circuit by completing it, or must it first undo a wrong statement?

A circuit fails only when it states something wrong or loses information the words give. A rejection must
quote the words; if the judge cannot quote them, the circuit is acceptable. How often two judges, or a
judge and a person, agree on this schema has not been measured yet. More:
[Judges and the judging rule](../evaluation/judging.md).

## Labels

In machine learning a [label](https://en.wikipedia.org/wiki/Labeled_data) is the right answer stored for
an example. Here a **label** is the accepted circuit stored for a message in the dataset's syntactic layer.
Its row also says who wrote it and how it was accepted: `agreement`, `judge`, or `written` (a judge wrote
it because no formalizer's circuit was acceptable). Several circuits can be right for one message; the
label is one of them. More: [The WebMeet dataset and its labels](../evaluation/dataset.md).

## Agreement and the audit

When formalizers of different families write the same circuit for a message, that circuit becomes its
label without a judge: this is **agreement**. "The same" means equal once wire names and order are set
aside. Some runs also count two circuits as the same when they differ only in choices the judges' rules
let pass either way ([When two circuits are the same](../evaluation/normal-form.md)). A random share of
the agreed circuits is still read by a judge, to measure how often agreement is wrong: this is the
**audit**. More:
[Agreement between formalizers](../evaluation/agreement.md) and
[The audit of agreed circuits](../evaluation/audit.md).

## Levels and GOAL

Every circuit of a formalizer on a message gets a **level**. In short (the exact definitions are on [Levels L0–L10 and GOAL](../evaluation/levels.md)):

| Level | Meaning |
| --- | --- |
| L0 | No valid circuit. |
| L1–L6 | Rejected by a judge. The number names the kind of fault: the first of L1 to L6 that applies. |
| L7 | Not used. |
| L8 | Accepted, but neither L9 nor L10: for example accepted in an earlier run, or accepted in this run for a message that had no label. |
| L9 | Equal to the label the message had before the run, so no judge was needed. |
| L10 | Accepted in this run, by a judge or by agreement, for a message that had another label; a benchmark publication then replaces that label (a conversion round does not). |

**GOAL** is the share of messages whose circuit is at L8, L9 or L10. The aim is over 99%. More:
[Levels L0–L10 and GOAL](../evaluation/levels.md).

## The benchmark

The **benchmark** is a random 1% of the dataset's messages. Every circuit of every formalizer on it is
either judged or equal to the message's label, so a formalizer's GOAL on it is a complete count. Its
messages are kept out of training on labels (from DistilBERT's checkpoint `syntax-v2` on; an earlier
checkpoint was trained on data that included some of them). It is no longer an unseen sample, though:
some rules were found by reading its rejected circuits
([Limits of the measurements](../evaluation/validity.md)).
More: [The benchmark](../evaluation/benchmark.md).

The usual way to score a parser, word by word against a hand-annotated tree, did not fit here: there was
no annotated data for this schema, and several circuits can be right for one message.

## The loop

1. The formalizers write circuits for a set of messages.
2. Each circuit is compared with the message's label, and with the circuits judges have already read.
3. What is left is settled by agreement (with the audit) or read by a judge.
4. Accepted circuits are published as labels in the dataset.
5. The formalizers are measured again, against the grown labels.

The current numbers are only on the status page: [STATUS.md](../STATUS.md).

## Standard, new here, particular

**Standard.** Measuring a parser on messages held out of its training
([test set](https://en.wikipedia.org/wiki/Training,_validation,_and_test_data_sets)), drawn at random
([simple random sample](https://en.wikipedia.org/wiki/Simple_random_sample)). Using a
[large language model](https://en.wikipedia.org/wiki/Large_language_model) as an evaluator. Checking
agreement between raters ([inter-rater reliability](https://en.wikipedia.org/wiki/Inter-rater_reliability)),
trusting what independent systems agree on ([co-training](https://en.wikipedia.org/wiki/Co-training)),
and reading a random share as a control
([acceptance sampling](https://en.wikipedia.org/wiki/Acceptance_sampling)).

**New here.** The procedure built from these parts: judged acceptance in which several circuits can be
right, with every settled case written into the rules; labels made by agreement of formalizers from
different families, checked by an audit; and the levels L0–L10.

**Particular.** The messages are those of WebMeet, and the judges' settled cases come from them.

---

Next: [Read your first circuit](first-circuit.md) · Up: [Concepts](README.md)
