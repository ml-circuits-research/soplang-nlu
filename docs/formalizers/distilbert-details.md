[Home](../README.md) › [Formalizers](README.md) › [DistilBERT](distilbert.md) › Details

# DistilBERT: model, output stage, options, checkpoints

This page: the exact facts of the DistilBERT formalizer: its options, what the model predicts, the rules of its output stage, the options of the training tool, and the checkpoints trained so far. Kind: Reference.

The code described is that of commit `97a1b83`. The output stage (`circuit.mjs`) last changed in `9ae0e6f`; the training tool (`retrain.mjs`) in `e52bfc8`.

## Strategy options

The strategy's `open` takes these options. The first three can also be given as environment variables.

| Option | Meaning |
| --- | --- |
| `python` | The Python interpreter, with `torch` and `transformers`. Variable `SOP_NLU_DISTILBERT_PYTHON`. Default `python3`. |
| `modelPath` | The checkpoint folder. Variable `SOP_NLU_DISTILBERT_MODEL`. Default `.local-models/distilbert/syntax-v1/checkpoint`, when it exists. |
| `device` | `auto` (the GPU when there is one), `cpu` or `cuda`. Variable `SOP_NLU_DISTILBERT_DEVICE`. Default `auto`. |
| `nodeThreshold` | How sure the model must be of a wire. Default: the value chosen at training, stored in the checkpoint's `manifest.json`; 0.5 when none is stored. |
| `tie` | How sure the model must be of an optional tie. Default as for `nodeThreshold`. |
| `timeoutMs` | How long to wait for an answer of the worker. Default 120000 (two minutes). |
| `workerPath` | The Python worker. Default `syntax_worker.py`. |

`analyse(text)` returns `{analyses: [{sop}]}` with one circuit, or `{analyses: [], error}`. The strategy sends the worker one request at a time.

## What the model predicts

The model reads the tokens of the message: its words (those of `wordsOf(text)`) and, between them, every punctuation mark as a token of its own. For these tokens it predicts:

| Prediction | Meaning |
| --- | --- |
| Nodes | One for every wire, standing at a word: a clause at its verb, a nominal at its head, a relation at its marker, a coordination at its conjunction. A wire with no such word stands at the word of what it holds: a relation with no marker at its end, a clause with no word at its first nominal. |
| Owners | For every word, the node and the key that hold it: `verb`, `auxiliary`, `negation`, `modifier`, `discourse`, `head`, `dependent`, `marker` or `conjunction`. A punctuation mark has no owner. |
| Edges | The references between nodes: `subject`, `complement`, `ellipsis`, `from`, `to`, `conjunct`. |
| Atoms | The `form` of a clause, and `attachment=ambiguous` on a relation. |

The keys, the types a reference may point to and the values of the atoms are read from `schemas/syntax/schema.sop`.

The files, all in `strategies/distilbert/`:

| File | Content |
| --- | --- |
| `targets.mjs` | The tokens; the schema as the model needs it; `encodeCircuit(text, sop)`, which turns a circuit into training targets. |
| `syntax_model.py` | The encoder and the prediction heads; the loss; the prediction. |
| `syntax_worker.py` | The worker: one JSON line per message in, one line with the prediction out. |
| `syntax_train.py` | The training loop, started by `retrain.mjs`. |
| `circuit.mjs` | The output stage: from a prediction to wires, written with `writeCircuit`. |
| `index.mjs` | The strategy. |
| `retrain.mjs` | The training tool. |

## What the output stage does by rule

The model names the wires, the key of every word and the ties. The output stage only keeps the circuit within the schema where the model's first choices do not fit together, each time by taking the model's next choice. No rule names a word.

1. Every word takes the first of its ranked places whose wire still stands. A punctuation mark gets no place.
2. A nominal with no word, a relation without two different ends, and a coordination without two conjuncts of one type do not stand. The two ends of a relation are the pair of different wires the model ranks highest. A coordination takes the conjuncts the model is sure of, and at least its best two.
3. A clause has one verb and a nominal one head, each a run of neighbouring words. A second run becomes a `modifier` or a `dependent`. A nominal with no head word takes the word the model ranks highest as its head, else its last word.
4. An optional tie (`subject`, `complement`, `ellipsis`, `conjunct`, `attachment=ambiguous`) is written from the threshold `tie` on. `attachment=ambiguous` is written only on a relation that starts at a clause, as the schema says.
5. Two wires that hold the same wires are one wire. Of two relations between the same two wires, one that has no word is dropped.
6. A nominal that nothing holds takes the tie the model ranks highest for it, below the threshold too. With no such tie it is a complement of the clause in which it stands. A message with no clause gets a fragment.
7. The form of a clause agrees with whether it has a verb: with a verb, the most probable form other than `fragment`; without one, `fragment`.
8. A word with no place left is a `dependent` when it stands inside a nominal, else a `discourse` word of its clause.
9. `dependent`, `modifier`, `auxiliary`, `negation` and `discourse` hold one word per value; neighbouring `marker` or `conjunction` words are one value.

## Training tool options

`node strategies/distilbert/retrain.mjs` trains a checkpoint. The steps to run it are in [Retrain the DistilBERT model](../guides/retrain-distilbert.md).

