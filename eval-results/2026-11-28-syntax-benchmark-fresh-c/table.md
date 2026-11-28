# Levels of the run 2026-11-28-syntax-benchmark-fresh-c

Registry: 17547 judged circuits of 8382 messages. Judged in this run: 0 circuits. Before the run, 880 of the 1927 messages had a label.

| Strategy | Messages | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | waiting | GOAL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| hmm-rules | 1927 | 0 | 5 | 0 | 6 | 0 | 0 | 0 | 0 | 32 | 821 | 0 | 1063 | 44.3% |
| spacy | 1927 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 27 | 468 | 0 | 1432 | 25.7% |

GOAL is the share of all messages at L8, L9 or L10. A message whose circuit still waits for a judge has no level: it stands in the column "waiting" and is not counted in GOAL.
L0 no valid circuit. L1 to L6 a circuit rejected by a judge, with the judge's grade. L7 is unused, since a strategy returns one circuit. L8 an accepted circuit that is not the label the message had: a judge accepted it in this run and the message had no label, or the registry already held it as accepted. L9 the circuit is equal to the label the message had before the run, so no judge was needed. L10 a judge accepted the circuit in this run and the message had another label before, so the label is replaced.

Circuits are still waiting for a judge, so GOAL is not final. It can only rise:

| Strategy | Waiting | GOAL now | GOAL if every waiting circuit is accepted |
| --- | ---: | ---: | ---: |
| hmm-rules | 1063 | 44.3% | 99.4% |
| spacy | 1432 | 25.7% | 100.0% |

Accepted circuits that leave an attachment open (`attachment=ambiguous`):

| Strategy | Accepted circuits | With `attachment=ambiguous` | Share |
| --- | ---: | ---: | ---: |
| hmm-rules | 853 | 49 | 5.7% |
| spacy | 495 | 29 | 5.9% |
