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
| targets 195075d | spaCy's circuits written by the writer at 195075d (round 12; the spaCy code is the same at HEAD 4b000ab), from the same recorded parses; the sets were refreshed at 11:20 and every run of the afternoon trains and is measured on them; registry decisions (`judged`) at dataset 476f7b7 |

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

## Evening sprint (2026-11-28, from 12:50): the general corpora, targets at 3f13f69, the route book

**In short.** spaCy (HEAD 3f13f69, round 15) wrote circuits for the 65,494 messages of `syntactic/general/` (CLINC150, SGD,
SNIPS, generated); 62,195 went into training (origin `general`) and 3,296 (33 whole files, about 5% of every folder)
into **dev-G**, a held-out set outside webmeet (`data/README.md`, "The general corpora"). The webmeet targets moved to the
3f13f69 writer (3,885 circuits changed, 2.1%); dev-B and the old benchmark are the same texts. One more epoch from
vsa2k2hmm-dag12 on webmeet + general, **vsa2k2hmm-g15 with beam 4**, equals spaCy on **57.8% of dev-G** (dag12: 40.2%, the
same epoch on webmeet only: 40.7%) and **60.8% of dev-B** (dag12 on the same targets 59.4%, webmeet-only epoch 60.5%).
Outside webmeet the logistic control (98.6 M weights) reaches only 24.5%: its dev-B lead was memorised templates.
The route book inside the pilot (`--rb`, DESIGN 7) gives no gain under teacher forcing; free running is being measured.

### Results (targets 3f13f69; dev-B 15,104 messages; dev-G 3,296; beam 4 for the VSA runs)

| Run | TF act (dev-B) | TF all-acts | dev-B exact | relaxed | valid | exact <10 / 10-24 / 25-39 | dev-G exact | dev-G relaxed | dev-G valid | dev-G exact <10 / 10-24 / 25-39 |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |
| logreg2t-d9f (control, scored on the new targets) | | | 57.2% | 65.2% | 97.5% | 66.4 / 49.1 / 19.5 | 24.5% | 31.0% | 92.7% | 33.9 / 10.2 / 0 of 24 |
| vsa2k2hmm-dag12, beam 4 (scored on the new targets) | | | 59.4% | 68.8% | 99.7% | 69.6 / 50.4 / 17.2 | 40.2% | 50.3% | 99.0% | 50.9 / 23.9 / 0 of 24 |
| vsa2k2hmm-ft15 (+1 epoch, `d15`: webmeet only) | 0.9721 | 0.618 | 60.5% | 70.0% | 99.6% | 69.8 / 52.2 / 23.2 | 40.7% | 51.0% | 98.6% | 51.5 / 24.1 / 4.2 |
| **vsa2k2hmm-g15** (+1 epoch, `d15g`: webmeet + general) | 0.9727 | 0.623 | **60.8%** | **70.3%** | 99.7% | 70.0 / 52.8 / 23.4 | **57.8%** | **68.2%** | 99.4% | 69.2 / 40.4 / 12.5 |
| vsa2k2hmm-g15rb (as g15, `--rb 256`) | 0.9726 | 0.622 | measuring | | | | | | | |

dev-G by corpus (exact): dag12 clinc150 47.4%, sgd 41.3%, snips-nlu-benchmark 26.0%, snips-built-in 33.0%, generated
37.1%; g15 61.8%, 59.6%, 50.7%, 42.0%, 45.4%. Old benchmark (held out, registry of now, a lower bound): g15 1,532 known
accepted (83.7%, 157 unjudged), = spaCy exact 59.5%; ft15 1,369 (74.8%, 377 unjudged, read earlier against an older
registry). Speed and size as vsa2k2hmm-dag12 (45.6 ms per message with beam 4, 8 MB).

