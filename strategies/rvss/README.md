# rvss: runs and measurements

rvss reads a message by syntax only: a left-to-right pilot places one word per move into open constellations
(DESIGN.md, third revision); its decisions are scored by VSA prototypes (phases are the parameters); the circuit
is read back from the pilot's stars. No word list, tagger, parser or transformer is used at reading time. This page
records every training run, its settings and its numbers. The design is in `DESIGN.md`; the training data in
`data/README.md`; the evaluation scripts in `eval/BASELINES.md`.

**The first aim of the sprint:** distillation. rvss learns to write the circuits the spaCy strategy writes, on
every message outside the benchmark, and is measured against spaCy on held-out files (dev-B), on the old fixed
benchmark (known accepted, a lower bound) and on a fresh random file-level sample.

**Commits.** Every number names the data it was computed on:

| Name | What |
| --- | --- |
| dataset c6b11f6 | `webmeet-dataset` when the sets were built (2026-11-27); messages, splits, labels and benchmark exclusions come from it |
| dataset 44fcebe | `webmeet-dataset` HEAD on 2026-11-28; the registry decisions (`judged`), the old benchmark's verdicts and the fresh sample come from it |
| targets eb576f9 | spaCy's circuits written by the spaCy writer at eb576f9 (round 6); runs of 2026-11-28 before 07:25 trained on them |
| dataset cd17b12 | `webmeet-dataset` after the re-split of 2026-11-28 (no file over 100 messages, 1,886 files; paths and rows changed, texts did not). The sets here are unchanged by it: every line carries its message's text and its split, and every lookup is by text (texts are unique). dev-B and train are therefore the text-keyed lines of `distill.jsonl.gz` (dev-B: 15,104 texts), never re-derived from file paths; `build-sets.mjs`, which derives the split from paths, must not be run again for these sets |
| dataset 3992284, 1899af0 | after the old benchmark was rejudged for spaCy (round 12) and for rvss vsa2p16-d9f (all 1,831 circuits); the `benchmark-cd17b12/` recounts and vsa2k2hmm-d9f's benchmark row are at 1899af0 |
| targets 9f76a39 | spaCy's circuits written by the writer at 9f76a39 (HEAD, rounds 7 and 8), from the same recorded parses; runs after 09:00 train on them |

## How to read the numbers

| Measure | What it counts |
| --- | --- |
| TF act | teacher forcing: share of the pilot's decisions right when every earlier decision is the gold one (dev-B, every message) |
| TF all-acts | messages whose every decision is right under teacher forcing |
| exact / relaxed / variants | free running (the pilot reads alone): share of dev-B messages whose circuit equals spaCy's: the same normal-form core / up to where a marked relation starts / up to what the judges' rules let pass either way |
| valid | the circuit passes `validateSyntax` |
| known accepted | old benchmark (1,831 messages, 2026-11-27): circuits a judge or the registry accepted, of all 1,831; a lower bound, since rvss circuits that differ from every judged one are unjudged |
| ms | median ms per message on the CPU, one process, one thread |

dev-B is 24 whole files (15,104 messages) held out of training; 15 of them are parts of files whose other parts are
in train. spaCy is 100% equal to itself by definition; on the old benchmark it is 94.6% known accepted.

## What the first builder did (2026-11-27 23:00 to 2026-11-28 07:25)

Reconstructed from the logs in `.local-data/rvss/model/` and `runs/`; the builder died in the machine freeze of
07:25 without writing a report.

**Data.** `prep.py` turned the derived moves into teacher-forced decision examples: 165,098 train and 15,077 dev-B
messages, 5,339,637 train decisions ("acts"), 214,123 choice groups (claim, reopen, point, gather). View 1: the
word part reads the window -3..+3; view 2 (`distill2`, `--view 2`): -3..+4 and the grandparent's opener in the stack
part (174.5 M terms against 152.9 M).

**Models.** `vsa`: the VSA pilot of `net.py` (D = 1024 complex phases, C = 64 learned kind stars, P = 4 prototypes
per outcome and part, 10 parts; 1.91 M parameters, 7.4 MB). `logreg`: the non-VSA control, a logistic regression
over hashed symbolic features of the same view (atom, offset, lowercased word, last three letters, the incoming
word; `--triples` adds atom x word x incoming word); 2^21 x 41 weights (98.6 M, 376 MB).

