# soplang-nlu

soplang-nlu reads one English message typed to an application and writes how the sentence is built, as a
**circuit** in the SOP Lang notation, in the `syntax` schema (`schemas/syntax/schema.sop`). It uses only the
words of the message. Several formalizers (the code says *strategies*, one folder each under `strategies/`) do
this from different sources of knowledge; their circuits are judged and become the labels of the WebMeet
dataset. spaCy is the one formalizer being improved; hmm-rules (called vss until 2026-11-27),
DistilBERT, Prolog and Z3 are experimental; rvss, a vector-symbolic reader, is being built.

**Documentation: [docs/README.md](docs/README.md)**: what the project is, reading paths, and sections from the
concepts to the reference. Current numbers: [docs/STATUS.md](docs/STATUS.md).

## Use

The package is not published (`"private": true` in `package.json`). Run code from a file inside this
checkout, where a module can import the package by its own name:

```js
import {createReader} from 'soplang-nlu'
import {hmmRules} from 'soplang-nlu/strategies/hmm-rules'

const reader = await createReader({strategy: hmmRules})
try {
  const {candidates, error} = await reader.propose('move it')
  if (error) console.error(error)
  for (const {sop} of candidates) console.log(sop)
} finally {
  await reader.close()
}
```

The reader checks the circuit with `validateSyntax` (`lib/syntax.mjs`) and returns it in `candidates` only
when it is valid; otherwise `error` says why. hmm-rules needs only Node.js. The other formalizers need more:
spaCy and DistilBERT need Python, Prolog needs SWI-Prolog, Z3 needs `npm ci --prefix strategies/z3`.
Details: [Run a formalizer](docs/guides/run-a-formalizer.md) and [Library API](docs/reference/library.md).

## Commands

- `npm test`: the library tests (`node --test tests/*.test.mjs`).
- The syntax benchmark and the conversion tools are in `tests/benchmark/syntax/`:
  [Run the benchmark](docs/guides/run-benchmark.md). (`npm run benchmark` runs the older
  `tests/benchmark/port-run.mjs`, not the syntax benchmark.)
- `node docs/status/build.mjs` rebuilds the status page; `node docs/tools/check-docs.mjs` checks the
  documentation.

## Licenses

The ported formalizer sources include their license files under `strategies/`. The WebMeet evaluation
comparator carries its license under `tests/benchmark/webmeet/`.
