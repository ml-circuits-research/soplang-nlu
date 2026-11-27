# Syntax work status

Generated 2026-11-27 19:26 (UTC+01:00) by `node docs/status/build.mjs` · soplang-nlu 9b2831e (13 uncommitted paths) · webmeet-dataset 596ff1d. The phone page with charts is [status.html](status.html); on GitHub that link shows its HTML source, so open the file in a browser to see the page.

> **Since the build of 2026-11-27 19:04** (6f11cb6): registry 12,310 → 12,743 circuits; dataset messages with a circuit 62,066 → 83,619; 2 new commits in soplang-nlu; 1 new commit in webmeet-dataset.

1. [What this project does](#what-this-project-does)
2. [Working on now](#working-on-now)
3. [The benchmark, live](#the-benchmark-live)
4. [Progress over time](#progress-over-time)
5. [Speed and cost per strategy](#speed-and-cost-per-strategy)
6. [The dataset](#the-dataset)
7. [Agreement between VSS and spaCy](#agreement-between-vss-and-spacy)
8. [Journal](#journal)
9. [Recent work](#recent-work)
10. [Glossary](#glossary)

## What this project does

**At a glance:** **86.8%** GOAL of the best strategy (spacy): share of the 1,831 benchmark messages whose circuit a judge accepts · **75.5%** GOAL of VSS, our own reader and the main focus · **45.6%** of the dataset's 183,497 messages have a circuit (83,619)

A **formalizer** (here called a **[strategy](#glossary)**) reads one English message alone, with no context and no knowledge base, and writes its syntactic **[circuit](#glossary)** in the `syntax` schema: the clauses, the nominals (the words that describe one thing), the relations between them and the coordinations, with every word of the message in exactly one place. The strategies are compared on one **[benchmark](#glossary)**: 1,831 messages, 1% of the dataset, drawn at random. A **[judge](#glossary)** reads every circuit without knowing which strategy wrote it, and accepts or rejects it. **GOAL** is the share of messages whose circuit is accepted (levels L8, L9 and L10, [below](#the-benchmark-live)); the aim is over 99%. Accepted circuits become the **[labels](#glossary)** of the dataset, which the strategies are measured and trained on. Terms are explained in the [Glossary](#glossary).

**An example.** The message *make a bar chart of the projects by name please* has this circuit as its label (accepted by a judge), taken from the dataset now:

```
@c1 syntax.clause form=imperative verb="make" discourse="please" complement=$n1
@n1 syntax.nominal dependent="a" dependent="bar" head="chart"
@r1 syntax.relation marker="of" from=$n1 to=$n2
@n2 syntax.nominal dependent="the" head="projects"
@r2 syntax.relation attachment=ambiguous marker="by" from=$c1 to=$n3
@n3 syntax.nominal head="name"
```

Read line by line, each line one wire:

- `c1` **clause**: form=imperative; verb "make"; discourse "please"; complement → n1 ("a bar chart")
- `n1` **nominal**: dependent "a"; dependent "bar"; head "chart"
- `r1` **relation**: marker "of"; from → n1 ("a bar chart"); to → n2 ("the projects")
- `n2` **nominal**: dependent "the"; head "projects"
- `r2` **relation**: attachment=ambiguous; marker "by"; from → c1 (the clause of "make"); to → n3 ("name")
- `n3` **nominal**: head "name"

`attachment=ambiguous` marks a phrase whose place the words do not settle (here, whether "by name" goes with the making or with the projects); the judges accept either place.

**The five strategies.** Three are worked on; two are [parked](#glossary) (still measured, not improved for now, owner's decision):

- **vss** (main focus): our own reader. It learns classes of words (stations) from raw text with no labels; hand-written rules about English, which name only function words, then build the circuit. Node.js only.
- **spacy**: an outside dependency parser (spaCy's English transformer, trained by its makers on large treebanks) plus our layer that turns its parse into a circuit. Python.
- **distilbert**: a small transformer (DistilBERT, pretrained on English text) fine-tuned on our circuits. Python with PyTorch.
- **prolog** (parked): a hand-written grammar in Prolog.
- **z3** (parked): a hand-written grammar written as constraints and solved by the Z3 solver.

**Why VSS is the focus, although spaCy scores higher.** VSS needs only Node.js, its model is one file of 3.3 MB, it reads a message in 0.42 ms (median) on one CPU core, and it learns from raw text, so it is a reader we own and can extend, and it could run in a browser once a small loader is written. spaCy needs Python and a transformer of 500.7 MB and takes 51 ms per message. It stays as the strongest second voice: when two strategies that read from different sources write the same circuit, the label is settled with no judge ([Agreement](#agreement-between-vss-and-spacy)).

**Who the judges are.** Language-model agents (claude-opus-5-5: 12,417 circuits read so far) that follow written rules (`tests/benchmark/syntax/rules.md`). How often two judges, or a judge and a person, agree on this schema has not been measured yet.

More to read: [How VSS works](vss-architecture.html) · [The syntax work of 2026-11-27: decisions and insights](syntax-work-2026-11-27.html) · [How circuits are evaluated and the dataset converted](syntax-evaluation-and-conversion.html) · [The syntax schema and its rules](syntax-schema.md) · [The working journal (also below)](../improvements-ideas.md) · [The benchmark table as table.mjs writes it](../eval-results/2026-11-27-syntax-benchmark-random/table.md).

## Working on now

*Written by hand; last saved 2026-11-27 19:26. The numbers are in the computed sections below.*

Updated by hand with every step; the numbers are in the sections this text links to.

**Latest results**

- VSS reached **75.5%** on the benchmark (65.9% at the first judging): the rules of three fault analyses and
  the measured prototypes of the lever study ([Progress over time](#progress-over-time)). It is now above DistilBERT
  (73.1%); spaCy leads with 86.8% after general repairs in our writing layer.
- The lever trials, judged in full: evidence from DistilBERT on the roles of words would add about 3.9 points
  to VSS; with perfect word tags (stations) up to about 9 points. Better tagging is a real lever for VSS,
  alongside the structural rules.
- Where VSS and spaCy write different circuits, both are accepted in a large share of messages: the schema
  allows several readings ([Agreement](#agreement-between-vss-and-spacy)).
- **A wider agreement key** (commit `c8d0a09`): two circuits now count as the same also up to eight choices
  the judges' rules let pass either way (which word heads a name, a number after a noun, where a discourse
  word sits, "let's", "left of", quantity phrases, "a bit", naming participles). On the judged benchmark it
  adds 182 agreements where both circuits were accepted and none where one was rejected. On the 217 files
  of the batch conversion, VSS and spaCy now agree on 38.9% of messages instead of 31.7% (calendar: 56.0%
  instead of 10.6%), so more cells can be filled without a judge, with the usual 2% audit.

- **Two learned methods, measured and not adopted** (`experiments/syntax-learned/README.md`): a
  transition-based parser for VSS trained on the labels (55% known accepted, 63–76% estimated, below VSS), and
  spaCy fine-tuned on the judged circuits (about break-even with the base model). Both mostly learn VSS's own
  conventions, because most labels so far are VSS's agreement circuits; they need judged examples from the hard
  part of the dataset first.

- **The dataset grew to 45.6%** (83,619 of 183,497 messages have an accepted circuit; 33.8% before): VSS and
  spaCy in their current versions ran again over the 217 files of the batch conversion, agreement was settled
  with the wider key, a judge read a random 2% of the new agreed circuits (431 of 433 accepted), and the empty
  cells were filled ([Dataset](#the-dataset)). On the way a fault of the write step was found and fixed: a file
  where one labelled message had got another circuit was skipped whole (commit `9b2831e`).

**Running at this moment**

- **VSS rules, next round.** The largest group first: the finite verb found by agreement with its subject
  ("the board dials in tomorrow morning", "the data lives somewhere" are today read as nouns), built on a
  number habit learned from the text, not on word lists; then fronted clauses ("while you're at it, …"),
  measures and appositions set off by commas, numerals as heads, relative clauses.
- **spaCy, second round of general repairs** in the layer that writes its circuits, on the about 241
  benchmark circuits judges still reject (scene lists, gapping, grading words, clauses untied across ";").

**Next, in order**

1. Judge the benchmark circuits that the next VSS round changes; record the new GOAL here.
2. Judge the benchmark circuits that the spaCy repairs change; record the new GOAL.
3. Rerun VSS over the conversion after each round of rules and settle again (each gain fills cells without a
   judge, with a 2% audit).
4. Retrain DistilBERT on the grown labels (benchmark held out) and measure.
5. Conversion rounds for the messages that stay open: a judge reads one circuit per message and writes it when
   it is rejected.

**Not measured yet** (what a reviewer will ask)

- GOAL on a fresh random sample: the rules were found by reading this benchmark's rejected circuits, so the
  current sample now overstates VSS somewhat. A new sample will be drawn once the labels have grown.
- VSS learns its word habits from the raw text of the whole dataset, including the benchmark's messages (no
  labels): this is allowed (unsupervised), but it is not a held-out measurement in the strict sense.

## The benchmark, live

**GOAL** = messages whose circuit is accepted (levels L8 + L9 + L10) ÷ all 1,831 messages of the benchmark. In the tables, the range after a GOAL is its [95% interval](#glossary): with 1,831 messages, a GOAL is known to about ±2 points.

| Strategy | GOAL | Bar (each block 5%) |
| --- | ---: | --- |
| spacy | 86.8% | █████████████████░░░ |
| vss | 75.5% | ███████████████░░░░░ |
| distilbert | 73.1% | ███████████████░░░░░ |
| prolog (parked) | 61.7% | ████████████░░░░░░░░ |
| z3 (parked) | 59.3% | ████████████░░░░░░░░ |

Levels: L0 no valid circuit · L1–L6 rejected, with the judge's grade · L7 unused · L8 accepted · L9 equal to the label · L10 accepted, replacing the label.

<details>
<summary>What each level means</summary>

- **L0**: no valid circuit.
- **L1–L6**: the judge rejected the circuit, and the number is the grade: L1 a clause is wrong (its form or its verb); L2 a content word put in the discourse slot (the slot for words such as "please"); L3 words stand in the wrong wire, or a tie is wrong; L4 the circuit states what the message does not say; L5 a clause of the message is not written; L6 something is left untied.
- **L7**: unused, since a strategy returns one circuit.
- **L8**: accepted, and not the label the message had before the run.
- **L9**: equal to the label the message had before the run, so no judge was needed.
- **L10**: accepted by the judge in this run, and it replaces the label the message had.
- **waiting**: no judge has read the circuit yet; not counted in GOAL.

</details>

**In short** (messages of the benchmark):

| Strategy | GOAL (95% interval) | Accepted (L8–L10) | Rejected (L1–L6) | No circuit (L0) | Waiting for a judge |
| --- | ---: | ---: | ---: | ---: | ---: |
| spacy | 86.8% (85.2–88.3) | 1,590 | 241 | 0 | 0 |
| vss | 75.5% (73.5–77.4) | 1,382 | 449 | 0 | 0 |
| distilbert | 73.1% (71.0–75.1) | 1,338 | 493 | 0 | 0 |
| prolog (parked) | 61.7% (59.4–63.9) | 1,129 | 661 | 41 | 0 |
| z3 (parked) | 59.3% (57.0–61.5) | 1,085 | 746 | 0 | 0 |

> **Not an unseen sample any more.** From commit `dd562c3` on, VSS's rules were checked against the judged circuits of this benchmark, and the rules of `fa46cb7` include rules found in its rejected circuits; the spaCy repairs of `a55e33f` were measured on its rejected circuits too. Their scores here are therefore likely higher than on messages nobody has looked at. The first DistilBERT checkpoint (71.8% in [Progress](#progress-over-time)) had been trained on agreement circuits of 576 of these messages; syntax-v2 holds them out. A fresh sample is planned ([details](syntax-work-2026-11-27.html#rule-batches)).

<details>
<summary>Where each strategy's circuits come from (which version the table reads)</summary>

The strategy file of the run, and the commit that last changed it:

- **spacy**: file written 2026-11-27 17:39; committed 17:40 in [`87a221e`](https://github.com/ml-circuits-research/soplang-nlu/commit/87a221e): "Benchmark: the repaired spaCy and the retrained DistilBERT (syntax-v2, benchmark messages held out of training) run a…"
- **vss**: file written 2026-11-27 18:13; committed 18:24 in [`1809b31`](https://github.com/ml-circuits-research/soplang-nlu/commit/1809b31): "Benchmark: verdicts on the 183 new VSS circuits after the study prototypes (83fce90), packets 45-46"
- **distilbert**: file written 2026-11-27 17:38; committed 17:40 in [`87a221e`](https://github.com/ml-circuits-research/soplang-nlu/commit/87a221e): "Benchmark: the repaired spaCy and the retrained DistilBERT (syntax-v2, benchmark messages held out of training) run a…"
- **prolog**: file written 2026-11-27 15:52; committed 16:14 in [`a09047d`](https://github.com/ml-circuits-research/soplang-nlu/commit/a09047d): "Batch conversion: settle and write scripts, the pooled audit of agreed circuits (1,154 read, 10 rejected), and the st…"
- **z3**: file written 2026-11-27 15:56; committed 16:14 in [`a09047d`](https://github.com/ml-circuits-research/soplang-nlu/commit/a09047d): "Batch conversion: settle and write scripts, the pooled audit of agreed circuits (1,154 read, 10 rejected), and the st…"

</details>

**Every level** (number of messages at each level):

| Strategy | GOAL | Messages | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | waiting |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| spacy | 86.8% | 1,831 | 0 | 74 | 11 | 149 | 0 | 3 | 4 | 0 | 1,000 | 406 | 184 | 0 |
| vss | 75.5% | 1,831 | 0 | 145 | 2 | 270 | 0 | 26 | 6 | 0 | 796 | 582 | 4 | 0 |
| distilbert | 73.1% | 1,831 | 0 | 150 | 3 | 274 | 4 | 5 | 57 | 0 | 754 | 535 | 49 | 0 |
| prolog | 61.7% | 1,831 | 41 | 229 | 1 | 383 | 7 | 37 | 4 | 0 | 658 | 238 | 233 | 0 |
| z3 | 59.3% | 1,831 | 0 | 236 | 10 | 460 | 0 | 31 | 9 | 0 | 599 | 250 | 236 | 0 |

<details>
<summary>Accepted circuits that leave an attachment open</summary>

| Strategy | Share | Accepted circuits | With attachment=ambiguous |
| --- | ---: | ---: | ---: |
| spacy | 18.4% | 1,590 | 293 |
| vss | 6.0% | 1,382 | 83 |
| distilbert | 5.9% | 1,338 | 79 |
| prolog | 48.0% | 1,129 | 542 |
| z3 | 46.5% | 1,085 | 505 |

A circuit may mark a phrase with `attachment=ambiguous` when the words do not say where it hangs. The hand-written grammars do this far more often, which makes their circuits easier to accept.

</details>

**About this run.** `2026-11-27-syntax-benchmark-random`: 1,831 messages drawn at random from the whole dataset (seed and method in `sample.lock.json`), every circuit of every strategy judged. Judged in this run: 7,306 circuits. Before the run, 593 of the 1,831 messages had a label. The [registry](#glossary) of judged circuits holds 12,743 circuits of 6,541 messages: 12,417 read by claude-opus-5-5, and 326 agreement circuits recorded with no judge: 306 agreement labels that the benchmark publication replaced, kept as accepted readings, in `2026-11-27-benchmark-random-replaced-agreement.jsonl`; 20 second agreed circuits of a conversion round, an open point of the journal, in `2026-11-27-round-02.jsonl`.

## Progress over time

Each row is one judged measurement, written by hand into `docs/status/history.json` when its verdicts are in. Rows marked *trial* are experiments on a copy of VSS (the [lever trials](#glossary)), not strategies. The oldest row was measured on other messages than the benchmark, so it is not comparable with the others.

| Strategy | Change (points) | First on the benchmark | Latest |
| --- | ---: | ---: | ---: |
| spacy | +4.3 | 82.5% (16:39) | 86.8% (17:52) |
| vss | +9.6 | 65.9% (16:39) | 75.5% (18:24) |
| distilbert | +1.3 | 71.8% (16:39) | 73.1% (17:52) |
| prolog (parked) | — | 61.7% (16:39) | 61.7% (16:39) |
| z3 (parked) | — | 59.3% (16:39) | 59.3% (16:39) |

**How sure these numbers are.** Each GOAL comes from 1,831 messages, so it is known to about ±2 points (95% interval). A change of 1 or 2 points between two separate measurements can be chance. The trial rows are paired (the same messages and the same copy of VSS, with one aid added), which makes their differences more precise than two separate intervals suggest; a paired test was not run. Their gains of +1.3 and +2.2 points are close to the uncertainty, the +3.9 of the roles less so.

**Every measurement**, newest first:

- **75.5%** vss · 2026-11-27 18:24 · [`83fce90`](https://github.com/ml-circuits-research/soplang-nlu/commit/83fce90). After the measured prototypes of the lever study (83fce90: causative verb + object + bare verb, every part of a sentence tied, compound nouns, the opening command verb, participles after a comma); the 183 new circuits judged in packets 45-46 (commit 1809b31). VSS is now above DistilBERT.
- **72.0%** vss · 2026-11-27 18:04 · [`fa46cb7`](https://github.com/ml-circuits-research/soplang-nlu/commit/fa46cb7). After the rules of fa46cb7 (the remaining rules of the drawing and diagram analyses, and rules found in the benchmark rejections); the 225 new circuits judged in packets 43-44 (commit 0f9b5c3).
- **72.4%** vss *(trial: DistilBERT evidence on roles)* · 2026-11-27 17:59 · [`9df0889`](https://github.com/ml-circuits-research/soplang-nlu/commit/9df0889). Lever trial: the same table for all five word uses (verb, word of a nominal, modifier, marker, other) (+3.9 points against the plain copy).
- **70.7%** vss *(trial: DistilBERT evidence on the verb)* · 2026-11-27 17:59 · [`9df0889`](https://github.com/ml-circuits-research/soplang-nlu/commit/9df0889). Lever trial: a small per-word table learned from DistilBERT's circuits on the corpus says how a word is used; where it is sure and VSS disagrees, the word is kept off the stations that use rules out. Used for the verb only (+2.2 points against the plain copy).
- **69.8%** vss *(trial: station prior)* · 2026-11-27 17:59 · [`9df0889`](https://github.com/ml-circuits-research/soplang-nlu/commit/9df0889). Lever trial: VSS's station tagger trained again with the accepted circuits mapped to stations as a weighted prior, benchmark messages held out (+1.3 points against the plain copy).
- **68.5%** vss *(trial: plain copy)* · 2026-11-27 17:59 · [`9df0889`](https://github.com/ml-circuits-research/soplang-nlu/commit/9df0889). Lever trials (eval-results/2026-11-27-vss-lever-trials): the copy of VSS that every trial changes, with nothing added. The reference for the three trial rows listed above it.
- **73.1%** distilbert · 2026-11-27 17:52 · [`9ae0e6f`](https://github.com/ml-circuits-research/soplang-nlu/commit/9ae0e6f). Checkpoint syntax-v2 (trainer of 9ae0e6f), retrained on the current labels with the benchmark messages held out of training; judged in packets 36-42 (commit 5c87955).
- **86.8%** spacy · 2026-11-27 17:52 · [`a55e33f`](https://github.com/ml-circuits-research/soplang-nlu/commit/a55e33f). After general repairs in the layer that writes spaCy's circuits; the new circuits judged in packets 36-42 (commit 5c87955).
- **59.3%** z3 · 2026-11-27 16:39 · [`9f57aa3`](https://github.com/ml-circuits-research/soplang-nlu/commit/9f57aa3). First full judging of the random 1% benchmark. Parked since.
- **61.7%** prolog · 2026-11-27 16:39 · [`9f57aa3`](https://github.com/ml-circuits-research/soplang-nlu/commit/9f57aa3). First full judging of the random 1% benchmark. Parked since.
- **65.9%** vss · 2026-11-27 16:39 · [`9f57aa3`](https://github.com/ml-circuits-research/soplang-nlu/commit/9f57aa3). First full judging of the random 1% benchmark.
- **71.8%** distilbert · 2026-11-27 16:39 · [`9f57aa3`](https://github.com/ml-circuits-research/soplang-nlu/commit/9f57aa3). First full judging of the random 1% benchmark. This checkpoint had been trained on agreement circuits of 576 of the benchmark messages, so 71.8% is not a held-out measure (syntax-work-2026-11-27.html, I9).
- **82.5%** spacy · 2026-11-27 16:39 · [`9f57aa3`](https://github.com/ml-circuits-research/soplang-nlu/commit/9f57aa3). Random 1% benchmark (1,831 messages), first full judging: 35 packets, 5,858 distinct circuits of five strategies.
- **63.4%** vss *(earlier fixed sample)* · 2026-11-27 13:45 · [`24de853`](https://github.com/ml-circuits-research/soplang-nlu/commit/24de853). First judged run on the syntax schema (eval-results/2026-11-27-syntax-benchmark-1, 1,831 messages, 1,160 at L8), on the earlier fixed sample of eval-results/2026-11-26-fresh-locked-one-percent. Other messages than the random 1% benchmark, so not comparable with any other row.

## Speed and cost per strategy

Measured while the benchmark ran (`run.mjs`): each strategy in a process of its own, on the same machine, one message at a time. Each figure is the wall-clock time of one call to the strategy's `propose` function: from handing over the message until the circuit comes back, including the call into Python or Prolog where there is one, and not including start-up (loading the model, paid once per process). The figures come from the milliseconds recorded for every message in the strategy files of the run, the same files the GOAL is computed from. Every column is for one process. "Messages per second" and "Whole dataset" (the time for all 183,497 messages) come from the mean; "90% within" is the time 90% of messages stay under.

| Strategy | Messages per second | Whole dataset | Median ms | 90% within, ms | 99% within, ms | Mean ms | Start-up |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| vss | 1,706 | 2 min | 0.42 | 1.12 | 2.4 | 0.59 | 48 ms |
| prolog | 624 | 5 min | 1.10 | 3.41 | 7.0 | 1.60 | 7 ms |
| distilbert | 262 | 12 min | 3.48 | 4.65 | 5.7 | 3.81 | not recorded |
| spacy | 18 | 2.8 h | 51.1 | 74.1 | 111.3 | 55.2 | 2.8 s |
| z3 | 9 | 5.8 h | 56.7 | 254.4 | 984.8 | 113.6 | 252 ms |

Start-up comes from `summary.json`, which `run.mjs` writes when it runs a strategy. For distilbert, summary.json still describes an earlier run (median 3.75 ms there, 3.48 ms in the strategy file), so the start-up of the current run was not recorded and is left out.

**In practice.** VSS reads about 1,706 messages a second in one Node process on one CPU core, so the whole dataset takes about 2 min; with 20 processes on this machine's 20 cores, about 5 s (an estimate, not measured). spaCy takes about 2.8 h for the same work in one process: 94 times longer per message on average (121 times at the median). That makes spaCy the slowest step of every rerun over the whole dataset, such as the next one planned in [Working on now](#working-on-now). DistilBERT on the GPU takes about 12 min; Z3 about 5.8 h, with a long tail (90% of messages within 254 ms, 99% within 985 ms). For use while someone types: VSS's 0.4 ms is instant, spaCy's 51 ms goes unnoticed, and Z3's slow messages would be felt.

**Not like for like.** DistilBERT ran on the GPU and spaCy on the CPU. The PyTorch strategies (spaCy's transformer and DistilBERT) may use several CPU threads inside their one process, so "one process" favours them. Messages were sent one at a time; spaCy and DistilBERT would be faster on batches of messages (not measured). **Not measured yet:** DistilBERT on a CPU (it decides whether DistilBERT can run where there is no GPU), the CPU time of each strategy, and speed with batches.

**Side by side.** Sizes are measured on disk now, in decimal units (1 MB = 1,000,000 bytes). "Model files" are the files the strategy loads; the runtime it needs (Node.js, Python with PyTorch, SWI-Prolog) is not counted, except where noted.

| Strategy | Model files | Runtime to install | In a browser | Training | Learns from our labels |
| --- | ---: | --- | --- | --- | --- |
| vss | 3.3 MB | Node.js | not yet; needs a small loader | about 1 min, CPU | no: raw text only |
| spacy | 500.7 MB | Python with spaCy and spacy-transformers (PyTorch) | no | none by us | no: English treebanks, by its makers |
| distilbert | 268.6 MB | Python with PyTorch and Hugging Face transformers; CUDA for the GPU | not as it is | 38 min, GPU | yes: judged labels, and agreement labels at a lower weight |
| prolog (parked) | 24 KB | SWI-Prolog | not as it is | word counts only | no: raw text counts |
| z3 (parked) | 88 KB | Node.js and z3-solver, whose WebAssembly file is 39.2 MB | in principle; large | word counts only | no: raw text counts |

<details>
<summary>Each strategy in detail</summary>

**vss** (main focus)

- Runs on: Node.js only: plain JavaScript in one process, on one CPU core. No GPU, no Python.
- In a browser: Not yet. The reader is plain JavaScript and the model is one JSON file; Node is used only to read its files, so a browser needs a small loader, which is not built yet.
- Model files: model.json: 3.3 MB (strategies/vss/model/model.json)
- Training: About 60–70 s on the CPU (reported by the training runs, not measured here), from 183,497 messages of raw text (2,623,108 words, 25 rounds of EM). No labels are used. The raw text is the whole dataset, so it includes the benchmark messages, without their labels.
- Source of its analysis: Stations (classes of words and their order) learned from raw text with no labels, plus hand-written rules about English that name only function words.

**spacy** (active)

- Runs on: Python with spaCy 3.8 and the transformer pipeline en_core_web_trf 3.8.0, called from Node; on the CPU in the benchmark.
- In a browser: No: it needs Python and a transformer of about half a gigabyte.
- Model files: en_core_web_trf: 500.7 MB (/tmp/sop-nlu-trf-model/en_core_web_trf)
- Training: None by us: a pipeline trained by its makers on large English treebanks. Our part is the layer that writes circuits from its parse.
- Source of its analysis: A transformer dependency parser trained on large English treebanks, plus our rules that turn its parse into a circuit.

**distilbert** (active)

- Runs on: Python with PyTorch, called from Node; the benchmark ran on the GPU (NVIDIA GB10). It can run on a CPU too; how fast is not measured yet.
- In a browser: Not as it is: it would need an export to ONNX and a web runtime (not done).
- Model files: checkpoint syntax-v2: 268.6 MB (.local-models/distilbert/syntax-v2/checkpoint)
- Training: 38 min for 6 epochs on the GPU, 59,965 training circuits (judged labels, and agreement labels at weight 0.3); benchmark messages held out. On held-out development messages 73.0% equal the label.
- Source of its analysis: A transformer (DistilBERT, pretrained on English text) fine-tuned on our syntax circuits.

**prolog** (parked)

- Runs on: SWI-Prolog (a native program), called from Node.
- In a browser: Not as it is (SWI-Prolog has a WebAssembly build; not tried).
- Model files: word model: 24 KB (strategies/prolog/model)
- Training: The grammar is hand-written. A small word model counts, in raw text, where each word stands next to function words.
- Source of its analysis: A hand-written grammar. Parked: not improved for now (owner's decision).

**z3** (parked)

- Runs on: The Z3 solver compiled to WebAssembly (z3-solver), inside Node.
- In a browser: In principle: z3-solver has a browser build, but its WebAssembly file is large and needs threads in the browser.
- Model files: word usage table: 88 KB (strategies/z3/model)
- Runtime files: z3-built.wasm: 39.2 MB (strategies/z3/node_modules/z3-solver/build/z3-built.wasm)
- Training: The grammar is hand-written as constraints. A table counts how each word is used in raw text.
- Source of its analysis: A hand-written grammar as constraints, solved by Z3. Parked.

</details>

## The dataset

Counted now from the 238 files of `webmeet-dataset/syntactic/` (commit 596ff1d). Each row of a file is one message with its circuit (the label) in the column `sop`, or an empty cell while no circuit is settled. The column `accepted_by` says how the circuit was accepted: **agreement** (strategies that read the message from different sources wrote the same circuit; no judge read it), **judge** (a judge read and accepted it), **written** (a judge wrote it because no strategy's circuit was acceptable). The area is the first folder of the file.

| Area | Share with a circuit | With a circuit | Messages | Files | by agreement | by a judge | written by a judge | open (no circuit) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| calendar | 77.0% | 3,974 | 5,158 | 14 | 2,988 | 968 | 18 | 1,184 |
| diagram | 40.3% | 30,977 | 76,875 | 91 | 29,161 | 1,815 | 1 | 45,898 |
| document | 53.8% | 5,895 | 10,948 | 19 | 5,416 | 466 | 13 | 5,053 |
| drawing | 47.3% | 42,773 | 90,516 | 114 | 40,498 | 2,275 | 0 | 47,743 |
| **All** | **45.6%** | **83,619** | **183,497** | **238** | **78,063** | **5,524** | **32** | **99,878** |

83,619 of 183,497 messages have a circuit (45.6%): 78,063 by agreement, 5,524 accepted by a judge, 32 written by a judge. No message appears twice.

## Agreement between VSS and spaCy

Two strategies that read a message from different sources (VSS from raw text, spaCy from a parser trained on treebanks) and write the same circuit are very likely right. This is how most labels of the dataset were made. **Same circuit**: equal after the [normal form](#glossary) (wire names and order do not matter). **Same up to attachment**: equal except where a phrase with a linking word ("on", "of", "for") starts, which the judges' rules let be the clause or a nominal of it (the journal says "up to the start of marked relations").

| Benchmark messages | first judging (16:39) | now |
| --- | ---: | ---: |
| Messages | 1,831 | 1,831 |
| Same circuit | 400 (21.8%) | 430 (23.5%) |
| Same up to attachment | 575 (31.4%) | 624 (34.1%) |
| … accepted by the judges | 573 | 621 |
| … rejected | 2 | 3 |

By area (now; last column: same up to attachment at the first judging (16:39)). Small areas give rough shares: look at the number of messages.

| Area | Same up to attachment | Messages | Same circuit | First judging (16:39) |
| --- | ---: | ---: | ---: | ---: |
| drawing | 38.2% | 876 | 27.6% | 36.4% |
| diagram | 33.8% | 808 | 22.2% | 29.8% |
| calendar | 16.7% | 48 | 6.3% | 12.5% |
| document | 8.1% | 99 | 6.1% | 9.1% |

Where both wrote a valid circuit and the circuits differ (1,207 messages, now), what the judges said of each:

| VSS's circuit | spaCy's circuit | Messages |
| --- | --- | ---: |
| accepted | accepted | 627 |
| rejected | accepted | 339 |
| accepted | rejected | 132 |
| rejected | rejected | 109 |

Where both circuits were accepted, the schema allows more than one reading (which word heads a name, a number after a noun as a dependent or as its own nominal, modifier or discourse word). A wider agreement key that counts these variations as the same would settle more messages with no judge.

**Audit of the batch conversion.** When the whole dataset was converted, every circuit that strategies of different [families](#glossary) wrote alike was written into the dataset with no judge; a judge read a random 2% of them as a control (the [audit](#glossary)). Counted now from the agreement records of the conversion folders:

| Audit of the batch conversion | Count |
| --- | ---: |
| Conversion folders | 217 |
| Circuits settled by agreement | 80,009 |
| Read by a judge as a control | 1,596 (2.0%) |
| … accepted | 1,584 |
| … rejected | 12 (0.75%) |

The records count 1,596 audit circuits read (1,584 accepted, 12 rejected), and these are the figures shown. The journal and commit `a09047d` give 1,154 read and 10 rejected, a count the records do not reproduce. The judges read the audit circuits in pooled packets (`eval-results/conversion-audit`), together with other circuits of the conversion folders.

**Why the dataset has 78,063 agreement labels, not 80,009.** Where the 80,009 agreed circuits stand in the dataset now:

| Agreed circuits of the batch conversion | Count |
| --- | ---: |
| Still the label, marked as settled by agreement | 77,763 |
| Still the label, now marked as accepted by a judge (read in the audit and accepted) | 1,571 |
| Replaced by another circuit (337 of them on benchmark messages, when the benchmark was published) | 664 |
| No circuit in the dataset now (the cell was emptied) | 11 |

The other 300 agreement labels of the dataset were settled outside these folders.

## Journal

The working journal, `improvements-ideas.md`, written by hand at each stage (last committed 2026-11-27 19:04): where things stand, what is in progress, the next steps, ideas not yet tried and open points for the owner.

> **Its numbers can be older than this page.** Parts of the journal, such as the table under "Where things stand", keep the figures of the time they were written. Where they differ from the computed sections above, the computed ones are current.

<details>
<summary>Open the journal (197 lines)</summary>

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

| Strategy | Source of the analysis | Benchmark (random 1%) | State |
| --- | --- | ---: | --- |
| spacy | spaCy dependency parse + our rules (former spacy-beam) | 86.8% | general repairs done (a55e33f) |
| distilbert | DistilBERT trained on syntax circuits only | 73.1% | syntax-v2, trained on the current labels, benchmark held out |
| vss | our unsupervised reader (stations learned from text, rules) | 75.5% | main focus; rules being added (agent) |
| prolog | hand-written grammar | 61.7% | parked (owner: do not improve for now) |
| z3 | constraint model | 59.3% | parked |

Left out of rounds and benchmark (too close to one of the above, code kept): spacy-direct, spacy-beam,
neural-dependencies, neuro-selector, selector-distilbert, neuro-prolog, neuro-z3, prolog-example-transfer.

The benchmark: eval-results/2026-11-27-syntax-benchmark-random, 1,831 messages drawn at random from the whole
dataset, every circuit of the five strategies judged (5,858 distinct circuits). VSS scored 84–87% on the small
files of the first two conversion rounds; the dataset as a whole is dominated by long drawing and chart
messages, where it does worse.

#### Dataset

- webmeet-dataset/semantic/ and webmeet-dataset/syntactic/ mirror each other (238 files, at most 1,000
  messages each; `tools/layers.mjs check`).
- 62,066 of 183,497 messages have a syntactic circuit (33.8%): 56,934 by agreement of VSS and spaCy (up to the
  start of marked relations), 5,100 accepted by a judge, 32 written by a judge. The others have an empty cell.
- A judge read a random 2% of the agreement circuits: 10 of 1,154 rejected (0.87%).
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

### In progress

- VSS, next round of rules (agent): the finite verb found by agreement with its subject, built on a number
  habit learned from the text; fronted clauses; measures and appositions after commas; numerals as heads;
  relative clauses.
- Refilling the dataset: VSS (83fce90) and spaCy (a55e33f) run again over the 217 files of the batch
  conversion; then settle with `--key variants`, a judge reads 2% of the agreed circuits, empty cells filled.
- The 2% audit of the agreement circuits settled with the wider key on the 217 conversion folders (433
  circuits, eval-results/conversion-audit-02), then the cells are written.

### Next steps, in order

1. Commit the next VSS round once checked; judge only the benchmark circuits that changed; update the table
   and the status page (docs/STATUS.md).
2. Settle the refilled conversion folders with the wider key, audit 2%, write the cells.
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

</details>

## Recent work

**soplang-nlu**: the last 30 commits, newest first ([all](https://github.com/ml-circuits-research/soplang-nlu/commits)).

- 2026-11-27 19:26 [`9b2831e`](https://github.com/ml-circuits-research/soplang-nlu/commit/9b2831e) round.mjs write: a file with open cells is completed cell by cell; existing circuits stay
- 2026-11-27 19:04 [`90adc96`](https://github.com/ml-circuits-research/soplang-nlu/commit/90adc96) Status: the learned prototypes, the refilled conversion and its audit
- 2026-11-27 19:04 [`6f11cb6`](https://github.com/ml-circuits-research/soplang-nlu/commit/6f11cb6) Two learned methods for syntax circuits, measured and not adopted (experiments/syntax-learned)
- 2026-11-27 18:52 [`5b4dacd`](https://github.com/ml-circuits-research/soplang-nlu/commit/5b4dacd) Status: the wider agreement key
- 2026-11-27 18:52 [`8c9ed93`](https://github.com/ml-circuits-research/soplang-nlu/commit/8c9ed93) Journal: the wider agreement key, the current table, what runs and what comes next
- 2026-11-27 18:51 [`c8d0a09`](https://github.com/ml-circuits-research/soplang-nlu/commit/c8d0a09) Agreement key 'variants': two circuits are alike also up to the choices the judges' rules let pass either way
- 2026-11-27 18:47 [`ded2aa2`](https://github.com/ml-circuits-research/soplang-nlu/commit/ded2aa2) docs/README.md: the status page first
- 2026-11-27 18:46 [`82cbdb0`](https://github.com/ml-circuits-research/soplang-nlu/commit/82cbdb0) Status page in docs (generated): docs/status.html and docs/STATUS.md from node docs/status/build.mjs
- 2026-11-27 18:30 [`51606f5`](https://github.com/ml-circuits-research/soplang-nlu/commit/51606f5) Documentation (HTML, reviewed): the VSS reader's architecture, the decisions and insights of the syntax work of 2026-11-27, and how syntactic labels are made and measured
- 2026-11-27 18:25 [`c205ab6`](https://github.com/ml-circuits-research/soplang-nlu/commit/c205ab6) Journal: VSS at 75.5% on the benchmark after the study prototypes

<details>
<summary>20 older commits of soplang-nlu</summary>

- 2026-11-27 18:24 [`1809b31`](https://github.com/ml-circuits-research/soplang-nlu/commit/1809b31) Benchmark: verdicts on the 183 new VSS circuits after the study prototypes (83fce90), packets 45-46
- 2026-11-27 18:14 [`954da81`](https://github.com/ml-circuits-research/soplang-nlu/commit/954da81) batch-run.sh: a mode that runs the files of the batch conversion again after the strategies improved
- 2026-11-27 18:13 [`83fce90`](https://github.com/ml-circuits-research/soplang-nlu/commit/83fce90) VSS: the measured prototypes of the lever study
- 2026-11-27 18:04 [`0f9b5c3`](https://github.com/ml-circuits-research/soplang-nlu/commit/0f9b5c3) Benchmark: verdicts on the 225 new VSS circuits (fa46cb7), packets 43-44
- 2026-11-27 18:02 [`ba22103`](https://github.com/ml-circuits-research/soplang-nlu/commit/ba22103) Journal: agreement between VSS and spaCy measured by area; 515 of 1,218 disagreements are two accepted readings, so a wider agreement key is being built
- 2026-11-27 17:59 [`9dc6866`](https://github.com/ml-circuits-research/soplang-nlu/commit/9dc6866) Journal: lever trials judged; correction: forced stations repair up to about 9 points, so better tagging is a real lever for VSS
- 2026-11-27 17:59 [`9df0889`](https://github.com/ml-circuits-research/soplang-nlu/commit/9df0889) Lever trials judged (791 circuits): station prior, teacher evidence and oracle stations measured against the plain VSS copy
- 2026-11-27 17:52 [`5c87955`](https://github.com/ml-circuits-research/soplang-nlu/commit/5c87955) Benchmark: verdicts on the new circuits of the repaired spaCy and DistilBERT syntax-v2 (packets 36-42, 1,040 circuits)
- 2026-11-27 17:50 [`8cd3377`](https://github.com/ml-circuits-research/soplang-nlu/commit/8cd3377) Benchmark: the new VSS (fa46cb7) run again on the 1% sample; 225 new circuits prepared for judges (packets 43-44)
- 2026-11-27 17:49 [`fa46cb7`](https://github.com/ml-circuits-research/soplang-nlu/commit/fa46cb7) VSS: the remaining rules of the drawing and diagram analyses, and rules found in the benchmark rejections
- 2026-11-27 17:46 [`8ca1765`](https://github.com/ml-circuits-research/soplang-nlu/commit/8ca1765) Journal: DistilBERT syntax-v2, the lever study's findings and plan, replaced agreement labels kept
- 2026-11-27 17:45 [`45677bc`](https://github.com/ml-circuits-research/soplang-nlu/commit/45677bc) Lever study for VSS (read-only, 7 agents): faults left on the judged benchmark ranked into 17 rule groups, three learned levers measured; trial circuits of the levers prepared for judges; judge-publish keeps a replaced agreement label in the registry
- 2026-11-27 17:40 [`87a221e`](https://github.com/ml-circuits-research/soplang-nlu/commit/87a221e) Benchmark: the repaired spaCy and the retrained DistilBERT (syntax-v2, benchmark messages held out of training) run again on the 1% sample; 1,040 new circuits prepared for judges (packets 36-42); the judged first run kept in first-run/
- 2026-11-27 17:38 [`600196c`](https://github.com/ml-circuits-research/soplang-nlu/commit/600196c) Journal: spaCy repairs landed, judges' rules settled, documentation and lever study in progress
- 2026-11-27 17:38 [`a81dd93`](https://github.com/ml-circuits-research/soplang-nlu/commit/a81dd93) Judges' rules: three cases settled where the benchmark judges ruled differently ('let's add', 'everything else', embedded question clauses)
- 2026-11-27 17:37 [`a55e33f`](https://github.com/ml-circuits-research/soplang-nlu/commit/a55e33f) spaCy strategy: general repairs in the layer that writes its circuits
- 2026-11-27 17:10 [`66e934b`](https://github.com/ml-circuits-research/soplang-nlu/commit/66e934b) Journal: how to make VSS a reusable engine with a standard grammar (audit of generality, rules as data, learned thresholds, a test outside the dataset)
- 2026-11-27 17:03 [`8d8fa71`](https://github.com/ml-circuits-research/soplang-nlu/commit/8d8fa71) A working journal of the plan: where the syntax work stands, what is in progress, next steps and ideas
- 2026-11-27 16:56 [`dd562c3`](https://github.com/ml-circuits-research/soplang-nlu/commit/dd562c3) VSS: the frame fixes the verb, and embedded questions state
- 2026-11-27 16:51 [`e52bfc8`](https://github.com/ml-circuits-research/soplang-nlu/commit/e52bfc8) Benchmark tools: labels are read from and written to the dataset's syntactic files; no labels file, no agreement lines in the registry

</details>

**webmeet-dataset**: the last 30 commits, newest first ([all](https://github.com/ml-circuits-research/webmeet-dataset/commits)).

- 2026-11-27 19:26 [`596ff1d`](https://github.com/ml-circuits-research/webmeet-dataset/commit/596ff1d) Syntactic labels: 83,619 of 183,497 messages have a circuit (45.6%, was 33.8%)
- 2026-11-27 17:45 [`7f8346b`](https://github.com/ml-circuits-research/webmeet-dataset/commit/7f8346b) Registry: 306 agreement circuits that the benchmark publication replaced as labels, kept as accepted readings
- 2026-11-27 16:57 [`6e81e6c`](https://github.com/ml-circuits-research/webmeet-dataset/commit/6e81e6c) Syntactic layer: labels from the judged 1% benchmark (1,470 messages)
- 2026-11-27 16:51 [`95e7739`](https://github.com/ml-circuits-research/webmeet-dataset/commit/95e7739) Remove duplicated data: the syntactic files are the only store of labels; the registry keeps only what a judge read or wrote
- 2026-11-27 16:13 [`0b58c84`](https://github.com/ml-circuits-research/webmeet-dataset/commit/0b58c84) Syntactic layer: every file now exists, with 60,914 of 183,497 messages settled (33%)
- 2026-11-27 15:03 [`7be6e99`](https://github.com/ml-circuits-research/webmeet-dataset/commit/7be6e99) Syntactic layer: four more files (598 messages) from conversion round 2
- 2026-11-27 14:40 [`d44ab91`](https://github.com/ml-circuits-research/webmeet-dataset/commit/d44ab91) No file over 1,000 messages: 49 large semantic files split into 187 parts; a script keeps the two layers mirrored
- 2026-11-27 14:39 [`0124ab9`](https://github.com/ml-circuits-research/webmeet-dataset/commit/0124ab9) Syntactic layer: the first 17 files (575 messages) from conversion round 1
- 2026-11-27 14:34 [`aff01cb`](https://github.com/ml-circuits-research/webmeet-dataset/commit/aff01cb) Semantic layer: partial work of an earlier session, kept for the record
- 2026-11-27 14:07 [`66e68b2`](https://github.com/ml-circuits-research/webmeet-dataset/commit/66e68b2) Syntax annotations: how agreement and written circuits are recorded

<details>
<summary>20 older commits of webmeet-dataset</summary>

- 2026-11-27 13:47 [`9d87f2b`](https://github.com/ml-circuits-research/webmeet-dataset/commit/9d87f2b) Split the dataset into semantic/ and syntactic/
- 2026-11-27 13:46 [`b85fe78`](https://github.com/ml-circuits-research/webmeet-dataset/commit/b85fe78) Judged nlu readings: the last 59 verdicts of 2026-11-27 (kept for the record; the nlu schema is no longer used)
- 2026-11-27 13:45 [`e0a20ad`](https://github.com/ml-circuits-research/webmeet-dataset/commit/e0a20ad) Syntax labels: 1,160 circuits accepted by judges on the fixed sample become labels; 671 rejected circuits recorded
- 2026-11-27 13:33 [`5c45966`](https://github.com/ml-circuits-research/webmeet-dataset/commit/5c45966) Syntax registry: reference circuits rewritten from nlu are kept apart and no longer count as accepted
- 2026-11-27 13:26 [`73dc89e`](https://github.com/ml-circuits-research/webmeet-dataset/commit/73dc89e) Syntax registry: 2,290 reference circuits rewritten from the nlu circuits that judges accepted
- 2026-11-27 11:57 [`6f1b84b`](https://github.com/ml-circuits-research/webmeet-dataset/commit/6f1b84b) Judged readings: 158 changed readings of the fixed 1% sample (plausible standard), 47 accepted and 118 rejected
- 2026-11-27 11:43 [`d8993ec`](https://github.com/ml-circuits-research/webmeet-dataset/commit/d8993ec) Judged readings under the plausible standard: 912 texts of the fixed 1% sample, 197 accepted and 830 rejected circuits
- 2026-11-27 11:24 [`6add49d`](https://github.com/ml-circuits-research/webmeet-dataset/commit/6add49d) Judged readings of the fixed 1% sample: 2,216 accepted and 1,154 rejected nlu circuits (strict standard)
- 2026-11-27 09:51 [`cd70fee`](https://github.com/ml-circuits-research/webmeet-dataset/commit/cd70fee) Convert WebMeet raw drafts for short-diagram-nodes-13-01-3f274e98c466 via deepseek-v4-1-flash-1017
- 2026-11-27 09:47 [`b3c2770`](https://github.com/ml-circuits-research/webmeet-dataset/commit/b3c2770) Convert WebMeet raw drafts for short-diagram-nodes-13-00-5a39590602d5 via deepseek-v4-1-flash-1017
- 2026-11-27 09:42 [`e9cf950`](https://github.com/ml-circuits-research/webmeet-dataset/commit/e9cf950) Convert WebMeet raw drafts for short-diagram-nodes-12-08-634dbfda938f via deepseek-v4-1-flash-1017
- 2026-11-27 09:38 [`4236017`](https://github.com/ml-circuits-research/webmeet-dataset/commit/4236017) Convert WebMeet raw drafts for short-diagram-nodes-12-07-9410d8c0bfd8 via deepseek-v4-1-flash-1017
- 2026-11-27 09:33 [`840515c`](https://github.com/ml-circuits-research/webmeet-dataset/commit/840515c) Convert WebMeet raw drafts for short-diagram-nodes-12-06-b56ae9afe468 via deepseek-v4-1-flash-1017
- 2026-11-27 09:30 [`66ac027`](https://github.com/ml-circuits-research/webmeet-dataset/commit/66ac027) Convert WebMeet raw drafts for short-diagram-nodes-12-05-7f270dd21764 via deepseek-v4-1-flash-1017
- 2026-11-27 09:26 [`24fd6ad`](https://github.com/ml-circuits-research/webmeet-dataset/commit/24fd6ad) Convert WebMeet raw drafts for short-diagram-nodes-12-04-462d36166e59 via deepseek-v4-1-flash-1017
- 2026-11-27 09:20 [`b49668f`](https://github.com/ml-circuits-research/webmeet-dataset/commit/b49668f) Convert WebMeet raw drafts for short-diagram-nodes-12-03-7bd9ddb0809d via deepseek-v4-1-flash-1017
- 2026-11-27 09:16 [`b593521`](https://github.com/ml-circuits-research/webmeet-dataset/commit/b593521) Convert WebMeet raw drafts for short-diagram-nodes-12-02-3a35af7dbeb7 via deepseek-v4-1-flash-1017
- 2026-11-27 09:12 [`c1e12a2`](https://github.com/ml-circuits-research/webmeet-dataset/commit/c1e12a2) Convert WebMeet raw drafts for short-diagram-nodes-12-01-f56cea4f1dd7 via deepseek-v4-1-flash-1017
- 2026-11-27 09:08 [`db718d3`](https://github.com/ml-circuits-research/webmeet-dataset/commit/db718d3) Convert WebMeet raw drafts for short-diagram-nodes-12-00-d83d91f22581 via deepseek-v4-1-flash-1017
- 2026-11-27 09:01 [`b337a2f`](https://github.com/ml-circuits-research/webmeet-dataset/commit/b337a2f) Convert WebMeet raw drafts for short-diagram-nodes-11-00-70846b49f0e1 via deepseek-v4-1-flash-1017

</details>

## Glossary

- **Message**: One text a user typed, such as "make a bar chart of the projects by name please". The dataset holds messages to a drawing app, a diagram tool, a calendar and a document editor.
- **Strategy (formalizer)**: A program that reads one message alone, with no context and no knowledge base, and writes its circuit. Five are measured: vss, spacy, distilbert, prolog, z3 ([what each is](#what-this-project-does)).
- **VSS**: The name of our own reader (`strategies/vss/`). The repository does not expand the letters; its word vectors are those of vector symbolic architectures ([How VSS works](vss-architecture.html)).
- **Circuit**: The syntactic analysis of one message, written as lines of SOP Lang, one line (a wire) per part. Every word of the message has exactly one place in it. There is an example under [What this project does](#what-this-project-does).
- **Wire**: One line of a circuit: a name, a type, and keys that hold words of the message or point to other wires. Example: `@n1 syntax.nominal dependent="the" head="box"`.
- **The four wire types**: **clause**: one verb with everything that belongs to it (one command, statement or question). **nominal**: the words that describe one thing ("the two small red boxes"). **relation**: a tie between two wires, usually through a linking word ("on", "of", "next to"). **coordination**: things or clauses put side by side with "and", "or", "but".
- **Syntax schema**: The rules that say which wires and keys exist and how to use them: 4 wire types and 18 keys ([syntax-schema.md](syntax-schema.md)).
- **SOP Lang**: The line language circuits are written in: each line starts with a name such as `@c1`, then a type and keys with their values. The project writes its other declarations in it too, such as the VSS legend.
- **Judge**: A reviewer that reads a message and one circuit, without knowing which strategy wrote it, and accepts it or rejects it with a grade (L1 to L6), following written rules (`tests/benchmark/syntax/rules.md`). Here the judges are language-model agents; the registry names each one. How often two judges, or a judge and a person, agree on this schema has not been measured yet.
- **Packet**: A file of up to 200 circuits that one judge reads in one go (`judging/packet-N.jsonl` in a run folder); the verdicts go to `judging/verdicts-N.jsonl`. "Judged in packets 45-46" names two such files.
- **Label**: The accepted circuit of a message, kept in the `sop` column of the dataset's syntactic files. Labels are what strategies are measured against and trained on.
- **Gold and silver labels**: Gold: labels a judge accepted or wrote. Silver: labels settled by agreement, which DistilBERT trains on at a lower weight.
- **Agreement**: Two strategies that read from different sources wrote the same circuit for a message. Such a circuit is taken as the label with no judge; a judge reads a random 2% as a control.
- **Audit**: The random share (2%) of the circuits settled by agreement that a judge reads all the same, to measure how often agreement is wrong.
- **Families of strategies**: Strategies that read the same source, for example several variants built on the same spaCy parse, form one family. They agree with each other on 77–100% of messages and repeat the same faults, so agreement counts only between families.
- **Normal form (core)**: A circuit rewritten so that the names of its wires and the order of its lines do not matter. Two circuits with the same normal form, called their core, are the same circuit.
- **Up to attachment**: Two circuits that are equal except for where a phrase with a linking word starts (the clause or a nominal of it); the journal calls it "up to the start of marked relations". The judges' rules allow either place, so such circuits count as agreeing. `attachment=ambiguous` marks a phrase whose place the words do not settle.
- **Registry**: Every circuit a judge has read, accepted or rejected, with the reason (`webmeet-dataset/annotations/syntax/v1/judged`). A circuit is judged once. It also keeps a few agreement circuits with no judge, as accepted readings.
- **Round (conversion round)**: One pass over the next files of the dataset: the strategies write circuits, agreement settles what it can, a judge reads the rest, and the accepted circuits are written into the files.
- **Benchmark**: 1% of the dataset's messages drawn at random (2026-11-27-syntax-benchmark-random, 1,831 messages). Every circuit of every strategy on it is judged. Its messages are held out of training on labels; VSS learns its stations from raw text that includes them, without labels. Some rules were found by reading its rejected circuits, so it is no longer an unseen sample; a fresh sample is planned.
- **Levels and GOAL**: L0 no valid circuit; L1–L6 rejected, with the judge's grade; L7 unused; L8 accepted; L9 equal to the earlier label; L10 accepted and replacing the earlier label. GOAL is the share of messages at L8, L9 or L10.
- **95% interval**: The range in which the true share most likely lies, given how many messages were measured (the Wilson score interval). On 1,831 messages it is about ±2 points, so a difference of 1 or 2 points between two separate measurements can be chance.
- **Station (VSS)**: A class of words that VSS learns from raw text by the company words keep and by their order, with no labels. VSS reads a message as a path through stations; then its rules build the circuit.
- **EM (expectation–maximization)**: How VSS's station tagger is trained: it guesses which station each word stands at, counts, and guesses again, round after round, from raw text with no labels.
- **Linker (VSS)**: The part of VSS that builds clauses, relations and coordinations from the words and their stations, by rules with thresholds, in one pass.
- **Drawing, diagram and calendar analyses**: Studies of the faults VSS makes on the files of one area of the dataset: agents read a sample of VSS circuits and proposed general rules, which were then added to VSS.
- **Lever trial**: An experiment on a copy of VSS that adds one learned aid, judged against the same copy without it on the same benchmark messages. A lever is a change beyond adding single rules.
- **Station prior**: A lever trial: VSS's station tagger trained again with the accepted circuits mapped to stations, as a weighted starting point.
- **DistilBERT evidence**: A lever trial: a per-word table learned from DistilBERT's circuits says how a word is used (verb, word of a nominal, modifier, marker, other). Where the table is sure and VSS disagrees, VSS keeps the word off the stations the table rules out. "On the verb" uses it for the verb only; "on roles" for all five uses.
- **Checkpoint**: The saved weights of a trained model; syntax-v2 is the DistilBERT checkpoint measured now.
- **Epoch**: One pass of training over all training examples.
- **Development messages**: Labelled messages kept out of training to choose settings and check progress while training. They are not the benchmark.
- **Held out**: Kept out of training on labels, so that a measurement on those messages is fair.
- **Parked**: Still measured on the benchmark, but not improved for now (owner's decision): prolog and z3.

---

Built in 14.2 s from the repositories as they are, and from the hand-written files `docs/status/now.md` and `docs/status/history.json`. "Uncommitted paths" counts the entries of `git status`, where a new folder counts once.
