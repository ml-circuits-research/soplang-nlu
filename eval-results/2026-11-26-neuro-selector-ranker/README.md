# Frozen Neuro-Selector fit and diagnostic

The selector fit used 1,861 individually labeled eligible circuits across
500 training texts. A separate 100-text validation set supplied 374 candidate
labels for policy selection. Candidate weights total one per nonempty text.
The selected model was a depth-two gradient-boosted tree ensemble with 91
structural features. Its policy returns up to three ranked candidates, with
`minScore=0` and `maxSimilarity=1`. Validation selected a ranking policy
without additional score or diversity filtering.

The model was committed at `ed0cdbd` before the diagnostic labels were opened
for selector scoring. Its SHA-256 is
`88efccb159cafae9e38a8bfcc3a1da69249c995c4fb8be3ca4a5e1f76b71abc1`.
Training and validation shared neither an ID nor an exact text with the
diagnostic. The archived freeze record binds the model, fit report, input
pool and vote digests, and the training and inference code hashes.

| Split and policy | None | Some | All | Any | Mean candidates |
| --- | ---: | ---: | ---: | ---: | ---: |
| Validation, learned selector | 20.0% | 47.0% | 33.0% | 80.0% | 2.570 |
| Validation, original order top three | 21.0% | 53.0% | 26.0% | 79.0% | 2.570 |
| Diagnostic, learned selector | 20.0% | 37.2% | 42.8% | 80.0% | 2.564 |
| Diagnostic, original order top three | 19.6% | 44.4% | 36.0% | 80.4% | 2.564 |
| Diagnostic, original order top one | 28.8% | 0.0% | 71.2% | 71.2% | 0.924 |

On the 250-text historical diagnostic, the learned selector gained 24 ALL
outcomes and lost seven against original order top three. Its ANY coverage
gained one text and lost two. The full eligible pool's diagnostic oracle
coverage was 81.2%. The baseline uses the original order of the exact
deduplicated and eligible circuits in the same proposal pool.

Node and Python returned the same selected indices for every validation
and diagnostic row. The parity check compared all 374 validation and 943
diagnostic candidate probabilities, with a maximum absolute difference of
`2.22e-16`. The diagnostic measured the frozen selector on saved proposals.
It did not run model inference or evaluate the sealed random one percent.

From the repository root, use the installed model and archived feature vectors
to verify the selected indices, score parity, and comparisons.

```sh
archive=eval-results/2026-11-26-neuro-selector-ranker
model=strategies/neuro-selector/model.json
for split in validation diagnostic; do
  node experiments/proposal-selection/verify-ranker.mjs "$model" "$archive/$split.jsonl.gz" "$archive/$split-score.json"
  python3 experiments/proposal-selection/compare-ranker.py "$model" "$archive/$split.jsonl.gz" "$archive/$split-score.json"
done
```

[Freeze record](seal.json) · [Validation fit and policy trials](fit-report.json) ·
[Diagnostic comparison](diagnostic-comparison.json) · [Diagnostic parity](diagnostic-parity.json)
