# rvss evaluation: the baselines

Every rvss run is measured with the scripts of this folder, the same way as the strategies below. The numbers
were computed on 2026-11-27 (23:06–23:13, local time) on **dataset c6b11f6** (`syntactic/` and
`annotations/syntax/` as committed, no local changes), repository 6b84375, with the strategy files of the 1%
benchmark `eval-results/2026-11-27-syntax-benchmark-random/` as last committed in 0dd21c3. The hmm-rules circuits
are in that folder's `vss.jsonl` (the strategy's old name).

## The commands

From `soplang-nlu/`:

```sh
# 1. the 1,831 benchmark messages: validity, equality with spaCy, known accepted / rejected / unjudged
node strategies/rvss/eval/evaluate-benchmark.mjs <outputs.jsonl> [--name rvss-<run>]
#    writes .local-data/rvss/eval/benchmark/<name>/summary.{json,md} and unjudged.jsonl (packet lines {n, text, sop}
#    in normal form, for judges)

# 2. development targets (spaCy's circuits and labels of held-out messages)
node strategies/rvss/eval/evaluate-dev.mjs <outputs.jsonl> <targets.jsonl.gz> [--split dev-B] [--only-outputs]
#    writes .local-data/rvss/eval/dev/<name>.json

# 3. speed and size of any strategy module, on CPU
source <scratchpad>/round-env.sh; unset SOP_KNOWLEDGE_DIR    # what spaCy and DistilBERT need on this machine
node strategies/rvss/eval/speed.mjs strategies/spacy/index.mjs [--threads 1] [--limit 400]
#    writes .local-data/rvss/eval/speed/<name>-cpu[-<n>thread].json

# 4. these tables again, with any rvss run as one more row
node strategies/rvss/eval/baselines.mjs [--extra rvss=<outputs.jsonl>]

# the scripts' own test, on small fake outputs whose answers are known by construction
node strategies/rvss/eval/selftest.mjs
```

`<outputs.jsonl>` is what `tests/benchmark/syntax/run.mjs` writes for a strategy: one line per message
`{id, text, sop, error, ms}`. A message with no line, or no valid circuit, counts as "no valid circuit". For the
development set, targets as `strategies/rvss/data/build-sets.mjs` writes them (`distill.jsonl.gz`,
`mixed.jsonl.gz`: `{text, file, row, split, sop, origin, accepted_by?, judged?, spacySame?}`) are read as they are.

## How a circuit is counted

- **Valid**: `validateSyntax` of `lib/syntax.mjs`.
- **Equal to spaCy** (the strategy file `spacy.jsonl` of the benchmark), with the keys of
  `tests/benchmark/syntax/lib.mjs`: **exact** = the same core of the normal form; **relaxed** = the same
  `relaxedCore` (the start of every relation with a marker left out); **variants** = the same `relaxedCore` or the
  same `agreementKey` (also the choices `rules.md` lets pass either way). Each key counts at least what the one
  before it counts.
- **Known accepted / known rejected / unjudged**, by the review procedure of `experiments/syntax-learned/review/`:
  the verdict of the benchmark's judge (`judging/verdicts-*.jsonl`, the newest verdict counting: `runVerdicts`),
  else the registry's newest decision (`readRegistry`/`lookup`, `supersedes` honoured), else the label the message
  had before the run (`key/labels-before.jsonl`), else unjudged. **Known accepted of all 1,831** is the GOAL-like
  share and the lower bound; known accepted + unjudged is the upper bound.
- Beside it, **table.mjs GOAL**: the levels of `tests/benchmark/syntax/table.mjs` (`levelOf`) on the registry as it
  is now. The two differ on two messages (below).

## The benchmark (1,831 messages)

| Strategy (file) | Valid | Known accepted | Known rejected | Unjudged | No valid circuit | Lower – upper bound | table.mjs GOAL | = spaCy exact | = spaCy relaxed | = spaCy variants |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| spacy (`spacy.jsonl`) | 1831 | 1732 (94.6%) | 99 | 0 | 0 | 94.6% – 94.6% | 1732 (94.6%) | 1831 (100.0%) | 1831 (100.0%) | 1831 (100.0%) |
| hmm-rules (`vss.jsonl`) | 1831 | 1445 (78.9%) | 386 | 0 | 0 | 78.9% – 78.9% | 1447 (79.0%) | 484 (26.4%) | 702 (38.3%) | 909 (49.6%) |
| distilbert (`distilbert.jsonl`) | 1831 | 1404 (76.7%) | 427 | 0 | 0 | 76.7% – 76.7% | 1406 (76.8%) | 567 (31.0%) | 831 (45.4%) | 1018 (55.6%) |
| prolog (`prolog.jsonl`) | 1790 | 1126 (61.5%) | 664 | 0 | 41 | 61.5% – 61.5% | 1127 (61.6%) | 440 (24.0%) | 697 (38.1%) | 704 (38.4%) |
| z3 (`z3.jsonl`) | 1831 | 1081 (59.0%) | 750 | 0 | 0 | 59.0% – 59.0% | 1081 (59.0%) | 482 (26.3%) | 714 (39.0%) | 730 (39.9%) |

