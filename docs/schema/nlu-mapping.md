[Home](../README.md) › [Syntax schema](README.md) › From the nlu schema

# From the nlu schema

This page: the rule-by-rule mapping from the earlier `nlu` schema to the syntax schema, the reference circuits made with it, and what was measured with version 1 of the syntax schema. Kind: Reference.

## Why this page exists

Until the morning of 2026-11-27 the formalizers wrote the `nlu` schema (`schemas/nlu/schema.sop`), which has more than 50 keys ([The nlu-schema period](../project/nlu-period.md)). Its names are still met in two places:

- **Inside hmm-rules.** The linker of hmm-rules still names the keys of its wires with `nlu` names (`predicate`, `direct_object`, `particle`…). `strategies/hmm-rules/src/emit-syntax.mjs` maps them to the syntax keys when it writes the circuit ([Writing the syntax circuit](../hmm-rules/writing.md)).
- **In the reference circuits.** The accepted `nlu` circuits of the dataset were rewritten into this schema by the table below (see "Reference circuits").

## How it relates to the `nlu` schema

Every `nlu` circuit can be rewritten into this schema by rule. The circuits of the dataset that were already accepted therefore stay usable. Formalizers written for this schema do not need `nlu`.

Each line: the `nlu` wire or key → the `syntax` wire or key.

- `nlu.clause` with its `form` → `syntax.clause` with the same `form`
- `predicate` → `verb`
- `auxiliary` → `auxiliary`
- `negation` → `negation`
- `subject` → `subject`
- `direct_object`, `indirect_object`, `predicative_entity`, `topic`, `participant` → `complement`
- `adverb`, `particle`, `result_complement`, `degree` → `modifier`
- `question` → A dependent or the head of a nominal, or a `modifier` of the clause
- `filler`, `expression` → `discourse`
- `separator`, `terminator` → Not covered
- `connective`; the `cue` of a coordination that is a word → `conjunction` of a coordination
- `marker` → `marker` of a relation between the two clauses
- `nlu.entity`: `head`, `name`, `pronoun`, `literal` → `syntax.nominal`: `head`
- `nlu.entity`: every other quoted key → `syntax.nominal`: `dependent`
- `nlu.relation` with a `cue`; `attachment=open` → `syntax.relation` with `marker`; `attachment=ambiguous`
- `clausal_complement`; a relation without a `cue` → `syntax.relation` without `marker`, or with the marker "to"
- `nlu.relation` with a `measure` → The measure is a nominal and the relation starts at it
- `nlu.coordination` → `syntax.coordination`; a comma among its cues is not covered
- A fragment that shares the verb of another clause → The fragment with `ellipsis`

## Reference circuits

`tests/benchmark/syntax/convert-nlu.mjs` rewrites the `nlu` circuits that judges had accepted into `syntax` circuits, by the table above, into `webmeet-dataset/annotations/syntax/v1/reference/reference-nlu-v1.jsonl`. It rewrites a circuit only when the rules settle every word, and reports the others with the reason. It is the one tool that uses the old checker and the knowledge repository, to find the position of each quoted value. No strategy may depend on it.

No judge has read these circuits in the `syntax` schema. They are not in the registry, they are no labels, and no level counts them. The file is kept for comparison. (Source: `tests/benchmark/syntax/README.md`; commands in [Benchmark tools: agreement, conversion of old circuits](../reference/analysis-tools.md).)

## What was measured (history)

> **History.** This part is kept as the specification stated it, with version 1 of the schema. Three statements in it are now out of date: L7 is unused (a strategy now returns one circuit), version 3 has since been measured, and circuits written in this schema have since been judged. The current levels are on [Levels L0–L10 and GOAL](../evaluation/levels.md); the current numbers are only in [STATUS.md](../STATUS.md).

The figures come from one fixed sample: 1,831 messages, 1% of the messages of `webmeet-dataset`. They were taken with version 1 of the schema. Versions 2 and 3 have not been measured.

**How readings are graded.** A judge, a language model, reads the message and the circuits a formalizer returned for it and gives one level from L0 to L10. L0 to L7 mean that at least one returned circuit is wrong. For example, L1 is a wrong clause or verb, L3 a wrong relation or grouping, L6 lost information, and L7 one good circuit beside a wrong one. L8, L9 and L10 mean that every returned circuit is acceptable. The figure that matters is the share of messages at L8, L9 or L10.

**The formalizer measured.** hmm-rules is the reader in `soplang-nlu/strategies/hmm-rules`. It learns from the text of the dataset without annotations.

| Result | Measurement |
| --- | --- |
| 63.2% | hmm-rules, judged in the `nlu` schema: share of messages at L8, L9 or L10 |

The next table shows how much the smaller schema changes by itself. It counts the hmm-rules readings that are identical to a circuit already accepted in the dataset, at each level of detail.

| Identical | Compared |
| --- | --- |
| 61.8% | Full `nlu` circuit |
| 62.2% | Version 1 of this schema |
| 62.4% | The same, head of a nominal not compared |
| 64.8% | The same, and a relation may start at the clause |

The first column is the share identical to an accepted circuit.

The smaller schema alone explains between 0.4 and 3 points. Most rejected readings fail on what this schema still asks for: which word is the verb, which words form one nominal, and which wire a phrase is related to.

Readings written in this schema have not been judged yet.

## Standard, new here, particular

**New here:** the mapping and the reference file are tools of this project. **Particular:** the figures hold for this project's fixed sample of 1,831 WebMeet messages.

---

Next: [Formalizers](../formalizers/README.md) · Up: [The syntax schema](README.md)
