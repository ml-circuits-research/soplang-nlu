# rvss training data: spaCy's circuits, the labels, the moves

The data for the first rvss sprint (2026-11-27): rvss learns to write the circuits the spaCy strategy writes
(distillation), on every message of the dataset, with the accepted labels where they exist. It is then measured
against spaCy on held-out files, on the 1% benchmark (judged), and by speed and size.

Everything large is in `.local-data/rvss/` (git-ignored). The code is here.

## Commits

| What | Commit |
| --- | --- |
| dataset (webmeet-dataset): `semantic/`, `syntactic/`, `annotations/syntax/v1/judged/` | **c6b11f6** (no local changes in those folders) |
| spaCy strategy, the parser run (`run-spacy.mjs`) | **0f20f16** (a `git archive` copy; lib/, schemas/, worlds/ and the parser transport are the same at eb576f9) |
| spaCy strategy, the circuits of the main sets | **eb576f9** (round 6, which changes only the writer; written from the recorded parses, see below) |
| soplang-nlu when the sets were built (normalForm, the registry reader, oracle2.mjs) | 8fdaed1; `oracle2.mjs` last changed in 94b3036; these scripts are not committed yet |
| parser | spaCy 3.8.16, `en_core_web_trf` 3.8.0 (478 MB on disk), `/tmp/sop-nlu-trf-model/python-trf-one` (one thread per process) |

## How to rebuild

Run from `soplang-nlu/` with the spaCy strategy's settings (`SOP_NLU_SYNTAX_PYTHON`, `SOP_NLU_SYNTAX_MODEL`; on this
machine `source <scratchpad>/round-env.sh`) and `SOP_KNOWLEDGE_DIR` unset:

```sh
# 0. a copy of the spaCy strategy's code at one commit, so the run does not change when the working tree does
for c in 0f20f16 eb576f9; do C=.local-data/rvss/code/spacy-$c; mkdir -p $C
  git archive $c lib schemas worlds package.json strategies/spacy strategies/spacy-beam \
    strategies/spacy-direct strategies/neural-dependencies | tar -x -C $C; done

# 1. the strategy over every message, 10 worker processes (33 min here). If it is interrupted, start it again:
#    it skips the messages already in run.jsonl
node --max-old-space-size=16000 strategies/rvss/data/run-spacy.mjs --code .local-data/rvss/code/spacy-0f20f16 \
  --out .local-data/rvss/spacy-run-0f20f16 --workers 10

# checks: the run gives what the benchmark's runner gave; the CSV reader reads what tests/benchmark reads;
# the circuits written again from the recorded parses are the run's circuits
node strategies/rvss/data/check-bench.mjs .local-data/rvss/spacy-run-0f20f16/run.jsonl
node strategies/rvss/data/check-csv.mjs
node strategies/rvss/data/rewrite.mjs .local-data/rvss/spacy-run-0f20f16/run.jsonl \
  --code .local-data/rvss/code/spacy-0f20f16 --compare

# 2. the circuits of eb576f9 from the recorded parses (3.5 min), checked against the live strategy on every
#    90th message (2,039)
node strategies/rvss/data/rewrite.mjs .local-data/rvss/spacy-run-0f20f16/run.jsonl --code .local-data/rvss/code/spacy-eb576f9 \
  --out .local-data/rvss/spacy-run-0f20f16/rewritten-eb576f9.jsonl --compare
node --max-old-space-size=16000 strategies/rvss/data/run-spacy.mjs --code .local-data/rvss/code/spacy-eb576f9 \
  --out .local-data/rvss/spacy-live-eb576f9-stride90 --workers 10 --stride 90

# 3. silver, training sets, split, benchmark left out (45 s); the same at 0f20f16 into at-0f20f16/
node --max-old-space-size=24000 strategies/rvss/data/build-sets.mjs --run .local-data/rvss/spacy-run-0f20f16/rewritten-eb576f9.jsonl \
  --commit eb576f9 --parses .local-data/rvss/spacy-run-0f20f16/run.jsonl
node --max-old-space-size=16000 strategies/rvss/data/build-sets.mjs --run .local-data/rvss/spacy-run-0f20f16/run.jsonl \
  --commit 0f20f16 --out .local-data/rvss/at-0f20f16

# 4. the moves (25 s with 10 threads)
node --max-old-space-size=24000 strategies/rvss/data/moves.mjs --threads 10
node --max-old-space-size=24000 strategies/rvss/data/moves.mjs --in .local-data/rvss/at-0f20f16 --threads 6
```

