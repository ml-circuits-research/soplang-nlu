[Home](../README.md) › [Syntax schema](README.md) › The five rules

# The five rules

This page: the schema's Rules 1 to 5, exactly: alignment, ambiguous attachment, a shared verb, a measure before a marker, places fixed by position. Kind: Reference.

The wire types and keys are on [Clause and nominal wires](clause-and-nominal.md) and [Relation and coordination wires](relation-and-coordination.md). The rules below say how a formalizer uses them. Grammar terms used here (prepositional phrase, verb particle, infinitive, nonfinite clause) are explained in [Grammar: the clause](../concepts/grammar-clause.md) and [Grammar: phrases](../concepts/grammar-phrases.md).

## Rule 1. Alignment: every word exactly once

1. A quoted value is one word of the message, or a run of words that stand next to each other, written as in the message: `marker="next to"`.
2. Every word of the message is covered by exactly one value. Punctuation marks are not words and no value covers them. The marks are: `. , ; : ! ? ( ) [ ] { } " ' — – - … / \` and the curly quotes. Every other sign is a word: "%", "&", "+", "=". A mark inside a value is ignored when the value is matched, so "x-axis" covers the words "x" and "axis".
3. When the same run of words occurs more than once in the message, values claim occurrences in the order the circuit is written, top to bottom and left to right. Each value takes the earliest occurrence whose words are all still free.

A formalizer therefore writes repeated words in the order of the message. It does not have to work the order out by hand: `writeCircuit` in `lib/syntax.mjs` takes the wires with the position of each value and writes them in an order that satisfies the rule. The function is described in [Library API](../reference/library.md).

```sop
# put the box on the box
@c1 syntax.clause form=imperative verb="put" complement=$n1
@n1 syntax.nominal dependent="the" head="box"
@r1 syntax.relation from=$c1 to=$n2 marker="on" attachment=ambiguous
@n2 syntax.nominal dependent="the" head="box"
```

`@n1` is written first, so it claims the first "the" and the first "box". Writing `@n2` before `@n1` would swap which box is the complement of "put".

**Known limit.** Suppose one coordination holds the first and the third "and" of a message and another holds the second. No order of the two wires gives each value its own occurrence, because a value always takes the earliest free one. The circuit cannot say which "and" belongs to which wire, and it does not need to: two values that hold the same word are the same in the circuit. `writeCircuit` then writes the wires in the order of the message; the rule gives the first wire the first and the second "and" and the other wire the third. Every word is still covered once, and the circuit is valid. It refuses a circuit only when even this order leaves a word uncovered. Measured: this happens in 2 to 8 of 1,831 messages, depending on the formalizer, mostly with "and", "then" and "right".

`writeCircuit` has written such wires in the order of the message since commit d12c190; before, it refused the circuit. [Decision 2](decisions-review-1.md#decision-2-every-word-exactly-once-was-undefined) says that the rarity of crossing claims had not been checked on the sample; the figure above is the later, measured one.

## Rule 2. Ambiguous attachment

In "put the cat on the table" the words allow two starts for "on the table": the verb, or the cat. This is the [attachment ambiguity](https://en.wikipedia.org/wiki/Syntactic_ambiguity) of prepositional phrases. A formalizer does one of two things, and the circuit shows which.

### The formalizer settles the attachment

| Part | Text |
| --- | --- |
| The relation | Starts at the clause or at the nominal, with no mark. |
| Conclusion | What the next layer may conclude: this is the formalizer's reading. |

### The formalizer leaves it unsettled

| Part | Text |
| --- | --- |
| The relation | Starts at the clause and carries `attachment=ambiguous`. |
| Conclusion | What the next layer may conclude: the phrase belongs to this clause. It attaches to the verb or to one of the clause's nominals. |

The relation wire of "put the cat on the table" in each case (`$c1` is the clause of "put", `$n1` "the cat", `$n2` "the table"):

```sop
# settled: the phrase attaches to the verb
@r1 syntax.relation from=$c1 to=$n2 marker="on"

# settled: the phrase attaches to the cat
@r1 syntax.relation from=$n1 to=$n2 marker="on"

