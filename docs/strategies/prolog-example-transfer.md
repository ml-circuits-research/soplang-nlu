# Prolog example transfer

This separately named strategy learns reusable formalisation patterns from labelled texts. The symbolic Prolog engine generates candidates using the configured worlds. Learned patterns can propose additional candidates when their anchors and slots match the current utterance. Report distinct candidates so that repeating an existing symbolic reading cannot improve the score.

## Training boundary

Freeze a test sample from a committed WebMeet revision first. Read the training corpus from that same revision. Exclude every row with a held-out text key, across all files and columns. The key uses Unicode NFKC, lowercase, trimmed ends and collapsed whitespace. Keep the original text for formalisation and use every populated SOP column as an independent training reference. The benchmark verifies that the intersection of the final training keys and evaluation keys is empty. Similar sentences can still occur on both sides of this text-level split.

Train a new artifact for the split. Preserve the dataset revision, training and evaluation fingerprints, excluded row count, training time and induction statistics in the run history. A new holdout requires a corresponding training split. Evaluation workers receive the trained artifact and the input text. The evaluator compares the resulting whole circuits against each reference, independently of ordering.

Report training cost alongside startup, inference latency, throughput and total wall time. Use the same input messages, world installation, worker count and grading rules for the two symbolic strategies and the example-trained strategy. The paired comparison shows when training adds an acceptable interpretation and when it adds extra incorrect alternatives.
