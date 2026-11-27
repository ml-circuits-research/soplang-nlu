[Home](../README.md) › [hmm-rules in depth](README.md) › The model file

# The model file

This page: the keys of `strategies/hmm-rules/model/model.json`, the copy of the legend it carries, and what retraining changes. Kind: Reference.

The keys are those of commit `fa46cb7`, from the architecture report; two habits added in `71f0dd2` are marked. Sizes and counts change on retraining and are left out; the current size of the file is in [STATUS.md, Speed and cost](../STATUS.md#speed-and-cost-per-strategy).

## The keys

### `version`, `trained`

| Field | Value |
| --- | --- |
| Content | The format version (1); the number of messages and tokens, the iterations, the minimum count and the options of the training run. |
| Written by | `train.mjs` |

### `legend`

| Field | Value |
| --- | --- |
| Content | The full text of `legend.sop` at training time. |
| Written by | `train.mjs` |

### `symbols`

| Field | Value |
| --- | --- |
| Content | The vocabulary: the 16 classes first, then the words seen at least the minimum count. |
| Written by | `routes.mjs` |

### `variants`, `openers`

| Field | Value |
| --- | --- |
| Content | The learned spelling variants and openers ([Training: from text to vocabulary](training.md)). |
| Written by | `variants.mjs`, `train.mjs` |

### `transition`, `start`, `end`, `shape`, `emission`

| Field | Value |
| --- | --- |
| Content | The station HMM ([Training: the station HMM](training-hmm.md)). |
| Written by | `routes.mjs` |

### `occurrence`

| Field | Value |
| --- | --- |
| Content | The 512-dimensional mean and the 25 station prototypes, as base64-encoded 32-bit floats. |
| Written by | `occurrence.mjs` |

### `meanings`

| Field | Value |
| --- | --- |
| Content | The word vectors, 128-dimensional by default, as 8-bit integers. |
| Written by | `meaning.mjs` |

### `memory`

| Field | Value |
| --- | --- |
| Content | The role-filler vectors, one per governing verb or noun, as 8-bit integers. |
| Written by | `habits.mjs`, `meaning.mjs` |

### `habits`

| Field | Value |
| --- | --- |
| Content | `nominal`, `takesClause`, `takesQuality`, `gives`, `asks`, `directs`, `names`, `phrasal`, `separable`, `anchored`, `attachSure`, `together`, `describes`, `verbTotal`, `attach`, `kinds`; since `71f0dd2` also `number` and `sForms`. |
| Written by | `habits.mjs`, `anchors.mjs` |

What each habit means: [What hmm-rules learns beyond the HMM](learned-knowledge.md).

## The model carries the legend

The reader takes the legend from `model.json`, not from `legend.sop`: `openModel` in `src/reader.mjs` calls `readLegend(model.legend)`. So an edit to `legend.sop` has no effect on reading until the model is trained again.

The test `tests/hmm-rules.test.mjs` reads `legend.sop` directly. It can therefore pass while the model still carries an older legend.

## What retraining does

EM starts from scratch at every training. An edit that changes which stations a word may take, or which forms belong to a word, moves probabilities everywhere, so readings can change in messages the edit was not about. Relating "goes" to "go" in the stem rule shifted unrelated readings and was dropped for that reason.

An edit that only gives a mark to words already listed, through a new open list, leaves the learned parts unchanged. The practice adopted: add marks as open lists, retrain once, and check the changed readings at once. The steps are in [Retrain the hmm-rules model](../guides/retrain-hmm-rules.md).

## Which source files affect the model

A change to code that runs during training changes the model; a change to code used only for reading does not. In short:

- **Retrain after a change to** `train.mjs`, `legend.sop`, or a module whose code runs during training: `corpus`, `tokens`, `observe`, `legend`, `forms`, `variants`, `routes`, `anchors`, `occurrence`, `space`, `meaning`, `habits`, `units` (through `learnHabits`), and the `openModel` part of `reader.mjs`.
- **No retraining needed after a change to** `links.mjs`, `emit-syntax.mjs` or the `createHmmRulesReader` part of `reader.mjs`. A change to `units.mjs` that touches only rules guarded by `lexicon.leans`, `lexicon.linkOf` or a rule letter does not change the model either, since those lookups are absent during training.

Every file of `strategies/hmm-rules` with its role: [Folders and repositories](../reference/folders.md).

---

Next: [Reading: from words to units](reading.md) · Up: [hmm-rules in depth](README.md)
