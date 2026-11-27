[Home](../README.md) › [rVSS](README.md) › Legend, values and kinds

# Legend, values and kinds

This page: three words that are easy to confuse in this project (legend, value, kind): what rvss declares, what it reads and what it learns, where the kinds of words come from, and what the remainder can say about the schema. Kind: Explanation.

## Three things called "legend"

The word "legend" names three different things in this project.

| Term | What it is |
| --- | --- |
| The book's legend | The questions a world asks, each with a named star. The book: "The legend is the system's schema"; once a person approves it, it is "declared, not learned". |
| rvss's legend | The keys of the syntax schema, as named stars, with the type stars and a few stars of rvss's own. Declared. |
| hmm-rules' legend | The file `strategies/hmm-rules/legend.sop`: the 25 stations of its HMM and their lists of function words, written by hand ([The legend](../hmm-rules/legend.md)). Not used by rvss. |

In short: in rvss, **the legend is the schema**. It says which questions a wire of each type can answer, and nothing in rvss learns or changes it.

## What rvss declares: the legend

| Part | Content |
| --- | --- |
| Named stars | One per key of each wire type: nominal `head`, `dependent`; relation `marker`, `negation`, `to`; coordination `conjunct`, `conjunction`; clause `verb`, `auxiliary`, `negation`, `modifier`, `discourse`, `subject`, `complement`, `ellipsis`. |
| Holding | The schema's `from` becomes holding: the wire a relation starts from holds the relation's star at a key rvss calls `rel`. |
| Own stars | `R_aside` (held aside), `R_top` (a top wire of the message), `R_attachment` with the value star `V_ambiguous`. |
| Type stars | Eight: nominal, relation, coordination, and the clause in its five forms; plus one for a word. The clause's `form` is read from its type star, not from a key. |
| Domains | Which keys each type has, taken from the schema; placements and moves are restricted to them. |

These stars are random vectors made from a fixed seed. They are not stored and never trained: anyone with the seed builds the same ones. This follows the book: a legend is "declared, not learned".

## What rvss reads: the values

A value is what stands at a key. In rvss it is one of two things:

- **A word**: its star is computed from its letters (the whole word and its groups of three letters). Fixed, not learned. Every word has one, including words never seen in training.
- **A condensed constellation**: the star of a finished wire, computed from what that wire holds. Not learned either: it is the result of reading.

So values are read, not learned. Two messages with the same words in the same structure give the same stars.

## What rvss learns: the route book

Everything learned is the route book and the decisions around it ([Mechanics](mechanics.md#what-is-learned)):

- the **kind stars**: 64 for words and 64 for closed constellations;
- the **keys** of the drawings: path keys per kind, and four memories that turn a pair of kinds into a key or a choice (from the opener, from the previous word, backwards at a claim, among stars);
- the **gates**: when a constellation opens and closes;
- the **weights** of the vote between drawings, and the prototypes used for the type of a new constellation, the clause form and the ambiguity mark.

The design counts about 2.8 million learned angles in all (11 MB as 32-bit floats; DESIGN.md, section 9.1).

## Where the word kinds come from

A kind is what the route book is indexed by: "a word like this, after a word like that". It is not a part of speech given by a dictionary. There are three ways to get kinds.

1. **Learned, as designed.** A word's kind is read from its own star and the stars of its neighbours, three on each side, each turned by its distance; this context vector is compared with the 64 kind stars, and the kind is the mix of the nearest ones. The kinds are trained only through placement and the moves. No word list is involved.
2. **The stations of hmm-rules.** hmm-rules' HMM has 25 classes of words, its stations, declared in `legend.sop` with their word lists; their probabilities are then trained on raw text by [Baum–Welch](https://en.wikipedia.org/wiki/Baum%E2%80%93Welch_algorithm), the standard way to fit an HMM to text without labels. Feeding them to rvss as kinds is natural ([rvss as an HMM plus a VSA memory](hmm-plus-vsa.md#how-hmm-rules-relates)). But it brings `legend.sop`'s hand-written word lists into rvss, and the design excludes word lists and any output of hmm-rules at reading time. It would be a variant under its own name.
3. **Seeds.** Start the 64 kind stars from classes found in the raw text, then learn them as in 1. Classes from [Brown clustering](https://en.wikipedia.org/wiki/Brown_clustering) use the raw text only and fit the design; seeds taken from the stations bring the word lists in, as in 2.

What research says about kinds, in one line each ([details](what-research-says.md#unsupervised-tagging-kinds-and-stations)): most English word types have one tag, so kinds can be mostly a property of the word with a correction from context (Stratos et al. 2016); the immediate neighbours carry the most (Lin et al. 2015); the word's ending and shape help rare words (Clark 2003; Berg-Kirkpatrick et al. 2010); good seeds and features matter more than the estimator (Christodoulopoulos et al. 2010).

## "Learning the legend" means hmm-rules' legend

"Learning the legend" has been proposed for hmm-rules, and research splits it into three separate questions ([What research says](what-research-says.md#unsupervised-tagging-kinds-and-stations)): which classes exist and how many; which words anchor each class; which class may follow which. All three concern `legend.sop`, the prior of an HMM. None concerns rvss's legend, which is the schema and stays declared.

## What the remainder can say about the schema

The **remainder** of a constellation is what the reading does not explain: one minus the similarity between the constellation the pilot built and the one rebuilt from the wire that was read ([Mechanics](mechanics.md#attachment-margins-and-confidence)).

- **In the book.** On one constructed world, a question missing from the legend was detectable "by the direction of the remainder, not by its size": the remainders of sentences with the same missing answer pointed the same way and grouped together.
- **In rvss.** The same can be tried: group large remainders by wire type and by kinds, and look where words keep landing in catch-all keys such as `discourse`. A group that keeps returning may point to a weak point of the schema.
- **A diagnostic, not a goal.** The schema is the owner's decision ([Decisions](../project/decisions.md)). rvss formalises what a message says in that schema; it does not change the schema, and no training term pushes the remainder towards a new key. What a remainder group suggests goes to the owner as a question.

---

Next: [Mechanics: the formulas of rvss](mechanics.md) · Up: [rVSS](README.md)
