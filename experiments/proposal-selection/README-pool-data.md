# Frozen proposal pools and blind labels

The collector emits source-only candidates from the four specified model families. The training experiment selects 600 distinct new literal sources. The first 500 by the sealed hash order form the training split, and the last 100 form validation. The separately frozen historical diagnostic contains 250 sources and is excluded from model fitting. The train source selection excludes all exact texts in the earlier model adaptation data, the historical 1% and the locked fresh 1%. Fresh texts are computed in memory for exclusion and never exported.

The archive includes the source arrays and exact input hashes used by the collector. For a new replay directory, prepare sources at the pinned dataset revision with the historical archive, earlier adaptation source archive and SHA250 manifest. Each model-input array contains only `id` and `text`.

```sh
nlu=/path/to/soplang-nlu
workspace=/path/to/sopworlds
base=/path/to/new-output-directory
exp="$nlu/experiments/proposal-selection"
archive="$nlu/eval-results/2026-11-26-neuro-selector-proposal-pools"
node "$exp/select-sources.mjs" \
  "$workspace/webmeet-dataset" \
  "$nlu/eval-results/2026-11-26-native-nlu-paired/sample.json.gz" \
  "$nlu/eval-results/2026-11-26-spacy-compact-adaptation-pilot/training/training-sources.json.gz" \
  "$archive/diagnostic-selection.json" "$base"
for cohort in train diagnostic; do
  gzip -dc "$base/$cohort/sources.jsonl.gz" | jq -cs . | gzip -nc >"$base/$cohort/sample.json.gz"
done
```

Pin the projector, model files, knowledge and collector to the revisions and hashes in the archive. The environment variables used by the collector are `SOP_KNOWLEDGE_DIR`, `SOP_NLU_SYNTAX_PYTHON`, `SOP_NLU_SYNTAX_MODEL`, `SOP_NLU_ADAPTED_TRF_MODEL`, `SOP_NLU_COMPACT_PYTHON`, `SOP_NLU_COMPACT_MODEL`, and `SWIPL`. Use compatible pretrained and adapted local model directories. The benchmark CPUs used single-thread transformer execution.

```sh
for cohort in train diagnostic; do
  node "$exp/collect.mjs" "$base/$cohort/sample.json.gz" "$base/$cohort/pool.jsonl.gz"
done
bash "$exp/review-cohort.sh" "$nlu" "$base/train" 10
bash "$exp/review-cohort.sh" "$nlu" "$base/diagnostic" 6 /path/to/prior-review-dir
for cohort in train diagnostic; do
  node "$exp/verify-pool.mjs" "$base/$cohort" "$SOP_KNOWLEDGE_DIR"
done
python3 "$exp/summarize-pool.py" "$base"
```

The optional prior review paths must hold compatible candidate-level `candidate-decisions.jsonl.gz` transcripts. The exact diagnostic reuse order is recorded in the archive. The review runner deduplicates exact source and normalized SOP circuit identities. Blind reviewers see singleton literal circuits without family, rank, dataset references or splits. Sol and Terra review novel targets independently. A separate Sol process resolves disagreements and audits a deterministic sample of up to 20 in each agreement stratum. Consensus audits are recorded for judgment sensitivity, while the primary consensus supplies the default label.

Publication provides one boolean vote per literal eligible `(id, sop)` pair. Ineligible public candidates remain in the pool with `eligible: false`. The verifier reapplies the native source gate and checks vote set equality, source ordering, valid family names and contiguous original ranks. This experiment releases evidence and labels. Candidate ranking and final held-out evaluation use separate workflows.
