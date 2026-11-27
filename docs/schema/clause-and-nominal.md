[Home](../README.md) › [Syntax schema](README.md) › Clause and nominal

# Clause and nominal wires

This page: the exact definitions of the wire types `syntax.nominal` and `syntax.clause`, with their keys and examples. Kind: Reference.

This is the normative text, moved from `docs/syntax-schema.md` with its substance unchanged. Its machine-readable form is `schemas/syntax/schema.sop`. A quoted value holds words of the message. `$id` refers to another wire of the same circuit. Every word stands in exactly one value ([Rule 1](rules.md#rule-1-alignment-every-word-exactly-once)).

The grammar terms below (determiner, auxiliary, predicative complement, nonfinite) are explained in plain words in [Grammar: the clause](../concepts/grammar-clause.md) and [Grammar: phrases](../concepts/grammar-phrases.md), and listed in the [Glossary](../reference/glossary.md).

## `syntax.nominal`: one nominal

A noun with the words that depend on it, or a word that stands where a noun could: a pronoun, a name, a number. In phrase-structure grammar this is a [noun phrase](https://en.wikipedia.org/wiki/Noun_phrase). A nominal is a lookup: it does not say which object of a scene is meant.

| Key | Holds |
| --- | --- |
| `head` | The word the others depend on: "boxes" in "the two small red boxes". |
| `dependent` | Every other word of the nominal, one value per word: determiners, numerals, adjectives, nouns that modify the head. |

`head` is required: every nominal has exactly one. See [head (linguistics)](https://en.wikipedia.org/wiki/Head_(linguistics)).

```sop
# the two small red boxes
@n1 syntax.nominal dependent="the" dependent="two" dependent="small" dependent="red" head="boxes"

# it
@n1 syntax.nominal head="it"
```

These two examples show a nominal alone. A whole circuit also has at least one clause; the checker refuses a circuit without one.

## `syntax.clause`: one clause

A verb with what belongs to it, or a group of words that has no verb. See [clause](https://en.wikipedia.org/wiki/Clause).

| Key | Holds |
| --- | --- |
| `form` | `imperative`, `declarative`, `interrogative`, `fragment` (the clause has no verb) or `nonfinite` (the verb form cannot make a sentence by itself: "facing left", "delete it" after "to"). |
| `verb` | The verb. |
| `auxiliary` | Auxiliary verbs: "can", "do", "was", "would". |
| `negation` | The words that negate the clause: "not", "n't", "never". |
| `subject` | The grammatical subject, when the words show one. |
| `complement` | The other nominals the verb takes: its objects and its predicative complement. There can be several. |
| `modifier` | Words that modify the clause and are neither nominals nor markers: "red", "slightly", "up", "again". |
| `discourse` | Words addressed to the listener that are outside the grammar of the clause: "please", "hey", "thanks". |
| `ellipsis` | On a fragment: the clause whose verb, auxiliaries and negation it shares. See Rule 3. |

`form` is required on every clause. `subject` and `complement` point to a nominal or a coordination; `ellipsis` points to a clause ([Rule 3](rules.md#rule-3-a-shared-verb)). These limits are declared in `schemas/syntax/schema.sop`.

The checker in `lib/syntax.mjs` adds four limits of its own:

- a clause whose `form` is not `fragment` has a `verb`;
- a `fragment` has no `verb`;
- `ellipsis` stands only on a fragment;
- the clause that `ellipsis` names has a `verb`.

### Examples

```sop
# delete the last row
@c1 syntax.clause form=imperative verb="delete" complement=$n1
@n1 syntax.nominal dependent="the" dependent="last" head="row"
```

```sop
# the title is too long
@c1 syntax.clause form=declarative verb="is" subject=$n1 modifier="too" modifier="long"
@n1 syntax.nominal dependent="the" head="title"
```

```sop
# Could you move it?
@c1 syntax.clause form=interrogative verb="move" auxiliary="Could" subject=$n1 complement=$n2
@n1 syntax.nominal head="you"
@n2 syntax.nominal head="it"
```

```sop
# do not move it, please
@c1 syntax.clause form=imperative verb="move" auxiliary="do" negation="not" complement=$n1 discourse="please"
@n1 syntax.nominal head="it"
```

```sop
# the box was moved by Ana
@c1 syntax.clause form=declarative verb="moved" auxiliary="was" subject=$n1
@n1 syntax.nominal dependent="the" head="box"
@n2 syntax.nominal head="Ana"
@r1 syntax.relation from=$c1 to=$n2 marker="by"
```

```sop
# what colour is the castle?
@c1 syntax.clause form=interrogative verb="is" complement=$n1 subject=$n2
@n1 syntax.nominal dependent="what" head="colour"
@n2 syntax.nominal dependent="the" head="castle"
```

```sop
# pie radius smaller
@c1 syntax.clause form=fragment complement=$n1 modifier="smaller"
@n1 syntax.nominal dependent="pie" head="radius"
```

### What the keys do not say

`form` is what the words show. "Could you move it?" is interrogative in form. That the speaker uses it as a request is for the next layer.

`subject` is the grammatical subject. In "the box was moved by Ana" it is the box.

`complement` does not say what the nominal is to the verb. In "give the avatar a hat" the avatar and the hat are both `complement`. Who receives and what is given is for the next layer. In a fragment, which has no verb, every nominal that is not the end of a relation is listed as `complement`.

A question word stands where its grammar puts it. In "what colour" it is a dependent of "colour". In "what is this?" it is the head of a nominal. In "where is it?" it is a modifier of the clause.

## Standard, new here, particular

**Standard:** the wire types and keys carry the established terms of grammar and of [Universal Dependencies](https://en.wikipedia.org/wiki/Universal_Dependencies) (UD); [decision 6](decisions-names.md) gives the source of each. **New here:** values are the message's own words, not positions, and the coarse grouping: one `complement` key for all objects and predicative complements, one `dependent` key for every word of a nominal but its head. **Particular:** none.

---

Next: [Relation and coordination wires](relation-and-coordination.md) · Up: [The syntax schema](README.md)
