# Historical development audit of constituent readings

This audit uses the same 1,861 already-exposed development texts across eight symbolic Prolog replay snapshots. It did not draw, inspect, or grade the sealed fresh 1% cohort. The replay reports whether a strategy produced any structurally grounded reading with no material source gap. The blind audit judges the first exact reading as emitted. These are different measures, and the review does not establish that later alternatives in those public lists succeed or fail.

## Paired static replay

| Development snapshot | Complete source, all 1,861 | Complete source, 303 chart-domain texts |
| --- | ---: | ---: |
| Baseline | 339 | 24 |
| Nominal pass 1 | 493 | 51 |
| Nominal pass 2 | 454 | 48 |
| Attachment pass | 460 | 48 |
| Coordination pass | 479 | 52 |
| Composition pass | 487 | 52 |
| Valency pass | 559 | 52 |
| Constituents replay | 1,078 | 138 |

Against valency on the same inputs, the latest replay has 522 gains, three losses, 556 retained complete rows and 780 still incomplete. All three losses are malformed calendar question wrappers of the form “I need you to which events are on …?”. Of the 522 gains, **441** return a first reading emitted by the constituent chart parser, identifiable by `@w1`. All 441 sampled-population first readings passed the source gate again before sampling. The chart-domain column refers to file paths under `diagram/charts-*`; it is distinct from the chart parser.

## Blinded cross-domain audit

The draw stratified those 441 new `@w1` readings by source directory and took the lowest SHA-256 ranks of seed, stratum and stable row ID. The proportional draw rounds to 38 diagram, 38 drawing, three document and one calendar cases. Their population/sample counts are 209/38, 211/38, 15/3 and 6/1, so the expansion weights are 5.50, 5.55, 5.00 and 6.00. A separate 32-row sample stratifies the 339 baseline-complete messages and pairs the baseline and latest first readings on the same source. The manifest records its weights.

Sol and Terra received literal whole circuits and the source text in independent read-only sessions. The packets hide engine, replay stage, references, and other grades. Each reviewed set is a singleton. Identical first circuits for the same paired text share one review. These are model judgments of a development sample, not human gold or a population accuracy result.

| First-reading sample | Rows | Sol accepts | Terra accepts | Both accept | Both reject |
| --- | ---: | ---: | ---: | ---: | ---: |
| Newly complete constituent readings | 80 | 22 | 17 | 16 | 57 |
| Old complete, baseline reading | 32 | 22 | 20 | 20 | 10 |
| Same old rows, latest reading | 32 | 22 | 22 | 20 | 8 |

For the new `@w1` sample the weighted accepted proportions are 27.42% for Sol, 21.29% for Terra and 20.04% agreed acceptance. Six disagreements are Sol-only accepted and one is Terra-only. Agreed acceptance on the old paired sample changes on four rows, with two gains and two losses. Sol individually has two gains and two losses, and Terra has four gains and two losses. These samples have different difficulty and selection rules. Do not read their difference as a paired decline on the same new rows.

The supplementary chart-domain audit covers 64 newly complete outputs compared with valency, all 24 old chart-domain complete rows, and 20 newly complete non-chart-domain outputs. Sol accepted 10 of the new chart-domain readings and Terra 14, with 10 agreed accepts and 50 agreed rejects. The old chart-domain sample had five agreed accepts. See `chart-domain/summary.json`.

## Grammar priorities from direct failures

1. **Clause admission and lexical category ambiguity.** The false-complete cases often organize nouns, degree expressions or discourse particles into clauses. Among the 57 mutually rejected new `@w1` readings, nine have a subject written as `then`, two as `so`, and four use `up` as predicate. In “Bar chart for the operations review, average profit split by customer segment, one chart per ship mode” (`diagram/charts-05.csv#3702`), the selected reading makes `chart` and `profit` predicates. “March gets 40 and April gets 32” (`diagram/charts-02.csv#4695`) makes `March` an imperative predicate. L1 dominates the failure counts, 44 for Sol and 47 for Terra out of 80. These errors point to which heads and clause boundaries the grammar licenses, before adding more application vocabulary.
2. **Particle verbs, coordination, and connective scope.** “Set up a summary page …” (`diagram/nodes-03.csv#613`) treats `Set` as a subject and `up` as a predicate. “Then move Chair … and align their tops …” (`diagram/diagrams-01.csv#657`) turns the initial sequencing cue into a subject. The parser needs to distinguish particle continuation, sequenced imperatives, and ordinary declarative subjects.
3. **Argument composition in compressed requests.** “Make the chart 6 inches wide and 4 inches tall, then move it above the table” (`diagram/charts-02.csv#3825`) detaches a dimension and treats `then` as a subject. “Show me how to draw an org chart” (`diagram/nodes-04.csv#4037`) promotes `chart` to predicate while reclassifying `draw` as an entity. Improve subordinate valency, shared modifier/object scopes, and multi-value property requests without inferring missing semantic classes.
4. **Unfilled productions still visible in the latest first readings.** Regex-cued counts in `latest-gap-probes.txt` overlap and are not causal labels. On incomplete rows, a matching literal cue remains explicitly unresolved for component and label phrases on 93 rows (40 in the chart domain), modal or polite wrappers on 65, sequencing or preservation scope on 53, size/orientation on 48, possessives/part identifiers on 45, naming or quoted payload on 33, and aggregation on 29. Use these cues to select development regression cases after protecting nominal and clause distinctions.

Both audit folders preserve the exact blind packets, stage-to-group mapping, input digests, per-model outputs, reasons, and timings. `coverage-by-id.jsonl.gz` records replay completeness per stable row ID. None of these files changes inference or scoring behavior.

## Paired agreement replay on the same 80 sources

The agreement replay reached 1,160 source-complete rows overall, up from 1,078. On the same 80 sampled sources, 18 new first proposals lost material source eligibility, eight were byte-identical and retained their exact prior grades, and 54 changed eligible first proposals went into fresh blind Sol and Terra review. Static losses stay in the denominator. Ten of the 18 losses were already rejected by both reviewers, four previously passed both, and four were previously disputed.

| Review | Original accepts | Agreement replay accepts | Gains | Losses |
| --- | ---: | ---: | ---: | ---: |
| Sol | 22/80 | 17/80 | 8 | 13 |
| Terra | 17/80 | 16/80 | 9 | 10 |
| Both accept | 16/80 | 13/80 | 6 | 9 |

Weighted agreed acceptance fell from 20.04% to 16.28% in this paired sample, even as static completeness increased over the full development replay. This sample was drawn from newly complete earlier `@w1` first readings, so it cannot estimate overall system accuracy.

**Gains.** “March gets 40 and April gets 32” now gives the proper names subject roles in two finite clauses. “Remove flag, but leave moon alone” now preserves both imperatives. “Then move Chair to the left of Bin, and align their tops …” no longer makes `then` the subject.

**Regressions.** “Make a pie chart of the customers by payment please” now separates `pie` as the object and `chart` as a predicative entity. “Change a large big pale ear” now assigns the object role to `large` instead of the whole noun phrase. “Align n1 with edge centre” now leaves the literal identifier `n1` unresolved. The newly unresolved nominal spans in “make abar chart …”, “add a retcangle 1”, and “add a perrson 120” show a cost of stricter clause admission when the noun phrase itself could still be represented without guessing a semantic type.

The [paired decisions](agreement-replay/summary.json) and full literal candidates in `agreement-replay/paired-judgments.jsonl.gz` keep the repeated and newly adjudicated cases distinct.