**M2a (keys with the grouping given, `m2a.py`, 60,000 train messages, 15 min).** Route book 96.71% of stars keyed
right (words 95.12%, held wires 99.33%, messages with all keys right 59.7%) against the logistic control's 95.04%
(92.42%, 99.36%, 47.5%). Ablations: without the beacon 61.5%, without the opener 83.9%, without the pair 91.2%,
without the path 91.7%, without the backward drawing 92.2%. This is the one place where the VSA beat the control.

**M2b/M2c (the pilot, targets eb576f9, dataset c6b11f6; benchmark verdicts as of 2026-11-28 morning).**

| Run | Model, view, settings | TF act | TF all-acts | dev-B exact | relaxed | variants | valid | known accepted (old benchmark) | = spaCy exact (benchmark) | ms (decode, 16 workers) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| logreg-distill | logreg, view 1, 3 epochs, lr 0.003 | 0.9684 | 0.576 | 55.3% | 63.6% | 64.2% | 97.3% | 1229 (67.1%) | 58.6% | 2.8 |
| logreg3-distill | logreg + triples, view 1, 3 epochs | 0.9704 | 0.598 | 57.2% | 65.2% | 65.7% | 97.3% | 1260 (68.8%) | 60.7% | 3.3 |
| logreg2t-distill | logreg + triples, view 2, 3 epochs | 0.9709 | 0.601 | 57.5% | 65.4% | 66.0% | 97.4% | 1269 (69.3%) | 61.2% | 3.9 |
| vsa-distill | vsa, view 1, 3 epochs, lr 0.02 | 0.9646 | 0.548 | 52.9% | 61.5% | 61.9% | 98.9% | 1136 (62.0%) | 53.1% | 35.8 |
| vsa2-distill | vsa, view 2, 2 epochs | 0.9616 | 0.526 | 50.8% | 59.2% | 59.7% | 99.0% | 1086 (59.3%) | 50.8% | 22.8 |
| vsa2-mixed | vsa, view 2, 2 epochs, labels replace spaCy's line where a message has one | 0.9517 | 0.377 | 36.0% | 47.2% | 58.0% | 98.7% | 1070 (58.4%) | 40.1% | 22.3 |
| vsa2s-distill | vsa + situation memory (256 stars), view 2 | 0.9390 at step 2,000 (vsa2: 0.9393) | 0.411 | not finished (machine froze) | | | | | | |
| vsa8-distill | vsa, view 1 (other settings not recorded) | started 07:22, nothing logged | | | | | | | | |
| vsa128-distill | vsa (settings not recorded) | stopped by the kernel at 00:14 (out of memory), nothing logged | | | | | | | | |

On the messages of at most 12 words (10,298 of dev-B; `measure-le12.sh`): logreg2t-distill 61.7% exact, vsa-distill
58.4%, vsa2-distill 55.7%; models trained only on those messages: logreg2t-le12 59.9% (TF act 0.9651), vsa2-le12
56.2% (TF act 0.9599). Training on the short messages alone did not help either model.

A beam of 4 (`decode.py --beam 4`, an early model, 1,000 dev-B messages): exact 40.1% against 40.7% greedy.

By length (dev-B, exact): vsa2-distill 60.5% (<10 words), 41.9% (10-24), 14.3% (25-39), 0 of 14 (40+);
logreg2t-distill 66.2%, 49.9%, 22.1%, 1 of 14. The most frequent teacher-forced confusions (logreg3-distill): open
a relation against close the nominal (1,250 + 922), dependent against head (971 + 751), and spaCy's
`attachment=ambiguous` mark against none (745 + 572), which depends on spaCy's beam, not on the words.

**What it found.** The VSA pilot learns the moves (TF act 0.96) but stays about one point of act accuracy and 5 to
7 points of exact equality below the logistic control on the same view, with 1/50 of the size. Labels mixed into
the training (vsa2-mixed) lower equality with spaCy without raising known accepted. The situation memory gave
nothing by step 2,000. The VSA writes more valid circuits (99.0% against 97.4%). Several trainings then ran at once
on the GPU and the machine froze (`tools/README.md`).

