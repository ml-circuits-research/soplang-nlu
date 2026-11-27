# Levels of the run 2026-11-27-syntax-benchmark-dry

Registry: 0 judged circuits of 0 messages. Judged in this run: 0 circuits. Before the run, 0 of the 1831 messages had a label.

| Strategy | Messages | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | waiting | GOAL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| distilbert | 1831 | 8 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1823 | 0.0% |
| vss | 1831 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1831 | 0.0% |

GOAL is the share of all messages at L8, L9 or L10. A message whose circuit still waits for a judge has no level: it stands in the column "waiting" and is not counted in GOAL.
L0 no valid circuit. L1 to L6 a circuit rejected by a judge, with the judge's grade. L7 is unused, since a strategy returns one circuit. L8 an accepted circuit that is not the label the message had: a judge accepted it in this run and the message had no label, or the registry already held it as accepted. L9 the circuit is equal to the label the message had before the run, so no judge was needed. L10 a judge accepted the circuit in this run and the message had another label before, so the label is replaced.

Circuits are still waiting for a judge, so GOAL is not final. It can only rise:

| Strategy | Waiting | GOAL now | GOAL if every waiting circuit is accepted |
| --- | ---: | ---: | ---: |
| distilbert | 1823 | 0.0% | 99.6% |
| vss | 1831 | 0.0% | 100.0% |

Accepted circuits that leave an attachment open (`attachment=ambiguous`):

| Strategy | Accepted circuits | With `attachment=ambiguous` | Share |
| --- | ---: | ---: | ---: |
| distilbert | 0 | 0 | — |
| vss | 0 | 0 | — |

Not in the table: z3 (not ported), prolog-worlds (not ported), prolog-example-transfer (not ported), selector-distilbert (not ported), spacy-beam (not ported), spacy-direct (not ported), neuro-z3 (not ported), neuro-selector (not ported), neuro-prolog (not ported).
