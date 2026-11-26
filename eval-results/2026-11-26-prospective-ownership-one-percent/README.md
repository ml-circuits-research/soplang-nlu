# Prospective two-reading evaluation

The primary strategy is selector-distilbert with the 7,040-text ownership checkpoint. Its policy and implementation were frozen at a5acd47 before revealing the reserved sample. The primary outcome counts texts with at least one plausible public circuit. Reaching 80% requires at least 1,465 successes among 1,831 texts. All registered strategies run on the same input rows. The independent source review follows the prospective protocol in tests/benchmark/next-evaluation.

The benchmark runs in a detached source checkout with one CPU worker and low scheduling and disk priority, sharing two logical CPUs with the remaining background experiments. Durations measure this constrained configuration. The manifest lists the validated weight and tokenizer digests. The pinned dataset contained no native reference for these exact texts, so L9 and L10 are unavailable for this cohort. Source-first plausibility remains evaluable for every input.

The inference and review stages are in progress. The historical diagnostic that motivated this test produced 81.2% ANY on 250 texts.

## Primary strategy inference complete

The frozen selector-distilbert run returned 1,831 records with zero engine errors. Every public list respected the two-circuit budget. At least one circuit passed the complete-source gate on 1,761 texts (96.18%). This is the static eligibility count, so the 80% whole-reading claim still depends on blind judgments. With one low-priority CPU worker, inference took 616.70 seconds. Median request latency was 256.82 ms and the 95th percentile was 671.86 ms.

All ten original strategy arms completed the 1,831 requests. Neuro-Z3 reported two reader errors. The recovery runner kept those outcomes in the frozen cohort and started blinded review from the saved artifacts. Exact deduplication left 9,127 eligible circuit targets across 1,764 source texts. Each of the two reviewers processes one request at a time with up to 24 texts and 48 candidate groups per request. The two passes run concurrently against identical frozen packets and checkpoint their judgments in separate directories. Adjudication starts after both passes finish. The frozen rubric and reviewer identities still apply.
