# Neuro-Prolog role projection on the 100-text development sample

The Neuro-Prolog strategy and its symbolic and dependency providers match
projector revision `fb8fa5b`. Both runs check all 100 regenerated dependency
graphs against the frozen standalone evidence, including exact source and
graph digests. The library revision recorded in each run also includes
subsequent changes outside the Neuro-Prolog implementation.

| Strategy | Any acceptable | All acceptable | Mixed | None |
| --- | ---: | ---: | ---: | ---: |
| Neuro-Prolog, compact | 66 | 40 | 26 | 34 |
| Neuro-Prolog, transformer | 66 | 43 | 23 | 34 |
| Refined standalone, compact | 43 | 43 | 0 | 57 |
| Refined standalone, transformer | 66 | 66 | 0 | 34 |

The hybrid pair agrees on 61 acceptable texts. Each contributes five accepted
texts that the other misses. Their union is 71. The refined standalone
transformer overlaps each hybrid on 57 accepted texts and contributes nine
unique to each comparison. Each two-strategy union is 75. These are
independent per-engine judgments and the union uses an oracle. No deployed
selection rule was tested.

| Model name and version | Model startup | Model median / p95 | Model plus mapping median / p95 | Runtime errors |
| --- | ---: | ---: | ---: | ---: |
| `core_web_sm` 3.8.0 | 470 ms | 2.04 / 3.85 ms | 8.40 / 94.57 ms | 0 |
| `core_web_trf` 3.8.0 | 2,519 ms | 48.84 / 79.34 ms | 55.51 / 182.43 ms | 0 |

Timings use one worker, with model startup and reader startup measured
separately. The prior compact eight-worker measurement remains in its
review summary. The verifier checks the reported medians and p95s against
named model evidence and per-request timings.

The compact review reuses 138 compatible exact-circuit decisions. Nine
new candidates received independent judgments from GPT-6 Sol and GPT-6.1
Terra. GPT-6.2 Sol adjudicated two threshold disagreements. The transformer
review reuses 133 exact-circuit decisions. Both primary reviewers rejected
both novel candidates, with no threshold disagreement. Eligibility requires
a public source-complete circuit under the archived checker. Compact had
82 eligible texts and transformer had 77.

Run `node verify-graphs.mjs` to recheck graph and timing consistency and
`python3 compare.py` to reconstruct the paired counts. This archive measures
development data only.

[Paired overlap and timings](comparison.json) ·
[Compact review](compact/review/summary.json) ·
[Transformer review](transformer/review/summary.json) ·
[Standalone comparison](../2026-11-26-spacy-direct-refinement-dev100/README.md)
