# Standalone spaCy refinement on the frozen development cohort

This is a paired evaluation of the direct native mapper at `fe2b2b0` on the same 100 historical inputs and two pretrained models as the [original direct comparison](../2026-11-26-spacy-direct-dev100/README.md). Both runs use spaCy 3.8.16 and English model version 3.8.0. Exact source and dependency graph digests match the original runs for all 200 model-input pairs. The experiment measures this mapper and schema revision with the dependency evidence held fixed.

| Model | Prior ANY | Refined NONE | Refined SOME | Refined ALL / ANY | Gains / losses | Source-eligible before → after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Compact | 32 | 57 | 0 | 43 | 11 / 0 | 43 → 61 |
| Transformer | 40 | 34 | 0 | 66 | 26 / 0 | 44 → 71 |

The strategies each returned a single public circuit on every input and had zero reader errors. All outcomes are also percentages. Both refined models succeeded on 41 inputs, compact alone on two, and transformer alone on 25. Neither succeeded on 32. Direct transformer and the archived transformer neuro-Prolog run each accept 66, with 57 shared and nine exclusive to each. The refined direct transformer supplies an acceptable circuit on seven inputs missed by both archived transformer hybrids. Their combined offline availability is 75. These are observed development results from reviewed parser outputs.

| Raw graph quality | Accepted circuit | Source incomplete | Source-eligible but rejected |
| --- | ---: | ---: | ---: |
| Compact usable (50) | 41 | 4 | 5 |
| Compact rejected (50) | 2 | 35 | 13 |
| Transformer usable (74) | 66 | 6 | 2 |
| Transformer rejected (26) | 0 | 23 | 3 |

The transformer now converts 66 of 74 usable raw graphs into accepted circuits, compared with 40 before the refinement. The comparison archive includes exact before/after circuits, raw dependencies, and reasons for all changed outcomes.

- In “now route that arrow around Verify instead,” both models now use `Verify` as the name of the prepositional object and preserve “now” and “instead.”
- In “make a bench by the tent; on top of that, put a lantern on the bench,” both models now emit the initial `make` as a separate imperative. The old circuit incorrectly marked it nonfinite.
- On the transformer input “double it up: put six houses by the lake,” the refined circuit preserves the second imperative with its object and location. The old circuit left the entire second directive unresolved.
- In “squash the poster shorter,” the refined outputs explicitly use `result_complement="shorter"`. Both raw graphs attach `shorter` to `squash` as `advmod`.
- On the transformer input for creating a document titled Exam guidance, the refined circuit groups the quoted sentence as the contents literal and links both titling and containing to the document. The previous circuit left part of the quoted source unresolved.

## Serial timing and independent review

| Model | Model startup | Mapping p50 / p95 | Parser plus mapping p50 / p95 |
| --- | ---: | ---: | ---: |
| Compact | 0.407 s | 0.40 / 1.20 ms | 2.62 / 5.29 ms |
| Transformer | 2.535 s | 0.47 / 1.13 ms | 51.32 / 83.25 ms |

Both serial runs used the same matrix runner. Per-input parser time is included in the combined timing. The revised standalone compact scores are L1 7, L2 39, L3 10, L5 1 and L8 43. The transformer scores are L1 2, L2 29, L3 3 and L8 66. No native reference sets entered the cohort.

The compact run had 61 eligible exact source/circuit pairs, with 34 archived votes reused and 27 novel pairs judged blind. The transformer run had 71 eligible pairs, with 46 archived votes reused and 25 novel pairs judged blind. Sol and Terra independently assessed the novel candidates. A separate Sol reviewer settled acceptance disagreements. The full compact vote set had six threshold disagreements, and the transformer set had four. Independent checks contradicted four of 35 compact agreements and two of 23 transformer agreements. The settling policy gives the third vote authority on threshold disagreements, with agreement audits reported for reproducibility.

From the NLU checkout, rescore the archived votes without inference or reviewer calls.

```sh
out=eval-results/2026-11-26-spacy-direct-refinement-dev100
for model in compact transformer; do
  node tests/benchmark/meaning-review/review-public-candidates.mjs score "$out/$model/review" "$out/$model/inference" spacy-direct
done
node "$out/verify-graphs.mjs"
python3 "$out/compare.py" "$out" eval-results
```