# unsettled
@r1 syntax.relation from=$c1 to=$n2 marker="on" attachment=ambiguous
```

The formalizer returns one circuit for a message.

## Rule 3. A shared verb

In "make A blue and B green" the second conjunct has no verb of its own. Grammar calls this [gapping](https://en.wikipedia.org/wiki/Gapping), a kind of [ellipsis](https://en.wikipedia.org/wiki/Ellipsis_(linguistics)). The fragment names the clause whose verb it shares.

```sop
# make A blue and B green
@c1 syntax.clause form=imperative verb="make" complement=$n1 modifier="blue"
@n1 syntax.nominal head="A"
@c2 syntax.clause form=fragment complement=$n2 modifier="green" ellipsis=$c1
@n2 syntax.nominal head="B"
@k1 syntax.coordination conjunct=$c1 conjunct=$c2 conjunction="and"
```

Both pairs are kept: A with blue, B with green. `ellipsis=$c1` says that "make", with its auxiliaries and its negation, applies to the second pair too.

A fragment without `ellipsis` shares nothing, also when it stands in a coordination:

```sop
# move the box, and thanks
@c1 syntax.clause form=imperative verb="move" complement=$n1
@n1 syntax.nominal dependent="the" head="box"
@c2 syntax.clause form=fragment discourse="thanks"
@k1 syntax.coordination conjunct=$c1 conjunct=$c2 conjunction="and"
```

## Rule 4. A measure before a marker

In "put the lamp two inches from the edge" the measure belongs with "from the edge". The measure is a nominal, and the relation starts at it.

```sop
@c1 syntax.clause form=imperative verb="put" complement=$n1 complement=$n2
@n1 syntax.nominal dependent="the" head="lamp"
@n2 syntax.nominal dependent="two" head="inches"
@r1 syntax.relation from=$n2 to=$n3 marker="from"
@n3 syntax.nominal dependent="the" head="edge"
```

## Rule 5. Places fixed by position

These rules make formalizers agree where a free choice would make their circuits differ for no reason.

1. **A word after the verb that is neither a nominal nor a marker is a `modifier`.** This includes verb particles ([phrasal verb](https://en.wikipedia.org/wiki/Phrasal_verb)) and directions: "tidy up", "move it left".
2. **A word that says how a nominal is, standing after that nominal.** If the nominal is the subject or a complement of the clause, the word is a `modifier` of that clause: "make the box red". If the nominal is the end of a relation with a marker, the word is a `dependent` of that nominal: "with outline gold".
3. **A greeting or thanks alone.** "Hey" or "Thanks" forms a fragment with the word in `discourse`.
4. **The "to" of an infinitive is the marker of a relation.** It marks the relation from the clause before it to the nonfinite clause. When nothing stands before it, as in "to fix the details, edit the members", the relation starts at the main clause.
5. **A number or a name right after a noun.** "block 2", "x 120", "the node Intro": the number or name is a `dependent` in the noun's nominal, or a nominal of its own tied to the noun by a relation without a marker. Both are accepted; neither may leave it tied to nothing.
6. **A word that grades a linking word.** "right behind", "just above": the word is a `modifier` of the clause the relation belongs to. A relation has no key for it.
7. **"And", "Then" or "So" at the start of a message.** With nothing before it to join, the word is a `discourse` word.

## Where the judges apply these

The judges' operational rules repeat these conventions and add the cases settled since, under "Settled cases" in [tests/benchmark/syntax/rules.md](../../tests/benchmark/syntax/rules.md). When two circuits count as the same is on [When two circuits are the same](../evaluation/normal-form.md).

## Standard, new here, particular

| Label | What it covers |
| --- | --- |
| Standard | Gapping and prepositional phrase attachment are established terms of grammar. |
| New here | Rule 1 (quoted words aligned by the order of the circuit), the mark of Rule 2 inside one circuit, the key `ellipsis` of Rule 3, and the conventions of Rules 4 and 5. |
| Particular | The figure in Rule 1's known limit holds for this project's sample of 1,831 messages. |

---

Next: [What must be right, and boundary cases](correctness.md) · Up: [The syntax schema](README.md)
