# soplang-nlu

Formalise a single natural-language message into plausible SOP Lang circuits using the installed worlds and schemas. Each reading is independent. The library also records lexical and phrase evidence anchored to the original text.

```js
import {createReader} from 'soplang-nlu'
import {prolog} from 'soplang-nlu/strategies/prolog'

const reader = await createReader({
  strategy: prolog,
  knowledgeDir: process.env.SOP_KNOWLEDGE,
  swipl: process.env.SWIPL
})
try {
  const {candidates} = await reader.propose('Move it to the left')
  for (const {sop, check} of candidates) console.log(sop, check)
} finally {
  await reader.close()
}
```

The strategy proposes the syntactic roles, links and optional semantic values for each complete candidate. The adapter attaches source coverage and schema diagnostics to its circuit. The benchmark can evaluate the separate historical `w.request` proposal method with `EVAL_SCHEMA=w.request`.

The Node.js core uses built-in modules. The [Prolog](docs/strategies/prolog.md) strategy requires a SWI-Prolog executable. The [Z3](docs/strategies/z3.md) strategy requires z3-solver. Both use a SOP installation with the native runtime and the configured knowledge worlds. See the [design and evaluation protocol](docs/README.md) for wire evidence, source offsets, timings and grading. Run `npm test` for the library tests.

The ported formaliser sources include their respective license files under strategies/. The WebMeet evaluation comparator carries its license under tests/benchmark/webmeet/.

The separately trained [Prolog example-transfer strategy](docs/strategies/prolog-example-transfer.md) learns slot patterns from the portion of the committed dataset outside the evaluation split. Its training time, training fingerprint and alternative quality are recorded alongside the two symbolic baselines.

For a standalone dependency-parser formaliser, pass `spacyDirect` or `spacyBeam` to the same reader with a local Python executable and English spaCy model. Both produce native SOP circuits directly. Direct projection returns one graph. Beam projection explores alternative dependencies and returns up to three distinct readings. [Direct strategy and source-grounded example](docs/strategies/spacy-direct.md) · [Beam strategy and paired evaluation](docs/strategies/spacy-beam.md)
