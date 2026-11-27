# Improvements and ideas: the current plan

A working journal of the syntax-schema work: where things stand, what is being done now, and what could be done
next. It is updated with every stage and committed with it, so the history of the plan stays in git.

## Goal

Every formalization strategy of this repository writes the `syntax` schema (docs/syntax-schema.md) with no
dependence on external knowledge worlds, from syntactic analysis only. The measure is the share of messages
whose circuit a judge accepts (L8, or equal to the label: L9, or replacing it: L10). The aim is as high as
possible, ideally over 99%.

## Where things stand (2026-11-27, evening)

### Strategies

The work goes on with four strategies at most (owner's decision): they read a message from really different
sources, so their agreement means something.

| Strategy | Source of the analysis | Benchmark (random 1%) | State |
| --- | --- | ---: | --- |
| spacy | spaCy dependency parse + our rules (former spacy-beam) | 82.5% | being improved (agent) |
| distilbert | DistilBERT trained on syntax circuits only | 71.8% | retraining on the current labels, benchmark held out |
| vss | our unsupervised reader (stations learned from text, rules) | 65.9% | main focus; rules being added (agent) |
| prolog | hand-written grammar | 61.7% | parked (owner: do not improve for now) |
| z3 | constraint model | 59.3% | parked |

Left out of rounds and benchmark (too close to one of the above, code kept): spacy-direct, spacy-beam,
neural-dependencies, neuro-selector, selector-distilbert, neuro-prolog, neuro-z3, prolog-example-transfer.

The benchmark: eval-results/2026-11-27-syntax-benchmark-random, 1,831 messages drawn at random from the whole
dataset, every circuit of the five strategies judged (5,858 distinct circuits). VSS scored 84–87% on the small
files of the first two conversion rounds; the dataset as a whole is dominated by long drawing and chart
messages, where it does worse.

### Dataset

- webmeet-dataset/semantic/ and webmeet-dataset/syntactic/ mirror each other (238 files, at most 1,000
  messages each; `tools/layers.mjs check`).
- 62,066 of 183,497 messages have a syntactic circuit (33.8%): 56,934 by agreement of VSS and spaCy (up to the
  start of marked relations), 5,100 accepted by a judge, 32 written by a judge. The others have an empty cell.
- A judge read a random 2% of the agreement circuits: 10 of 1,154 rejected (0.87%).
- The syntactic files are the only store of labels; the registry (annotations/syntax/v1/judged/) keeps only
  what a judge read or wrote, with the reasons.

### Rules added to VSS today (all checked on 8,000 accepted circuits and on the judged benchmark)

- No adjectives or particular phrases in the word lists; learned word pairs and general rules instead.
- Grading words, quality words before linking words, particles, naming participles, mentioned words, lists
  of names, comma asides by learned likeness, embedded questions tied to their verb.
- From the calendar analysis: helping verbs and their subjects, words seen only as things are no verbs,
  capitals keep names, day words, "-ing" after a linking word, comma series.
- From the diagram analysis: where a nominal ends (plural nouns, nominals after a linking word, graded forms).
- From the drawing analysis (first part): the frame fixes the verb (modals, "like"), embedded questions state.

### Measured and dropped

- Counting word kinds (verb, thing, quality) also from the accepted circuits: changes 41 of 1,831 benchmark
  circuits with no net gain. VSS's faults are in how it ties groups, not in what it knows of single words.
- Relating "goes" to "go" in the stem rule: the retrained model shifted unrelated readings; dropped.
- Families of strategies that read the same parse agree with each other on 77–100% of messages and repeat the
  same faults: agreement needs different sources.

## In progress

- VSS: the remaining rules of the drawing analysis (a word grading a relation goes to the clause where the
  relation starts; "where"/"as" clauses complete the nearest verb; two participles in a row; lists after
  place phrases) and the linker rules of the diagram analysis (finite forms never open a command, commas
  between numbers, participle-only forms).
- spaCy: general repairs in our writing layer (a command needs its verb, clause form, "left of", "let's",
  clock times with "UTC", lists).
- DistilBERT: retraining on the current labels (5,100 judge + 56,934 agreement as silver), benchmark held out.

## Next steps, in order

1. Commit the VSS and spaCy rules once checked; rejudge only the circuits that changed on the benchmark and
   update the table.
2. Rerun VSS and spaCy over the whole dataset and settle by agreement again: every improvement fills empty
   cells without a judge. Audit 2% of the new agreement circuits.
3. Measure the retrained DistilBERT on the benchmark (its messages were held out of training).
4. Conversion rounds for the messages that stay open: one judge reads one circuit per message (the one most
   strategies wrote), a fixer writes it when rejected.

## Ideas not yet tried (with the reason to expect a gain)

- **Supervised station model for VSS.** The station tagger is learned by EM on raw text; 62,000 accepted
  circuits now say, for each word, its role. Mapping circuits back to stations and using their counts as a
  prior for the emissions and transitions could fix the verb/noun decisions behind most L1 faults. Risk:
  the stations are finer than the syntax keys; the mapping needs care.
- **Learned decisions in the VSS linker.** Which earlier thing a listed thing joins, where a relation
  starts, the form of a clause: today these are rules with thresholds. Small classifiers over the features the
  rules already use, trained on the accepted circuits, could replace the thresholds.
- **Reranking VSS readings.** VSS can produce several station paths (k-best); a scorer trained on accepted
  circuits could pick among them. Measured earlier on the nlu schema: alternatives contained an accepted
  reading for only 3–6% of rejected messages, so this needs the linker to produce alternatives too.
- **DistilBERT as a voice inside VSS.** Use the DistilBERT prediction as a feature where VSS's rules are
  unsure (for example a word that can be noun or verb).
- **Retrain DistilBERT after each large batch of labels**, always holding out the benchmark messages.
- **A fresh benchmark sample** once the labels have grown, since the current sample's messages now have
  labels and are held out of every training.
- **Carry the VSS rules into Z3** later, if a fourth independent voice is needed (owner's remark).

## Open points for the owner

- The 20 agreement lines kept in the registry (a second agreed circuit for the same message, recorded nowhere
  else): keep, judge, or delete.
- A conversion round fills only empty cells; a benchmark publication replaces labels (owner's rule). Should
  rounds replace labels too?
