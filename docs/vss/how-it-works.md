[Home](../README.md) › [VSS in depth](README.md) › How it works

# How VSS works

This page: the big picture of VSS, and the only page that lists its steps: its two halves, its three layers of knowledge, why the legend is its only word list, and where vectors fit. Kind: Explanation.

The method terms (HMM, EM, Viterbi, chunking, PPMI) are explained in [Methods VSS uses](methods.md). The steps are as at commit `fa46cb7`; one training step added later is marked.

## Two halves

VSS has two halves that share one file:

- **Training.** `node strategies/vss/train.mjs` reads the message texts of the dataset and writes one JSON file, `strategies/vss/model/model.json`.
- **Reading.** `createVssReader(model).analyse(text)` reads one message. It needs only the model file.

Observation, the HMM decoder and the chunker are used by both halves. The linker and the writer are used only when reading.

## Training, in steps

1. **Texts.** Read the `text` column of every message file, each distinct text once. No label is read.
2. **Observe.** Split each text into tokens. Join what is written as one word, quoted passages, and the compounds the legend lists ("next to").
3. **Spelling variants.** Learn rough word vectors; read a rare word that is one edit from a common word, and used like it, as that word ("shoudl" as "should").
4. **Observe again, and find openers.** Observe with the variants. Find short runs that open many messages before a break ("quick one:").
5. **Vocabulary and sentences.** Keep the words seen at least 3 times, with classes for the rest; cut the text into sentences.
6. **HMM by EM.** Learn the station model: the 25 stations as hidden states, 25 rounds by default, with the legend as prior.
7. **Occurrence prototypes.** From the words tagged with confidence, learn what the neighbours of each station usually look like.
8. **Word vectors.** A vector for each frequent word, from its neighbours.
9. **Habits and memory.** Re-read the text with the new HMM and the chunker, and count what each word does where the structure leaves no doubt; build the role-filler memory.
10. **Kinds from anchored frames.** Counts of each word in frames fixed by function words ("the ___ on"). They are counted before EM and stored after the habits.
11. **Grammatical number** (since `71f0dd2`). Count on the raw text which words name one thing or several, and which words in -s are verbs.

Details: [Training: from text to vocabulary](training.md), [Training: the station HMM](training-hmm.md), [What VSS learns beyond the HMM](learned-knowledge.md).

## Reading, in steps

1. **Observe.** The same code as in training.
2. **Opener bans and occurrence lift.** The words of a learned opener are kept off the verb stations. Each station's emission is re-weighted by how well the word's neighbours fit that station's prototype.
3. **A loop of four steps**, repeated while new doubts arise, at most 4 more times:
   - Viterbi decoding with the verb budget and the bans: one station per word.
   - Chunking into units; the chunker may raise doubts.
   - Linking the units into internal wires; the linker may raise doubts.
   - Whole-text leanings: a station that contradicts what the whole text says about the word raises a doubt.
4. **emit-syntax.** Turn the internal wires into syntax wires, with every word placed.
5. **writeCircuit, then validateSyntax.** The shared writer and checker in `lib/syntax.mjs` and `lib/reader.mjs`.

A **doubt** says that a word should not stand at some stations. The sentence is then decoded again with those stations banned, so the neighbouring words can change too. Details: [Reading](reading.md), [Linking](linking.md), [Writing](writing.md).

## Three layers of knowledge

1. **Stations: word classes learned without labels.** The HMM gives each word a fine word class. What is given by hand is written in the legend: the stations, a starting guess of which station follows which, the closed lists of function words and some word endings.
2. **Habits and vectors.** After tagging the whole dataset, VSS counts on its own readings how each word behaves where the structure leaves no doubt (how often it is a verb, whether it takes a clause, which words it stands with). It also keeps word vectors, learned from each word's neighbours in the raw text, to compare words.
3. **Rules: general rules of English.** Hand-written rules build the circuit from the stations: where a nominal ends, where a relation starts, what a coordination joins. A rule may name only function words and a few common verbs.

## Why the legend is the only word list

The legend (`strategies/vss/legend.sop`) is the only place where English words are listed, so that the reader's code holds no word list of its own ([The legend](legend.md)). Two effects follow from how its lists work:

- **Fixed points for EM.** A closed list confines its words. "the" can only be a determiner, so the probabilities of the stations around it are learned against a known station.
- **Open lists add a use without removing others.** "near" is declared as a preposition in an open list that no other list names, so the text can still teach the HMM its other uses ("the near side").

The code does hard-code the names of stations, marks and slots, so the legend is not independent of the code ([The legend](legend.md)).

## Where vectors fit

The vector operations of `src/space.mjs` are those of vector symbolic architectures ([Methods](methods.md)). In VSS they are a minor helper: they serve word vectors, occurrence prototypes, the comparison of nominals and the role-filler memory. In the earlier `nlu` period they earned about one point of link [F1](https://en.wikipedia.org/wiki/F-score) (how well the links a reader wrote matched saved circuits); the larger gains came from the stations, the counted habits and the structural rules. Source: the section "Limits" of the strategy page of that period, `docs/strategies/vss.md`; the period is summarised in [The nlu-schema period](../project/nlu-period.md).

## Determinism

Training is deterministic. The "random" vectors are derived from each symbol's name by a fixed hash ([FNV-1a](https://en.wikipedia.org/wiki/Fowler%E2%80%93Noll%E2%80%93Vo_hash_function)) and a [xorshift](https://en.wikipedia.org/wiki/Xorshift) generator, and no step draws a random number. The same code, legend and dataset give the same model.

## Standard, new here, particular

| Label | For VSS as a whole |
| --- | --- |
| Standard | HMM trained by EM, Viterbi decoding, chunking, PPMI word vectors, vector-symbolic operations, attachment by counted preference ([Methods](methods.md)). |
| New here | The legend as both the HMM's prior and the only word list; the changes to EM (kinship, sharpening, damping); the register of the verb budget (constrained decoding itself is standard); the doubts loop as designed here; the habits and anchored kinds; rules that name only function words. |
| Particular | Thresholds set on this dataset; learned lists shaped by its text; a few borderline legend words. |

The full block, part by part: [Learned and declared](learned-and-declared.md).

---

Next: [Follow one message through VSS](tutorial-one-message.md) · Up: [VSS in depth](README.md)
