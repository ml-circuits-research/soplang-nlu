[Home](../README.md) › [Evaluation and labels](README.md) › Normal form and core

# When two circuits are the same

This page: the normal form and the core that every comparison in the tools uses. Kind: Reference.

Every comparison in the tools is a comparison of cores: whether a
[circuit](../concepts/first-circuit.md) is the label of its message, whether the
[registry](../reference/glossary.md#project-terms) holds it, whether two
[formalizers](../formalizers/README.md) wrote it alike. The core is computed in two steps: first
the normal form, then the core of that form.

## Normal form

`normalForm(text, sop)` in `tests/benchmark/syntax/lib.mjs` rewrites a valid circuit so that:

- wires are named `c`, `n`, `r`, `k` with a number, in the order of their first word;
- `dependent`, `modifier`, `auxiliary`, `negation` and `discourse` hold one word per value;
- `marker` and `conjunction` hold a run of neighbouring words as one value;
- a clause lists its subject, then its complements; a relation lists `from`, then `to`.

It returns `null` for a circuit that is not valid for the message. The letters:

| Letter | Wire type |
| --- | --- |
| `c` | `syntax.clause` |
| `n` | `syntax.nominal` |
| `r` | `syntax.relation` |
| `k` | `syntax.coordination` |

The wire types are explained in [The syntax schema in brief](../schema/overview.md).

## Core

`coreOf(text, sop)` in `lib/syntax.mjs`, applied to the normal form, gives a sorted list of lines.
Its code comment: "equal for two circuits that place every word alike and tie the same wires".

- Positions count the words of the message from 0; punctuation is left out.
- A wire is named by the position of its first word. A relation is named `(start>end)`, from the
  names of its `from` and `to` wires; a coordination `[a+b]`.
- A span line such as `3-4 marker @(0>5)` says which words a value holds, under which key, in which
  wire.
- The other lines give a wire's references (`clause 0 complement 1`: the complement of the clause
  that starts at word 0 is the nominal that starts at word 1) and its unquoted values
  (`clause 0 form imperative`).

Wire names and line order no longer matter.

## A worked example

Two circuits written differently, from the test "the normal form is one text for one circuit,
whoever wrote it" in `tests/syntax-benchmark.test.mjs`:

```
# put the cat next to the red box
# strategy A
@c1 syntax.clause form=imperative verb="put" complement=$n1
@n1 syntax.nominal dependent="the" head="cat"
@r1 syntax.relation from=$c1 to=$n2 marker="next to"
@n2 syntax.nominal dependent="the" dependent="red" head="box"
# strategy B
@thing syntax.nominal head="cat" dependent="the"
@place syntax.nominal dependent="the red" head="box"
@link syntax.relation marker="next" marker="to" to=$place from=$act
@act syntax.clause complement=$thing verb="put" form=imperative
```

Both have this normal form:

```
@c1 syntax.clause form=imperative verb="put" complement=$n1
@n1 syntax.nominal dependent="the" head="cat"
@r1 syntax.relation marker="next to" from=$c1 to=$n2
@n2 syntax.nominal dependent="the" dependent="red" head="box"
```

and this core:

```
0-0 verb @0
1-1 dependent @1
2-2 head @1
3-4 marker @(0>5)
5-5 dependent @5
6-6 dependent @5
7-7 head @5
clause 0 complement 1
clause 0 form imperative
relation (0>5) from 0
relation (0>5) to 5
```

The normal form and the core were printed with `normalForm` on 2026-11-27 for the evaluation report.

## Why it is done this way

- **Blind judging.** Wire names such as `@thing` would tell a judge who wrote a circuit. In normal
  form, a circuit written by several formalizers reaches the judge once and looks the same whoever
  wrote it.
- **One circuit, one core.** `coreOf` alone tells apart circuits that say the same thing:
  `marker="next to"` against `marker="next" marker="to"`, or `from=$a to=$b` against
  `to=$b from=$a`. The test checks that the two raw cores above differ and the two normal forms are
  equal.
- **One text everywhere.** Packets, the registry and the syntactic files all hold circuits in normal
  form, so the same circuit always has the same text.

## Details

- `attachment=ambiguous` is part of the core: the same circuit with and without the mark counts as
  two circuits. Only the wider keys of [agreement](agreement.md) join them.
- When repeated words cross between wires, the normal form sometimes cannot be written. `normalForm`
  then keeps the core of the circuit as written (`kept: 'as written'`), and such a circuit may fail
  to match the same reading written in another order. How often this happens is not measured. The
  known limit of [Rule 1](../schema/rules.md) gives 2 to 8 of 1,831 messages with crossing
  repeated words, depending on the formalizer.
- The registry stores a `core` field, but `readRegistry` computes the core again from the text and
  the circuit, so a change of `coreOf` is picked up without rewriting the registry.
- The core of a label is computed only when a tool asks for it, so reading all the syntactic files
  costs no core computation until a run looks up its own messages.

The library functions: [Library API](../reference/library.md).

## Standard, new here, particular

| Label | What |
| --- | --- |
| Standard | A [canonical form](https://en.wikipedia.org/wiki/Canonical_form), so that equal things compare equal by exact match. |
| New here | This normal form and core for SOP Lang circuits of the syntax schema. |
| Particular | None. |

Next: [The benchmark](benchmark.md) · Up: [Evaluation and labels](README.md)
