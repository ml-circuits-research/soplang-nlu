# Raw neural dependency diagnostic on frozen development inputs

This diagnostic uses all 100 historical development inputs from the [uniform paired baseline](../2026-11-26-uniform-development-100/README.md). Both spaCy English models received the same literal text through the shared persistent dependency worker. The run used spaCy 3.8.16, with `en_core_web_sm` and `en_core_web_lg` at 3.8.0, with NER excluded. The inference script and raw archive retain exact tokens, source boundaries, POS and tags, dependency labels and heads. The transport revision is `3aabbb66440f46e5b79f324757d90d45955bb345`. The two processes ran concurrently. Including startup and shutdown, the compact model took 0.744 seconds and the large model took 1.150 seconds. The installed model directories are about 15 MiB and 425 MiB respectively.

Each judgment considered the complete raw graph for one source. The exact source and graph, including token order, POS, fine tag, edge label and head, were identical for 33 pairs, yielding 167 distinct targets. Two reviewers independently judged those targets with the model identity hidden. The third independently judged every acceptance disagreement and 12 deterministic cases from each agreement stratum. The scoring rule uses the third vote for threshold disagreements and the first vote otherwise. The consensus check estimates sensitivity to reviewer choice. Axis breakdowns use the first vote where the first two reviewers agree on usability.

A graph is usable if its essential predicate, boundaries, arguments and meaningful attachments, and coordination directly support a plausible reading. The model is allowed conventional dependency representations and harmless POS differences. Reattaching or inventing essential edges is outside this diagnostic. A usable graph can still fail during circuit generation or grounding. A rejected graph may help a hybrid strategy that uses other evidence. These figures measure graph plausibility on development data and cannot predict final circuit quality.

## Results

| Raw dependency model | Plausible without repair | Wrong predicate | Wrong boundaries | Wrong arguments or attachment | Wrong coordination |
| --- | ---: | ---: | ---: | ---: | ---: |
| Compact | 50 / 100 | 17 | 27 | 45 | 23 |
| Large | 48 / 100 | 16 | 26 | 46 | 22 |

Both were usable on 38 inputs, the compact model alone on 12, the large model alone on 10, and neither model on 40. Axis defects can overlap. The initial judges disagreed on 14 of 167 distinct graphs (8.4%), and the third reviewer contradicted one of 24 consensus cases audited. The initial compact acceptance counts were 49 and 53. The initial large counts were 50 and 55. The two-point final difference is smaller than the change between individual judges.

The earlier symbolic pair produced an acceptable native circuit on 41 of these inputs. Among the remaining 59, 20 had a usable compact dependency graph, 19 had a usable large graph, and 25 had at least one. These 25 are candidate conversion opportunities for a hybrid system. A raw graph and an acceptable circuit are different measurements.

| Input | What the archived edges show |
| --- | --- |
| “March gets 40 and April gets 32” | The compact graph makes `April` the subject of the second `gets`. The large graph attaches `April` to `40` as a conjunct. |
| “can you make the caps on the error bars bigger?” | The large model recovers the result as a complement of `make`, with `caps` as the subject of `bigger`. The compact model makes `bigger` an adjectival modifier of `bars`. |
| “give Start a width of 180 and height of 90” | Both graphs coordinate `height` with `180` and attach the second `of` to `180`. The source coordinates the two properties. |
| “press delete on the current selection” | Both graphs make `press` a nominal compound of the root `delete`. The source uses `press` as the action. |
| “a farm with a shed, a boulder, a kid, and a goat” | Both graphs attach listed items as appositions. This loses separate list membership in the farm description. |

Both pipelines use the same transition-based parsing architecture and local Tok2Vec representation. The large configuration includes static vectors, with about 393 MiB in the vectors file. The measured difference gives little reason to choose the large model as the default starting point. For custom training, prioritize resultative complements and nested PP attachment, application names that resemble verbs, and clause and entity coordination in sequences and elliptical lists. For a hybrid, use neural dependencies as defeasible evidence and require source-grounded structural support before emitting variants. Compare future parsers and mapper revisions at the same frozen IDs, reporting both raw graph plausibility and emitted-circuit quality.

## Replay

Run from this directory with the desired Python and both compatible spaCy models installed. The scorer can reuse the archived judgments without calling any model.

```sh
SOP_NLU_SYNTAX_PYTHON=/path/to/python node infer.mjs ../2026-11-26-uniform-development-100/inference/sample.json.gz raw.json en_core_web_sm en_core_web_lg
gzip -n raw.json
python3 review.py gpt-6-sol
python3 review.py gpt-6.1-terra
python3 select-audit.py
python3 review.py gpt-6.2-sol audit-keys.json
python3 summarize.py
```
