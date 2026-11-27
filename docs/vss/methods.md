[Home](../README.md) › [VSS in depth](README.md) › Methods

# Methods VSS uses, in plain words

This page: the standard methods VSS is built from, each explained in plain words before the other VSS pages use it. Kind: Explanation.

How to read it: one heading per method. Each says what the method does, where VSS uses it, and links the Wikipedia article. None of these methods was invented here; what VSS changes in them is described on its own pages.

## Hidden Markov model (HMM)

A model of a sequence of words in which each word is produced by a hidden state, and each state depends only on the state just before it. The model has transition probabilities (how likely one state follows another), emission probabilities (how likely a state produces a word) and probabilities for the first and the last state of a sentence.

In VSS the hidden states are the 25 **stations**: fine word classes such as determiner, noun, verb that opens its clause, preposition ([The stations](stations.md)). Tagging a sentence means choosing one station per word. Wikipedia: [Hidden Markov model](https://en.wikipedia.org/wiki/Hidden_Markov_model), [Part-of-speech tagging](https://en.wikipedia.org/wiki/Part-of-speech_tagging).

## EM and Baum–Welch

Expectation–maximization (EM) trains a model without labels. It starts from a guess of the parameters. Then it repeats two steps. The expectation step computes, for every word of the text, how likely each state is under the current guess. The maximization step re-estimates the parameters from these expected counts. Baum–Welch is EM for hidden Markov models.

VSS learns its HMM this way from the raw messages, with no annotated sentence, starting from a prior written in the [legend](legend.md), VSS's one hand-written file of English knowledge ([Training: the station HMM](training-hmm.md)). Wikipedia: [Expectation–maximization algorithm](https://en.wikipedia.org/wiki/Expectation%E2%80%93maximization_algorithm), [Baum–Welch algorithm](https://en.wikipedia.org/wiki/Baum%E2%80%93Welch_algorithm), [Unsupervised learning](https://en.wikipedia.org/wiki/Unsupervised_learning).

## Viterbi decoding

The Viterbi algorithm finds the single most probable sequence of states for a sentence. It works by [dynamic programming](https://en.wikipedia.org/wiki/Dynamic_programming): it keeps, for every word and state, the best path that ends there.

VSS uses it to give each word one station. A second Viterbi runs over pairs of a station and a small counter, so that a clause gets one verb (the verb budget, [Reading](reading.md)). Wikipedia: [Viterbi algorithm](https://en.wikipedia.org/wiki/Viterbi_algorithm).

## Forward–backward

The forward–backward algorithm gives, for every word, the probability of each state given the whole sentence. This is the **posterior** probability of the state.

VSS uses it twice. In training it computes the expected counts of the EM rounds. In reading, the posterior of the chosen station is kept and called its "confidence". Training also uses only words whose posterior is at least 0.97 to build the occurrence prototypes ([What VSS learns beyond the HMM](learned-knowledge.md)). Wikipedia: [Forward–backward algorithm](https://en.wikipedia.org/wiki/Forward%E2%80%93backward_algorithm), [Posterior probability](https://en.wikipedia.org/wiki/Posterior_probability).

## Chunking (shallow parsing)

Chunking groups the words of a sentence into flat, non-overlapping phrases, such as noun groups and verb groups, without building a full tree.

VSS's chunker (`src/units.mjs`) cuts the tagged words into **units**: entities (nominals), verb groups and cues (prepositions). The linker then ties the units together ([Reading](reading.md), [Linking](linking.md)). Wikipedia: [Shallow parsing](https://en.wikipedia.org/wiki/Shallow_parsing).

## PPMI and word vectors

Distributional semantics describes a word by the words around it. Pointwise mutual information (PMI) measures how much more often than chance two words stand together. Positive PMI (PPMI) keeps only the positive values. A word vector built from these values places words that are used alike near each other.

VSS builds a vector for each frequent word from its PPMI with the neighbours two words to the left and right, each neighbour tagged with its side. It uses the vectors to compare the heads of two nominals in a coordination, and in its role-filler memory, which records which words filled which role of a verb or a noun. The code calls the vectors "meanings". Wikipedia: [Distributional semantics](https://en.wikipedia.org/wiki/Distributional_semantics), [Pointwise mutual information](https://en.wikipedia.org/wiki/Pointwise_mutual_information), [Word embedding](https://en.wikipedia.org/wiki/Word_embedding).

## Vector-symbolic operations

Vector symbolic architectures, also called hyperdimensional computing, compute with long random vectors:

- **Identity from a name.** Every symbol gets a fixed random vector of +1 and −1, derived from its name.
- **Bind.** Two vectors are multiplied element by element. The result is unlike both inputs. VSS uses it to tag a filler with its role, or a neighbour with its side.
- **Bundle.** Several vectors are added into one.
- **Cosine.** The cosine of the angle between two vectors measures how alike they are.

VSS uses these operations (`src/space.mjs`) for word vectors, occurrence prototypes (what the neighbours of a word class usually look like), the build vector of a nominal (each of its slots bound to what fills it, [Linking](linking.md)) and the role-filler memory. They are a minor helper ([How VSS works](how-it-works.md)). Wikipedia: [Hyperdimensional computing](https://en.wikipedia.org/wiki/Hyperdimensional_computing), [Cosine similarity](https://en.wikipedia.org/wiki/Cosine_similarity).

## Selectional preference and prepositional-phrase attachment

A verb or a noun limits which kinds of words fill its roles; linguists call this selection. A related idea is the subcategorization frame: what a verb takes after it, such as an object, two objects, or an object and a quality.

Prepositional-phrase attachment is deciding whether a phrase such as "on the table" belongs to the verb or to a noun before it. It is a classic case of syntactic ambiguity.

VSS counts, for each verb and noun, how often a preposition belongs to it where the structure leaves no doubt. It then settles the doubtful cases, and keeps a memory of which words filled which role. At reading time the clause and the nominals before a preposition compete by these scores ([Linking](linking.md)). Wikipedia: [Selection (linguistics)](https://en.wikipedia.org/wiki/Selection_(linguistics)), [Subcategorization](https://en.wikipedia.org/wiki/Subcategorization), [Syntactic ambiguity](https://en.wikipedia.org/wiki/Syntactic_ambiguity).

## Underspecification

Underspecification leaves open, in a representation, what the input does not settle, so that a later stage with more information can fill it in without undoing a guess.

When the scores do not separate the places a phrase can start from, VSS lets the relation start at the clause and marks it `attachment=ambiguous`, as the schema's Rule 2 allows ([The five rules](../schema/rules.md)). Wikipedia: [Underspecification](https://en.wikipedia.org/wiki/Underspecification).

## Standard, new here, particular

| Label | For this page |
| --- | --- |
| Standard | Every method on this page. |
| New here | None. The changes VSS makes to these methods are on their own pages. |
| Particular | None. |

More terms: [Glossary](../reference/glossary.md).

---

Next: [How VSS works](how-it-works.md) · Up: [VSS in depth](README.md)
