# spaCy dependency beam pilot

On 250 preselected historical texts, exposing complete beam alternatives raised the number of texts with at least one accepted reading from **152 to 171** (+7.6 percentage points). It reduced the number for which every exposed reading passed from **152 to 113** (−15.6 points). Returning only the first source-complete reading produced **157 accepted texts** (+2.0 points) and abstained on 40 texts. This is a development diagnostic on the historical 250-text Prolog slice.

| Public policy | NONE | SOME | ALL | ANY |
|---|---:|---:|---:|---:|
| Archived greedy | 98 (39.2%) | 0 (0.0%) | 152 (60.8%) | 152 (60.8%) |
| Frozen beam set, maximum three | 79 (31.6%) | 58 (23.2%) | 113 (45.2%) | 171 (68.4%) |
| First source-complete only | 93 (37.2%) | 0 (0.0%) | 157 (62.8%) | 157 (62.8%) |

NONE means zero accepted readings, SOME means the public set has both accepted and rejected readings, and ALL means every reading passed. ANY combines SOME and ALL. First-complete abstentions count as NONE in the fixed denominator. This policy accepted 157 of its 210 returned readings (74.8%). The greedy baseline accepted 152 of its 195 source-complete readings (77.9%).

The beam added a source-complete reading on 15 texts. Six of these texts gained at least one accepted reading. On 13 other texts the original greedy reading was already source-complete and failed semantic review, but an alternative passed. The first-complete policy still returns the greedy circuit in those 13 cases. No text lost its only accepted reading under the beam-set policy. Adding a rejected alternative made 43 previously accepted singleton sets mixed.

## Frozen inference and review

- The archived sample, exact source hashes and every greedy dependency graph hash and public SOP match the official transformer run at `24f248b`. The historical revision, model metadata and input checksums are in [inference/environment.json](inference/environment.json).
- spaCy 3.8.16 with `en_core_web_trf` 3.8.0 supplied both readings. The pilot ran one warmed CPU process with one OpenMP and MKL thread. It reused the model’s encoded features and ran the native spaCy dependency beam at width 8 and density 0.0001. It projected at most three distinct dependency alternatives per text through the same direct projector.
- The public selection kept the greedy circuit if source-complete, then took up to two distinct complete alternatives in descending beam-score order. It kept the original partial circuit when no complete circuit survived. Source completeness used the historical schema and checker, with the same incidental-punctuation rule.
- Of 397 distinct eligible exact source-and-circuit pairs, 195 reused compatible historical decisions. Independent blind `gpt-6-sol` and `gpt-6.1-terra` reviews saw the remaining 202 literal sources and individual SOPs without engine, rank, or beam score. They agreed to accept 98 and reject 78. Of their 26 novel threshold disagreements, `gpt-6.2-sol` accepted 7. Across archived and novel pairs, the review protocol covered 48 threshold disagreements and audited 40 threshold agreements. One of those agreement audit votes contradicted the two original votes. Policy counts before adjudication are in [summary.json](summary.json).

## Timing

| Timed stage | Mean | Median | p95 |
|---|---:|---:|---:|
| Greedy spaCy pipeline | 53.48 ms | 49.60 ms | 83.89 ms |
| Additional beam parsing and alternative extraction | 1.02 ms | 0.78 ms | 2.51 ms |
| Measured sum per text | 54.50 ms | 50.36 ms | 86.40 ms |

The beam timer starts after constructing a second parser document and sharing encoded features. The measured sum excludes those setup operations, projection, validation, transport and startup. The first-complete comparison applies a selection rule to the saved run and has no separate latency measurement.

## Examples

- **“gaps between the bars wider”** (`diagram/charts-02.csv#2419`). The greedy fragment treated “wider” as the expression and left the rest unresolved. The selected beam reading made “gaps” the fragment topic, attached “wider” as its modifier, and connected it to “the bars” with a `between` relation. Both blind reviews or their adjudicator accepted this reading under the fixed rubric.
- **“focus on arrow a1”** (`diagram/nodes-14.csv#108`). The complete greedy reading made `a1` the quantity of “arrow” and failed. One accepted alternative attached `a1` to the arrow as an apposition. The beam set passed ANY while first-complete still returned the rejected greedy candidate.
- **“add a haness”** (`drawing/objects-03.csv#803`). The greedy reading assigned “a haness” as the direct object of “add” and passed. The exposed alternative assigned it as a predicative entity and failed, making the result SOME.

Exact text, circuits and final judgments for all 250 texts are retained in [paired-cases.json.gz](paired-cases.json.gz).

## Replay

The saved dependency beams and complete pre-selection projections are in `inference/`. Reproduction uses [beam-pilot.py](beam-pilot.py), [project.mjs](project.mjs), and [freeze.mjs](freeze.mjs). These are evaluation scripts. Strategy registration and production defaults are unchanged.

Recompute the paired summary from the saved selections and votes from the NLU checkout:

```sh
pilot=eval-results/2026-11-26-spacy-dependency-beam-pilot
archived=eval-results/2026-11-26-spacy-direct-historical-refresh-one-percent/transformer/review
out=$(mktemp -d)
python3 "$pilot/summarize.py" "$pilot/inference/selection.json.gz" "$archived" "$pilot/review" "$out"
diff -u "$pilot/summary.json" "$out/summary.json"
```
