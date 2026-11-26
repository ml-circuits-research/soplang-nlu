# Frozen fresh 1% native NLU comparison

Eight strategies used the same 1,831 source utterances sampled from the pinned WebMeet revision. The paired sensitivity view excludes 16 literal source matches to the earlier historical cohort, leaving 1,815. The archive preserves the sample, unmodified public outputs and reviewer evidence.

| Strategy | NONE | SOME | ALL |
| --- | ---: | ---: | ---: |
| Z3 | 80.78% | 5.08% | 14.14% |
| Symbolic Prolog | 72.97% | 8.19% | 18.84% |
| Prolog example transfer | 72.69% | 11.03% | 16.28% |
| Neuro-Z3 | 65.92% | 0.05% | 34.03% |
| Neuro-Prolog | 48.01% | 18.73% | 33.26% |
| spaCy direct | 39.49% | 0.00% | 60.51% |
| spaCy beam | 35.12% | 20.04% | 44.84% |
| Neuro-selector | 25.01% | 36.81% | 38.18% |

SpaCy direct had the highest ALL rate at 60.51%. Neuro-selector had the highest ANY rate at 74.99%, with 38.18% ALL and 36.81% SOME.

NONE, SOME and ALL are mutually exclusive and sum to 100%. ANY is SOME plus ALL. The public set includes returned source-incomplete circuits. Any such circuit prevents the set from qualifying as ALL. Internal proposals rejected before public return are diagnostic evidence.

## Exact historical overlap excluded

| Strategy | NONE | SOME | ALL |
| --- | ---: | ---: | ---: |
| Z3 | 80.88% | 5.01% | 14.11% |
| Symbolic Prolog | 72.89% | 8.21% | 18.90% |
| Prolog example transfer | 72.62% | 11.07% | 16.31% |
| Neuro-Z3 | 65.90% | 0.05% | 34.05% |
| Neuro-Prolog | 47.94% | 18.73% | 33.33% |
| spaCy direct | 39.34% | 0.00% | 60.66% |
| spaCy beam | 34.99% | 20.11% | 44.90% |
| Neuro-selector | 24.96% | 36.80% | 38.24% |

## Paired acceptance against spaCy direct

| Comparator | Both | spaCy direct only | Comparator only | Neither |
| --- | ---: | ---: | ---: | ---: |
| Z3 | 16.06% | 44.45% | 3.17% | 36.32% |
| Symbolic Prolog | 22.12% | 38.39% | 4.92% | 34.57% |
| Prolog example transfer | 22.39% | 38.12% | 4.92% | 34.57% |
| Neuro-Z3 | 33.04% | 27.47% | 1.04% | 38.45% |
| Neuro-Prolog | 44.95% | 15.56% | 7.05% | 32.44% |
| spaCy beam | 60.51% | 0.00% | 4.37% | 35.12% |
| Neuro-selector | 60.18% | 0.33% | 14.80% | 24.69% |

## Paired circuit examples

- **drawing/scenes-22.csv#166** — “draw a house, 100 high” Direct left the number 100 unresolved and scored NONE. Beam supplied an accepted nominal adjunct linking “100 high” to the house, alongside a rejected apposition, so it scored SOME.
- **drawing/people-07.csv#25** — “make her hair longer” Direct scored ALL by making her hair the object and “longer” its requested result. Beam included that circuit plus readings that made “longer” a modifier of the hair, giving SOME.
- **diagram/nodes-01.csv#2245** — “give Start a red fill” Both standalone spaCy sets left Start unresolved. Both selector circuits linked Start as recipient and “a red fill” as direct object, giving ALL.
- **drawing/scenes-07.csv#1302** — “guide the kite up four spaces, then over one space to the right and then settle on the boat” Direct kept “settle” as a separate command and attached “on the boat” to it. The three selector circuits all made “settle” an entity, so direct scored ALL and the selector scored NONE.

## Disjoint result grades

| Strategy | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Z3 | 0.11% | 9.34% | 55.82% | 10.87% | 3.17% | 0.22% | 1.25% | 5.08% | 14.14% | 0.00% | 0.00% |
| Symbolic Prolog | 0.00% | 15.35% | 39.05% | 13.60% | 3.44% | 0.22% | 1.31% | 8.19% | 18.84% | 0.00% | 0.00% |
| Prolog example transfer | 0.00% | 15.35% | 39.05% | 13.33% | 3.44% | 0.22% | 1.31% | 11.03% | 16.27% | 0.00% | 0.00% |
| Neuro-Z3 | 0.06% | 6.28% | 52.21% | 5.41% | 0.98% | 0.16% | 0.82% | 0.05% | 34.03% | 0.00% | 0.00% |
| Neuro-Prolog | 0.00% | 10.16% | 25.83% | 10.11% | 0.44% | 0.27% | 1.20% | 18.73% | 33.26% | 0.00% | 0.00% |
| spaCy direct | 0.00% | 7.54% | 21.74% | 8.52% | 0.16% | 0.22% | 1.31% | 0.00% | 60.51% | 0.00% | 0.00% |
| spaCy beam | 0.00% | 7.59% | 15.84% | 9.23% | 0.22% | 0.44% | 1.80% | 20.04% | 44.84% | 0.00% | 0.00% |
| Neuro-selector | 0.00% | 4.53% | 7.05% | 10.32% | 0.27% | 0.66% | 2.18% | 36.81% | 38.18% | 0.00% | 0.00% |

