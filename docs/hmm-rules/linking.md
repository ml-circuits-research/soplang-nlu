[Home](../README.md) › [hmm-rules in depth](README.md) › Linking

# Linking units into wires

This page: how hmm-rules links its units into wires: the linking pass, the form of a clause, which nominal a listed one joins, and where a relation starts. Kind: Explanation.

As the architecture report describes it at commit `fa46cb7`; later changes are marked. Examples marked "at `97a1b83`" were run again for this page.

## The linking pass

`linkUnits` in `src/links.mjs` turns the units into internal wires `nlu.clause`, `nlu.entity`, `nlu.relation` and `nlu.coordination`. Every quoted value keeps the positions of the tokens it covers, so the writer can map it to words later. The order:

1. **Preparations.** A quality right after a preposition is a nominal ("in red"); a bare word listed after a nominal with a conjunction is a nominal ("by product and region"); a postposed word joins the pronoun before it ("everything else").
2. **Sentences.** Split at terminators; each sentence is linked, then loose clauses are tied.
3. **Helping verbs.** An auxiliary before its subject joins the verb after the subject (a question); an auxiliary with no verb becomes the verb.
4. **Clause roles.** For each verb: main, describing a nominal, infinitive, or completing another verb; and where its clause starts. A main clause's subject is found to its left.
5. **Clause wires.** Material before the first verb, the clause form (below), markers, then `fill` for the units after the verb up to the next clause.
6. **How clauses hang together.** Describing, purpose, completing, relative and fronted clauses; clauses joined by a linking word; coordinated clauses.
7. **Leftovers.** Separators left over go to the nearest clause.

`fill` walks the units of a clause left to right with a small state: the objects of the clause, the **frontier** of nominals seen so far, the last nominal, a pending preposition, pending joiners and the last relation. A nominal becomes a role of the clause, the end of a pending relation, a conjunct, or a value tied to the nominal before it.

The linker is one left-to-right pass of fixed policy. It never revisits a choice except by raising a doubt, which makes the decoder run again and the linking start over ([Reading](reading.md)).

**The `nlu` mode.** The internal wires keep the `nlu` slot names because the linker was written for that schema. The `nlu` text output still exists, because `tests/hmm-rules.test.mjs` and the `nlu`-period tools read it. Only in that mode does the reader also return a second reading and `flags`. In the syntax mode hmm-rules writes one circuit.

## The form of a clause

The first matching line decides the form ([The five rules](../schema/rules.md) and the clause forms in [Clause and nominal wires](../schema/clause-and-nominal.md)):

