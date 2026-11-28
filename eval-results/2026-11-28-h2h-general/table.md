# Levels of the run 2026-11-28-h2h-general

Registry: 21767 judged circuits of 11264 messages. Judged in this run: 0 circuits. Before the run, 20 of the 1000 messages had a label.

| Strategy | Messages | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | waiting | GOAL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| spacy | 1000 | 0 | 1 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 20 | 0 | 976 | 2.0% |
| rvss | 1000 | 8 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 12 | 0 | 978 | 1.2% |

GOAL is the share of all messages at L8, L9 or L10. A message whose circuit still waits for a judge has no level: it stands in the column "waiting" and is not counted in GOAL.
L0 no valid circuit. L1 to L6 a circuit rejected by a judge, with the judge's grade. L7 is unused, since a strategy returns one circuit. L8 an accepted circuit that is not the label the message had: a judge accepted it in this run and the message had no label, or the registry already held it as accepted. L9 the circuit is equal to the label the message had before the run, so no judge was needed. L10 a judge accepted the circuit in this run and the message had another label before, so the label is replaced.

Circuits are still waiting for a judge, so GOAL is not final. It can only rise:

| Strategy | Waiting | GOAL now | GOAL if every waiting circuit is accepted |
| --- | ---: | ---: | ---: |
| spacy | 976 | 2.0% | 99.6% |
| rvss | 978 | 1.2% | 99.0% |

Accepted circuits that leave an attachment open (`attachment=ambiguous`):

| Strategy | Accepted circuits | With `attachment=ambiguous` | Share |
| --- | ---: | ---: | ---: |
| spacy | 20 | 2 | 10.0% |
| rvss | 12 | 1 | 8.3% |
