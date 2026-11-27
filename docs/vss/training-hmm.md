[Home](../README.md) › [VSS in depth](README.md) › Training: the station HMM

# Training VSS: the station HMM

This page: how VSS learns its station model, a hidden Markov model trained by expectation–maximization with the legend as prior, and what training needs from the legend. Kind: Explanation.

The method is that of `learnRoutes` in `src/routes.mjs`, as the VSS report describes it at commit `fa46cb7`; this file has not changed since. The terms HMM, EM, Baum–Welch and forward–backward are explained in [Methods](methods.md). The default values are listed in [VSS commands and options](options.md).

## What training needs from the legend

Training depends on the legend ([The legend](legend.md)) throughout:

- A **station** is a hidden state of the HMM: a fine word class.
- A word list without `open=true` **confines** its words to the stations that list it. An open list adds a station and confines nothing.
- A **closed** station admits only listed words, and words with a listed ending.
- A **core** station is one where a unit can end.
- `like=` makes a station **share** another station's emission row: its probabilities of producing each word.
- A **form rule** says where a word built with an ending (-ed, -ing, -er, -s) from another word of the text starts out. `confine=true` restricts it to those stations.

## Which stations a word may take

`admitted` in `src/legend.mjs` decides which stations each symbol may take:

- a word in a confining list: only the stations that list it;
- a number, date, clock time, code, mark or quoted passage: only the stations that admit that shape;
- any other word: every station that is not closed, and a closed station whose shape (capital, upper case) or suffix (-ly, -wise, …) admits it.

In practice an ordinary unlisted lower-case word may be a describing word, a noun, a verb (opening its clause or after its subject), a predicative quality, or an adverb when its ending allows. A form rule with `confine=true` narrows this further: a word built with -ed from another word of the text may stand only at the verb stations, as a describing word, or at the predicative-adjective station, which shares the describing word's row.

## The prior and the starting point

- **Transition prior.** Weight 4 to a station that the source station lists in `follows`; 1 from a core station to any other; 0.05 otherwise; and 0.05 to a station whose `after` list does not name the source.
- **End and start.** End: 1 for a core station, 0.05 otherwise. Start: the stations that may open a sentence.
- **Initial emissions.** Each symbol's count is shared among its admitted stations. Weight 8 (`formLean`) goes to a closed station that its suffix admits, and to the station of a form rule when the word is built from another word of the text: past and -ing forms lean to the verb station, -er and -est forms to the describing word.
- **Shapes.** A distribution over lower case, capital and upper case per station starts at 0.15 / 0.65 / 0.20 for stations that admit capitals, and 0.94 / 0.05 / 0.01 for the others.

## The rounds of Baum–Welch

Training runs 25 rounds of Baum–Welch by default (`--iterations`), with a forward–backward pass over all sentences. The pass is scaled: the probabilities are rescaled at each word so that long sentences do not round them down to zero. In the maximization step:

- **Transitions** are the expected counts plus 20 times the prior.
- **Damping.** A transition the prior marks as unlikely (0.05) is also multiplied by 0.05 in the counts, so the text cannot make it common.

Three steps that are not part of EM then change the expected emission counts:

- **Kinship 0.5.** Half of the counts of a form such as "moved" are replaced by the distribution of its stem "move".
- **Sharpening.** From round 7 on, the counts of every word that no list confines are raised to the power 1.5 and renormalised, so that a word tends to keep one place. Open-list words such as "make" and "first" are included.
- **Smoothing.** A small amount, 0.001 times the initial emissions, is added ([additive smoothing](https://en.wikipedia.org/wiki/Additive_smoothing)).

## What these changes cost

Because kinship and sharpening change the counts between the two EM steps, the likelihood of the text is no longer guaranteed to rise. In the report's run at `fa46cb7` the log-likelihood per token was −6.7092 after round 1, −5.3815 at rounds 15 and 16, and −5.3823 after round 25: it fell slightly after round 16.

The number of rounds is a default, not a convergence test.

An option `--anchoring` pulls each word towards the kind that the anchored frames show ([What VSS learns beyond the HMM](learned-knowledge.md)). It measured worse and is off unless the option is given.

## What the model keeps

The model file stores `transition` (25 × 25), `start`, `end`, `shape` (25 × 3) and `emission`: one sparse row per symbol, with pairs (station, probability) for the stations that own a row ([The model file](model-file.md)).

## Standard, new here, particular

| Label | For the station HMM |
| --- | --- |
| Standard | A hidden Markov model trained by Baum–Welch on unannotated text ([Methods](methods.md)). |
| New here | The way the legend sets the starting point (confining lists, the transition weights 4 / 1 / 0.05, `formLean`); kinship; sharpening; damping. These are choices made in this project, not a new method of training an HMM. |
| Particular | None beyond the learned lists: the model is learned from this dataset's text. |

---

Next: [What VSS learns beyond the HMM](learned-knowledge.md) · Up: [VSS in depth](README.md)
