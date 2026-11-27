# Learned structure for syntax circuits: two prototypes (2026-11-27)

Two general methods, tried in a scratch folder and copied here so that the code and the findings stay in the
history. Neither is adopted: on the 1% benchmark (eval-results/2026-11-27-syntax-benchmark-random) neither
beats the strategy it would replace. The scripts still name the scratch paths they were run from
(`/tmp/claude-1000/…/scratchpad/learned/…`); the training data, the parses and the spaCy models (3.8 GB) were
not copied.

## 1. A transition-based parser for VSS (parser/)

**Method.** Published, standard parts: Nivre's arc-eager transitions with the root after the last word
(Ballesteros and Nivre 2013), labelled transitions, the dynamic oracle of Goldberg and Nivre (2012) with
exploration, an averaged perceptron (Collins) over about 90 feature templates (Zhang and Nivre 2011); plain
JavaScript, no dependencies. The circuit is mapped to a labelled tree over the words of `wordsOf` and back
(`tree.mjs`): 99.66% of the 62,066 labels survive the round trip; 0.34% cannot be encoded (two coordinations
sharing one clause, some relation coordinations); 3.1% of the trees cross. Features: the word, its ending and
shape, punctuation around it, VSS's learned station (as a part-of-speech tag) and word kinds, the usual
tree-state features. No rule names a word.

**Data.** 54,210 labelled messages to train (3,320 judged, the rest agreement labels), 10% held out by a hash of
the text, all benchmark messages left out.

**Result.**

| | Accepted | Rejected | Not judged |
| --- | ---: | ---: | ---: |
| Parser | 1,013 (55.3%) | 96 | 722 |
| VSS (same snapshot) | 1,380 (75.4%) | 451 | 0 |

A reviewer recomputed every number and read 20 of the unjudged circuits: estimated 63–76% in all, so very
likely below VSS. On messages like its training data the parser is close to VSS (92.7% against 99.7%); on the
1,238 messages that had no label it is far below (37.4% known accepted against 63.7%). On the 1,109 messages
where both circuits are judged the two are even (1,013 against 1,004 accepted).

**Why.** The training labels are the easy part of the dataset (91% agreement labels, which are VSS's own
circuits by construction), so the parser learns VSS's conventions and not the hard cases. Agreement between
the parser and VSS is weak evidence for the same reason: 7.3% of their agreed circuits are rejected, against
0.87% for VSS and spaCy.

**Cost.** Training 15 epochs in 11 min on one CPU core (base features: 10 epochs in 2.7 min); 3.3 ms per
message against 0.8 ms for VSS on the same loaded machine; the model is 6.1 MB gzipped (`parser/model.json.gz`).

**What would make it useful.** Training signal from the hard part (the registry's 12,310 judged circuits,
rejected ones as negative examples); used beside VSS as one more voice rather than instead of it.

## 2. spaCy fine-tuned on the judged circuits (spacy-finetune/)

**Method.** Each judged circuit outside the benchmark is turned back into a dependency tree over spaCy's
tokens, kept only if our own writer gives the circuit back; `en_core_web_trf` is fine-tuned on these trees on
the GPU (gold only, 800 steps, 5 min 44 s; or gold three times plus agreement labels, 1,200 steps, 9 min 30 s).

**Result.**

| | Accepted | Rejected | Not judged |
| --- | ---: | ---: | ---: |
| spaCy, base model | 1,588 (86.7%) | 243 | 0 |
| fine-tuned on judged circuits | 1,182 (64.6%) | 38 | 611 |
| fine-tuned with agreement labels | 1,216 (66.4%) | 58 | 557 |

Among circuits with a verdict before and after: 48 rejected became accepted and none accepted became
rejected (judged-only variant). The unjudged changes look about break-even on a reviewer's reading. On held-out
development messages the honest gain is about 4 points; the 47 messages with a template seen in training
inflate it.

**Why not more.** Two thirds of the judged labels are VSS's circuits, so fine-tuning teaches spaCy VSS's
conventions; about 7% of the judged circuits cannot be converted (a nominal shared by two clauses, dependents
after a head, the forms of joined clauses).

**What would make it useful.** Train on corrections only (the converted tree where the base circuit is known
rejected, the base tree where it is accepted); keep the fine-tuned parse as one more alternative inside the
spaCy strategy, chosen by the same rules as the beam.

## 3. The review (review/)

An independent reviewer recomputed every verdict, checked for leaks (no benchmark text in training; 297
benchmark messages have a training text one edit away, which does not change the ranking), and read samples of
the unjudged circuits against the judges' rules.
