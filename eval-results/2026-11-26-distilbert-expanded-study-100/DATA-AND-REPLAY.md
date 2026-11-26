# Expanded native training labels and replay

Both students trained from the official DistilBERT base snapshot `12040accade4e8a0f71eabdb258fecc2e7e948be`. The source-only merged labels are under `labels/`. Their 7,040 rows comprise the previous 2,549 training sources, 4,124 accepted normal expansion sources, and 367 accepted hard-case sources. The 283 development rows and 100 study rows are exact copies of the original frozen partitions. No exact text in either set entered training. The merge also checks the diagnostic and sealed evaluation exclusion digests.

The normal label support preserves the 6,000-row source draw, original proposal shards, selected complete proposals, independent verdicts and adjudication. The hard-case support contains the remaining 451 sources routed to a teacher, 404 valid complete proposals, accepted-supervision evidence, and the prompt and native schema used by the teacher. Merge requires whole-circuit acceptance with at least two supporting reviewers and honors any dissent in an agreement audit. A verified hard candidate could pass review while failing the student codec's anchor requirement. This occurred once and is recorded in the manifest with its circuit digest. Five repeated row identifiers across revisions get a stable source-hash suffix for training. This includes two repeated identifiers already in the original 2,549 rows. Their literal texts and labels are preserved. These are internal training aliases and dataset row IDs are unchanged.

The archived support reproduced the complete train, development, study and merged manifest bytes in a separate replay directory. To regenerate from the NLU checkout:

```sh
root=eval-results/2026-11-26-distilbert-expanded-study-100
scratch=/path/to/new-scratch
checkpoint_parent=/path/to/local/checkpoints
export SOP_KNOWLEDGE_DIR=/path/to/frozen/sop-knowledge-worlds
node experiments/distilbert/expansion/merge.mjs \
  "$root/label-support/baseline" "$root/label-support/normal" "$scratch/labels" "$root/label-support/hard"
bash "$root/scripts/train-paired.sh" "$PWD" "$scratch/labels" "$scratch" "$distilbert_base" \
  "$python" "$checkpoint_parent"
bash "$root/scripts/run-studies.sh" "$PWD" "$scratch/labels" "$scratch" "$SOP_KNOWLEDGE_DIR" \
  "$python" "$checkpoint_parent"
```

Use the training and study code revisions in `provenance.json`; the merge recovery is revision `e1edb66`. The trainer uses one seed, batch size, eight-epoch budget and optimizer setting for both architecture arms, with selection by development graph-fact F1. Ownership adds its own development confidence threshold grid. GPU training is sequential. The separate study calls the public CPU reader using the frozen model and the same capped-two comparator outputs. The verdicts and exact reuse inputs are included for offline resealing.
