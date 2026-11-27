[Home](../README.md) › [Formalizers](README.md) › hmm-rules

# hmm-rules

This page: an introduction to hmm-rules, the reader built in this project. It says what hmm-rules is, where its name comes from, why it is kept, what in it is standard, new or particular, and where the details are. Kind: Explanation.

**Status: experimental** (the owner's decision of 2026-11-27). hmm-rules is measured on the benchmark, kept runnable and trainable, and still an agreement voice of its own family ([Agreement between formalizers](../evaluation/agreement.md)), but it is not being improved now. spaCy is the one active formalizer ([Formalizers](README.md#experimental)).

## What it is

hmm-rules is the formalizer built in this project: a hidden Markov model learned from raw text, plus general rules that name only function words.

- **It learns from raw text.** Everything it learns comes from the text of the dataset's messages, with no annotated circuit ([unsupervised learning](https://en.wikipedia.org/wiki/Unsupervised_learning)). Training reads only the text column of the dataset.
- **It is plain JavaScript.** It has no dependencies and needs only [Node.js](https://en.wikipedia.org/wiki/Node.js): no Python and no GPU.
- **It has one model file.** Training writes `strategies/hmm-rules/model/model.json`. A hand-written file, the legend (`strategies/hmm-rules/legend.sop`), gives what is not learned: the list of word classes, a starting guess of their order, the closed lists of function words and some word endings.

The code is in `strategies/hmm-rules/`.

## Name

The strategy was called `vss` until 2026-11-27. The owner renamed it `hmm-rules` that day, because the old name caused confusion: the reader is a hidden Markov model plus rules, not a vector-symbolic reader. It had kept the name of an earlier vector-symbolic reader, and only the few parts listed here ([History in brief](../project/history.md#the-origin-of-vss)). What it kept from that reader:

- the vector toolkit of [vector symbolic architectures](https://en.wikipedia.org/wiki/Hyperdimensional_computing) (binding, bundling, cosine similarity), now a minor helper for word vectors and comparisons;
- determinism: the same message and model always give the same circuit;
- output in SOP Lang;
- the words legend, route book and world, with new meanings. The legend is the one hand-written file of stations and function words. The route book is the two tables of probabilities of the hidden Markov model. "World" survives only in the legend's header, "one world for every text": one model for all messages.

The real vector-symbolic reader is `rvss`, being built in `strategies/rvss/` ([History in brief](../project/history.md#rvss)).

Old run folders still hold `vss.jsonl`, and registry lines written before the rename name `vss` among their sources; the `source` cells of the dataset's syntactic files were rewritten to `hmm-rules`. The benchmark tools read `vss` as `hmm-rules` wherever it is left ([Analysis tools](../reference/analysis-tools.md)). The legend's own type names (`vss.station`, `vss.words` and the others) keep the old prefix: they are the legend's file format, and the model file holds a copy of the legend, so renaming them means training again.

## How it reads a message

hmm-rules first gives every word a fine-grained word class, called a **station** (determiner, noun, verb that opens its clause, preposition, and so on). The stations come from a [hidden Markov model](https://en.wikipedia.org/wiki/Hidden_Markov_model) (HMM). In plain words, an HMM takes each word of a sentence to be produced by a hidden class, here a station, and each class to depend only on the class before it. It holds two tables of probabilities: how likely each station follows each other one, and how likely each word is at each station. hmm-rules learns these tables from the raw text with the [Baum–Welch algorithm](https://en.wikipedia.org/wiki/Baum%E2%80%93Welch_algorithm) (guess the tables, count what the guess implies, re-estimate, repeat), and reads a message with the [Viterbi algorithm](https://en.wikipedia.org/wiki/Viterbi_algorithm), which finds the single most probable sequence of stations. Hand-written rules about English then group the words into units (chunks such as a noun group or a verb group) and link the units into the clauses, nominals, relations and coordinations of the circuit ([Read your first circuit](../concepts/first-circuit.md)). The steps, one by one, are in [How hmm-rules works](../hmm-rules/how-it-works.md).

## Why it is kept, although spaCy scores higher

spaCy scores higher on the benchmark ([STATUS](../STATUS.md#the-benchmark-live)). hmm-rules is still measured, for four reasons:

1. **A different source.** Its stations are learned from raw text, and its rules may name only [function words](https://en.wikipedia.org/wiki/Function_word) ("the", "of", "and", pronouns and the like) and a few common verbs. So it reads a message differently from a parser trained on [treebanks](https://en.wikipedia.org/wiki/Treebank), and when hmm-rules and spaCy write the same circuit, the agreement means something ([Agreement between formalizers](../evaluation/agreement.md)).
2. **Owned and extendable.** The project owns every part of it, so a fault found by the judges can be fixed by a general rule.
3. **Light to run.** It needs only Node.js. It could run in a browser once a small loader exists. Today it cannot: `lib/syntax.mjs`, which it uses to write its circuits, reads the schema file with `node:fs` when it is loaded.
4. **Not trained on the labels.** Most [labels](../evaluation/dataset.md) of the dataset are circuits that hmm-rules and spaCy wrote alike. Training hmm-rules on them would partly train it on its own output, and its agreement with spaCy would then mean less.

## Standard, new here, particular

| Label | In hmm-rules |
| --- | --- |
| Standard | [Part-of-speech tagging](https://en.wikipedia.org/wiki/Part-of-speech_tagging) with a hidden Markov model, trained by [expectation–maximization](https://en.wikipedia.org/wiki/Expectation%E2%80%93maximization_algorithm) and decoded by Viterbi, also under a constraint (constrained decoding). Grouping words into base phrases ([shallow parsing](https://en.wikipedia.org/wiki/Shallow_parsing), also called chunking). Distributional word vectors built with the operations of [vector symbolic architectures](https://en.wikipedia.org/wiki/Hyperdimensional_computing). Counting what words take after them ([subcategorization](https://en.wikipedia.org/wiki/Subcategorization) frames) and where their phrases attach. Learning from its own readings ([self-training](https://en.wikipedia.org/wiki/Weak_supervision)). A hand-written tag set and list of function words. |
| New here | The content of the legend (its 25 stations and its word lists), written in SOP Lang. The verb budget: the constraint of the decoding, one verb per clause, counted while decoding. The doubts loop: the later steps can send back a doubt, for example "this word is not a verb here", and the sentence is tagged again, at most four more times. Which word habits are counted, and in which patterns. The rules themselves, which name only function words and a few common verbs. |
| Particular | Some thresholds were chosen on this dataset (for example, a word seen as a thing at least 20 times). The constructions covered follow this dataset's frequent faults. A few borderline words remain in the legend: left, right, today, tomorrow, thanks. |

The full account, part by part, is in [Learned and declared](../hmm-rules/learned-and-declared.md).

## Speed and cost

Under a millisecond per message on one CPU core, and no labels are needed to train it. Comparison: [Speed and cost](speed.md). Numbers: [STATUS](../STATUS.md#speed-and-cost-per-strategy).

## Known limits

- **One path, one pass.** Each round of tagging gives one sequence of stations, and the linking is one pass. Different readings are never built and compared.
- **Tuned on this data.** Some thresholds, and the choice of which constructions to cover, come from this dataset. hmm-rules has not been tried on English outside it.
- **Not yet in a browser.** Loading it still needs Node.js file access (see above).

The full list is in [Known limits of hmm-rules](../hmm-rules/limits.md).

## Run it

- Run it on a message: [Run a formalizer](../guides/run-a-formalizer.md).
- Train the model again: [Retrain the hmm-rules model](../guides/retrain-hmm-rules.md).

## Details

[hmm-rules in depth](../hmm-rules/README.md): methods, training, the legend, reading, linking, writing, the rule catalogue, options.

---

Next: [spaCy](spacy.md) · Up: [Formalizers](README.md)
