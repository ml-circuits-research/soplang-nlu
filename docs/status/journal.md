[Home](../README.md) › [Status](../STATUS.md) › The journal, as lists

# The journal, as lists

This page: a copy of the working journal improvements-ideas.md, made at every build, with its wide tables written as lists so that it reads on a phone. Kind: Reference.

Generated 2026-11-27 22:24 (UTC+01:00) by `node docs/status/build.mjs` · soplang-nlu 7ffdbd4 (61 uncommitted paths) · webmeet-dataset 0a01d23. The main figures are in [Journal](../STATUS.md#journal) on the status page; the terms are explained in the [Glossary](../reference/glossary.md).

> **Its numbers can be older than the status page.** Parts of the journal, such as the table under "Where things stand", keep the figures of the time they were written. Where they differ from the computed sections of the status page, the computed ones are current.

Here its tables of more than two columns are shown as lists, one item per row; the file itself keeps them as tables.

A working journal of the syntax-schema work: where things stand, what is being done now, and what could be done
next. It is updated with every stage and committed with it, so the history of the plan stays in git.

### Goal

Every formalization strategy of this repository writes the `syntax` schema (docs/syntax-schema.md) with no
dependence on external knowledge worlds, from syntactic analysis only. The measure is the share of messages
whose circuit a judge accepts (L8, or equal to the label: L9, or replacing it: L10). The aim is as high as
possible, ideally over 99%.

### Where things stand (2026-11-27, evening)

#### Strategies

The work goes on with four strategies at most (owner's decision): they read a message from really different
sources, so their agreement means something.

- **spacy**: Source of the analysis: spaCy dependency parse + our rules (former spacy-beam); Benchmark (random 1%): 89.6%; State: two rounds of general repairs (a55e33f, 0a7bb62)
- **distilbert**: Source of the analysis: DistilBERT trained on syntax circuits only; Benchmark (random 1%): 77.3%; State: syntax-v3, trained on the grown labels (83,619), benchmark held out
- **vss**: Source of the analysis: our unsupervised reader (stations learned from text, rules); Benchmark (random 1%): 77.2%; State: main focus; rules being added (agent)
- **prolog**: Source of the analysis: hand-written grammar; Benchmark (random 1%): 61.7%; State: parked (owner: do not improve for now)
- **z3**: Source of the analysis: constraint model; Benchmark (random 1%): 59.3%; State: parked


Left out of rounds and benchmark (too close to one of the above, code kept): spacy-direct, spacy-beam,
neural-dependencies, neuro-selector, selector-distilbert, neuro-prolog, neuro-z3, prolog-example-transfer.

The benchmark: eval-results/2026-11-27-syntax-benchmark-random, 1,831 messages drawn at random from the whole
dataset, every circuit of the five strategies judged (5,858 distinct circuits). VSS scored 84–87% on the small
files of the first two conversion rounds; the dataset as a whole is dominated by long drawing and chart
messages, where it does worse.

#### Dataset

- webmeet-dataset/semantic/ and webmeet-dataset/syntactic/ mirror each other (238 files, at most 1,000
  messages each; `tools/layers.mjs check`).
- 83,619 of 183,497 messages have a syntactic circuit (45.6%; 33.8% before the refilled conversion): 78,063 by
  agreement of VSS and spaCy, 5,524 accepted by a judge, 32 written by a judge. The others have an empty cell.
  By area: calendar 77.0%, document 53.8%, drawing 47.3%, diagram 40.3%.
- A judge read a random 2% of the agreement circuits: first conversion 10 of 1,154 rejected (0.87%, key up to
  the start of marked relations); refilled conversion with the wider key 2 of 433 rejected (0.46%).
- The syntactic files are the only store of labels; the registry (annotations/syntax/v1/judged/) keeps only
  what a judge read or wrote, with the reasons.

#### Rules added to VSS today (all checked on 8,000 accepted circuits and on the judged benchmark)

- No adjectives or particular phrases in the word lists; learned word pairs and general rules instead.
- Grading words, quality words before linking words, particles, naming participles, mentioned words, lists
  of names, comma asides by learned likeness, embedded questions tied to their verb.
- From the calendar analysis: helping verbs and their subjects, words seen only as things are no verbs,
  capitals keep names, day words, "-ing" after a linking word, comma series.
- From the diagram analysis: where a nominal ends (plural nouns, nominals after a linking word, graded forms).
- From the drawing analysis (first part): the frame fixes the verb (modals, "like"), embedded questions state.

#### Measured and dropped

- Counting word kinds (verb, thing, quality) also from the accepted circuits: changes 41 of 1,831 benchmark
  circuits with no net gain. Word counts alone do not help; the tagging of words in context does (see the
  lever trials below).
- Relating "goes" to "go" in the stem rule: the retrained model shifted unrelated readings; dropped.
- Families of strategies that read the same parse agree with each other on 77–100% of messages and repeat the
  same faults: agreement needs different sources.

### Done since the first version of this journal

- spaCy: general repairs in the layer that writes its circuits (commit a55e33f): capitalised verb forms
  inside a sentence are names, the first word of a verbless clause before a determiner is its verb, embedded
  questions state, "let's", "everything else", "from now on", numbers joined by a preposition, adjectives
  made heads after nouns. Rewritten from cached parses: 118 of 320 rejected benchmark circuits change, 93 of
  1,511 accepted change; to be judged. Still open: a first word followed by a lowercase noun ("book design
  review") stays a noun, since the parser gives no verb reading and its beam varies only the arcs.
- Judges' rules: "let's add", "everything else" and embedded question clauses settled (a81dd93).
- Note for the generality audit: the spaCy writer names "left" in "left of" (a direction word, borderline
  like left/right in the VSS legend); all its other literal words are prepositions, pronouns, determiners
  and adverbs.

- DistilBERT retrained on the current labels (syntax-v2, benchmark messages held out): 73.0% of development
  messages equal the gold circuit (61.3% for the previous checkpoint). Its new benchmark circuits are being
  judged together with the repaired spaCy's (packets 36-42 of the benchmark run).
- Lever study for VSS (eval-results/2026-11-27-vss-levers-study, read-only, 7 agents). Findings:
  - The faults left are a long tail: 17 rule groups of 5 to 32 messages each (of about 520 rejected); five
    have measured prototypes (sentence ties, causative verb + object + bare verb, compound nouns, the opening
    command verb, participles after a comma).
  - With VSS's stations forced to those of an accepted circuit, the study first estimated at most +2.7 points
    (it counted only circuits already judged). Once the new circuits were judged, 170 of the 401 rejected
    messages tried with forced stations became acceptable: up to about +9 points. Correction: the tagging of
    words matters much more than first thought.
  - Learned levers, estimated on the benchmark: a station prior from the accepted circuits +1.4 points;
    learned linker decisions +0.3; a table of evidence from spaCy and DistilBERT +1.1 to +6 (depends on unread
    circuits); reranking VSS readings +0.1.
  - Trials judged (eval-results/2026-11-27-vss-lever-trials, 791 circuits, against the same copy of VSS):
    plain 68.5%; station prior 69.8% (+1.3); DistilBERT evidence on the verb 70.7% (+2.2); DistilBERT evidence
    on the roles of words 72.4% (+3.9). Evidence from a better tagger is a real lever; to keep VSS portable it
    would be distilled into a table VSS reads, with no model at run time.
  - The judge's plan: first the measured rule prototypes, one commit each; then the structural rules; then
    learned decisions where thresholds fail; station-level learning only if the trials justify it.
- A publication that replaces an agreement label now keeps the replaced circuit in the registry as an accepted
  reading (306 such circuits recovered from the benchmark publication); before, it was lost and later runs
  sent it to a judge again.

- Agreement between VSS and spaCy on the benchmark sample, current versions: 23.2% of messages strictly,
  33.5% up to where a relation starts (drawing 38%, diagram 32%, calendar 17%, document 8%); of the 613 agreed
  circuits 603 accepted, 2 rejected. Where they differ (1,218 messages), both circuits were accepted in 515:
  the schema allows several readings (which word heads a name, a number after a noun as dependent or as its
  own nominal, modifier or discourse), and the agreement key counts them as different. A wider key that
  treats the variations rules.md allows as the same could settle many more messages without a judge; an
  agent is building and measuring it (false agreement checked on the judged pairs where only one circuit
  was accepted).

- VSS on the benchmark, step by step (all circuits judged): 65.9% at the first judging; 72.0% after the
  rules of the drawing and diagram analyses (fa46cb7); 75.5% after the measured prototypes of the lever study
  (83fce90: causative verb + object + bare verb, every part of a sentence tied, compound nouns, the opening
  command verb, participles after a comma). VSS is now above DistilBERT (73.1%); spaCy leads with 86.8%.

- Wider agreement key (c8d0a09, option `--key variants`): two circuits count as alike also up to the eight
  choices the judges' rules let pass either way (which word heads a name, a number after a noun, where a
  discourse word sits, let's, left of, quantity phrases, a bit, naming participles). On judged pairs it adds
  182 both-accepted VSS/spaCy agreements on the benchmark and 0 with one circuit rejected; on the conversion
  folders agreement rises from 31.7% to 38.9% of messages (calendar 10.6% to 56.0%). Two candidate kinds were
  dropped because judges rejected one of the variants.

- Two learned methods tried and not adopted (experiments/syntax-learned/README.md):
  - a transition-based parser with an averaged perceptron for VSS, trained on the labels: 55.3% known accepted
    on the benchmark, 63–76% estimated in all (VSS 75.4%); it learns VSS's own conventions, because 91% of the
    labels are agreement labels written by VSS;
  - spaCy fine-tuned on the judged circuits: 64.6–66.4% known accepted with 30–33% unjudged, against 86.7% for
    the base model; it fixes 48 rejected circuits and breaks none among those judged, but the rest looks
    break-even.
  Both need training signal from the hard part of the dataset (judged circuits, rejected ones as negatives)
  before they can help; they may then serve as one more voice beside VSS and spaCy.

- spaCy, second round of general repairs (0a7bb62): 86.8% -> 89.6% on the benchmark. Still rejected, by the
  judge of the 76 new circuits: coordinations with the wrong conjuncts, scene-list items tied without a marker
  instead of joining the 'then' series, relations starting across an 'and', nominals split.

- VSS round of 71f0dd2 (subject-verb agreement learned from the raw text, fronted clauses, comma-set
  nominals, 'one' as head): 75.5% -> 77.2%.
- DistilBERT syntax-v3, trained on the grown labels with the benchmark held out: 73.1% -> 77.3%. More labels
  help it directly; retrain after each large batch of labels.
- spaCy third round of repairs (730c906), with command openers learned from the raw text; being judged.
- The origin of VSS, for the record: the current reader is new; from the earlier vector-symbolic reader
  (repository vsa-semantic-space) it keeps the vector toolkit as a minor helper, determinism, SOP Lang output
  and the words legend/route book/world with new meanings; the sentence state built by binding, role decoding,
  learned gates, per-world readers and abstention were not carried over.

### In progress

- VSS, next round of rules (agent): the finite verb found by agreement with its subject, built on a number
  habit learned from the text; fronted clauses; measures and appositions after commas; numerals as heads;
  relative clauses.
- Refilling the dataset: VSS (83fce90) and spaCy (a55e33f) run again over the 217 files of the batch
  conversion; then settle with `--key variants`, a judge reads 2% of the agreed circuits, empty cells filled.
- Documentation rebuilt as a hierarchical Markdown wiki in docs/ (workflow).
- VSS: next round of rules, fault groups found also outside the benchmark (agent).

### Next steps, in order

1. Commit the next VSS round once checked; judge only the benchmark circuits that changed; update the table
   and the status page (docs/STATUS.md).
2. After each round of rules, rerun VSS over the conversion, settle with the wider key, audit 2%, fill cells.
3. Conversion rounds for the messages that stay open: one judge reads one circuit per message (the one most
   strategies wrote), a fixer writes it when rejected.
4. Retrain DistilBERT on the grown labels (benchmark held out) and measure.

### Ideas not yet tried (with the reason to expect a gain)

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

### Making VSS reusable (owner's question of 2026-11-27: general rules or particular ones?)

The rules added so far are statements about English that name only function words and use what VSS learns
from text; the analysis was split by area (drawing, diagram, calendar) only to find the faults where they
occur. What is not yet general: some thresholds measured on this dataset (a word seen as a thing at least 20
times, the likeness 0.3), the choice of which constructions to cover (driven by the frequent faults of
commands to a drawing application), and a few borderline legend words (left/right as direction adverbs,
today/tomorrow, thanks). The steps that would make VSS a reusable engine with a standard grammar:

- **Audit of generality**, after the current batch of rules: agents list every rule and word list of VSS and
  try to show each one particular; each is classed as general English, a threshold tuned on this data, or
  particular. Particular ones are rewritten or removed.
- **Rules as data.** Move the rules out of JavaScript into constructions declared in the legend (SOP Lang),
  over stations and word marks: the engine stays generic, the grammar of English becomes a file that can be
  read, checked and extended.
- **Thresholds learned, not set.** The code names the features of each decision; the weights are learned
  from the accepted circuits (as DistilBERT learns), so no number is tuned by hand on this dataset.
- **A test outside the dataset.** Run VSS on English it was never tuned on (other kinds of messages or a
  public corpus) and have a judge read a sample, to measure how general it is.

### Open points for the owner

- The 20 agreement lines kept in the registry (a second agreed circuit for the same message, recorded nowhere
  else): keep, judge, or delete.
- A conversion round fills only empty cells; a benchmark publication replaces labels (owner's rule). Should
  rounds replace labels too?

---

Next: [Recent commits](commits.md) · Up: [Status](../STATUS.md)
