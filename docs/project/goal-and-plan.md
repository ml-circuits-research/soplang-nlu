[Home](../README.md) › [Project](README.md) › Goal and plan

# Goal and plan

This page: the project's goal, how the work is organised, and where the plan, the current work and the open points live. Kind: Explanation.

## The goal

Every [formalizer](../formalizers/README.md) of this repository writes the [syntax schema](../schema/overview.md) from syntactic analysis only, with no dependence on [knowledge worlds](../concepts/worlds.md). A formalizer reads one message alone and writes its [circuit](../concepts/sop-lang.md): the clauses, the nominals, the relations and the coordinations, with every word in exactly one place.

The measure is **GOAL**: the share of messages whose circuit is accepted. A *judge* is a language-model agent that reads a message and one circuit and accepts or rejects it by written rules; a *label* is the accepted circuit a message already has in the dataset ([Glossary](../reference/glossary.md#project-terms)). A message counts as accepted at one of three levels ([Levels L0–L10 and GOAL](../evaluation/levels.md)):

- **L9**: the circuit equals the label the message had before the run, so no judge is needed;
- **L10**: the circuit is accepted in this run, and the message had another label before the run;
- **L8**: accepted, but neither L9 nor L10 (for example accepted earlier, or accepted for a message
  that had no label).

The aim is as high as possible, ideally over 99% (the journal, section "Goal").

The dataset itself is corrected through a judged loop until the comparison with it is exact. Every circuit a judge accepts becomes the label of its message, so a later run that writes the same circuit reaches L9 without a judge. Why this measure was chosen, and the alternative the owner refused, are in [Decisions, D1](decisions.md#d1). How far a measured GOAL can be trusted is in [Limits of the measurements](../evaluation/validity.md).

- **Standard**: measuring a reader on a [random sample](https://en.wikipedia.org/wiki/Simple_random_sample) of the data, and keeping that sample out of every training on labels; a [large language model](https://en.wikipedia.org/wiki/Large_language_model) as the evaluator.
- **New here**: GOAL and its levels. Whole circuits are judged by written rules, instead of being compared word by word with one annotated tree, because several circuits can be right for one message; and every accepted circuit becomes a label, so that equality with a label (L9) also counts.
- **Particular**: the messages are those of the WebMeet dataset ([The WebMeet dataset and its labels](../evaluation/dataset.md)).

## How the work is done

Three working rules of the owner ([D14](decisions.md#d14)):

1. **Commit each step.** Each piece that lands is committed, so nothing stays only in a working tree.
2. **Keep the plan in the journal.** [improvements-ideas.md](../../improvements-ideas.md) is updated and committed with every stage, so the history of the plan stays in git.
3. **Run independent work in parallel.** On 2026-11-27 the rewriting of each strategy (the code calls a formalizer a strategy) for the syntax schema, the three analyses of the faults of [VSS](../vss/README.md) (the reader built in this project) by area, the [DistilBERT](../formalizers/distilbert.md) retraining and the [spaCy](../formalizers/spacy.md) repairs ran as parallel agents.

Other decisions shape the daily work: at most four strategies, chosen for different sources of analysis ([D10](decisions.md#d10)); testing the strategies and converting the dataset in the same rounds ([D8](decisions.md#d8)); one judge, and one fixer who writes the circuit when the judge rejects it, per open message ([D9](decisions.md#d9)).

## Where the plan lives

The plan lives in one file, the journal [improvements-ideas.md](../../improvements-ideas.md). Its tables are wide, so it is best read on a computer. This page copies nothing from it; it only says where to look. A copy made for a phone, with the wide tables written as lists, is generated at every build: [The journal, as lists](../status/journal.md).

| Section | What it holds |
| --- | --- |
| Goal | The aim, in one paragraph. |
| Where things stand | The strategies, the dataset, the rules added and what was measured and dropped, with a date. |
| Done since | Steps finished after the first version of the journal, each with its measurement. |
| In progress | What is being done now. |
| Next steps | The next work, in order. |
| Ideas not yet tried | Each idea with the reason to expect a gain. |
| Making VSS reusable | The owner's question (general rules or particular ones?) and four proposed steps. |
| Open points | Questions that wait for the owner. |

## What is running now

[Status, Working on now](../STATUS.md#working-on-now) says what was done last, what comes next and what is not measured yet. That text is written by hand, with every step, in the file `docs/status/now.md`, and holds no scores; `docs/status/build.mjs` copies it into the status page. The numbers of the project live only on the [status page](../STATUS.md) and the pages it links.

## Open points for the owner

Questions that only the owner can settle, such as whether conversion rounds should replace labels as a benchmark publication does, are listed in the journal's last section, [Open points for the owner](../../improvements-ideas.md#open-points-for-the-owner).

## The decisions behind this

- [What is new here](what-is-new.md): what this project designed, piece by piece.
- [Decisions D1–D14](decisions.md): the owner's decisions, with their reasons.
- [Tool choices T1–T4](tool-decisions.md): what the code decides, and what has no recorded reason.

---

Next: [What is new here](what-is-new.md) · Up: [Project](README.md)
