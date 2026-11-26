# Standalone spaCy on the historical 1% cohort

Both standalone models formalized the same frozen historical 1% cohort of 1,861 rows and 1,860 distinct texts. All 100 inputs used during mapper development are present. The table below also shows the other 1,761 rows as a sensitivity check. Both views are historical. The locked fresh final 1% is a separate evaluation.

Both inference runs used spaCy 3.8.16, pretrained model version 3.8.0 and the same parser-to-circuit code at `39b3b0e`. The full-model library revisions in the run manifests differ by unrelated changes. Each model returned one public circuit per input and had zero reader errors.

| Cohort | Model | NONE | SOME | ALL | ANY | Reached source gate |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Historical 1% | Compact | 66.15% | 0.00% | 33.85% | 33.85% | 54.65% |
| Historical 1% | Transformer | 50.19% | 0.00% | 49.81% | 49.81% | 61.20% |
| Excluding known development IDs | Compact | 66.72% | 0.00% | 33.28% | 33.28% | 54.12% |
| Excluding known development IDs | Transformer | 51.33% | 0.00% | 48.67% | 48.67% | 60.42% |

On the full cohort, both were accepted on 29.55%, compact alone on 4.30%, transformer alone on 20.26%, and neither on 45.89%.

| Model | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Compact | 0.00% | 10.64% | 45.35% | 8.22% | 0.06% | 0.54% | 1.34% | 0.00% | 33.85% | 0.00% | 0.00% |
| Transformer | 0.00% | 4.41% | 38.80% | 6.02% | 0.16% | 0.05% | 0.75% | 0.00% | 49.81% | 0.00% | 0.00% |

L2 reflects a material source coverage failure. L8 means the public set was wholly acceptable. Each model emitted a singleton, which makes ALL and ANY equal. The historical sample supplied no native reference sets for L9 or L10.

| Model | Model startup | Mapping p50 / p95 | Parser plus mapping p50 / p95 | Aggregate parser plus mapping |
| --- | ---: | ---: | ---: | ---: |
| Compact | 0.411 s | 0.17 ms / 0.36 ms | 1.72 ms / 2.96 ms | 3.43 s |
| Transformer | 2.549 s | 0.21 ms / 0.38 ms | 50.50 ms / 79.80 ms | 98.86 s |

Timings come from the named single-worker inference archives. Aggregate times sum per-input parsing and mapping. Model startup is listed separately.

## Blind review and replay

Compact had 1017 distinct eligible exact source-and-circuit pairs. The two independent reviewers disagreed on the acceptance threshold for 75 targets, all independently adjudicated. The third reviewer contradicted 1 of 40 audited agreements. The compact model required 592 new independent reviews per reviewer after exact identity reuse.

Transformer had 1139 distinct eligible exact source-and-circuit pairs. The two independent reviewers disagreed on the acceptance threshold for 97 targets, all independently adjudicated. The third reviewer contradicted 1 of 40 audited agreements. The independent jobs examined all targets.

Identical historical predictions share exact decisions across the models. The historical transformer vote takes precedence for a shared candidate previously graded in development. More detail and replay commands are in [the archived methodology](METHODOLOGY.md).

The inference and review folders preserve exact source IDs, candidate packets, static and reviewer decisions, timings and execution metadata. See `comparison.json` for exact counts and the development overlap IDs.
