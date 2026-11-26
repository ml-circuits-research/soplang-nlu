# DistilBERT

The optional `distilbert` reader runs a fine-tuned DistilBERT graph model in a persistent local Python worker. It sends the original text and token boundaries and receives native NLU nodes, source spans and reference links. The Node adapter emits the returned graph as SOP. The public reader checks schema and source grounding against the full original input.

Install the Python dependencies for the trained worker and provide its local checkpoint directory. The Python worker is the sole source of graph predictions.

```js
import {createReader} from 'soplang-nlu'
import {distilBert} from 'soplang-nlu/strategies/distilbert'

const reader = await createReader({
  strategy: distilBert,
  knowledgeDir: '/path/to/sop-knowledge-worlds',
  python: '/path/to/python',
  modelPath: '/path/to/distilbert-checkpoint',
  device: 'cpu'
})
try {
  const result = await reader.propose('Draw a red circle.')
  console.log(result.candidates)
} finally {
  await reader.close()
}
```

`SOP_NLU_DISTILBERT_PYTHON`, `SOP_NLU_DISTILBERT_MODEL` and `SOP_NLU_DISTILBERT_DEVICE` configure the same options. The device may be `auto`, `cpu` or `cuda`. The checkpoint is required. The reader serializes requests to its worker, which returns at most one graph per input. An empty response is reported as `no-graph`. A valid graph with material source gaps remains partial in the shared source check.

Select `STRATEGIES=distilbert` to benchmark this reader explicitly. It is absent from the default benchmark list.
