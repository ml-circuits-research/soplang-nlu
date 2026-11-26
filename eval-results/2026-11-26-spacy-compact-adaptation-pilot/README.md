# Compact spaCy adaptation pilot

On the fixed 250-row historical diagnostic, adapting the compact dependency model improved wholly acceptable standalone outputs from **44.4% to 51.2%**. The mapper was identical at `24f248b`. The adapted model gained 28 inputs and lost 11. This is a controlled historical development measurement. The sealed fresh 1% supplied only an in-memory exclusion set for training selection.

| Compact model | NONE | SOME | ALL / ANY | Full material source coverage | Serial parser + mapper p50 / p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Off the shelf | 55.6% | 0.0% | 44.4% | 68.0% | 2.00 / 4.03 ms |
| Adapted | 48.8% | 0.0% | 51.2% | 69.2% | 1.97 / 3.57 ms |

Both runs emitted one public candidate per input and finished with zero reader errors. Of the 250 paired inputs, both succeeded on 100 and neither on 111. Source coverage changed on 45 inputs, with 24 gains and 21 losses. Dependency hashes changed on 173 inputs and emitted candidate strings on 156. The timing rows come from the separate one-worker inference files. Archive data include exact paired IDs and all changed readings.

| Compact model | L1 | L2 | L3 | L5 | L6 | L8 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Off the shelf | 12.4% | 32.0% | 9.6% | 0.0% | 1.6% | 44.4% |
| Adapted | 5.6% | 30.8% | 11.2% | 0.4% | 0.8% | 51.2% |

Other levels are zero. L2 is the static material-coverage failure. The baseline's 250 source and dependency hashes, emitted circuits and static checks exactly match its earlier blind historical judgments. The adapted run reapplied that gate and reused 111 exact source-and-circuit judgments. Two blinded reviewers assessed the 62 novel eligible circuits. The third reviewer settled 12 acceptance disagreements and contradicted one of 40 sampled agreements. No downstream vote was used for model selection.

The adapted circuit correctly separates creation, linking and the final appreciation in “Hey, create a diamond labelled Q1 plan; then link Q1 plan to Hiring. That would help.” It also recovers scheduling and calendar-creation readings that were previously incomplete or had wrong participant attachments. A regression on “can you draw what I described please” marks the embedded reading with the wrong clause form. Exact wires and rationales for gains and losses are in `comparison.json.gz`.

## Training and repeatability

The fixed hash selection used dataset revision `38ae0b563db2392bd7bfc5d11f6c2e9f4a0339bf`. It excluded all exact texts in the historical 1% and the locked fresh 1%, then deduplicated training texts. All 600 selected sources use distinct texts. Their split is 510 training and 90 validation. The original dataset reference cells are absent from teacher packets, training annotations and runtime. The teacher processed transformer graphs for the selected sources, editing 733 tokens across 291 graphs. All 600 validated and none needed an unchanged fallback.

Starting from spaCy `en_core_web_sm` 3.8.0, the fixed-seed optimizer updated the shared Tok2Vec encoder, tagger and dependency parser. Existing tokenizer, lexical pipeline, and label vocabulary were preserved. The best checkpoint was epoch eight, the configured cap, selected on the 90-row teacher-derived validation set. Validation labeled attachment rose from 77.18% to 83.50%, head accuracy from 82.04% to 86.28%, and fine-tag accuracy from 91.90% to 94.76%. These measure agreement with the corrected training teacher on the validation split. The paired native circuit review above is the separate downstream measure.

The checkpoint is available locally at `/tmp/wm-spacy-adaptation/adapted-model`. Its deterministic archive at `/tmp/wm-spacy-adaptation/adapted-model.tar.gz` has SHA-256 `bc6c85720a645bd778c6e51a100e860aabdc0fcba1931f99d714f712dcc0d467`. The tree digest is `2298446ab5c99432f4fb090bf4ec1ab8df6f620afb5aee328d35fa8a8b62f73a`. Every checkpoint file hash was reproduced by an independent rerun with the same seed and corrected data. The per-file hashes and validation history are in `training/training-summary.json`. The checkpoint holds model weights and ordinary spaCy pipeline data and is external to the repository.

The commands and training implementation are in the [experiment directory](../../experiments/spacy-adaptation/README.md). Training data and reviewer evidence in this archive are used for offline verification and retraining.
