[Home](../README.md) › [How-to guides](README.md) › Retrain VSS

# Retrain the VSS model

This page: how to train VSS's model again when its legend or its training code changes, and how to check what moved. Kind: How-to guide.

VSS learns from the raw text of the dataset's messages, with no labels. Training estimates a [hidden Markov model](https://en.wikipedia.org/wiki/Hidden_Markov_model) of word classes ([stations](../vss/stations.md)) by [expectation–maximization](https://en.wikipedia.org/wiki/Expectation%E2%80%93maximization_algorithm) (EM). It then reads the same text with that model and counts how each word behaves, for example whether it names a thing or a quality: the habits of words. It writes one file, `strategies/vss/model/model.json`. How training works: [Training VSS](../vss/training.md); what the file holds: [The model file](../vss/model-file.md).

## When to retrain

After any change to:

- `strategies/vss/train.mjs`;
- `strategies/vss/legend.sop`: the reader takes the legend from the copy inside `model.json`, so a legend edit has no effect on reading until the model is trained again;
- a module whose code runs during training, such as `src/forms.mjs`, `src/routes.mjs` or `src/units.mjs`. The full list (the files marked T) is in [Folders and repositories](../reference/folders.md).

A change to `src/links.mjs`, `src/emit-syntax.mjs` or the reader's options needs no retraining ([Add a VSS rule](add-vss-rule.md), step 3).

## Step 1: train into a scratch file

```sh
node strategies/vss/train.mjs --dataset ../webmeet-dataset \
  --out <scratch>/model.json
```

Without `--out` it overwrites `strategies/vss/model/model.json`. `--dataset` defaults to `webmeet-dataset` next to `soplang-nlu`; `--legend` is resolved from `strategies/vss/`, not from the current folder. All options: [VSS commands and options](../vss/options.md).

Training reads only the first column (the text) of the dataset's CSV files under `semantic/`. It prints what it learned and ends with the size of the model and the time taken.

## Step 2: try the new model

The option `vssModel` makes VSS load another model file. With `run.mjs`, put it in an options file:

```json
{"vss": {"vssModel": "<scratch>/model.json"}}
```

```sh
S=eval-results/conversion/<tab>__<name>/sample.json
node tests/benchmark/syntax/run.mjs <scratch>/after \
  --only vss --sample $S --options <scratch>/options.json
```

Compare these circuits with those of the current model, and read every changed circuit that was accepted before: [Find faults](find-faults.md), steps 3 to 5.

## Step 3: install it and check

When the changes are good, train without `--out` (or copy the scratch model over `strategies/vss/model/model.json`). Then:

1. run the VSS tests ([Run the tests](run-tests.md));
2. send the changed readings to judges ([Find faults](find-faults.md), step 6);
3. commit the model together with the change that needed it ([decision D14](../project/decisions.md#d14)).

## Determinism

Training is [deterministic](https://en.wikipedia.org/wiki/Deterministic_algorithm): no step draws a random number. The "random" vectors are derived from each symbol's name by a fixed hash ([FNV-1a](https://en.wikipedia.org/wiki/Fowler%E2%80%93Noll%E2%80%93Vo_hash_function)) and a [xorshift](https://en.wikipedia.org/wiki/Xorshift) generator. The same code, legend and dataset give the same model. To check, train twice into two scratch files and compare them:

```sh
cmp <scratch>/a.json <scratch>/b.json
```

A model trained from a working tree whose legend or training code has uncommitted changes differs from the committed model, as it should.

## Good practice

Add marks as new open lists in the legend, retrain once, and check the changed readings at once. This is the practice adopted on 2026-11-27, because of the pitfall below.

## Time and memory

Training runs on the CPU, in one Node.js process. Current figures for its time are in [speed and cost per strategy](../STATUS.md#speed-and-cost-per-strategy).

## What is standard here

| Piece | Kind |
| --- | --- |
| HMM, EM, Viterbi | Standard: [hidden Markov model](https://en.wikipedia.org/wiki/Hidden_Markov_model), trained by EM, decoded by the [Viterbi algorithm](https://en.wikipedia.org/wiki/Viterbi_algorithm). |
| Changes to EM | New here: small changes, described in [Training VSS: the station HMM](../vss/training-hmm.md). |
| What it learns | Particular: learned from this dataset's text. |

## Pitfalls

- **Retraining shifts unrelated readings.** EM starts from scratch at every training, so an edit that changes which stations a word may take, or which forms belong to a word, moves probabilities everywhere. Relating "goes" to "go" was dropped for this reason (the journal, "Measured and dropped").
- **Without `--out` the committed model is overwritten.**
- **`tests/vss.test.mjs` can pass with a stale model**, since it reads `legend.sop` directly.
- **The text includes the benchmark's messages.** VSS learns from the text of the whole dataset, benchmark messages included. That is learning from text, not from labels, but it is not a held-out measurement in the strict sense ([Limits of the measurements](../evaluation/validity.md)).

Next: [Retrain DistilBERT](retrain-distilbert.md) · Up: [How-to guides](README.md)
