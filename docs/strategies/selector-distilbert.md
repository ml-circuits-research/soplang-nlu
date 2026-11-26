# Selector with a DistilBERT alternative

Import `selectorDistilBert` from `soplang-nlu/strategies/selector-distilbert` and pass it to `createReader`. Configure the selector's dependency parsers as for `neuro-selector`. Configure the trained DistilBERT checkpoint with `graphOptions.modelPath`, its Python interpreter with `graphOptions.python`, and optionally select `graphOptions.device`. The ordinary DistilBERT environment variables also apply.

```js
import {createReader} from 'soplang-nlu'
import {selectorDistilBert} from 'soplang-nlu/strategies/selector-distilbert'

const reader = await createReader({
  strategy: selectorDistilBert,
  knowledgeDir: '/path/to/sop-knowledge-worlds',
  graphOptions: {
    python: '/path/to/python',
    modelPath: '/path/to/ownership-checkpoint',
    device: 'cpu'
  }
})
try {
  const {candidates} = await reader.propose('Draw a red disc beside the blue star.')
  console.log(candidates.map(({sop}) => sop))
} finally {
  await reader.close()
}
```

Each provider sees the same original source. The strategy retains the first selector reading and fills the second slot with a distinct source-complete native DistilBERT graph when available. If the graph has a component detached from every clause, a complete connected selector alternative keeps the slot. Structural equality ignores wire naming and presentation order and preserves directed slot links. A consumer may request just one reading through the public reader API. A provider failure during a request leaves the other provider's readings available and records the error in `analysisDiagnostics.providerErrors`.

The frozen ownership checkpoint trained on 7,040 texts and its reproduction evidence are in the expanded DistilBERT study. The paired historical 250-source CPU diagnostic yielded 81.2% at least one plausible reading, comprising 48.4% wholly accepted and 32.8% mixed public sets. The same selector without the extra provider achieved 78.0%. The prospective 1% benchmark evaluates this policy on previously reserved exact texts.

The [11,148-text study](../../eval-results/2026-11-26-curated-graph-training/ownership-11148/) describes the enlarged checkpoint. Use the [supplemental selection manifest](../../eval-results/2026-11-26-prospective-ownership-one-percent/supplemental-selection.json) to verify the checkpoint files for the reserved comparison. Checkpoint weights are installed separately from the JavaScript package.
