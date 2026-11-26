# Native NLU paired benchmark

The three strategies read the same 1861 frozen text records from WebMeet dataset revision `d25c2645c098`. Generation used 16 workers per strategy. Each column has one denominator. The level percentages use largest-remainder rounding.

| Candidate-set outcome | Z3 | Symbolic Prolog | Prolog example transfer |
| --- | ---: | ---: | ---: |
| None acceptable | 89.63% | 90.27% | 90.22% |
| Some acceptable | 2.79% | 0.59% | 1.18% |
| All acceptable | 7.58% | 9.14% | 8.60% |

| Level | Z3 | Symbolic Prolog | Prolog example transfer |
| --- | ---: | ---: | ---: |
| 🔴 L0 | 3.9% | 3.0% | 3.0% |
| 🔴 L1 | 6.1% | 4.1% | 4.1% |
| 🔴 L2 | 75.3% | 78.8% | 78.8% |
| 🔴 L3 | 2.9% | 2.4% | 2.4% |
| 🔴 L4 | 0.6% | 0.8% | 0.7% |
| 🟠 L5 | 0.1% | 0.5% | 0.5% |
| 🟠 L6 | 0.7% | 0.7% | 0.7% |
| 🟠 L7 | 2.8% | 0.6% | 1.2% |
| 🟢 L8 | 7.6% | 9.1% | 8.6% |
| 🟢 L9 | 0.0% | 0.0% | 0.0% |
| 🟢 L10 | 0.0% | 0.0% | 0.0% |
| **Total** | 100.0% | 100.0% | 100.0% |

| Level | Proposal-set result | Criterion |
| --- | --- | --- |
| L0 | NONE | No usable native reading. Examples include empty output, no valid grounded circuit, or no useful interpretation in any eligible proposal. |
| L1 | NONE | The closest usable witness has the wrong principal clause form, boundary, predicate interpretation, action, question, modality, or polarity. |
| L2 | NONE | A schema-valid, source-grounded proposal exists, but every such proposal has material unaccounted or unresolved source. |
| L3 | NONE | The closest witness assigns a wrong role, participant, endpoint, attachment, direction, value, scope, or qualifier. |
| L4 | NONE | The closest witness asserts a material instruction, entity, condition, value, or semantic class unsupported by the source. |
| L5 | NONE | The closest witness omits an essential clause, predicate, action, or step. |
| L6 | NONE | The closest witness omits an essential participant, reference, role, relation, property, value, placement, scope, or qualifier. |
| L7 | MIXED | The strategy returned at least one acceptable candidate and at least one unacceptable candidate. |
| L8 | ALL | The strategy returned a nonempty list and every candidate is acceptable. |
| L9 | ALL | Every candidate is acceptable, and the complete returned alternative set matches frozen compatible native references exactly. |
| L10 | ALL | Every candidate is acceptable, and an independent review attests a material defect in the applicable frozen native reference set that the returned readings correct. |

L7 denotes a mixture of acceptable and unacceptable candidates. Green levels require every public candidate to be acceptable. An empty set is L0. Optional semantic keys are judged when emitted. The frozen CSV references use w.request and provide no directly comparable native gold, so L9 and L10 are unavailable on this run.

## Timing and structural checks

| Strategy | Wall time | Median request | p95 request | Passed final prefilter |
| --- | ---: | ---: | ---: | ---: | ---: |
| Z3 | 99.59 s | 525.86 ms | 2087.37 ms | 20.9% |
| Symbolic Prolog | 2.45 s | 3.28 ms | 18.48 ms | 18.2% |
| Prolog example transfer | 16.07 s | 24.29 ms | 374.15 ms | 18.2% |

Generation wall time includes worker startup and shutdown. The transfer training split took 2.99 s and induction took 8.76 s before generation. Corpus review is timed separately. The prefilter percentages use the final offline validation of the frozen generation. A fully accounted circuit can still contain a wrong predicate or attachment.

[Failure examples](failure-examples.md) · [Frozen sample](sample.json.gz) · [Environment and revisions](environment.json) · [Independent schema check](native-schema-audit.json)

## Alternatives and independent checks

The [v3 set evaluation](source-review-v3/README.md) classifies every message as none, some or all acceptable. The [cross-strategy comparison](symbolic-agreement.md) checks graphs up to local identifiers and ordering, and reports the effect of optional semantic enrichment.

The [blinded reviewer comparison](source-review-v2/terra-comparison/README.md) measures agreement over the same complete candidate groups. The [preliminary filter audit](preliminary-filter-audit.md) replays the source checks on all generated circuits. The [candidate inventory](candidate-audit/candidate-inventory-summary.json) records the stricter independent checks used for native annotation publication.