## Targets refreshed to the writer at 9f76a39 (2026-11-28)

`data/refresh.mjs` replaces spaCy's circuit in every line of the sets with the circuit the writer at 9f76a39 writes
from the same recorded parses (`data/rewrite.mjs`, a `git archive` copy of HEAD in `code/spacy-9f76a39/`), keeping
every message, split and benchmark exclusion as they are (built on dataset c6b11f6; `build-sets.mjs` is not run
again, since the dataset has moved). `judged` is the registry's decision on the new circuit at dataset 44fcebe. The
eb576f9 sets are kept in `.local-data/rvss/at-eb576f9/`.

| Count (refresh.json) | Value |
| --- | ---: |
| lines of distill (train + dev-B) | 181,450, none dropped (the writer at 9f76a39 writes a circuit for every one) |
| circuits changed as written | 1,847 (1.02%): train 1,717, dev-B 130 |
| changed in the normal-form core | 1,755 (0.97%): train 1,626, dev-B 129 |
| changed, by length (train + dev-B, core) | <10 words 661, 10-24 860, 25-39 191, 40+ 43 |
| spaCy lines of mixed replaced | 93,491; label lines kept 87,959 (label equal to spaCy's core: 45,977 before, 45,970 now) |
| registry decisions on the new circuits (dataset 44fcebe) | train 2,081 accepted, 93 rejected; dev-B 832 accepted, 285 rejected |
| moves derived and replayed identically | distill train 165,123 of 166,346 (99.265%), dev-B 15,078 of 15,104 (99.828%) |
| teacher-forced examples (`d9f2`, view 2) | 165,123 train messages, 5,339,778 acts; 15,078 dev-B messages, 398,097 acts |

The refresh moves little: the old models scored against the new targets change by at most 0.2 points (dev-B exact:
vsa2-distill 50.8% to 51.0%, logreg2t-distill 57.5% to 57.5%, vsa-distill 52.9% to 53.1%). The ninth-round repair
of the writer, if it is not yet committed, is not in these targets.

Commands (from `soplang-nlu/`, 2 minutes in all):

```sh
C=.local-data/rvss/code/spacy-9f76a39; mkdir -p $C
git archive 9f76a39 lib schemas worlds package.json strategies/spacy strategies/spacy-beam strategies/spacy-direct \
  strategies/neural-dependencies | tar -x -C $C
node strategies/rvss/data/rewrite.mjs .local-data/rvss/spacy-run-0f20f16/run.jsonl --code $C \
  --out .local-data/rvss/spacy-run-0f20f16/rewritten-9f76a39.jsonl
node strategies/rvss/data/refresh.mjs --rewritten .local-data/rvss/spacy-run-0f20f16/rewritten-9f76a39.jsonl --commit 9f76a39
#   then distill/mixed/spacy-silver.jsonl.gz moved from at-9f76a39/ to .local-data/rvss/ (the eb576f9 ones to at-eb576f9/)
node strategies/rvss/data/moves.mjs --threads 4
node strategies/rvss/model/export.mjs
python strategies/rvss/model/prep.py .local-data/rvss/model/distill.jsonl .local-data/rvss/model/d9f2 --workers 4 --view 2
```

## Runs on the refreshed targets

**In short (2026-11-28, targets 9f76a39, dev-B of dataset c6b11f6 kept by text).** The design run with the second
level of kinds and the HMM kinds, **vsa2k2hmm-d9f** (P = 4, 1.9 M parameters, 7.9 MB, 13.2 ms per message on one CPU
thread), reaches the control under teacher forcing (TF act 0.9703 against 0.9709) and in free running on dev-B
(exact 57.8% against 57.9%; relaxed 67.3% against 65.9%; words placed right 91.1% against 88.8%; valid 99.3% against
97.5%), from 51.0% exact for the first builder's vsa2. spaCy is 100% by definition and takes 109.9 ms and 477.5 MB.
It is still far from the goal: 57.8% of held-out messages equal to spaCy's circuit, 22.3% at 25-39 words; on the
fully judged old benchmark the best judged rvss run (vsa2p16-d9f) is accepted on 83.0% against spaCy's 94.6%.
**Next step:** the open and close decisions at a distance (open at 8+ words 0.896, close 0.94-0.96) and reopen
(0.43): training on the pilot's own moves (roll-in, DESIGN 9.4) and a beam scored by fit (DESIGN 10) with the
current model; then the route book inside the pilot and condensed constellation stars as its state (below).

One training at a time, every one started with `tools/gpu-run.sh` (40% GPU cap); decoding and measuring on the
CPU, at most 4 processes. Targets 9f76a39; dev-B equality against those targets; the old benchmark's verdicts at
dataset 44fcebe. No job was stopped by the watchdog (`~/.local/state/soplang-memwatch.log` holds only its start).
Training alone on the GPU is fast: 2 epochs of the P = 4 pilot in 13 min, 3 epochs of P = 16 in 24 min, the control
in 4 min (the 26 to 43 min of the first builder's runs came from several jobs sharing the GPU).

### The changes tried

| Change | Where | What |
| --- | --- | --- |
| `--lex` | `net.py` `kinds` | the word's own fixed star (identity and letter trigrams) added to its kind with a learned weight, so prototypes can answer to a word form, as the control's features do |
| `--C 256` | | 256 kind stars instead of 64 |
| `--P 16` | | 16 prototypes per outcome and part instead of 4 (more capacity in the decisions) |
| `--k2 64` | `net.py` `kinds` | kinds of kinds: the window -3..+3 of the first-level kinds, permutation-coded as the words are, cleaned up against 64 learned stars and added to the kind with a learned weight; a word's kind then also tells the context up to six words away (DESIGN 5.4, a second level of constellation) |
| `--hmm <stations.jsonl>` | `net.py` `kinds`, `data/stations.mjs` | the HMM half (owner, 2026-11-28): each word's posterior over the 25 stations of hmm-rules' station HMM, bundled from fixed station stars, enters the kind window with 7 learned weights (section below) |

The numpy decoder (`decode.py`) computes the same kinds as the trainer (checked: largest difference 1.4e-6 on a
random model with `--lex` and `--k2`; 9.6e-7 with `--k2` and `--hmm`).

### Results (dev-B, 15,104 messages; old benchmark, 1,831 messages)

All runs: view 2, D = 1024, C = 64 unless named, batch 96, lr 0.02 (VSA) / 0.003 (control), seed 1. TF = teacher
forcing on all of dev-B. ms = median per message through `index.mjs` on the CPU, one thread, 400 benchmark
messages, `speed.mjs`, the same session (load 3 to 8 of 20 CPUs); MB = what the strategy loads besides code.
Known accepted counts the old benchmark's verdicts and the registry at dataset 44fcebe (the first builder's rows
above used the verdicts of the morning).

| Run | Settings | TF act | TF all-acts | dev-B exact | relaxed | variants | valid | word placement | exact <10 / 10-24 / 25-39 words | known accepted (old benchmark) | = spaCy exact (benchmark) | ms | MB |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| spaCy | the reference (parser + writer 9f76a39) | | | 100% | 100% | 100% | 100% | 100% | 100 / 100 / 100 | 1732 (94.6%, 0f20f16) | 100% | 109.9 | 477.5 |
| logreg2t-d9f | control: logreg + triples, 3 epochs | 0.9709 | 0.605 | 57.9% | 65.9% | 66.4% | 97.5% | 88.8% | 66.7 / 50.1 / 23.4 | 1275 (69.6%) | 62.2% | 5.0 | 376 |
| vsa2-distill (old targets) | first builder's vsa2, P = 4, 2 epochs, scored on the new targets | 0.9616 | 0.526 | 51.0% | 59.5% | 59.9% | 99.0% | 87.4% | 60.9 / 42.0 / 14.3 | 1086 (59.3%, morning verdicts) | 50.8% | (vsa-distill 16.0, 05:50 session) | 7.4 |
| vsa2lex-d9f | `--lex --C 256`, P = 4, 2 epochs (dropped) | 0.9620 | 0.528 | 51.0% | 59.0% | 59.5% | 98.8% | 87.3% | 59.9 / 42.9 / 17.5 | 1122 (61.3%) | 53.6% | 19.5 | 8.2 |
| vsa2p16-d9f | `--P 16`, 3 epochs (capacity only) | 0.9663 | 0.562 | 54.3% | 63.0% | 63.4% | 99.1% | 88.8% | 64.0 / 45.6 / 18.4 | 1171 (64.0%) | 55.2% | 30.1 | 28.1 |
| vsa2p16k2-d9f | `--P 16 --k2 64`, 3 epochs | 0.9695 | 0.590 | 56.9% | 65.9% | 66.3% | 99.0% | 90.1% | 66.3 / 48.4 / 22.8 | 1218 (66.5%) | 58.7% | 30.2 | 28.4 |
| **vsa2k2-d9f** | `--k2 64`, P = 4, 3 epochs (follows the design) | 0.9686 | 0.583 | 56.2% | 65.0% | 65.5% | 98.9% | 89.7% | 66.0 / 47.4 / 17.5 | 1198 (65.4%) | 57.2% | 19.4 | 7.7 |
| **vsa2k2hmm-d9f** | `--k2 64 --hmm`, P = 4, 3 epochs (design + HMM kinds) | 0.9703 | 0.601 | 57.8% | 67.3% | 67.6% | 99.3% | 91.1% | 67.9 / 48.5 / 22.3 | not measured at 44fcebe | 58.1% | 13.2 | 7.9 |

Model sizes: the VSA pilot at P = 4 has 1.9 M phases and scalars (7.4-8.2 MB with its atom list); at P = 16, 7.1 M
(28 MB); the control 98.6 M weights (376 MB); spaCy's `en_core_web_trf` 477.5 MB.

**The fresh sample** (`draw-sample.mjs --seed 2026-11-28-rvss --share 0.01`, dataset 44fcebe: 2,022 messages from 22
files; folder `.local-data/rvss/fresh-2026-11-28-rvss/`). spaCy's targets are its current circuits (writer 9f76a39,
from the recorded parses: all 2,022 texts are in them). **1,748 of the 2,022 messages are training messages of
rvss** (whole files of the train split), 255 are dev-B and 19 were left out as benchmark copies; only 274 are held
out. The table gives equality with spaCy (exact) on each part:

