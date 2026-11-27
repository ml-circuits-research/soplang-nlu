# Levels of the run 2026-11-27-syntax-benchmark-random

Registry: 63395 judged circuits of 61559 messages. Judged in this run: 5858 circuits. Before the run, 593 of the 1831 messages had a label.

| Strategy | Messages | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | waiting | GOAL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| vss | 1831 | 0 | 195 | 4 | 342 | 0 | 39 | 45 | 0 | 620 | 586 | 0 | 0 | 65.9% |
| prolog | 1831 | 41 | 229 | 1 | 383 | 7 | 37 | 4 | 0 | 658 | 238 | 233 | 0 | 61.7% |
| distilbert | 1831 | 0 | 72 | 6 | 363 | 5 | 9 | 61 | 0 | 728 | 563 | 24 | 0 | 71.8% |
| spacy | 1831 | 0 | 132 | 10 | 166 | 0 | 2 | 10 | 0 | 922 | 406 | 183 | 0 | 82.5% |
| z3 | 1831 | 0 | 236 | 10 | 460 | 0 | 31 | 9 | 0 | 599 | 250 | 236 | 0 | 59.3% |

GOAL is the share of all messages at L8, L9 or L10. A message whose circuit still waits for a judge has no level: it stands in the column "waiting" and is not counted in GOAL.
L0 no valid circuit. L1 to L6 a circuit rejected by a judge, with the judge's grade. L7 is unused, since a strategy returns one circuit. L8 an accepted circuit that is not the label the message had: a judge accepted it in this run and the message had no label, or the registry already held it as accepted. L9 the circuit is equal to the label the message had before the run, so no judge was needed. L10 a judge accepted the circuit in this run and the message had another label before, so the label is replaced.

Accepted circuits that leave an attachment open (`attachment=ambiguous`):

| Strategy | Accepted circuits | With `attachment=ambiguous` | Share |
| --- | ---: | ---: | ---: |
| vss | 1206 | 67 | 5.6% |
| prolog | 1129 | 542 | 48.0% |
| distilbert | 1315 | 72 | 5.5% |
| spacy | 1511 | 277 | 18.3% |
| z3 | 1085 | 505 | 46.5% |
