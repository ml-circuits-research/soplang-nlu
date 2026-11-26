# spaCy beam

`spacy-beam` uses spaCy’s English dependency beam and the same SOP projection as [spaCy direct](spacy-direct.md). Select it by passing `spacyBeam` to `createReader`. The strategy requires a SOP knowledge directory to check source grounding before it selects alternatives.

```js
import {createReader} from 'soplang-nlu'
import {spacyBeam} from 'soplang-nlu/strategies/spacy-beam'

const reader = await createReader({
  strategy: spacyBeam,
  knowledgeDir: '/path/to/sop-knowledge-worlds',
  python: '/path/to/python',
  model: 'en_core_web_trf'
})
try {
  const result = await reader.propose('Move it so that she can see it.')
  console.log(result.candidates.map(candidate => candidate.sop))
} finally {
  await reader.close()
}
```

The [dependency transport](neural-dependencies.md) accepts a local Python executable and an installed model. Its default model is `en_core_web_sm`. A custom `syntaxModel` must implement `parseBeam(text)` and return the greedy `tokens` and up to three `alternatives`. Each alternative contains a finite `score` and a dependency graph over the same lexical tokens.

The parser reuses the greedy pass’s encoded model features. It uses beam width eight and extracts at most three distinct dependency graphs. The strategy then applies a fixed public selection rule:

1. Keep the greedy SOP first if it is source-complete.
2. Append up to two distinct source-complete beam SOPs in descending parser score.
3. Keep the original greedy partial if none of the circuits is complete.

The public cap is three. Source completeness checks exact source coverage and permits incidental punctuation gaps under the shared checker. Scores rank parser hypotheses and provide no semantic guarantee.

On the [historical 250-text pilot](../../eval-results/2026-11-26-spacy-dependency-beam-pilot/README.md), the transformer beam raised the number of inputs with at least one accepted reading from 152 to 171. The number with every returned reading accepted fell from 152 to 113, and 58 inputs had a mix of accepted and rejected readings. Those judgments used projector revision `24f248b`. A client selecting the first complete candidate received 157 accepted readings and abstained 40 times on that pilot.

Use `STRATEGIES=spacy-beam` to time this strategy independently with the benchmark runner.

The deployment check compared the live public API against paired recomputation of all 250 saved dependency beams using a later, fixed projector snapshot. All candidate lists matched that recomputation in order and stayed within the cap. The later snapshot had 199 complete greedy outputs and 209 complete beam outputs. It produced the same list as the previously reviewed projector on 200 texts. Its CPU transformer public API timings were 2.47 s to open and 52.09 ms median per request, with p95 of 92.00 ms. The later snapshot has no new semantic judgments.