| Run | held out: dev-B part (255) | held out: benchmark copies (19) | training messages (1,748) | all (2,022) | relaxed, all | rvss circuits differing from spaCy and unjudged |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| logreg2t-d9f (control) | 160 (62.7%) | 12 | 1397 (79.9%) | 1569 (77.6%) | 86.1% | 398 |
| vsa2-distill (old targets) | 142 (55.7%) | 10 | 820 (46.9%) | 972 (48.1%) | 63.4% | 946 |
| vsa2lex-d9f | 141 (55.3%) | 12 | 930 (53.2%) | 1083 (53.6%) | 67.1% | 855 |
| vsa2p16-d9f | 155 (60.8%) | 12 | 915 (52.3%) | 1082 (53.5%) | 69.0% | 840 |
| vsa2p16k2-d9f | 167 (65.5%) | 12 | 1011 (57.8%) | 1190 (58.9%) | 73.7% | 749 |
| **vsa2k2-d9f** | 156 (61.2%) | 12 | 954 (54.6%) | 1122 (55.5%) | 71.9% | 799 |
| **vsa2k2hmm-d9f** | 159 (62.4%) | 13 | 1004 (57.4%) | 1176 (58.2%) | 73.2% | 740 |

The unjudged circuits are listed for judges in `fresh-2026-11-28-rvss/<run>-unjudged.jsonl` ({n, id, text, sop in
normal form, split}, one line per message and circuit); circuits equal to spaCy's, or already decided in the
registry, are left out. By length the fresh sample (all 2,022, mostly training messages) gives, exact: control 85.8% /
69.4% / 41.0% (<10 / 10-24 / 25-39 words), vsa2p16k2-d9f 68.0% / 49.1% / 21.0%.

