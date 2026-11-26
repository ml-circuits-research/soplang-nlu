# Shared transformer dependency evidence on 100 development inputs

Both solvers consumed the same in-memory transformer dependency graph per source. The matching compact timing run also supplies one graph per source to both solvers. The two matrix runs used the same library revision `ba45137`, including neuro-Prolog projection from `c944e7c`, neuro-Z3 search from `5e004fe`, and the same schema. All 100 compact and transformer input and graph digests match their separate raw audits. The timed compact public candidates also match the exact previously reviewed compact hybrid candidates on every input. All rows come from the [frozen historical development sample](../2026-11-26-uniform-development-100/README.md).

| Strategy | Model | NONE | SOME | ALL | ANY | Source-eligible rows |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Standalone mapper | Compact | 68 | 0 | 32 | 32 | 43 |
| Standalone mapper | Transformer | 60 | 0 | 40 | 40 | 44 |
| Neuro-Prolog, refined | Compact | 41 | 21 | 38 | 59 | 80 |
| Neuro-Prolog, refined | Transformer | 34 | 22 | 44 | 66 | 77 |
| Neuro-Z3 | Compact | 66 | 0 | 34 | 34 | 54 |
| Neuro-Z3 | Transformer | 54 | 0 | 46 | 46 | 55 |

Each count is also its percentage. The standalone rows reference the [paired mapper audit](../2026-11-26-spacy-direct-dev100/README.md). The compact Prolog row uses the refined compact audit included under `compact-refined/`. The compact Z3 row uses the [gate-corrected initial hybrid audit](../2026-11-26-neural-native-dev100/README.md). Each strategy's SOME and ALL counts derive from its public alternatives. ANY is SOME plus ALL.

The transformer adds nine and loses two accepted inputs compared with compact neuro-Prolog. It adds 15 and loses three compared with compact neuro-Z3. At least one compact hybrid covers 61 inputs. At least one transformer hybrid covers 68, adding ten and losing three from the compact pair. All four hybrid inventories together cover 71. The standalone mapper adds no further accepted inputs within either model because its successes are contained in the paired hybrid coverage. These unions describe offline availability of a suitable circuit. They do not measure the quality of a strategy that combines or ranks the sets.

| Same-backend input switch to transformer | Compact accepted, transformer rejected | Compact rejected, transformer accepted |
| --- | ---: | ---: |
| Refined neuro-Prolog | 2 | 9 |
| Neuro-Z3 | 3 | 15 |

Both hybrids now accept “give Start a width of 180 and height of 90” and “can you make the caps on the error bars bigger?” The transformer graph coordinates the two dimensions at the correct head in the first example and supports the comparative result of `make` in the second. On the other hand, refined neuro-Prolog maps `Build` to a nonfinite predicate in “maybe nudge Build right above Retire,” and transformer neuro-Z3 leaves part of the source unresolved in “double it up: put six houses by the lake.” The compact outputs for the corresponding strategy were accepted. The literal paired IDs and adjudicated reasons are in `comparison.json` and `review/public-set-judgments.jsonl.gz`.

Of the 74 transformer graphs judged usable in the [raw graph audit](../2026-11-26-transformer-dependency-dev100/README.md), 60 inputs have an accepted refined neuro-Prolog alternative and 44 have an accepted neuro-Z3 alternative. Of the remaining 26, those totals are six and two. Neuro-Prolog includes symbolic alternatives, so its accepted counts reflect the whole public set. Among usable graphs without an accepted circuit, neuro-Prolog has nine static source failures and five source-eligible review failures. Neuro-Z3 has 22 and eight respectively.

## Matched serial timing

| Strategy | Model | Mapping p50 / p95 | Model plus mapping p50 / p95 |
| --- | --- | ---: | ---: |
| Neuro-Prolog | Compact | 18.76 / 54.03 ms | 21.26 / 57.18 ms |
| Neuro-Prolog | Transformer | 20.52 / 54.81 ms | 69.15 / 142.41 ms |
| Neuro-Z3 | Compact | 6.34 / 91.47 ms | 8.72 / 95.24 ms |
| Neuro-Z3 | Transformer | 7.68 / 93.93 ms | 56.71 / 189.05 ms |

Both matrix runs processed all inputs with zero reader errors. Model startup took 0.391 s compact and 2.529 s transformer. Serial model-only p50 was 2.32 ms and 48.56 ms respectively. Model-plus-mapping percentiles are measured on per-input combined times. The two solvers share the parser invocation during a matrix run.

## Review and replay

There were 193 distinct eligible source-and-circuit pairs across 79 messages. Two blind singleton reviewers judged 56 novel pairs. The pipeline reused 137 exact prior pairs, including the compact refined audit. It independently settled 17 acceptance disagreements and audited 40 sampled agreements, contradicting two. The judge called no source-eligible circuit structurally empty. Transformer Prolog's nonzero levels are L1 4, L2 23, L3 7, L7 22, and L8 44. Transformer Z3's are L1 4, L2 45, L3 3, L4 2, and L8 46. No native reference sets entered this historical cohort.

From the NLU checkout, the archived predictions and votes reproduce the matrix without model inference or reviewer calls.

```sh
out=eval-results/2026-11-26-transformer-hybrids-dev100
node tests/benchmark/meaning-review/review-public-candidates.mjs score "$out/review" "$out/inference" neuro-prolog,neuro-z3
node "$out/verify-graphs.mjs"
python3 "$out/compare.py" "$out" eval-results
```
