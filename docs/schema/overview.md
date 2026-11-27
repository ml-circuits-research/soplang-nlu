[Home](../README.md) › [Syntax schema](README.md) › In brief

# The syntax schema in brief

This page: the schema's purpose, its four wire types with their key names, and one message read line by line; the exact definitions are on the reference pages. Kind: Explanation.

## Purpose

A formalizer sees one message and nothing else. It has no context and uses no knowledge worlds. It writes a `syntax` circuit directly from the text. The circuit does three things:

1. It splits the message into clauses and nominals.
2. It gives every word one place in one wire.
3. It ties the wires.

Everything that needs the meaning of the words is left to the next layer: who receives, what is the result, what a pronoun refers to, whether a question is really a request.

The schema is good enough when two authors of formalizers can take the same examples and tell, from this document alone, what structure must be kept and where several readings are allowed.

The grammar terms used here (clause, nominal, head, complement…) are explained from zero in [Grammar: the clause](../concepts/grammar-clause.md) and [Grammar: phrases](../concepts/grammar-phrases.md).

## The four wire types

There are four wire types and 18 keys. A quoted value holds words of the message. `$id` refers to another wire of the same circuit.

- **Clause** (`syntax.clause`): a verb with what belongs to it, or a group of words that has no verb. Keys: `form`, `verb`, `auxiliary`, `negation`, `subject`, `complement`, `modifier`, `discourse`, `ellipsis`.
- **Nominal** (`syntax.nominal`): a noun with the words that depend on it, or a pronoun, a name or a number. Keys: `head`, `dependent`.
- **Relation** (`syntax.relation`): a tie between two wires, often marked by a linking word. Keys: `from`, `to`, `marker`, `negation`, `attachment`.
- **Coordination** (`syntax.coordination`): wires joined side by side. Keys: `conjunct`, `conjunction`.

That makes 18 keys under 17 names: `negation` is a key of both clauses and relations. The relation keeps the plain names `from` and `to` because `dependent` is already a key of the nominal ([decision 6](decisions-names.md)).

Exact definitions: [Clause and nominal wires](clause-and-nominal.md) and [Relation and coordination wires](relation-and-coordination.md).

## One message, line by line

The message "move the blue box next to the red circle":

```sop
@c1 syntax.clause form=imperative verb="move" complement=$n1
@n1 syntax.nominal dependent="the" dependent="blue" head="box"
@n2 syntax.nominal dependent="the" dependent="red" head="circle"
@r1 syntax.relation from=$c1 to=$n2 marker="next to"
```

- `@c1` is a **clause**: a command (`form=imperative`) whose verb is "move" and whose complement (a nominal the verb takes) is the wire `n1`.
- `@n1` is a **nominal**: head "box", with the dependents "the" and "blue".
- `@n2` is the nominal "the red circle".
- `@r1` is a **relation**: the clause is tied to `n2` by the linking word (`marker`) "next to".

Every word stands in exactly one quoted value. This circuit settles where "next to the red circle" attaches: at the clause, with no mark. A formalizer may instead leave it open with `attachment=ambiguous` ([Rule 2](rules.md#rule-2-ambiguous-attachment)), as the whole message in [Relation and coordination wires](relation-and-coordination.md#a-whole-message) does.

## What makes it different

- **Every word exactly once.** Every word of the message stands in exactly one quoted value, written as in the message, not as a position number ([Rule 1](rules.md#rule-1-alignment-every-word-exactly-once)). A program can check this with no annotator.
- **Ambiguity is written, not guessed.** When the words do not settle where a phrase attaches, the relation starts at the clause and carries `attachment=ambiguous`, inside one circuit ([Rule 2](rules.md#rule-2-ambiguous-attachment)).
- **Several circuits can be right.** Where grammar allows two analyses, both pass ([What must be right](correctness.md#several-readings-pass)).
- **Nothing that needs meaning is stated.** There are no semantic roles and no kinds of relation ([boundary examples](correctness.md#boundary-examples)).

## Status of the specification

Status: version 3, in use. Version 1 was reviewed once. Version 2 answered that review. Version 3 uses the established terms of grammar and of dependency syntax and answers a second review. The section "Decisions and their reasons" records every decision, including the suggestions that were not adopted. That section is now two pages: [Decisions 1–5](decisions-review-1.md) and [Decisions 6–8](decisions-names.md).

The schema is implemented in `soplang-nlu`: the declaration in `schemas/syntax/schema.sop`, the checker and the writer in `lib/syntax.mjs`, the tests in `tests/syntax-contract.test.mjs`. They read nothing outside that package.

This document is self-contained. It defines the schema, the rules a formalizer follows, the examples that fix its limits, and the reasons behind each choice. ("This document" is now the pages of this section.)

## Terms

| Term | Meaning |
| --- | --- |
| Message | One text written by a user, for example "move the blue box next to the red circle". |
| Wire | One line of [SOP Lang](../concepts/sop-lang.md): `@id type key=value key=value`. |
| Circuit | The wires written for one message. |
| Formalizer | A program that reads a message and writes its circuit. Also called a reader or a strategy. |
| Next layer | Whatever reads the circuit afterwards, with context and knowledge, to decide what the message means. |
| `nlu` schema | The earlier, detailed schema for syntactic circuits, in `soplang-nlu/schemas/nlu/schema.sop`. It has more than 50 keys. |
| UD | [Universal Dependencies](https://en.wikipedia.org/wiki/Universal_Dependencies), the most widely used scheme for annotating syntax (Nivre et al. 2016; de Marneffe et al. 2021). |

More terms: [Glossary](../reference/glossary.md).

## Standard, new here, particular

**Standard.** The schema is a [dependency analysis](https://en.wikipedia.org/wiki/Dependency_grammar) in the style of UD, coarsened to the level of a chunker ([shallow parsing](https://en.wikipedia.org/wiki/Shallow_parsing)): nominals are flat groups with a head, and subject, complement, auxiliary and the markers of relations correspond to UD's relations ([Related work](related-work.md)). Marking an unsettled attachment applies a known idea, [underspecification](https://en.wikipedia.org/wiki/Underspecification), to the output of a parser.

**New here.** Three choices of this schema, each built on a standard idea rather than a new theory:

1. Quoted words instead of positions: a person can read the circuit, and `lib/syntax.mjs` can still check it against its message (the alignment rule, [Rule 1](rules.md#rule-1-alignment-every-word-exactly-once)).
2. One circuit per message, with an unsettled attachment marked in it by the key `attachment=ambiguous`, instead of a list of readings.
3. Several readings can be right, which changes how quality must be measured ([Judges and the judging rule](../evaluation/judging.md)).

**Particular.** The schema's choices are argued for English messages: for example, the head of a nominal "is usually the last noun" ([decision 5](decisions-review-1.md#decision-5-the-document-asked-for-more-than-the-evaluation-checked)). The figures quoted on these pages hold for this project's fixed sample of 1,831 messages.

---

Next: [Clause and nominal wires](clause-and-nominal.md) · Up: [The syntax schema](README.md)
