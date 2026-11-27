# Z3 strategy

The strategy reads one English message and writes one circuit in the `syntax` schema (`docs/syntax-schema.md`). It reads the text alone: no knowledge repository, no knowledge world, no older schema.

From the `soplang-nlu` directory, run `npm ci --prefix strategies/z3` to install the pinned Z3 WASM package. A caller with an existing installation can pass `z3Module`, either the module namespace or the path to its Node entry file.

```js
import {createReader} from './lib/index.mjs'
import {z3} from './strategies/z3/index.mjs'

const reader = await createReader({strategy: z3})
try {
  const {candidates, error} = await reader.propose('Move it to the left.')
  console.log(candidates[0]?.sop ?? error)
} finally {
  await reader.close()
}
```

## How it reads a message

| Step | File in `src/syntax/` | What it does |
| --- | --- | --- |
| 1 | `lexicon.mjs`, `english.mjs` | Lists what each word may be. Function words and common verbs come from `english.mjs`. Nouns, verbs and describing words come from the usage model `model/usage.json`, from endings and from capital letters. |
| 2 | `model.mjs` | Writes one MaxSMT problem for the message. Z3 chooses the class of every word, the nominals with their heads, the construction that licenses each verb, and where each marker phrase attaches. Hard constraints state what English grammar excludes; weighted constraints state what it prefers. |
| 3 | `solver.mjs` | Solves the problem with `z3-solver`, each message in a context of its own. |
| 4 | `assemble.mjs`, `circuit.mjs` | Lays the solution out as clauses, nominals, relations and coordinations by the rules of the schema, and writes it with `writeCircuit`. |

The usage model holds, for about 4,200 words, how often the word stood as the head of a nominal, as a verb, or as a describing word in unannotated message text. `tools/train-usage.mjs <dataset folder>` learns it again from word order around function words; it reads no annotation.

`strategies/neuro-z3` uses the same model and assembler, and adds what a dependency parser saw as weighted evidence.

## Tools

| Tool | Use |
| --- | --- |
| `tools/train-usage.mjs` | Learns `model/usage.json` from the message text of a dataset checkout. |
| `tools/measure-syntax.mjs` | Runs `z3` or `neuro-z3` over a sample through the common reader and writes one JSON line per message. |
| `tools/compare-references.mjs` | Evaluation only: compares a run with the accepted circuits of the dataset. |

## Older code

The files outside `src/syntax/` (`src/analysis*.mjs`, `src/index.mjs`, `src/reader.mjs`, `src/kb/`, `src/lattice/`, `src/smt/`, `src/emit/`, `src/verify/`, `smt/*.smt2`) belong to the earlier readers for the `nlu` and `w.request` schemas. They load knowledge worlds. The strategy exported by `index.mjs` does not reach them.

The runtime was ported from `z3-formaliser` under the terms of its [GPL license](LICENSE).
