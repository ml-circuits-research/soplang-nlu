# Transformer Neuro-Prolog on a historical diagnostic slice

This measurement used the unchanged `fb8fa5b` Neuro-Prolog mapper in
the isolated `24f248b` checkout, including that checkout's validator.
The public reader consumed the same frozen `core_web_trf` 3.8.0
dependency graph as the standalone strategy for every historical source.
All 1,861 source and graph digests matched the official transformer
run. Serial replay had zero runtime errors. Mapping-only p50/p95
was 5.31/66.15 ms, with model inference excluded.

The 250-text diagnostic slice was selected before reviewing either
strategy's outcomes. It takes the lowest SHA-256 ranks of the seed, NUL
and row ID across the historical development cohort after excluding the
Dev100 IDs and exact source texts. It is a historical diagnostic and
does not measure the sealed random benchmark.

| Static source completeness | Both | Neuro-Prolog only | Standalone only | Neither |
| --- | ---: | ---: | ---: | ---: |
| Historical development cohort | 1,220 | 198 | 211 | 232 |
| SHA-ranked diagnostic slice | 167 | 21 | 28 | 34 |

| Independent slice outcome | All | Some | None | Any |
| --- | ---: | ---: | ---: | ---: |
| Transformer Neuro-Prolog | 34.8% | 19.2% | 46.0% | 54.0% |
| Transformer standalone | 60.8% | 0% | 39.2% | 60.8% |

An acceptable reading was present in both strategies on 114 texts,
Neuro-Prolog alone on 21, standalone alone on 38 and neither on 77.
The oracle union is 69.2%. No deployed selection rule was tested.

Neuro-Prolog preserved the creation, label and subsequent link in
“Hey, create a diamond labelled Q1 plan; then link Q1 plan to Hiring.
That would help.” Standalone left material unresolved. In the other
direction, standalone preserved a revenue breakdown by channel.
Neuro-Prolog treated “channel” as the agent of “broken down,” changing
the requested grouping.

GPT-6 Sol and GPT-6.1 Terra independently reviewed 330 source-eligible
Neuro-Prolog candidates. No compatible exact prior votes matched these
circuits. GPT-6.2 Sol reviewed 38 threshold disputes and 40 blinded
agreement checks. Two agreement checks contradicted the original
threshold agreement. Paired standalone outcomes come from its separate
`24f248b` review on the same 250 IDs.

Run `node verify-slice.mjs` to check the archived SHA ranks, exact source
and graph evidence. Run `python3 compare.py` to reconstruct the static
and semantic overlaps. The full historical comparisons retain source
row IDs and completeness flags, and the diagnostic slice retains the
raw dependency graphs, public circuits and independent evidence.

[Selection](selection.json) · [Paired overlap](comparison.json) ·
[Neuro-Prolog judgments](review/candidate-review-summary.json) ·
[Standalone historical review summary](standalone-historical-review-summary.json)
