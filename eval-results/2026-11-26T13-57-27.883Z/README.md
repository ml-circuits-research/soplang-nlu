# Legacy reader timing baseline

This run used the two existing formaliser checkouts before measuring the in-tree ports. Seed 42 selected 1,861 committed rows. The z3 and prolog-worlds files contain the measurements. The environment also records a proposed model-backed Prolog configuration; its worker stopped before opening the engine, so there are no predictions or timing results for that configuration. A subsequent run used the same sample to measure the example-free legacy Prolog reader.

Eight workers per engine processed text only. The common evaluator applied automatic grades after inference. Z3 returned unknown on diagram/nodes-06.csv#90. The evaluator rejected the reference sets for eight rows. Those counts are included in the summary denominator and reported separately from the semantic grades.
