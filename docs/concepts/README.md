[Home](../README.md) › Concepts

# Concepts

This page: the list of the concept pages in reading order, so that a newcomer can learn the project from
zero. Kind: Explanation.

The project reads one English message that a person typed to an application, and writes down how the
sentence is built: its syntax. It writes this as a **circuit**, a small set of facts in the **SOP Lang**
notation. Programs called **formalizers** write the circuits; language-model **judges** check them.

The pages below explain each of these ideas from zero. Each page builds on the one before it, and the last
one is a tutorial in which you read a real circuit line by line. Read them in order the first time; later,
use the [Glossary](../reference/glossary.md) to look a term up.

## The system and its notation

1. [From a message to an action](message-to-action.md): the three steps from a typed message to what the
   application does, and which of them this repository does.
2. [SOP Lang: the notation](sop-lang.md): wires, circuits, values and references, with small examples.
3. [Schemas: which wires may exist](schemas.md): how a schema is declared in SOP Lang, read from the
   syntax schema's own file.
4. [Syntax and semantics: the two layers](syntax-and-semantics.md): one message written in both layers, and
   why syntax comes first.
5. [Worlds of knowledge](worlds.md): the knowledge the meaning layer uses, and why the formalizers of this
   repository use none.

## Grammar

6. [Grammar: the clause](grammar-clause.md): clause, verb, auxiliary, negation, subject, complement, clause
   types, fragment, nonfinite verb forms, ellipsis and discourse words.
7. [Grammar: phrases, linking words, attachment](grammar-phrases.md): noun phrase, head, dependent,
   nominal, modifier, the linking words, coordination, function words and attachment ambiguity.
8. [How grammar is usually written down](grammar-notation.md): dependency trees, Universal Dependencies and
   the other standard formats, and why this project writes a coarser circuit.

## Judging, and a first circuit

9. [How circuits are written, judged and measured](making-and-judging.md): formalizers, judges, labels,
   agreement, the audit, levels, GOAL and the benchmark.
10. [Read your first circuit](first-circuit.md) (Tutorial): two real circuits, read line by line.

## What you will know at the end

- What a circuit says about a message, and what it leaves to the layer after it.
- How to read any wire of the syntax schema, and how a program checks it.
- The grammar terms that the schema's keys and the judges' rules use.
- How a circuit becomes a label of the dataset, and how a formalizer gets its score.

## How the pages are built

- The first line shows where you are (Home › Concepts › page). The last line gives **Next** (the page to read
  after this one) and **Up** (this index).
- The line under the title says what the page is for and its kind. Pages in this section are explanations,
  except the last one, which is a tutorial.
- Where a page describes a piece of the project, a section says what is **Standard** (an established idea or
  tool, used as the field knows it), what is **New here** (designed in this project) and what is
  **Particular** (holds only for this project's language, data or setting).
- Established ideas link to Wikipedia. Current numbers (scores, speed, how much of the dataset is labelled)
  are only on the status page, [STATUS.md](../STATUS.md); these pages link to it instead of repeating them.

## After this section

- The syntax schema in full: [The syntax schema](../schema/README.md).
- Any term: [Glossary](../reference/glossary.md).

---

Next: [From a message to an action](message-to-action.md) · Up: [Home](../README.md)
