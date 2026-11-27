# soplang-nlu documentation

This page: the start of the documentation: what the project is, reading paths and sections. Kind: Explanation.

## What this is

soplang-nlu reads one English message typed to an application and writes how the sentence is built (its
[syntax](concepts/syntax-and-semantics.md)) as a small graph of facts in the [SOP Lang](concepts/sop-lang.md) notation,
called a **circuit**. It uses only the words of the message: no knowledge of the application, no earlier messages.
Several programs, called [formalizers](formalizers/README.md), do this from different sources of knowledge. A circuit
is accepted when a language-model **judge** accepts it by written rules, or when formalizers built from different
sources write the same circuit; a judge still checks a random share of these (the [audit](evaluation/audit.md)).
Accepted circuits become the **labels** of the [WebMeet dataset](evaluation/dataset.md). The aim: [GOAL](evaluation/levels.md),
the share of messages whose circuit is accepted, ideally over 99%.

**Why it stops at syntax.** Turning a message into an action takes two steps: how the sentence is built
(syntax), then what it asks of the application (meaning). The first step can be done from the words
alone, for any application, and a program can check it. The second needs knowledge of the application,
so a later reader, outside this repository, does it, starting from a checked structure
([Syntax and semantics](concepts/syntax-and-semantics.md#why-syntax-first)).

## An example

The message "Move the blue box towards the yellow circle." as hmm-rules, the project's own formalizer, writes it
with the code of commit `c080ce8`; three of its four lines are asserted by the test `tests/hmm-rules-syntax.test.mjs`:

```sop
@c1 syntax.clause form=imperative verb="Move" complement=$n1
@n1 syntax.nominal dependent="the" dependent="blue" head="box"
@r1 syntax.relation marker="towards" from=$c1 to=$n2
@n2 syntax.nominal dependent="the" dependent="yellow" head="circle"
```

Each line is one wire: a clause (the command "Move"), two nominals (the box, the circle) and a relation
("towards") from the clause to the circle. [Read your first circuit](concepts/first-circuit.md) explains every part.

## I want to…

- **Understand the project from zero**: [Concepts](concepts/README.md), then follow *Next* at the bottom of
  each page.
- **Read a circuit**: [Read your first circuit](concepts/first-circuit.md) ›
  [The schema in brief](schema/overview.md) › [The five rules](schema/rules.md) ›
  [Read judged circuits](evaluation/judged-examples.md).
- **See the current results and how far to trust them**: [Status](STATUS.md) ›
  [The benchmark](evaluation/benchmark.md) › [Limits of the measurements](evaluation/validity.md).
- **Compare the formalizers (most accurate, fastest)**: [Status: at a glance](STATUS.md#at-a-glance) ›
  [Formalizers](formalizers/README.md) › [Speed and cost](formalizers/speed.md).
- **See what is being worked on now**: [Working on now](STATUS.md#working-on-now) ›
  [the journal, as lists for a phone](status/journal.md) (the file itself: [improvements-ideas.md](../improvements-ideas.md)).
- **Run or write a formalizer**: [Run a formalizer](guides/run-a-formalizer.md) ›
  [Library API](reference/library.md) › [Write a new formalizer](guides/write-a-formalizer.md).
- **Run the benchmark and judge it**: [Run the benchmark](guides/run-benchmark.md) ›
  [Judge a packet](guides/judge-a-packet.md) › [Levels and GOAL](evaluation/levels.md).
- **Change hmm-rules**: [hmm-rules in depth](hmm-rules/README.md) › [Known limits of hmm-rules](hmm-rules/limits.md) ›
  [Find faults](guides/find-faults.md) › [Add a rule to hmm-rules](guides/add-hmm-rules-rule.md).
- **Understand rvss, the reader being built**: [rVSS](rvss/README.md) › [The story](rvss/story.md) ›
  [rvss as an HMM plus a VSA memory](rvss/hmm-plus-vsa.md) › [What research says](rvss/what-research-says.md).
- **Review the method**: [What is new here](project/what-is-new.md) ›
  [Related work](schema/related-work.md) › [Judges](evaluation/judging.md) ›
  [Limits of the measurements](evaluation/validity.md).
- **Add labels to the dataset**: [The dataset](evaluation/dataset.md) ›
  [Converting the dataset](evaluation/conversion.md) › [Convert in batch](guides/batch-conversion.md) ›
  [Run a conversion round](guides/conversion-round.md).

## Sections

- [Concepts](concepts/README.md): the ideas from zero (message to action, SOP Lang, schemas, syntax and
  semantics, worlds, grammar, how circuits are judged), ending in a tutorial on reading a circuit.
- [The syntax schema](schema/README.md): the four wire types, the five rules and the design decisions, in full.
- [Formalizers](formalizers/README.md): the programs that write circuits, one page each, and what to consider
  about speed and cost.
- [Evaluation and labels](evaluation/README.md): the dataset, judging, levels and GOAL, the benchmark,
  agreement, the audit, conversion, limits.
- [hmm-rules in depth](hmm-rules/README.md): the project's own reader, from training to the written circuit. It sits
  under Formalizers › hmm-rules and is listed here as a section of its own; hmm-rules, called vss until
  2026-11-27, is experimental now.
- [rVSS](rvss/README.md): the vector-symbolic reader being built: the story in the words of the original
  reader, the formulas, rvss as an HMM plus a VSA memory, what research says for it, and its milestones.
- [How-to guides](guides/README.md): run, test, benchmark, judge, convert, find faults, add rules, retrain,
  write a formalizer.
- [Reference](reference/README.md): glossary, SOP Lang rules, library API, tools and options, storage, folders.
- [Project](project/README.md): goal and plan, decisions, what was tried and dropped, history, the full reports.

## How the pages are labelled

Where a page describes a piece of the project, it says what is **Standard** (an established idea or tool, used
as the field knows it), what is **New here** (designed in this project) and what is **Particular** (holds only
for this project's language, data or setting). Every page also names its kind, after
[Diátaxis](https://diataxis.fr): **Tutorial** (learn by doing), **How-to guide** (one task, step by step),
**Reference** (exact facts) or **Explanation** (why, and the concepts).

## Status now

The current numbers (scores, speed, how much of the dataset is labelled, what runs now) are only on the
[status page](STATUS.md). It is generated by `docs/status/build.mjs`; the other pages link to it instead of
repeating its numbers.

## Also

- The plan and journal: [improvements-ideas.md](../improvements-ideas.md) (wide tables), or its copy with
  the tables as lists, [The journal, as lists](status/journal.md).
- The three full reports in HTML, and how to open them: [The full reports](project/reports.md).
- Outside this repository, in the sibling repositories: `soplang-words-lib/docs/language.md` (the definition
  of SOP Lang), `sop-knowledge-worlds/README.md` (the worlds), `webmeet-dataset/README.md` (the data).
- The check of these pages (links, tables, the page template): `node docs/tools/check-docs.mjs`
  ([how](guides/refresh-status.md#step-3-check-the-documentation)).

---

Next: [Concepts](concepts/README.md)