Every circuit of these five files has a verdict: no unjudged circuit, so lower and upper bound coincide. An rvss
run will have unjudged circuits; its `unjudged.jsonl` is what judges would read.

**Where known accepted and table.mjs GOAL differ** (hmm-rules −2, distilbert −2, prolog −1): two messages whose
circuit is the label they had before the run (an agreement label), which the benchmark's judge then rejected:
"markers little diamonds" (L3: "'markers' and 'little diamonds' are merged into one nominal") and "do the callout
arrows curved on the revenue trend" (L1: "do" read as an auxiliary of a question). table.mjs counts them L9 (the
label before the run comes first in `levelOf`); the review procedure takes the judge's verdict. The registry holds
both circuits as accepted in `2026-11-27-benchmark-random-replaced-agreement.jsonl`; these are the 2 (hmm-rules,
distilbert) and 1 (prolog) "run judge vs registry" conflicts `evaluate-benchmark.mjs` reports.

### Known accepted by group

| Group | spacy | hmm-rules | distilbert | prolog | z3 |
| --- | ---: | ---: | ---: | ---: | ---: |
| had a label before the run | 593 / 593 (100.0%) | 591 / 593 (99.7%) | 585 / 593 (98.7%) | 471 / 593 (79.4%) | 487 / 593 (82.1%) |
| had no label before the run | 1139 / 1238 (92.0%) | 854 / 1238 (69.0%) | 819 / 1238 (66.2%) | 655 / 1238 (52.9%) | 594 / 1238 (48.0%) |
| area calendar | 47 / 48 (97.9%) | 43 / 48 (89.6%) | 39 / 48 (81.3%) | 29 / 48 (60.4%) | 33 / 48 (68.8%) |
| area diagram | 748 / 808 (92.6%) | 596 / 808 (73.8%) | 590 / 808 (73.0%) | 450 / 808 (55.7%) | 448 / 808 (55.4%) |
| area document | 95 / 99 (96.0%) | 90 / 99 (90.9%) | 78 / 99 (78.8%) | 69 / 99 (69.7%) | 76 / 99 (76.8%) |
| area drawing | 842 / 876 (96.1%) | 716 / 876 (81.7%) | 697 / 876 (79.6%) | 578 / 876 (66.0%) | 524 / 876 (59.8%) |
| length <10 words | 794 / 829 (95.8%) | 732 / 829 (88.3%) | 720 / 829 (86.9%) | 634 / 829 (76.5%) | 642 / 829 (77.4%) |
| length 10-24 | 781 / 826 (94.6%) | 626 / 826 (75.8%) | 602 / 826 (72.9%) | 433 / 826 (52.4%) | 413 / 826 (50.0%) |
| length 25-39 | 101 / 118 (85.6%) | 48 / 118 (40.7%) | 50 / 118 (42.4%) | 39 / 118 (33.1%) | 21 / 118 (17.8%) |
| length 40+ | 56 / 58 (96.6%) | 39 / 58 (67.2%) | 32 / 58 (55.2%) | 20 / 58 (34.5%) | 5 / 58 (8.6%) |

The 593 messages that had a label before the run are the easy, partly circular part: 567 of those labels are
circuits that spacy-direct and hmm-rules (then vss) wrote alike. The 1,238 without are the honest part: spaCy 92.0%, hmm-rules 69.0%.
The 25–39-word bucket is where spaCy is weakest (85.6%) and the others fall to 18–42%.

### Against spaCy, message by message

| Strategy | Messages with both verdicts | Accepted | spaCy accepted | Both | Only this | Only spaCy | Neither |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| hmm-rules | 1831 | 1445 | 1732 | 1403 | 42 | 329 | 57 |
| distilbert | 1831 | 1404 | 1732 | 1364 | 40 | 368 | 59 |
| prolog | 1790 | 1126 | 1697 | 1089 | 37 | 608 | 56 |
| z3 | 1831 | 1081 | 1732 | 1051 | 30 | 681 | 69 |

For distillation this sets the frame: an rvss that reproduces spaCy exactly on all 1,831 messages scores 94.6%
known accepted. The 99 messages where spaCy's circuit is rejected are where reproducing spaCy costs: for 60 of them
at least one of the four other strategies wrote an accepted circuit (hmm-rules 42, DistilBERT 40, Prolog 37, Z3 30:
the "only this" column), so labels can lift a learner above spaCy there.

