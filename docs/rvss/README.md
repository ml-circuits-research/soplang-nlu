[Home](../README.md) › rVSS

# rVSS: the recursive vector-symbolic reader

This page: the index of the rvss section. It says what rvss is, where it stands, how it relates to hmm-rules and to the original vector-symbolic reader, and lists the pages in reading order. Kind: Explanation.

## rvss in five lines

1. rvss (recursive VSS; written rVSS in titles) is a [formalizer](../formalizers/README.md) being built in this project, in the folder `strategies/rvss/`. It reads one message and writes its syntax [circuit](../concepts/first-circuit.md).
2. Every wire of the circuit becomes a small **constellation**: a sum of word vectors, each bound to the vector that names its key. The algebra is that of [vector-symbolic architectures](https://en.wikipedia.org/wiki/Hyperdimensional_computing) (VSA).
3. A finished constellation is **condensed** into one vector, a star, and placed in the constellation of the wire that holds it, like a word: constellations of constellations, shaped like the circuit graph.
4. A **pilot** walks the words from left to right. A learned **route book** says at which key each word lands, and learned **gates** say when a constellation opens and when it closes.
5. Everything learned is trained from accepted circuits, with a target at every wire and every decision. No word list and no rule that names a word is used.

## Where it stands

rvss is being built (2026-11-27). The design is in its third revision: [strategies/rvss/DESIGN.md](../../strategies/rvss/DESIGN.md). The representation has been checked with the structure of each label given, and nothing learned has been measured on the benchmark yet. What runs now, and every number as it comes, is on the status page, [Working on now](../STATUS.md#working-on-now). The plan is on [Milestones and what to expect](milestones.md).

**Before you read.** These pages assume you know what a circuit, a wire, a clause, a nominal and a relation are: [Read your first circuit](../concepts/first-circuit.md) and [The syntax schema in brief](../schema/overview.md). Any other term: [Glossary](../reference/glossary.md).

## Where it comes from

- **The original reader.** An earlier vector-symbolic reader, in the repository `vsa-semantic-space`, and its book, ["Meaning as a Path"](https://scriptahub.com/books/meaning/as/a/path/bk-85adcf86fc264f11/en/full_content.html). It writes a whole sentence into one chart. Its own words (stars, keys, route book, pilot) are kept in these pages, and [The story](story.md) explains them.
- **The owner's direction.** Not one representation for the whole text, but representations of representations, shaped like the graph of a SOP Lang circuit; the learning is about how the stars are placed and moved (quoted in full at the top of DESIGN.md).
- **hmm-rules** (called `vss` until 2026-11-27) is a different reader: a [hidden Markov model](https://en.wikipedia.org/wiki/Hidden_Markov_model) plus hand-written rules that name only function words ([hmm-rules in depth](../hmm-rules/README.md)). How the two relate is the subject of [rvss as an HMM plus a VSA memory](hmm-plus-vsa.md). The short history: [History in brief](../project/history.md#rvss).

## The pages

Read them in this order; each ends with a link to the next.

1. [The story: stars, keys and constellations](story.md): how rvss reads, in the book's words, with "move the blue box next to the red circle" built step by step. *Explanation.*
2. [Legend, values and kinds](legend-and-kinds.md): what rvss declares, what it reads and what it learns; three different things called "legend". *Explanation.*
3. [Mechanics: the formulas of rvss](mechanics.md): the atoms, the constellations, condensing, the route book, the gates, the beam, the losses, the readout. *Reference.*
4. [rvss as an HMM plus a VSA memory](hmm-plus-vsa.md): the control as a hidden Markov model, the content as a vector-symbolic memory, the hierarchy as a hierarchical HMM; where the analogy stops. *Explanation.*
5. [What research says for rvss](what-research-says.md): published results grouped by topic, each with one line for rvss, and the decisions they imply. *Reference.*
6. [Milestones and what to expect](milestones.md): M1 to M3 and the benchmark, what each measures, the honest expectation. *Explanation.*

If the word "legend" or "kind" has confused you elsewhere, read page 2 first.

## Words used in this section

| Term | Meaning here |
| --- | --- |
| star | A vector of the space: a word's star, a key's named star, or a condensed constellation. |
| named star | The fixed vector of one key of the syntax schema (`verb`, `head`, `marker`, …). |
| key, binding | Moving a star by a named star; in VSA terms, binding. Unbinding moves it back. |
| constellation | The sum of the stars placed in one wire (the book's chart). |
| condensing | Turning a finished constellation into one star placed in its parent. |
| atlas | The store of every condensed star, used to unfold wires when reading. |
| pilot | The part that walks the words and makes the moves. |
| route book | The learned keys that decide where each star lands. |
| gate | A learned decision: does a constellation close here, does a new one open? |
| kind | A learned class of words that the route book is indexed by. |
| held aside | A star waiting for a holder that has not opened yet. |
| margin | The best score minus the second best: how sure a choice is. |
| remainder | What a constellation holds that the reading does not explain. |
| oracle | The procedure that turns a label circuit into the sequence of moves that builds it; its moves are the training targets. |
| beam | A search that keeps the few best partial readings at each word instead of one. |

## Code and design

- `strategies/rvss/DESIGN.md`: the design (third revision); `DESIGN-hier-v2.md`, `DESIGN-hier-v1.md` and `DESIGN-flat.md` are the earlier versions, kept unchanged.
- `strategies/rvss/hierarchy-checks/v2/`: the checks of the third revision on the data snapshot `0a01d23` (the tree statistics, the move oracle with its replay, the read-back).
- `strategies/rvss/data/` and `strategies/rvss/eval/`: the training sets, the move sequences and the evaluation harness of the current sprint.

## Standard, new here, particular

| Label | For rvss |
| --- | --- |
| Standard | Holographic reduced representations and their algebra (Plate 1995); clean-up memory; transition-based reading with an oracle (Nivre 2008); beam search. |
| New here | One constellation per wire, condensed into a star placed in its parent; the atlas as the item memory of wires; the route book inside each constellation; moves of stars between constellations. |
| Particular | The keys are those of this project's syntax schema; the labels are this project's accepted circuits, mostly agreement circuits of hmm-rules and spaCy. |

The sources of the Standard row are linked on [Mechanics](mechanics.md) and [What research says](what-research-says.md).

---

Next: [The story: stars, keys and constellations](story.md) · Up: [Home](../README.md)
