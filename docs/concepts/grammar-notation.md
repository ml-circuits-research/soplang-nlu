[Home](../README.md) › [Concepts](README.md) › How grammar is written down

# How grammar is usually written down

This page: dependency trees, Universal Dependencies and the other standard formats, and why this project
writes a coarser circuit instead. Kind: Explanation.

## The dependency tree

The most widely used format today is the
[dependency tree](https://en.wikipedia.org/wiki/Dependency_grammar). Every word points to the word it
depends on, its head, and the tie has a name, called a dependency relation. One word, usually the main
verb, depends on nothing: it is the root.

"put the box on the table", in the relation names of Universal Dependencies (below):

```text
put                    the root
box   -> put    obj    what is put
the   -> box    det
table -> put    obl    where it is put
on    -> table  case
the   -> table  det
```

Read a line as "the word `box` depends on `put`, as its object (`obj`)". The preposition "on" depends on
"table" (`case`), not the other way round. If "on the table" said which box, the line for "table" would be
`table -> box  nmod` instead: this is the attachment question of
[Grammar: phrases](grammar-phrases.md#attachment-ambiguity).

## Universal Dependencies

[Universal Dependencies](https://en.wikipedia.org/wiki/Universal_Dependencies) (UD) is a common set of
relation names for many languages, with collections of sentences annotated in it (Nivre et al. 2016;
de Marneffe et al. 2021). A few of its relation names:

| Name | The tie |
| --- | --- |
| `nsubj` | the subject of a verb |
| `obj` | the object of a verb |
| `obl` | a noun phrase that depends on the verb but is not its subject or object, often with a preposition |
| `nmod` | a noun phrase that depends on another noun |
| `det` | a determiner ("the", "a") |
| `amod` | an adjective that describes a noun |
| `case` | a preposition (or the possessive "'s"), on its noun |
| `mark` | a subordinator ("if") or the infinitive "to", on its clause |
| `conj`, `cc` | a conjunct, and the joining word of a coordination |

A large collection of sentences annotated by hand is a
[treebank](https://en.wikipedia.org/wiki/Treebank). Statistical parsers are trained on treebanks; the
[spaCy](https://en.wikipedia.org/wiki/SpaCy) parser that one formalizer of this project uses was trained by
its makers on large English treebanks.

## Other formats

**Constituency trees** ([phrase structure](https://en.wikipedia.org/wiki/Phrase_structure_grammar)) nest
phrases inside phrases. The same sentence, as brackets:

```text
[VP put [NP the box] [PP on [NP the table]]]
```

**Chunking**, or [shallow parsing](https://en.wikipedia.org/wiki/Shallow_parsing), only groups words into
flat phrases that do not nest, and does not say how the phrases are tied:

```text
[VP put] [NP the box] [PP on] [NP the table]
```

## Why these formats are not used directly

- They are made for linguists and for training parsers.
- A tree gives one reading per sentence; it has no way to say "the words leave this open".
- They record distinctions (dozens of relation names) that a program acting on a command rarely needs.
- There was no annotated data in the form this project needs, and several analyses can be right for one
  message.

## How the syntax schema relates to them

The syntax schema is a dependency analysis in the style of UD, coarsened to the level of a chunker, with
the attachments that syntax cannot settle marked. The same sentence as a circuit, written by hand here
for the reading in which "on the table" goes with "put":

```sop
@c1 syntax.clause form=imperative verb="put" complement=$n1
@n1 syntax.nominal dependent="the" head="box"
@r1 syntax.relation from=$c1 to=$n2 marker="on"
@n2 syntax.nominal dependent="the" head="table"
```

Four wires, where the tree has one line for each of the six words. Some of the correspondences, from the
schema specification:

| Schema | In UD and chunking |
| --- | --- |
| `nominal` | A base noun phrase, as a chunker finds it. UD's `det`, `nummod`, `amod` and `compound` all become `dependent`. |
| `auxiliary` | With `verb` and `negation`, the verb group of chunking; UD `aux`. |
| `subject` | UD `nsubj`. |
| `complement` | UD `obj`, `iobj` and `xcomp` together. |
| `modifier` | UD `advmod`, and adjectival `xcomp`. |
| `marker` | UD `case` for prepositions, `mark` for subordinators. |
| `relation` | With a marker, starting at the clause or at a nominal: UD `obl` against `nmod`. Without a marker: UD `acl`, `appos`. |
| `coordination` | UD `conj` and `cc`. |
| `attachment` | No UD counterpart: a mark for an open choice, as in underspecified representations. |

The full mapping, choice by choice, with the literature: [Related work](../schema/related-work.md).

## Standard, new here, particular

**Standard.** The formats on this page: dependency trees, UD, treebanks, constituency trees and chunking.

**New here.** Nothing on this page; what the syntax schema adds to these formats is described on
[Related work](../schema/related-work.md).

**Particular.** Nothing.

---

Next: [How circuits are written, judged and measured](making-and-judging.md) · Up: [Concepts](README.md)
