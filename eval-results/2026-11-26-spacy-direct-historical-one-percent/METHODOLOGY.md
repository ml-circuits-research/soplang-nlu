# Historical standalone review procedure

The transformer and compact inference files use the same archived cohort input hash. The preparation step applies the native schema and material source coverage gate. Each source-eligible exact source and circuit combination is sent to two independent blinded reviewers. Model, strategy, original order and references are omitted. A separate reviewer resolves threshold disagreements and checks a deterministic sample of agreements. Public candidate set outcomes are computed only after candidate-level judgments are complete. A source-incomplete public circuit cannot pass. Each standalone prediction contains one public circuit, so SOME is possible under the reporting rubric but unused here.

The transformer review was in progress when compact predictions became available. Compact preparation reserved all exact identities already queued for the historical transformer review. It also reused eligible exact votes from the final natively reviewed development snapshots. Candidate identities use SHA-256 over the exact source and normalized complete circuit. The two historical results share the resulting votes on identical circuits. Historical transformer votes take precedence over old development votes for those identical circuits. New compact-only identities received blinded primary and secondary judgments. The archivable compact `review/novel/` contains new calls and packet identities. Individual decisions include reviewer evidence and adjudication status.

The combined historical results include all 100 known development inputs. The accompanying comparison computes a second descriptive view with those 100 IDs removed, keeping the same source decisions. That arithmetic subset remains historical because the parent cohort and its legacy benchmarks were already available.

Run from the NLU checkout to replay the archived verdicts without inference or new reviewer calls.

```sh
base=eval-results
out="$base/2026-11-26-spacy-direct-historical-one-percent"
node tests/benchmark/meaning-review/review-public-candidates.mjs score "$out/review" "$out/inference" spacy-direct
node tests/benchmark/meaning-review/review-public-candidates.mjs score "$out/compact/review" "$out/compact/inference" spacy-direct
python3 "$out/compare.py" "$out" "$base/2026-11-26-uniform-development-100" "$base/2026-11-26-native-nlu-paired/sample.json.gz"
```
