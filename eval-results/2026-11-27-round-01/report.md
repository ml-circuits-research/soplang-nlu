# The round 2026-11-27-round-01

Files: drawing/style-01.csv (4), calendar/meetings-11.csv (6), document/text-10.csv (6), diagram/diagrams-08.csv (7), document/text-05.csv (17), document/text-04.csv (18), drawing/scenes-01.csv (18), diagram/diagrams-06.csv (25), document/text-11.csv (27), drawing/people-02.csv (30), calendar/meetings-05.csv (32), calendar/meetings-06.csv (40), drawing/people-03.csv (45), calendar/meetings-04.csv (48), calendar/meetings-09.csv (59), diagram/nodes-11.csv (85), drawing/placement-07.csv (108).

## How the messages are settled

Each message is counted once, by the circuit that stands for it: its label, or else the accepted circuit most strategies wrote.

| Messages | Count | Share |
| --- | ---: | ---: |
| All | 575 | 100.0% |
| Settled by agreement of several families | 2 | 0.3% |
| Accepted by a judge | 557 | 96.9% |
| Written by a judge | 0 | 0.0% |
| Still open | 16 | 2.8% |

Of the open messages, 15 have a circuit that waits for a judge and 1 need a judge to write the circuit.

## How often agreement is right

263 circuits were written alike by strategies of several families and settled without a judge. 262 of them were sent to a judge, 261 are judged, and the judge accepted 261 (100.0%).

## Levels per strategy

A circuit settled by agreement counts as accepted for the strategies that wrote it.

| Strategy | Messages | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | waiting | GOAL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| vss | 575 | 0 | 11 | 0 | 14 | 0 | 0 | 0 | 0 | 503 | 4 | 0 | 43 | 88.2% |
| spacy-direct | 575 | 0 | 35 | 1 | 20 | 1 | 2 | 2 | 0 | 511 | 3 | 0 | 0 | 89.4% |
| spacy-beam | 575 | 0 | 35 | 1 | 20 | 1 | 2 | 2 | 0 | 511 | 3 | 0 | 0 | 89.4% |
| neural-dependencies | 575 | 0 | 37 | 2 | 19 | 1 | 2 | 2 | 0 | 509 | 3 | 0 | 0 | 89.0% |
| prolog | 575 | 3 | 36 | 1 | 96 | 4 | 1 | 1 | 0 | 429 | 3 | 1 | 0 | 75.3% |
| prolog-example-transfer | 575 | 3 | 36 | 1 | 96 | 4 | 1 | 1 | 0 | 429 | 3 | 1 | 0 | 75.3% |
| neuro-prolog | 575 | 1 | 56 | 2 | 48 | 0 | 2 | 1 | 0 | 462 | 3 | 0 | 0 | 80.9% |
| distilbert | 575 | 0 | 2 | 0 | 2 | 0 | 1 | 0 | 0 | 355 | 4 | 0 | 211 | 62.4% |
| neuro-selector | 575 | 0 | 21 | 1 | 13 | 1 | 2 | 0 | 0 | 468 | 3 | 0 | 66 | 81.9% |
| selector-distilbert | 575 | 0 | 21 | 1 | 13 | 1 | 2 | 0 | 0 | 443 | 3 | 0 | 91 | 77.6% |

GOAL is the share of all messages at L8, L9 or L10. A message whose circuit still waits for a judge has no level: it stands in the column "waiting" and is not counted in GOAL.
L0 no valid circuit. L1 to L6 a circuit rejected by a judge, with the judge's grade. L7 is unused, since a strategy returns one circuit. L8 an accepted circuit that is not the label the message had: a judge accepted it in this run and the message had no label, or the registry already held it as accepted. L9 the circuit is equal to the label the message had before the run, so no judge was needed. L10 a judge accepted the circuit in this run and the message had another label before, so the label is replaced.

Circuits are still waiting for a judge, so GOAL is not final. It can only rise:

| Strategy | Waiting | GOAL now | GOAL if every waiting circuit is accepted |
| --- | ---: | ---: | ---: |
| vss | 43 | 88.2% | 95.7% |
| spacy-direct | 0 | 89.4% | 89.4% |
| spacy-beam | 0 | 89.4% | 89.4% |
| neural-dependencies | 0 | 89.0% | 89.0% |
| prolog | 0 | 75.3% | 75.3% |
| prolog-example-transfer | 0 | 75.3% | 75.3% |
| neuro-prolog | 0 | 80.9% | 80.9% |
| distilbert | 211 | 62.4% | 99.1% |
| neuro-selector | 66 | 81.9% | 93.4% |
| selector-distilbert | 91 | 77.6% | 93.4% |

Accepted circuits that leave an attachment open (`attachment=ambiguous`):

| Strategy | Accepted circuits | With `attachment=ambiguous` | Share |
| --- | ---: | ---: | ---: |
| vss | 507 | 26 | 5.1% |
| spacy-direct | 514 | 1 | 0.2% |
| spacy-beam | 514 | 120 | 23.3% |
| neural-dependencies | 512 | 1 | 0.2% |
| prolog | 433 | 225 | 52.0% |
| prolog-example-transfer | 433 | 225 | 52.0% |
| neuro-prolog | 465 | 0 | 0.0% |
| distilbert | 359 | 4 | 1.1% |
| neuro-selector | 471 | 105 | 22.3% |
| selector-distilbert | 446 | 107 | 24.0% |
