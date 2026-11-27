# Levels of the run 2026-11-27-vss-lever-trials

Registry: 12310 judged circuits of 6111 messages. Judged in this run: 791 circuits. Before the run, 1745 of the 1831 messages had a label.

| Strategy | Messages | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | waiting | GOAL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| vss-oracle-stations | 401 | 0 | 100 | 0 | 116 | 1 | 4 | 10 | 0 | 0 | 0 | 170 | 0 | 42.4% |
| vss-plain | 1831 | 0 | 187 | 3 | 315 | 0 | 34 | 37 | 0 | 694 | 514 | 47 | 0 | 68.5% |
| vss-station-prior | 1831 | 0 | 186 | 3 | 296 | 0 | 33 | 35 | 0 | 684 | 517 | 77 | 0 | 69.8% |
| vss-teacher-roles | 1831 | 0 | 186 | 1 | 264 | 1 | 14 | 40 | 0 | 694 | 520 | 111 | 0 | 72.4% |
| vss-teacher-verb | 1831 | 0 | 171 | 3 | 317 | 1 | 11 | 34 | 0 | 694 | 519 | 81 | 0 | 70.7% |

GOAL is the share of all messages at L8, L9 or L10. A message whose circuit still waits for a judge has no level: it stands in the column "waiting" and is not counted in GOAL.
L0 no valid circuit. L1 to L6 a circuit rejected by a judge, with the judge's grade. L7 is unused, since a strategy returns one circuit. L8 an accepted circuit that is not the label the message had: a judge accepted it in this run and the message had no label, or the registry already held it as accepted. L9 the circuit is equal to the label the message had before the run, so no judge was needed. L10 a judge accepted the circuit in this run and the message had another label before, so the label is replaced.

Accepted circuits that leave an attachment open (`attachment=ambiguous`):

| Strategy | Accepted circuits | With `attachment=ambiguous` | Share |
| --- | ---: | ---: | ---: |
| vss-oracle-stations | 170 | 1 | 0.6% |
| vss-plain | 1255 | 75 | 6.0% |
| vss-station-prior | 1278 | 77 | 6.0% |
| vss-teacher-roles | 1325 | 79 | 6.0% |
| vss-teacher-verb | 1294 | 77 | 6.0% |
