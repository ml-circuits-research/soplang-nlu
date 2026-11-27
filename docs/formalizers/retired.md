[Home](../README.md) › [Formalizers](README.md) › Retired

# Retired formalizers

This page: the eight formalizers kept in the code but left out of the [conversion rounds](../evaluation/conversion.md) and the [benchmark](../evaluation/benchmark.md), one entry each. Kind: Reference.

## Why they are retired

Each is too close to an active formalizer: it reads a message from the same source, so it belongs to the same **family**. Formalizers of one family repeat each other's faults, and their agreement is no independent evidence ([Agreement between formalizers](../evaluation/agreement.md)).

On the 598 messages of conversion round 2, these pairs wrote the same circuit (comment in `tests/benchmark/syntax/strategies.mjs`):

- `spacy-direct` and `neural-dependencies`: 97% of messages.
- The two selectors: 88% (and 77 to 84% the same as `spacy-beam`, among whose circuits they choose).
- `neuro-prolog` and `spacy-direct`: 78%.
- `prolog-example-transfer` and `prolog`: 100%, since it has no templates yet.

The owner decided to keep at most four strategies with different sources ([decision D10](../project/decisions.md#d10)), landed in commit `40c00a7`. `tests/benchmark/syntax/strategies.mjs` lists the eight in `retiredModules`. Their code stays, and each still runs by name:

```sh
node tests/benchmark/syntax/run.mjs <run-folder> \
  --only spacy-direct
```

The family of each is declared in `families` in the same file ([Benchmark tools](../reference/run-tools.md)).

## spacy-direct

| Item | Fact |
| --- | --- |
| Family | parser |
| What it does | One dependency parse, with the repairs of word classes and clause boundaries, written as one circuit. No beam. |
| Now | Its repair files and learned word lists in `strategies/spacy-direct/` are used by `spacy` ([spaCy: how a circuit is written](spacy-details.md)). The batch conversion ran it (`batch-run.sh` runs `vss,spacy-direct,distilbert` by default), so its name appears in the sources of labels, such as `spacy-direct+vss`. |

## spacy-beam

| Item | Fact |
| --- | --- |
| Family | parser |
| What it does | `spacy-direct` plus the parser's beam: a parse to fall back on, and `attachment=ambiguous` where the beam disagrees on where a phrase starts. |
| Now | It is the strategy `spacy`, under one name (`strategies/spacy/index.mjs`). |

## neural-dependencies

| Item | Fact |
| --- | --- |
| Family | parser |
| What it does | The dependency parse written as it stands, with no repairs. |
| Now | Its folder holds the Python transport (`worker.py`) and the circuit writer (`syntax-circuit.mjs`) that `spacy` uses. |

## neuro-selector

| Item | Fact |
| --- | --- |
| Family | parser |
| What it does | Four other strategies each write a circuit: `spacy-beam` with the base and with an adapted transformer parser, `spacy-direct` with an adapted compact parser, and `neuro-prolog`. A fitted ranker scores the distinct circuits and returns the best. Where the pool does not settle where a phrase starts, it writes `attachment=ambiguous`. |
| Now | Retired. Its ranker (`model.json`) was fitted on the older `nlu` annotations ([decision D11](../project/decisions.md#d11)). |

## selector-distilbert

| Item | Fact |
| --- | --- |
| Family | parser |
| What it does | The circuit of `neuro-selector`, read against the circuit of `distilbert`. Where the DistilBERT circuit starts a phrase at another wire of the same clause, that relation starts at the clause with `attachment=ambiguous`. With no valid selector circuit, the DistilBERT circuit is returned. |
| Now | Retired. |

## neuro-prolog

| Item | Fact |
| --- | --- |
| Family | parser |
| What it does | A dependency parser (spaCy by default) gives every word a head, a relation and a word class; Prolog (`prolog/syntax_projection.pl`) turns that parse into a circuit. The Prolog grammar of `prolog` takes no part. |
| Now | Retired. It has no page of its own. |

## neuro-z3

| Item | Fact |
| --- | --- |
| Family | parser |
| What it does | A dependency parser reads the message; what it saw (word classes, nominals, attachments) enters the constraint model of `z3` as weighted evidence; Z3 solves the model. |
| Now | Retired. It has no page of its own. |

## prolog-example-transfer

| Item | Fact |
| --- | --- |
| Family | prolog |
| What it does | Matches a whole message against templates learned from examples (a message with its trusted circuit) and writes the template's circuit over the new words. A message no template takes is read by the grammar of `prolog`. With no model there are no templates. |
| Now | Retired. Its training split is a method worth reusing (below). |

**The training boundary** (from `docs/strategies/prolog-example-transfer.md`): freeze the test sample from a committed dataset revision first, and read the training data from the same revision. Exclude every row whose original text is a held-out text, across all files and columns; case, whitespace and Unicode code points count. Verify that the training and evaluation texts do not intersect. Similar sentences can still occur on both sides of a text-level split. Record the dataset revision, the fingerprints of both sets, the excluded row count and the training time with the run.

## prolog-worlds

The name `prolog-worlds` is still in the `prolog` family list, but it has no module in `strategies.mjs` and no folder under `strategies/`.

## Measurements of the nlu era

These formalizers were measured on the earlier `nlu` schema. Those results are in [Strategies of the nlu-schema period](../project/nlu-strategies.md).

---

Next: [Speed and cost: what to consider](speed.md) · Up: [Formalizers](README.md)