### Training fit against held-out files

Teacher forcing on 2,000 train messages (every 37th) against the first 2,000 dev-B messages (`train.py --eval-only
--eval-train 2000`, on the CPU):

| Model | TF act, train | all-acts, train | TF act, dev-B | all-acts, dev-B |
| --- | ---: | ---: | ---: | ---: |
| logreg2t-d9f (control) | 0.9922 | 0.806 | 0.9471 | 0.430 |
| vsa2lex-d9f | 0.9707 | 0.504 | 0.9357 | 0.356 |
| vsa2p16-d9f | 0.9738 | 0.528 | 0.9415 | 0.377 |
| vsa2p16k2-d9f | 0.9760 | 0.563 | 0.9478 | 0.422 |
| vsa2k2-d9f | 0.9744 | 0.544 | 0.9443 | 0.409 |
| vsa2k2hmm-d9f | 0.9746 | 0.555 | 0.9477 | 0.441 |

The gap between training and held-out messages is what tells generality. The control fits its training messages
almost perfectly (0.9922) and loses 4.5 points on held-out files; the VSA pilot loses 2.7 to 3.5 points. On held-out
files the design run with HMM kinds (vsa2k2hmm-d9f, 1.9 M parameters) equals the control (98.6 M) on these 2,000
messages (0.9477 against 0.9471; all-acts 0.441 against 0.430). On the fresh sample (above) the control equals
spaCy on 79.9% of the training messages and 62.7% of the held-out dev-B ones; vsa2k2hmm-d9f on 57.4% and 62.4%.
The control's lead on dev-B totals and the old benchmark comes in large part from memorised templates.

