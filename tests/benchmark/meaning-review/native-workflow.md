# Review an integrated NLU cohort

Run from the repository root. Provide a completed native benchmark directory with its frozen sample and all three engine outputs.

```sh
node tests/benchmark/meaning-review/prepare-native.mjs "$run" "$review" "$knowledge"
python3 tests/benchmark/meaning-review/run-review.py "$review/packets.json.gz" "$review/full.jsonl" --profile native
python3 tests/benchmark/meaning-review/run-review.py "$review/packets.json.gz" "$review/strict.jsonl" --profile native --strict-from "$review/full.jsonl" --rows 5
node tests/benchmark/meaning-review/summarize-native.mjs "$review" "$review/full.jsonl" "$review/strict.jsonl"
```

Preparation validates sample membership and rechecks native candidate structure and source grounding. It removes structurally or source-invalid candidates from the review sets and keeps the original engine memberships and rejection diagnostics. Models receive only the source text and native circuits. Identical eligible proposal sets within a row share one model judgment even when emitted in a different order. The packet and prediction file hashes are recorded in `manifest.json`.

The source-first prompt asks the reviewer to compare every candidate in each nonempty set, and the runner checks that every submitted witness belongs to that set. Empty sets are assigned L0. The model runs in ephemeral read-only sessions instructed to use no tools. Malformed judgments are retried using literal circuit rendering. Validated checkpoints can be reused for the same packet file. Inspect complete `*-batches/execution.json` files for model, settings, and payload identity.

The second pass looks for accepted primary judgments whose reasons mention a possible omission. It rechecks each flagged group against the whole source and candidate set. Review its output and any unresolved discrepancies before publishing. This targeted check can catch internal inconsistencies and does not make the overall grading equivalent to human adjudication. The final merger refuses missing or duplicated groups and maps each selected witness back to its engine's emitted index.

Results include exact grade counts and percentages, selected proposals, source evidence, and concrete reasons in `native-summary.json` and `native-judgments.jsonl.gz`. L8 is the acceptance threshold on this no-native-gold cohort. L9 and L10 are reserved. The quality rates are separate from mechanical coverage, the targeted breadth fixture set, and historical WebMeet metrics under the old schema.
