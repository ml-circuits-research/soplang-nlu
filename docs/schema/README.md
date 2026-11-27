[Home](../README.md) › Syntax schema

# The syntax schema

This page: the index of the section on the syntax schema: what the schema is, and which page holds which part of it. Kind: Explanation.

## What the schema is

A formalizer reads one message and writes a **circuit**: a few lines of [SOP Lang](../concepts/sop-lang.md), one line (a **wire**) per part of the sentence. The syntax schema says which wires such a circuit may contain and which keys each wire may have. For "delete the last row":

```sop
@c1 syntax.clause form=imperative verb="delete" complement=$n1
@n1 syntax.nominal dependent="the" dependent="last" head="row"
```

The schema is version 3. It has four wire types (clause, nominal, relation, coordination) and 18 keys. It is declared in `schemas/syntax/schema.sop` and checked by `lib/syntax.mjs`.

This section holds the schema's full specification. It was formerly one file, `docs/syntax-schema.md`, and was reviewed twice. Its substance is kept exactly, split over the pages below; a script compared the old file with these pages sentence by sentence.

New to circuits? Read [Schemas: which wires may exist](../concepts/schemas.md) and [Read your first circuit](../concepts/first-circuit.md) first.

## Where the schema is used

- **Formalizers** write one circuit in this schema for each message, from the words alone, with no knowledge worlds: [Formalizers](../formalizers/README.md).
- **The checker.** A strategy that declares `schema: 'syntax'` is always checked by `lib/syntax.mjs`, called by the common reader `lib/reader.mjs`: the types and keys of the schema, and every word of the message in exactly one value. The functions are on [Library API](../reference/library.md).
- **Judges** accept a circuit or reject it with a grade, by written rules that build on this specification: [Judges and the judging rule](../evaluation/judging.md).
- **Labels.** Accepted circuits become the labels of the WebMeet dataset: [The WebMeet dataset and its labels](../evaluation/dataset.md).
- **The next layer** reads the circuit later, with context and knowledge, and decides what the message means. It is not part of this repository: [Syntax and semantics: the two layers](../concepts/syntax-and-semantics.md).

## In brief

- [The syntax schema in brief](overview.md): the purpose, the four wire types, one message read line by line, and what is Standard and what is New here. *Explanation.*

## The wires

- [Clause and nominal wires](clause-and-nominal.md): the exact keys of `syntax.clause` and `syntax.nominal`, with examples. *Reference.*
- [Relation and coordination wires](relation-and-coordination.md): the exact keys of `syntax.relation` and `syntax.coordination`, and one whole message written with all four types. *Reference.*

## Rules

- [The five rules](rules.md): alignment, ambiguous attachment, a shared verb, a measure before a marker, places fixed by position. *Reference.*
- [What must be right, and boundary cases](correctness.md): what a formalizer must get right, where several readings pass, what is not compared, and nine boundary examples. *Reference.*

## Why, and where it came from

- [Decisions 1–5: the first review](decisions-review-1.md): the answers to the first review, with their reasons. *Explanation.*
- [Decisions 6–8: names, punctuation, second review](decisions-names.md): the established names and their sources, punctuation, the second review, and the suggestions not adopted. *Explanation.*
- [Related work, weak points, open questions](related-work.md): each choice against the literature, the weak points still open, the questions for the reviewer. *Explanation.*
- [From the nlu schema](nlu-mapping.md): the rule-by-rule mapping from the earlier `nlu` schema, and what was measured with version 1. *Reference.*

## Quick routes

| Reader | Read |
| --- | --- |
| First read | [Overview](overview.md), then [The five rules](rules.md). |
| Exact keys | [Clause and nominal](clause-and-nominal.md), then [Relation and coordination](relation-and-coordination.md). |
| Reviewer | [Decisions 1–5](decisions-review-1.md), [Decisions 6–8](decisions-names.md), [Related work](related-work.md). |
| Judge | [Correctness](correctness.md), then the judges' rules in [tests/benchmark/syntax/rules.md](../../tests/benchmark/syntax/rules.md), which go further. |

---

Next: [The syntax schema in brief](overview.md) · Up: [Home](../README.md)