**A newer spaCy writer.** The parser (Python) is the slow part of the strategy. The writer of circuits
(JavaScript) is fast. `run-spacy.mjs` records the parser's output for every message (the greedy parse and up to
three beam parses). A commit that changes only the writer (`strategies/spacy-direct`, `strategies/spacy-beam`,
`strategies/neural-dependencies/syntax-circuit.mjs`, `lib/`) therefore needs no new parser run: steps 0, 2, 3, 4
with its commit. Two checks show that the rewrite path gives the strategy's own output:

- at 0f20f16, the rewritten circuits equal the run's on all 183,497 messages;
- at eb576f9, the live strategy and the rewrite agree on 2,039 of 2,039 messages (every 90th), and on the 4
  messages where the rewrite fails.

A commit that changes `strategies/neural-dependencies/worker.py`, the model or the spaCy install needs step 1 again.

## Files (in `.local-data/rvss/`)

| File | What it holds |
| --- | --- |
| `spacy-silver.jsonl.gz` (9.4 MB) | every message, {text, file, row, sop, error, ms}, the spaCy strategy at **eb576f9**; `row` counts the records of the file from 1; `sop` is null where the strategy gave no circuit |
| `spacy-parses.jsonl.gz` (30 MB) | the parser's output per message {file, row, parse: {t: tokens, a: [score, heads, labels] per beam parse}} (`unpackParse` in run-spacy.mjs) |
| `distill.jsonl.gz` | every message outside the benchmark with a spaCy circuit: {text, file, row, split, sop, origin: "spacy", source: "spacy@eb576f9", judged}; `judged` is the registry's newest decision on that circuit: accepted, rejected or null |
| `mixed.jsonl.gz` | every message outside the benchmark: its accepted label {origin: judge / agreement / written, source, accepted_by, spacySame}, else spaCy's line from distill. `spacySame`: the label and spaCy's circuit have the same normal-form core |
| `excluded.jsonl.gz` | the messages left out of everything: {file, row, text, why, benchId, benchText}; why = benchmark, copy (same text up to case and spaces), near-copy (one character inserted, deleted or replaced, after case and spaces) |
| `splits.json` | the 24 dev-B files and the counts |
| `moves-distill.jsonl.gz`, `moves-mixed.jsonl.gz` (21 MB each) | each line of the set with {sop (normal form), written (as the set holds it, when that differs), words, moves, replay, replayNormal}; see moves.mjs |
| `build.json`, `moves.json` | every count below, by machine |
| `at-0f20f16/` | the same files for the spaCy writer at 0f20f16 (the commit behind the benchmark's 94.6%), without parses |
| `spacy-run-0f20f16/run.jsonl` (327 MB) | the raw run: circuits at 0f20f16, errors, ms, parses; `runs.log`; `rewritten-eb576f9.jsonl`; `check-bench.json`, `rewrite-*-compare.json` |
| `spacy-live-eb576f9-stride90/` | the live check at eb576f9 and `compare-rewritten.json` |
| `code/spacy-0f20f16/`, `code/spacy-eb576f9/` | the frozen code copies |

Code (here): `run-spacy.mjs` (runner, resumable), `rewrite.mjs`, `build-sets.mjs`, `moves.mjs`, `check-bench.mjs`,
`check-csv.mjs`.

## Counts (dataset c6b11f6; circuits at eb576f9 unless named)

**Messages.** 183,497, one per row of `semantic/` (238 files). Every text is distinct. `syntactic/` has the same
texts row for row (0 mismatches). There are 89,863 labels: agreement 84,186, judge 5,645, written 32.

**The spaCy run** (0f20f16, 10 workers): 183,497 messages in 1,985 s (33 min, 92.4 messages/s), no worker died, no
retries.

| | 0f20f16 | eb576f9 |
| --- | ---: | ---: |
| messages with a circuit | 183,495 | 183,493 |
| no circuit | 2 (1 invalid: unknown-key, uncovered-words; 1 writer crash: `reading 'slots'`) | 4 (1 invalid, as before; 2 writer crashes `reading 'slots'`; 1 `Maximum call stack size exceeded`, "the first pictures on page 3 and page 5 want shifting across") |
| circuits changed from 0f20f16 | | 3,533 (1.93%), all 3,533 also in the normal form |

**Time per message.** Median 101.75 ms, mean 107.7, p90 162.8, p99 252.5, max 777.2 ms. This was measured inside
the run: 10 processes at once, one thread each, on 10 Cortex-X925 and 10 Cortex-A725 cores, with other jobs running
(a distilbert audit). It is about twice the benchmark's single-process median, 50.855 ms on the 1,831 benchmark
messages. Use 50.9 ms for spaCy's speed and these numbers only for the run.

**The run against the benchmark's runner.** For the 1,831 benchmark messages, the circuits at 0f20f16 equal
`eval-results/2026-11-27-syntax-benchmark-random/spacy.jsonl`: 1,831 of 1,831, as written.

**Left out (benchmark).** 2,043 messages:

- 1,831 benchmark texts, all found in the dataset. Only 164 of the sample's ids (`file#row`) still name the row
  with that text, because files were split since, so the text decides.
- 5 copies (the same text up to case and spaces).
- 207 near-copies within one character, mostly calendar templates that differ in one digit.

By split: train 1,691 + 5 + 198, dev-B 140 + 0 + 9.

**Split.** dev-B is the 24 files (round(238/10)) with the smallest sha1 of their path ("folder/name.csv"). It
holds 15,104 messages after the exclusions; train has 214 files and 166,350 messages. dev-B has drawing 11,
diagram 8, document 3 and calendar 2 files. **15 of the 24 dev-B files are parts of a file whose other parts are in
train** (for example `diagram/charts-03.05.csv` against `charts-03.01`–`.04`). dev-B is therefore held-out files,
not held-out generators.

**distill.jsonl.gz.** 181,450 lines: train 166,346, dev-B 15,104. The 4 messages with no circuit are left out; all
4 are in train and none has a label. The registry decides on 1,965 of spaCy's own circuits:

- train: 1,748 accepted, 45 rejected;
- dev-B: 161 accepted, 11 rejected;
- unjudged: 179,485.

**mixed.jsonl.gz.** 181,450 lines:

| split | agreement | judge | written | spaCy | all |
| --- | ---: | ---: | ---: | ---: | ---: |
| train | 76,010 | 3,762 | 17 | 86,557 | 166,346 |
| dev-B | 7,766 | 389 | 15 | 6,934 | 15,104 |

That makes 87,959 labels. The other 1,904 of the 89,863 labels belong to left-out messages. **Label and spaCy
often differ.** They have the same normal-form core for 44,164 of 83,776 agreement labels (52.7%), 1,812 of 4,151
judge labels (43.7%) and 1 of 32 written labels. So mixed teaches a second set of conventions beside spaCy's for
about half of its labelled lines. Typical differences: `head="14:00" dependent="UTC"` against
`dependent="14:00" head="UTC"`, a closing "Thanks!" as discourse of the clause or as a fragment clause of its own,
and an attachment chosen or left `ambiguous`.

**Moves** (oracle2.mjs, `late`, the adopted "open at the evidence" rules). There are 227,903 distinct circuits,
converted in 25 s. "Identical" means that the replay from the words and moves alone, written with writeCircuit, has
the core (coreOf) of the circuit it was derived from. The moves are derived from the normal form. **Every
failure is a circuit the oracle cannot derive. No derived circuit replays differently.**

| circuits | lines | identical | share | from the circuit as written |
| --- | ---: | ---: | ---: | ---: |
| spaCy, distill (train + dev-B) | 181,450 | 180,175 | **99.297%** | 176,525 (97.286%) |
| — distill train | 166,346 | 165,098 | 99.250% | 161,673 (97.191%) |
| — distill dev-B | 15,104 | 15,077 | 99.821% | 14,852 (98.332%) |
| — spaCy lines of mixed (messages with no label) | 93,491 | 92,263 | 98.686% | 89,797 (96.050%) |
| labels, all | 87,959 | 87,936 | **99.974%** | the same (labels are in normal form) |
| — agreement | 83,776 | 83,757 | 99.977% | |
| — judge | 4,151 | 4,148 | 99.928% | |
| — written | 32 | 31 | 96.875% | |

The 1,275 spaCy circuits that cannot be derived fail for these reasons: re-entry into a held or unplaced wire
1,231, coordinated relations with different `from` 25, holding cycle 13, closed with held items 5, pointer to a
later wire 1. The labels fail on re-entry 20, holding cycle 1 and closed with held items 2. Without the normal form,
spaCy's identical share drops to 97.3%, because spaCy writes "thank you" as one discourse value and "two-hour" as
one dependent. The moves place one word per step and join neighbours only for keys other than dependent, modifier,
auxiliary, negation and discourse. There are 2.40 moves per word for spaCy and 2.33 for agreement labels.

At 0f20f16 (`at-0f20f16/moves.json`), the spaCy distill set gives 180,155 of 181,452 identical (99.285%). The
labels give the same numbers.