1. Not a main clause: **declarative** if it completes another verb and is finite (an auxiliary, an -s form, or a subject-only pronoun as subject), otherwise **nonfinite** ("make sure it fits"; "a girl facing left"). Since `83fce90` the auxiliary must not be the bare form "be". Since `85de0bb` a finite form of "be" with its subject also counts as finite ("make sure the labels are large"; the code's comment also names "have" and "do", but the test reads the `predicative` mark, which only forms of "be" carry).
2. Since `71f0dd2`: a clause that a relative word opens right after a nominal is **declarative**, also with a past form and no subject of its own, unless it is a bare -ing form ("the chart that is already open").
3. A bare -ing form: **nonfinite** ("a dog lying down").
4. An inverted auxiliary; or a question word, unless the clause states (below); or the last main clause of a sentence ending in "?", unless embedded: **interrogative** ("could you move it").
5. The clause has a subject, or is embedded: **declarative** ("the title is too long").
6. A form of "be" other than "be", with no auxiliary and no subject, and a nominal right after it: **interrogative** ("is it possible"). Since `71f0dd2` only when "be" opens its clause, or follows a verb that asks ("here is the plan" states).
7. A past form with no auxiliary: **nonfinite** ("as drawn so far").
8. An -s form: **declarative** ("a chart that counts users").
9. A verb marked `finite` with no auxiliary: **interrogative** when it opens its clause before a nominal, otherwise **declarative** ("Does the chart carry a Plan series?").
10. Otherwise: **imperative** ("delete the last row").

**When a clause with a question word states.** It is not inverted, and one of two conditions holds:

- **Own subject** (commit `dd562c3`): the question word is followed by a subject of its own and then the verb: "tell me what it shows".
- **Embedded** (commit `fa46cb7`): the clause is not the first of its sentence, and its question word stands right after a verb or a nominal: "tell me which events are scheduled". Exception: when the verb is a form of "be" or is marked `finite` and a nominal stands right after it, the clause still asks: "what colour is the tree".

At `97a1b83`:

```sop
# show me which events are scheduled?
@c1 syntax.clause form=imperative verb="show" complement=$n1
@n1 syntax.nominal head="me"
@n2 syntax.nominal dependent="which" head="events"
@c2 syntax.clause form=declarative auxiliary="are" verb="scheduled" subject=$n2
@r1 syntax.relation from=$c1 to=$c2

# tell me what colour is the tree
@c1 syntax.clause form=imperative verb="tell" complement=$n1
@n1 syntax.nominal head="me"
@n2 syntax.nominal dependent="what" head="colour"
@c2 syntax.clause form=interrogative verb="is" complement=$n2 subject=$n3
@n3 syntax.nominal dependent="the" head="tree"
@r1 syntax.relation from=$c1 to=$c2
```

## Coordination: which nominal a listed one joins

When a nominal follows a conjunction or a comma, `fill` decides which earlier nominal it is listed with. The candidates are the frontier: with a comma alone, only the nominals of the clause that do not end a relation; otherwise every nominal seen in the clause, except the end of a set-off place phrase (", next to the crate, a small black cat"). `partner` then chooses, in this order:

1. A bare name joins the capitalised name right before it ("items Plan and Review").
2. If the nearest candidate is introduced like the new nominal (same determiner, both bare, both names, …) and the most alike one is not, the nearest wins ("with title Plan and participants Ana").
3. A determiner-led nominal unlike every candidate (best likeness below `UNLIKE = 0.3`) is not joined to the end of a phrase; it joins the last candidate that is not one.
4. Otherwise the most alike candidate.

**Likeness** (`context.alike`) is the cosine of the two head words' vectors, plus the cosine of the two nominals' build vectors, plus a small bonus for nearness (at most 0.02), so the nearer of two equal candidates wins. A **build vector** bundles each slot of the nominal bound to what fills it: the determiner word, "some" for a quantity, the index of each modifier and compound, and the kind of core. "a large yellow cat" and "a small brown dog" are built alike.

**Asides.** After the verb's object, a bare nominal set off by a comma that is unlike every candidate (below 0.3) is not one more thing the verb acts on. It is tied to the clause with no linking word. Likeness values from the report, with the model of `fa46cb7`:

- "book the sync at 16:00, Friday, for 60 minutes": "the sync" and "Friday" −0.09; "16:00" and "Friday" −0.05; "the sync" and "60 minutes" 0.54.
- "draw a boy with a kite, a dog on the grass, and a girl": "a boy" and "a girl" 1.52; "a dog" and "a girl" 1.34; "the grass" and "a girl" 0.59.

At `97a1b83` the first message still gives "Friday" its own relation with no marker:

```sop
@c1 syntax.clause form=imperative verb="book" complement=$n1
@n1 syntax.nominal dependent="the" head="sync"
@r1 syntax.relation marker="at" from=$c1 to=$n2
@n2 syntax.nominal head="16:00"
@n3 syntax.nominal head="Friday"
@r3 syntax.relation marker="for" from=$c1 to=$n4
@n4 syntax.nominal dependent="60" head="minutes"
@r2 syntax.relation from=$c1 to=$n3
```

**Why.** Joining a listed nominal to the nearest one fails on lists of things that each carry a place: in "a boy with a kite, a dog on the grass, and a girl" the nearest nominal before "a girl" is "the grass". The threshold 0.3 is documented in `src/links.mjs` as measured on the first conversion round: items of a list scored 0.6 or more, a day or an hour set off after a phrase about 0.

**Rule order matters.** At `fa46cb7`, and still at `97a1b83`, that same message is caught first by the gapping rule ([Gapping](https://en.wikipedia.org/wiki/Gapping)): each segment repeats the build of "a boy with a kite", so hmm-rules writes three clauses that share "draw" (`ellipsis=$c1`).

## Where a relation starts (attachment)

`attach` in `src/links.mjs` decides, in this order:

1. The second linking word of a pair starts where the first did ("from largest to smallest").
2. No nominal before the preposition, or a pronoun: the clause ("move it to the left").
3. "of" (mark `belongs`): the nominal before it ("the level of Intro").
4. In a fragment: the nominal before, or one it is itself placed by (up to 4 steps back, 0.3 subtracted per step), whichever holds the preposition best. A nominal is **placed by** the nominal whose phrase holds it: in "a boy with a happy face next to the table", "face" is placed by "boy". Following these steps back gives the nominal's **chain**.
5. Two literals one against the other: the first literal ("240 by 160").
6. Otherwise every **host** (a wire the relation may start from) competes: the clause, with the verb's score, and each nominal of the chain (the nominal before, the one it is placed by, … up to 4), with the noun's score.

The score is `holds`: the counted attachment rate of the word with this preposition (log, smoothed), plus 2 times the memory's fit of the target's vector to that role ([What hmm-rules learns](learned-knowledge.md)). If the two best scores differ by less than 0.5, the relation starts at the clause and is marked `attachment=ambiguous`.

**Why.** The project's standard ([underspecification](https://en.wikipedia.org/wiki/Underspecification), Rule 2 of the schema): a reader that sees one message states what the words settle and marks the rest, so that a later layer with context can complete the circuit without undoing a guess.

## Standard, new here, particular

| Label | For linking |
| --- | --- |
| Standard | Prepositional-phrase attachment by counted preference and selection; underspecification of unsettled attachments. |
| New here | Likeness of heads and builds, used to choose the partner of a listed nominal; the frontier; the order of the clause-form decisions. |
| Particular | `UNLIKE = 0.3`, set from the first conversion round of this dataset. |

All rules of the linker, by group: [The rule catalogue](rules.md). The code's names: [hmm-rules' own names](names.md).

---

Next: [Writing the syntax circuit](writing.md) · Up: [hmm-rules in depth](README.md)
