# Blinded Terra, Sol and Luna comparison

All three models independently reviewed the same **795 eligible proposal groups**. Each received the immutable source sentence and literal full SOP circuits, with no historical references, prior decisions, or other reviewers' reasoning. The 3,112 static L0/L2 groups are excluded from agreement measures. Terra used `gpt-6.1-terra`, Sol used `gpt-6-sol`, and Luna used `gpt-6-luna`. Terra was added after benchmark adjudication and did not change final scores or dataset witness confirmation.

| Review pair | L8 threshold agreement | Threshold Cohen's κ | Exact-grade agreement | Exact-grade Cohen's κ |
| --- | ---: | ---: | ---: | ---: |
| Terra / Sol | 691/795 (86.92%) | 0.738 | 598/795 (75.22%) | 0.633 |
| Luna / Sol | 525/795 (66.04%) | 0.320 | 378/795 (47.55%) | 0.193 |
| Terra / Luna | 521/795 (65.53%) | 0.314 | 355/795 (44.65%) | 0.163 |

Terra accepted 389/795 groups, Sol accepted 399/795, and Luna accepted 495/795. Agreement measures consistency between reviews. It does not measure the correctness of either judge.

## Independent adjudication on threshold disagreements

The independent adjudication was a fresh Sol pass over the whole proposal set. This comparison is restricted to the **270 groups where Luna and Sol disagreed at the L8 threshold**. The adjudicator shares Sol's model family, and the disagreement-only subset is not representative of all eligible groups. These conditional matches are not human-ground-truth accuracy.

| Initial disagreement | Groups | Adjudicated L8 | Terra matches | Sol matches | Luna matches |
| --- | ---: | ---: | ---: | ---: | ---: |
| Luna alone accepted | 183 | 30 | 145 (79.23%) | 153 (83.61%) | 30 (16.39%) |
| Sol alone accepted | 87 | 76 | 74 (85.06%) | 76 (87.36%) | 11 (12.64%) |
| Total | 270 | 106 | 219 (81.11%) | 229 (84.81%) | 41 (15.19%) |

On those same groups, exact grades matched the adjudicator on 187 for Terra, 203 for Sol, and 32 for Luna. Full disagreements, witness circuits, and reasons are in `disagreements.jsonl.gz`.

- **Luna alone accepted** “stacked” parsed as an imperative. Terra, Sol and adjudication assigned L1 because the source is a participial fragment, while the circuit gives it an imperative form and predicate.
- **Sol alone accepted** “Draw a small lynx to the left of the road.” Terra and the adjudicator also accepted the circuit. It links the small lynx as direct object and the road through a left-of relation on the drawing clause, a defensible placement reading. Luna treated the attachment to the clause as an omission.
- **Terra differed from adjudication** on “can you make Box much tinier.” Terra credited the object and comparative result. The adjudicator assigned L1 because the circuit labels an initial auxiliary–subject inversion as declarative. Both comments identify real features of the same circuit.

## Execution

| Review | Active wall time | CLI-reported tokens |
| --- | ---: | ---: |
| Terra, all 795 groups in one run | 133.29 s | 430,016 |
| Luna, 730 reusable groups then 65 new groups | 166.58 s | 786,986 |
| Sol, 730 reusable groups then 65 new groups | 208.32 s | 454,515 |
| Separate adjudication, 280 groups including extra calibration | 64.21 s | 180,423 |

Wall times include parallel calls, model waiting, validation and retries for each review phase. Worker counts and batching differed, so the durations are not controlled model-speed comparisons. Token counts are the CLI's totals, not a billing estimate. See `execution.json` and the parent directory's `review-execution.json` for run settings, times and digests.
