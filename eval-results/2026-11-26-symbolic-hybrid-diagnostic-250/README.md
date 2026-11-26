# Symbolic and hybrid comparison on the fixed beam diagnostic slice

The four new runs use an isolated `0b955a1` checkout and the same public
validating reader on the beam diagnostic's 250 ordered source IDs. The
neuro-Z3 provider consumes the exact saved transformer greedy graph for
each source. Its digest was verified against the beam inference evidence.
The standalone and beam rows reuse the separately archived `0b955a1`
measurements. This is a historical development comparison.

| Strategy | None | Some | All | Any | Median / p95 request |
| --- | ---: | ---: | ---: | ---: | ---: |
| Z3 | 80.8% | 4.0% | 15.2% | 19.2% | 246.07 / 2,622.95 ms |
| Worlds-only Prolog | 67.2% | 13.6% | 19.2% | 32.8% | 5.63 / 69.76 ms |
| Prolog example transfer | 66.8% | 14.8% | 18.4% | 33.2% | 20.69 / 377.32 ms |
| Neuro-Z3, transformer | 65.6% | 0% | 34.4% | 34.4% | 17.04 / 37.15 ms |
| spaCy direct, transformer | 33.6% | 0% | 66.4% | 66.4% | 0.11 / 0.45 ms |
| spaCy beam, transformer | 28.4% | 23.6% | 48.0% | 71.6% | 0.34 / 1.24 ms |

Request times include public projection and validation. Solver-backed
strategies include solver work. The reported neural timings start with
saved dependency graphs and exclude generating those graphs and the beam.
The new engines ran serially, one engine at a time. The prior comparator
harness interleaved direct and beam calls by source. The measurements
support a diagnostic comparison of the public work, with startup,
training and neural-inference overhead accounted for separately.
The four new runs had zero request errors. Worlds-only Prolog and example
transfer each had one text where validation left no public circuit.

## Transfer training and effects

Training used pinned dataset revision `38ae0b5`. Before training, the
split excluded every row sharing an ID or exact source text with the
1,861 historical records or the 1,831 sealed records. The two excluded
selections shared 16 exact texts and 17 IDs. Exact source overlap with
the final donor set was zero for each selection. The exclusion removed
2,143 historical-only rows, 1,813 sealed-only rows and 18 in both groups
from the pinned dataset. No sealed row texts or predictions are archived
here. Training read 179,120 donor texts and 179,343 legacy references,
producing 75,599 templates. Training took 8.55 s after the 3.20 s split
and model loading took 2.16 s in the diagnostic process.

Transfer added 162 distinct legacy candidates across 71 diagnostic texts.
The native public sets differed from the worlds-only entry point on 35
texts. There were 55 exact native SOP additions overall, of which seven
were explicitly produced by decorating transferred candidates. Of those
seven, five passed the static source gate and three passed blind review.
The two public entry points differ in their legacy enrichment path, so
their other exact SOP differences cannot all be attributed to training.
Transfer gained accepted coverage on one text and lost none relative to
worlds-only. The gain treats “pine tree” as the name of the previously
introduced car when the next instruction asks to put it below snow.
The worlds-only candidate treated it as a pine.

The candidate review reused 198 compatible exact source-and-SOP decisions
from the historical Neuro-Prolog diagnostic. GPT-6 Sol and GPT-6.1 Terra
independently reviewed 310 new exact circuits. The combined set had 61
threshold disagreements and 40 agreement audit cases, with four
contradictions among the agreement audits. Compatible earlier adjudications
were reused and GPT-6.2 Sol reviewed the remaining audit packets.

Run `node verify.mjs` to check source IDs, training exclusions, public
validation records and timing percentiles. Run `python3 compare.py` to
reconstruct outcomes, pairwise acceptance and transfer attribution.

[Paired results](comparison.json) · [Blind judgments](review/candidate-review-summary.json) ·
[Transfer split](prolog-example-transfer-training.json) ·
[Prior Neuro-Prolog diagnostic](../2026-11-26-neuro-prolog-historical-diagnostic-250/README.md)
