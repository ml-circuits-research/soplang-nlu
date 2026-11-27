[Home](../README.md) › Project

# Project

This page: the index of the Project section (the goal and the decisions, the history, the full reports). Kind: Explanation.

The other sections explain how the system works now. This section explains why it is the way it is: what the project aims at, who decided what and for which reason, what was tried and dropped, and how the work went on the day the current design was made (2026-11-27). On that day the project moved from a detailed schema, `nlu`, to a small syntactic one, the [syntax schema](../schema/overview.md).

## Who decides, and where it is written down

The owner of the project takes the decisions of direction: the goal, the schema, which [formalizers](../formalizers/README.md) are worked on, how labels are made. Each decision is recorded with its reason, its consequence and the commits where it landed, in the manner of an [architectural decision record](https://en.wikipedia.org/wiki/Architectural_decision). Choices that are written only in the code are recorded apart, with a note where no reason is known.

The living plan is the journal, [improvements-ideas.md](../../improvements-ideas.md) at the root of the repository. It is updated and committed with every step, so the history of the plan stays in git. It has wide tables; a copy with the tables written as lists, for a phone, is [The journal, as lists](../status/journal.md). The current numbers are only on the status page, [STATUS.md](../STATUS.md).

## Goal and decisions

| Page | What it holds |
| --- | --- |
| [Goal and plan](goal-and-plan.md) | The goal, the measure GOAL, how the work is organised, and where the plan, the current work and the open points live. |
| [What is new](what-is-new.md) | For each piece of the project, one line on what was designed here, with a link to its full Standard / New here / Particular block. |
| [Decisions D1–D14](decisions.md) | The owner's decisions of 2026-11-27, each with its reason, consequence and commits. The only page that gives their reasons. |
| [Tool choices T1–T4](tool-decisions.md) | Choices written in the code rather than made by the owner, and the choices whose reason is not recorded. |
| [Tried and dropped](tried-and-dropped.md) | What was tried and set aside, each with its evidence, so that nobody repeats it unknowingly. |

## History

| Page | What it holds |
| --- | --- |
| [History in brief](history.md) | The nlu period, the origin of VSS (now hmm-rules) and of rvss, the schema versions, and the day of 2026-11-27 hour by hour. |
| [First results](first-results.md) | The first measurements of 2026-11-27, each attributed to its commit. |
| [First conversion](first-conversion.md) | Conversion rounds 1 and 2, the first batch conversion, the data cleanup, and how the label counts fitted together. |
| [nlu period](nlu-period.md) | How the project worked before the syntax schema, so that leftovers in the code can be understood. |
| [nlu strategies](nlu-strategies.md) | One short section for each strategy page of the nlu period. |

The history pages hold dated numbers. They do not describe the current state; for that, read [STATUS.md](../STATUS.md).

## Reports

| Page | What it holds |
| --- | --- |
| [Full reports](reports.md) | The three long HTML reports of 2026-11-27: what each covers, what in it is superseded, and how to open it. |

## Words used in this section

| Word | Meaning here |
| --- | --- |
| Owner | The person who leads the project and takes the decisions of direction. |
| Journal | [improvements-ideas.md](../../improvements-ideas.md): the plan, updated with every step. |
| syntax schema | The current target of every formalizer: four wire types and 18 keys that state only grammar ([Overview](../schema/overview.md)). |
| nlu schema | The detailed schema used until the morning of 2026-11-27, with more than 50 keys and knowledge worlds ([The nlu-schema period](nlu-period.md)). |
| hmm-rules | The reader built in this project: a formalizer that learns from raw text and adds hand-written general rules ([hmm-rules in depth](../hmm-rules/README.md)). |
| Commit | A short hash such as `9f57aa3`, a commit in soplang-nlu unless "dataset" is written before it (then webmeet-dataset). |
| Run folder | A folder under `eval-results/` that holds one benchmark run or one conversion round. |
| Session notes | Notes of the working session of 2026-11-27. They are not in the repository, so claims taken only from them are marked. |

Other terms are in the [Glossary](../reference/glossary.md).

## Reading order

For a reviewer who wants to judge the method: [Goal and plan](goal-and-plan.md), then [What is new](what-is-new.md), then [Decisions](decisions.md), then [Limits of the measurements](../evaluation/validity.md).

For a developer who continues the work: [Goal and plan](goal-and-plan.md), the journal, [Tried and dropped](tried-and-dropped.md), then [Tool choices](tool-decisions.md).

---

Next: [Goal and plan](goal-and-plan.md) · Up: [Home](../README.md)
