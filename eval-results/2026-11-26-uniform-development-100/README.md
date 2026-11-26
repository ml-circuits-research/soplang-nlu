# Uniform historical development baseline

This paired snapshot measures native Z3 and symbolic Prolog on 100 row IDs from the same historical development population of 1,861. The sample was selected before inspecting predictions by ranking each historical ID on SHA-256 of the independent seed, a NUL byte, and the exact ID. The 100 smallest digests were selected. Rows were retained in digest-rank order. No grammatical, domain, or parser filter entered the draw. Historical reference circuits were removed before inference. This is a development measurement on previously available data.

The frozen IDs and source texts are in `inference/sample.json.gz`. The selection seed and the hash of the historical parent sample are in `selection.json`. The tested source is Git revision `ccd5bffc7cdf76a9474d38ee175d995e893a47f9` with `engine-source.patch.gz` applied. The patch records the in-progress parser code as it stood at the paired snapshot. `inference/environment.json` records schema, runtime, worker count, and world revision, and the two timing JSONs include worker startup and shutdown.

The source gate checks native schema validity, surface evidence grounding, and material syntactic coverage. Every eligible distinct exact source and public circuit combination was independently reviewed in literal singleton form by Sol and Terra. Reviewer packets gave each reviewer the full source and circuit with no engine, rank, or gold reference. A fresh Sol reviewer adjudicated every threshold disagreement and audited a deterministic sample of the initial agreements. Candidate packets, exact judgments and execution records are under `review/`. Set outcomes are computed over all public candidates. A public reading that fails the static gate is unaccepted. Archived internal rejections provide diagnostics and are excluded from the set. SOME means at least one accepted and at least one unaccepted public reading. ALL requires a nonempty wholly accepted set. ANY is SOME plus ALL.

## Results

| Strategy | NONE | SOME | ALL | ANY | Rows with eligible readings | Eligible public candidates | Inference wall time |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Z3 | 72 | 8 | 20 | 28 | 51 | 81 / 191 | 17.440 s |
| Symbolic Prolog | 68 | 13 | 19 | 32 | 65 | 77 / 165 | 2.448 s |

Each outcome count is also a percentage because both strategies saw 100 inputs. The sample contains 46 diagrams, 43 drawings, six calendar inputs and five documents. Both readers completed all 100 requests with zero errors, using eight workers per strategy. Wall time includes worker startup and shutdown. Prolog had an acceptable reading on 13 inputs missed by Z3. Z3 had one on nine inputs missed by Prolog. Both had one on 19 inputs, and neither had one on 59. The four-point ANY difference describes this development snapshot, with 22 paired disagreements on whether a strategy supplied any acceptable reading.

| Strategy | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Z3 | 2 | 9 | 49 | 10 | 1 | 1 | 0 | 8 | 20 | 0 | 0 |
| Symbolic Prolog | 0 | 17 | 35 | 13 | 1 | 1 | 1 | 13 | 19 | 0 | 0 |

L2 counts material source gaps under the coverage gate. Meaningful but incorrect clause structure and argument roles account for most remaining misses. For example, on “click on the sail of the boat,” Z3 offered correct readings and also a reading that attached “of the boat” to the clicking action instead of the sail. Both readers left material source ungrounded in “Give me the leading pair of products by revenue, and finally, what proportion of revenue is the pair?” This archive supplied no native reference sets for L9 or L10.

Sol and Terra agreed on the acceptance threshold for 135 of 158 exact candidate targets (85.4%) and on exact grade for 122 (77.2%). The third reviewer accepted 7 of the 23 threshold disagreements. It disagreed with the original consensus in 3 of the 40 stratified agreement checks. The scoring policy uses the third decision to settle threshold disagreements and keeps the agreement audit as a reproducibility diagnostic. Results depend on the model judgments, the small historical sample and the captured development snapshot. The fresh 1% has its own protocol and remains separate.

## Replay

Copy only `sample.json.gz` from this archive into a new frozen input directory, and copy this archive's `inference/environment.json` there to carry the sampling metadata. Use a clean worktree at the recorded revision and apply the decompressed engine patch before running inference there. Supply the installed knowledge, SWI-Prolog and Z3 as in the archived environment. For example, from the NLU checkout and with those environment variables set:

```sh
STRATEGIES=z3,prolog WORKERS=8 node tests/benchmark/port-run.mjs "$frozen" "$run"
node tests/benchmark/meaning-review/prepare-native.mjs "$run" "$review" "$KNOWLEDGE_DIR" z3,prolog-worlds
node tests/benchmark/meaning-review/review-public-candidates.mjs plan "$review"
node tests/benchmark/fresh-eval.mjs primary "$review"
node tests/benchmark/fresh-eval.mjs independent "$review"
node tests/benchmark/fresh-eval.mjs audit-plan "$review"
node tests/benchmark/fresh-eval.mjs audit "$review"
node tests/benchmark/meaning-review/review-public-candidates.mjs score "$review" "$run" z3,prolog-worlds
```

The two offline strategy-subset arguments require the reviewer tooling at `3f82a93` or newer. The recorded judge decisions can be rescored directly for the original predictions. Fresh model decisions can differ between replays.
