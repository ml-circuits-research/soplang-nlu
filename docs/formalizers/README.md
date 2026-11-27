[Home](../README.md) › Formalizers

# Formalizers

This page: the index of the section on formalizers. It says what a formalizer is, why there are several, which ones are active, parked, retired or in design, and which page describes each. Kind: Explanation.

## What a formalizer is

A formalizer is a program that reads one message alone and writes one [circuit](../concepts/first-circuit.md) for it: a few lines of SOP Lang that write down the grammatical structure of the message, in the [syntax schema](../schema/README.md). It sees no earlier message and no knowledge of the application.

In the terms of natural language processing, a formalizer is a [parser](https://en.wikipedia.org/wiki/Parsing). It finds the grammatical structure of a sentence and writes it down.

Each formalizer lives in a folder `strategies/<name>/` of the repository. The code calls a formalizer a **strategy**, and the two words mean the same here.

A strategy exports an object `{name, schema: 'syntax', open}`. The common reader (`lib/reader.mjs`) opens it, sends it messages and checks every circuit it returns against the schema. The exact contract is in [Library API](../reference/library.md). How to write a new one is in [Write a new formalizer](../guides/write-a-formalizer.md).

## Why there are several

Each formalizer reads English from a different source of knowledge:

| Source | Formalizer |
| --- | --- |
| Raw text | VSS learns word classes from the dataset's messages, with no labels. |
| Treebanks | spaCy's parser was trained by its makers on [treebanks](https://en.wikipedia.org/wiki/Treebank): English sentences annotated with their structure. |
| Labels | DistilBERT is fine-tuned on this project's accepted circuits, the [labels](../evaluation/dataset.md). |
| Hand-written | Prolog and Z3 hold grammars written by hand. |

This is deliberate. When formalizers from different sources write the same circuit for a message, this agreement is evidence that the circuit is right. Formalizers that read from one source repeat each other's faults, so their agreement says little. [Agreement between formalizers](../evaluation/agreement.md) explains how agreement is measured and used.

## Active

The three formalizers being improved now.

- [VSS](vss.md): the reader built in this project, and the main focus. *Explanation.* Because VSS is the main focus, it also has a section of its own, [VSS in depth](../vss/README.md), one level below this page in detail: training, the legend, reading, linking, the rule catalogue.
- [spaCy](spacy.md): an outside dependency parser, with this project's circuit writer, repairs and word lists. *Explanation.*
  - [spaCy: how a circuit is written](spacy-details.md): the transport, the steps, every repair, the repair rounds, the tests. *Reference.*
- [DistilBERT](distilbert.md): a small transformer model, fine-tuned on this project's circuits. *Explanation.*
  - [DistilBERT: model, output stage, options, checkpoints](distilbert-details.md). *Reference.*

## Parked

Parked means still measured, but not improved for now. This is the owner's decision.

The owner keeps at most four strategies, each with a different source of analysis: VSS, spaCy, DistilBERT and one hand-written grammar ([decision D10](../project/decisions.md#d10)). Prolog and Z3 both stand for that fourth place. Which of them keeps it is open.

- [Prolog (parked)](prolog.md): a hand-written grammar in Prolog. *Explanation.*
- [Z3 (parked)](z3.md): a hand-written grammar written as constraints and solved by the Z3 solver. *Explanation.*

## Others

- [Retired formalizers](retired.md): eight formalizers kept in the code. Each is too close to an active one, so they are left out of the [conversion rounds](../evaluation/conversion.md) and the [benchmark](../evaluation/benchmark.md). They still run by name. *Reference.*
- **strict-vss** (in design, not measured). A separate formalizer the owner asked for. It reads a message the way the earlier vector-symbolic reader did ([History in brief](../project/history.md#strict-vss)). The message is composed into one vector state by binding and bundling, the operations of a [vector symbolic architecture](https://en.wikipedia.org/wiki/Hyperdimensional_computing). The circuit is then read out of that state by unbinding and cleanup, which means taking the nearest item in a codebook. No rule names a word. Nothing is trained yet. The design and its first measurements are in [strategies/strict-vss/DESIGN.md](../../strategies/strict-vss/DESIGN.md) (first draft in commit `f5be34c`, revised since). The strategy `vss` stays as it is and keeps its name.

## Comparing

- [Speed and cost: what to consider](speed.md): how speed is measured, what each formalizer needs to run, and which comparisons are not like for like. *Explanation.*

## How each formalizer page is built

Every formalizer page has the same headings, in this order:

1. **What it is**: the program, its source of knowledge, where its code is.
2. **How it reads a message**: the steps, in short.
3. **Standard, new here, particular**: which parts are established, which were designed in this project, and which hold only for this project's data. The three labels are explained in [What is new here](../project/what-is-new.md#the-three-labels).
4. **Speed and cost**: one line. The comparison is on [Speed and cost](speed.md).
5. **Known limits**: what it gets wrong or cannot do.
6. **Run it**: links to the how-to guides.
7. **Details**: the reference page, where there is one.

## Which is most accurate, which is fastest

Scores and speeds change with every round of work, so the pages of this section do not repeat them. The status page answers both questions in its first table, [At a glance](../STATUS.md#at-a-glance), and in full under [the benchmark, live](../STATUS.md#the-benchmark-live) and [speed and cost per strategy](../STATUS.md#speed-and-cost-per-strategy).

In the measurements recorded so far (2026-11-27), spaCy had the highest GOAL each time, and VSS and Prolog were the fastest, at about a millisecond per message or less ([Speed and cost](speed.md#orders-of-magnitude)).

---

Next: [VSS](vss.md) · Up: [Home](../README.md)
