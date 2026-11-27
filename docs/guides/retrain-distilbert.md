[Home](../README.md) › [How-to guides](README.md) › Retrain DistilBERT

# Retrain the DistilBERT model

This page: how to train DistilBERT again on the current syntactic labels with the benchmark held out, and how to record which checkpoint is used. Kind: How-to guide.

The `distilbert` formalizer is a [DistilBERT](https://en.wikipedia.org/wiki/BERT_(language_model)) encoder [fine-tuned](https://en.wikipedia.org/wiki/Fine-tuning_(deep_learning)) on accepted circuits of the syntax schema. It starts from the pretrained base model `distilbert-base-uncased`; nothing learned from the older `nlu` annotations is used ([decision D11](../project/decisions.md#d11)). What the model predicts, and every option: [DistilBERT: model, output stage, options, checkpoints](../formalizers/distilbert-details.md).

## When to retrain

After new labels are published: a benchmark publication, a conversion round, or a batch write.

## Before you start

- A Python with `torch` and `transformers`: `--python`, or `SOP_NLU_DISTILBERT_PYTHON`, else `python3`.
- A GPU: the tool's default device is `cuda` (`--device cpu` is possible).
- The base model `distilbert-base-uncased` in the local Hugging Face cache. The tool downloads nothing and reads no earlier checkpoint.

## Step 1: hold out the benchmark

`--exclude` takes a plain JSON array or a JSON Lines file of `{text}`, read as UTF-8 text, so unpack the gzipped sample first:

```sh
B=eval-results/2026-11-27-syntax-benchmark-random
gunzip -c $B/sample.json.gz > <scratch>/exclude.json
```

## Step 2: train

```sh
node strategies/distilbert/retrain.mjs \
  --exclude <scratch>/exclude.json \
  --out .local-models/distilbert/<name>
```

- The data are the labels of the dataset, read from its syntactic files (`../webmeet-dataset/syntactic`, or the folder `--syntactic` names) as they are when the tool runs.
- Gold: the rows whose `accepted_by` is "judge" or "written". About one gold message in ten is kept out of training as a development message, chosen by a hash of the seed and the text, so a message stays on its side when the labels grow.
- Silver: the rows whose `accepted_by` is "agreement", trained with the weight 0.3. `--no-agreement` leaves them out.
- The tool refuses `--gold`: there is no labels file any more.
- An existing checkpoint in `--out` is kept unless `--overwrite` is given.
- `--epochs` sets the largest number of epochs (20 by default); with a large silver file, fewer are enough.

`--tune` trains nothing: it chooses the two thresholds of the checkpoint in `--out` again on its development messages, for example after a change of the output stage (the code that turns the model's prediction into a circuit). The thresholds say how sure the model must be of a wire (`nodeThreshold`) and of an optional tie between wires (`tieThreshold`).

## Step 3: read the training summary

`<out>/training-summary.json` records what the checkpoint was trained on:

| Key | What to look at |
| --- | --- |
| `messages` | Per kind (`gold`, `agreement`): lines, train, development, and `excluded`. The excluded counts show that the benchmark was held out. |
| `selectedEpoch` | The epoch kept: the best on the development messages. |
| `development` | `equalToGoldByCore`: the share of development circuits equal to the label; `nodeThreshold` and `tieThreshold`, the thresholds chosen. |
| `trainingSeconds` | The training time. |

## Step 4: use the checkpoint, and record it

Name the checkpoint explicitly, with the environment variable or the option `modelPath`:

```sh
M=.local-models/distilbert/<name>
export SOP_NLU_DISTILBERT_MODEL=$M/checkpoint
```

With `run.mjs`, an options file does the same: `{"distilbert": {"modelPath": "…"}}`. Record which checkpoint ran, for example in the commit message and in the note of the `history.json` row ([Refresh the status page](refresh-status.md)): the run folder's `summary.json` records no model path.

## Step 5: measure on the benchmark

Run it with `--only distilbert` and have its new circuits judged: [Run the benchmark](run-benchmark.md).

## What is standard here

| Piece | Kind |
| --- | --- |
| Fine-tuning | Standard: a pretrained transformer fine-tuned on labelled examples, with a [development set](https://en.wikipedia.org/wiki/Training,_validation,_and_test_data_sets). |
| Its targets | New here: wires, the place of every word, ties and values, all read from the schema. |
| Its data | Particular: trained on this dataset's labels. |

## Pitfalls

- **Benchmark messages in training data.** A retrain without `--exclude` trains on the labels of the benchmark's messages, and its benchmark score is then not a held-out measure ([data leakage](https://en.wikipedia.org/wiki/Leakage_(machine_learning)); [Limits of the measurements](../evaluation/validity.md)).
- **The default path in the code is `syntax-v1`**, the first checkpoint, used when no model is named. Name the checkpoint you mean.
- **Agreement labels teach the agreeing formalizers' readings.** A DistilBERT trained on circuits that VSS and spaCy agreed on learns their readings; the session notes conclude it then no longer counts as an independent voice in agreement.
- **Checkpoints are not in git.** `.local-models` is ignored by git, so the training summary stays only on the machine that trained it. Copy what matters into the commit message.
- **Training time** grows with the number of training messages; current figures are in [speed and cost per strategy](../STATUS.md#speed-and-cost-per-strategy).

Next: [Write a formalizer](write-a-formalizer.md) · Up: [How-to guides](README.md)
