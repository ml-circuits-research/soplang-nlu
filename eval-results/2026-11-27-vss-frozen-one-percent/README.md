# VSS on the frozen fresh one-percent sample

The unsupervised [VSS strategy](../../docs/strategies/vss.md) read the same 1,831 source utterances as the eight strategies of [the frozen fresh comparison](../2026-11-26-fresh-locked-one-percent/README.md). `vss.jsonl.gz` holds its unmodified public output and `vss.json` the static summary.

| Measure | VSS |
| --- | ---: |
| Requests | 1,831 |
| With a schema-valid reading | 1,831 |
| With a reading that accounts for every word | 1,828 |
| With every word in a typed role | 1,805 |
| Median latency | 0.13 ms |
| 95th percentile latency | 0.37 ms |

## Blind paired review against spaCy direct

`blind-review/` holds a paired review of 240 utterances drawn from the sample by a seeded hash. Each packet row shows the source and two anonymous candidate sets, A and B, in an order fixed by a second hash. One set is the VSS output above, the other the archived spaCy direct output for the same utterance. Three independent reviewers (Claude Opus 5.5, 80 rows each) applied the [native v3 legend](../../tests/benchmark/meaning-review/native-v3-legend.md) to every set without knowing which strategy produced it. `key.json` maps the sets back and `decoded.json` holds the decoded judgments.

| Strategy | NONE | SOME | ALL |
| --- | ---: | ---: | ---: |
| VSS | 54.6% | 0.4% | 45.0% |
| spaCy direct | 32.5% | 0.0% | 67.5% |

| Both acceptable | VSS only | spaCy direct only | Neither |
| ---: | ---: | ---: | ---: |
| 89 | 20 | 73 | 58 |

| Strategy | L1 | L2 | L3 | L6 | L7 | L8 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| VSS | 39 | 2 | 87 | 3 | 1 | 108 |
| spaCy direct | 12 | 44 | 21 | 1 | 0 | 162 |

These reviewers accepted spaCy direct on 67.5% of the subset. The archived review of the full sample accepted it on 60.51%, so compare the two rows of this table with each other and not with the archived table. No native reference entered the review, so L9 and L10 are unavailable.

VSS rarely leaves source unaccounted (L2). Its failures are wrong roles or attachments (L3) and words read as the wrong kind of predicate or clause (L1). The reviewed output predates the recipient link and the later changes of the committed model.
