[Home](README.md) › Status

# Syntax work status

This page: the current numbers of the project, computed from the repositories at every build: scores, speed, the dataset, agreement, and what runs now. It is the only page of the documentation that holds current numbers, with the pages under status/ that it links. Kind: Reference.

Generated 2026-11-27 22:55 (UTC+01:00) by `node docs/status/build.mjs` · soplang-nlu 94baeb1 (2 uncommitted paths) · webmeet-dataset c6b11f6. The phone page with charts is [status.html](status.html); on GitHub that link shows its HTML source, so open the file in a browser to see the page.

> **Since the build of 2026-11-27 22:51** (94b3036): 1 new commit in soplang-nlu; 1 new commit in webmeet-dataset.

1. [How to read this page](#how-to-read-this-page)
2. [At a glance](#at-a-glance)
3. [Working on now](#working-on-now)
4. [The benchmark, live](#the-benchmark-live)
5. [Progress over time](#progress-over-time)
6. [Speed and cost per strategy](#speed-and-cost-per-strategy)
7. [The dataset](#the-dataset)
8. [Agreement between hmm-rules and spaCy](#agreement-between-hmm-rules-and-spacy)
9. [Journal](#journal)
10. [Recent work](#recent-work)

## How to read this page

Every number on this page is computed from the repositories at each build (the first line says when), except two parts written by hand: "Working on now" and the notes of "Progress over time". The other pages of the documentation explain the terms and link here for the numbers.

Each section below gives the main figures. Its full tables are on a page of their own, linked at the end of the section as **More**.

- **Strategy**: the code's word for a formalizer, a program that writes one circuit per message ([Formalizers](formalizers/README.md)).
- **Levels L0–L10 and GOAL**: the level of each circuit (accepted, rejected with a grade, or no circuit), and the share of messages at L8, L9 or L10 ([Levels and GOAL](evaluation/levels.md)).
- **The benchmark**: the sample every strategy is measured on, with every circuit judged ([The benchmark](evaluation/benchmark.md)); the **95% interval** after a GOAL says how far the share can move by chance ([How to read a GOAL](evaluation/benchmark.md#how-to-read-a-goal)).
- **Agreement and the audit**: labels settled when strategies from different sources write the same circuit, and the random share a judge still reads ([Agreement](evaluation/agreement.md), [The audit](evaluation/audit.md)).
- **Speed and cost**: what is timed, and which comparisons are not like for like ([Speed and cost](formalizers/speed.md)). **How far to trust the numbers**: [Limits of the measurements](evaluation/validity.md).
- Any other term: the [Glossary](reference/glossary.md) of the documentation.

## At a glance

| Measure | Now |
| --- | --- |
| Highest GOAL | 94.6%, spacy |
| GOAL of hmm-rules | 79.0% |
| Fastest | hmm-rules, 0.47 ms per message (median) |
| Dataset | 49.0% of 183,497 messages have a circuit (89,863) |

GOAL is the share of the 1,831 benchmark messages whose circuit is accepted ([Levels and GOAL](evaluation/levels.md)). spacy is the one active strategy; hmm-rules (our own reader so far, called vss until 2026-11-27), distilbert, prolog and z3 are [experimental](reference/glossary.md#project-terms), and a vector-symbolic reader, rvss, is being built ([Formalizers](formalizers/README.md)). What the project does: [the home page](README.md#what-this-is).

## Working on now

*Written by hand; last saved 2026-11-27 22:55. Where it differs from the computed sections, the computed ones are current.*

Written by hand at each step. It holds no scores on purpose, so that it cannot contradict the computed
sections of this page. Each judged step, with its score: [Progress over time](#progress-over-time).

**Latest steps** (2026-11-27, evening)

- **spaCy**: a second, third, fourth and fifth round of general repairs in the layer that writes its
  circuits (commits `0a7bb62`, `730c906`, `fa4452c`, `0f20f16`). After each round, judges read the
  benchmark circuits that changed.
- **hmm-rules**: three rounds of rules (commits `71f0dd2`, `85de0bb`, `c080ce8`). Among them: subject–verb
  agreement and "-ing" verbs after the verbs that take them, both learned from the raw text; fronted
  clauses; lists after "with" and after colons. After each round, judges read the benchmark circuits
  that changed.
- **DistilBERT**: retrained on the grown labels, with the benchmark messages held out (checkpoint
  `syntax-v3`), and measured (commit `6af9b97`).
- **A wider agreement key**, `variants` (commit `c8d0a09`): two circuits also count as the same up to
  the choices the judges' rules let pass either way ([Agreement between formalizers](evaluation/agreement.md)).
- **The conversion refilled**: hmm-rules and spaCy, in newer versions, ran again over the files of the batch
  conversion; agreement was settled with the wider key, and a judge read a random 2% of the new agreed
  circuits (pooled in `eval-results/conversion-audit-02` and `eval-results/conversion-audit-03`, the
  second in commit `aef741e`). Counts: [The dataset](#the-dataset) and [Agreement](#agreement-between-hmm-rules-and-spacy).
- **The judges' rules**: ten settled cases added after a consistency check of all distinct verdicts,
  with the verdicts they contradict (commit `7ffdbd4`).
- **Two learned methods, measured and not adopted**: a transition-based parser trained on the labels,
  and spaCy fine-tuned on the judged circuits (`experiments/syntax-learned/README.md`).
- **rvss** (folder `strategies/rvss/`): the design of a separate formalizer that reads through a
  vector-symbolic sentence state, and its first measurements (commit `f5be34c`;
  [Formalizers](formalizers/README.md)).
- **The strategy `vss` renamed `hmm-rules`** (2026-11-27): a hidden Markov model plus rules, not a
  vector-symbolic reader ([hmm-rules: Name](formalizers/hmm-rules.md#name)).
- **The status of each formalizer** (the owner's decision of 2026-11-27): spaCy is the one active
  strategy, measured and being improved; hmm-rules, DistilBERT, Prolog and Z3 are experimental:
  measured, kept runnable and still a voice in agreement for their own family, but not improved now;
  rvss is being built ([Formalizers](formalizers/README.md)).

**Running now** (2026-11-27, night)

- **The rvss sprint**: spaCy run over every message of the dataset as training data for rvss (a "silver"
  set, kept apart from the labels); training sets and the rvss move sequences; an evaluation harness;
  then rvss built and trained on the GPU (placement, moves under teacher forcing, free running), aiming to
  reproduce spaCy with a smaller and faster model, measured on the benchmark and checked by a reviewer.
- **A silver audit**: every spaCy circuit of the open messages gets a suspicion score from cheap signals
  (disagreement with hmm-rules and DistilBERT, length, structure); a judge reads a stratified random sample
  per suspicion level, to know how clean spaCy's circuits are before large language models clean the rest.
- **spaCy, a sixth round of general repairs** on the circuits judges still reject.
- **Documentation of rvss as an HMM plus a VSA memory**, with what research on HMMs, hierarchical HMMs,
  grammar induction and vector-symbolic sequence memory says for its design (section docs/rvss/).

**Next, in order**

1. Read rvss's first measurements against spaCy (accuracy, speed, size); decide the next milestone.
2. Clean the spaCy circuits of the suspicious levels with judges that rewrite rejected circuits; publish
   what they accept as labels.
3. A fresh random benchmark sample, since the current one has been used to find faults.

**Not measured yet** (what a reviewer will ask)

- GOAL on a fresh random sample: rules were found by reading this benchmark's rejected circuits, so the
  current sample overstates hmm-rules and spaCy somewhat
  ([Limits of the measurements](evaluation/validity.md#no-longer-an-unseen-sample)). A new sample will
  be drawn once the labels have grown.
- hmm-rules learns its word habits from the raw text of the whole dataset, including the benchmark's messages
  (no labels): this is allowed (unsupervised), but it is not a held-out measurement in the strict sense.
- How often two judges, or a judge and a person, agree on this schema
  ([Judges](evaluation/judging.md#what-is-not-known-about-judges)).

## The benchmark, live

**GOAL** = messages whose circuit is accepted (levels L8 + L9 + L10) ÷ all 1,831 messages of the benchmark. In the tables, the range after a GOAL is its [95% interval](reference/glossary.md#nlp-and-statistics): with 1,831 messages, a GOAL is known to about ±2 points.

| Strategy | GOAL (each block 5%) |
| --- | --- |
| spacy | 94.6% ███████████████████░ |
| hmm-rules (experimental) | 79.0% ████████████████░░░░ |
| distilbert (experimental) | 76.8% ███████████████░░░░░ |
| prolog (experimental) | 61.6% ████████████░░░░░░░░ |
| z3 (experimental) | 59.0% ████████████░░░░░░░░ |

Levels: L0 no valid circuit · L1–L6 rejected, with the judge's grade · L7 unused · L8 accepted · L9 equal to the label · L10 accepted, replacing the label. The exact definitions: [Levels and GOAL](evaluation/levels.md).

> **Not an unseen sample any more.** From commit `dd562c3` on, the rules of hmm-rules (then named vss) were checked against the judged circuits of this benchmark, and the rules of `fa46cb7` include rules found in its rejected circuits; the spaCy repairs of `a55e33f` were measured on its rejected circuits too. Their scores here are therefore likely higher than on messages nobody has looked at. The first DistilBERT checkpoint (71.8% in [Progress](#progress-over-time)) had been trained on agreement circuits of 576 of these messages; the later checkpoints hold them out. A fresh sample is planned ([Limits of the measurements](evaluation/validity.md#no-longer-an-unseen-sample)).

**More:** [Benchmark in detail](status/benchmark.md): the levels of every strategy on the benchmark, which version of each strategy the table reads, the accepted circuits that leave an attachment open, and the facts of the run.

## Progress over time

**First and latest GOAL** of each strategy on the benchmark, with the time of day of each measurement and the change in points:

| Strategy | First → latest |
| --- | --- |
| spacy | 82.5% (16:39) → 94.6% (21:43); +12.1 points |
| hmm-rules (experimental) | 65.9% (16:39) → 79.8% (21:54); +13.9 points |
| distilbert (experimental) | 71.8% (16:39) → 77.3% (20:17); +5.5 points |
| prolog (experimental) | 61.7% (16:39); one measurement |
| z3 (experimental) | 59.3% (16:39); one measurement |

> **Not in this list yet.** The live table differs from the last row of hmm-rules: live 79.0%; last row 79.8% (c080ce8, 2026-11-27 21:54); prolog: live 61.6%; last row 61.7% (9f57aa3, 2026-11-27 16:39); distilbert: live 76.8%; last row 77.3% (syntax-v3, 2026-11-27 20:17); z3: live 59.0%; last row 59.3% (9f57aa3, 2026-11-27 16:39). The live table reads the circuits in the strategy files of the run now (see "Where each strategy's circuits come from" in [the benchmark](#the-benchmark-live)); they come from a later version than the row, or some of them still wait for a judge.

**More:** [Every measurement](status/progress.md): every judged measurement of GOAL over time, newest first, with its commit and what changed, and how sure the numbers are.

## Speed and cost per strategy

| Strategy | Speed and size |
| --- | --- |
| hmm-rules (experimental) | 0.47 ms median · 1,530 messages/s · whole dataset 2 min · model files 3.3 MB |
| prolog (experimental) | 1.10 ms median · 624 messages/s · whole dataset 5 min · model files 24 KB |
| distilbert (experimental) | 3.92 ms median · 240 messages/s · whole dataset 13 min · model files 268.6 MB |
| spacy | 50.9 ms median · 18 messages/s · whole dataset 2.8 h · model files 500.7 MB |
| z3 (experimental) | 56.7 ms median · 9 messages/s · whole dataset 5.8 h · model files 88 KB |

Time per message in one process, from the benchmark run, fastest first by mean time. What is timed, and which comparisons are not like for like: [Speed and cost](formalizers/speed.md).

**More:** [Speed and cost in detail](status/speed.md): the time per message, start-up, model size, runtime and training of every strategy, as measured in the benchmark run.

## The dataset

Counted now from `webmeet-dataset/syntactic/` (commit c6b11f6): 89,863 of 183,497 messages have a circuit (49.0%): 84,186 by agreement, 5,645 accepted by a judge, 32 written by a judge. No message appears twice. What the three ways of acceptance mean: [The dataset](evaluation/dataset.md).

**More:** [Dataset labels by area](status/dataset.md): how many messages of each area of the dataset have a circuit, and how each circuit was accepted.

## Agreement between hmm-rules and spaCy

**Now, on the 1,831 benchmark messages**, hmm-rules and spaCy write the same circuit for 484 (26.4%), and the same up to attachment (where a phrase with a linking word starts) for 702 (38.3%). The judges accepted 699 of these and rejected 3. Why agreement settles labels: [Agreement between formalizers](evaluation/agreement.md).

**Audit of the batch conversion:** a judge read 1,715 of the 86,437 circuits settled by agreement (2.0%) and rejected 17 (0.99%). What the audit is: [The audit](evaluation/audit.md).

**More:** [Agreement and audit in detail](status/agreement.md): how often hmm-rules and spaCy write the same circuit on the benchmark, by area and over time, what the judges said where they differ, the audit of the batch conversion, and where the agreed circuits stand in the dataset.

## Journal

The working journal, `improvements-ideas.md`, written by hand at each stage (last committed 2026-11-27 22:54): where things stand, what is in progress, the next steps, ideas not yet tried and open points for the owner.

The file has wide tables, so it is best read on a computer: [improvements-ideas.md](../improvements-ideas.md). The page linked below is a copy made at every build, with those tables written as lists.

**More:** [The journal, as lists](status/journal.md): a copy of the working journal improvements-ideas.md, made at every build, with its wide tables written as lists so that it reads on a phone.

## Recent work

The 3 newest commits of **soplang-nlu**:

- 2026-11-27 22:54 [`94baeb1`](https://github.com/ml-circuits-research/soplang-nlu/commit/94baeb1) Rename vss to hmm-rules (an HMM learned from raw text plus general rules, not a vector-symbolic reader); hmm-rules and distilbert experimental
- 2026-11-27 22:51 [`94b3036`](https://github.com/ml-circuits-research/soplang-nlu/commit/94b3036) strict-vss renamed rvss (recursive VSS), as the owner decided
- 2026-11-27 22:51 [`8e218ba`](https://github.com/ml-circuits-research/soplang-nlu/commit/8e218ba) rvss design, third revision (written as strategies/strict-vss/DESIGN.md before the folder move)

**More:** [Recent commits](status/commits.md): the last 30 commits of soplang-nlu and of webmeet-dataset, newest first.

Built in 14.7 s from the repositories as they are, and from the hand-written files `docs/status/now.md` and `docs/status/history.json`; "uncommitted paths" counts the entries of `git status`, where a new folder counts once.

---

Next: [Benchmark in detail](status/benchmark.md) · Up: [Home](README.md)
