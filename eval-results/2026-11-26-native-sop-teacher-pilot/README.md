# Native SOP teacher pilot on 64 rank-train sources

| System | Source-complete input | At least one acceptable candidate | All returned candidates acceptable |
| --- | ---: | ---: | ---: |
| GPT-6 Sol offline teacher | 37/64 (57.8%) | 30/64 (46.9%) | 30/64 (46.9%) |
| Frozen neuro-selector replay | 57/64 (89.1%) | 42/64 (65.6%) | 24/64 (37.5%) |

Both systems found an acceptable circuit on 20 inputs. The teacher alone passed on 10 and the selector alone on 22. Neither passed on 12. On nine of the 10 teacher-only passes, the original four-family pool had no acceptable candidate. The accepted alternatives included a coordinated color result in “turn the photo black and white” and the two clauses and arguments in “give me a line chart of the avg sales for each month; and move the legend to the right”. The tenth teacher-only pass was “I say we let the fish change into sharks”, where an acceptable circuit was available to the selector but omitted from its final selection.

The generation pass supplied only source text and the actual local schema. The first attempt passed the public completeness gate on 24 inputs. The sole repair attempt passed on another 13 of 40 inputs. The repair saw static diagnostic feedback and the failed circuit. All 37 eligible teacher circuits were novel exact source/circuit identities. Two blinded reviews used GPT-6.1 Terra and GPT-6.2 Sol. GPT-6.1 Sol resolved five threshold disagreements in a separate review and audited 24 agreements without reversing an outcome. The teacher returned one circuit per input, so at least one and all acceptable coincide.

The teacher took 81.9 seconds wall for generation and repair with parallel batches of eight sources. This is offline supervision time and excludes the independent review; it cannot be compared to production request latency. There was no model fitting or public runtime change. The baseline replays the frozen selector on the same inputs from archived proposal pools and verified votes. Its ranker fit previously used these inputs, so the paired results describe these training examples. The sealed fresh test was untouched.

[Accepted training pairs](accepted-supervision.jsonl.gz) contains only the 30 accepted source and circuit pairs. [Paired outcomes](outcomes.jsonl.gz) preserves all emitted teacher and selector circuits, eligibility and reviewed acceptance. [Provenance](provenance.json) identifies inputs, frozen model, prompt and schema. The batch folder captures exact generation and repair prompts, raw structured responses, validator checks and timings. The review folder records blinded packets, votes, adjudications and execution logs. See the [replay instructions](../../experiments/native-teacher/README.md).
