# Published native circuits as training labels

The first snapshot contains 8,160 distinct training texts. It starts with 7,040 existing training texts, revisits 4,359 overlapping labels using independently verified curator readings, and adds 1,120 new texts. An additional 58 new texts were reserved for calibration. For new texts, the calibration split uses the SHA-256 of a fixed salt and the exact text. It stays stable as new shards arrive. The previous dev, diagnostic and study sources and the reserved random 1% remain excluded from training. Three published texts matched an exclusion.

Each curated reading is checked against its committed audit digest and exact source/circuit identity. The builder repeats the current static gate after source alignment and after rendering the encoded nodes. Two unanchorable readings were skipped. Training uses the first encodable curated graph per text. An auxiliary file retains both graphs for each of 246 training texts with two encodable alternatives. Source-only baseline training and study files retain their original split.

From the repository root, set the input directory to the frozen 7,040-row expansion and run:

```sh
node experiments/distilbert/expansion/from-curation.mjs "$BASE" ../webmeet-dataset c3771687c9ed5db222c8897647bf479762f9b340 "$NEW_OUTPUT"
```

The manifest records the compressed file digests. This snapshot measures available supervision. Its row counts do not measure inference quality.
