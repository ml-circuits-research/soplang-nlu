[Home](../README.md) › [rVSS](README.md) › Milestones

# Milestones and what to expect

This page: the milestones of rvss (M1, M2a, M2b, M2c, then M3 and the benchmark), what each one measures, the honest expectation for each, and where the numbers are. Kind: Explanation.

The plan is that of [DESIGN.md](../../strategies/rvss/DESIGN.md), section 14. The numbers of M1 below are the design's, measured on the data snapshot `0a01d23` (2026-11-27). Every later number goes to the status page: [Working on now](../STATUS.md#working-on-now), and [Speed and cost per strategy](../STATUS.md#speed-and-cost-per-strategy) for time and size.

## Why the work is split

Each milestone gives the reader one more part of the answer to find by itself, so that a failure points at one part:

| Milestone | Given, and what is measured |
| --- | --- |
| M1 | The whole structure is given; nothing is learned. Can the stars hold the circuit? |
| M2a | The grouping into wires is given. Where does each star land? (the route book) |
| M2b | The right state is given at every step. Is each move right? (gates, choices) |
| M2c | Only the words are given. Are the moves right when chained? |
| M3 | All lengths, the beam, the benchmark. |

## M1. Read-back with the structure given

**What it measures.** Whether the representation is lossless: build the stars of every label from its own circuit, then read the circuit back from the message star and the atlas, with one threshold fixed in advance. And whether the moves cover the labels: derive the moves from each label, then rebuild the circuit from the words and the moves alone.

**Where it stands.** Mostly done. The read-back gives back the exact circuit for 99.993% of 88,105 labels at D = 512 and 99.997% at D = 1024; without the atlas, only 33.5% at D = 1024. Under the adopted conventions the moves rebuild 99.97% of the labels, and no wire opens before the word that shows it. Both stop rules set in advance are met. Remaining: freeze the splits and measure near-duplicates of the development set; the provisional-placement variant; three more controls; clean modules from the checks.

