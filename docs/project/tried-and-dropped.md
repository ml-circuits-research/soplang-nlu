[Home](../README.md) › [Project](README.md) › Tried and dropped

# Tried and dropped

This page: what was tried and set aside, each with what was measured and why it was dropped, so that nobody repeats it unknowingly. Kind: Explanation.

Each item says what was tried, the evidence, and where the evidence is. "Session notes" means the notes of the working session of 2026-11-27, which are not in the repository; such claims could not be checked against a file. Most items come from [syntax-work-2026-11-27.html](../syntax-work-2026-11-27.html), section "What was tried and dropped", and from the journal. Project terms (agreement, family, label) are in the [Glossary](../reference/glossary.md#project-terms); the names hmm-rules uses (station, kinds, role-filler memory, doubt) on [hmm-rules' own names](../hmm-rules/names.md).

## Goal and organisation

### Restating the goal as precision plus coverage

Measuring "precision on the readings a strategy does not flag, plus coverage" instead of judged acceptance. Refused by the owner: the dataset is corrected until the comparison with it is exact ([D1](decisions.md#d1)). Source: session notes.

### All twelve strategies in rounds and benchmark

The closest pairs of strategies of one family (one source of analysis, such as the spaCy parse) agreed with each other on 77–100% of the messages of round 2 and repeated each other's faults. Reduced to four places, with Prolog and Z3 both benchmarked for the fourth ([D10](decisions.md#d10); `40c00a7`).

### Judging every circuit in every round

Round 1 sent every strategy's circuit to a judge: 1,798 circuits for 575 messages. Replaced by one judge and one fixer per message ([D9](decisions.md#d9); `5db3975`, `7127335`).

### Strict agreement

Requiring two circuits to be identical before they count as agreeing. On rounds 1 and 2 (1,173 messages), hmm-rules and spacy-direct agreed on 469 messages strictly and on 606 when it is ignored where each relation with a marker (a linking word such as "on") starts; a judge rejected 2 of the 606. Replaced by relaxed agreement ([T2](tool-decisions.md#t2); `40c00a7`), later widened again by `c8d0a09`. Method: [Agreement between formalizers](../evaluation/agreement.md).

### Two candidate kinds for the wider agreement key

`c8d0a09` dropped two of the variations it first tried, after reading the false cases: letting either of two bare nouns be the head (judges rejected heads on the first word), and a loose start for relations that end at a participle (commit message of `c8d0a09`).

## Data

### labels.jsonl and the agreement lines of the registry

They repeated what the syntactic files hold. Removed ([D12](decisions.md#d12); dataset `95e7739`, `e52bfc8`).

### Reference nlu circuits counting as accepted

2,290 circuits rewritten by rule from accepted circuits of the nlu schema. No judge had read them in the syntax schema, and the old annotations are not trusted. Kept apart for comparison only ([D4](decisions.md#d4); dataset `73dc89e`, `5c45966`).

### DistilBERT weights from the old annotations

The first port kept weights and a ranker fitted on the old annotations. Against D4; retrained on syntax circuits only ([D11](decisions.md#d11); `662a663`, `9ae0e6f`). They were still used in six runs of the batch conversion ([T1](tool-decisions.md#t1)).

## Schema

### Everyday key names

An intermediate draft named the keys with everyday words (main, via, other, start=open). The owner asked for the established terms of grammar instead ([Decisions 6–8](../schema/decisions-names.md)).

### The reviewers' suggestions not adopted

A key giving each value's position, two circuits for one ambiguous attachment, a relation that starts at another relation, "make" as a clause of its own, and the names object and noun_phrase. Each is rejected with its reason in the schema pages ([Suggestions not adopted](../schema/decisions-names.md#suggestions-not-adopted); the first review: [Decisions 1–5](../schema/decisions-review-1.md)).

## hmm-rules

### Counting word kinds from accepted circuits

Counting how often a word is a verb, a noun or an adjective also from the accepted circuits, not only from the text. It changed 41 of the 1,831 benchmark circuits, with no net gain. How the gain was assessed, and whether the 41 were judged, is not recorded. Source: session notes; the journal, "Measured and dropped".

### Relating "goes" to "go"

Lowering the limit of the stem rule (a stem keeps at least three letters) so that "goes" is a form of "go". The retrained model shifted unrelated readings; no count was recorded. Source: session notes; the journal, "Measured and dropped". Later, `fa46cb7` let two-letter verbs take their endings when verb counts are looked up, without changing the stem rule and without retraining.

### Adjectives, fixed phrases and direction adverbs in the word lists

Against [D5](decisions.md#d5). Replaced by word pairs learned from the text, word endings and general rules. Against the 1,160 judged labels of the fixed sample, 1,006 circuits were equal before the change and 1,000 or more after it (`cd237e3`).

### Two rules of fa46cb7

A participle-only form describing the thing before it (one change, worse) and an -s form at the end of a group read as the verb (23 accepted circuits broken). Both dropped (commit message of `fa46cb7`).

### Three experiments of the nlu period

Measured on the nlu schema, each worse, each off by default: (1) smoothing what is learned about a rare word from its nearest words in the word-vector space; (2) attaching a participle to the clause when the role-filler memory shows no noun it is said of; (3) re-decoding with a clause-initial word kept off the verb station when the text never showed it as a verb beyond doubt. The size of each loss is not recorded ([The nlu-schema period](nlu-period.md)).

### Word kinds as a prior inside EM

The option `train.mjs --anchoring` pulls each word towards the kind (verb, thing, quality) that contexts fixed by function words show, such as "the ___ on" for a thing. This was the fourth experiment of the nlu period. It measured worse and stays off unless the option is given, so the kinds serve only the rules ([What hmm-rules learns beyond the HMM](../hmm-rules/learned-knowledge.md)).

## spaCy

### Two repairs of fa4452c

The fourth round of spaCy repairs dropped two of the rules it tried: openers read as nouns on single counts (26 and 9 accepted circuits changed) and the noun rule on -s, -ing and -ed forms (35 accepted circuits changed), as the commit message of `fa4452c` records.

## Two learned prototypes

Two standard learned methods were tried in a scratch folder and copied, with their findings, to [experiments/syntax-learned/README.md](../../experiments/syntax-learned/README.md). Neither is adopted.

- **A transition-based parser for hmm-rules.** Standard parts: arc-eager transitions ([shift-reduce parsing](https://en.wikipedia.org/wiki/Shift-reduce_parser)), a dynamic oracle, and an averaged [perceptron](https://en.wikipedia.org/wiki/Perceptron), trained on the labels with the benchmark left out. On the benchmark: 55.3% known accepted, an estimated 63–76% in all, against 75.4% for hmm-rules on the same snapshot.
- **spaCy [fine-tuned](https://en.wikipedia.org/wiki/Fine-tuning_(deep_learning)) on the judged circuits.** 64.6–66.4% known accepted with 30–33% not judged, against 86.7% for the base model. It fixed 48 rejected circuits and broke none among those judged; the rest looked break-even.

The findings: both learn the conventions of hmm-rules. 91% of the parser's training labels are agreement labels, which carry the circuits of hmm-rules by construction, and two thirds of the judged labels used for spaCy are the circuits of hmm-rules. The README proposes, for the parser, training on the judged circuits with the rejected ones as negative examples, used beside hmm-rules as one more voice rather than instead of it; for spaCy, training on corrections only, kept as one more alternative inside the spaCy strategy.

---

Next: [History in brief](history.md) · Up: [Project](README.md)
