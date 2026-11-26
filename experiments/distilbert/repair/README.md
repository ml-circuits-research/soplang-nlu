# Draft-conditioned native SOP repair

This isolated experiment trains the existing DistilBERT v2 graph objectives using the source and a first public SOP draft encoded as anchored nodes. The training vocabulary and targets come from accepted supervision. Only the source token sequence and the draft's graph events reach inference. Dataset IDs, raw SOP strings, judgments, and additional readings are outside the model inputs.

The model embeds draft node anchors, typed literal roles with their relative owner positions, directed slot links with neighbor types and distances, and observed atom values. A learned gate adds this evidence to source token features. A trainable logit adjustment favors existing anchors initially. All v2 prediction heads remain active, so decoding may preserve, replace or delete any draft fact and propose new facts. With an empty draft the residual path leaves source features unmodified.

## Reproduction

The experiment requires the same Python environment and local official DistilBERT files as the source-only fit. Set `BASE` to the cached official snapshot at revision `12040accade4e8a0f71eabdb258fecc2e7e948be` and `PYTHON` to the Python executable. Run from the repository root:

```sh
data=/tmp/sop-native-repair-data
run=/tmp/sop-native-repair-runs/residual-v1
"$PYTHON" experiments/distilbert/repair/fit.py \
  "$data/train.jsonl.gz" "$data/dev.jsonl.gz" "$run" --base "$BASE"
SOP_NLU_DISTILBERT_PYTHON="$PYTHON" SOP_KNOWLEDGE_DIR=../sop-knowledge-worlds \
  node experiments/distilbert/repair/probe-dev.mjs \
  "$data/dev.jsonl.gz" "$run/checkpoint" "$run/dev-cpu-probe.json"
"$PYTHON" experiments/distilbert/repair/test_repair.py
```

The first fit keeps the 7,040 labels and 283 development labels of the source-only experiment. Epoch and thresholds are selected on anchored graph fact F1 on development. The development summary records the draft and edit fact precision/recall, exact match and the union of exact matches when either of the at most two readings can match. Exact structural agreement with one reference does not count as a semantic judgment.

The static CPU probe checks the full development split through the public validator. It compares original draft, single edit, and the original plus a distinct edit. It records worker startup and warm inference times; this excludes obtaining the original draft and the public validation call from the warm measurements. Selection never uses this probe or the diagnostic study. The checkpoints are separate from source-only DistilBERT and use a separate manifest format.

## Experimental worker

Run `python infer.py CHECKPOINT --device cpu` to open a JSONL session. After loading it emits one readiness message. Send `{id,text,tokens,draftNodes}`. Source coordinates are UTF-16 character offsets, and draft spans are half-open token intervals. The worker responds `{id,nodes}` or `{id,error}`. Render and verify proposals in the ordinary public adapter before consuming them. This directory does not register a public strategy.

## Paired CPU study

The experimental reader obtains the selector's two public readings from the current text. It sends the first reading to the editor. If the edit passes the full source gate and differs structurally from both originals, it occupies the second slot alongside a complete first draft. When the first draft is incomplete, the eligible edit goes first. Otherwise the original readings are preserved. The comparison preserves directed semantic roles and sequence member order, and ignores wire names and line order. Engine and transport errors fail the study. This policy was fixed before evaluating the study texts.

Run the paired source study with the existing DistilBERT study command and append `selector-repair` after the checkpoint argument. CPU request times include live proposal generation, editing and validation. The ordinary blind review and study scoring commands accept the resulting pool.
