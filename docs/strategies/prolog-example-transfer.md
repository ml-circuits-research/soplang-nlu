# Prolog example transfer

This separately named strategy learns reusable formalisation patterns from labelled texts. The symbolic Prolog engine generates candidates using the configured worlds. Learned patterns can propose additional candidates when their anchors and slots match the current utterance. Report distinct candidates so that repeating an existing symbolic reading cannot improve the score.

## Native NLU output

The strategy starts with the symbolic SWI-Prolog analyses. Learned templates match through a separate Prolog worker. A supported template can supply additional semantic classifications for a syntactic reading. Each resulting integrated circuit still passes the same schema and literal-source checks. Generating more candidates improves a message-level grade only when one of them provides a better whole reading. The benchmark records the zero-overlap training split separately from generation time.

## Training boundary

Freeze a test sample from a committed WebMeet revision first. Read the training corpus from that same revision. Exclude every row with a held-out text key, across all files and columns. The key is the original text. Case, whitespace and Unicode code points remain significant. Keep the original text for formalisation and use every populated SOP column as an independent training reference. The benchmark verifies that the intersection of the final original training texts and evaluation texts is empty. Similar sentences can still occur on both sides of this text-level split.

Train a new artifact for the split. Preserve the dataset revision, training and evaluation fingerprints, excluded row count, training time and induction statistics in the run history. A new holdout requires a corresponding training split. Evaluation workers receive the trained artifact and the input text. The evaluator compares the resulting whole circuits against each reference, independently of ordering.

Report training cost alongside startup, inference latency, throughput and total wall time. Use the same input messages, world installation, worker count and grading rules for the two symbolic strategies and the example-trained strategy. The paired comparison shows when training adds an acceptable interpretation and when it adds extra incorrect alternatives.