By construct of spaCy's circuit (dev-B, exact equality; a message counts in every row whose construct it has):

| Construct (messages) | control logreg2t-d9f | vsa2lex-d9f | vsa2k2-d9f | vsa2p16k2-d9f | vsa2k2hmm-d9f |
| --- | ---: | ---: | ---: | ---: | ---: |
| all (15,104) | 57.9% | 51.0% | 56.2% | 56.9% | 57.8% |
| no relation (3,150) | 72.5% | 66.7% | 72.9% | 72.6% | 75.5% |
| 1-2 relations (9,087) | 59.3% | 52.2% | 58.0% | 58.9% | 58.9% |
| 3+ relations (2,867) | 37.6% | 30.1% | 32.3% | 33.3% | 34.7% |
| 2+ clauses (7,979) | 52.4% | 44.7% | 49.6% | 51.0% | 51.5% |
| coordination (4,727) | 39.0% | 33.1% | 36.7% | 37.7% | 38.7% |
| nominal with 3+ dependents (914) | 45.8% | 33.7% | 42.8% | 42.1% | 43.2% |
| spaCy marks `attachment=ambiguous` (2,188) | 46.0% | 40.7% | 45.0% | 46.2% | 45.7% |

The kinds of kinds closed most of the gap on nominal groups (33.7% to 42.8%) and coordination; the HMM kinds then
lifted the messages without relations above the control (75.5% against 72.5%) and closed part of the gap on many
relations. Long messages with many relations stay the weakest part (3+ relations: 34.7% against the control's
37.6%; 25-39 words: 22.3% against 23.4%).

**The old benchmark, fully judged for one run.** At dataset 3992284 the owner's judges judged every circuit of
vsa2p16-d9f on the 1,831 benchmark messages: **1,520 accepted (83.0%)**, 294 rejected, none left unjudged (GOAL
levels L1 107, L3 129, L6 40, as the coordinator reports). This is the one rvss acceptance with no unjudged part;
spaCy's was 94.6% on the same messages (writer 0f20f16). Recounted at dataset 1899af0, the other runs' known
accepted (a lower bound, raised wherever their circuit equals one judged for vsa2p16-d9f or spaCy): control 1,369
(74.8%, 371 unjudged), vsa2k2hmm-d9f 1,354 (73.9%, 388), vsa2p16k2-d9f 1,372 (74.9%, 356), vsa2k2-d9f 1,351 (73.8%,
383), vsa2lex-d9f 1,255 (68.5%, 490), vsa2-distill 1,245 (68.0%, 470) (`runs/<run>/benchmark-cd17b12.md`, written
at 1899af0). These lower bounds depend on which circuits happen to have been judged; only fully judged runs compare.

