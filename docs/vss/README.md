[Home](../README.md) › [Formalizers](../formalizers/README.md) › [VSS](../formalizers/vss.md) › In depth

# VSS in depth

This page: the index of the VSS section. It says what VSS is, the constraints it is built under, which code these pages describe, and lists the pages in reading order. Kind: Explanation.

## VSS in two sentences

VSS is the reader built in this project. It learns classes of words from the raw text of the messages, with no labels, and then builds the syntax [circuit](../reference/glossary.md#project-terms) of a message with hand-written rules about English that name only [function words](https://en.wikipedia.org/wiki/Function_word) (words such as "the", "of", "and", "is").

The one-page introduction, with how to run VSS and what it costs, is [VSS](../formalizers/vss.md). The pages of this section go into detail, for a developer who wants to change VSS or a reviewer who wants to judge its design.

**Before you read.** These pages assume you know what a circuit, a wire, a clause, a nominal and a relation are. If not, read [SOP Lang: the notation](../concepts/sop-lang.md), [Grammar: the clause](../concepts/grammar-clause.md), [Grammar: phrases, linking words, attachment](../concepts/grammar-phrases.md) and [Read your first circuit](../concepts/first-circuit.md) first. Any other term: [Glossary](../reference/glossary.md).

## Which code these pages describe

Most pages come from the VSS report, [vss-architecture.html](../vss-architecture.html) (full report, HTML, open from a local checkout). The report describes `strategies/vss` at commit `fa46cb7` (2026-11-27 17:49). VSS changed after that commit:

- `83fce90` (18:13): the measured prototypes of the lever study, and a few legend words.
- `71f0dd2` (20:05): grammatical number learned from the raw text, and a retrained model.
- `85de0bb` (20:44): a round of rules from fault groups found inside and outside the benchmark.
- `c080ce8` (21:49): lists after "with" and after colons, dashes setting a part aside, "-ing" verbs after the verbs that take them (learned from the raw text), grading words before nouns, "until" clauses.

Each page says what it describes. A fact that changed after `fa46cb7` is marked with the commit that changed it. The rules of `c080ce8` are listed above only; the pages do not describe them yet. Current work on VSS is listed in [STATUS.md, Working on now](../STATUS.md#working-on-now).

## The constraints

VSS is built under six constraints. They come from the report (section 1) and from the owner's decisions ([Decisions](../project/decisions.md), in particular D4 and D5).

| Constraint | What it means and where it shows |
| --- | --- |
| Unsupervised | Everything VSS learns comes from the text of the messages. No annotated circuit is read for learning: `src/corpus.mjs` reads only the `text` column of the dataset's message files. |
| Portable | The goal: plain JavaScript with no dependencies, so that the reader could run in a browser. Today loading still needs Node.js file access, because `src/emit-syntax.mjs` imports `lib/syntax.mjs`, which reads `schemas/syntax/schema.sop` with `node:fs`. |
| No knowledge base | One message at a time, with no context and no pronoun resolution. A test (`tests/vss-syntax.test.mjs`) checks that the reader's files do not mention the knowledge repository. |
| Every word once | `writeCircuit` in `lib/syntax.mjs` refuses a circuit in which a word is not covered or is claimed twice. Before writing, VSS gives every left-over word a `discourse` place: a word of its clause that fills no role. |
| One circuit | One circuit per message, in the syntax schema. `lib/reader.mjs`, the shared code through which every formalizer is called, checks it with `validateSyntax`. |
| Function words only | Rules and word lists may name only function words and a few common verbs, never nouns, adjectives or anything particular to the dataset. A few borderline words remain in the legend: left/right, today/tomorrow, thanks. |

## Why the project keeps VSS

spaCy scores higher on the benchmark, and VSS is still the focus. The reasons (a different source of knowledge, owned and extendable, light to run, not trained on the labels) are given once, in [VSS: why it is the focus](../formalizers/vss.md#why-it-is-the-focus-although-spacy-scores-higher).

## The pages

### Overview

1. [Methods VSS uses, in plain words](methods.md): the standard methods, each with a Wikipedia link.
2. [How VSS works](how-it-works.md): the big picture, the steps of training and of reading.
3. [Follow one message through VSS](tutorial-one-message.md): a tutorial with real output.

### The legend and training

4. [The legend](legend.md): the one hand-written file of English knowledge.
5. [The legend's marks](legend-marks.md): the labels on word lists that rules consult.
6. [The stations](stations.md): the 25 word classes, one by one, with [Stations of nominals](stations-nominals.md) and [Stations of clauses](stations-clauses.md).
7. [Training: from text to vocabulary](training.md): messages, spelling variants, openers.
8. [Training: the station HMM](training-hmm.md): how the word classes are learned.
9. [What VSS learns beyond the HMM](learned-knowledge.md): vectors, habits, kinds.
10. [The model file](model-file.md): what `model.json` holds.

### Reading and writing

11. [Reading: from words to units](reading.md): decoding, chunking, doubts.
12. [Linking units into wires](linking.md): clauses, coordination, attachment.
13. [Writing the syntax circuit](writing.md): from internal wires to the schema.

### Rules, limits and look-up

14. [The rule catalogue in brief](rules.md): the hand-written rules by group.
15. [Learned and declared](learned-and-declared.md): Standard, New here, Particular for every part.
16. [Known limits of VSS](limits.md).
17. [Making VSS reusable](reuse.md): what is not yet general, and the plan.
18. [VSS's own names](names.md): the code's words and the established terms, with [Names in the linker](names-linking.md).
19. [VSS commands and options](options.md).

## Origin and full report

The name VSS and some of its vocabulary come from an earlier, vector-symbolic reader; the current VSS is a new reader. The short history is in [History in brief](../project/history.md). The full design, every rule at `fa46cb7` and the measurements of that day are in the report, listed with the other reports in [The full reports](../project/reports.md).

---

Next: [Methods VSS uses, in plain words](methods.md) · Up: [VSS](../formalizers/vss.md)
