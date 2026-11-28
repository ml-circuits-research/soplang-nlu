# Levels of the run 2026-11-28-syntax-benchmark-fresh-b

Registry: 15729 judged circuits of 7992 messages. Judged in this run: 713 circuits. Before the run, 1649 of the 1964 messages had a label.

| Strategy | Messages | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | waiting | GOAL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| hmm-rules | 1964 | 0 | 91 | 1 | 236 | 0 | 27 | 3 | 0 | 646 | 950 | 10 | 0 | 81.8% |
| spacy | 1964 | 0 | 39 | 3 | 138 | 3 | 1 | 4 | 0 | 367 | 1228 | 181 | 0 | 90.4% |

GOAL is the share of all messages at L8, L9 or L10. A message whose circuit still waits for a judge has no level: it stands in the column "waiting" and is not counted in GOAL.
L0 no valid circuit. L1 to L6 a circuit rejected by a judge, with the judge's grade. L7 is unused, since a strategy returns one circuit. L8 an accepted circuit that is not the label the message had: a judge accepted it in this run and the message had no label, or the registry already held it as accepted. L9 the circuit is equal to the label the message had before the run, so no judge was needed. L10 a judge accepted the circuit in this run and the message had another label before, so the label is replaced.

Accepted circuits that leave an attachment open (`attachment=ambiguous`):

| Strategy | Accepted circuits | With `attachment=ambiguous` | Share |
| --- | ---: | ---: | ---: |
| hmm-rules | 1606 | 127 | 7.9% |
| spacy | 1776 | 325 | 18.3% |