### Decisions by kind and by distance (held out: dev-B, teacher forcing)

Accuracy of each decision family when every earlier decision is the gold one (`train.py --eval-only --by-decision`,
all 398,097 decisions of dev-B). A decision counts right when the pilot's choice equals the gold move exactly (an
open of the right type and key; a close with the right mark). Distance = words between the current word and the
opener of the wire the decision acts on (the top constellation); "after the last word, or no wire open" are the
decisions at the end of the message or with only the message open. Claim, reopen and point also choose an item:
"which item" is that choice given the gold decision.

| Decision, distance | n | control | vsa2k2-d9f | vsa2k2hmm-d9f |
| --- | ---: | ---: | ---: | ---: |
| all | 398,097 | 0.9709 | 0.9686 | 0.9703 |
| open, all | 105,190 | 0.9654 | 0.9604 | 0.9637 |
| open, 1 | 43,117 | 0.9736 | 0.9695 | 0.9704 |
| open, 2-3 | 20,553 | 0.9443 | 0.9402 | 0.9467 |
| open, 4-7 | 7,514 | 0.9332 | 0.9196 | 0.9257 |
| open, 8+ | 1,856 | 0.9057 | 0.8863 | 0.8960 |
| close, all | 111,772 | 0.9658 | 0.9629 | 0.9623 |
| close, 1 | 17,425 | 0.9630 | 0.9602 | 0.9603 |
| close, 2-3 | 25,750 | 0.9509 | 0.9433 | 0.9424 |
| close, 4-7 | 14,824 | 0.9525 | 0.9552 | 0.9526 |
| close, 8+ | 6,489 | 0.9701 | 0.9633 | 0.9576 |
| place, all | 163,698 | 0.9816 | 0.9804 | 0.9827 |
| place, 8+ | 2,528 | 0.9241 | 0.9324 | 0.9387 |
| claim, all | 10,590 | 0.9703 | 0.9786 | 0.9808 |
| claim, 4-7 | 137 | 0.8905 | 0.8613 | 0.8905 |
| claim: which item | 10,590 | 0.9939 | 0.9986 | 0.9990 |
| gather (coordination), all | 5,589 | 0.9363 | 0.9445 | 0.9495 |
| gather, 4-7 / 8+ | 671 / 216 | 0.8077 / 0.6944 | 0.8420 / 0.7361 | 0.8778 / 0.7870 |
| reopen, all | 747 | 0.4859 | 0.4552 | 0.4270 |
| reopen: which wire | 747 | 0.7898 | 0.8501 | 0.8273 |
| point, all | 511 | 0.8513 | 0.8826 | 0.8787 |

The full tables are in `.local-data/rvss/model/<run>/by-decision.json`. Opening and closing wires are where the
pilot still loses to the control, and they get worse with distance (open at 8+ words: 0.896); the VSA pilot is better
at claims, gathers and pointers. Reopen (a finished wire taking a later word, 747 decisions) is right less than half
the time for every model; it is rare but each error breaks a circuit.

## The owner's direction (2026-11-28) and what of DESIGN.md is built

The owner asked that rvss be built by the constellation-of-constellations design (DESIGN.md, third revision),
learning from both the HMM and the VSA, with no device that only adds memorising capacity, and that every added
weight have a role in the design; the logistic control stays a reference number, not a target; generality is
measured on held-out files and the fresh sample.

**What changed for it.**

- `--lex` (the word's own identity star in its kind) and `--C 256` are dropped: they add memorising capacity with no
  role in the design (and gave no gain on dev-B). `--P 16` (16 prototypes per outcome instead of 4) is reported but
  not kept as a direction for the same reason; the runs below that keep P = 4 are the ones that follow the design.
- `--k2` is kept: it is the design's second level of kinds (a kind of a window of kinds, condensed by the same
  cleanup), 64 learned stars and 10 scalars.
