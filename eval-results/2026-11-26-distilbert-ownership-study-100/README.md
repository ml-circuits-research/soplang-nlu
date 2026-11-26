# DistilBERT token ownership study

Adding a trained token ownership head improved wholly acceptable circuits from **25% to 32%** on the same 100 independent DistilBERT study inputs. Source completeness rose from **42% to 58%**. V2 gained 12 accepted inputs and lost five. The public validator accepted 93 of its raw graphs, down from 97. Mixed-type coordination was the most frequent validator finding in the seven rejected V2 outputs. Both CPU runs had zero runtime errors.

| Strategy, capped at two public readings | Source-complete | NONE | SOME | ALL |
| --- | ---: | ---: | ---: | ---: |
| DistilBERT v1 | 42% | 75% | 0% | 25% |
| DistilBERT v2, token ownership | 58% | 68% | 0% | 32% |
| Pretrained spaCy direct | 77% | 47% | 0% | 53% |
| Pretrained spaCy beam | 83% | 43% | 18% | 39% |
| Frozen Neuro-selector | 93% | 26% | 27% | 47% |

Both students emit at most one public circuit, so ALL is also ANY. Capped beam and selector achieve 57% and 74% ANY respectively. The 100 texts come from the historical selector validation cohort. They are excluded from DistilBERT training and model selection. This study compares on that frozen diagnostic, with fresh final benchmark results kept separate.

V2 and the capped selector both succeed on 30 texts. V2 alone succeeds on two, and the selector alone on 44. Their offline candidate union contains an accepted choice on 76 texts, up from 74 for the selector alone and 75 for the selector with v1. This measures available choices without a new selection mechanism.

- On “Some heading room under Intro — text Main, level 3.” V2 kept the heading-room fragment, its location under Intro and the text and level details. The capped selector had no accepted reading on this input.
- On “amke the house by the fence bright purple” V2 kept the literal typo as the imperative predicate, attached “by the fence” to the house, and assigned “purple” as the requested result with “bright” as its degree. This was the one V2 success missed by all three capped baselines.

Exact candidates and accepted circuits are in `paired-v1-v2.json` and `outcomes.jsonl.gz`. These gains are source-grounded. The models used no spelling correction.

## Architecture and development results

The new head learns a source token’s owner node and typed string slot, with begin and inside labels and an unassigned class. It supplies an independent path where the main attribute span detector did not propose a slot. Recovery requires contiguous evidence and sufficient posterior confidence. It fills unclaimed occurrences without replacing existing evidence, reusing owned tokens, exceeding the observed schema multiplicity, or inventing filler and atomic values. Low-confidence tokens remain unassigned. The existing public validator remains the final gate.

Both runs used the same 2,549 training and 283 development sources, the same official base at `12040acc`, seed, optimizer, batch size and eight-epoch training budget. The v2 checkpoint and confidence thresholds were selected by development fact F1. Its expanded development threshold grid also covered ownership confidence. This made the full run 181.87 seconds on the GB10, including development decoding, compared with 117.58 seconds for v1. The trained v1 format still loads with identical raw outputs on 24 matched compatibility controls.

| Development metric | V1 | V2 |
| --- | ---: | ---: |
| Anchored graph-fact F1 | 86.02% | 86.44% |
| Exact anchored graph agreement | 14.49% | 16.61% |
| Schema-valid public circuits | 96.47% | 97.88% |
| Material source completeness | 62.54% | 77.74% |

Using identical v2 weights with recovery disabled at decoding produced 156 source-complete development circuits. Enabling the ownership path produced 220, with valid public circuits rising from 273 to 277. The study’s nearest available accepted provider graphs give a different structural comparison. V2 quoted-role span F1 was 83.14% versus v1 85.13%, and edge F1 was 78.68% versus 79.65%. These scores use closest provider-derived alternatives on 81 texts. The separate blind source-first judgments measure actual interpretation quality.

## Review and timing

The V2 study reused 11 compatible exact-circuit judgments. Independent reviewers evaluated the remaining 47 eligible circuits without candidate-origin labels. The adjudicator settled all four acceptance disagreements. Three of 40 audited agreements produced a contradictory verdict.

| Live CPU reader, 100 study inputs | Startup | Per-request p50 | Per-request p95 |
| --- | ---: | ---: | ---: |
| DistilBERT v1 | 1.843 s | 24.74 ms | 40.31 ms |
| DistilBERT v2 | 1.638 s | 17.70 ms | 27.01 ms |

These are separate CPU measurements with two threads. Per-request timings include the Node-to-Python call and native verification. On the development probe, CPU and CUDA returned identical public outputs on all 24 matched v2 inputs.

## Checkpoint and replay

The optional checkpoint is in the Git-ignored local directory `.local-models/distilbert/ownership-2549` and uses package format `native-distilbert-v2`. The checkpoint tree SHA-256 is `8d66a500980c1670962eb85d87bb9c2535ddac04443dd215dbffa32ecd5d527a`. Input and checkpoint file hashes are in the training manifest and provenance.

From the NLU checkout, reproduce training using the original label inputs and local official base. This host used the optional Triton override switch because the Python development headers were unavailable.

```sh
python strategies/distilbert/train.py "$labels/train.jsonl.gz" "$labels/dev.jsonl.gz" "$scratch" \
  --base "$distilbert_base" --device cuda --disable-triton --ownership
```

The [existing study harness](../../experiments/distilbert/study.mjs) reads the literal diagnostic inputs and the frozen comparator outcomes and calls the public CPU reader. Archived judgments can be sealed with `experiments/proposal-selection/review-pool.py seal` and compared with `experiments/distilbert/score-study.mjs` in a scratch copy.
