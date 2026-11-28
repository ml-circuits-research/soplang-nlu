# Levels of the run 2026-11-28-levels-spacy-rvss

Registry: 16598 judged circuits of 8373 messages. Judged in this run: 944 circuits. Before the run, 593 of the 1831 messages had a label.

| Strategy | Messages | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | waiting | GOAL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| spacy | 1831 | 0 | 17 | 1 | 37 | 1 | 0 | 5 | 0 | 1358 | 405 | 7 | 0 | 96.7% |
| rvss | 1831 | 17 | 107 | 5 | 129 | 1 | 12 | 40 | 0 | 1088 | 385 | 47 | 0 | 83.0% |

GOAL is the share of all messages at L8, L9 or L10. A message whose circuit still waits for a judge has no level: it stands in the column "waiting" and is not counted in GOAL.
L0 no valid circuit. L1 to L6 a circuit rejected by a judge, with the judge's grade. L7 is unused, since a strategy returns one circuit. L8 an accepted circuit that is not the label the message had: a judge accepted it in this run and the message had no label, or the registry already held it as accepted. L9 the circuit is equal to the label the message had before the run, so no judge was needed. L10 a judge accepted the circuit in this run and the message had another label before, so the label is replaced.

Accepted circuits that leave an attachment open (`attachment=ambiguous`):

| Strategy | Accepted circuits | With `attachment=ambiguous` | Share |
| --- | ---: | ---: | ---: |
| spacy | 1770 | 328 | 18.5% |
| rvss | 1520 | 307 | 20.2% |
