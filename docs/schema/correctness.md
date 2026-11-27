[Home](../README.md) › [Syntax schema](README.md) › Correctness

# What must be right, and boundary cases

This page: what a formalizer must get right, where several readings pass, what is not compared, and nine boundary examples that fix the limit between syntax and meaning. Kind: Reference.

Judges use these lists through their own rules ([Judges and the judging rule](../evaluation/judging.md)).

## Must be right

- The split into clauses
- The form of each clause
- The verb of each clause, or that it has none
- Its auxiliaries and its negation
- Whether a fragment shares the verb of another clause (`ellipsis`)
- Which words form each nominal, and which is its head
- The subject, when the words show one
- Which nominals are complements of which clause
- The end of every relation, its marker, and its start when the words settle it
- The conjuncts of every coordination

## Several readings pass

- Where a relation with a marker starts, among the clause and the nominals of that clause that grammar allows; or marked `attachment=ambiguous`
- Which earlier wire a coordination joins, when grammar allows several: "profit by ship mode and customer segment"
- A word that grammar allows as a noun or as a verb: "make y axis scale linear"

## Not compared

- Which clause holds a discourse word
- The order of wires, beyond Rule 1

## Boundary examples

Each example says what the circuit states and what it leaves for the next layer.

### give the avatar a hat

| Layer | Says |
| --- | --- |
| Circuit | One imperative clause with two complements |
| Next layer | Which one receives and which is given |

### make it red

| Layer | Says |
| --- | --- |
| Circuit | "red" is a modifier of the clause |
| Next layer | That red is the result |

### move it slowly

| Layer | Says |
| --- | --- |
| Circuit | "slowly" is a modifier of the clause |
| Next layer | That slowly is the manner |

### Could you move it?

| Layer | Says |
| --- | --- |
| Circuit | An interrogative clause |
| Next layer | That it is a request |

### a fireplace

| Layer | Says |
| --- | --- |
| Circuit | A fragment with one nominal |
| Next layer | What should be done with it |

### put the cat on the table

| Layer | Says |
| --- | --- |
| Circuit | A relation marked "on" that ends at the table |
| Next layer | Whether it attaches to the verb or to the cat, unless the formalizer settles it |

### the box was moved by Ana

| Layer | Says |
| --- | --- |
| Circuit | The subject is the box; a relation marked "by" ends at Ana |
| Next layer | That Ana did it |

### it

| Layer | Says |
| --- | --- |
| Circuit | A nominal with the head "it" |
| Next layer | What it refers to |

### do not move it

| Layer | Says |
| --- | --- |
| Circuit | The clause carries the negation "not" |
| Next layer | What follows from the negation |

Semantic roles such as recipient, goal or result are not part of this schema. Finding them is [semantic role labeling](https://en.wikipedia.org/wiki/Semantic_role_labeling), a separate layer ([Related work](related-work.md)).

## How the judges' rules go further

The judges' rules in [tests/benchmark/syntax/rules.md](../../tests/benchmark/syntax/rules.md) follow these lists and add to them. Under "Where several readings pass" they add a misspelt or unknown word, held where it stands, when the words do not settle what it is. Under "What is not judged" they add more: for example what a modifier says, the names of the wires, what a pronoun refers to, and whether the request makes sense. Read that file for the exact list.

## Standard, new here, particular

**Standard:** the line between syntax and semantic roles is the usual one ([PropBank](https://en.wikipedia.org/wiki/PropBank) and role labelling sit above syntax). **New here:** the lists of what passes and what is not compared, written so that several circuits can be right. **Particular:** none.

---

Next: [Decisions 1–5: the first review](decisions-review-1.md) · Up: [The syntax schema](README.md)
