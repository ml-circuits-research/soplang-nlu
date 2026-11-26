# Z3 strategy

From the `soplang-nlu` directory, run `npm ci --prefix strategies/z3` to install the pinned Z3 WASM package. A caller with an existing installation can pass `z3Module`, either the module namespace or the path to its Node entry file.

```js
import { createReader } from './lib/reader.mjs'
import { z3 } from './strategies/z3/index.mjs'

const reader = await createReader({
  strategy: z3,
  knowledgeDir: process.env.SOP_KNOWLEDGE,
  topK: 4,
  ambiguity: true
})

try {
  const result = await reader.propose('Move it to the left.')
  console.log(result.candidates, result.unresolved, result.ambiguity)
} finally {
  await reader.close()
}
```

`knowledgeDir` points to a SOP knowledge checkout containing `tools/sopworld` and `docs/worlds`. Pass additional SOP files or directories as `worldPaths`. The Z3 catalog reads `core.word` and `w.request.key` wires from these files. Later overlay wires replace earlier wires with the same ID. The verifier checks against the installed schemas and the effective request key declarations.

The lattice also uses built-in English morphology, phrase recognizers and some family and property aliases. Custom vocabularies can extend catalog bindings. Adding grammar and domain fact shards or changing the request schema requires a compatible knowledge checkout. Changes to the request wire enums can require changes in the SMT encoding.

Each candidate retains its MaxSMT objective and native verifier check. With `ambiguity: true`, the reader reports the first two candidate objectives, their margin when both exist, and selected differences between the circuits. The legacy `confidence: true` option also requests these diagnostics.

The runtime was ported from `z3-formaliser` under the terms of its [GPL license](LICENSE).