**The route book inside the pilot (`--rb M`, `net.py` `rb_logits`, `decode.py` `rb_scores`).** For the constellation the
pilot fills and for the one below it (the receiver after a close), the pair code of its opener and the incoming word,
q = T_type ⊗ κ(opener) ⊗ ρ_q(κ(word)), is read against M learned key stars (a key–value memory, DESIGN 7.1); the values
beside the keys are the gate numbers of every move (DESIGN 8.4's γ(q)). The code has no distance in it, so an opener eight
words back is read as one next to the word. 256 key stars, 2 × 256 × 44 gate numbers; the gate numbers start at zero
(the run starts from dag12's function). Trainer and decoder agree exactly (teacher forcing on 2,415 messages with
random gate numbers: 23,157 of 24,300 decisions right in both).

**Labels.** No move-label list is kept apart any more (`labels.json` is gone, at the owner's wish): each prepared set's
`meta.json` holds its own list, `train.py` builds the run's list from the checkpoint and the sets it reads and maps every
set onto it; `rollin.py` writes its model's list into its meta.

Commands (from `soplang-nlu/`; the data steps are in `data/README.md`):

```sh
M=.local-data/rvss/model; PY=/home/salboaie/nlp-venv/bin/python
T="strategies/rvss/model/train.py --init $M/vsa2k2hmm-dag12 --epochs 1 --lr 0.005 --lr-scalar 0.002 --k2 64 --hmm $M/stations.jsonl"
tools/gpu-run.sh $PY $T --data d15 --dev d15 --out $M/vsa2k2hmm-ft15
tools/gpu-run.sh $PY $T --data d15g --dev d15g --out $M/vsa2k2hmm-g15
tools/gpu-run.sh $PY $T --data d15g --dev d15g --rb 256 --out $M/vsa2k2hmm-g15rb
RVSS_DECODE_ARGS="--beam 4" strategies/rvss/eval/measure.sh vsa2k2hmm-g15 3 vsa2k2hmm-g15-b4
RVSS_DECODE_ARGS="--beam 4" strategies/rvss/eval/measure-general.sh vsa2k2hmm-g15 3 vsa2k2hmm-g15-b4
```

## Afternoon sprint (2026-11-28, 11:15 to 12:45): targets at 195075d, roll-in, beam, condensed stars

**In short.** On the targets of the spaCy writer at 195075d (round 12), the pilot trained one more epoch on its own
moves (roll-in, DESIGN 9.4) and reading with a beam of 4, **vsa2k2hmm-dag12 with beam 4**, equals spaCy on **59.6%** of
dev-B (relaxed 69.0%, valid 99.7%), against 57.5% for vsa2k2hmm-d9f and 57.6% for the logistic control on the same
targets; 45.6 ms per message on one CPU thread (greedy: about 13 ms), 8 MB. The roll-in moves little by itself (+0.3
points; in held-out states the pilot reaches after its own errors, decisions right 0.9065 against 0.9024); the beam
gives +0.8. The fit of closed constellations (DESIGN 10), by superposition or learned against the beam's own wrong
constellations, lowers equality at every weight tried, and is not used. The condensed constellation stars as the
pilot's state (view 3) improve close decisions and opening at 8+ words under teacher forcing but not free running
(58.0%). `current` now points to vsa2k2hmm-dag12, whose `reading.json` sets the beam of 4. Its old-benchmark circuits
are in `eval-results/2026-11-28-levels-rvss-vsa2k2hmm-dag12-b4/`, with 392 circuits to judge in 3 packets. The long
messages are not solved: 21.6% at 25-39 words. **Next step:** the route book inside the pilot (keys read from
the opener, the pair of kinds and the path, DESIGN 7), so that the pilot's open/close decisions at a distance read the
constellation it would place into; and a dynamic oracle for structural deviations, without which roll-in sees only
key and mark errors (2,352 of 6,457 roll-in sequences stopped at the first structural deviation).

Every GPU job went through `tools/gpu-run.sh`, one at a time; decoding and measuring used at most 4 CPU processes;
free memory stayed above 70 GB; the watchdog stopped nothing.

### 1. Targets refreshed to the writer at 195075d

`data/refresh.mjs` now finds every message by its text only (it keyed by file and row before; the dataset was
re-split since); `file` and `row` stay in the lines as information. The parses are those recorded at 0f20f16; the
spaCy code (lib/, strategies/spacy*, strategies/neural-dependencies) is the same at 195075d and at HEAD 4b000ab, and
`rewrite.mjs` with the `git archive` copy of 195075d gives byte for byte the existing `rewritten-195075d.jsonl`.
dev-B stays the same 15,104 texts. The 9f76a39 sets moved to `.local-data/rvss/at-9f76a39/`.

| Count (refresh.json) | Value |
| --- | ---: |
| lines of distill (train + dev-B) | 181,450, none dropped |
| circuits changed as written / in the normal-form core | 3,835 (2.11%) / 3,833: train 3,422, dev-B 413 |
| changed, by length (train + dev-B) | <10 words 1,179, 10-24 1,880, 25-39 428, 40+ 348 |
| registry decisions on the new circuits (dataset 476f7b7) | train 2,313 accepted, 105 rejected; dev-B 1,005 accepted, 192 rejected |
| moves derived and replayed identically | train 165,147 of 166,346 (99.279%), dev-B 15,079 of 15,104 (99.834%) |
| teacher-forced examples (`d12`, view 2) | 165,148 train messages, 5,343,124 acts; 15,079 dev-B messages, 398,394 acts |

The old models scored against the new targets: vsa2k2hmm-d9f 57.8% to 57.5% exact, the control 57.9% to 57.6%.

### 2. Roll-in with the pilot's own moves (DESIGN 9.4)

`model/rollin.py`: the pilot reads a training message while the adopted oracle's moves are known. Where its move
differs from the gold one only by a key or marks (a word under another key, a wire closed with other marks, a wire of
the gold type opened under another key, a held item claimed under another key) the state stays consistent with the
gold tree, the pilot's move is applied, and every later state gives an example labelled with the gold move. Any other
deviation stops the sequence after a followed one (early update); before one the gold move is applied. The sequence
also stops where the gold move is not legal in the pilot's state. No dynamic oracle exists for structural deviations.

- Data: vsa2k2hmm-ft12 read every 4th training message (41,280): 8,004 deviations followed; 6,457 messages gave
  60,376 examples; 2,352 sequences stopped at a structural deviation, 974 where the gold move was illegal.
- Training (`train.py --init`, 1 epoch, lr 0.005 / 0.002 for scalars, from vsa2k2hmm-d9f): **ft12** on d12 alone
  (the control for the roll-in), **dag12** on d12 plus the roll-in examples drawn 4 times (240 k of 5.6 M examples).
- Held-out states the pilot reaches: `rollin.py --split dev-B` with ft12 on all of dev-B (3,317 deviations, 2,555
  messages, 13,938 decisions), scored with `train.py --eval-only --by-decision --dev rollin12dv`.

### 3. A beam scored by the fit of what it builds (DESIGN 10)

`decode.py --beam K` keeps K hypotheses, each expanded by its 3 best moves, ranked by the sum of the moves' log
probabilities; `--fit L` adds L x fit(X) for every constellation X a hypothesis closes. Two fits were tried:
superposition prototypes (`fitproto.py`: the phase of the sum of the kind constellations K_X of the gold
constellations of every 8th training message, per type; fit = z-score of sim(K_X, Pi_t)) and learned ones (`fitlearn.py`: Pi_t, a_t, b_t by logistic
regression on 57,548 constellations closed in the final beam of 4,129 training messages, 34,441 gold; held-out
accuracy 0.745, AUC nominal 0.79, relation 0.88, clauses 0.61-0.77; fit = log p(gold) or its log-odds). The settings
were chosen on 2,064 training messages (`eval/beam-tune.sh`, every 80th, not among fitlearn's), before dev-B:

| Setting (training messages, exact / relaxed) | ft12 | dag12 |
| --- | --- | --- |
| greedy | 57.3% / 70.0% | |
| beam 4 | 57.7% / 71.2% | 58.0% / 71.4% |
| beam 4, superposition fit 0.3 / 1.0 | 57.4% / 70.7%; 55.0% / 67.5% | |
| beam 4, learned fit (log p) 0.5 / 1.0 / 2.0 | | 57.4%; 55.8%; 52.2% |
| beam 4, learned fit (log-odds) 0.3 / 1.0 | | 57.4%; 52.5% |
| beam 8 | | 58.0% / 71.4% (the same as beam 4, twice the time) |

Word-synchronous pruning (`--sync`) was 4 times slower than the plain beam and is not used. Every fit lowers equality:
a constellation can look typical of its type and still be the wrong grouping (the errors are where a wire opens and
closes, which K_X does not see), and the fit term favours hypotheses that close fewer constellations.

### 4. The condensed constellations as the pilot's state (view 3)

`core.py` view 3 adds two parts to the pilot's view: the star of the open constellation it fills and the star of the
last closed one, each the bundle of all its stars bound with their keys (key x kind(word); key x type x kind(opener)
for a held constellation), as the constellation is condensed (DESIGN 5.4-5.5). Trained from scratch, 3 epochs on
`d12v3` (vsa3k2hmm-d12; 2 more parts of prototypes per outcome, 2.3 M parameters, 9.3 MB).

### Results (targets 195075d; dev-B 15,104 messages; old benchmark 1,831 messages, registry of now)

| Run | TF act | TF all-acts | dev-B exact | relaxed | variants | valid | word placement | exact <10 / 10-24 / 25-39 / 40+ | relaxed <10 / 10-24 / 25-39 | known accepted (old benchmark) | ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |
| logreg2t-d9f (control, 9f76a39 targets) | 0.9703 | | 57.6% | 65.6% | 66.0% | 97.5% | 88.8% | 66.3 / 49.9 / 23.4 / 1 of 14 | 73.8 / 58.4 / 29.7 | 1369 (74.8%) | 5.0 |
| vsa2k2hmm-d9f (9f76a39 targets) | 0.9698 | | 57.5% | 67.0% | 67.3% | 99.3% | 91.0% | 67.5 / 48.4 / 22.3 / 0 | 76.6 / 58.4 / 28.7 | 1354 (73.9%) | 13.2 |
| vsa2k2hmm-ft12 (+1 epoch, d12) | 0.9711 | 0.609 | 58.5% | 67.9% | 68.1% | 99.3% | 91.4% | 68.3 / 49.7 / 22.1 / 1 | 77.2 / 59.6 / 28.5 | 1359 (74.2%) | |
| vsa2k2hmm-dag12 (+1 epoch, d12 + roll-in) | 0.9711 | 0.610 | 58.8% | 68.0% | 68.2% | 99.3% | 91.4% | 68.7 / 49.7 / 20.9 / 1 | 77.7 / 59.5 / 27.8 | 1363 (74.4%) | |
| **vsa2k2hmm-dag12, beam 4** | | | **59.6%** | **69.0%** | 69.2% | 99.7% | 91.9% | 69.4 / 50.8 / 21.6 / 1 | 78.4 / 60.8 / 28.3 | 1371 (74.9%) | 45.6 |
| vsa3k2hmm-d12 (view 3, from scratch) | 0.9708 | 0.604 | 58.0% | 67.2% | 67.4% | 99.3% | 91.1% | 68.2 / 48.9 / 19.1 / 1 | 77.3 / 58.4 / 24.4 | 1331 (72.7%) | |

ms: median per message through `index.mjs` on one CPU thread, 400 benchmark messages (`speed.mjs`); the beam's
p90 is 136 ms. spaCy: 109.9 ms, 477.5 MB. Known accepted is a lower bound (unjudged circuits count as not accepted).

**Decisions by kind and by distance** (teacher forcing, all of dev-B on the 195075d targets, `by-decision.json`; the
control and vsa2k2hmm-d9f trained on the 9f76a39 targets), and in the held-out states the pilot reaches after its
own key or mark errors (roll-in states of dev-B, `by-decision-rollin12dv.json`):

| Decision, distance | n | control | vsa2k2hmm-d9f | ft12 | dag12 | view 3 | n (roll-in states) | ft12, roll-in states | dag12, roll-in states |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| all | 398,394 | 0.9703 | 0.9698 | 0.9711 | 0.9711 | 0.9708 | 13,938 | 0.9024 | 0.9065 |
| open, all | 105,315 | 0.9647 | 0.9629 | 0.9639 | 0.9638 | 0.9635 | 2,906 | 0.8878 | 0.8909 |
| open, 1 | 43,210 | 0.9739 | 0.9706 | 0.9708 | 0.9714 | 0.9709 | 1,473 | 0.8900 | 0.8934 |
| open, 2-3 | 20,652 | 0.9427 | 0.9449 | 0.9468 | 0.9466 | 0.9432 | 678 | 0.8333 | 0.8348 |
| open, 4-7 | 7,484 | 0.9335 | 0.9264 | 0.9309 | 0.9250 | 0.9280 | 332 | 0.8976 | 0.9036 |
| open, 8+ | 1,856 | 0.9057 | 0.8901 | 0.8842 | 0.8906 | 0.8976 | 128 | 0.8984 | 0.9219 |
| close, all | 111,876 | 0.9653 | 0.9618 | 0.9637 | 0.9632 | 0.9644 | 4,850 | 0.9614 | 0.9596 |
| close, 2-3 | 25,838 | 0.9503 | 0.9427 | 0.9434 | 0.9434 | 0.9456 | 718 | 0.9234 | 0.9220 |
| close, 4-7 | 14,874 | 0.9519 | 0.9511 | 0.9562 | 0.9556 | 0.9564 | 431 | 0.9327 | 0.9188 |
| close, 8+ | 6,476 | 0.9700 | 0.9568 | 0.9600 | 0.9600 | 0.9648 | 269 | 0.9368 | 0.9405 |
| place, all | 163,680 | 0.9813 | 0.9825 | 0.9834 | 0.9837 | 0.9826 | 5,442 | 0.8537 | 0.8642 |
| gather (coordination), all | 5,617 | 0.9281 | 0.9445 | 0.9525 | 0.9496 | 0.9487 | 388 | 0.9871 | 0.9871 |
| reopen, all | 712 | 0.4761 | 0.4228 | 0.4621 | 0.4480 | 0.4719 | 36 | 0.139 | 0.194 |
| reopen: which wire | 712 | 0.7725 | 0.8174 | 0.8455 | 0.8357 | 0.8287 | | | |
| point, all | 520 | 0.8404 | 0.8731 | 0.8942 | 0.8769 | 0.9019 | | | |

What it shows: under teacher forcing the roll-in changes nothing (it adds states, not accuracy in gold states); in the
states the pilot reaches after its own errors it helps placement (+1.1 points) and opening at 8+ words (+2.4), as
roll-in should, but a message is already wrong once the pilot errs, so exact equality moves only +0.3. The beam lets
a later word overturn an earlier decision: +0.8 exact, +1.0 relaxed, valid circuits 99.3% to 99.7%, mostly on 10-24
words (49.7% to 50.8%). The condensed stars help the decisions that read the constellation's content (close, point,
reopen, opening at 8+), not free running. Long messages (25-39 words: 21.6%) and reopen (0.45) stay the losses.

**Old benchmark for judges.** `eval-results/2026-11-28-levels-rvss-vsa2k2hmm-dag12-b4/` (as
`2026-11-28-levels-spacy-rvss`): the old benchmark's sample (1,831 messages, held out of training), `rvss.jsonl`
(vsa2k2hmm-dag12 with beam 4), `summary.json`, and `judge-prepare.mjs --size 170`: 849 circuits equal to the
message's label, 513 already accepted, 70 already rejected, 7 without a valid circuit, **392 to judge in 3 packets**
(170, 170, 52).

**Clean-up.** The first builder's view-2 sets `distill2.*` and `labels2.*` (2.2 GB) are deleted; nothing reads them
(`train.py` now defaults to `--data d12 --dev d12`). Not deleted (the owner decides): the first builder's view-1 sets
`distill.{train,dev-B}.*`, `labels.{train,dev-B}.*`, `distill.meta.json`, `labels.meta.json` (2.0 GB; only the old
view-1 models read them), the 9f76a39 set `d9f2.*` (1.7 GB; superseded by `d12`, prepared again in a minute from
`at-9f76a39/`), and the first builder's small leftovers (`smoke-*`, `beam1*`, `beam4*`, `dev20/300/1000.jsonl`,
`gold-*.jsonl`, the empty `vsa8-distill/` and `vsa128-distill/`).

Commands (from `soplang-nlu/`):

```sh
M=.local-data/rvss/model; PY=/home/salboaie/nlp-venv/bin/python
node strategies/rvss/data/refresh.mjs --rewritten .local-data/rvss/spacy-run-0f20f16/rewritten-195075d.jsonl --commit 195075d
#   then the 9f76a39 sets moved to at-9f76a39/, the 195075d ones from at-195075d/ to .local-data/rvss/
node strategies/rvss/data/moves.mjs --threads 4; node strategies/rvss/model/export.mjs
$PY strategies/rvss/model/prep.py $M/distill.jsonl $M/d12 --workers 4 --view 2      # and $M/d12v3 --view 3
tools/gpu-run.sh $PY strategies/rvss/model/train.py --data d12 --out $M/vsa2k2hmm-ft12 --init $M/vsa2k2hmm-d9f \
  --epochs 1 --lr 0.005 --lr-scalar 0.002 --k2 64 --hmm $M/stations.jsonl
$PY strategies/rvss/model/rollin.py $M/vsa2k2hmm-ft12 $M/distill.jsonl $M/rollin12 --workers 4 --follow 1.0 --stride 4
tools/gpu-run.sh $PY strategies/rvss/model/train.py --data d12,rollin12 --data-weight 1,4 --out $M/vsa2k2hmm-dag12 \
  --init $M/vsa2k2hmm-d9f --epochs 1 --lr 0.005 --lr-scalar 0.002 --k2 64 --hmm $M/stations.jsonl
$PY strategies/rvss/model/rollin.py $M/vsa2k2hmm-ft12 $M/distill.jsonl $M/rollin12dv --workers 4 --follow 1.0 --split dev-B
tools/gpu-run.sh $PY strategies/rvss/model/train.py --data d12v3 --dev d12v3 --out $M/vsa3k2hmm-d12 --epochs 3 --k2 64 --hmm $M/stations.jsonl
RVSS_DECODE_ARGS="--beam 4" strategies/rvss/eval/measure.sh vsa2k2hmm-dag12 4 vsa2k2hmm-dag12-b4
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
| the pilot reading condensed stars as its state | built as view 3 (`core.py`): the stars of the open and of the last closed constellation (every star bound with its key) are two more parts of the view, beside the symbolic state atoms; better close, point and reopen decisions under teacher forcing, no gain in free running (vsa3k2hmm-d12, 58.0%) |
| route book inside the pilot: keys from the opener, pair of kinds, path, backward at a claim, beacon, vote, cleanup against named key stars; key–value memories A, B, L (7) | built only in the M2a test (`m2a.py`, grouping given: 96.71% against the control's 95.04%); the pilot places a key as one outcome among its moves |
| situation memory (9.1) | built (`--sit`), no gain at step 2,000 (first builder), not kept |
| roll-in with the pilot's own moves (9.4) | built (`rollin.py`): key and mark deviations followed, early update at structural ones (no dynamic oracle); +0.3 points exact (vsa2k2hmm-dag12) |
| beam scored by fit (10) | built (`decode.py --beam --fit`, `fitproto.py`, `fitlearn.py`): the beam of 4 gives +0.8 points exact; every fit tried lowers equality and is not used |
| re-placement, bottom-up reader | missing |
| judged weights, negatives from rejected circuits (M3) | missing (labels mixed in lowered equality with spaCy, vsa2-mixed) |

## Files

| File | What |
| --- | --- |
| `model/core.py`, `prep.py` | the pilot's state, moves and views; teacher-forced examples |
| `model/net.py`, `train.py` | the VSA pilot and the logistic control; training (`--k2`, `--hmm`, `--lex`, `--dev`, `--eval-train` added on 2026-11-28; `--init`, `--data-weight` and view 3 in the afternoon; `RVSS_TRAIN_DEVICE=cpu` for a CPU check) |
| `model/decode.py`, `worker.py`, `index.mjs`, `writer.mjs` | free running on the CPU and the strategy module; `--beam`, `--fit`, `--sync`; the model folder's `reading.json` tells the worker and decode.py how to read (beam, fit) |
| `data/refresh.mjs` | the sets with a newer spaCy writer, splits and exclusions kept; messages found by text only |
| `data/add-general.mjs` | the general corpora (`syntactic/general/`) added to the sets: origin `general`, dev-G by file hash, benchmark and dev-B near-copies left out |
| `eval/measure-general.sh` | free running on dev-G, equality with spaCy by length and by corpus |
| `model/rollin.py` | roll-in with the pilot's own moves (DESIGN 9.4): examples in the states the pilot reaches (train), or held-out ones for measuring (`--split dev-B`) |
| `model/fitproto.py`, `model/fitlearn.py` | DESIGN 10: kind constellations of closed constellations; prototypes by superposition (`fit.npz`) and learned against the beam's own wrong constellations (`fit-learned.npz`) |
| `eval/beam-tune.sh` | a decoding setting tried on 2,064 training messages (`train-inputs-s80.jsonl`) before dev-B is read |
| `data/stations.mjs` | the station HMM's posterior per word (forward–backward); `.local-data/rvss/model/stations.jsonl` |
| `eval/measure-fresh.sh` | decode a run on the fresh sample, equality with spaCy by split, the unjudged list |
| `eval/fresh-sample.mjs` | inputs, spaCy targets and the unjudged list for a fresh file-level sample |
| `.local-data/rvss/model/<run>/`, `<run>.log` | models and training logs |
| `.local-data/rvss/runs/<run>/` | decoded outputs and the harness's reports |
