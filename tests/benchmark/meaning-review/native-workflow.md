# Review an integrated NLU cohort

Run from the repository root. Provide a completed native benchmark directory with its frozen sample and all three engine outputs.

```sh
node tests/benchmark/meaning-review/prepare-native.mjs "$run" "$review" "$knowledge"
python3 tests/benchmark/meaning-review/run-review.py "$review/packets.json.gz" "$review/luna.jsonl" --profile native --model gpt-6-luna --expanded
python3 tests/benchmark/meaning-review/run-review.py "$review/packets.json.gz" "$review/sol.jsonl" --profile native --model gpt-6-sol --expanded
node tests/benchmark/meaning-review/compare-native-reviews.mjs "$review" "$review/luna.jsonl" "$review/sol.jsonl"
python3 tests/benchmark/meaning-review/run-review.py "$review/packets.json.gz" "$review/adjudicated.jsonl" --profile native --model gpt-6-sol --expanded --strict-from "$review/sol.jsonl" --strict-select "$review/threshold-disagreements.json" --strict-corroborated
node tests/benchmark/meaning-review/summarize-native.mjs "$review" "$review/sol.jsonl" "$review/adjudicated.jsonl"
```

Preparation validates sample membership and rechecks saved native proposals, including the original rejection archive. L0 is assigned when there are no schema-valid, source-grounded proposals. L2 is assigned when every valid proposal has material unresolved content or unaccounted source. Fully accounted exact commas outside a numeric boundary and the utterance-final period can count as incidental unresolved punctuation. The checker preserves that residue as a separate diagnostic. Material punctuation such as a question marker and numeric punctuation stays subject to the same role and lexical-boundary requirements. Filler accounts for literal source without certifying syntactic meaning.

Only the proposals surviving those gates enter the model packet. Models receive only the source text and native circuits. Identical eligible proposal sets within a row share one judgment even when different strategies emitted them in a different order. The packet and prediction file digests, schema digest and checker digest are recorded in `manifest.json`. If a checker change requires replay, use `reuse-native.mjs` to reuse only groups whose original source and complete sorted candidate strings are identical. Match the precise witness string to its new index. The runner's `--salvage` option can then fill in unchanged judgments.

The prompt asks each reviewer to inspect all whole candidates in the supplied set. The runner checks that each selected witness belongs to that set, assigns static grades directly, and retries malformed results. The model sessions are ephemeral and read-only and are instructed to use no tools. The completed `*-batches/execution.json` contains model, settings, wall time, and packet identity.

Compare the two full literal reviews, then recheck threshold disagreements independently on the complete set. Other accepted-judgment flags include an omission mentioned by the reason, explicit initial auxiliary–subject inversion mislabeled declarative, a negative command mislabeled positive, and contracted personal pronouns represented as names. Add independently selected calibration groups with `--strict-select` as an array of objects with `rowIndex` and `group`. The reviewer sees the group without the prior grades for those explicit selections. Static grades do not get sent to model review.

The final merger refuses missing or duplicated groups and maps each selected witness back to the engine's original candidate position. If different groups share the exact accepted circuit for the same source, both get that witness unless the independent recheck explicitly rejected it. Report shared-witness promotions and unresolved witness conflicts separately. Use exact witness votes and a blind singleton separately before promoting a hypothesis to a dataset annotation:

```sh
node tests/benchmark/meaning-review/accepted-native-witnesses.mjs "$review"
python3 tests/benchmark/meaning-review/run-review.py "$review/singleton-packets.json.gz" "$review/singleton.jsonl" --profile native --model gpt-6-sol --expanded
node tests/benchmark/meaning-review/accepted-native-witnesses.mjs "$review" "$review/singleton.jsonl"
```

This stage records v2 witness judgments and their reasons. Use [the current v3 proposal-set rubric](native-v3-legend.md) and `classify-native-sets.mjs` for reported NONE, MIXED, and ALL outcomes. The set classifier takes the sealed run plus the archived v2 judgments and exact-circuit inventory, and requests fresh literal singleton review only when an undetermined candidate could change ALL. The final v3 L7 denotes MIXED, and L8 requires every returned candidate to be acceptable. Model agreement and adjudication do not establish a human-validated error rate.
