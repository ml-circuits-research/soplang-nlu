# Expanded DistilBERT paired study

With 7,040 supervised sources, the DistilBERT ownership model produced an acceptable native circuit on **53%** of the frozen 100 study inputs and reached **86%** material source completeness. This is up from **32%** and **58%** at 2,549 training sources. The expanded span model improved from **25% to 41%** acceptable. Both expanded students were trained on the same data for eight GPU epochs and used the same 283 development rows for checkpoint selection. The [label support and replay instructions](DATA-AND-REPLAY.md) describe the exact merge and exclusions.

| Strategy, public sets capped at two | Source complete | NONE | SOME | ALL |
| --- | ---: | ---: | ---: | ---: |
| Span, 2,549 training rows | 42% | 75% | 0% | 25% |
| Ownership, 2,549 training rows | 58% | 68% | 0% | 32% |
| Span, 7,040 training rows | 56% | 59% | 0% | 41% |
| Ownership, 7,040 training rows | 86% | 47% | 0% | 53% |
| Pretrained spaCy direct | 77% | 47% | 0% | 53% |
| Pretrained spaCy beam | 83% | 43% | 18% | 39% |
| Frozen Neuro-selector | 93% | 26% | 27% | 47% |

Each DistilBERT reader returns at most one circuit, and its ALL rate equals ANY. The capped selector has 74% ANY. The study uses the fixed historical diagnostic inputs, with no study feedback in model fitting or selection.

Relative to their own smaller training runs, expanded span gained 19 accepted texts and lost three. Expanded ownership gained 27 and lost six. Between the two expanded models, 33 texts are accepted by both, 20 by ownership alone, and eight by span alone.

The expanded ownership model adds five texts missed by the capped selector, giving an offline union of **79%**. Four of its successes are missed by all three capped comparators. For example, on “put a man in a yellow shirt with no hat on the left, between the man on the right and the person with a blue hat,” the accepted circuit preserves the selected figure, both clothing distinctions and the coordinated landmarks of the between placement. The other expanded student adds four texts missed by the selector. Using either expanded student alongside the selector gives **82%** offline availability, up from **77%** for both smaller students and the selector. Combining all four student inventories and the selector gives **83%**. These are unions of reviewed alternatives, with no combined ranking strategy measured.

## Development graph metrics

| Model | Graph-fact F1 | Exact graph agreement |
| --- | ---: | ---: |
| Span, 2,549 | 86.02% | 14.49% |
| Ownership, 2,549 | 86.44% | 16.61% |
| Span, 7,040 | 88.83% | 22.26% |
| Ownership, 7,040 | 89.16% | 24.03% |

These facts include anchored node types, typed spans, links and atom values against fixed development labels. The expanded study also compares with available accepted provider-derived graphs on 81 inputs. Quoted-role F1 was 89.40% for span and 90.61% for ownership. Directed-edge F1 was 82.92% and 84.70% respectively. The provider-derived graph metrics complement the separate source-first blind outcomes.

Expanded span returned 95 valid public circuits, and ownership returned 97. The validator rejected five and three raw graphs respectively. Both runs had zero runtime errors. The span review used 46 novel exact targets and ten prior votes. Its adjudicator resolved eight threshold disagreements and contradicted one of 31 agreement checks. Ownership used 72 novel targets and 14 prior votes. Its adjudicator resolved five disagreements and contradicted two of 40 agreement checks. Early span review used the same byte-identical public pool as the final timing run.

## CPU timings and weights

| Expanded model | Worker startup | Per-request p50 | Per-request p95 |
| --- | ---: | ---: | ---: |
| Span | 1.574 s | 20.01 ms | 34.22 ms |
| Ownership | 1.698 s | 20.52 ms | 37.59 ms |

The paired live CPU runs were sequential on the same host with two threads. Timings include worker transport, graph serialization and validation. Training selected epoch seven for span and epoch eight for ownership by development F1. Both completed eight epochs. GPU elapsed times were 271.70 and 923.16 seconds respectively. Ownership ran concurrently with a separate GPU workload and evaluated an additional development threshold grid, so these elapsed times describe the executions rather than a controlled training speed comparison.

The checkpoints are available locally in `.local-models/distilbert/span-expanded-v1` and `.local-models/distilbert/ownership-expanded-v1`. Each file digest was verified after publishing the checkpoint. Model digests, code revisions and live evidence are in `provenance.json`, the per-model training summaries and `paired-comparison.json`.
