[Home](../README.md) › [VSS in depth](README.md) › Learned beyond the HMM

# What VSS learns beyond the HMM

This page: the learned parts of the model other than the station HMM: occurrence prototypes, word vectors, habits and the role-filler memory, kinds from anchored frames, and grammatical number. Kind: Explanation.

As the VSS report describes them at commit `fa46cb7`; the number habits were added in `71f0dd2`. Counts of learned items change on retraining and are left out.

## Occurrence prototypes

`src/occurrence.mjs`. Every message is decoded with the new HMM, without the verb budget or bans. For each token whose posterior is at least 0.97, the outside of the occurrence becomes one 512-dimensional vector: for the neighbours at positions −2, −1, +1 and +2, the side's vector bound to the neighbour's vector, all added ([bind and bundle](methods.md#vector-symbolic-operations)), plus the vector of the token's own form class (its ending or its capital). The word itself is never used. A neighbour counts as its word when the legend lists it, otherwise as its class.

The prototype of a station is the mean of its occurrences minus the mean of all occurrences, normalised (a [centroid](https://en.wikipedia.org/wiki/Centroid)). At reading time the prototypes give a second opinion on each word, the occurrence lift ([Reading](reading.md)).

## Word vectors ("meanings")

`learnMeanings` in `src/meaning.mjs`. For every word seen at least 10 times that starts with a letter and is not confined by the legend, the vector is the sum, over its neighbours at −2 to +2, of the positive pointwise mutual information of the pair times the side's vector bound to the neighbour's vector. The default is 128 dimensions (`--dimensions`), stored as 8-bit integers.

The vectors are used to compare the heads of two nominals in a coordination ([Linking](linking.md)), and as the filler vectors of the memory below. The method is explained in [Methods](methods.md#ppmi-and-word-vectors).

## Habits and the role-filler memory

`learnHabits` in `src/habits.mjs` opens the model built so far, reads every message with the HMM and the chunker, and counts what each word does where the structure leaves no doubt. Each habit, with where it is counted and when an entry is kept:

### `nominal`: thing or quality

| Field | Value |
| --- | --- |
| Counted where | Heads of noun groups and words after a preposition count as things; describing words after a grading word, and bare qualities, count as qualities. |
| Kept when | Thing: its plural heads at least 2 groups, and things plus plurals exceed twice the qualities. Quality: at least 3, and more than things. |

### `together`

| Field | Value |
| --- | --- |
| Counted where | A word right before the head inside a noun group that no verb precedes. |
| Kept when | The pair was seen at least 2 times. |

### `describes`

| Field | Value |
| --- | --- |
| Counted where | A participle right after a noun group that does not itself follow a preposition. |
| Kept when | At least 2, per form and head. |

### `verbTotal`, `anchored`

| Field | Value |
| --- | --- |
| Counted where | Every verb; for `anchored`, verbs with an auxiliary, a negation or "to" before them. |
| Kept when | At least 3; `anchored` at least 2. |

### `takesQuality`

| Field | Value |
| --- | --- |
| Counted where | Verb + pronoun or determiner-led object + bare quality ("make it blue"). |
| Kept when | At least 3, and at least 3% of the verb's cases with such an object. |

### `takesClause`

| Field | Value |
| --- | --- |
| Counted where | Verb + pronoun + bare verb ("let us add"). |
| Kept when | At least 5, and at least 0.3% of the verb. |

### `directs`, `names`, `gives`

| Field | Value |
| --- | --- |
| Counted where | Verb + pronoun + "to" + verb ("need you to make"); verb + pronoun + bare name ("call it Bob"); verb + recipient pronoun + another noun group ("give me a hand"). |
| Kept when | At least 3, and 1% of the verb. |

### `asks`

| Field | Value |
| --- | --- |
| Counted where | Verb (+ pronoun) + question word, or "if", "unless", "whether". |
| Kept when | At least 3, and 2% of the verb. |

### `phrasal`, `separable`

| Field | Value |
| --- | --- |
| Counted where | Verb (+ object) + a particle with no noun group after it ("zoom in", "sort it out"); verb + object + particle ("turn the legend on"). |
| Kept when | `phrasal` at least 3; `separable` at least 2. |

### `attach`, `attachSure`

| Field | Value |
| --- | --- |
| Counted where | Sure cases: a preposition right after the verb, or after a pronoun object, belongs to the verb; after a noun group that no verb governs, to the noun. Doubtful cases: after a noun group that a verb governs. |
| Kept when | The doubtful cases are settled as described below the habits. |

### `memory`

| Field | Value |
| --- | --- |
| Counted where | Per verb (`v:`) and noun (`n:`): each role (a preposition, `object`, `said`) bound to the vector of what filled it, all added. |
| Kept when | All. |

**Settling the doubtful attachments.** The sure cases undercount the verb, because its object usually stands between the verb and the preposition. The first round uses only each preposition's lean: the log ratio of its rate after verbs to its rate after nouns among sure cases, shifted by a constant found by [bisection](https://en.wikipedia.org/wiki/Bisection_method) so that the doubtful cases split half and half overall. Each doubtful case is shared between verb and noun by a [logistic function](https://en.wikipedia.org/wiki/Logistic_function) of that score. Three more rounds use the attachment score of the counts so far. The doubtful cases then enter the memory by the share each side received.

**Caveat.** The habits are counted on the reader's own readings of the same text, so an error of the HMM or the chunker can confirm itself. That reading is also plainer than the one used at reading time: no habits or kinds exist yet, some rules are skipped, doubts are not used, and there is no occurrence lift or verb budget. Some learned items are noise: at `fa46cb7`, `takesClause` held "drawing", "whenever" and "oculd"; `asks` held "nice" and "waht"; `gives` held "igve" and "gve".

## Kinds from anchored frames

`anchoredFrames` in `src/anchors.mjs` runs before the HMM is trained. For every lower-case word that no list confines, it counts how often the word stood in a frame that the legend's words alone fix:

- **thing**: between a word that can only be a determiner or degree word and a word that closes the group ("the ___ on");
- **verb**: after a word that can only be a helping verb, before an object or closing word; after "to" before an object; after a subject-only pronoun ("they ___"); message-initial before an object, at half weight;
- **quality**: after a word that can only be a degree word; after a form of "be" before a closing word, at half weight.

Words with at least 3 counts in total are kept in `habits.kinds`, as three counts [verb, thing, quality]. Most rules of the chunker and the linker read them ("seen as a verb at least 3 times").

**Why.** The file's header: counting only in frames fixed by the legend "says what kind of word it is without asking the route model, so the model's own mistakes cannot confirm themselves". This holds for the kinds only, not for the habits above.

**Defects at `fa46cb7`** (`src/anchors.mjs` has not changed since). The frame "after a degree word" fires after only five words, the degree compounds "a bit", "a lot", "a little bit", "a tad", "a touch": "very" and "too" are not confined to the degree station, so "very ___" is not counted. The quality counts therefore come almost only from "be ___ ." at half weight and from these five compounds: they are thin. A second branch of the quality test adds nothing, and a variable `grades` is never used. Used as a prior inside EM (`--anchoring`), the kinds measured worse, so they serve only the rules.

**Two things called "anchored".** `lexicon.anchoredVerb` reads the habit `habits.anchored`, counted on the reader's own readings. `habits.kinds` comes from `src/anchors.mjs`, from frames fixed by legend words on the raw text. The opener rule uses the first; most rules use the second.

## Grammatical number (since `71f0dd2`)

`learnNumber` in `src/habits.mjs` counts on the raw text, with the legend's marks `singular` and `plural` ([The legend's marks](legend-marks.md)):

- `number`: per word, how often a form that agrees with one thing follows it ("the board is") and how often a form that agrees with several does ("the people are");
- `sForms`: per word in -s, what stands around it. After a word that names one thing or stands for one doer, a word in -s is a verb ("the board dials"); after a determiner or a count, it names several things ("two labels").

The reader turns these counts into two lookups (`number` and `verbOfOne` in `src/reader.mjs`), which the rules of `71f0dd2` and `85de0bb` read ([The rule catalogue](rules.md#rules-added-after-fa46cb7)).

## Standard, new here, particular

| Label | For these learned parts |
| --- | --- |
| Standard | PPMI word vectors; counted attachment preferences and [selection](https://en.wikipedia.org/wiki/Selection_(linguistics)); learning from one's own output, as in self-training, a form of [semi-supervised learning](https://en.wikipedia.org/wiki/Weak_supervision). |
| New here | Which habits are counted and how they feed the rules; the role-filler memory; kinds from anchored frames; the number habits. |
| Particular | The learned items come from this dataset's text, noise included. |

The code's names used here are mapped on [VSS's own names](names.md).

---

Next: [The model file](model-file.md) · Up: [VSS in depth](README.md)
