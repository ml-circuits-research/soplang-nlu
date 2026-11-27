[Home](../README.md) › [VSS in depth](README.md) › Training: text to vocabulary

# Training VSS: from text to vocabulary

This page: what VSS's training reads and how it prepares the text before the HMM is learned: the messages, spelling variants, openers, the vocabulary and the classes for unknown words. Kind: Explanation.

The steps are those of `strategies/vss/train.mjs` as the VSS report describes them at commit `fa46cb7`; the code of these steps has not changed since. Counts that change on retraining (symbols, sentences, variants) are left out. The options are on [VSS commands and options](options.md).

## What training reads

`readMessages` in `src/corpus.mjs` reads every CSV file of `semantic/drawing`, `semantic/diagram`, `semantic/document` and `semantic/calendar` in the dataset (or of the dataset root when it has no `semantic/` folder). It skips files whose first header is not `text`, and keeps each distinct text once.

Only the `text` column is read. No label, no accepted circuit and no annotation of any kind is used. The text includes the messages of the benchmark, without their labels: this is allowed for an unsupervised reader, but it is not a held-out measurement in the strict sense ([Limits of the measurements](../evaluation/validity.md)).

## Spelling variants

Some messages contain misspellings. VSS learns to read a rare word as a common one when the two look and behave alike.

First, training observes every message, counts the words, and learns rough 128-dimensional word vectors for the words seen at least 5 times. Then `findVariants` in `src/variants.mjs` maps a rare word to a common word (a spelling variant) when all of these hold:

- the rare word is all lower-case letters, at least 5 letters long, and seen at most 12 times;
- the common word is all lower-case, at least 5 letters long, seen at least 100 times, and at least 40 times as often as the rare one;
- the two are one edit apart: an insertion, a deletion, a substitution, or a swap of two neighbouring letters (the [Damerau–Levenshtein distance](https://en.wikipedia.org/wiki/Damerau%E2%80%93Levenshtein_distance) is 1);
- the cosine of their vectors is at least 0.6, with 0.15 added when the legend fixes the place of the common word. A rare word without a vector is accepted only when both words have at least 6 letters and the legend lists the common word.

Examples from the model at `fa46cb7`: "shoudl" → "should", "bewteen" → "between", "wihout" → "without". Some are wrong: "foward" → "toward" (it is "forward"), "pleased" → "please", "otters" → "others". Misspellings shorter than 5 letters are never mapped.

From then on, `observe` looks a variant up as its common word. The circuit still quotes the letters of the message, so a variant never changes the words written in it.

## Openers

Some messages begin with a few words and a break: "quick one: …", "from now on, …". Training finds such runs:

- the words before the first comma, colon, semicolon, "!" or dash;
- 1 to 3 words, none of them a mark or a word the legend lists at a structural station (auxiliary, marker, infinitive, relative, negation, preposition, conjunction);
- at least two tokens follow the break.

Such a run is kept as an opener when it was seen at least 5 times and was followed by at least 4 different pairs of words.

Examples from the model at `fa46cb7`: "from now on", "quick one", "actually", "also", "look". Some come from messages built on a common pattern of the dataset: "circle", "260", "goal", "roundup 260". At reading time only openers of 1 or 2 words are used ([Reading](reading.md)).

## Vocabulary and classes for unknown words

`buildVocabulary` in `src/routes.mjs` keeps every word seen at least 3 times (`--min-count`). Every other word is read through one of 16 classes:

- shapes: `~number`, `~date`, `~clock`, `~code`, `~mark`, `~quote`, `~capital`, `~upper`, `~initial`, `~word`;
- endings: `~ing`, `~ed`, `~ly`, `~est`, `~er`, `~s`.

`symbolOf` looks a token up as itself. An unseen lower-case word is looked up as the first of its stems that is in the vocabulary and not confined by the legend; anything else as its class. A word written with a capital inside a sentence is a separate symbol from its lower-case form, unless the legend lists the word (`src/observe.mjs`).

`sentencesOf` in `src/legend.mjs` then cuts the text into sentences: a sentence ends after a run of terminator words ("." "!" "?"). The HMM reads one sentence at a time ([Training: the station HMM](training-hmm.md)).

## Determinism and cost

Training is deterministic: the same code, legend and dataset give the same model ([How VSS works](how-it-works.md#determinism)).

Time and memory: see [STATUS.md, Speed and cost](../STATUS.md#speed-and-cost-per-strategy). The recorded figures disagree. The status page gives the training runs' own reports. The VSS report measured one run of 79.3 s and 1.6 GB at its peak, on a machine with other work running. The older strategy page said about 30 s. None is a controlled measurement.

## Standard, new here, particular

| Label | For this part of training |
| --- | --- |
| Standard | A vocabulary with a minimum count, and classes for unknown words by shape and ending; spelling correction by edit distance. |
| New here | The opener and variant rules as designed here: their thresholds, and the check of a variant by word vectors. |
| Particular | The learned lists come from this dataset's text, and some entries show its patterns ("roundup 260") or are wrong ("foward" → "toward"). |

---

Next: [Training: the station HMM](training-hmm.md) · Up: [VSS in depth](README.md)
