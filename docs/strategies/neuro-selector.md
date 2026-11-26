# Neuro-Selector

`neuro-selector` uses a fitted model to rank source-complete SOPs from four public proposal families. Two run the base and adapted transformer dependency beams, one runs the adapted compact direct projector, and one runs Neuro-Prolog. Neuro-Prolog uses the greedy dependency graph from the base beam request.

Set the dependency model variables described in [proposal collection](../../experiments/proposal-selection/README.md) and provide `SOP_KNOWLEDGE_DIR`. Set `SOP_NLU_SELECTOR_MODEL` to a fitted `sop-proposal-ranker-v1` JSON file, or install it as `strategies/neuro-selector/model.json`. The reader accepts `selectorModelPath` as an explicit override.

```js
import {createReader} from 'soplang-nlu'
import {neuroSelector} from 'soplang-nlu/strategies/neuro-selector'

const reader = await createReader({strategy: neuroSelector, knowledgeDir: '/path/to/sop-knowledge-worlds'})
try {
  const result = await reader.propose('Move the circle beside the square.')
  console.log(result.candidates)
} finally {
  await reader.close()
}
```

The ranker sees current source and circuit features, including agreement across proposal families. It deduplicates exact SOPs and applies the fitted candidate cap and similarity policy. Every output is an unchanged proposal from one or more families. If the pool has no source-complete reading, the strategy returns an empty candidate list with status `no-eligible`. Selector scores rank readings and do not guarantee their meaning.

Run the benchmark with `STRATEGIES=neuro-selector` to measure this strategy explicitly. It loads two transformer models and one compact model per worker.