| Option | Meaning |
| --- | --- |
| `--syntactic` | The folder of the dataset's syntactic files. Default `../webmeet-dataset/syntactic`. |
| `--no-agreement` | Leave out the agreement labels. |
| `--silver` | `<file>[=<weight>]`: a further file of `{text, sop}` lines. Default weight 0.3. Can be repeated. A message that is also gold is left out of it. |
| `--exclude` | A JSON array or JSON Lines file of `{text}`: these messages are left out altogether (used to hold out the benchmark). |
| `--out` | Where the result goes. Default `.local-models/distilbert/syntax-v1`. An existing checkpoint is kept unless `--overwrite` is given. |
| `--seed` | Default 20261127. |
| `--epochs` | The largest number of epochs. Default 20. |
| `--device` | `cuda` (the default here) or `cpu`. |
| `--python` | The interpreter; else `SOP_NLU_DISTILBERT_PYTHON`, else `python3`. |
| `--base` | The base model. Default `distilbert-base-uncased`, read from the local Hugging Face cache; nothing is downloaded. |
| `--tune` | No training: choose the two thresholds again for the checkpoint in `--out`. |
| `--gold` | Refused. The gold data are read from the syntactic files. The labels file it once named (`annotations/syntax/v1/labels.jsonl`) was removed in dataset commit `95e7739`. |

What the tool does:

1. **Reads the labels.** Rows accepted by a judge, or written by one, are gold (weight 1). Rows settled by agreement are silver (weight 0.3).
2. **Splits off development messages.** A gold message is a development message when the first 8 hex digits of the SHA-256 of the seed and its text, taken as a number, divide by 10: about one in ten. A message stays on its side when the labels grow.
3. **Turns every circuit into targets** and writes them to `<out>/data/`. A circuit that is not valid, or that the output stage cannot write back as a valid circuit, is counted and left out.
4. **Trains** with `syntax_train.py`. After every epoch the model's first choices are compared with the targets of the development messages; the best epoch is kept.
5. **Chooses the two thresholds** on the development messages, with the output stage itself. Each is tried at 0.3, 0.4, 0.5, 0.6 and 0.7. Among the pairs within one message in a hundred of the best, the pair nearest to 0.5 is written into the checkpoint's `manifest.json`.
6. **Writes `<out>/training-summary.json`**: data sizes, seed, epochs, development results and the thresholds tried.

## Checkpoints

History only; current scores are in [STATUS](../STATUS.md#the-benchmark-live). All start from `distilbert-base-uncased` with seed 20261127, in `.local-models/distilbert/`. Development results of different checkpoints are not directly comparable: their development sets differ.

### syntax-v1 ("gold-only")

| Item | Fact |
| --- | --- |
| Trained on | 2,328 labels (the labels file at dataset `7be6e99`): 2,103 training, 225 development. 20 epochs. |
| Held out | Nothing excluded. |
| Measured in | `eval-results/2026-11-27-distilbert-syntax-training/gold-only.summary.json`: 121 of 225 development circuits equal the label. GPU 4.1 ms median, CPU 61.5 ms median per message (598 messages of round 2). |

### syntax-v1-without-round-02

| Item | Fact |
| --- | --- |
| Trained on | The same labels without round 2: 1,560 training, 170 development. 19 epochs selected. |
| Held out | The 598 messages of conversion round 2. |
| Measured in | `gold-only-without-round-02.summary.json` in the same folder. |

### syntax-v1-silver

| Item | Fact |
| --- | --- |
| Trained on | The 2,328 labels as gold, plus 58,103 agreement circuits of the batch conversion as silver (weight 0.3). At most 6 epochs, 5 selected. |
| Held out | Nothing. The silver file holds 576 of the 1,831 benchmark messages. |
| Measured in | Its `training-summary.json`, which git ignores. Most probably the checkpoint of the first judged benchmark run (`9f57aa3`); which one ran is not recorded. |

### syntax-v2

| Item | Fact |
| --- | --- |
| Trained on | The labels of the syntactic files: 3,294 gold training rows, 356 development, 56,671 agreement rows. 6 of at most 6 epochs selected. Model and output stage of `9ae0e6f`; the training tool reads the syntactic files since `e52bfc8`. |
| Held out | The benchmark messages (1,482 gold and 263 agreement rows excluded). |
| Measured in | Benchmark run `87a221e`, verdicts in packets 36–42 (`5c87955`). |

### syntax-v3

| Item | Fact |
| --- | --- |
| Trained on | The grown syntactic files: 3,670 gold training rows, 404 development, 77,800 agreement rows. 5 of at most 6 epochs selected. |
| Held out | The benchmark messages (1,482 gold and 263 agreement rows excluded). |
| Measured in | Commit `6af9b97`: 498 new circuits judged, packets 48–50. |

The sizes of `syntax-v2` and `syntax-v3` come from their `training-summary.json` files, which git ignores.

## Measuring a checkpoint

`eval-results/2026-11-27-distilbert-syntax-training/measure.mjs <name> <training folder>` runs a checkpoint through the common reader. It reports the valid circuits and those equal to the gold circuit on the development messages; on the 598 messages of round 2, how often the circuit is the one hmm-rules or spacy-direct wrote; and the time per message on CPU and GPU.

## Older files

These files belong to the model trained on the older `nlu` annotations. They stay in the folder, and the strategy does not use them: `model.py`, `train.py`, `worker.py`, `graph.mjs`, `syntax.mjs`, and the export `openGraphWorker` of `index.mjs`. The older checkpoints stay under `.local-models/distilbert/`.

---

Next: [Prolog (experimental)](prolog.md) · Up: [Formalizers](README.md)
