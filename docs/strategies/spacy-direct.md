# spaCy direct

`spacy-direct` projects one dependency analysis into an `nlu` SOP circuit. It shares the optional [dependency transport](neural-dependencies.md) with strategies that use the same pretrained syntax model. A caller can supply a shared `syntaxModel` or choose a local Python interpreter and spaCy model with `python` and `model`. The default model is `en_core_web_sm`.

The projector maps dependency labels into clause roles, nominal modifiers, coordination, and directed attachment relations. It retains exact source evidence for each role and aligns atomic quoted text, numbers, dates, clocks, and contracted forms to source boundaries. Unsupported tokens use `unresolved`. Domain actions, object kinds, and colors are left unspecified.

The direct baseline makes one deterministic pass over the dependency structure. A mislabelled head or attachment can therefore appear in the resulting circuit, and an otherwise readable construction can remain partial. The shared validator checks source grounding and schema structure. Human review is needed to measure interpretation quality.

To run the public adapter smoke test with a local model:

```sh
SOP_NLU_SYNTAX_PYTHON=/path/to/python SOP_NLU_SYNTAX_MODEL=en_core_web_sm \
  node --test tests/spacy-direct.test.mjs
```
