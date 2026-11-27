[Home](../README.md) › [Syntax schema](README.md) › Relation and coordination

# Relation and coordination wires

This page: the exact definitions of the wire types `syntax.relation` and `syntax.coordination`, and one whole message written with all four types. Kind: Reference.

This is the normative text, moved from `docs/syntax-schema.md` with its substance unchanged. Its machine-readable form is `schemas/syntax/schema.sop`. The other two types are on [Clause and nominal wires](clause-and-nominal.md).

## `syntax.relation`: a relation between two wires

A relation ties two wires. In [dependency grammar](https://en.wikipedia.org/wiki/Dependency_grammar) this is a dependency relation; the linking word is often a [preposition](https://en.wikipedia.org/wiki/Adposition). See [Grammar: phrases, linking words, attachment](../concepts/grammar-phrases.md).

| Key | Holds |
| --- | --- |
| `from`, `to` | The two wires. Each is a clause, a nominal or a coordination. |
| `marker` | The word that marks the relation, when there is one: a preposition ("on", "next to", "of"), the possessive "'s", a subordinator ("if", "because"), or the "to" of an infinitive. |
| `negation` | The word that negates this relation alone: "not" in "not behind Jo". |
| `attachment` | The value `ambiguous`, when the formalizer does not settle where the relation starts. See Rule 2. |

`from` and `to` are required. The only value of `attachment` is `ambiguous` ([Rule 2](rules.md#rule-2-ambiguous-attachment)).

A relation has no kind. With a marker, the marker says how the wires are related. Without a marker, the two wires stand together and no word says how. The types of the two ends tell the cases apart.

### Examples

```sop
# the level of Intro                 nominal to nominal, with a marker
@n1 syntax.nominal dependent="the" head="level"
@n2 syntax.nominal head="Intro"
@r1 syntax.relation from=$n1 to=$n2 marker="of"
```

```sop
# move it if it fits                 clause to clause, with a marker
@r1 syntax.relation from=$c1 to=$c2 marker="if"
```

```sop
# I want to delete it                clause to clause: "to" marks the infinitive
@c1 syntax.clause form=declarative verb="want" subject=$n1
@c2 syntax.clause form=nonfinite verb="delete" complement=$n2
@r1 syntax.relation from=$c1 to=$c2 marker="to"
```

```sop
# a bird facing left                 nominal to clause, no marker
@c1 syntax.clause form=fragment complement=$n1
@n1 syntax.nominal dependent="a" head="bird"
@c2 syntax.clause form=nonfinite verb="facing" modifier="left"
@r1 syntax.relation from=$n1 to=$c2
```

```sop
# x 120                              nominal to nominal, no marker
@r1 syntax.relation from=$n1 to=$n2
```

Only "a bird facing left" is a whole circuit. The other examples show only the wires that matter for the relation; a whole circuit puts every word in a wire and has at least one clause.

## `syntax.coordination`: wires joined side by side

[Coordination](https://en.wikipedia.org/wiki/Coordination_(linguistics)) puts things side by side; the words joined are the conjuncts and the joining word is the conjunction.

| Key | Holds |
| --- | --- |
| `conjunct` | The joined wires: nominals, clauses or relations. All conjuncts of one coordination have the same type. |
| `conjunction` | The words that join them: "and", "or", "but", "then". |

`conjunct` is required; the checker in `lib/syntax.mjs` asks for at least two different conjuncts, all of one wire type.

### Examples

```sop
# a blanket, a basket and a boy
@k1 syntax.coordination conjunct=$n1 conjunct=$n2 conjunct=$n3 conjunction="and"
```

Only the coordination wire is shown; `$n1` to `$n3` are the three nominals. The commas of a coordination are punctuation. No wire holds them.

```sop
# put it near Ben but not behind Jo
@c1 syntax.clause form=imperative verb="put" complement=$n1
@n1 syntax.nominal head="it"
@r1 syntax.relation from=$c1 to=$n2 marker="near"
@n2 syntax.nominal head="Ben"
@r2 syntax.relation from=$c1 to=$n3 marker="behind" negation="not"
@n3 syntax.nominal head="Jo"
@k1 syntax.coordination conjunct=$r1 conjunct=$r2 conjunction="but"
```

"but" joins the two relations. "not" belongs to the second one only.

## A whole message

```sop
# move the blue box next to the red circle and make it bigger
@c1 syntax.clause form=imperative verb="move" complement=$n1
@n1 syntax.nominal dependent="the" dependent="blue" head="box"
@r1 syntax.relation from=$c1 to=$n2 marker="next to" attachment=ambiguous
@n2 syntax.nominal dependent="the" dependent="red" head="circle"
@c2 syntax.clause form=imperative verb="make" complement=$n3 modifier="bigger"
@n3 syntax.nominal head="it"
@k1 syntax.coordination conjunct=$c1 conjunct=$c2 conjunction="and"
```

Two clauses joined by "and". The relation "next to" starts at the first clause and is marked `attachment=ambiguous`: the words do not say whether it belongs to "move" or to "the blue box".

## Standard, new here, particular

**Standard:** relations with markers follow UD's `case` and `mark` (the labels for prepositions and subordinators), and coordination follows UD's `conj` and `cc` (conjunct and coordinating conjunction) ([Related work](related-work.md)). **New here:** a relation carries no label of its kind, where UD labels every relation: the marker word and the types of the two ends stand in for it. An unsettled start is written with the key `attachment=ambiguous`, an application of [underspecification](https://en.wikipedia.org/wiki/Underspecification). **Particular:** none.

---

Next: [The five rules](rules.md) · Up: [The syntax schema](README.md)
