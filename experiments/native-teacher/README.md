# Offline native SOP teacher pilot

Select 64 exact sources by sorting the sealed 500 rank-train identifiers by SHA-256 of `native-teacher-v1`, an ASCII NUL, and the identifier. Generate one native circuit from each original source. A circuit that fails public completeness gets one repair attempt with static feedback. Independent literal review scores eligible circuits as singletons. Only accepted source/circuit pairs are exported as supervision.

Run from the repository root using the pinned knowledge installation and the proposal pool archive.

```sh
archive="$PWD/eval-results/2026-11-26-neuro-selector-proposal-pools/train"
work=/absolute/path/to/new-output-directory
knowledge=/absolute/path/to/sop-knowledge-worlds
node experiments/native-teacher/teach.mjs "$archive" "$work" "$knowledge"
bash experiments/native-teacher/review.sh "$work" "$archive/review"
node experiments/native-teacher/compare.mjs "$work" "$archive" "$knowledge"
```

The teacher prompt includes the local native schema and literal source strings, without IDs, references, previous systems' outputs or semantic grades. Only the repair round sees the teacher's previous circuit and static diagnostics. Terra and GPT-6.2 Sol independently review eligible novel circuits. A separate GPT-6.1 Sol call decides threshold disagreements and audits up to 20 agreements per outcome. These reviews receive source and circuit only, under the existing native singleton rubric. Exact prior verified votes are reused when available.

The selector baseline replays the already-frozen ranker on original four-family archives, using the same source and candidate eligibility. It has previously trained on these inputs and its measured performance is an in-sample comparison. No classifier fitting or public-strategy changes are part of this experiment.

## Dataset curation in 500-source batches

Supply UTF-8 JSONL or gzip JSONL with records shaped as `{id, text, candidates:[{sop}]}`. ID fixes source identity and need not appear in model prompts. Additional candidate metadata is preserved in the input snapshot and excluded from prompted drafts. The model can confirm a draft by its zero-based index or supply a new circuit. The same exact source and actual local schema govern both generation and the one corrective attempt. Every proposed output passes through the public schema and source gate.

```sh
input=/absolute/path/to/batch.jsonl.gz
work=/absolute/path/to/batch-output
knowledge=/absolute/path/to/sop-knowledge-worlds
mkdir -p "$work"
flock -n "$work/run.lock" node experiments/native-teacher/curate.mjs "$input" "$work" "$knowledge"
```

An input file can hold any number of rows. The default invocation covers the first 500. Optional trailing arguments give a zero-based row offset in multiples of 500 and the number of successive logical batches. Re-run the exact command and leave the evidence directory in place to resume. `SOP_NLU_CURATION_JOBS` sets microbatch concurrency (default eight). Each Sol request has at most ten sources and 28,000 UTF-8 prompt bytes. Oversized source or draft payloads are marked for rework. Consecutive 500-row chunks are committed independently under `logical-00000`, `logical-00001`, etc. Linux `flock` prevents two processes from using the same output directory concurrently.

The manifest fingerprints the exact input archive, prompts, schema, implementation and validator. Prompt and raw response files record every dispatch. A sealed response is reused on restart. A timeout or failed command still has one opportunity to repair its rows. `records.jsonl.gz` covers every selected source exactly once. The `curated` status means structurally valid and source-complete. `rework.jsonl.gz` holds cases that require another independent pass, including partially valid readings retained for diagnosis.

To independently confirm a complete logical batch, prepare a review pool and pass any compatible prior review directories. Their exact verified judgments are reused.

```sh
logical="$work/logical-00000"
review="$work/confirmation"
mkdir -p "$review"
node experiments/native-teacher/curation-review-data.mjs prepare "$logical" "$review" "$knowledge"
bash experiments/native-teacher/curation-review.sh "$review" /path/to/prior/review
node experiments/native-teacher/curation-review-data.mjs accept "$logical" "$review" "$knowledge"
```

The validated `accepted.jsonl.gz` contains up to two independently acceptable circuits per source. If two survive, it preserves the stated ambiguity. A separate `rework.jsonl.gz` captures source rows without an accepted reading. Publication is a separate operation. When a prior review is still running, its scheduled `targets.json.gz` can be passed as the final `prepare` argument in a separate review directory. That preliminary pool excludes exact overlapping targets. After both reviews seal, prepare the full pool without the filter in another directory and pass both completed review directories. This avoids duplicate model calls while retaining a judgment for every published circuit.
