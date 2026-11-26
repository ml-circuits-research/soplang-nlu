# Optional compact spaCy adaptation pilot

This experiment fine-tunes the shared English spaCy compact parser. It leaves the production strategy and dependency loader unchanged. The adapted checkpoint is an ordinary local spaCy pipeline. It uses learned weights at runtime and has no example retrieval or reference circuits.

Use Node 22, Python 3.12, spaCy 3.8.16 and compatible English compact and transformer models at version 3.8.0. Preserve single-thread execution when reproducing timings and training. The artifact directory must be empty when initializing selection. Only allowed source records are written or sent to the teacher. The fresh exclusion cohort is computed in memory from the pinned benchmark revision and seed with the same hash rank and rounding as the benchmark runner. No fresh cohort inputs are emitted.

```sh
nlu=/path/to/soplang-nlu
workspace=/path/to/sopworlds
artifacts=/path/to/new-artifact-directory
exp="$nlu/experiments/spacy-adaptation"
historical="$nlu/eval-results/2026-11-26-native-nlu-paired/sample.json.gz"
compact=/path/to/en_core_web_sm-3.8.0
transformer=/path/to/en_core_web_trf-3.8.0
compact_python=/path/to/spacy-compatible-python
transformer_python=/path/to/transformer-compatible-python
export OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1
node "$exp/select.mjs" "$workspace/webmeet-dataset" "$historical" "$artifacts"
SOP_NLU_SYNTAX_PYTHON="$transformer_python" node "$exp/graphs.mjs" "$artifacts" "$transformer"
"$compact_python" "$exp/teacher.py" "$artifacts" "$compact"
"$compact_python" "$exp/train.py" "$artifacts" "$compact"
```

Teacher calls require an authenticated local Codex CLI with the reviewer model available. The reviewer receives literal source and its transformer graph without references, original dataset row IDs or split. Fine-tag edits provide the POS supervision. Coarse tags in the input packets are context, and the student's pretrained attribute ruler continues to derive its runtime coarse POS. The parser accepts only existing dependency and Penn tags. Corrections preserve token text, indices, root semantics and acyclicity. Validation split membership comes only from deterministic source selection.

The archived pilot includes the already corrected teacher graphs. Copy that file into a new artifact directory and run only the training command to reproduce the checkpoint without repeating model judgment. The model directory includes the original tokenizer, lexical data, lemmatizer, and attribute ruler. The optimizer updates Tok2Vec, the tagger and the transition-based parser. Labeled attachments select the checkpoint using only the 90 selected validation rows, with exact fine-tag then head accuracy breaking ties. The maximum is eight epochs with patience two.

For a paired downstream run, check out the projector at `24f248b`. Use the SHA250 selection archived with this pilot and the historical refresh inference directory. Nothing in the downstream set enters training.

```sh
projector=/path/to/isolated-24f248b-checkout
archive="$nlu/eval-results/2026-11-26-spacy-compact-adaptation-pilot"
historical_run="$nlu/eval-results/2026-11-26-spacy-direct-historical-refresh-one-percent/compact"
node "$exp/diagnostic-sample.mjs" "$archive/diagnostic-selection.json" "$historical_run/inference" "$artifacts/diagnostic"
mkdir -p "$artifacts/baseline" "$artifacts/adapted"
export SOP_NLU_SYNTAX_PYTHON="$compact_python"
export SOP_KNOWLEDGE_DIR="$workspace/sop-knowledge-worlds"
node "$projector/tests/benchmark/model-matrix.mjs" "$artifacts/diagnostic" "$artifacts/baseline/inference" "$compact" spacy-direct
node "$projector/tests/benchmark/model-matrix.mjs" "$artifacts/diagnostic" "$artifacts/adapted/inference" "$artifacts/adapted-model" spacy-direct
"$compact_python" "$exp/verify-baseline.py" "$artifacts" "$historical_run"
review="$artifacts/adapted/review"
node "$projector/tests/benchmark/meaning-review/prepare-native.mjs" "$artifacts/adapted/inference" "$review" "$SOP_KNOWLEDGE_DIR" spacy-direct
node "$projector/tests/benchmark/meaning-review/review-public-candidates.mjs" plan "$review"
bash "$exp/review-adapted.sh" "$artifacts" "$nlu" "$projector"
"$compact_python" "$exp/compare.py" "$artifacts"
```

The [result archive](../../eval-results/2026-11-26-spacy-compact-adaptation-pilot/README.md) records the exact checkpoint checksums, training corpus provenance, blind votes and paired outcomes.

## Frozen transformer follow-up

The [paired transformer-head archive](../../eval-results/2026-11-26-spacy-transformer-head-adaptation-pilot/README.md) uses the original corrected-graph artifact and the same 510/90 split. Copy only `training/corrected-graphs.json.gz` from the compact pilot into a new artifact directory, then run:

```sh
"$transformer_python" "$exp/train-transformer-heads.py" "$artifacts" "$transformer"
```

This trains the tagger and parser through their original listeners, using cached forward activations and a no-op gradient callback at the encoder boundary. Epoch zero stays in the validation selection. The published checkpoint copies the pretrained encoder files byte for byte. Cached predictions and the reloaded standard pipeline must agree on all 90 validation inputs.

Reuse the downstream commands above with both model invocations using the transformer-compatible Python, the pretrained transformer path for baseline, and the new checkpoint for adapted. For baseline evidence, use the `transformer` model directory of the historical refresh with `verify-baseline.py` and `diagnostic-sample.mjs`. To match the follow-up's exact vote reuse, put the three absolute archive paths below in `$artifacts/exact-prior-directories.txt`, one path per line. Historical direct decisions are included by the review script after these archives.

```text
$nlu/eval-results/2026-11-26-spacy-compact-adaptation-pilot/adapted/review
$nlu/eval-results/2026-11-26-neuro-prolog-historical-diagnostic-250/review
$nlu/eval-results/2026-11-26-spacy-beam-refresh-diagnostic-250/review
```

After scoring, `compare-unions.py` takes the follow-up artifact directory and the `eval-results` directory and verifies all compared source IDs and texts before measuring accepted-circuit availability.
