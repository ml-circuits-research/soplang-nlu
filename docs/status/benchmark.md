[Home](../README.md) › [Status](../STATUS.md) › Benchmark in detail

# Benchmark in detail

This page: the levels of every strategy on the benchmark, which version of each strategy the table reads, the accepted circuits that leave an attachment open, and the facts of the run. Kind: Reference.

Generated 2026-11-27 22:24 (UTC+01:00) by `node docs/status/build.mjs` · soplang-nlu 7ffdbd4 (61 uncommitted paths) · webmeet-dataset 0a01d23. The main figures are in [The benchmark, live](../STATUS.md#the-benchmark-live) on the status page; the terms are explained in the [Glossary](../reference/glossary.md).

**Each strategy**, in messages of the benchmark: GOAL with its 95% interval; accepted (L8–L10), rejected (L1–L6), no circuit (L0), waiting for a judge; and the count at every level.

**spacy**

| Measure | Value |
| --- | --- |
| GOAL | 94.6% (93.5–95.5) |
| Accepted (L8–L10) | 1,732 |
| Rejected (L1–L6) | 99 |
| No circuit (L0) | 0 |
| Waiting | 0 |
| Messages | 1,831 |
| Every level | L0 0 · L1 25 · L2 3 · L3 68 · L4 1 · L5 0 · L6 2 · L7 0 · L8 1,141 · L9 404 · L10 187 |

**vss**

| Measure | Value |
| --- | --- |
| GOAL | 79.8% (77.9–81.6) |
| Accepted (L8–L10) | 1,462 |
| Rejected (L1–L6) | 369 |
| No circuit (L0) | 0 |
| Waiting | 0 |
| Messages | 1,831 |
| Every level | L0 0 · L1 114 · L2 2 · L3 225 · L4 0 · L5 22 · L6 6 · L7 0 · L8 876 · L9 581 · L10 5 |

**distilbert**

| Measure | Value |
| --- | --- |
| GOAL | 77.3% (75.3–79.1) |
| Accepted (L8–L10) | 1,415 |
| Rejected (L1–L6) | 416 |
| No circuit (L0) | 0 |
| Waiting | 0 |
| Messages | 1,831 |
| Every level | L0 0 · L1 137 · L2 0 · L3 244 · L4 3 · L5 8 · L6 24 · L7 0 · L8 830 · L9 538 · L10 47 |

**prolog** (parked)

| Measure | Value |
| --- | --- |
| GOAL | 61.7% (59.4–63.9) |
| Accepted (L8–L10) | 1,129 |
| Rejected (L1–L6) | 661 |
| No circuit (L0) | 41 |
| Waiting | 0 |
| Messages | 1,831 |
| Every level | L0 41 · L1 229 · L2 1 · L3 383 · L4 7 · L5 37 · L6 4 · L7 0 · L8 658 · L9 238 · L10 233 |

**z3** (parked)

| Measure | Value |
| --- | --- |
| GOAL | 59.3% (57.0–61.5) |
| Accepted (L8–L10) | 1,085 |
| Rejected (L1–L6) | 746 |
| No circuit (L0) | 0 |
| Waiting | 0 |
| Messages | 1,831 |
| Every level | L0 0 · L1 236 · L2 10 · L3 460 · L4 0 · L5 31 · L6 9 · L7 0 · L8 599 · L9 250 · L10 236 |

### Where each strategy's circuits come from (which version the table reads)

The strategy file of the run, and the commit that last changed it:

- **spacy**: file written 2026-11-27 21:41; committed 21:43 in [`c4e5db7`](https://github.com/ml-circuits-research/soplang-nlu/commit/c4e5db7): "Benchmark: verdicts on the 18 new spaCy circuits after the fifth round (0f20f16), packet 55"
- **vss**: file written 2026-11-27 21:49; committed 21:54 in [`0dd21c3`](https://github.com/ml-circuits-research/soplang-nlu/commit/0dd21c3): "Benchmark: verdicts on the 33 new VSS circuits after c080ce8, packet 56"
- **distilbert**: file written 2026-11-27 20:03; committed 20:17 in [`6af9b97`](https://github.com/ml-circuits-research/soplang-nlu/commit/6af9b97): "Benchmark: DistilBERT syntax-v3 (trained on the grown labels, benchmark held out), 498 new circuits judged, packets 4…"
- **prolog**: file written 2026-11-27 15:52; committed 16:14 in [`a09047d`](https://github.com/ml-circuits-research/soplang-nlu/commit/a09047d): "Batch conversion: settle and write scripts, the pooled audit of agreed circuits (1,154 read, 10 rejected), and the st…"
- **z3**: file written 2026-11-27 15:56; committed 16:14 in [`a09047d`](https://github.com/ml-circuits-research/soplang-nlu/commit/a09047d): "Batch conversion: settle and write scripts, the pooled audit of agreed circuits (1,154 read, 10 rejected), and the st…"

### Accepted circuits that leave an attachment open

A circuit may mark a phrase with `attachment=ambiguous` when the words do not say where it hangs. The hand-written grammars do this far more often, which makes their circuits easier to accept. For each strategy, the share of its accepted circuits that carry the mark:

- **spacy**: 18.8%, 325 of 1,732 accepted circuits.
- **vss**: 6.3%, 92 of 1,462 accepted circuits.
- **distilbert**: 6.1%, 86 of 1,415 accepted circuits.
- **prolog**: 48.0%, 542 of 1,129 accepted circuits.
- **z3**: 46.5%, 505 of 1,085 accepted circuits.

**About this run.** `2026-11-27-syntax-benchmark-random`: 1,831 messages drawn at random from the whole dataset (seed and method in `sample.lock.json`), every circuit of every strategy judged. Judged in this run: 8,073 circuits. Before the run, 593 of the 1,831 messages had a label. The [registry](../reference/glossary.md#project-terms) of judged circuits holds 12,862 circuits of 6,657 messages: 12,536 read by claude-opus-5-5, and 326 agreement circuits recorded with no judge: 306 agreement labels that the benchmark publication replaced, kept as accepted readings, in `2026-11-27-benchmark-random-replaced-agreement.jsonl`; 20 second agreed circuits of a conversion round, an open point of the journal, in `2026-11-27-round-02.jsonl`.

---

Next: [Every measurement](progress.md) · Up: [Status](../STATUS.md)
