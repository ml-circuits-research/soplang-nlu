# soplang-nlu: documentation

## What this project does

People write short messages to an application: "move the blue box next to the red circle", "put a meeting with
Ana on Friday at 10", "make the bars of the chart thinner". Before a program can act on such a message, it has
to know how the sentence is built: which word is the verb, which words describe one thing, what is tied to
what.

This repository holds **formalizers**: programs that read one English message and write down its grammatical
structure. The result is called a **circuit**, written in SOP Lang, a small declarative language where each
line (a **wire**) states one fact. For the message above:

```sop
@c1 syntax.clause form=imperative verb="move" complement=$n1
@n1 syntax.nominal dependent="the" dependent="blue" head="box"
@n2 syntax.nominal dependent="the" dependent="red" head="circle"
@r1 syntax.relation from=$c1 to=$n2 marker="next to"
```

Read it as: there is one clause, a command (imperative) whose verb is "move" and whose object is the thing
`n1`, "the blue box"; a second thing `n2` is "the red circle"; the clause is tied to `n2` by "next to". The
circuit records only the structure that the words show. What the message *means* (which box, where exactly) is
decided later, by another layer that knows the context.

The set of wire types and keys is the **`syntax` schema** (four wire types: clause, nominal, relation,
coordination). A formalizer may use only the message's own words: no dictionary of the application's objects,
no external knowledge.

**The goal** is that a judge accepts the circuit of as many messages as possible, ideally over 99%. The messages
come from the WebMeet dataset (about 183,000 messages to a calendar, a drawing, a diagram and a document
application), kept in the sibling repository `webmeet-dataset`.

## Where to start

