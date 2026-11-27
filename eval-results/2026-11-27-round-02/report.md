# The round 2026-11-27-round-02

Files: drawing/people-06.csv (109), calendar/meetings-10.csv (141), drawing/scenes-23.csv (148), document/text-08.csv (200).

## How the messages are settled

Each message is counted once, by the circuit that stands for it: its label, or else the accepted circuit most strategies wrote.

| Messages | Count | Share |
| --- | ---: | ---: |
| All | 598 | 100.0% |
| Settled by agreement of several families | 303 | 50.7% |
| Accepted by a judge | 262 | 43.8% |
| Written by a judge | 0 | 0.0% |
| Still open | 33 | 5.5% |

Of the open messages, 33 have a circuit that waits for a judge and 0 need a judge to write the circuit.

## How often agreement is right

345 circuits were written alike by strategies of several families and settled without a judge. 17 of them were sent to a judge, 17 are judged, and the judge accepted 17 (100.0%).

## Levels per strategy

A circuit settled by agreement counts as accepted for the strategies that wrote it.

| Strategy | Messages | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | waiting | GOAL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| z3 | 598 | 0 | 3 | 2 | 10 | 0 | 0 | 0 | 0 | 348 | 0 | 0 | 235 | 58.2% |
| prolog | 598 | 1 | 24 | 2 | 23 | 0 | 0 | 0 | 0 | 311 | 0 | 0 | 237 | 52.0% |
| prolog-example-transfer | 598 | 1 | 24 | 2 | 23 | 0 | 0 | 0 | 0 | 311 | 0 | 0 | 237 | 52.0% |
| selector-distilbert | 598 | 0 | 16 | 5 | 23 | 0 | 0 | 0 | 0 | 391 | 0 | 0 | 163 | 65.4% |
| distilbert | 598 | 4 | 1 | 0 | 2 | 0 | 0 | 0 | 0 | 335 | 0 | 0 | 256 | 56.0% |
| spacy-beam | 598 | 3 | 17 | 5 | 35 | 0 | 0 | 0 | 0 | 391 | 0 | 0 | 147 | 65.4% |
| spacy-direct | 598 | 8 | 16 | 6 | 35 | 0 | 0 | 0 | 0 | 378 | 0 | 0 | 155 | 63.2% |
| neural-dependencies | 598 | 8 | 16 | 6 | 35 | 0 | 0 | 0 | 0 | 376 | 0 | 0 | 157 | 62.9% |
| neuro-z3 | 598 | 0 | 12 | 1 | 5 | 0 | 0 | 0 | 0 | 331 | 0 | 0 | 249 | 55.4% |
| neuro-selector | 598 | 0 | 16 | 5 | 31 | 0 | 0 | 0 | 0 | 398 | 0 | 0 | 148 | 66.6% |
| neuro-prolog | 598 | 7 | 12 | 2 | 19 | 0 | 0 | 0 | 0 | 355 | 1 | 0 | 202 | 59.5% |
| vss | 598 | 0 | 12 | 0 | 63 | 0 | 0 | 3 | 0 | 519 | 1 | 0 | 0 | 87.0% |

GOAL is the share of all messages at L8, L9 or L10. A message whose circuit still waits for a judge has no level: it stands in the column "waiting" and is not counted in GOAL.
L0 no valid circuit. L1 to L6 a circuit rejected by a judge, with the judge's grade. L7 is unused, since a strategy returns one circuit. L8 an accepted circuit that is not the label the message had: a judge accepted it in this run and the message had no label, or the registry already held it as accepted. L9 the circuit is equal to the label the message had before the run, so no judge was needed. L10 a judge accepted the circuit in this run and the message had another label before, so the label is replaced.

Circuits are still waiting for a judge, so GOAL is not final. It can only rise:

| Strategy | Waiting | GOAL now | GOAL if every waiting circuit is accepted |
| --- | ---: | ---: | ---: |
| z3 | 235 | 58.2% | 97.5% |
| prolog | 237 | 52.0% | 91.6% |
| prolog-example-transfer | 237 | 52.0% | 91.6% |
| selector-distilbert | 163 | 65.4% | 92.6% |
| distilbert | 256 | 56.0% | 98.8% |
| spacy-beam | 147 | 65.4% | 90.0% |
| spacy-direct | 155 | 63.2% | 89.1% |
| neural-dependencies | 157 | 62.9% | 89.1% |
| neuro-z3 | 249 | 55.4% | 97.0% |
| neuro-selector | 148 | 66.6% | 91.3% |
| neuro-prolog | 202 | 59.5% | 93.3% |
| vss | 0 | 87.0% | 87.0% |

Accepted circuits that leave an attachment open (`attachment=ambiguous`):

| Strategy | Accepted circuits | With `attachment=ambiguous` | Share |
| --- | ---: | ---: | ---: |
| z3 | 348 | 98 | 28.2% |
| prolog | 311 | 100 | 32.2% |
| prolog-example-transfer | 311 | 100 | 32.2% |
| selector-distilbert | 391 | 75 | 19.2% |
| distilbert | 335 | 4 | 1.2% |
| spacy-beam | 391 | 61 | 15.6% |
| spacy-direct | 378 | 0 | 0.0% |
| neural-dependencies | 376 | 0 | 0.0% |
| neuro-z3 | 331 | 3 | 0.9% |
| neuro-selector | 398 | 67 | 16.8% |
| neuro-prolog | 356 | 0 | 0.0% |
| vss | 520 | 46 | 8.8% |
