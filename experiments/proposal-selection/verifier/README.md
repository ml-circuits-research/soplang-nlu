# Whole-circuit plausibility verifier

This experiment ranks existing local proposals. The cross-encoder receives the current text and a deterministic description of each candidate, including the directions of its role links. The model receives no source identifier, prior vote, reference, strategy name, or rank. Literal case and spelling are preserved in the input to the tokenizer. The optional English MiniLM tokenizer is uncased. Descriptions can be ambiguous for repeated identical heads; they are features of the verifier, and the actual returned SOP is always the original candidate.

Training joins human-readable graphs to blind votes by the exact source/circuit SHA-256. It requires two supporting judgments and excludes audited contradictions. Each development text, diagnostic text and reserved 1% text is excluded before training. The verifier's own 10% development split groups all readings of the same text. Identical model inputs count once; ambiguous inputs with contradictory labels are discarded. Training combines binary cross-entropy and within-text pairwise ranking loss. The best checkpoint has the highest within-source ranking on development, with binary cross-entropy breaking ties. The model uses at most 512 input wordpieces. Long graphs can lose detail at this limit.

On the untouched-by-this-verifier historical 250-source diagnostic, evaluate the two highest scores and the original selector's first eligible proposal plus the highest distinct alternative. Structural deduplication preserves directed roles and sequence ordering. Training and inference accept separate inputs. Evaluation labels are read only after scoring.

```sh
node experiments/proposal-selection/verifier/prepare.mjs "$CURATED_BASE" "$EXPANSION" "$DATA"
python experiments/proposal-selection/verifier/fit.py "$DATA" "$MINILM" "$OUTPUT"
node experiments/proposal-selection/verifier/pack-diagnostic.mjs "$PROVIDER_DIAG" "$PAIRED_DIAG" "$INPUTS" "$LABELS"
python experiments/proposal-selection/verifier/predict.py "$OUTPUT/checkpoint" "$INPUTS" "$SCORES"
python experiments/proposal-selection/verifier/score.py "$INPUTS" "$SCORES" "$LABELS" "$REPORT"
```
