# Native NLU paired benchmark

The three strategies read the same 1861 frozen text records from WebMeet dataset revision `d25c2645c098`. Generation used 16 workers per strategy. Percentages below have one denominator per strategy and are rounded by largest remainder so each column totals 100.0%.

| Level | Z3 | Symbolic Prolog | Prolog example transfer |
| --- | ---: | ---: | ---: |
| 🔴 L0 | 3.9% | 3.0% | 3.0% |
| 🔴 L1 | 6.1% | 4.2% | 4.2% |
| 🔴 L2 | 75.3% | 78.8% | 78.8% |
| 🔴 L3 | 2.9% | 2.4% | 2.4% |
| 🔴 L4 | 0.6% | 0.8% | 0.7% |
| 🟠 L5 | 0.1% | 0.5% | 0.5% |
| 🟠 L6 | 0.2% | 0.2% | 0.2% |
| 🟠 L7 | 0.5% | 0.4% | 0.4% |
| 🟢 L8 | 10.4% | 9.7% | 9.8% |
| 🟢 L9 | 0.0% | 0.0% | 0.0% |
| 🟢 L10 | 0.0% | 0.0% | 0.0% |
| **Total** | 100.0% | 100.0% | 100.0% |

| Level | Criterion |
| --- | --- |
| L0 | No usable interpretation. No candidate is schema-valid and source-grounded, or none of the complete candidates represents a coherent fragment or useful role. |
| L1 | Wrong principal form, clause boundary, predicate interpretation, action, question, modality or polarity. |
| L2 | Static source gap. A valid, grounded candidate exists, but all such candidates leave source occurrences uncovered or unresolved. |
| L3 | Wrong subject, object, participant, recipient, endpoint, relationship, direction, value, scope or qualifier. |
| L4 | Adds a material role, action, entity, condition, value or semantic class unsupported by the source. |
| L5 | Recognizes useful meaning, but omits an essential clause, predicate, action or step. |
| L6 | Omits an essential participant, subject, object, reference or endpoint of a recognized clause. |
| L7 | Omits an essential modifier, property, relation, value, placement, scope or condition. |
| L8 | A coherent whole source reading. Includes reasonable alternate attachments or unresolved identity of a genuinely contextual pronoun. |
| L9 | A coherent whole reading exactly matching independently validated native gold. Reserved when this cohort has no native gold. |
| L10 | A coherent whole reading materially improving all applicable native references and independently confirmed. Reserved when this cohort has no native gold. |

Green levels meet the acceptance threshold. Static-only cases receive L0 or L2. The model judge reads the source and complete eligible circuits. Semantic keys are optional. The frozen CSV references use w.request and provide no directly comparable native gold, so L9 and L10 are unavailable on this run.

## Timing and structural checks

| Strategy | Wall time | Median request | p95 request | Passed final prefilter |
| --- | ---: | ---: | ---: | ---: | ---: |
| Z3 | 99.59 s | 525.86 ms | 2087.37 ms | 20.9% |
| Symbolic Prolog | 2.45 s | 3.28 ms | 18.48 ms | 18.2% |
| Prolog example transfer | 16.07 s | 24.29 ms | 374.15 ms | 18.2% |

Generation wall time includes worker startup and shutdown. The transfer training split took 2.99 s and induction took 8.76 s before generation. Corpus review is timed separately. The prefilter percentages use the final offline validation of the frozen generation. A fully accounted circuit can still contain a wrong predicate or attachment.

[Failure examples](failure-examples.md) · [Frozen sample](sample.json.gz) · [Environment and revisions](environment.json) · [Independent schema check](native-schema-audit.json)