| If you want to… | Read |
| --- | --- |
| see where the work stands today: scores, speed, what runs now | [STATUS.md](STATUS.md) (also [status.html](status.html)) |
| understand what a circuit may contain | [syntax-schema.md](syntax-schema.md) |
| understand how circuits are judged and how scores are computed | [syntax-evaluation-and-conversion.html](syntax-evaluation-and-conversion.html) |
| understand the VSS formalizer, the one built in this project | [vss-architecture.html](vss-architecture.html) |
| know why things were decided the way they are | [syntax-work-2026-11-27.html](syntax-work-2026-11-27.html) |
| follow the plan and the ideas not yet tried | [../improvements-ideas.md](../improvements-ideas.md) |
| use the library in code | [Using the library](#using-the-library) below |

A suggested reading order for a reviewer: STATUS.md (10 minutes), the schema's "Terms" and "Rules" sections,
the evaluation page, then the VSS architecture.

The HTML pages are self-contained files. GitHub shows HTML from a private repository only as source code: open
them from a local checkout in a browser. STATUS.md holds the same content as status.html and reads well in the
GitHub app on a phone.

## The formalizers (strategies)

Each formalizer reads the message from a different source of knowledge about English, so that when two of
them write the same circuit, that agreement means something. Scores are on a random sample of 1% of the
dataset (1,831 messages), every circuit read by a judge; the current numbers are in [STATUS.md](STATUS.md).

| Strategy | How it reads a message | State | Page |
| --- | --- | --- | --- |
| `vss` | Our own reader. Word classes (called stations) are learned from raw, unannotated text; general rules of English build the circuit. Plain JavaScript, no dependencies, under 1 ms per message. | main focus | [vss.md](strategies/vss.md), [vss-architecture.html](vss-architecture.html) |
| `spacy` | The spaCy English dependency parser (a transformer trained on large treebanks), plus our rules that turn its parse into a circuit. The most accurate today, about 50 ms per message on a CPU. | being improved | [spacy.md](strategies/spacy.md) |
| `distilbert` | A small transformer (DistilBERT) trained only on accepted circuits of this project. | retrained as labels grow | [distilbert.md](strategies/distilbert.md) |
| `prolog` | A hand-written grammar in SWI-Prolog. | parked | [prolog.md](strategies/prolog.md) (describes the earlier `nlu` version) |
| `z3` | A constraint model solved with the Z3 solver. | parked | [z3.md](strategies/z3.md) (describes the earlier `nlu` version) |

Kept in the code but left out of measurements, because they read the same parse as `spacy` or combine the
others and so would not be independent voices: `spacy-direct`, `spacy-beam`, `neural-dependencies`,
`neuro-selector`, `selector-distilbert`, `neuro-prolog`, `neuro-z3`, `prolog-example-transfer`. Their pages in
[strategies/](strategies/) mostly describe the earlier `nlu` schema.

## How circuits are judged and labelled, in short

- A **judge** (a language model instructed with written rules, [../tests/benchmark/syntax/rules.md](../tests/benchmark/syntax/rules.md))
  reads a message and one circuit and accepts it, or rejects it with a grade (L1 to L6) and a quoted reason. A
  circuit is accepted when it states nothing wrong and loses no information the words give; several readings
  can be acceptable.
- A **label** is the accepted circuit stored for a message in `webmeet-dataset/syntactic/` (one CSV file per
  source file, at most 1,000 messages each). A label comes from a judge, or from **agreement**: two
  formalizers with different sources wrote the same circuit; a judge reads a random 2% of those as a check.
- **Score (GOAL)**: the share of benchmark messages whose circuit is accepted: L8 (accepted), L9 (equal to the
  existing label) or L10 (accepted, and it replaces the label).

Details, commands and pitfalls: [syntax-evaluation-and-conversion.html](syntax-evaluation-and-conversion.html)
and [../tests/benchmark/syntax/README.md](../tests/benchmark/syntax/README.md).

## Using the library

```js
import {createReader} from 'soplang-nlu'
import {vss} from 'soplang-nlu/strategies/vss'

const reader = await createReader({strategy: vss})
try {
  const {candidates, error} = await reader.propose('move the blue box next to the red circle')
  for (const {sop, check} of candidates) console.log(sop, check.valid)
} finally {
  await reader.close()
}
```

A strategy that writes the `syntax` schema needs nothing outside this package. `lib/syntax.mjs` holds the
schema's checker (`validateSyntax(text, sop)`) and writer; every circuit a strategy returns is checked, and one
that fails the check is not returned as a candidate.

**Writing another strategy.** Export an object `{name, schema: 'syntax', open(configuration)}`. `open` returns
an engine with `analyse(text)` and `close()`. `analyse` returns `{analyses: [{sop}]}` with one circuit, or an
empty array and `error` when it cannot read the message. Then add it to
`tests/benchmark/syntax/strategies.mjs` to measure it.

**Measuring speed.** `lib/measure-strategy.mjs` opens one reader, reads the messages one after another and
records start-up time, time per message (median and 95th percentile) and total time. The benchmark run
(`tests/benchmark/syntax/run.mjs`) records the same per strategy in its `summary.json`.

## Folders

| Folder | Holds |
| --- | --- |
| `lib/` | the reader entry point and the `syntax` schema checker and writer |
| `schemas/` | `syntax/schema.sop` (current) and `nlu/schema.sop` (earlier schema) |
| `strategies/` | one folder per formalizer |
| `tests/benchmark/syntax/` | the tools of evaluation and labelling: runs, judging packets, agreement, rounds |
| `eval-results/` | every run, with its sample, outputs and verdicts, so each number can be checked again |
| `experiments/` | prototypes that were measured; `syntax-learned/` holds two learned methods not adopted |
| `docs/status/` | the generator of the status page (`node docs/status/build.mjs`) and its hand-kept inputs |
| `docs/history/` | earlier documentation, kept for the record |

## Earlier work

Until 2026-11-26 the formalizers wrote the `nlu` schema, a detailed schema with more than 50 keys that also
recorded some meaning (kinds of acts, relation kinds). The notes of that period (evaluation legends, paired
benchmarks, design rules) are in [history/nlu-schema-period.md](history/nlu-schema-period.md). Why the project
moved to the smaller `syntax` schema is explained in [syntax-schema.md](syntax-schema.md), section "Decisions
and their reasons".
