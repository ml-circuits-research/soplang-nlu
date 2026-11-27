[Home](../README.md) › [Concepts](README.md) › Worlds

# Worlds of knowledge

This page: the worlds of knowledge that the meaning layer uses, and why the formalizers of this
repository use none. Kind: Explanation.

## What a world is

A **world** is a body of knowledge written in SOP Lang. Each world is a module (its types, keys and rules)
and, for a knowledge world, its facts.

- The worlds are kept in the sibling repository `sop-knowledge-worlds`.
- They are run by **sopworld**, the library of the sibling repository `soplang-words-lib`.

The meaning layer of the [previous page](syntax-and-semantics.md) needs such knowledge: what a calendar
is, what a meeting has, which acts exist. Its own schema, `w.request`, is one of these worlds.

## Three kinds of worlds

| Kind | What it holds |
| --- | --- |
| World schema | What a kind of world is: its kinds of things, their attributes, value types, acts, limits, rules and the words for them. It holds no particular things. Example: `w.calendar`, a calendar with the days of a month and the events on them. |
| Knowledge world | Facts about the world at large, true for everyone, with no session state. Example: `k.animals` (a rabbit is a mammal; its young is a kit). That repository also counts `w.lang.en`, about English, as a knowledge world, despite its `w.` prefix. |
| Live world | One running instance of a world schema in a session: the things a user made, the focus, the history and undo. It is never stored in that repository. |

## Shards and modules

- **Shards hold facts, modules hold rules.** A world's facts are split into small files called shards. A
  rule is written in the world's module (`schema.sop`), never in a shard. A host (the program that runs
  sopworld, such as an application) that loads a module gets its rules once; a host that loads shards
  gets facts only.
- **Loading on demand.** A catalog lets an application load only what a message needs:
  `docs/worlds/index.json` lists every world with its schema, shards, sources and licences, and
  `docs/worlds/vocab.json` maps an English word to the shards where it matters.

## What belongs where

That repository draws the line in three places:

- **The knowledge repository** holds every world written in SOP Lang alone that more than one application
  could use. `k.*` is knowledge (facts and their schemas); `w.*` is reusable worlds (schemas of things a
  user makes and changes). Nothing there names an application.
- **The library** (`soplang-words-lib`) holds the engine and every module that needs a function: the acts
  themselves, fillers, solvers, arithmetic on units.
- **An application** keeps what is true only of it or of one user: its tabs and commands, the wording of
  its replies, the things of a session.

## Why the formalizers use no world

The formalizers of this repository read only the words of the message, so they need no world and load
none. The owner's decision [D4](../project/decisions.md#d4) says so: every formalizer writes the syntax
schema directly, with no knowledge repository. The tools keep to it. The benchmark tool
(`tests/benchmark/syntax/run.mjs`) removes the setting that names a knowledge folder (`SOP_KNOWLEDGE_DIR`)
before it loads a formalizer, and the common reader checks a syntax circuit with this package alone.

It was not always so. Until they were ported on 2026-11-27 (D4), the formalizers wrote an earlier,
richer schema, `nlu`, and were
opened with worlds that supplied vocabulary, schemas and knowledge; checking those circuits needed the
knowledge repository. See [The nlu-schema period](../project/nlu-period.md).

## Standard, new here, particular

**Standard.** None used here. (The general field is
[knowledge representation](https://en.wikipedia.org/wiki/Knowledge_representation_and_reasoning).)

**New here.** Nothing in this repository.

**Particular.** The organisation of worlds (world schemas, knowledge worlds, live worlds, shards and
catalog) is the project family's own, and the formalizers of this repository do not use it. How many
worlds exist is written by that repository's own tools, so it is not repeated here.

---

Next: [Grammar: the clause](grammar-clause.md) · Up: [Concepts](README.md)
