# Offline reseal

From the NLU checkout, copy this directory to scratch and decompress the compact votes there. Replay requires no reviewer calls.

```sh
run=eval-results/2026-11-26-fresh-locked-one-percent
review=$(mktemp -d)
cp -R "$run/source-review/." "$review/"
for pass in primary independent audit; do
  test ! -f "$review/$pass.jsonl.gz" || gzip -dc "$review/$pass.jsonl.gz" >"$review/$pass.jsonl"
done
node tests/benchmark/meaning-review/review-public-candidates.mjs score "$review" "$run"
```
