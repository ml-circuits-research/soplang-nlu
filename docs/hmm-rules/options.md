[Home](../README.md) › [hmm-rules in depth](README.md) › Commands and options

# hmm-rules commands and options

This page: the commands that read, trace, train, test and measure hmm-rules, the options of `train.mjs` with their defaults, and the options of the reader. Kind: Reference.

All commands run from the folder `soplang-nlu`. Training needs the dataset checked out next to it; reading needs only the model file. The options are as in the code at commit `97a1b83` (hmm-rules code of `85de0bb`).

## Commands

**Read one message.**

```sh
node --input-type=module -e "
import {hmmRules} from './strategies/hmm-rules/index.mjs'
const engine = await hmmRules.open()
const r = await engine.analyse(process.argv[1])
console.log(r.analyses[0].sop)
" 'could you increase the mouth by 10 percent?'
```

`hmmRules.open({model})` also accepts the path of another model file, or a model object. The old option name `vssModel` and the old export `vss` still work.

**Trace one message**: the stations and the doubts of each reading round.

```sh
node --input-type=module -e "
import {readFileSync} from 'node:fs'
import {createHmmRulesReader}
  from './strategies/hmm-rules/src/reader.mjs'
const path = 'strategies/hmm-rules/model/model.json'
const model = JSON.parse(readFileSync(path, 'utf8'))
const options = {schema: 'syntax', trace: true}
const reader = createHmmRulesReader(model, options)
const r = reader.analyse(process.argv[1])
console.log(r.analyses[0].sop)
" 'can I get a cinnamon stick?'
```

A worked example with its output: [Follow one message through hmm-rules](tutorial-one-message.md).

**Train.**

```sh
node strategies/hmm-rules/train.mjs --dataset ../webmeet-dataset
```

When to retrain and what to check after: [Retrain the hmm-rules model](../guides/retrain-hmm-rules.md).

**Test.**

```sh
env -u SOP_KNOWLEDGE_DIR node --test \
  tests/hmm-rules-syntax.test.mjs tests/hmm-rules.test.mjs
npm test
```

`tests/hmm-rules-syntax.test.mjs` checks the public strategy in the syntax schema; `tests/hmm-rules.test.mjs` checks the legend, observation and the internal `nlu` output. `npm test` runs every test of the package.

**Measure on the syntax benchmark.**

```sh
S=eval-results/2026-11-27-syntax-benchmark-random/sample.json.gz
node tests/benchmark/syntax/run.mjs eval-results/<run> \
  --only hmm-rules --sample $S
```

Judging the new circuits and writing the table: [Run the benchmark](../guides/run-benchmark.md).

## Options of `train.mjs`

| Option | Meaning and default |
| --- | --- |
| `--dataset` | The dataset folder. Default: `webmeet-dataset` next to `soplang-nlu`. |
| `--out` | Where the model is written. Without it, `strategies/hmm-rules/model/model.json` is overwritten. |
| `--legend` | The legend file, resolved relative to `strategies/hmm-rules/`, not to the current folder. Default `legend.sop`. |
| `--iterations` | Rounds of Baum–Welch. Default 25. |
| `--min-count` | How often a word must be seen to enter the vocabulary. Default 3. |
| `--dimensions` | Dimensions of the word vectors ("meanings"). Default 128. |
| `--sharpen` | The power to which emission counts are raised. Default 1.5. |
| `--warmup` | Rounds before sharpening starts. Default 6, so sharpening runs from round 7. |
| `--kinship` | The share of a form's counts replaced by its stem's. Default 0.5. |
| `--formLean` | The starting weight of a station that a word's suffix or form admits. Default 8. |
| `--anchoring` | The strength of a pull towards the anchored kinds. Off unless given; it measured worse. |

What each step does: [Training: from text to vocabulary](training.md), [Training: the station HMM](training-hmm.md).

## Options of the reader

`createHmmRulesReader(model, options)` in `src/reader.mjs` takes these options, and passes them on to `openModel`. Meanings are given where the code or the architecture report states them clearly.

| Option | Meaning and default |
| --- | --- |
| `schema` | `'syntax'`: one circuit in the syntax schema, as the strategy uses it. Without it, the internal `nlu` text, with a second reading and `flags`. |
| `trace` | Prints the stations and the doubts of the first reading, and again at the start of each re-reading round. The report also names units; the code at `fa46cb7` and at `97a1b83` prints none. |
| `without` | Lettered rules to switch off, such as `'A,G'` ([The rule catalogue](rules.md#lettered-rules)). |
| `budget` | `false` turns the verb budget off. Default on. |
| `verbLead` | A lead for words known as verbs inside the budget. Default 0, which has no effect. |
| `occurrence` | `false` turns the occurrence lift off. Default on. |
| `occurrenceWeight` | The weight w in exp(w × cosine) of the occurrence lift. Default 4. |
| `openers` | `false` turns the opener rules off. Default on. |
| `open` | Default on: unsettled attachments are marked. `false` stops that, and also switches off every rule in `src/links.mjs` guarded by it. |
| `openBelow` | The margin between the two best hosts below which an attachment is marked ambiguous. Default 0.5. |
| `hosts` | Default on: the clause and the chain of nominals compete. `false`: only the clause and the nominal before the preposition, by the attach score. |
| `alike` | How likeness is computed. Default `'structure'`: head vectors plus build vectors. Also `'meaning'`, `'opener'`, `'nearest'`. |
| `attachMode` | How the attach score is computed. Default `'current'`: counts plus `memoryWeight` times the memory fit. Also `'counts'`, `'memory'`, `'clause'`, `'entity'`, `'substitution'`. |
| `memoryWeight` | The weight of the memory fit in attachment scores. Default 2. |

`attachMode` acts where the attach score is used: in the gapping test, and in attachment when `hosts` is `false`.

Other options are read in the code and not described here: `meanings`, `memory`, `attachment`, `transfer`, `typeVeto`, `typeRatio`, `alternatives`, `ambiguous`, `explore`, `exploreBelow`, `list`, `gapping`, `kinds`.

More commands for every formalizer: [Run a formalizer](../guides/run-a-formalizer.md).

---

Next: [How-to guides](../guides/README.md) · Up: [hmm-rules in depth](README.md)
