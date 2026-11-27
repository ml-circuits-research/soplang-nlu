# Levels of the run 2026-11-27-syntax-benchmark-random

Registry: 13006 judged circuits of 6659 messages. Judged in this run: 8073 circuits. Before the run, 593 of the 1831 messages had a label.

| Strategy | Messages | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | waiting | GOAL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| hmm-rules | 1831 | 0 | 115 | 2 | 239 | 0 | 22 | 6 | 0 | 861 | 581 | 5 | 0 | 79.0% |
| prolog | 1831 | 41 | 228 | 1 | 386 | 7 | 37 | 4 | 0 | 656 | 238 | 233 | 0 | 61.6% |
| distilbert | 1831 | 0 | 139 | 0 | 251 | 3 | 8 | 24 | 0 | 821 | 538 | 47 | 0 | 76.8% |
| spacy | 1831 | 0 | 25 | 3 | 68 | 1 | 0 | 2 | 0 | 1141 | 404 | 187 | 0 | 94.6% |
| z3 | 1831 | 0 | 236 | 10 | 464 | 0 | 31 | 9 | 0 | 595 | 250 | 236 | 0 | 59.0% |

GOAL is the share of all messages at L8, L9 or L10. A message whose circuit still waits for a judge has no level: it stands in the column "waiting" and is not counted in GOAL.
L0 no valid circuit. L1 to L6 a circuit rejected by a judge, with the judge's grade. L7 is unused, since a strategy returns one circuit. L8 an accepted circuit that is not the label the message had: a judge accepted it in this run and the message had no label, or the registry already held it as accepted. L9 the circuit is equal to the label the message had before the run, so no judge was needed. L10 a judge accepted the circuit in this run and the message had another label before, so the label is replaced.

Accepted circuits that leave an attachment open (`attachment=ambiguous`):

| Strategy | Accepted circuits | With `attachment=ambiguous` | Share |
| --- | ---: | ---: | ---: |
| hmm-rules | 1447 | 91 | 6.3% |
| prolog | 1127 | 540 | 47.9% |
| distilbert | 1406 | 84 | 6.0% |
| spacy | 1732 | 325 | 18.8% |
| z3 | 1081 | 502 | 46.4% |
