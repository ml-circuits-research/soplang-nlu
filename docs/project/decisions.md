[Home](../README.md) › [Project](README.md) › Decisions of the owner

# Decisions of the owner (D1–D14)

This page: the owner's decisions of 2026-11-27, each with its reason, its consequence and the commits where it landed; the only page that gives their reasons. Kind: Explanation.

## How to read this page

On 2026-11-27 the [formalizers](../formalizers/README.md) moved from the detailed `nlu` schema to the small [syntax schema](../schema/overview.md), and the dataset received its first syntactic labels. These are the decisions the owner took that day. The project terms used below (circuit, label, judge, fixer, agreement, family, registry, packet, audit, round) are defined in the [Glossary](../reference/glossary.md#project-terms).

Each decision has a heading (`D1` to `D14`, so a link can point at `decisions.md#d1`), a one-line title in bold, and a small table: the decision, its reason, its consequence, and the commits where it landed. Commits without a prefix are in soplang-nlu; "dataset" means webmeet-dataset. This is the form of an [architectural decision record](https://en.wikipedia.org/wiki/Architectural_decision), a standard practice; the decisions themselves are this project's.

The working session kept these decisions in notes that are not in the repository. The report [syntax-work-2026-11-27.html](../syntax-work-2026-11-27.html) (section "Decisions of the owner") records them with their commits; this page follows it. Choices made in the code, not by the owner, are in [Tool choices T1–T4](tool-decisions.md).

## D1

**GOAL is judged acceptance, with an aim over 99%.**

| Part | Record |
| --- | --- |
| Decision | Measure the share of messages whose circuit a judge accepts (L8), that equals the label (L9), or that a judge accepted and that replaces the label (L10). Aim over 99%. |
| Reason | The dataset is corrected through a judged loop until the comparison with it is exact. The owner refused to restate the goal as "precision on unflagged readings plus coverage" (how often a reader is right where it raises no doubt, plus how many messages it covers). |
| Consequence | L9 and L10 are computed against the label; every accepted circuit becomes a label (D6); the labels of a run's messages are frozen when its judging is first prepared (`key/labels-before.jsonl`). How far judges agree with each other bounds what can be measured ([Limits](../evaluation/validity.md)). Levels: [Levels L0–L10 and GOAL](../evaluation/levels.md). |
| Landed | `e166870` (benchmark, registry, table); `24de853` (labels from accepted circuits, levels L9 and L10). |

## D2

**Fair judging: a circuit passes if the next layer can complete it.**

| Part | Record |
| --- | --- |
| Decision | A circuit fails only when it states something wrong or loses information the words give. Plausible and incomplete readings pass. This is the external reviewer's criterion, adopted by the owner. |
| Reason | A formalizer sees one message without context. It should state what the words settle and leave the rest to the next layer, which "never has to undo a guess". |
| Consequence | The judges' rules ([rules.md](../../tests/benchmark/syntax/rules.md)) ask one question, give grades L1 to L6, list where several readings pass and what is not judged, and add a settled case whenever judges disagreed. Detail: [Judges and the judging rule](../evaluation/judging.md). |
| Landed | In the nlu schema, `strategies/hmm-rules/judging-rules.md`: `8fb0205`, `615e232`, `9196fe7`. In the syntax schema, rules.md: `e166870` (created), `24de853` (5 settled cases), `01695d3` (6 settled cases). |

## D3

**A small, purely syntactic schema replaces the nlu schema.**

| Part | Record |
| --- | --- |
| Decision | The syntax schema, version 3: four wire types and 18 keys, named with the established terms of grammar, no metaphors. Its specification is self-contained and records the reason for every reviewer suggestion not adopted. |
| Reason | See the list below. |
| Consequence | Every strategy had to be rewritten (D4). The old judged nlu circuits stopped counting. |
| Landed | `7a90ade` (version 1), `8536c9c` (version 3, checker and writer), `f9f0a97` (specification). |

Why the project left the nlu schema:

- **The layer states what the words show, and nothing that needs meaning.** The nlu schema (`schemas/nlu/schema.sop`) had more than 50 keys. It separated, among others, direct object, indirect object, predicative entity, topic and participant; adverb, particle, result complement and degree; several kinds of relation. Who receives, what is the result and what a pronoun refers to are for the next layer. Each of those distinctions maps to one key of syntax ([From the nlu schema](../schema/nlu-mapping.md)).
- **No dependence on another repository.** The schema, its checker and its writer are in soplang-nlu itself (`schemas/syntax/schema.sop`, `lib/syntax.mjs`). Before, the common reader skipped the check when no knowledge repository was configured, "so a returned result proved nothing".
- **Established names.** Version 1 called a clause a fact and a nominal a thing, with keys such as doer, action and how. An intermediate draft used everyday words; the owner asked for the established terms, since such terms exist and everyday words read as metaphors ([Decisions 6–8](../schema/decisions-names.md)).
- **The reviewer's cases fit four types.** "make A blue and B green" shows the shared verb (the key ellipsis); "near Ben but not behind Jo" shows two relations joined by "but", with "not" on the second only.

## D4

**Every strategy writes the syntax schema directly, with no knowledge repository and no old annotations.**

| Part | Record |
| --- | --- |
| Decision | Each strategy reads the text and writes one syntax circuit: without building an nlu circuit first, without the repository sop-knowledge-worlds, and without the old annotated data, which is no longer trusted. |
| Reason | The purpose of the schema (D3). The old annotations were written for another schema and judged by other rules. |
| Consequence | A strategy declares `schema: 'syntax'`; the common reader `createReader` (`lib/reader.mjs`) always checks its circuit; `SOP_KNOWLEDGE_DIR` plays no part. All twelve strategies were rewritten for the syntax schema ("ported") the same day by parallel agents. The 2,290 reference circuits rewritten from accepted nlu circuits are kept apart and do not count as accepted (dataset `73dc89e`, `5c45966`). hmm-rules trains on the text column of `semantic/` (`14ef4a6`). |
| Landed | hmm-rules `7795983`; spaCy family `0632942`; Prolog family `b775362`; neural family `662a663`; Z3 family `d12c190`. |

The one exception: the six DistilBERT runs of the batch conversion (calendar files meetings-01.01 to -03, written 14:59–15:00) came before the retraining of D11. They used the port of `662a663`, whose weights had been fitted on the old annotations. The 986 agreement labels of those files that involve DistilBERT rest partly on that model ([Tool choices, T1](tool-decisions.md#t1)).

## D5

**Rules and word lists name only function words and common verbs.**

| Part | Record |
| --- | --- |
| Decision | Rules and word lists may name markers (prepositions, subordinators), coordinating conjunctions, auxiliaries, pronouns, determiners, numerals, and common verbs with their irregular forms; never nouns, adjectives, or anything particular to the dataset. Training on the dataset (its text and its accepted circuits) is allowed; writing its cases into the code is not. The word sets of hmm-rules live in `strategies/hmm-rules/legend.sop`, never in JavaScript. |
| Reason | The reader should hold statements about English that would work on other English text, not a memory of this dataset. |
| Consequence | `cd237e3` removed position adjectives, evaluative adjectives, three fixed phrases, graded adjectives and listed direction adverbs from the lists of hmm-rules; learned word pairs, word endings and general rules took their place. The Prolog grammar's hand lists hold function words and common verbs only (`b775362`). |
| Landed | `cd237e3`; the legend changed after the port in `cd237e3`, `e33cc24`, `71faa24` and `59066d1`. |

## D6

**A random 1% benchmark; every accepted circuit becomes a label.**

| Part | Record |
| --- | --- |
| Decision | The benchmark sample is 1% of the whole dataset, drawn at random (1,831 messages). Every circuit a judge accepts becomes the label of its message, whatever the message had before. |
| Reason | The earlier fixed sample had been used to tune strategies that day. A judge's verdict takes precedence over agreement. |
| Consequence | `sample.mjs` drew the sample with the seed "syntax-2026-11-27" from dataset `5c45966`, sharing no message with the fixed sample. The sample's messages now carry labels and must stay out of every training; a fresh sample will be needed ([Limits](../evaluation/validity.md)). Detail: [The benchmark](../evaluation/benchmark.md). |
| Landed | `24de853` (seeded sample), `9f57aa3` (all 35 packets judged), dataset `6e81e6c` (labels published). |

## D7

**The dataset is split into two mirrored layers, with no file over 1,000 messages.**

| Part | Record |
| --- | --- |
| Decision | `semantic/` holds everything the dataset held before; `syntactic/` holds the same messages with syntax circuits: same paths, same messages, same order. No file holds more than 1,000 messages. |
| Reason | Two layers that can be compared line by line, with a check that needs no language model. No separate reason is recorded for the limit of 1,000. |
| Consequence | `tools/layers.mjs split` divided 49 large semantic files into 187 parts, every row kept byte for byte; `tools/layers.mjs check` verifies the mirror. |
| Landed | Dataset `9d87f2b` (split into layers), `d44ab91` (file limit and script). |

## D8

**Testing and converting go together, in rounds.**

| Part | Record |
| --- | --- |
| Decision | A round takes the next source files that have no syntactic file; a small file (under 500 messages) means taking another one. |
| Reason | Each round tests the strategies on files they have not been tuned on and, at the same time, produces labels. |
| Consequence | `round.mjs start` takes the smallest file first, until the round has at least 500 messages. Because the smallest files come first, the early rounds overstate a reader ([Limits](../evaluation/validity.md)). Detail: [Converting the dataset](../evaluation/conversion.md). |
| Landed | `9a57cfe`; round 1 closed `5db3975` (dataset `0124ab9`), round 2 closed `a58ffb6` (dataset `7be6e99`). |

## D9

**One judge and one fixer per message.**

| Part | Record |
| --- | --- |
| Decision | For each open message a judge reads one circuit (the one most strategies wrote); a fixer writes the circuit when it is rejected. The table of all strategies comes from the random benchmark, not from every round. |
| Reason | Cost. In round 1 every strategy's circuit was judged: 1,798 circuits (1,302 accepted, 496 rejected) for 575 messages. |
| Consequence | `round.mjs settle --judge needed` sends only the circuit most families wrote, and the next only after a rejection; `--judge audit` sends only the audit share; `pool.mjs` pools audit lines of many folders into packets. |
| Landed | `5db3975`, `7127335`, `edb1319`, `925f838`. |

## D10

**At most four strategies, chosen for different sources of analysis.**

| Part | Record |
| --- | --- |
| Decision | Work on vss (now hmm-rules), spacy (one strategy for the dependency parse), distilbert, and one hand-written analysis: the Prolog grammar or the Z3 constraint model. Both were benchmarked and both are parked (experimental since 2026-11-27); which one keeps the fourth place is open. Rules learned on hmm-rules may be carried into Z3 later. |
| Reason | Agreement says something only between different sources. Strategies that share a source repeat each other's faults and add judging cost ([Agreement](../evaluation/agreement.md)). |
| Consequence | `tests/benchmark/syntax/strategies.mjs` lists the five strategies and the eight retired ones, still runnable by name ([Retired formalizers](../formalizers/retired.md)). `strategies/spacy/index.mjs` is spacy-beam under one name. |
| Landed | `40c00a7`. |

## D11

**DistilBERT is retrained on syntax circuits only.**

| Part | Record |
| --- | --- |
| Decision | Retrain from the pretrained base model `distilbert-base-uncased` on syntax labels only; nothing learned from the old annotations remains. |
| Reason | D4. The port of `662a663` had kept the weights and the selector's ranker, both fitted on the old annotations. |
| Consequence | The model predicts the wires, the wire of every word, the references between wires and the atoms (values such as `form=imperative`), all read from the schema; its output stage names no word; a checkpoint of the older model is refused. "Nothing remains" holds for every checkpoint from `9ae0e6f` on, not for the six batch runs before it (D4). First training results: [First results](first-results.md). |
| Landed | `9ae0e6f`. |

## D12

**No duplicated data.**

| Part | Record |
| --- | --- |
| Decision | The syntactic files are the only store of labels; the registry keeps only what a judge read or wrote. |
| Reason | Two stores of the same label can drift apart. |
| Consequence | `annotations/syntax/v1/labels.jsonl` was removed after a check that each line equalled the label in its syntactic cell. The registry lines that only said "accepted by agreement" were removed, since the column `accepted_by` says it. Twenty agreement lines stay, an open point of the journal. The sizes before and after: [First conversion](first-conversion.md). |
| Landed | Dataset `95e7739`; soplang-nlu `e52bfc8`. |

## D13

**The partial semantic work of an earlier session is committed as it stood.**

| Part | Record |
| --- | --- |
| Decision | Commit it, for the history. |
| Reason | Nothing stays only in a working tree. |
| Consequence | Readings packed into columns `sop1`, `sop2` in 25 files, and the README text about them; unfinished and not reviewed. It also added 403 messages (183,094 to 183,497), with none removed. |
| Landed | Dataset `aff01cb`. |

## D14

**Commit each step, keep the plan in the journal, run independent work in parallel.**

| Part | Record |
| --- | --- |
| Decision | As stated. |
| Reason | The history of the plan stays in git; independent work does not wait. |
| Consequence | The ports (D4), the three analyses of hmm-rules faults by area, the DistilBERT retraining and the spaCy repairs ran as parallel agents. See [Goal and plan](goal-and-plan.md). |
| Landed | `8d8fa71` (journal), `66e934b` (how to make hmm-rules reusable). |

---

Next: [Choices recorded in the tools](tool-decisions.md) · Up: [Project](README.md)