**Honest expectation.** M1 was close to guaranteed by construction: at most 12 terms per constellation at D ≥ 512 is well inside the capacity that theory gives ([Plate 1995](https://redwood.berkeley.edu/wp-content/uploads/2020/08/Plate-HRR-IEEE-TransNN.pdf); [Frady, Kleyko and Sommer 2018](https://arxiv.org/abs/1803.00412)). It is a necessary check, not an answer to the owner's question. What it does show: the atlas, one star per wire, is what makes representations of representations readable.

## M2a. Placement with the grouping given

**What it measures.** The tree and each star's receiver come from the oracle; the route book learns the keys (kinds, path keys, the memories, the vote), trained by the per-wire loss. Reported on dev-B (whole files held out) first, then dev-A: key accuracy overall and per key, for words and for claimed stars; exact wires; exact core; words unseen in training; similarity per depth; the learned kinds listed by their most frequent words, for inspection only. Controls on the same inputs: a [logistic regression](https://en.wikipedia.org/wiki/Logistic_regression) over the same kinds, and the first draft's prototype classifier. Ablations: each drawing removed; the number of memory slots and kinds.

**Honest expectation.** This is the first direct test of "learn how the stars are placed". No published reader of this kind gives a number to expect. The fair bar is the logistic regression on the same kinds: if the route book does not beat it, the drawings add nothing. Most errors should fall on rare and unseen words, where only letters and neighbours help ([Clark 2003](https://aclanthology.org/E03-1009/)), so the results must be split by frequency band. Kinds should be scored against the keys the words fill ([What research says](what-research-says.md#simple-clustering-with-morphology-is-as-good-as-newer-models)).

## M2b. Moves under teacher forcing

**What it measures.** Under teacher forcing every decision is made from the correct state, rebuilt from the label, never from the pilot's own earlier moves. On messages of at most 12 words (68,369 replayable labels): the gates, the type of a new constellation, the clause form and the ambiguity mark, and the choices among stars (claim, gather, reopen, point, attachment), each predicted from the gold state. Per-move accuracy on dev-B. Control: a logistic regression and an averaged perceptron on the same view, given as symbolic features. Decision rule set in advance: if the VSA decisions are more than 2 points below the control, strengthen them before M2c.

**Honest expectation.** In the original reader the gates emerged from the chart targets alone, relation markers open and content words closed, in 5 of 5 seeds (DESIGN.md, section 10); here they also get a loss of their own, so they should be learnable. Teacher-forced accuracy is an upper bound: a policy trained only on expert states can make up to T²ε mistakes over T steps, where ε is its error on those states ([Ross, Gordon and Bagnell 2011](https://proceedings.mlr.press/v15/ross11a/ross11a.pdf)). With 2.33 moves per word (DESIGN.md, section 8.3), every word adds more than two decisions to that T.

## M2c. Free running and the writer

**What it measures.** The pilot reads alone, at most 12 words, trained with roll-in on its own moves (during training it sometimes continues from its own move instead of the correct one, so it learns to act in the states it will really reach); the output is the read-back from its stars, with its explicit tree as a check. Judged by placement accuracy (each word at the right wire and key), core-line F1 and exact core, on dev-B and dev-A, by construction (aside, claim, gather, reopen, point, ambiguity), on unseen words, and by the agreement of the read-back with the explicit tree. Bars on the same split: the learned transition parser of `experiments/syntax-learned`, retrained without hmm-rules' features and, as a reference, with them; and the bottom-up (easy-first) reader.

**Honest expectation.** A drop from M2b is certain; its size is not known. Roll-in stops at the first move that leaves the gold tree (early update, [Collins and Roark 2004](https://aclanthology.org/P04-1015/)), because a full [dynamic oracle](https://aclanthology.org/C12-1059/) for this move set does not exist yet; one is the main lever left ([What research says](what-research-says.md#exposure-bias-roll-in-with-an-oracle)). The bars are context, not success lines: the learned parser's 55.3% known accepted used hmm-rules' stations as features and a dynamic oracle, and the design gives hmm-rules 78.6% (DESIGN.md, section 15). The design's decision rules say what to change for each kind of failure.

## M3. All messages and the benchmark

**What it measures.** All lengths; the beam of 4 scored by fit and the re-placement pass; judged labels weighted, negatives from rejected circuits. Ablations: the soft stack, and training without the move losses. The strategy itself (`index.mjs` and a Python worker), its time per message, start-up time and model size. The benchmark of 1,831 messages, counted with the same review procedure as the other formalizers, and at least 60 unjudged circuits read blind against the judges' rules.

**Honest expectation.**

- A beam of 4 over moves normalised one state at a time should gain little until the scores are trained over the whole beam ([Andor et al. 2016](https://aclanthology.org/P16-1231/)); first check on short messages whether the best-scoring analysis is the right one ([Stahlberg and Byrne 2019](https://aclanthology.org/D19-1331/)).
- The labels are mostly agreement circuits of hmm-rules and spaCy, so rvss learns their conventions first (DESIGN.md, section 12); the 1,238 benchmark messages without an earlier label are the fairer test.
- Reading cost, estimated in the design: a few milliseconds per message in numpy, against 0.44 ms for hmm-rules and 49 ms for spaCy at the time (DESIGN.md, section 9.4).

## The sprint now

The status page lists, as running now (2026-11-27, night): spaCy run over every message of the dataset as training data for rvss (a "silver" set, kept apart from the labels); the training sets and move sequences; an evaluation harness; then rvss built and trained on the GPU, aiming to reproduce spaCy with a smaller and faster model, measured on the benchmark and checked by a reviewer. The scripts are in `strategies/rvss/data/` and `strategies/rvss/eval/`. Trained on spaCy's circuits, rvss learns spaCy's conventions, faults included; the judged benchmark, not agreement with spaCy, says whether they are right.

## How results are reported

From the design's evaluation rules (section 15), with what research adds:

- every number names its data snapshot;
- controls compare like with like, and figures are weighted to the population with length buckets shown;
- dev-B first, dev-A beside it, near-duplicates apart;
- teacher-forced against free-running accuracy, by length bucket ([Ross et al. 2011](https://proceedings.mlr.press/v15/ross11a/ross11a.pdf));
- a trivial baseline and the ceiling on the same split, so a score reads as a share of the reachable gap ([Klein and Manning 2002](https://aclanthology.org/P02-1017/));
- risk–coverage curves for abstention, with a threshold chosen with a bound ([Geifman and El-Yaniv 2017](https://papers.nips.cc/paper_files/paper/2017/hash/4a8423d5e91fda00bb7e46540e2b0cf1-Abstract.html));
- every count reported, whatever it is.

---

Next: [Formalizers](../formalizers/README.md) · Up: [rVSS](README.md)
