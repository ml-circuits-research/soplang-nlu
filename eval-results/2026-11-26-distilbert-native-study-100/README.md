# DistilBERT standalone CPU study on 100 paired sources

DistilBERT returned 97 schema-valid public circuits covering 97 inputs. The public source gate classified 42 as complete and 55 as missing material source evidence. It rejected three further circuits with mixed-type coordination. One also lacked entity evidence. The worker produced a graph for every input without a worker error.

| Public outputs capped at two | At least one source-complete | None acceptable | Some acceptable | All acceptable | At least one acceptable |
| --- | ---: | ---: | ---: | ---: | ---: |
| DistilBERT | 42% | 75% | 0% | 25% | 25% |
| Pretrained spaCy direct | 77% | 47% | 0% | 53% | 53% |
| Pretrained spaCy beam | 83% | 43% | 18% | 39% | 57% |
| Frozen neuro-selector | 93% | 26% | 27% | 47% | 74% |

DistilBERT returns at most one public circuit per request, so its ANY and ALL rates coincide. The study uses 100 inputs as each denominator, including structurally invalid or incomplete outputs and empty results. Baselines use the first two circuits from their archived public outputs in original order. The original unrestricted beam scored 60% ANY and 39% ALL. The original unrestricted selector scored 80% ANY and 33% ALL. Direct and DistilBERT are unchanged by the cap.

| Paired comparison under cap two | Both acceptable | DistilBERT only | Baseline only | Neither |
| --- | ---: | ---: | ---: | ---: |
| Pretrained spaCy direct | 19 | 6 | 34 | 41 |
| Pretrained spaCy beam | 21 | 4 | 36 | 39 |
| Frozen neuro-selector | 24 | 1 | 50 | 25 |

Taking accepted candidates from either DistilBERT or the capped selector would cover 75 sources at the study oracle. This is a paired coverage ceiling for these two sets, with no selection mechanism deployed.

## Circuit traces

The only source DistilBERT rescued across all three baselines was “shift the clock to just after sunset” (drawing/scenes-08.csv#2368). The released circuit links the command to the sunset through two temporal edges, with `just` attached to the `after` edge. Reviewers accepted the temporal destination reading.

```sop
@n1 nlu.clause direct_object=$n2 form=imperative polarity=positive predicate="shift"
@n2 nlu.entity determiner="the" head="clock"
@n3 nlu.relation from=$n1 kind=to to=$n5 cue="to"
@n4 nlu.relation from=$n1 kind=after to=$n5 cue="after" adverb="just"
@n5 nlu.entity head="sunset"
```

For “and slot it between the last two” (diagram/charts-06.csv#4330), the model anchored the command and its object and relation but classified coordinating `and` as an adverb. The static gate passed it and blind review rejected the role assignment. For “who points to Approve?” (diagram/charts-06.csv#4238), it mislabeled a declarative with subject `Approve` and left interrogative and relation evidence uncovered. That output failed the static gate.

## Structural comparison

Closest accepted four-provider reference per row on the 81 study sources with an accepted reference. These fact F1 scores describe structural agreement with provider-biased references. Whole-reading grades above came from source-first review.

| Strategy | Clause anchor F1 | Typed wire anchor F1 | Quoted role span F1 | Directed edge F1 | Atom F1 |
| --- | ---: | ---: | ---: | ---: | ---: |
| DistilBERT | 96.07% | 93.56% | 85.13% | 79.65% | 88.99% |
| Pretrained spaCy direct | 96.07% | 95.77% | 94.62% | 91.43% | 92.86% |

## Scope, review and timing

The evaluation loaded the first frozen checkpoint produced by this training experiment, selected at epoch eight using its separate 283-source dev set. The 100 study sources have zero exact identifier or literal text overlap with DistilBERT train and dev. These sources were previously used for selector policy validation. The student training target corpus also uses previously reviewed official and historical source data, as recorded in the split manifest. This study did not use the new official holdout.

The three baseline outputs align with the study by exact source and ID. All 537 archived baseline candidate completeness flags were reproduced against the public gate used here. The 42 eligible student circuits were novel exact identities. GPT-6.1 Terra and GPT-6.2 Sol supplied blind independent singleton judgments. A separate GPT-6.1 Sol review adjudicated five threshold disagreements, and its separate audit dissented on two of 35 consensus cases. The primary consensus retains agreement verdicts under the existing protocol. No student output below the static eligibility gate received a semantic grade.

The DistilBERT public reader ran serially with a persistent CPU worker and two PyTorch threads on the same ARM host used for the experiment. Full startup took 1.843 s. Requests including public source checks took 24.74 ms median and 40.31 ms p95, with a 26.41 ms mean. The prior archived transformer direct replay had 51.11 ms median and 73.16 ms p95 for dependency parsing plus validated projection. The older four-family validation pool measured 118.33 ms median and 208.26 ms p95 before selector ranking. These archived measurements have different run and thread settings.

The [prediction trace](trace.jsonl.gz) preserves all validator findings, rejected circuits, per-request diagnostics and timings. The [outcomes](outcomes.jsonl.gz) and [comparison](comparison.json) preserve paired acceptance under both output limits. The [checkpoint provenance](provenance.json) records the detached evaluation revision, thresholds and verified checkpoint digest.
