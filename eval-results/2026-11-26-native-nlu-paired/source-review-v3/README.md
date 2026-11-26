# Frozen native NLU benchmark, proposal-set grades v3

Each strategy was measured on the same **1,861 messages**. The unit is one source and its **public returned candidate list**. A result is ALL when every returned candidate is acceptable, MIXED when acceptable and unacceptable candidates occur together, or NONE when no acceptable reading was found. An empty list is NONE. Candidate order has no effect.

| Strategy | ALL | MIXED | NONE |
| --- | ---: | ---: | ---: |
| Z3 | 7.58% | 2.79% | 89.63% |
| Prolog | 9.14% | 0.59% | 90.27% |
| Prolog example transfer | 8.60% | 1.18% | 90.22% |

Percentages use the largest remainder method at two decimal places, so each row sums to 100%. The full L0–L10 counts and percentages are in `native-summary.json`. L7 is MIXED and L8 is ALL. L9 requires an acceptable complete list matching the full frozen native reference alternative set, and L10 requires an independently verified correction to defective frozen native references. This cohort predates the native annotations, so both levels remain empty. See the [v3 rubric](../../../tests/benchmark/meaning-review/native-v3-legend.md).

The classifier preserves the frozen v2 whole-set result for rows with no accepted witness and retains their failure families. If a row has an accepted witness, a static-invalid or materially incomplete alternative makes it MIXED. Otherwise it checks exact source and circuit identity against earlier accepted witnesses and literal singleton judgments. When the remaining ambiguity could change ALL versus MIXED, it runs an independent literal singleton recheck. The seven added singleton reviews all accepted their circuits. Lists already shown to be MIXED did not require judgments on other undetermined alternatives. The row archive records where each decision came from.

Including all 30 saved raw proposal rejections changes no category on any row. They remain separate from the returned candidate lists. The result measures agreement with the frozen source-first review and individual witness checks. It does not estimate a human-labeled error rate. The [v2 reviewer archive](../source-review-v2/README.md) remains available as historical evidence.

## Reproduce

Run from the repository root with `run` pointing to the sealed native cohort and `output` pointing to a results directory.

```sh
node tests/benchmark/meaning-review/classify-native-sets.mjs "$run" "$output"
python3 tests/benchmark/meaning-review/run-review.py "$output/singleton-packets.json.gz" "$output/singleton.jsonl" --profile native --model gpt-6.2-sol --jobs 3 --rows 3 --expanded
node tests/benchmark/meaning-review/classify-native-sets.mjs "$run" "$output" "$output/singleton.jsonl"
```

The first invocation exits with status 2 when independent singleton review is needed and writes the target packets. For reproduction using the archived seven judgments, the final command also accepts `singleton.jsonl.gz`. It records input digests and writes the summary and compressed row evidence.
