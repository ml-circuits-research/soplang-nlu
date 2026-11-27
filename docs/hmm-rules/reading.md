[Home](../README.md) › [hmm-rules in depth](README.md) › Reading

# Reading: from words to units

This page: the first half of reading a message: observation, the constraints set before decoding, decoding with the verb budget, cutting into units, and the loop of doubts. Kind: Explanation.

As the architecture report describes it at commit `fa46cb7`; later changes are marked. The [tutorial](tutorial-one-message.md) shows these steps on real output.

## The entry point

`strategies/hmm-rules/index.mjs` is the strategy. `open()` loads the model and creates the reader with `{schema: 'syntax'}`. `analyse(text)` returns `{analyses: [{sop, confidence}]}`, or no analysis and an `error` when the reader throws. The common reader `lib/reader.mjs` checks every circuit with `validateSyntax`. The steps below are in `createHmmRulesReader` → `analyse` in `src/reader.mjs`.

## Observation and tokens

- `tokenize` in `src/tokens.mjs` uses the validator's pattern, so a token is one word of the schema's checker, except that punctuation is kept. A date, a clock time or a decimal number is one token; a [clitic](https://en.wikipedia.org/wiki/Clitic) is split off ("don't" → "do" + "n't").
- Each token gets a shape: number, date, clock, code ("3px", "g1"), mark, quote, upper, capital, initial (a capital at the start of a sentence), lower.
- What is written as one word is joined: "soft-focus", "260,180", "example.com/prices".
- A quoted passage becomes one observation that can only be a literal.
- The legend's compounds are joined, longest first: "next to", "in front of", "make sure".
- A spelling variant is looked up as its common word ([Training](training.md)).

## Before decoding: openers and the occurrence lift

**Openers.** When the message begins with a learned opener of 1 or 2 words before the first break, those words are kept off the verb stations. Exceptions: a word with the learned `anchored` habit, and (since `fa46cb7`) a word seen as a verb at least 20 times in the anchored frames and never as a thing (`SURELY_A_VERB`; "excuse me, …"). Since `83fce90` a word right before an object-only pronoun such as "me" is also exempt. A second rule of `83fce90` reads one or two words that open the message before a comma or dash, followed by a clause with a verb the text knows, as a heading, a name or a word said to the listener ("Ana - remove"): such a word is kept off the verb stations when the text never showed it as a verb.

**Occurrence lift.** For every token and station, hmm-rules computes the cosine between the station's prototype and the token's outside vector ([What hmm-rules learns](learned-knowledge.md)). During decoding every emission probability is multiplied by exp(4 × cosine); 4 is the option `occurrenceWeight`.

## Decoding with the verb budget

`readRoutes` in `src/routes.mjs` decodes one sentence at a time. It runs the Viterbi recursion and the forward pass together, then the backward pass ([Methods](methods.md)). A ban, from a doubt or an opener, sets the emission of the banned station at that position to zero.

**The verb budget** is a second Viterbi over pairs (station, register). The register counts the verbs of the current clause:

| Token's station | Register after it |
| --- | --- |
| Clause opener | 0. Openers: marker, question word, infinitival "to", relative, separator, terminator, conjunction. |
| Auxiliary | 1 if the clause already had its verb (a new verb group begins); otherwise unchanged. |
| Subject pronoun | 1 if the clause already had its verb; otherwise at least 1. |
| Other nominal | 0 becomes 1; otherwise unchanged. |
| Other station | Unchanged (negation, adverb, preposition, predicative adjective, interjection, filler). |
| Verb, can be aux | Unchanged: a word that can be an auxiliary does not use up the verb. |
| Verb at 0 or 1 | 3 if the verb takes a clause or directs ("let", "need"); otherwise 2. |
| Verb at 2 | Allowed only for a past or -ing form (a participle); unchanged. |
| Verb at 3 | Allowed. A participle keeps 3; one more bare verb ("let it go") gives 3 or 2 by the same test as at 0. |

At `fa46cb7` the verbs that may take one more bare verb are those of the learned `takesClause` and `directs` habits. Since `83fce90` the legend's `makesdo` mark counts too ("watch him run").

If no path keeps the budget, the decoder falls back to the plain Viterbi path.

**Confidence.** The posterior of the chosen station is called its "confidence". It is computed without the budget, so it is not the probability of the station the budget chose, and it can be near zero when the budget forces a station. In the syntax output only the minimum confidence of the message is returned; neither the common reader `lib/reader.mjs` nor the benchmark tools read it.

**The budget's history.** It has been on by default since commit `7e8e98d` ("one verb per clause in decoding"), whose message records no measurement. The only measurement is from the `nlu` period and was negative: it "moved 119 texts closer to a saved circuit and 169 further". The strategy page of that period (`docs/strategies/hmm-rules.md`) therefore says the budget is off; that is outdated. Its effect in the syntax schema has not been measured.

## Cutting into units (chunking)

`buildUnits` in `src/units.mjs` walks the stations once:

- A run of nominal stations becomes an **entity**, with positions for determiner, quantity, degree, modifier, compound, head, name, pronoun, literal and possessor.
- Auxiliaries, negations, adverbs before a verb and the verb become a **verb** unit, or an `aux` unit when no verb follows.
- A run of prepositions becomes a **cue**. Grading words and qualities with no noun become a complement (or an adverb). Anything else is a one-token unit of its station's type.

Inside an entity the last noun is the head and earlier nouns are compounds. A describing word is a compound or a modifier by the learned noun/adjective habit. After the walk, merge passes join units ("Jan's office chair", "two more clouds") and checks raise doubts. Their rules are summarised in [The rule catalogue](rules.md).

## Doubts and the re-reading loop

A **doubt** is `{position, not: kind}` or `{position, is: kind}`. It names stations to ban at that position:

| Doubt | Banned stations, and meaning |
| --- | --- |
| `not: verb` | The two verb stations: not a verb. |
| `not: thing` | Every nominal station and the predicative adjective: not part of a nominal. |
| `not: head` | Noun, name and the verb stations: says how something is. |
| `not: quality` | Modifier, predicative adjective, degree and the verb stations: names a thing. |
| `not: expression` | Interjection and filler: not said in passing. |
| `is: verb` | Every station that is not a verb station: is a verb. |
| `is: head` etc. | Also `is: name`, `is: modifier`, `is: degree`: every station except that one (noun, name, modifier or degree): is that. |

Doubts come from three places: the chunker, the linker, and `leaning()` in the reader, which compares each word's station with what the whole text says about the word. A doubt is **fresh** when it bans something not yet banned at that position and does not leave the position with no station.

The loop: read once; while there are fresh doubts, and at most 4 more times, add their bans, decode again under all bans, and read again. Bans accumulate and are never lifted. When the limit is reached, the last reading is used.

**Why.** The HMM sees one neighbour on each side; the chunker and the linker see structure, such as a verb that no clause can hold. They do not change a station in place: they ban it, and the decoder finds the best path without it, so the neighbouring words can change too. The limit of 4 is a number in the code with no recorded measurement.

## Standard, new here, particular

| Label | For reading |
| --- | --- |
| Standard | Viterbi decoding with constraints; chunking ([Methods](methods.md)). |
| New here | The register design of the verb budget (constrained decoding itself is standard); the loop of doubts from three sources. |
| Particular | `SURELY_A_VERB = 20`, set from counts in this dataset ([The rule catalogue](rules.md)). |

The code's names used here are mapped on [hmm-rules' own names](names.md).

---

Next: [Linking units into wires](linking.md) · Up: [hmm-rules in depth](README.md)
