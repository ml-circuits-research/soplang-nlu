[Home](../README.md) › [Evaluation and labels](README.md) › Read judged circuits

# Read judged circuits

This page: work through real judged circuits to see what passes, what fails, and why.
Kind: Tutorial.

## Before you start

You need to know how to read a circuit ([Read your first circuit](../concepts/first-circuit.md)),
the judging rule ([Judges](judging.md)) and the grades ([Levels: Grades](levels.md#grades)).

Every circuit below is real. It comes from `key/items.jsonl` and the verdict files of the benchmark
folder `eval-results/2026-11-27-syntax-benchmark-random/`. The *item number* is the circuit's number
in that run. The comment lines with formalizer names and grades are added here: the judge saw only
the message and the circuit.

## Example 1: "hair short"

```sop
# hair short
# vss (item 223): L8
@n1 syntax.nominal head="hair" dependent="short"
@c1 syntax.clause form=fragment complement=$n1

# prolog, spacy, z3 (item 225): L8
@n1 syntax.nominal head="hair"
@c1 syntax.clause form=fragment modifier="short" complement=$n1

# distilbert (item 224): L4
@n1 syntax.nominal head="hair"
@c1 syntax.clause form=fragment modifier="short" complement=$n1
@c2 syntax.clause form=fragment complement=$n1
```

The message has no verb, so every circuit writes a fragment. VSS holds "short" inside the nominal,
as a dependent of "hair"; the other three hold it as a modifier of the clause. Both passed: the
judge found no wrong statement to quote in either.

DistilBERT adds a second fragment. The judge's note: "'hair short' is written as two fragments, the
second an empty copy with 'hair' as complement again." The circuit states something the message
does not say: L4.

**Lesson**: several readings pass; inventing a wire fails.

## Example 2: "add a sun 260 400"

```sop
# add a sun 260 400
# distilbert, vss (item 1190): L8
@c1 syntax.clause form=imperative verb="add" complement=$n1
@n1 syntax.nominal dependent="a" head="sun" dependent="260" dependent="400"

# prolog, spacy (item 1192): L8
@c1 syntax.clause form=imperative verb="add" complement=$n1
@n1 syntax.nominal dependent="a" head="sun"
@n2 syntax.nominal dependent="260" head="400"
@r1 syntax.relation from=$n1 to=$n2

# z3 (item 1191): L6
@c1 syntax.clause form=imperative verb="add" complement=$n1 complement=$n2
@n1 syntax.nominal dependent="a" head="sun"
@n2 syntax.nominal dependent="260" head="400"
```

VSS and DistilBERT keep the numbers inside the nominal of "sun". Prolog and spaCy make "260 400" a
nominal of its own, tied to "sun" by a relation with no linking word. Both pass, by a settled case
of `rules.md`: a number right after a noun may be a dependent of that noun, or a nominal of its own
tied to the noun by a relation without a marker.

Z3 makes "260 400" a second complement of "add". The judge's note: "In 'a sun 260 400' the numbers
'260 400' are a second complement of 'add', not paired with 'sun'." The pairing that the words give
is lost: L6.

A detail: which of "260" and "400" is the head? No rule names it, so `head="400"` gives the judge
nothing to quote, and it passes.

## Example 3: "node Intro to 260, 240"

```sop
# node Intro to 260, 240
# vss, first judging (item 1721): L3
@n1 syntax.nominal head="node" dependent="Intro"
@r1 syntax.relation marker="to" from=$n1 to=$n2
@n2 syntax.nominal head="260"
@n3 syntax.nominal head="240"
@c1 syntax.clause form=fragment complement=$k1
@k1 syntax.coordination conjunct=$n1 conjunct=$n3

# vss after the rules of fa46cb7 (item 6952): L8
@n1 syntax.nominal head="node" dependent="Intro"
@r1 syntax.relation marker="to" from=$n1 to=$k1
@n2 syntax.nominal head="260"
@n3 syntax.nominal head="240"
@c1 syntax.clause form=fragment complement=$n1
@k1 syntax.coordination conjunct=$n2 conjunct=$n3
```

The first circuit puts "node Intro" and "240" side by side. The judge's note: "In 'to 260, 240' the
number '240' is coordinated with 'node' instead of paired with '260'." A wrong member of a
coordination is L3. The later circuit, judged in packet 43, coordinates "260" and "240" as the end
of "to", and passes.

## Example 4: accepted with an ambiguity mark

The message "make a bar chart of the projects by name please". Its full circuit, item 1, written
alike by prolog, spacy and z3 and accepted (L8), is read line by line in
[Read your first circuit](../concepts/first-circuit.md#step-2-the-circuit). The relation of "by":

```sop
# item 1 (prolog, spacy, z3): L8
@r2 syntax.relation attachment=ambiguous marker="by" from=$c1 to=$n3

# item 5859 (vss, distilbert), the rest alike: L8
@r2 syntax.relation marker="by" from=$n2 to=$n3
```

"by name" may go with the making or with the projects. Item 1 starts the relation at the clause
(`c1`) and marks `attachment=ambiguous`; item 5859 starts it at "the projects" (`n2`), with no mark.
Both were accepted: the start of a relation with a linking word is one of the places where several
readings pass.

Before the run, item 5859's reading was this message's label, settled by agreement. The publication
of the benchmark replaced it with item 1, which a judge had accepted
([The benchmark](benchmark.md#publication-accepted-circuits-become-labels)).

## Exercise

The message "b2, make it centred". VSS's circuit at the first judging (item 337):

```sop
@n1 syntax.nominal head="b2"
@c1 syntax.clause form=imperative verb="make" modifier="centred" complement=$n2
@n2 syntax.nominal head="it"
@c2 syntax.clause form=fragment complement=$n1
```

Decide before reading on: acceptable, or which grade? Check each grade of the
[grade table](levels.md#grades) in order.

**Answer.** L6. The judge's note: "The fragment 'b2' is tied to nothing inside its sentence." Z3
wrote the same circuit plus a coordination of the two clauses (item 338), and it passed: the
fragment is tied. VSS after the rule batch of `83fce90`, which ties every part of a sentence, added
a relation from the clause to the fragment (item 7134) and passed too.

A second answer from the same message: DistilBERT held "b2" as a word said to the listener
(`discourse="b2"`, item 336). The judge's note: "'b2' is held as discourse, though it names the thing
the message is about." That is L2.

To practise further, take any line of a packet, decide, and then compare with the section "Settled
cases" of [rules.md](../../tests/benchmark/syntax/rules.md).

## What you learned

- Several readings of one message can pass.
- A rejection quotes words and names the first fault found.
- Inventing a statement (L4) and leaving a part untied (L6) are opposite faults.

Next: [Levels L0–L10 and GOAL](levels.md) · Up: [Evaluation and labels](README.md)
