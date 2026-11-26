# Fresh one-percent native evaluation

The [sealed protocol](fresh-1pct.lock.json) pins the dataset revision, the native-reference revision, the random seed drawn before sample inspection, and the independent judge models. Sampling hashes the seed and committed row ID, then takes the lowest hashes through the rounded 1% boundary. Keep the frozen sample out of parser development. Prolog example transfer excludes all normalized occurrences of the held-out texts from training, using the same pinned revision.

For development, use the 31 existing [role fixtures](analysis-breadth.md) or select a few targeted cases. Those fixtures do not adjust or draw the fresh cohort.

```sh
node tests/benchmark/fresh-eval.mjs diagnose --strategies z3,prolog
node tests/benchmark/fresh-eval.mjs diagnose --strategies prolog --case temporal-pp --case complement-clause
node --test tests/public-candidate-review.test.mjs tests/native-references.test.mjs
```

Once the engine revisions are ready, launch the explicitly separate final stages from the repository root:

```sh
run=eval-results/fresh-native-one-percent
review="$run/candidate-review"
node tests/benchmark/fresh-eval.mjs infer "$run"
node tests/benchmark/fresh-eval.mjs prepare "$run" "$review"
node tests/benchmark/fresh-eval.mjs primary "$review"
node tests/benchmark/fresh-eval.mjs independent "$review"
node tests/benchmark/fresh-eval.mjs audit-plan "$review"
node tests/benchmark/fresh-eval.mjs audit "$review"
node tests/benchmark/fresh-eval.mjs score "$run" "$review"
```

Inference uses the shared reader and the same worker count for all strategies. Set `WORKERS`, `KNOWLEDGE_DIR`, `SWIPL`, or `Z3_MODULE` as needed. The tool preserves per-strategy startup and inference wall time, percentile latency, errors, retries, and independent transfer training time. Review time is separate. `REVIEW_JOBS` sets model-call concurrency for each pass. If you run two passes simultaneously, split the desired total concurrency between them. The prepared plan reports the exact candidate review target count before any model call.

Only unique exact source/SOP pairs from public returned proposals with grounded, complete material source coverage go to the judges. Invalid, ungrounded and materially incomplete public variants fail the static check. Saved raw rejections are outside the public list. Each model sees literal whole circuits, one candidate per group and as many groups per request as the batch limits permit. Packets contain no strategy labels, native gold, historical references, other judge decisions, or rankings. Use separate ephemeral read-only Codex CLI sessions instructed to use no tools. The runner saves validated checkpoints and retries malformed output.

Two independent model passes review every eligible candidate. A fresh adjudicator sees all L8-threshold disputes and a fixed hash-selected audit of up to 20 agreed acceptances and 20 agreed rejections, without the prior grades. Use the adjudicator to resolve threshold disputes. Keep the primary grade when both initial reviewers agree on acceptance or rejection. Report any contrary audit result so that agreement cannot disguise correlated error. Neither model agreement nor an independent model audit is equivalent to human gold.

The scorer grades each utterance and strategy as NONE (L0–L6), SOME (L7, mixed public proposals), or ALL (L8–L10) using the [proposal-set rubric](meaning-review/native-v3-legend.md). L9 compares the complete normalized acceptable public alternative set with its compatible frozen native gold. The blind candidate workflow does not infer L10 corrections. Counts and percentages use the frozen messages as denominator, and percentages are apportioned to 100.00%. Keep historical benchmark files unmodified.

Archive the reviewed directory and inference artifacts. `candidate-review-summary.json` contains outcome and grade counts, timing and audit metadata. `candidate-decisions.jsonl.gz` retains exact candidate judgments from all reviewer passes. `public-set-judgments.jsonl.gz` retains the public proposals, per-candidate decisions, selected set grade, and reference comparisons. The offline scoring steps are reproducible from the saved prediction and judgment files.
