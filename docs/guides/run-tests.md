[Home](../README.md) › [How-to guides](README.md) › Run the tests

# Run the tests

This page: how to run the package's tests, and what each key test file checks. Kind: How-to guide.

The tests are [unit tests](https://en.wikipedia.org/wiki/Unit_testing) written with Node.js's built-in test runner (`node --test`). Run them after every change and before every commit, as a [regression test](https://en.wikipedia.org/wiki/Regression_testing).

## Run all tests

```sh
env -u SOP_KNOWLEDGE_DIR npm test
```

`npm test` runs `node --test tests/*.test.mjs`, every test file of the package. `env -u` unsets `SOP_KNOWLEDGE_DIR` for the same reason `run.mjs` does: nothing in the syntax work may depend on the knowledge repository (the sibling repository `sop-knowledge-worlds` of world knowledge, [Worlds](../concepts/worlds.md)). Most key test files say so in their first lines.

## Run one area

```sh
env -u SOP_KNOWLEDGE_DIR node --test \
  tests/vss-syntax.test.mjs tests/vss.test.mjs
```

The key files, each named `tests/<name>.test.mjs`:

| File | What it checks |
| --- | --- |
| syntax-contract | The contract every formalizer of the syntax schema is held to: the schema, the checker and the writer of `lib/syntax.mjs`. |
| syntax-benchmark | The evaluation tools: normal form, registry, labels, packets, the check of verdict files, levels and GOAL, agreement, the random sample, runs from start to table with stub formalizers, and a conversion round from source file to syntactic file. |
| vss-syntax | VSS end to end through the common reader, in the syntax schema. |
| vss | The VSS legend, observation of words, and VSS's internal output in the older `nlu` form. |
| spacy-syntax | The parser formalizers (`neural-dependencies`, `spacy-direct`, `spacy-beam`) on parses recorded once from the pretrained parser, one or more per repair. The last test runs the parser itself, and only when `SOP_NLU_SYNTAX_PYTHON` and `SOP_NLU_SYNTAX_MODEL` are set. |
| distilbert-strategy | The DistilBERT adapter: it handles the replies of its Python worker one request at a time and keeps the exact checks of the message's text. |
| prolog-syntax | The Prolog formalizers through the common reader. Skipped when no SWI-Prolog is found. The part that reads a dependency parse uses recorded parses, and runs the live parser only when the two spaCy variables are set. |
| z3-syntax | The Z3 formalizers. The part on the real dependency parser of `neuro-z3` is skipped unless the two spaCy variables are set. |

Many of the other files in `tests/` test strategies and tools of the earlier `nlu` schema: see [The nlu-schema period](../project/nlu-period.md).

## Run one test by its name

`--test-name-pattern` runs only the tests whose name matches:

```sh
env -u SOP_KNOWLEDGE_DIR node --test \
  --test-name-pattern="fragment" tests/vss-syntax.test.mjs
```

This runs the test "a message with no verb is a fragment".

## Read the result

The run ends with a summary of counts (here `<n>` stands for a number):

```text
# tests <n>
# pass <n>
# fail 0
# skipped <n>
```

A line `not ok` names each failed test, with the expected and the actual value under it. `skipped` counts tests that need an outside runtime that is not set up, such as the spaCy parser itself.

## When to run which tests

| Change | Tests to run |
| --- | --- |
| `lib/syntax.mjs` | syntax-contract, then all tests: every formalizer depends on the checker and the writer. |
| Benchmark tools | syntax-benchmark. |
| VSS rule or legend | vss-syntax and vss, after retraining when the change needs it. |
| spaCy repair | spacy-syntax. |
| Before a commit | All tests. |

## Pitfalls

- **`tests/vss.test.mjs` can pass with a stale model.** It reads `strategies/vss/legend.sop` directly, while reading takes the legend from the copy inside `model.json`. After a change to the legend, retrain ([Retrain VSS](retrain-vss.md)); the reason is in [The model file](../vss/model-file.md).
- **`npm run benchmark` is not the benchmark.** It runs `tests/benchmark/port-run.mjs` of the `nlu` period. The current benchmark is in [Run the benchmark](run-benchmark.md).
- **Outside runtimes.** Tests of formalizers that need Python or SWI-Prolog run their full form only where those are installed and named (see [Run a formalizer](run-a-formalizer.md)).
- **Test counts change** with every rule and repair, so this page states none. The output of `node --test` ends with the counts of the run.

Next: [Run the benchmark](run-benchmark.md) · Up: [How-to guides](README.md)