| Strategy | Rejected, by grade | Accepted by | ms recorded in the file by run.mjs (median / p90) |
| --- | --- | --- | --- |
| spacy | L1 25, L2 3, L3 68, L4 1, L6 2 | run judge 1452, label before 263, registry 17 | 50.855 / 72.579 |
| hmm-rules | L1 116, L2 2, L3 240, L5 22, L6 6 | run judge 1159, label before 260, registry 26 | 0.468 / 1.229 |
| distilbert | L1 140, L3 252, L4 3, L5 8, L6 24 | run judge 1125, label before 258, registry 21 | 3.917 / 5.084 (device not recorded) |
| prolog | L1 228, L2 1, L3 387, L4 7, L5 37, L6 4 | run judge 911, label before 204, registry 11 | 1.102 / 3.413 |
| z3 | L1 236, L2 10, L3 464, L5 31, L6 9 | run judge 859, label before 212, registry 10 | 56.741 / 254.397 |

## Speed and size on CPU (speed.mjs)

Through `createReader`, one message after the other, the benchmark's messages in order; `CUDA_VISIBLE_DEVICES`
empty and the strategies' device variables set to `cpu`. **The machine was loaded** while these ran: another
session's ten spaCy worker processes (one core each) and other jobs, load average 11 to 29 on 20 cores. The
timings are therefore slower than on a quiet machine; they are measured, not corrected.

| Strategy | Threads | Messages | Start-up ms (import + open) | Median ms | p90 ms | p99 ms | Mean ms | Model MB on disk | RSS MB after the run | Load (1 min) before / after |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| spacy | torch default (one per core) | 1831 | 3345 (18 + 3327) | 90.549 | 150.169 | 231.922 | 98.276 | 477.5 | 1851.6 (2 processes) | 11.12 / 13.45 |
| spacy | OMP_NUM_THREADS=1 | 400 | 3501 (24 + 3477) | 95.294 | 173.935 | 240.564 | 110.976 | 477.5 | 1515.6 (2 processes) | 27.51 / 21.37 |
| hmm-rules | one (JavaScript) | 1831 | 115 (21 + 94) | 0.996 | 2.834 | 6.753 | 1.41 | 3.2 | 418 (1 process) | 13.45 / 13.58 |
| hmm-rules | one (JavaScript) | 400 | 146 (25 + 121) | 1.148 | 3.155 | 7.984 | 1.668 | 3.2 | 152.5 (1 process) | 18.45 / 18.45 |
| distilbert | 2 (its worker sets torch to 2 on CPU) | 1831 | 2559 (4 + 2555) | 145.264 | 310.795 | 771.749 | 192.996 | 256.1 | 1132.9 (2 processes) | 13.58 / 29.03 |
| distilbert | 2 (OMP_NUM_THREADS=1 is overridden) | 400 | 2235 (12 + 2224) | 60.171 | 98.8 | 189.995 | 65.205 | 256.1 | 1083.1 (2 processes) | 21.37 / 18.45 |

- **Model size** is what the strategy loads besides code: spaCy the `en_core_web_trf-3.8.0` folder
  (`SOP_NLU_SYNTAX_MODEL`, 477.5 MB); DistilBERT the checkpoint `.local-models/distilbert/syntax-v3/checkpoint`
  (`SOP_NLU_DISTILBERT_MODEL`, 256.1 MB); hmm-rules `strategies/hmm-rules/model/model.json` (3.2 MB). Python, torch
  and spaCy themselves are not counted. Code reached from the module: 0.1–0.4 MB.
- **spaCy's 50.9 ms** in the benchmark run (run.mjs, CPU, the load then not recorded) against 90.5 ms here: the
  difference is the load. The two DistilBERT rows differ by more than two times for the same reason (load 29 at the
  end of the first). Measured again on a quiet machine with the same command, these numbers will drop; the
  comparison with rvss must be made in one session, under the same load (run `speed.mjs` for both, one after the
  other).
- Start-up: spaCy 3.3–3.5 s, DistilBERT 2.2–2.6 s (Python worker and model), hmm-rules 0.1 s.

## The scripts' test

`selftest.mjs` (all assertions hold on c6b11f6): 80 development targets from three syntactic files outside the
benchmark, with outputs that are the target with renamed wires (exact), the target with the start of one marked
relation moved (relaxed, not exact), an invalid circuit, or no line; carried placements with one word wrong; a target
that is a benchmark message up to case and spaces and one a character away (both counted as near-copies). On the
benchmark: a fake output of spaCy's circuits renamed (100), invalid (50), missing (50), spaCy's with a moved start
(20) and hmm-rules' circuits (the rest): validity 1,731, exact equality = 100 + unmoved + hmm-rules' exact matches,
and accepted, rejected and unjudged equal to the sums over the parts evaluated apart; the unjudged list holds each
(message, core) once, in normal form; `spacy.jsonl` gives 1,732 known accepted, as the published table; and
hmm-rules' benchmark circuits measured against spaCy's as development targets give the same valid, exact, relaxed
and variants counts as `evaluate-benchmark.mjs` (1831, 484, 702, 909; per word, 84.9% of the words have the same
placement and 93.5% the same key), with all 1,831 targets found as benchmark copies. About 45 s on the loaded machine.
