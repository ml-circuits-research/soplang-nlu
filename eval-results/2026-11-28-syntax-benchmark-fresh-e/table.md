# Levels of the run 2026-11-28-syntax-benchmark-fresh-e

Registry: 23156 judged circuits of 12239 messages. Judged in this run: 2781 circuits. Before the run, 1010 of the 2542 messages had a label.

| Strategy | Messages | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | waiting | GOAL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| spacy | 2542 | 0 | 75 | 8 | 142 | 2 | 3 | 5 | 0 | 1331 | 594 | 382 | 0 | 90.8% |
| rvss | 2542 | 8 | 89 | 1 | 122 | 0 | 12 | 12 | 0 | 1330 | 550 | 418 | 0 | 90.4% |

GOAL is the share of all messages at L8, L9 or L10. A message whose circuit still waits for a judge has no level: it stands in the column "waiting" and is not counted in GOAL.
L0 no valid circuit. L1 to L6 a circuit rejected by a judge, with the judge's grade. L7 is unused, since a strategy returns one circuit. L8 an accepted circuit that is not the label the message had: a judge accepted it in this run and the message had no label, or the registry already held it as accepted. L9 the circuit is equal to the label the message had before the run, so no judge was needed. L10 a judge accepted the circuit in this run and the message had another label before, so the label is replaced.

Accepted circuits that leave an attachment open (`attachment=ambiguous`):

| Strategy | Accepted circuits | With `attachment=ambiguous` | Share |
| --- | ---: | ---: | ---: |
| spacy | 2307 | 301 | 13.0% |
| rvss | 2298 | 250 | 10.9% |
