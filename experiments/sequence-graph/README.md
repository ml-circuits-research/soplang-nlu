# Source-pointer sequence model

This experiment tests whether predicting a whole ordered graph can recover choices about clause boundaries and directed links that independent prediction heads miss. It fine-tunes the local official FLAN-T5-small checkpoint. The optional Python worker receives the current text and its original tokens. The native SOP renderer copies quoted evidence from those tokens.

Each input token is preceded by its position. Output symbols describe a wire type, a source interval, an atom or a directed edge. The encoder and decoder share the same position symbols. Wire order is canonicalized by source anchor and type. Repeated sequence members retain their relative order. The vocabulary comes exclusively from training labels. The decoder cannot emit arbitrary quoted text. An ill-formed graph, an unfinished sequence, or a text longer than the 100 available position markers produces no reading. The public grounding and schema checks run on rendered circuits.

The first experiment uses the 8,160-text native snapshot, the fixed 283-text development split and the same 100-text paired study as the earlier heads. Each checkpoint is selected by lowest development token loss before the study. Whole-reading plausibility requires separate independent review. CPU latency includes autoregressive decoding.

```sh
python experiments/sequence-graph/fit.py "$DATA/train.jsonl.gz" "$DATA/dev.jsonl.gz" "$BASE" "$OUTPUT"
node experiments/distilbert/study.mjs "$DATA/study.jsonl.gz" "$BASELINE" "$STUDY" "$SOP_KNOWLEDGE_DIR" "$PYTHON" "$OUTPUT/checkpoint" sequence-graph
```
