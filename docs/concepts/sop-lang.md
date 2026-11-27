[Home](../README.md) › [Concepts](README.md) › SOP Lang

# SOP Lang: the notation

This page: what SOP Lang is and how to write it (wires, circuits, values and references), with small
examples. Kind: Explanation.

## What SOP Lang is

**SOP Lang** is a small [declarative](https://en.wikipedia.org/wiki/Declarative_programming) notation:
it states facts and gives no steps to run. Each statement is one **wire**:

```text
@id type key=value key=value …
```

The wires written for one message form a **circuit**. A circuit is a small
[graph](https://en.wikipedia.org/wiki/Graph_(discrete_mathematics)) of facts, because some values point at
other wires.

The normative definition is SOP Lang v1.1, in the sibling repository `soplang-words-lib`, file
`docs/language.md`. Where any page of this wiki disagrees with that file, that file holds.

**The name.** Neither that file nor this repository expands the letters "SOP"; the name is used as it
stands.

## A first wire, piece by piece

```sop
@n1 syntax.nominal dependent="the" head="box"
```

| Piece | What it is |
| --- | --- |
| `@n1` | The id. `@` starts a wire; `n1` names it. An id is declared once in a circuit. |
| `syntax.nominal` | The type: what kind of fact this is. Its name starts with the name of the module that declares it, here the `syntax` schema ([next page](schemas.md)). |
| `dependent="the"` | One entry: the key `dependent` with the value `"the"`, a word of the message. |
| `head="box"` | Another entry: the key `head` with the value `"box"`. |

A nominal is the group of words that describe one thing; its head is the main word
([Grammar: phrases](grammar-phrases.md#nominal)). There are no spaces around `=`.

## The values

| Kind | Written, and what it means |
| --- | --- |
| String | In double quotes: `head="box"`. In a circuit it holds words of the message, as written. |
| Atom | Any other unquoted value: a bare word or a number, such as `imperative`, `10` or `5kg`. What it means is decided by the declaration of its key. Where that declaration lists allowed values (an enum, as for the keys `form` and `attachment`), it must be one of them. |
| Reference | `$` and an id: `complement=$n1` points at the wire `@n1`. |
| Variable | `?` and a name: `?x`. Only in rules and in queries (questions put to a set of facts). A fact may not contain one, so a circuit never does. |

## References make a graph

An example from the schema specification, for the message "delete the last row":

```sop
@c1 syntax.clause form=imperative verb="delete" complement=$n1
@n1 syntax.nominal dependent="the" dependent="last" head="row"
```

In plain words:

- `@c1` is a clause (one verb with what belongs to it): a command whose verb is "delete".
- Its key `complement` (a thing the verb takes; see [Grammar: the clause](grammar-clause.md)) holds the
  reference `$n1`.
- So the graph has one edge, from `c1` to `n1`, named `complement`: what is deleted is "the last row".
- `@n1` holds the three words "the", "last" and "row"; "row" is the head.

## Writing SOP Lang in brief

- **A key may repeat.** `dependent="the" dependent="last"` gives the key two values, in the order written.
- **A wire may span lines.** It runs until the next token that starts with `@`. Indentation means nothing.
  The circuits of this repository and of the dataset still put one wire on each line, and the checker in
  `lib/syntax.mjs` reads them that way.
- **`#` starts a comment**, to the end of the line. In examples, a comment line often gives the message.
- **There is nothing else:** no nesting, no lists, no operators.
- **Order.** In this project the order of the wires in a circuit carries no meaning: the judges do not
  judge it and the schema does not compare it. There is one exception: when a word occurs twice in a
  message, the values claim its occurrences in the order the circuit is written (Rule 1, on
  [The five rules](../schema/rules.md)).

The exact rules (identifiers, escapes in strings, errors) are on
[SOP Lang: exact rules](../reference/sop-lang.md).

## Why a notation of facts

- **One notation for everything.** The dataset's labels, the knowledge the applications use and the output
  of the formalizers are all written in SOP Lang. The definition puts it this way: one language serves for
  facts, for the declarations that say what facts may exist, and for queries. Even the hand-given file of
  the VSS formalizer (`strategies/vss/legend.sop`) is written in it.
- **Easy for a program to check.** Each wire is flat: an id, a type and key=value entries. A program can
  check every key and value against a schema, and every quoted word against the message
  ([next page](schemas.md)).

## Standard, new here, particular

**Standard.** Writing facts as statements of a subject, a key and a value is an established idea: compare
[RDF](https://en.wikipedia.org/wiki/Resource_Description_Framework) and its
[Turtle](https://en.wikipedia.org/wiki/Turtle_(syntax)) notation, or facts in
[Prolog](https://en.wikipedia.org/wiki/Prolog). SOP Lang is simpler than these: no nesting, no lists, no
operators.

**New here.** Nothing in this repository: the notation is used as it is defined.

**Particular.** SOP Lang is the project family's own notation, defined in `soplang-words-lib`; it is not a
public standard.

---

Next: [Schemas: which wires may exist](schemas.md) · Up: [Concepts](README.md)
