[Home](../README.md) › [hmm-rules in depth](README.md) › hmm-rules' own names

# hmm-rules' own names

This page: the names the hmm-rules code uses for its parts in training and reading, with the established term, plain words and the file where each lives; the names of the linker's knowledge are on [Names in the linker](names-linking.md). Kind: Reference.

The hmm-rules code uses words of its own, many taken from the earlier `nlu` schema; the other pages of this wiki use the established terms. When you read the code, look a name up here. Sources: the architecture report (section 2) and the decisions report (section 1.4). Project-wide terms: [Glossary](../reference/glossary.md). Some names (legend, route book, world) come from an earlier vector-symbolic reader, with new meanings in hmm-rules ([History in brief](../project/history.md), [hmm-rules: Name](../formalizers/hmm-rules.md#name)); the legend's own header still calls it "one world for every text". The legend's type names (`vss.station` and the others) keep the strategy's old name, vss: they are the legend's file format, and the model file holds a copy of the legend, so renaming them means training again.

**On this page:** station; route; route book; legend; unit; entity; cue; marker (station); doubt; verb budget; occurrence prototype, lift; meanings; memory (role-filler memory).

**On [Names in the linker](names-linking.md):** habits; kinds, anchored frames; placedBy, chain; set-off place phrase; frontier; gap, gapOf; host; likeness; open marks; confidence.

## station

| Field | Value |
| --- | --- |
| Term | A hidden state of a [hidden Markov model](https://en.wikipedia.org/wiki/Hidden_Markov_model); here a fine part-of-speech tag tied to a slot of the `nlu` schema. |
| Plain words | The kind of position a word stands in: determiner, noun, verb that opens its clause, … ([The stations](stations.md)). |
| File | `legend.sop` (`vss.station`), `src/routes.mjs` |

## route

| Field | Value |
| --- | --- |
| Term | The state sequence (tag sequence) of a sentence. |
| Plain words | One station per word of the sentence. |
| File | `src/routes.mjs` (`readRoutes`) |

## route book

| Field | Value |
| --- | --- |
| Term | The parameters of the hidden Markov model: transition and emission probabilities. |
| Plain words | How likely each station follows each other one, and how likely each word is at each station. |
| File | `src/routes.mjs` (`learnRoutes`) |

## legend

| Field | Value |
| --- | --- |
| Term | A hand-written grammar resource: a tag set, a prior on tag transitions, a lexicon of closed-class words, morphological rules. |
| Plain words | The list of stations and the few English words whose place the language fixes ([The legend](legend.md)). |
| File | `strategies/hmm-rules/legend.sop`, `src/legend.mjs` |

## unit

| Field | Value |
| --- | --- |
| Term | A chunk, the output of [shallow parsing](https://en.wikipedia.org/wiki/Shallow_parsing). |
| Plain words | A run of words that belong together: a noun group, a verb group, a preposition. |
| File | `src/units.mjs` |

## entity

| Field | Value |
| --- | --- |
| Term | A nominal (noun phrase). |
| Plain words | The internal name of a nominal; it becomes `syntax.nominal`. |
| File | `src/units.mjs`, `src/links.mjs` |

## cue

| Field | Value |
| --- | --- |
| Term | A preposition, as a station; on internal relations and coordinations, the linking word in general. |
| Plain words | "on", "next to", "of"; also "and" on a coordination. It becomes `marker` (or `conjunction`). |
| File | `legend.sop`, `src/links.mjs` |

## marker (station)

| Field | Value |
| --- | --- |
| Term | A subordinating conjunction. |
| Plain words | "if", "because", "while". |
| File | `legend.sop` |

## doubt

| Field | Value |
| --- | --- |
| Term | A tagging constraint sent back to the decoder: constrained re-decoding after a failed attachment. |
| Plain words | "This word must not be (or must be) at these stations; decode again" ([Reading](reading.md)). |
| File | `src/units.mjs`, `src/links.mjs`, `src/reader.mjs` |

## verb budget

| Field | Value |
| --- | --- |
| Term | Constrained Viterbi decoding: the decoder's state is a station paired with a small counter. |
| Plain words | One verb per clause, counted while decoding. |
| File | `src/routes.mjs` (`budgetPath`) |

## occurrence prototype, lift

| Field | Value |
| --- | --- |
| Term | The [centroid](https://en.wikipedia.org/wiki/Centroid) of context vectors, one per tag. The lift is a re-weighting of emission probabilities by them. |
| Plain words | What the neighbours of a word at a given station usually look like. The lift is their second opinion on each word's station ([Reading](reading.md)). |
| File | `src/occurrence.mjs`; the lift in `src/reader.mjs` |

## meanings

| Field | Value |
| --- | --- |
| Term | Distributional word vectors ([distributional semantics](https://en.wikipedia.org/wiki/Distributional_semantics)). |
| Plain words | A word is known by the words around it. |
| File | `src/meaning.mjs` |

## memory (role-filler memory)

| Field | Value |
| --- | --- |
| Term | Selectional preferences ([selection](https://en.wikipedia.org/wiki/Selection_(linguistics))), stored as bundled vectors. |
| Plain words | Which kinds of words fill which role of a verb or a noun. |
| File | `src/meaning.mjs` |

---

Next: [Names in the linker](names-linking.md) · Up: [hmm-rules in depth](README.md)
