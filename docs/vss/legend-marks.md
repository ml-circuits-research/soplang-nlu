[Home](../README.md) › [VSS in depth](README.md) › The legend's marks

# The legend's marks

This page: every mark of the legend, with its words, what it says, and which code reads it. Kind: Reference.

A **mark** is a `link=` label on a word list of the legend ([The legend](legend.md)). The code consults it by name, so a rule can say "a helping verb followed by a bare verb" without listing words in JavaScript. The marks below are those of commit `fa46cb7`, from the VSS report; marks added later are marked with their commit. "(open)" means the list has `open=true`: it adds a use and confines nothing. Words are quoted from the legend as committed at `97a1b83`.

## `subject`

| Field | Value |
| --- | --- |
| Words | i, we, they, he, she |
| Says | Can only be the doer of the next verb. |
| Read by | The verb budget; the anchored frames; subject and form decisions in `links.mjs`; doubts in `units.mjs`; rule G. |

## `recipient`

| Field | Value |
| --- | --- |
| Words | me, us, him, her, them |
| Says | Before a second noun group, receives it ("give me a hand"). |
| Read by | The indirect object in `links.mjs` `fill`; the `gives` habit. |

## `nominal` (open)

| Field | Value |
| --- | --- |
| Words | what, which, who, whom, whose |
| Says | A question word that stands for a thing ("what is this?"). |
| Read by | `emit-syntax.mjs`: the question word as head or dependent. |

## `predicative`

| Field | Value |
| --- | --- |
| Words | be, is, are, am, was, were, been, being, 's, 're, 'm |
| Says | What follows says what the subject is. |
| Read by | "be" clauses in `links.mjs`; the "what's" doubt; the exception of rule G. Since `85de0bb` also the test whether a completing clause is finite ("make sure the labels are large"). |

## `perfect`

| Field | Value |
| --- | --- |
| Words | have, has, had |
| Says | Goes with a past form, never with a bare verb. |
| Read by | "have" + bare verb read as causative: it makes its object do something ("have the fan become …"). |

## `bare` (open)

| Field | Value |
| --- | --- |
| Words | be |
| Says | The form a command uses. |
| Read by | The rule that other forms of "be" opening a clause ask a question. |

## `makesdo` (open)

| Field | Value |
| --- | --- |
| Words | let, make, have, help, see, watch, hear, feel |
| Says | Takes a thing and what that thing does, with no "to" ("let it go"). |
| Read by | `lexicon.makesDo`; the doubt in "turn italic off". Since `83fce90` also the verb budget ("watch him run"). |

## `needsbare` (open)

| Field | Value |
| --- | --- |
| Words | does, did, can, could, will, would, shall, should, may, might, must |
| Says | Followed by a bare verb ("does it fit"). |
| Read by | Rule A. |

## `finite` (open)

| Field | Value |
| --- | --- |
| Words | is, are, am, was, were, has, had, does, did, the modals, 'd, 'll, 've, 're, 'm |
| Says | Has its subject before it ("Sam is travelling"). |
| Read by | Rule O; the subject search; the clause-form decision. |

## `day` (open)

| Field | Value |
| --- | --- |
| Words | today, tomorrow, yesterday, tonight |
| Says | Forms one thing with a bare noun after it ("tomorrow morning"). |
| Read by | Rule T. |

## `definite` (open; added in `fa46cb7`)

| Field | Value |
| --- | --- |
| Words | the, this, that, these, those, its, his, her, their, my, your, our |
| Says | Names a thing already known ("the crate"), not a new one. |
| Read by | The set-off place phrase rule in `links.mjs`. |

## `postposed` (open; added in `fa46cb7`)

| Field | Value |
| --- | --- |
| Words | else |
| Says | Modifies the pronoun before it ("everything else"). |
| Read by | The "everything else" merge in `links.mjs`. |

## `selects` (open)

| Field | Value |
| --- | --- |
| Words | first, second, third, fourth, fifth, last, next, previous, other, same |
| Says | Picks among counted things ("the first two rows"). |
| Read by | Rule T; the count breaks in `readEntity`. |

## `belongs` (open)

| Field | Value |
| --- | --- |
| Words | of |
| Says | The relation starts at the thing before it ("the level of Intro"). |
| Read by | Attachment; the "left of" merge. |

## `particle` (open)

| Field | Value |
| --- | --- |
| Words | up, down, out, off, in, on, over, back, away, around, apart, together, through, along |
| Says | Moves with the verb ("put it back"). |
| Read by | Particles in `fill`; the `phrasal` habit. |

## `relative`

| Field | Value |
| --- | --- |
| Words | that, which, who, whom, whose |
| Says | Ties a clause to the thing before it ("a chart that counts users"). |
| Read by | Relative clauses. Since `71f0dd2` also the clause form: a clause it opens right after a nominal states ("the chart that is already open"). |

## `infinitive`

| Field | Value |
| --- | --- |
| Words | to |
| Says | Introduces a verb that completes the verb before it. |
| Read by | Infinitive clauses; the habits; the anchored frames. |

## `singular` (open; added in `71f0dd2`)

| Field | Value |
| --- | --- |
| Words | is, was, has, does (helping verbs); it, he, she, who, that, this (doers) |
| Says | Grammatical number: agrees with one thing, or stands for one doer. |
| Read by | `learnNumber` in `src/habits.mjs`, at training time: it learns which words name one thing and which words in -s are verbs ("the board dials"). |

## `plural` (open; added in `71f0dd2`)

| Field | Value |
| --- | --- |
| Words | are, were, have, 're (helping verbs); these, those, both; two to twelve, twenty to fifty, hundred, thousand, dozen, few, several, many, multiple |
| Says | Agrees with several things, or counts several things. |
| Read by | `learnNumber` in `src/habits.mjs`; counted nominals in `src/units.mjs`. |

## `substitute` (open; added in `71f0dd2`)

| Field | Value |
| --- | --- |
| Words | one, ones |
| Says | The pronoun "one" stands for a noun and, like a noun, takes a determiner and qualities ("the big one", "which one"). |
| Read by | `src/units.mjs` (a describing word + "one" is one nominal headed by "one"); `src/emit-syntax.mjs` (a question word before "one" is its dependent). |

## Adding a mark

Word sets go into `legend.sop` as a list with a `link=` mark, never into JavaScript (the owner's decision [D5](../project/decisions.md#d5)). The steps, and the retraining a legend edit needs, are in [Add a rule to VSS](../guides/add-vss-rule.md).

---

Next: [The stations](stations.md) · Up: [VSS in depth](README.md)
