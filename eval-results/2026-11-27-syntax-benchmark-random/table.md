# Levels of the run 2026-11-27-syntax-benchmark-random

Registry: 12310 judged circuits of 6111 messages. Judged in this run: 6898 circuits. Before the run, 593 of the 1831 messages had a label.

| Strategy | Messages | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | waiting | GOAL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| vss | 1831 | 0 | 117 | 2 | 234 | 0 | 28 | 23 | 0 | 619 | 582 | 1 | 225 | 65.6% |
| prolog | 1831 | 41 | 229 | 1 | 383 | 7 | 37 | 4 | 0 | 658 | 238 | 233 | 0 | 61.7% |
| distilbert | 1831 | 0 | 150 | 3 | 274 | 4 | 5 | 57 | 0 | 754 | 535 | 49 | 0 | 73.1% |
| spacy | 1831 | 0 | 74 | 11 | 149 | 0 | 3 | 4 | 0 | 1000 | 406 | 184 | 0 | 86.8% |
| z3 | 1831 | 0 | 236 | 10 | 460 | 0 | 31 | 9 | 0 | 599 | 250 | 236 | 0 | 59.3% |

GOAL is the share of all messages at L8, L9 or L10. A message whose circuit still waits for a judge has no level: it stands in the column "waiting" and is not counted in GOAL.
L0 no valid circuit. L1 to L6 a circuit rejected by a judge, with the judge's grade. L7 is unused, since a strategy returns one circuit. L8 an accepted circuit that is not the label the message had: a judge accepted it in this run and the message had no label, or the registry already held it as accepted. L9 the circuit is equal to the label the message had before the run, so no judge was needed. L10 a judge accepted the circuit in this run and the message had another label before, so the label is replaced.

Circuits are still waiting for a judge, so GOAL is not final. It can only rise:

| Strategy | Waiting | GOAL now | GOAL if every waiting circuit is accepted |
| --- | ---: | ---: | ---: |
| vss | 225 | 65.6% | 77.9% |
| prolog | 0 | 61.7% | 61.7% |
| distilbert | 0 | 73.1% | 73.1% |
| spacy | 0 | 86.8% | 86.8% |
| z3 | 0 | 59.3% | 59.3% |

Accepted circuits that leave an attachment open (`attachment=ambiguous`):

| Strategy | Accepted circuits | With `attachment=ambiguous` | Share |
| --- | ---: | ---: | ---: |
| vss | 1202 | 66 | 5.5% |
| prolog | 1129 | 542 | 48.0% |
| distilbert | 1338 | 79 | 5.9% |
| spacy | 1590 | 293 | 18.4% |
| z3 | 1085 | 505 | 46.5% |
