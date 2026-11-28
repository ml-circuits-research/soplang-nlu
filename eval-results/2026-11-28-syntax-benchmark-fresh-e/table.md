# Levels of the run 2026-11-28-syntax-benchmark-fresh-e

Registry: 23156 judged circuits of 12239 messages. Judged in this run: 0 circuits. Before the run, 1010 of the 2542 messages had a label.

| Strategy | Messages | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | waiting | GOAL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| spacy | 2542 | 0 | 4 | 0 | 10 | 0 | 0 | 0 | 0 | 22 | 594 | 0 | 1912 | 24.2% |
| rvss | 1320 | 4 | 2 | 0 | 2 | 0 | 0 | 0 | 0 | 17 | 444 | 0 | 851 | 34.9% |

GOAL is the share of all messages at L8, L9 or L10. A message whose circuit still waits for a judge has no level: it stands in the column "waiting" and is not counted in GOAL.
L0 no valid circuit. L1 to L6 a circuit rejected by a judge, with the judge's grade. L7 is unused, since a strategy returns one circuit. L8 an accepted circuit that is not the label the message had: a judge accepted it in this run and the message had no label, or the registry already held it as accepted. L9 the circuit is equal to the label the message had before the run, so no judge was needed. L10 a judge accepted the circuit in this run and the message had another label before, so the label is replaced.

Circuits are still waiting for a judge, so GOAL is not final. It can only rise:

| Strategy | Waiting | GOAL now | GOAL if every waiting circuit is accepted |
| --- | ---: | ---: | ---: |
| spacy | 1912 | 24.2% | 99.4% |
| rvss | 851 | 34.9% | 99.4% |

Accepted circuits that leave an attachment open (`attachment=ambiguous`):

| Strategy | Accepted circuits | With `attachment=ambiguous` | Share |
| --- | ---: | ---: | ---: |
| spacy | 616 | 36 | 5.8% |
| rvss | 461 | 17 | 3.7% |
