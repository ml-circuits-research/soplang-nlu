[Home](../README.md) › [Project](README.md) › History in brief

# History in brief

This page: the project's history in short: the nlu period, the origin of VSS (now hmm-rules) and of rvss, the schema versions, and the day of 2026-11-27. Kind: Explanation.

## Before 2026-11-27: the nlu-schema period

Until the morning of 2026-11-27 the formalizers wrote a detailed schema, `nlu`, with more than 50 keys, and used the knowledge worlds to check their circuits. They could return up to two readings per message, and were measured against reference annotations and by reviewers grading whole sets of readings. That period is summarised in [The nlu-schema period](nlu-period.md); its strategy pages in [Strategies of the nlu-schema period](nlu-strategies.md). Why the project left it is in [Decisions, D3](decisions.md#d3).

## The origin of VSS

The strategy called VSS until 2026-11-27, `hmm-rules` since, is a [hidden Markov model](https://en.wikipedia.org/wiki/Hidden_Markov_model) tagger with hand-written general rules ([How hmm-rules works](../hmm-rules/how-it-works.md)). It is a new reader. It kept the name, and a small vector helper, of an earlier vector-symbolic reader: the sibling repository `vsa-semantic-space`, described in the book *Meaning as a Path* (`strategies/strict-vss/DESIGN.md` as first committed in `f5be34c`, "Why a second strategy"). The repository never expanded the name VSS. Because the name suggested a vector-symbolic reader, which it is not, the owner renamed it `hmm-rules` on 2026-11-27 ([hmm-rules: Name](../formalizers/hmm-rules.md#name)).

What survives from the earlier reader:

- the vector toolkit of [vector symbolic architectures](https://en.wikipedia.org/wiki/Hyperdimensional_computing): an identity vector made from each name, binding (multiplying two vectors element by element), bundling (adding them) and the [cosine similarity](https://en.wikipedia.org/wiki/Cosine_similarity); now a minor helper;
- determinism;
- output in SOP Lang;
- the words "legend", "route book" and "world", with new meanings ([hmm-rules' own names](../hmm-rules/names.md)).

What was dropped (in the earlier reader's own terms, which its repository's `STATUS.md` uses):

- the sentence state built by binding;
- reading roles back by unbinding;
- learned displacements and gates;
- one reader per world, and abstaining when unsure;
- supervision by frames.

**Standard**: the hidden Markov model and the vector operations. **New here**: the reader built from them, with its rules. **Particular**: what it learns comes from the WebMeet messages. Detail: [Learned and declared](../hmm-rules/learned-and-declared.md).

Source: the owner's account, recorded in the journal ([improvements-ideas.md](../../improvements-ideas.md), "Done since…", the entry on the origin of VSS, commit `9b4fc26`) and in `strategies/rvss/DESIGN.md` (then `strategies/strict-vss/DESIGN.md`). The journal entry lists the dropped parts more briefly; the longer list above (with learned displacements and supervision by frames) is the owner's account, given for this documentation. The README of `vsa-semantic-space` says only that it is an experiment.

## rvss

The owner asked for a separate formalizer that reads a message the way the original reader did, first called `strict-vss`, now `rvss` (its folder is `strategies/rvss/`, first `strategies/strict-vss/`): the message is composed into one vector state by vector-symbolic operations, and the circuit is read out of that state by unbinding and cleanup (taking the nearest item in a codebook). `vss` was to stay as it was; on 2026-11-27 it was renamed `hmm-rules`, so that the name VSS would no longer suggest a vector-symbolic reader. The design and its first measurements were committed in `f5be34c` ([DESIGN.md](../../strategies/rvss/DESIGN.md), then in `strategies/strict-vss/`). Those measurements check capacity with the right answers given (can every word be read back from the state?), as the commit message says; nothing is trained ([Formalizers](../formalizers/README.md)). DESIGN.md was later revised after a critic's review, as its status line says.

## The schema versions

| Version | What it was |
| --- | --- |
| 1 | `7a90ade` (12:05). Facts, things, links and lists, with 16 keys such as doer, action and how. Reviewed once. |
| 2 | Answered the first review. It has no commit of its own: the schema files changed only in `7a90ade`, `8536c9c` and `f9f0a97`. |
| Draft | Between versions 2 and 3, everyday words: main for the head, via for the marker, other for the remaining words, start=open for the ambiguity. Refused by the owner. |
| 3 | Established terms of grammar and dependency syntax; answered a second review. Checker and writer in `8536c9c`, specification in `f9f0a97` (both 12:54). |

The names and their sources: [Decisions 6–8](../schema/decisions-names.md). Why the schema changed at all: [D3](decisions.md#d3).

## The day of 2026-11-27

Times are commit times (CET), or file times where marked. "dataset" before a commit means a commit in webmeet-dataset; the others are in soplang-nlu. Converted from the chronology of [syntax-work-2026-11-27.html](../syntax-work-2026-11-27.html).

| Time | Commit, event |
| --- | --- |
| 10:03 | `d1c6196`. The hmm-rules strategy is added, with a frozen 1% run and a blind paired review. |
| 10:12–11:59 | Many commits. hmm-rules work in the nlu schema: the judged loop under a strict standard (`03f9abe`), marks for what the words leave open, then a plausible standard (`e4a72b6`); the judging rules of the nlu schema (`8fb0205`, `615e232`, `9196fe7`). Results: [nlu period](nlu-period.md). |
| 12:05 | `7a90ade`. Syntax schema version 1. |
| 12:54 | `8536c9c`, `f9f0a97`. Version 3 with checker and writer; the specification. |
| 12:59 | `7795983`. hmm-rules writes the syntax schema directly. |
| 13:26–13:45 | `e166870`, `24de853`; dataset `e0a20ad`. Benchmark tools and the judges' rules (rules.md); first judged hmm-rules run in the syntax schema, 63.4%; its 1,160 accepted circuits become labels. |
| 13:40 | File time. The random benchmark sample is drawn. |
| 13:47 | dataset `9d87f2b`. The dataset is split into `semantic/` and `syntactic/`. |
| 13:50–14:44 | `0632942`, `b775362`, `662a663`, `d12c190`. The spaCy, Prolog, neural and Z3 families write the syntax schema. |
| 14:05 | `cd237e3`. No adjectives or particular phrases in the hmm-rules word lists. |
| 14:07 | `9a57cfe`. Conversion rounds (`round.mjs`). |
| 14:27–14:40 | `e33cc24`, `01695d3`, `5db3975`; dataset `0124ab9`, `d44ab91`. Round 1 closed (575 messages); hmm-rules rules from it; six settled cases; files split to at most 1,000 messages. |
| 14:57–15:03 | `71faa24`, `7db7628`, `a58ffb6`; dataset `7be6e99`. hmm-rules rules from round 2; the batch scripts; round 2 closed (598 messages). |
| 14:59–15:00 | File times. The older DistilBERT runs on six calendar files of the batch. |
| 15:13 | `40c00a7`. Four strategies at most; relaxed agreement. |
| 15:31 | `9ae0e6f`. DistilBERT retrained on syntax circuits only. |
| 15:51–16:14 | `925f838`, `a09047d`; dataset `0b58c84`. Pooled audit; the batch conversion written. |
| 16:29–16:30 | `59066d1`, `1c0b4f6`. hmm-rules rules from the calendar and the diagram and document analyses. |
| 16:39 | `9f57aa3`. The random benchmark fully judged for the first time. |
| 16:51 | dataset `95e7739`; `e52bfc8`. Duplicated data removed; labels only in the syntactic files. |
| 16:56–16:57 | `dd562c3`; dataset `6e81e6c`. hmm-rules rules from the drawing analysis; the benchmark labels published. |
| 17:03–17:10 | `8d8fa71`, `66e934b`. The working journal, and how to make hmm-rules reusable. |

The numbers of that day are on [First results](first-results.md) and [First conversion](first-conversion.md).

## Later the same day

A few milestones from the git log, after 17:10:

- 17:45 `45677bc`: the lever study for hmm-rules, which measured where its faults lie and which learned aids could help; 17:49 `fa46cb7`: the last hmm-rules rule batch described by the architecture report.
- 18:30 `51606f5`: the three HTML reports ([The full reports](reports.md)); 18:46 `82cbdb0`: the generated status page.
- 18:51 `c8d0a09`: the wider agreement key; 19:04 `6f11cb6`: two learned methods measured and not adopted.
- 19:26 `9b2831e` and dataset `596ff1d`: the refilled conversion written cell by cell.
- 20:51 `f5be34c`: the design of strict-vss (now rvss).

Every later commit is listed in [STATUS.md, Recent work](../STATUS.md#recent-work), and every judged measurement in [STATUS.md, Progress over time](../STATUS.md#progress-over-time).

---

Next: [Results as first measured](first-results.md) · Up: [Project](README.md)
