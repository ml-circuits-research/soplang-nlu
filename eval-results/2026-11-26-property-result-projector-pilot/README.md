# Property result projector pilot

The pilot changed zero candidate lists across 350 sources. The pretrained direct, pretrained beam, adapted beam, adapted compact, and neuro-Prolog outputs matched the baseline by exact SOP, rank and source eligibility. The frozen selector also returned identical outputs. No candidate was added or removed.

| Cohort | Strategy | Source-eligible candidates / public candidates | At least one acceptable | All acceptable |
| --- | --- | ---: | ---: | ---: |
| Validation (100) | Pretrained spaCy direct | 77 / 100 | 53% | 53% |
| Validation (100) | Pretrained spaCy beam | 156 / 173 | 60% | 39% |
| Validation (100) | Frozen neuro-selector | 257 / 264 | 80% | 33% |
| Historical diagnostic (250) | Pretrained spaCy direct | 202 / 250 | 66.4% | 66.4% |
| Historical diagnostic (250) | Pretrained spaCy beam | 386 / 425 | 71.6% | 48.0% |
| Historical diagnostic (250) | Frozen neuro-selector | 641 / 660 | 80.0% | 42.8% |

These percentages use all inputs as denominators. A public candidate that fails the completeness gate cannot count as acceptable. Empty outputs count in neither acceptance numerator. The selector can return one partial fallback on inputs with no eligible circuits. Every eligible source and circuit pair reused its exact independently reviewed judgment. There were 374 reused judgments on validation and 943 on the historical diagnostic. The review plans count each direct public observation twice because the plan combines both standalone versions. It deduplicates exact source and circuit pairs before looking up judgments.

## Revisions and cohorts

The baseline is the [four-family archive](../2026-11-26-neuro-selector-proposal-pools/) with projector `3fc0d9520027dcc5f037be2b8cc35259f7b80904`. The pilot used a detached worktree of `09b726f` with only the two production projector files from `cce9227c1073caf4f4989fd1ba357b39b02d3e63` swapped into `strategies/spacy-direct/`. The resulting file digests were verified against that commit. Knowledge revision and all three dependency model artifacts followed the original pool manifest. The transformer wrapper used one thread and the compact transport used the local spaCy Python environment. Both standalone revisions took each source's same pretrained transformer dependency graph, replayed through the public reader with alternating baseline/pilot order. The selector replay used the installed frozen model, SHA-256 `88efccb159cafae9e38a8bfcc3a1da69249c995c4fb8be3ca4a5e1f76b71abc1`, its unchanged feature extraction and selection, and the public reader's stored pool records. The 500 fitting inputs and fresh random test were outside this measurement.

## Timing

| Cohort | Timing scope | Baseline median / p95 (ms) | Pilot median / p95 (ms) |
| --- | --- | ---: | ---: |
| Validation | Four-family pool request | 118.33 / 208.26 | 117.39 / 214.97 |
| Historical diagnostic | Four-family pool request | 113.77 / 269.75 | 111.74 / 270.61 |
| Validation | Standalone direct projection and public source check | 0.388 / 0.872 | 0.406 / 1.234 |
| Historical diagnostic | Standalone direct projection and public source check | 0.333 / 0.774 | 0.344 / 0.813 |

Pool wall times include dependency inference, native synthesis and public source checks. Baseline pool timings come from the earlier archived run, with validation requests taken from the shared training and validation stream. The paired standalone direct timings exclude the shared dependency parse, which took a median 50.85 ms on validation and 48.62 ms on the historical diagnostic. The measurement used one replay per condition, so the timing differences do not establish a performance change.
