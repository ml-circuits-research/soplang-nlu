# Standalone spaCy nominal projection on Dev100

The isolated `14fb051` worktree replayed the same 100 development texts,
with each model run serially. Verification matched every source and
dependency graph digest against the frozen model evidence. Both runs
returned one public candidate per text and had zero runtime errors.

| Model | None | Some | All / Any | Net change from sequence revision | Source-eligible |
| --- | ---: | ---: | ---: | ---: | ---: |
| Compact | 57% | 0% | 43% | −1 pp | 75% |
| Transformer | 21% | 0% | 79% | +10 pp | 88% |

Both models passed on 42% of texts. Compact alone passed on 1%, transformer
alone on 37%, and neither passed on 20%. The oracle union is 80% on this
development sample. The transformer strategy alone reached 79%. This run
did not evaluate the sealed random sample.

| Model name | Model startup | Mapping p50 / p95 | Model plus mapping p50 / p95 |
| --- | ---: | ---: | ---: |
| `core_web_sm` 3.8.0 | 441 ms | 0.31 / 0.90 ms | 2.21 / 4.62 ms |
| `core_web_trf` 3.8.0 | 2,472 ms | 0.32 / 0.70 ms | 51.33 / 83.49 ms |

Transformer accepted “move Publish 300 px from the left” with Publish as
the object and 300 px as a measurement. It accepted “add a paragraph
Review 3 Second Pass” with the full phrase as the paragraph name. In
“give me a boy on the left facing right, and give me a girl on the right
facing left,” it retained both distinct placements and orientations.

Both models lost “one flow chart about the customer refund process is
what i need” by treating the free relative as an embedded question.
Compact also lost “what does the sun shine on?” by leaving the
interrogative argument unlinked to the stranded preposition.

The review reused 59 compact and 68 transformer exact-circuit decisions
from the sequence archive. GPT-6 Sol and GPT-6.1 Terra independently
reviewed 33 distinct new circuits. GPT-6.2 Sol adjudicated threshold
disagreements and audited a sample of agreements. Exact source and
SOP identity controlled reuse across both models.

Run `node verify-graphs.mjs` to verify source, graph and timing evidence
and `python3 compare.py` to recompute paired outcomes and changed examples.

[Paired outcomes and examples](comparison.json.gz) ·
[Compact review](compact/review/candidate-review-summary.json) ·
[Transformer review](transformer/review/candidate-review-summary.json) ·
[Sequence baseline](../2026-11-26-spacy-direct-sequence-dev100/README.md)
