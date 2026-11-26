# Standalone spaCy on the frozen 100-input development cohort

The same deterministic `spacy-direct` projector at `d8ffecd` converted compact and transformer spaCy dependency graphs to the native schema. Both models are version 3.8.0 and ran with spaCy 3.8.16. The two runs use the [frozen historical cohort](../2026-11-26-uniform-development-100/README.md). All 100 graph digests match their respective raw graph audits. All compact serial and eight-worker public candidate sets also match exactly. These are development results.

| Model | NONE | SOME | ALL | ANY | Source-eligible | Serial parser + mapping p50 / p95 | Serial mapping only p50 / p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Compact | 68 | 0 | 32 | 32 | 43 | 2.01 / 3.85 ms | 0.21 / 0.50 ms |
| Transformer | 60 | 0 | 40 | 40 | 44 | 52.25 / 100.15 ms | 0.31 / 0.77 ms |

Each count is also its percentage. Each model returned one public candidate per input and had zero reader errors. Compact took 0.797 s in the separate eight-worker run, with p50 2.65 ms and p95 9.43 ms. In matched serial timing, model startup cost 0.404 s for compact and 2.568 s for transformer. The median serial parser and mapping time was about 26 times as high with the transformer. Mapping alone accounted for little of the cost.

| Paired comparison | Both accepted | Current model only | Comparator only | Neither accepted |
| --- | ---: | ---: | ---: | ---: |
| Compact direct vs compact neuro-Prolog | 31 | 1 | 21 | 47 |
| Compact direct vs compact neuro-Z3 | 26 | 6 | 8 | 60 |
| Compact direct vs either compact hybrid | 32 | 0 | 23 | 45 |
| Transformer direct vs compact direct | 31 | 9 | 1 | 59 |
| Transformer direct vs compact neuro-Prolog | 34 | 6 | 18 | 42 |
| Transformer direct vs compact neuro-Z3 | 26 | 14 | 8 | 52 |
| Transformer direct vs either compact hybrid | 36 | 4 | 19 | 41 |

The comparator strategies are the [first archived compact hybrids](../2026-11-26-neural-native-dev100/README.md). The exact gained and lost IDs for each pair are in each model's `paired.json.gz`. The transformer gains include “give Start a width of 180 and height of 90” and “a farm with a shed, a boulder, a kid, and a goat.” Its raw graph preserves the intended coordination for those examples. The sole compact-only success is “erase one document,” where the transformer incorrectly makes the noun `document` the root and attaches `erase` as its determiner.

## Raw graph to circuit

| Raw state and model | Accepted circuit | Source-incomplete circuit | Source-complete circuit rejected |
| --- | ---: | ---: | ---: |
| Compact usable (50) | 31 | 16 | 3 |
| Compact rejected (50) | 1 | 41 | 8 |
| Transformer usable (74) | 40 | 32 | 2 |
| Transformer rejected (26) | 0 | 24 | 2 |

The [raw compact audit](../2026-11-26-neural-dependency-dev100/README.md) and [raw transformer audit](../2026-11-26-transformer-dependency-dev100/README.md) show a 24-point raw plausibility gain. The identical circuit mapper realizes eight points of downstream gain. Among the 74 usable transformer graphs, 32 lose material source coverage during conversion. The correction priorities are illustrated by these exact outputs.

- In “now route that arrow around Verify instead,” the transformer graph makes `around` a prepositional modifier of `route` and `Verify` its object. The projector leaves the phrase unresolved because `Verify` is tagged as a verb. The dependency role supplies the appropriate constraint on how the name is used here.
- In “double it up: put six houses by the lake,” the transformer graph retains the colon-separated second verb, its object, and its locative PP. The projector drops the entire second clause because `put` is attached with a generic dependency.
- In “make a bench by the tent; on top of that, put a lantern on the bench,” both graphs preserve the two verb heads and their arguments, but the projector treats the first directive as nonfinite and subordinates it to the second. Both variants fail the same source-eligible review.

## Review and replay

Source eligibility required grounded native schema and full material coverage. Sol and Terra reviewed the 43 eligible compact circuits and the 22 transformer circuits that differ from all previously reviewed circuits. The transformer run reused 22 exact compact source and circuit judgments. Review packets had a single literal candidate and concealed model and strategy. A separate Sol reviewer resolved the two compact threshold disagreements and audited 30 agreements, contradicting four. It found no initial threshold disputes in the transformer run and contradicted two of 24 audited agreements. Consensus checks record judge variability. The settling policy uses the third vote for a threshold disagreement. The prompt explicitly allows the static gate's incidental punctuation exceptions.

Rule levels for compact are L1 3, L2 57, L3 6, L5 2 and L8 32. For transformer they are L1 2, L2 56, L3 1, L5 1 and L8 40. The archive includes raw predictions, public judgments, exact source-and-circuit overlap, original votes, timing, and packet digests. Use the candidate scorer and pairing script from the NLU checkout to reproduce the results without calling a reviewer.

```sh
base=eval-results
out="$base/2026-11-26-spacy-direct-dev100"
for model in compact transformer; do
  node tests/benchmark/meaning-review/review-public-candidates.mjs score "$out/$model/review" "$out/$model/inference" spacy-direct
done
node "$out/verify-paired-graphs.mjs"
python3 "$out/compare.py" "$out/compact" "$base/2026-11-26-neural-native-dev100" "$base/2026-11-26-neural-dependency-dev100"
python3 "$out/compare.py" "$out/transformer" "$base/2026-11-26-neural-native-dev100" "$base/2026-11-26-transformer-dependency-dev100" "$out/compact"
```
