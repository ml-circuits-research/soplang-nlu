# Levels of the run 2026-11-28-syntax-benchmark-fresh

Registry: 13006 judged circuits of 6659 messages. Judged in this run: 2470 circuits. Before the run, 1152 of the 2225 messages had a label.

| Strategy | Messages | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | waiting | GOAL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| spacy | 2225 | 0 | 115 | 8 | 243 | 3 | 4 | 6 | 0 | 801 | 773 | 272 | 0 | 83.0% |
| hmm-rules | 2225 | 0 | 155 | 3 | 351 | 2 | 18 | 4 | 0 | 686 | 987 | 19 | 0 | 76.0% |

GOAL is the share of all messages at L8, L9 or L10. A message whose circuit still waits for a judge has no level: it stands in the column "waiting" and is not counted in GOAL.
L0 no valid circuit. L1 to L6 a circuit rejected by a judge, with the judge's grade. L7 is unused, since a strategy returns one circuit. L8 an accepted circuit that is not the label the message had: a judge accepted it in this run and the message had no label, or the registry already held it as accepted. L9 the circuit is equal to the label the message had before the run, so no judge was needed. L10 a judge accepted the circuit in this run and the message had another label before, so the label is replaced.

Accepted circuits that leave an attachment open (`attachment=ambiguous`):

| Strategy | Accepted circuits | With `attachment=ambiguous` | Share |
| --- | ---: | ---: | ---: |
| spacy | 1846 | 225 | 12.2% |
| hmm-rules | 1692 | 56 | 3.3% |
