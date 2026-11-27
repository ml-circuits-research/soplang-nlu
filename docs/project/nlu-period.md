[Home](../README.md) › [Project](README.md) › The nlu-schema period

# The nlu-schema period (until 2026-11-26)

This page: how the project worked before the syntax schema, so that leftovers in the code and in old pages can be understood. Kind: Explanation.

> **History only.** Nothing on this page describes the current system. The current formalizers write the syntax schema, use no knowledge world and return one circuit per message ([Formalizers](../formalizers/README.md)).

The sources are the former index of docs/, `docs/history/nlu-schema-period.md`, and the nlu-era parts of the former page of the strategy, then `docs/strategies/vss.md`. Their text as it stood is kept in the git history, for example `git show 97a1b83:docs/history/nlu-schema-period.md`, whatever later becomes of the files. The old notes date the period "until 2026-11-26"; hmm-rules was still worked on in the nlu schema until about noon of 2026-11-27 ([History in brief](history.md#the-day-of-2026-11-27)).

## What the formalizers did then

A formalizer (then called a strategy or a native reader) wrote circuits in the `nlu` schema (`schemas/nlu/schema.sop`), which has more than 50 keys. It separated, among others, direct object, indirect object, predicative entity, topic and participant; adverb, particle, result complement and degree; several kinds of relation. A reader:

- was opened with **knowledge worlds**, which supplied vocabulary, schemas and knowledge ([Worlds](../concepts/worlds.md));
- proposed **up to two independent readings** of one message (`maxReadings: 1` asked for one);
- kept **evidence**: each quoted field held the words that showed a role, and words it could not place stayed as `unresolved`;
- could add an optional semantic value (an "act") to a clause.

An nlu circuit, written by Z3 for "put a beanie on the avatar":

```sop
@e1 nlu.entity determiner="a" head="beanie"
@e2 nlu.entity determiner="the" head="avatar"
@rel1 nlu.relation kind=on from=$c1 to=$e2 cue="on"
@c1 nlu.clause form=imperative predicate="put" act=place polarity=positive direct_object=$e1
```

The same message in the syntax schema has no `act`, no `kind` of relation and no separate direct object: [From the nlu schema](../schema/nlu-mapping.md) maps each nlu key to its syntax key.

A strategy then had to implement a contract with a knowledge installation: `open(configuration)` received the installation and world paths, and returned an engine with `analyse(text)` and `close()`.

## Evaluation then

- **w.request legends.** Older runs compared readings in the semantic schema `w.request` with the WebMeet v1.2 legend: L0 no usable reading, L1 wrong meaning, L2 incomplete meaning, L3 a reasonable exact match, L4 a reasonable alternative. L3 and L4 counted as success.
- **Grading the whole set of readings.** Later runs graded all readings of a message together. L0 to L6 meant no acceptable reading, L7 mixed, L8 every reading acceptable, L9 every reading acceptable and the set equal to the frozen reference set, and L10 acceptable readings plus an independently confirmed defect in the references. The main measure counted L7 to L10.
- **The paired benchmark** `tests/benchmark/port-run.mjs`, run with `SOP_WORKSPACE` pointing at the folder that holds the dataset and knowledge checkouts. On the shared machine each background command ran on two CPUs at low priority (`taskset -c 0,1 nice -n 15 ionice -c 3`).
- **Native reference annotations** in `annotations/nlu/v1/readings.jsonl` of the dataset, frozen with their digest before a run.
- **Detached expressions**: in "Move it, thanks" the thanks could stand in a clause of its own.

The levels of today keep the names L0 to L10 but mean other things ([Levels L0–L10 and GOAL](../evaluation/levels.md)).

## hmm-rules in the nlu period

These figures are kept only here. They were measured in another schema, under other rules, and are not comparable with today's results.

- **Two blind paired reviews** of 240 messages, three reviewers each, with hmm-rules and spaCy direct shown anonymously. Every circuit acceptable: hmm-rules 45.0% (first model) and 50.8% (model at `d98b426`), against 67.5% and 63.8% for spaCy direct.
- **A judged loop** on the fixed 1% sample: 52.9% under the strict standard (model `03f9abe`, six judges) and 60.0% under the plausible standard, which let a faithful partial reading pass when it marked what it left open (model `346876e`).
- **Against the saved circuits** of 11,138 reviewed texts: 64.6% F1 of the links with their role.
- **A design review** estimated ceilings of 60–65% for that design, 70–78% for a design that keeps several candidate stations per word (a lattice) and assembles circuits from constructions declared in the legend, and 83–88% if that design were trained on the drafted circuits (proposals saved in the nlu period, not accepted ones). A station is the kind of position a word stands in ([hmm-rules' own names](../hmm-rules/names.md)). The first result of hmm-rules on the random benchmark in the syntax schema, 65.9%, was already above the first ceiling, but the estimates were made in the nlu schema, so the comparison is loose.
- **Readings identical to an accepted circuit** were themselves accepted by the judges only 93% of the time, which the page read as "no design can measure near 99%".
- **Four experiments measured worse** and are off by default ([Tried and dropped](tried-and-dropped.md)).

## Leftovers still present

| Leftover | Where |
| --- | --- |
| nlu wires | hmm-rules builds its internal structure with the nlu names; `strategies/hmm-rules/src/emit-syntax.mjs` gives every word its syntax place at the end ([hmm-rules in depth](../hmm-rules/README.md)). |
| schema=nlu | The hmm-rules legend declares `schema=nlu` (`strategies/hmm-rules/legend.sop`, line 4), and its stations are nlu slots. |
| nlu tools | `strategies/hmm-rules/evaluate.mjs`, `judged.mjs` and `triage.mjs` need the sop-knowledge-worlds checkout and measure the nlu output; `strategies/hmm-rules/judging-rules.md` holds the judging rules of that period. |
| npm benchmark | `package.json` still runs `node tests/benchmark/port-run.mjs` as its `benchmark` script. |
| Root README | `README.md` of the repository still describes nlu-era readers, worlds and `w.request`, until it is rewritten. |
| nlu schema | `schemas/nlu/schema.sop` stays in the repository. |
| Old pages | Most pages under `docs/strategies/` described the nlu era; the wiki replaces them. |

## Where to go next

- The other strategies of that period: [Strategies of the nlu-schema period](nlu-strategies.md).
- How each nlu key maps to the syntax schema: [From the nlu schema](../schema/nlu-mapping.md).
- Why the project left the nlu schema: [Decisions, D3](decisions.md#d3).
- The day the change happened: [History in brief](history.md).

---

Next: [Strategies of the nlu-schema period](nlu-strategies.md) · Up: [Project](README.md)
