# Refreshed standalone spaCy on the historical 1% cohort

Both standalone models formalized the same frozen historical 1% cohort of 1,861 rows and 1,860 distinct texts. All 100 inputs used during mapper development are present. The table below also shows the other 1,761 rows as a sensitivity check. Both views are historical. The locked fresh final 1% is a separate evaluation.

Both inference runs used spaCy 3.8.16, pretrained model version 3.8.0 and the same parser-to-circuit code at `24f248b`. The refresh includes the nominal, clause-boundary, and discourse updates. Both model runs used an isolated checkout. All source and dependency graph digests match the earlier historical runs. Each model returned one public circuit per input and had zero reader errors.

| Cohort | Model | NONE | SOME | ALL | ANY | Reached source gate |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Historical 1% | Compact | 61.10% | 0.00% | 38.90% | 38.90% | 67.97% |
| Historical 1% | Transformer | 39.39% | 0.00% | 60.61% | 60.61% | 76.89% |
| Excluding known development IDs | Compact | 61.56% | 0.00% | 38.44% | 38.44% | 67.46% |
| Excluding known development IDs | Transformer | 40.66% | 0.00% | 59.34% | 59.34% | 76.15% |

| Model | Prior accepted | Refreshed accepted | Gained acceptance | Lost acceptance |
| --- | ---: | ---: | ---: | ---: |
| Compact | 33.85% | 38.90% | 5.16% | 0.11% |
| Transformer | 49.81% | 60.61% | 11.12% | 0.32% |

On the full cohort, both were accepted on 34.12%, compact alone on 4.78%, transformer alone on 26.49%, and neither on 34.61%.

| Model | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Compact | 0.00% | 13.65% | 32.03% | 13.17% | 0.05% | 0.48% | 1.72% | 0.00% | 38.90% | 0.00% | 0.00% |
| Transformer | 0.00% | 6.50% | 23.11% | 8.44% | 0.22% | 0.05% | 1.07% | 0.00% | 60.61% | 0.00% | 0.00% |

L2 reflects a material source coverage failure. L8 means the public set was wholly acceptable. Each model emitted a singleton, which makes ALL and ANY equal. The historical sample supplied no native reference sets for L9 or L10.

| Model | Model startup | Mapping p50 / p95 | Parser plus mapping p50 / p95 | Aggregate parser plus mapping |
| --- | ---: | ---: | ---: | ---: |
| Compact | 0.399 s | 0.25 ms / 0.55 ms | 2.20 ms / 3.55 ms | 4.31 s |
| Transformer | 2.536 s | 0.26 ms / 0.57 ms | 49.28 ms / 79.91 ms | 97.70 s |

Timings come from the named single-worker inference archives. Aggregate times sum per-input parsing and mapping. Model startup is listed separately.

## Blind review and replay

Compact had 1,265 distinct eligible exact source-and-circuit pairs. The two independent reviewers disagreed on the acceptance threshold for 103 targets, all independently adjudicated. The third reviewer contradicted 2 of 40 audited agreements. Each reviewer assessed 290 novel targets after exact identity reuse.

Transformer had 1,430 distinct eligible exact source-and-circuit pairs. The two independent reviewers disagreed on the acceptance threshold for 125 targets, all independently adjudicated. The third reviewer contradicted 2 of 40 audited agreements. Each reviewer assessed 399 novel targets after exact identity reuse.

Identical historical predictions share exact decisions across the models. Prior votes come from exact matches in the historical and nominal development archives. Shared novel answers reuse the same blind votes in both model results. More detail and replay commands are in [the archived methodology](METHODOLOGY.md).

The inference and review folders preserve exact source IDs, candidate packets, static and reviewer decisions, timings and execution metadata. See `comparison.json` for exact counts and the development overlap IDs.
