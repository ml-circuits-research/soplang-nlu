# Selector with a DistilBERT alternative

Import `selectorDistilBert` from `soplang-nlu/strategies/selector-distilbert` and pass it to `createReader`. Configure the selector's dependency parsers as for `neuro-selector`. Configure the trained DistilBERT checkpoint with `graphOptions.modelPath`, its Python interpreter with `graphOptions.python`, and optionally select `graphOptions.device`. The ordinary DistilBERT environment variables also apply.

Each provider sees the same original source. The first selector reading is retained. A distinct source-complete native DistilBERT graph takes the second slot if available. Otherwise the selector keeps its original alternatives. Structural equality ignores wire naming and presentation order and preserves directed slot links. A consumer may request just one reading through the public reader API.

The frozen ownership checkpoint trained on 7,040 texts and its reproduction evidence are in the expanded DistilBERT study. The paired historical 250-source CPU diagnostic yielded 81.2% at least one plausible reading, comprising 48.4% wholly accepted and 32.8% mixed public sets. The same selector without the extra provider achieved 78.0%. The prospective 1% benchmark evaluates this policy on previously reserved exact texts.
