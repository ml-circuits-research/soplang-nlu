[Home](../README.md) › [Concepts](README.md) › Read your first circuit

# Read your first circuit

This page: a walk through two real syntax circuits, line by line, so that you can then read any circuit.
Kind: Tutorial.

**What you need:** the earlier pages of this section. Each key below gets a short gloss and a link to
[Grammar: the clause](grammar-clause.md) or [Grammar: phrases](grammar-phrases.md).

## Step 1. The message

> make a bar chart of the projects by name please

A real message of the benchmark, typed to the diagram area of WebMeet (message id
`diagram/charts-01.csv#232`).

## Step 2. The circuit

Three formalizers, prolog, spacy and z3, wrote this circuit alike, and a judge accepted it. It is copied
from the registry of judged circuits (the dataset's record of every circuit a judge has read, with the
verdict), `webmeet-dataset/annotations/syntax/v1/judged/`, file `2026-11-27-benchmark-random.jsonl`,
line 1:

```sop
@c1 syntax.clause form=imperative verb="make" discourse="please" complement=$n1
@n1 syntax.nominal dependent="a" dependent="bar" head="chart"
@r1 syntax.relation marker="of" from=$n1 to=$n2
@n2 syntax.nominal dependent="the" head="projects"
@r2 syntax.relation attachment=ambiguous marker="by" from=$c1 to=$n3
@n3 syntax.nominal head="name"
```

## Step 3. Read it line by line

- **`@c1`, a clause** ([Clause](grammar-clause.md#clause)). `form=imperative`: a command
  ([Clause type](grammar-clause.md#clause-type-and-mood)). `verb="make"`. `discourse="please"`: a word said
  to the listener ([Discourse marker](grammar-clause.md#discourse-marker)). `complement=$n1`: the thing the
  verb takes is the wire `n1` ([Complement](grammar-clause.md#complement-and-object)).
- **`@n1`, a nominal** ([Nominal](grammar-phrases.md#nominal)): "a bar chart". Its head, the main word, is
  "chart" ([Head](grammar-phrases.md#head)); "a" and "bar" are dependents that describe it
  ([Dependent](grammar-phrases.md#dependent)).
- **`@r1`, a relation**: the linking word "of" ([Marker](grammar-phrases.md#marker)) ties `n2` to `n1`. It
  starts (`from`) at "a bar chart" and ends (`to`) at "the projects".
- **`@n2`, a nominal**: "the projects", with the head "projects".
- **`@r2`, a relation**: the linking word "by" ties `n3` to the clause `c1`, and the relation carries
  `attachment=ambiguous` ([Attachment ambiguity](grammar-phrases.md#attachment-ambiguity)). Step 5 explains
  the mark.
- **`@n3`, a nominal**: "name", a nominal of one word.

## Step 4. Check that every word stands once

Each word of the message, and the place that holds it:

| Word | Where it stands |
| --- | --- |
| make | `@c1`, `verb` |
| a | `@n1`, `dependent` |
| bar | `@n1`, `dependent` |
| chart | `@n1`, `head` |
| of | `@r1`, `marker` |
| the | `@n2`, `dependent` |
| projects | `@n2`, `head` |
| by | `@r2`, `marker` |
| name | `@n3`, `head` |
| please | `@c1`, `discourse` |

Ten words, ten places, none twice and none missing. This is Rule 1 of the schema
([The five rules](../schema/rules.md)). A program checks it before any judge sees the circuit:
`validateSyntax` in `lib/syntax.mjs` finds this circuit valid.

## Step 5. What `attachment=ambiguous` says

The words do not settle where "by name" belongs: with the making (make the chart by name) or with the
projects (the projects by name). The relation therefore starts at the clause and carries the mark. It
says: the phrase belongs to this clause, and it attaches to the verb or to one of the clause's nominals
(Rule 2). The judges accept either place, with or without the mark.

## Step 6. Several circuits can be right

Before the benchmark run, this message already had a label, and it was a different circuit. Its last
relation read:

```sop
@r2 syntax.relation marker="by" from=$n2 to=$n3
```

The other five wires were the same. Here "by name" is tied to "projects", with no mark. That circuit had
been settled by agreement of the formalizers spacy-direct and hmm-rules, in the conversion run (a run that
labels whole files of the dataset) `2026-11-27-agreement-diagram__charts-01.01`.

What happened next, in the benchmark run `2026-11-27-syntax-benchmark-random`:

- hmm-rules and DistilBERT wrote the earlier label's circuit. A circuit equal to the label the message had before
  the run counts as accepted without a judge: level L9 ([Levels](../evaluation/levels.md)).
- prolog, spacy and z3 wrote the circuit of step 2. A judge accepted it; since the message had another
  label, this is level L10 for them.
- When the run's verdicts were published, the judged circuit replaced the label: a judge's word counts
  before agreement. The dataset now holds it (`syntactic/diagram/charts-01.01.csv`, accepted by `judge`).
- The replaced circuit was not lost. It is kept as an accepted reading in the registry file
  `2026-11-27-benchmark-random-replaced-agreement.jsonl`.

Both circuits are acceptable: by the judges' rules, a relation with a marker may start at the clause or at
any nominal of that clause that grammar allows. The label is one right circuit, not the only one.

## Step 7. Read one yourself

The message "Move the blue box towards the yellow circle.", as hmm-rules writes it with the code of commit
`c080ce8`, the same circuit as on the [home page](../README.md#an-example) (the output can change when
The rules of hmm-rules change or its model is retrained):

```sop
@c1 syntax.clause form=imperative verb="Move" complement=$n1
@n1 syntax.nominal dependent="the" dependent="blue" head="box"
@r1 syntax.relation marker="towards" from=$c1 to=$n2
@n2 syntax.nominal dependent="the" dependent="yellow" head="circle"
```

Three of these four lines are asserted by the test `tests/hmm-rules-syntax.test.mjs`. Before reading on, answer:

1. Which wire is the clause, what is its form, and what is its verb?
2. Which words form the first nominal, and which is its head?
3. Where does the relation start and end, and which word marks it?
4. Did hmm-rules settle the attachment, or leave it open?
5. The message has "the" twice. Which wire holds which?

**Answers.**

1. `@c1`: a command (`imperative`) with the verb "Move"; its complement is `n1`.
2. "the blue box", with the head "box".
3. It starts at the clause `c1`, ends at "the yellow circle" (`n2`), and "towards" marks it.
4. Settled: the relation starts at the clause and has no mark, so in the reading of hmm-rules "towards the yellow
   circle" goes with the verb "Move", not with "the blue box".
5. `@n1` is written before `@n2`, so it claims the first "the" (Rule 1). The full stop is punctuation and
   stands in no wire.

## Try it on your machine

The how-to guide [Run a formalizer: read one message from code](../guides/run-a-formalizer.md#read-one-message-from-code)
gives a short program that reads this very message with hmm-rules. Save it as a file inside a checkout of
`soplang-nlu` and run it with `node`. With the hmm-rules code of commit `c080ce8` it prints the four wires
of step 7. The reader checks the circuit with `validateSyntax` and returns it only when it is valid.

## What you learned

- A circuit is a set of wires: clauses, nominals, relations and coordinations, tied by references.
- Every word of the message stands in exactly one place, and a program checks it.
- `attachment=ambiguous` marks a choice the words leave open, and several circuits can be right.
- A label is one accepted circuit; a judge's acceptance replaces a label settled by agreement.

Next comes the schema itself: the four wire types and every key, in full.

---

Next: [The syntax schema](../schema/README.md) · Up: [Concepts](README.md)
