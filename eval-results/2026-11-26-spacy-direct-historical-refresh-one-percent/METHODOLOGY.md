# Refreshed historical assessment

The evaluation reuses the frozen historical 1% input, including all 100 mapper development IDs. An isolated worktree at `24f248b` ran the normal model matrix serially for compact and then transformer. In each case the public reader consumed the live dependency model output. Both input digests and every per-row dependency digest match the earlier historical runs. The world revision and original model metadata are in each inference environment.

The transformer review began from a replay of the canonical raw transformer graphs through the same reader at the same revision. Before adopting these votes, the pipeline verified that all 1,861 live public candidate lists and graph digests matched replay and that the prepared and candidate packet gzip files matched byte for byte. The archived packets were prepared from live predictions. The final score uses actual live inference outputs and timings.

Source-eligible candidates were reviewed as exact source-and-circuit pairs. The primary and independent reviewers saw only the literal source and circuit, without model, engine, rank, or references. Candidate hashes reused from final historical evidence and the nominal development audit refer to the same complete circuit and source. When archives disagreed about an exact prior candidate, the historical vote took precedence. Shared novel candidates were reviewed through the transformer packet once and reused in the compact score. The third reviewer settled threshold disputes and audited agreement samples. Timing data measure model inference and circuit mapping, outside the review process.

The read-only comparison computes percentages for the full historical cohort and the sensitivity view excluding the 100 explicit development IDs. Both views are historical and contain no fresh final evaluation. The per-model before and after records use the same frozen inputs and judge thresholds.

To replay the release from the NLU checkout:

```sh
base=eval-results
out="$base/2026-11-26-spacy-direct-historical-refresh-one-percent"
old="$base/2026-11-26-spacy-direct-historical-one-percent"
for model in compact transformer; do
  node tests/benchmark/meaning-review/review-public-candidates.mjs score "$out/$model/review" "$out/$model/inference" spacy-direct
done
node "$out/verify-live.mjs" "$out/compact/inference" "$old/compact/inference"
node "$out/verify-live.mjs" "$out/transformer/inference" "$old/inference"
python3 "$out/compare.py" "$out" "$base/2026-11-26-uniform-development-100" "$base/2026-11-26-native-nlu-paired/sample.json.gz" "$old"
```
