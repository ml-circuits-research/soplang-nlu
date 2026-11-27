[Home](../README.md) › [Evaluation and labels](README.md) › Agreement

# Agreement between formalizers

This page: when the agreement of formalizers settles a label without a judge, why they must read
from different sources, and the keys and caveats of agreement. Kind: Explanation.

## The idea

A circuit that formalizers of different *families* wrote alike is accepted without a judge. Its row
in the syntactic file says `accepted_by=agreement`. A random share of such circuits still goes to a
judge as a control: [the audit](audit.md). Most labels of the dataset were made this way (current
counts: [STATUS.md](../STATUS.md#the-dataset)).

## Families

A family is the source of a formalizer's analysis, declared in
`tests/benchmark/syntax/strategies.mjs`. A name the list does not know is a family of its own. The
formalizers themselves: [Formalizers](../formalizers/README.md).

| Family | Formalizers, and what they read the message from |
| --- | --- |
| `vss` | `vss`: its own model, learned from the text of the dataset |
| `parser` | `spacy`, and the retired `spacy-direct`, `spacy-beam`, `neural-dependencies`, `neuro-prolog`, `neuro-z3`, `neuro-selector`, `selector-distilbert`: the spaCy [dependency parse](https://en.wikipedia.org/wiki/Dependency_grammar) (a tree with one head word for each word), or a choice among circuits written from it |
| `prolog` | `prolog`, `prolog-example-transfer` (and `prolog-worlds`, a name kept for an older formalizer): a hand-written grammar in Prolog |
| `z3` | `z3`: a hand-written grammar solved as constraints |
| `distilbert` | `distilbert`: a fine-tuned DistilBERT encoder |

The family is the source, not the kind of program: `neuro-prolog` and `neuro-z3` read the parse, so
they stand with the parser.

## Why the sources must differ

The evidence, all from 2026-11-27:

**Formalizers of one family agree far more often.** Share of the 598 messages of round 2 for which
two formalizers wrote the same circuit (recounted with `agree.mjs` for the syntax-work report):

- `prolog`, `prolog-example-transfer` (same family): 99.8%
- `spacy-direct`, `neural-dependencies` (same): 96.8%
- `neuro-selector`, `selector-distilbert` (same): 88.5%
- `spacy-beam`, `neuro-selector` (same): 84.4%
- `spacy-direct`, `neuro-prolog` (same): 77.6%
- `spacy-direct`, `spacy-beam` (same): 75.1%
- `z3`, `prolog` (different): 54.0%
- `vss`, `distilbert` (different): 48.0%
- `vss`, `spacy-direct` (different): 40.3%
- `vss`, `prolog` (different): 29.6%
- `prolog`, `distilbert` (different): 28.1%

The sources give different ranges for this comparison. The session notes say 77–97% within the
parser family and 30–48% between families; the journal says 77–100% within a family. The recount
above gives 74–97% for the three formalizers that write the parse with few changes, down to 47.3%
for the selectors and hybrids, and 28–54% between families.

**Agreement within a family is not reliable.** When the three spaCy formalizers wrote a circuit
alike in round 1, a judge still rejected 53 of the 439 of these circuits that were judged (12.1%).

**Two families can share a source.** A judge rejected 14 of 39 circuits that only VSS and Prolog
wrote alike, against 3 of 427 that three or four families wrote alike. The session notes explain it:
both read word order with a learned lexicon. `tests/benchmark/syntax/README.md` gives these figures
for "the first judged sample"; which run that was is not identified in the sources.

## How many families

| Where | Families required |
| --- | --- |
| rounds | 3: the default of `round.mjs settle --families` |
| batch | 2: `batch-settle.sh` passes `--families 2` |
| library | 2: the default of `agreedCircuits` in `lib.mjs` |

Reading only `lib.mjs` gives the wrong default for rounds. In the batch conversion, VSS and
spacy-direct were the only formalizers in 211 of 217 folders, so three families would have needed
DistilBERT, which ran in six. The evidence when two was chosen: on rounds 1 and 2, VSS and
spacy-direct agreed under the relaxed key on 606 messages, of which a judge rejected 2 (commit
`40c00a7`). The decision is recorded as [T1](../project/tool-decisions.md#t1).

## Written alike: three keys

| Key | Two circuits count as alike when |
| --- | --- |
| `core` | their cores are equal ([normal form and core](normal-form.md)) |
| `relaxed` | their cores are equal once the start of every relation with a marker is left out, with its `attachment=ambiguous` (`relaxedCore`) |
| `variants` | as `relaxed`, or equal once each choice that the judges' rules let pass either way is written one way (`agreementKey`, commit `c8d0a09`) |

`relaxed` exists because the judges accept several starts for a relation with a linking word. Two
formalizers that differ only there would never agree exactly, though both circuits pass. An example
from round 1:

```
# turn underline on for the Results heading
# vss: "for the Results heading" hangs from "underline"
@r1 syntax.relation marker="for" from=$n1 to=$n2
# spacy-direct: it hangs from the clause
@r1 syntax.relation marker="for" from=$c1 to=$n2
```

The eight choices that `variants` adds:

- which clause holds a word said to the listener, and "Thanks!" as a fragment of its own;
- a number or a name right after a noun;
- a name of several words;
- "a bit", "a little";
- a naming participle ("called", "named", "titled", …);
- a quantity phrase before a noun ("a pair of", "a couple of", …);
- "let's", "let us";
- "left of", "right of", and a word that grades a place marker ("just above").

The exact rewriting, and the choices that judges accepted both ways but `rules.md` does not name
(left out on purpose): section "Written alike up to what the rules let pass" of
[tests/benchmark/syntax/README.md](../../tests/benchmark/syntax/README.md).

## Which circuit becomes the label

Under `relaxed` or `variants`, the circuits counted alike form one group. The circuit of the first
formalizer named by `--prefer` stands for it, else the one most formalizers wrote. The batch uses
`--prefer vss`, so VSS's choice became the label. No reason for choosing VSS is recorded
([T2](../project/tool-decisions.md#t2)). What this does to the benchmark:
[The benchmark](benchmark.md#how-to-read-a-goal).

## Caveats

- **Two agreed circuits for one message.** Under the `core` key, two pairs of families can each agree
  on a different circuit. Round 2 had 345 agreed circuits for 320 messages. The syntactic file holds
  one; the other is kept only by 20 registry lines with judge "agreement", an open point of the
  journal.
- **A family is only as independent as its training.** A DistilBERT trained on agreement circuits
  learns the readings it would be checked against (the session notes' reading of a result, not a
  separate measurement).
- **Old weights in six folders.** In six calendar folders of the batch conversion, DistilBERT very
  likely ran with weights fitted on the old, untrusted annotations (inferred from file times; the
  checkpoint is not recorded). 986 labels of those folders rest partly on it (counted at 18:00 on
  2026-11-27).
- **The parser's fault on calendar templates.** spacy-direct made the time zone the head of the
  clock time ("14:00 UTC" with head "UTC") in 990 of 1,000 messages of `calendar/meetings-01.01`, so
  agreement was low there through the parser's fault. A judge read 564 VSS circuits of that file and
  accepted 560; the session notes also give 77 of 77 sampled calendar circuits of VSS as right
  (session notes only). Clock times with "UTC" were among the spaCy repairs listed as in progress at
  the end of that day; whether the fault is gone was not recounted.

## Standard, new here, particular

| Label | What |
| --- | --- |
| Standard | Independent views that confirm each other: [co-training](https://en.wikipedia.org/wiki/Co-training), [inter-rater reliability](https://en.wikipedia.org/wiki/Inter-rater_reliability), the consensus of an [ensemble](https://en.wikipedia.org/wiki/Ensemble_learning). |
| New here | The procedure: families declared by source, keys up to what the judges' rules let pass, and a seeded audit. |
| Particular | The families are this project's formalizers; the `variants` key follows this project's `rules.md`. |

Current numbers: [STATUS.md: Agreement between VSS and spaCy](../STATUS.md#agreement-between-vss-and-spacy).

Next: [The audit of agreed circuits](audit.md) · Up: [Evaluation and labels](README.md)
