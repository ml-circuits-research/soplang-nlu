# spaCy direct

`spacy-direct` projects one dependency analysis into an `nlu` SOP circuit. It shares the optional [dependency transport](neural-dependencies.md) with strategies that use the same pretrained syntax model. A caller can supply a shared `syntaxModel` or choose a local Python interpreter and spaCy model with `python` and `model`. The default model is `en_core_web_sm`.

The projector maps dependency labels into clause roles, nominal modifiers, coordination, and directed attachment relations. It retains exact source evidence for each role and aligns atomic quoted text, numbers, dates, clocks, and contracted forms to source boundaries. Unsupported tokens use `unresolved`. Domain actions, object kinds, and colors are left unspecified.

The direct baseline makes one deterministic pass over the dependency structure. A mislabelled head or attachment can therefore appear in the resulting circuit, and an otherwise readable construction can remain partial. The shared validator checks source grounding and schema structure. The development benchmark sends fully grounded, source-complete circuits to independent reviewers who also see the original text. It measures raw dependency quality separately from circuit quality.

For the input `now route that arrow around Verify instead`, the transformer pipeline produced the following accepted circuit. The model tagged `Verify` as a verb, but placed it as the object of `around`. The projector uses that dependency and the capitalized source spelling to retain the landmark as a name.

```sop
@n1 nlu.clause form=imperative predicate="route" polarity=positive adverb="now" direct_object=$n2 adverb="instead"
@n2 nlu.entity head="arrow" determiner="that"
@n3 nlu.entity name="Verify"
@n4 nlu.relation kind=around from=$n1 to=$n3 cue="around"
```

At revision `24f248b`, the compact and transformer models produced one public circuit per source. On the same 1,861 historical inputs, independent reviewers accepted 38.90% (compact) and 60.61% (transformer). Median CPU parser plus projection times were 2.20 ms and 49.28 ms respectively. Excluding the 100 known development inputs gave 38.44% and 59.34%. [Paired one-percent benchmark and timings](../../eval-results/2026-11-26-spacy-direct-historical-refresh-one-percent/README.md)

The projector now recovers the directive in `erase one document`. In a remaining failure, `book Room 7 for Planning on 2026-12-19 from 11:00 UTC for 45 minutes.`, the transformer tags `book` as a noun modifying `Room`. The projector generates a well-formed nominal fragment that covers the text but loses the booking directive. This illustrates the distinction between the static source gate and the independent whole-circuit judgment.

To run the public adapter smoke test with a local model:

```sh
SOP_NLU_SYNTAX_PYTHON=/path/to/python SOP_NLU_SYNTAX_MODEL=en_core_web_sm \
  node --test tests/spacy-direct.test.mjs
```
