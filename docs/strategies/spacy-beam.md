# spaCy beam

This page describes the earlier projection into the `nlu` schema. The strategy now writes the `syntax` schema as part of the one strategy `spacy`; see [spaCy](spacy.md).

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

The parser reuses the greedy pass’s encoded model features. It uses beam width eight and extracts at most three distinct dependency graphs. The strategy then ranks native proposals using a fixed rule:

1. Keep the greedy SOP first if it is source-complete.
2. Append up to two distinct source-complete beam SOPs in descending parser score.
3. Keep the original greedy partial if none of the circuits is complete.

The public reader retains at most two validated proposals. The earlier three-candidate policy is retained inside the fitted selector pool. Source completeness checks exact source coverage and permits incidental punctuation gaps under the shared checker. Scores rank parser hypotheses and provide no semantic guarantee.

On the [historical 250-text pilot](../../eval-results/2026-11-26-spacy-dependency-beam-pilot/README.md), the transformer beam raised the number of inputs with at least one accepted reading from 152 to 171. The number with every returned reading accepted fell from 152 to 113, and 58 inputs had a mix of accepted and rejected readings. Those judgments used projector revision `24f248b`. A client selecting the first complete candidate received 157 accepted readings and abstained 40 times on that pilot.

Use `STRATEGIES=spacy-beam` to time this strategy independently with the benchmark runner.

The deployment check compared the live public API against paired recomputation of all 250 saved dependency beams using a later, fixed projector snapshot. All candidate lists matched that recomputation in order and stayed within the cap. The later snapshot had 199 complete greedy outputs and 209 complete beam outputs. It produced the same list as the previously reviewed projector on 200 texts. Its CPU transformer public API timings were 2.47 s to open and 52.09 ms median per request, with p95 of 92.00 ms. The later snapshot has no new semantic judgments.

At projector revision `0b955a1`, the same diagnostic yielded a plausible circuit on 66.4% of texts with direct projection and 71.6% with beam projection. Every beam candidate was acceptable on 48.0%, some were acceptable on 23.6%, and none were acceptable on 28.4%.

For `focus on arrow a1`, direct projection and the first beam reading give the arrow `quantity="a1"`. Both fail independent review. Another beam reading makes `a1` the name of the arrow. It preserves the same imperative and directional relation:

```sop
@n1 nlu.clause form=imperative predicate="focus" polarity=positive
@n2 nlu.entity name="a1" compound="arrow"
@n3 nlu.relation kind=on from=$n1 to=$n2 cue="on"
```

The beam also returned an accepted appositional reading. This source counts as SOME because a quantity reading reached the caller alongside the two accepted alternatives. [Paired diagnostic with exact public circuits](../../eval-results/2026-11-26-spacy-beam-refresh-diagnostic-250/README.md)