- `--hmm` is added: the HMM half. `data/stations.mjs` runs the hmm-rules station HMM (`strategies/hmm-rules/model/model.json`,
  Baum–Welch on the raw text; its legend names only function words) by forward–backward over each sentence, with
  the HMM alone (no bans, no prototypes, no verb budget), and gives every word its posterior over the 25 stations.
  The posterior is bundled from 25 fixed station stars and enters the kind window beside the word stars
  (DESIGN 5.7's `x_k`), with one learned weight per window position (7 scalars). Nothing else is learned for it.
  At reading time `index.mjs` computes the posteriors in JavaScript and sends them with the words; the batch
  decoder reads them from `.local-data/rvss/model/stations.jsonl` (all 182,042 texts of the sets, the old
  benchmark and the fresh sample: 2,411,036 words, every one overlapped by a hmm-rules token; 16 s).

**DESIGN.md, part by part.**

| Part (section) | State |
| --- | --- |
| tree of wires, moves, oracle with the adopted conventions, replay (4, 8.2-8.7) | built (`core.py`, `data/moves.mjs`, `hierarchy-checks/v2/oracle2.mjs`); 99.27% of spaCy's circuits derive and replay |
| fixed word stars from form and letter trigrams; smooth positions Z_s (5.2, 5.3) | built |
| kinds from the permutation-coded window, cleanup against 64 learned stars (5.7) | built; the first-word and last-mark terms of `x_k` are not |
| HMM kinds from the station HMM (owner, 2026-11-28; docs/rvss/hmm-plus-vsa.md) | built (`--hmm`); one run: TF act 0.9686 to 0.9703, dev-B exact 56.2% to 57.8% |
| kinds of kinds (5.4, 5.7 second memory) | built as a second level over the window of word kinds (`--k2`); the design's kind of a closed constellation from its condensed star `s(Y)` is not built |
| decisions scored by parts against prototypes (8.5); choices among stars (8.6) | built |
| constellations, condensing `c(X) = rho(phase(C_X))`, atlas, read-back by the m1star decoder (5.4-5.6, 6) | built at the output: the circuit is read back from the pilot's own constellations and atlas; 99.4-99.6% of decoded messages read back the same as the explicit tree |
| the pilot reading condensed stars as its state | missing: the pilot's views are bundles of symbolic state atoms (types, keys, distances of the open, held and last wires) bound with kinds, not the condensed constellation stars |
| route book inside the pilot: keys from the opener, pair of kinds, path, backward at a claim, beacon, vote, cleanup against named key stars; key–value memories A, B, L (7) | built only in the M2a test (`m2a.py`, grouping given: 96.71% against the control's 95.04%); the pilot places a key as one outcome among its moves |
| situation memory (9.1) | built (`--sit`), no gain at step 2,000 (first builder), not kept |
| roll-in with the pilot's own moves (9.4), beam scored by fit (10), re-placement, bottom-up reader | missing (a plain beam of 4 was tried early: no gain) |
| judged weights, negatives from rejected circuits (M3) | missing (labels mixed in lowered equality with spaCy, vsa2-mixed) |

## Files

| File | What |
| --- | --- |
| `model/core.py`, `prep.py` | the pilot's state, moves and views; teacher-forced examples |
| `model/net.py`, `train.py` | the VSA pilot and the logistic control; training (`--k2`, `--hmm`, `--lex`, `--dev`, `--eval-train` added on 2026-11-28; `RVSS_TRAIN_DEVICE=cpu` for a CPU check) |
| `model/decode.py`, `worker.py`, `index.mjs`, `writer.mjs` | free running on the CPU and the strategy module |
| `data/refresh.mjs` | the sets with a newer spaCy writer, splits and exclusions kept |
| `data/stations.mjs` | the station HMM's posterior per word (forward–backward); `.local-data/rvss/model/stations.jsonl` |
| `eval/measure-fresh.sh` | decode a run on the fresh sample, equality with spaCy by split, the unjudged list |
| `eval/fresh-sample.mjs` | inputs, spaCy targets and the unjudged list for a fresh file-level sample |
| `.local-data/rvss/model/<run>/`, `<run>.log` | models and training logs |
| `.local-data/rvss/runs/<run>/` | decoded outputs and the harness's reports |
