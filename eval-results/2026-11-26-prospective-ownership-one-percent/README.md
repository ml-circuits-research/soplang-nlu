# Prospective two-reading evaluation

The primary strategy is selector-distilbert with the 7,040-text ownership checkpoint. Its policy and implementation were frozen at a5acd47 before revealing the reserved sample. The primary outcome counts texts with at least one plausible public circuit. Reaching 80% requires at least 1,465 successes among 1,831 texts. All registered strategies run on the same input rows. The independent source review follows the prospective protocol in tests/benchmark/next-evaluation.

The benchmark runs in a detached source checkout with one CPU worker and low scheduling and disk priority, sharing two logical CPUs with the remaining background experiments. Durations measure this constrained configuration. The manifest lists the validated weight and tokenizer digests. The pinned dataset contained no native reference for these exact texts, so L9 and L10 are unavailable for this cohort. Source-first plausibility remains evaluable for every input.

The inference and review stages are in progress. The historical diagnostic that motivated this test produced 81.2% ANY on 250 texts.
