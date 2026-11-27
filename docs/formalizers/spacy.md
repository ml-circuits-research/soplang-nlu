[Home](../README.md) › [Formalizers](README.md) › spaCy

# spaCy

This page: an introduction to the spaCy formalizer. It is an outside dependency parser, plus this project's circuit writer, its repairs, and two word lists counted from raw text. Kind: Explanation.

## What it is

[spaCy](https://en.wikipedia.org/wiki/SpaCy) is an open-source library for language processing. Its English pipeline `en_core_web_trf` 3.8.0 (spaCy 3.8) includes a [dependency parser](https://en.wikipedia.org/wiki/Dependency_grammar): for every word it gives a head word and the grammatical relation to it. How such a parse is written down is explained in [How grammar is usually written down](../concepts/grammar-notation.md).

This project adds the layer that turns the parse into a circuit. Its code is spread over four folders, for historical reasons (paths checked at commit `97a1b83`):

| Folder | What it holds |
| --- | --- |
| `spacy/` | The strategy itself: `spacy-beam` under one name. |
| `spacy-beam/` | The use of the parser's beam (below). |
| `spacy-direct/` | The repairs (`word-repairs.mjs`, `clause-repairs.mjs`), the two word lists, and `index.mjs`, which applies the repairs before the circuit is written. |
| `neural-dependencies/` | The Python transport (`worker.py`) and the circuit writer (`syntax-circuit.mjs`). |

All four are under `strategies/`. Three strategies used to read the parse: `neural-dependencies` wrote it as it stands, `spacy-direct` repaired it first, and `spacy-beam` added the beam to `spacy-direct`. `spacy-beam` held everything the other two did, so it became the one strategy `spacy`. In measurement, `spacy` replaces the other two, which are now [retired](retired.md).

Two word lists are counted over the raw text of the dataset's messages, with no labels and no parse:

- **Command openers** (since `730c906`): how often a word that opens a sentence is followed by a determiner or an object pronoun. A word followed so in at least half of its openings opens commands, so it is a verb there. `learn-openers.mjs` counts them and writes `command-openers.mjs`.
- **Describing words** (since `fa4452c`): how a word stands after a determiner, before a noun, and alone after "it", "them" or a form of "be". This tells an adjective from a noun the tagger misread. `learn-describing.mjs` counts them and writes `describing-words.mjs`.

## How it reads a message

1. **Parse.** The parser gives the greedy parse (its single best guess), plus up to three other parses from its [beam](https://en.wikipedia.org/wiki/Beam_search), with their probabilities. Every parse has the same words and word classes.
2. **Units.** One unit per word of the message. A quotation or a hyphenated compound is one unit.
3. **Word-class repairs.** A word class, or a link from a word to its head (an arc), that the parser got wrong is corrected. An example is the first word of a command read as a noun ("tint the Intro node orange").
4. **Clause-boundary repairs.** Clauses that the parser hung on each other are set side by side, for example across a semicolon or a dash.
5. **The form of each clause.** Imperative, declarative, interrogative, nonfinite or fragment, decided from the verb form, the word order and the punctuation.
6. **Wires.** Every word gets one place in one wire (one line of the circuit), by the relation the parser gave it.

The beam gives two things more. When the greedy parse leaves words without a grammatical place, a beam parse that places more of them is used instead. And a phrase opened by a linking word, such as "by name" in "make a bar chart of the projects by name", may hang on different words in different beam parses. Where the parses that hang it elsewhere in the same clause hold at least a quarter of the beam's probability, the phrase is written as hanging from the clause, with `attachment=ambiguous`: the words do not settle where it hangs ([Read your first circuit](../concepts/first-circuit.md)).

## Standard, new here, particular

| Label | In the spaCy formalizer |
| --- | --- |
| Standard | The parser, trained by spaCy's makers on [treebanks](https://en.wikipedia.org/wiki/Treebank). The installed pipeline's metadata names its sources: the annotated corpus OntoNotes 5, with its phrase-structure trees converted to dependencies by ClearNLP; WordNet 3.0; and the pretrained roberta-base [transformer](https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture)). Dependency analysis and beam search are established methods, and so is telling word classes apart by where words stand (the distributional tests of reference grammars, cited in `learn-describing.mjs`: Huddleston and Pullum 2002). |
| New here | The circuit writer. The repairs of word classes and clause boundaries. The beam rule for `attachment=ambiguous`. The two word lists counted from raw text. |
| Particular | The repairs were found on this dataset's rejected circuits, partly on the benchmark's. The word lists are counted on this dataset's messages. The rules name only function words, plus "left" (the past form of "leave"), read as a direction word in "left of"; the journal notes "left" as a borderline case. The list of auxiliaries also holds verbs a parser hangs as auxiliaries, such as "get" and "let" (header of `word-repairs.mjs` at `fa4452c`). |

## Speed and cost

Tens of milliseconds per message on a CPU; it needs Python and a large transformer model. Comparison: [Speed and cost](speed.md). Numbers: [STATUS](../STATUS.md#speed-and-cost-per-strategy).

## Known limits

Checked against the code at `fa4452c`:

- **The beam varies only the arcs.** The beam parses keep the greedy parse's word classes. A word class the tagger gets wrong is fixed only by a repair.
- **Noun or verb at the start.** A first word that can be a noun or a verb, followed by a small-letter noun, stays a noun unless the raw text shows it opening commands. "book design review" stays a noun phrase: "book" is followed by a determiner or pronoun in 22 of the 186 sentences it opens, under the half the rule needs.
- **Appositions with a coordination.** "two measures, total sales and total profit" keeps the parser's apposition (a second noun phrase that renames the first). The list rule of `730c906` joins an item to a list only when it brings in a new thing (an indefinite article or a numeral).
- **Tried and dropped.** The tagger's own probabilities did not help: it is confident in its wrong tags (`730c906`).
- **Not an unseen sample.** Its repairs were measured partly on the benchmark's rejected circuits, so its benchmark score is likely higher than on new messages ([Limits of the measurements](../evaluation/validity.md)).
- **Slow for whole-dataset reruns.** It is the slowest step of every rerun over the whole dataset ([Speed and cost](speed.md)).

More, with the earlier limits that later rounds addressed: [spaCy: how a circuit is written](spacy-details.md#known-limits).

## Run it

- Set up Python and the model, and run it: [Run a formalizer](../guides/run-a-formalizer.md).
- Improve it: [Add a repair to the spaCy formalizer](../guides/add-spacy-repair.md).

## Details

[spaCy: how a circuit is written](spacy-details.md): the transport, every repair, the repair rounds by commit, the tests.

---

Next: [spaCy: how a circuit is written](spacy-details.md) · Up: [Formalizers](README.md)
