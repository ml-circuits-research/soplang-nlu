# Paired WebMeet evaluation

The sample contains 1,861 records (1,860 distinct original texts), selected with seed 42 from the 186,085 rows in dataset revision d25c264. This sample was frozen before the subsequent global deduplication. The three strategies received the same original inputs. Sixteen workers per strategy processed the texts; prediction files use sample IDs for comparison.

| Strategy | L0 | L1 | L2 | L3 | L4 | Reasonable messages | Generation wall time | Median request | p95 request |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Z3 | 18 | 1,380 | 151 | 30 | 272 | 302 / 1,861 (16.23%) | 740.02 s | 2,839 ms | 16,073 ms |
| Symbolic Prolog | 1,280 | 352 | 131 | 0 | 90 | 90 / 1,861 (4.84%) | 13.24 s | 13.85 ms | 327.89 ms |
| Prolog example transfer | 932 | 432 | 118 | 302 | 69 | 371 / 1,861 (19.94%) | 16.74 s | 19.56 ms | 372.75 ms |

The common automatic evaluator marked eight reference sets invalid. Two Z3 results had reader errors. All rates above use the full sample. Z3 hit its WebAssembly heap limit in one worker. Its time includes 683.20 s for the first pass and 56.82 s for a retry of all 117 rows assigned to that worker. Raw timing and retry IDs are in z3-recovery/. The initial run used worker threads, and recovery and the final supervised run used isolated processes. These times describe the recorded configurations, including their native proposal budgets.

The supervised run excluded 2,048 rows whose original text occurred in evaluation. It considered the remaining 184,037 rows with 184,224 reference circuits. The exact text intersection was empty. Split preparation took 2.93 s and induction took 9.02 s. Training produced 76,441 slot templates. The temporary model was removed after evaluation. Case and Unicode distinctions apply to training membership, support counts, and fixed pattern anchors. The code implementing the evaluated version 2 model is recorded in commit 62c0947. The historical-folded-training-split directory preserves the earlier superseded experiment.

The example-trained strategy retained all 90 reasonable symbolic Prolog interpretations at message level and gained 281 messages. Z3 alone succeeded on 171 messages where both Prolog strategies fell short. Across distinct whole candidates, the evaluator accepted 350 of 11,377 Z3 candidates, 130 of 6,541 symbolic Prolog candidates, and 655 of 7,905 supervised Prolog candidates. Grade, source evidence and diagnostic artifacts support inspecting these alternatives independently of order. The two review files group the 1,825 messages on which at least one strategy fell short.

The shared lexical layer found at least one part of speech for 25,895 of 28,026 tokens, and included 9,736 tokens in nominal phrase hypotheses. The syntax checker validated spans and local attachments on all 1,861 texts. These checks measure surface coverage and local structural consistency; scope and semantic correctness require additional judgments.
