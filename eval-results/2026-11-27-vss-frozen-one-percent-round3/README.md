# VSS on the frozen one-percent sample, second reviewed model

The [VSS strategy](../../docs/strategies/vss.md) at revision `d98b426` read the 1,831 source utterances of [the frozen fresh comparison](../2026-11-26-fresh-locked-one-percent/README.md) again. `vss.jsonl.gz` holds its unmodified public output.

| Measure | VSS |
| --- | ---: |
| Requests | 1,831 |
| With a schema-valid reading | 1,831 |
| With a reading that accounts for every word | 1,828 |
| With every word in a typed role | 1,819 |
| Median latency | 0.37 ms |

## Blind paired review against spaCy direct

`blind-review/` holds a second paired review, built like [the first](../2026-11-27-vss-frozen-one-percent/README.md) with other seeds: 240 utterances, 19 of them shared with the first subset, two anonymous candidate sets per utterance, three independent reviewers (Claude Opus 5.5, 80 rows each) applying the [native v3 legend](../../tests/benchmark/meaning-review/native-v3-legend.md).

| Strategy | NONE | SOME | ALL |
| --- | ---: | ---: | ---: |
| VSS | 48.8% | 0.4% | 50.8% |
| spaCy direct | 36.2% | 0.0% | 63.8% |

| Both acceptable | VSS only | spaCy direct only | Neither |
| ---: | ---: | ---: | ---: |
| 94 | 28 | 59 | 59 |

| Strategy | L1 | L2 | L3 | L4 | L6 | L7 | L8 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| VSS | 46 | 0 | 71 | 0 | 0 | 1 | 122 |
| spaCy direct | 12 | 46 | 27 | 1 | 1 | 0 | 153 |

The first review, of the first model on another subset, gave VSS 45.0% and spaCy direct 67.5%. The two subsets differ, so the change in the gap between the strategies (from 22.5 to 13.0 points) is the comparable figure, not either rate alone. No native reference entered the review, so L9 and L10 are unavailable.

`../2026-11-27-vss-frozen-one-percent-round2/` is an unreviewed static run of an intermediate model on the same sample.