L0 denotes no useful circuit. L1 covers principal form or predicate errors. L2 identifies a static source gap. L3 covers a materially wrong role or attachment. L4 marks a material unsupported assertion. L5 marks a missing clause, predicate or step. L6 marks a missing essential participant, property or detail. L7 means a mixed public set. L8 means a wholly acceptable public set. Rounding is apportioned within each table, so corresponding percentages can differ by 0.01 percentage points.

Native references were frozen for 2 exact sources. L9 requires a wholly acceptable public set equal to that source’s complete frozen native alternative set. L10 requires a wholly acceptable set and independently confirmed material defects in the frozen alternatives. Legacy request circuits are outside this native comparison. Blind judges saw literal source and circuits with all references withheld. No strategy received L9 or L10 on this sample.

## CPU inference timings

| Strategy | Workers | Requests per second | Run wall time | Per-request p50 | Per-request p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Z3 | 6 | 8.97 | 204.08 s | 214.44 ms | 2635.61 ms |
| Symbolic Prolog | 6 | 143.31 | 12.78 s | 5.42 ms | 86.12 ms |
| Prolog example transfer | 6 | 53.03 | 34.52 s | 21.30 ms | 411.49 ms |
| Neuro-Z3 | 6 | 51.29 | 35.70 s | 83.66 ms | 148.15 ms |
| Neuro-Prolog | 6 | 57.01 | 32.12 s | 62.63 ms | 118.52 ms |
| spaCy direct | 6 | 75.27 | 24.33 s | 62.46 ms | 98.69 ms |
| spaCy beam | 6 | 69.64 | 26.29 s | 65.76 ms | 105.58 ms |
| Neuro-selector | 6 | 29.94 | 61.15 s | 135.73 ms | 310.35 ms |

Wall times include worker startup and shutdown. Per-request latencies describe the measured CPU runs. The strategies ran separately. SpaCy direct maps one pretrained dependency graph, while the selector collects four families and invokes two transformer encodings. The timings measure the whole reader path, outside review.

The scored outputs retain one reader error each for Z3 and Neuro-Z3.

Example-transfer preparation took 3.05 s to split and 8.54 s to train. The exact-source split manifest reports zero overlap with the 1,831 evaluation texts.

## Independent review and provenance

Sol and Terra independently judged 8,786 eligible exact source-and-circuit pairs. They agreed on the exact grade for 7,176. A separate Sol reviewer settled all 954 acceptance disagreements and contradicted 6 of 40 sampled agreements. This audit measures judgment sensitivity. The initial consensus determines ordinary agreement labels.

The dataset was frozen at `38ae0b5`. The original seven strategies ran at library revision `3fc0d95`. The selector runtime snapshot was `abcf612` and its sealed weights SHA-256 is `88efccb159cafae9e38a8bfcc3a1da69249c995c4fb8be3ca4a5e1f76b71abc1`. The adapted checkpoint hashes and the candidate-pool and ranker split seals are in [provenance](source-review/provenance.json). Exact source checks independently found zero overlap with the adaptation and selector fitting and validation texts.

The compressed primary, independent, and audit JSONL files preserve their original checked digests. [The evidence directory](source-review/) also contains the candidate and audit packets, exact per-source results, the paired overlap sensitivity, and execution manifests.

## Judge sensitivity

| Strategy | Sol ALL | Terra ALL | Settled ALL | Sol ANY | Terra ANY | Settled ANY |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| spaCy direct | 61.93% | 61.93% | 60.51% | 61.93% | 61.93% | 60.51% |
| spaCy beam | 44.78% | 46.70% | 44.84% | 66.63% | 66.74% | 64.88% |
| Neuro-selector | 37.19% | 40.31% | 38.18% | 76.84% | 77.61% | 74.99% |

The initial judges agreed on acceptance for 89.14% of distinct eligible source-and-circuit pairs. The [sensitivity file](source-review/sensitivity.json) preserves all eight paired model results under each reviewer and the predeclared adjudication rule.
