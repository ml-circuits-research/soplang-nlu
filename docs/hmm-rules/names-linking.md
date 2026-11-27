[Home](../README.md) › [hmm-rules in depth](README.md) › [hmm-rules' own names](names.md) › Names in the linker

# Names in the linker

This page: the names the hmm-rules code uses for what its linker knows and does (habits, kinds, attachment sites, gaps, marks, confidence), with the established term, plain words and the file where each lives. Kind: Reference.

The names of training and reading (station, route, legend, unit, doubt and others), and where these names come from, are on [hmm-rules' own names](names.md). Project-wide terms: [Glossary](../reference/glossary.md).

## habits

| Field | Value |
| --- | --- |
| Term | Counted approximations of [subcategorization](https://en.wikipedia.org/wiki/Subcategorization) frames, of the noun/adjective distinction, of attachment preferences and of collocations. |
| Plain words | What a word was seen doing where the structure left no doubt ([What hmm-rules learns](learned-knowledge.md)). |
| File | `src/habits.mjs` |

## kinds, anchored frames

| Field | Value |
| --- | --- |
| Term | Counts in diagnostic contexts. |
| Plain words | How often a word stood where function words fix its class ("the ___ on" is a noun); three counts per word: verb, thing, quality. |
| File | `src/anchors.mjs` (stored as `habits.kinds`) |

## placedBy, chain

| Field | Value |
| --- | --- |
| Term | The attachment site of the phrase that holds a nominal; the sequence of such sites. |
| Plain words | In "a boy with a happy face next to the table", "face" is placed by "boy"; the chain of "face" is face, boy. |
| File | `src/links.mjs` |

## set-off place phrase

| Field | Value |
| --- | --- |
| Term | A fronted or parenthetical prepositional phrase. |
| Plain words | A phrase set off by commas whose preposition points at a known thing, before a new thing: ", next to the crate, a small black cat". |
| File | `src/links.mjs` (`fill`) |

## frontier

| Field | Value |
| --- | --- |
| Term | The candidates for coordination. |
| Plain words | The nominals already seen in the current clause ([Linking](linking.md)). |
| File | `src/links.mjs` (`fill`) |

## gap, gapOf

| Field | Value |
| --- | --- |
| Term | [Gapping](https://en.wikipedia.org/wiki/Gapping): ellipsis of the verb in a coordinated clause. |
| Plain words | "make A blue and B green": "B green" borrows "make". |
| File | `src/links.mjs` |

## host

| Field | Value |
| --- | --- |
| Term | An attachment site. |
| Plain words | A wire a relation may start from: the clause, or a nominal before the preposition. |
| File | `src/links.mjs` (`attach`) |

## likeness

| Field | Value |
| --- | --- |
| Term | [Cosine similarity](https://en.wikipedia.org/wiki/Cosine_similarity) of vectors. |
| Plain words | How alike two nominals are: their head words and their build ([Linking](linking.md)). |
| File | `context.alike` (`src/reader.mjs`); `UNLIKE = 0.3` (`src/links.mjs`) |

## open marks

| Field | Value |
| --- | --- |
| Term | Marks of [underspecification](https://en.wikipedia.org/wiki/Underspecification). |
| Plain words | What the words leave open: `attachment=open`, a tie with no linking word, a `participant`. In the syntax output only `attachment=ambiguous` remains. |
| File | `src/links.mjs` |

## confidence

| Field | Value |
| --- | --- |
| Term | The [posterior probability](https://en.wikipedia.org/wiki/Posterior_probability) of the chosen station. |
| Plain words | How sure the model is of a word's station, computed without the verb budget; only its minimum is returned, and neither the common reader nor the benchmark tools read it. |
| File | `src/routes.mjs` (`readSentence`) |

---

Next: [hmm-rules commands and options](options.md) · Up: [hmm-rules' own names](names.md)
