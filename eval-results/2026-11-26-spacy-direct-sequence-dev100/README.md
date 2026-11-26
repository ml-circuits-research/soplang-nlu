# Standalone spaCy sequence repair addendum

The final standalone snapshot `39b3b0e` applies a local comma and sequencing repair to the [earlier mapping refinement](../2026-11-26-spacy-direct-refinement-dev100/README.md) on the same historical development inputs. All 200 exact source and dependency graph digests match the earlier results. Circuit text changed on six compact inputs and seven transformer inputs. Every input still returned one public circuit without reader error.

| Model | NONE | SOME | ALL / ANY | Change from refinement | Source-eligible | Serial parser plus mapping p50 / p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Compact | 56 | 0 | 44 | +1 / −0 | 64 | 1.99 / 4.35 ms |
| Transformer | 31 | 0 | 69 | +3 / −0 | 75 | 48.10 / 79.81 ms |

Counts and percentages coincide because each model saw 100 inputs. Both models were accepted on 42 inputs, compact alone on two and transformer alone on 27. Neither succeeded on 29. Mapping-only p50/p95 was 0.24/0.62 ms for compact and 0.46/1.21 ms for transformer. Model startup was 0.390 s and 2.540 s respectively.

Both models gained “drop the two clouds from the scene, then show two more boats on either side of the tree line.” The circuit retains the two predicates, their objects, and the placement qualifier. Transformer also gained the three successive green and purple block placements in `drawing/scenes-11.csv#2244` and the paired title and caption instructions in `diagram/nodes-03.csv#217`. The compact caption circuit is source-complete but still treats the second instruction as a declarative. All three transformer gains were previously judged unusable at the raw graph stage. Transformer accepts 66 of 74 usable graphs and now recovers three of 26 raw-rejected graphs. Exact before and after circuits and reasons are in `comparison.json.gz`.

Only three novel eligible circuits per model required new independent primary and secondary review. Both reviewers accepted the four model-input gains. Earlier decisions were reused for 61 compact and 72 transformer exact circuit identities. The full sets contain six and four threshold disputes respectively, all inherited and independently adjudicated. Separate agreement checks contradicted three of 37 compact and two of 24 transformer consensus judgments. Compact's nonzero levels are L1 9, L2 36, L3 10, L5 1 and L8 44. Transformer's are L1 3, L2 25, L3 3 and L8 69.

From the NLU checkout, offline rescoring and evidence verification use the sealed archives.

```sh
out=eval-results/2026-11-26-spacy-direct-sequence-dev100
for model in compact transformer; do
  node tests/benchmark/meaning-review/review-public-candidates.mjs score "$out/$model/review" "$out/$model/inference" spacy-direct
done
node "$out/verify-graphs.mjs"
python3 "$out/compare.py" "$out" eval-results
```
