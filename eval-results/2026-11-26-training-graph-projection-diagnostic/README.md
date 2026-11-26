# Effect of corrected training dependencies on native projection

The 90 validation texts in the English spaCy adaptation experiment were projected through the same public direct reader at `0b955a1`. Each text was processed twice, once with its original pretrained transformer dependency analysis and once with its independently corrected training target. The same static gate and blind circuit review were used for both. This diagnostic measures the effect of the available supervision on these training-validation texts. It supplies no evidence of fresh benchmark performance.

| Input graph | Source-complete | No accepted reading | Some accepted | All accepted |
| --- | ---: | ---: | ---: | ---: |
| Pretrained | 70.00% | 45.56% | 0.00% | 54.44% |
| Corrected | 71.11% | 40.00% | 0.00% | 60.00% |

Nine texts gained a plausible circuit and four lost one. In 32 texts neither graph yielded an accepted circuit. The corrections concerned syntactic dependencies and tags. Producing a native result also requires deciding which entities, actions, and relations those dependencies express.

The review combined 180 observations into 83 distinct eligible source/circuit targets. A third judge settled all eight threshold disagreements and audited 33 agreements. The training targets themselves were produced by a Sol reviewer, so the judge and teacher model families are partly shared. An observed pass rate here is neither an upper bound on future training nor a human gold standard.

Source data and teacher provenance are in the [compact adaptation archive](../2026-11-26-spacy-compact-adaptation-pilot/README.md). To regenerate inference, run `replay.mjs` from the repository root with the corresponding training artifact directory and a new output directory at the recorded projector revision. Per-request timing was not measured for this cached-graph comparison.
