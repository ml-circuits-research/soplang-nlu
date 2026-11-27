[Home](../README.md) › [How-to guides](README.md) › Run a formalizer

# Run a formalizer

This page: how to set up any formalizer and read one message, or a whole sample, from code or from the shell. Kind: How-to guide.

A [formalizer](../formalizers/README.md) reads one message and writes one [circuit](../concepts/first-circuit.md) in the syntax schema. All formalizers are called the same way, through the common reader `createReader` of `lib/reader.mjs`.

## Set up

### hmm-rules

Nothing beyond Node.js. The trained model is part of the repository: `strategies/hmm-rules/model/model.json`. The option `model` of `open` loads another model file (the old option name `vssModel` is still accepted). The strategy was called `vss` until 2026-11-27; the old export `vss` and the package path `soplang-nlu/strategies/vss` still work.

### spacy

A Python with spaCy 3.8 and an English pipeline with a parser ([spaCy](https://en.wikipedia.org/wiki/SpaCy); a pipeline is spaCy's trained model for one language). The configuration measured in the benchmark uses the transformer pipeline `en_core_web_trf` 3.8.0, which also needs spacy-transformers (PyTorch). Name both with environment variables:

```sh
export SOP_NLU_SYNTAX_PYTHON=/path/to/python
export SOP_NLU_SYNTAX_MODEL=/path/to/en_core_web_trf-3.8.0
```

The options `python` and `model` of `open` do the same. Without them the code uses `python3` and the small pipeline `en_core_web_sm`. Loading a pipeline downloads nothing. The sources record install steps only for the small pipeline: install spaCy 3.8 and `en_core_web_sm` 3.8.0 into a Python environment; the release wheel used in development has this SHA-256:

```text
1932429db727d4bff3deed6b34cfc05df17794f4a52eeb26cf8928f7c1a0fb85
```

Install steps for the transformer pipeline are not documented.

### distilbert

A Python with `torch` and `transformers`, and a trained checkpoint. The weights are not in the repository (`.local-models` is ignored by git): [Retrain DistilBERT](retrain-distilbert.md) makes one.

| Setting | Variable, option, default |
| --- | --- |
| Python | `SOP_NLU_DISTILBERT_PYTHON` or the option `python`; default `python3`. |
| Checkpoint | `SOP_NLU_DISTILBERT_MODEL` or the option `modelPath`; default `.local-models/distilbert/syntax-v1/checkpoint` when it exists. |
| Device | `SOP_NLU_DISTILBERT_DEVICE` or the option `device`: `auto` (the GPU when there is one), `cpu` or `cuda`. |

Install steps for this Python environment are not documented.

### prolog

SWI-Prolog ([Prolog](https://en.wikipedia.org/wiki/Prolog)). The formalizer takes the program named by the environment variable `SWIPL` or the option `swipl`, else `swipl` on the path, else a copy at `prolog-formaliser/tools/swipl` beside `soplang-nlu`. Which version is needed is not documented.

### z3

Install the pinned Z3 package (`z3-solver` 5.4.1, compiled to WebAssembly) once:

```sh
npm ci --prefix strategies/z3
```

## Read one message from code

Write a file inside the checkout, for example `try.mjs`, and run it with `node try.mjs`:

```js
import {createReader} from 'soplang-nlu'
import {hmmRules} from 'soplang-nlu/strategies/hmm-rules'

const reader = await createReader({strategy: hmmRules})
try {
  const text = 'Move the blue box towards the yellow circle.'
  const result = await reader.propose(text)
  if (result.error) console.error(result.error)
  for (const {sop} of result.candidates) console.log(sop)
} finally {
  await reader.close()
}
```

With the hmm-rules code of commit `c080ce8` it prints the lines below. The output can change as hmm-rules improves.

```text
@c1 syntax.clause form=imperative verb="Move" complement=$n1
@n1 syntax.nominal dependent="the" dependent="blue" head="box"
@r1 syntax.relation marker="towards" from=$c1 to=$n2
@n2 syntax.nominal dependent="the" dependent="yellow" head="circle"
```

What `propose` returns:

| Field | Meaning |
| --- | --- |
| `candidates` | At most one entry, and only when the circuit passed the check of the schema: `{sop, check}`, plus any field the formalizer adds (hmm-rules adds `confidence`). |
| `error` | `null`, or why there is no candidate: the formalizer's own error, a failed check, or no circuit. |
| `rejected` | The circuit that failed the check, with its findings. |
| `candidateCount` | 0 or 1. |
| `engine` | The formalizer's name. `schema` is `syntax`, `text` the message. |

The other options given to `createReader` go to the formalizer's `open`, for example `{strategy: distilBert, device: 'cpu'}`. Only `maxReadings` and `schemaPaths` stay with the reader. The other formalizers are imported like this:

```js
import {distilBert} from 'soplang-nlu/strategies/distilbert'
import {prolog} from 'soplang-nlu/strategies/prolog'
import {z3} from 'soplang-nlu/strategies/z3'
// spacy has no package export: use a path from the checkout root
import {spacy} from './strategies/spacy/index.mjs'
```

## Read one message from the shell

From the `soplang-nlu` folder:

```sh
node --input-type=module -e "
import {hmmRules} from './strategies/hmm-rules/index.mjs'
const engine = await hmmRules.open()
const text = 'could you increase the mouth by 10 percent?'
console.log((await engine.analyse(text)).analyses[0].sop)"
```

This calls the formalizer's engine directly, so the reader's check of the circuit is skipped.

## Run a formalizer over a sample

```sh
S=eval-results/2026-11-27-syntax-benchmark-random
node tests/benchmark/syntax/run.mjs <scratch>/try \
  --only hmm-rules --limit 50 --sample $S/sample.json.gz
```

`run.mjs` writes into the folder it is given:

| File | Content |
| --- | --- |
| `<name>.jsonl` | One line per message: `id`, `text`, `sop` (the circuit or null), `error`, `ms`. |
| `summary.json` | Per formalizer: status, messages, valid circuits, errors by kind, median milliseconds. |
| `logs/<name>.log` | What the formalizer printed. |

Leave out `--limit` to run the whole sample. Every option is in [Benchmark tools](../reference/run-tools.md). What to consider about speed: [Speed and cost](../formalizers/speed.md).

## Trace hmm-rules, and switch rules off

```sh
node --input-type=module -e "
import {readFileSync} from 'node:fs'
import {createHmmRulesReader} from './strategies/hmm-rules/index.mjs'
const file = 'strategies/hmm-rules/model/model.json'
const model = JSON.parse(readFileSync(file, 'utf8'))
const options = {schema: 'syntax', trace: true}
const reader = createHmmRulesReader(model, options)
console.log(reader.analyse('move the box').analyses[0].sop)"
```

With `trace: true` the reader prints, before the circuit, the [station](../hmm-rules/stations.md) of each word (the word class hmm-rules learned) and its doubts (positions where the reader rules a station out and reads again). For example: `first stations move/predicate the/determiner box/noun | doubts []`. The rules drawn from the calendar files carry a letter each; the option `without: 'A,G'` switches off rules A and G, to measure what each one does. All options: [hmm-rules commands and options](../hmm-rules/options.md). A message followed step by step: [Follow one message through hmm-rules](../hmm-rules/tutorial-one-message.md).

## Pitfalls

- **The package is private.** `import … from 'soplang-nlu'` works only in code inside a checkout of `soplang-nlu`, or after installing the package from a local path.
- **spacy has no package export.** Import it by its path, `./strategies/spacy/index.mjs`, from the checkout root.
- **`run.mjs` without `--sample` runs the earlier fixed sample** (`eval-results/2026-11-26-fresh-locked-one-percent`). The formalizers were tuned on it, so it measures nothing new.
- **`run.mjs` removes `SOP_KNOWLEDGE_DIR`** and drops a `knowledgeDir` option before a formalizer loads. A formalizer that needs the knowledge repository fails there, by design.
- **One circuit per message.** The reader keeps only the first circuit a syntax formalizer returns, and returns it only when it is valid.

Next: [Run the tests](run-tests.md) · Up: [How-to guides](README.md)
