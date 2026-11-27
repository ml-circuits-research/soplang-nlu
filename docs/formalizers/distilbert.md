[Home](../README.md) › [Formalizers](README.md) › DistilBERT

# DistilBERT

This page: an introduction to the DistilBERT formalizer, a small transformer model fine-tuned on this project's syntax circuits. Kind: Explanation.

**Status: experimental** (the owner's decision of 2026-11-27). DistilBERT is measured on the benchmark, kept runnable and trainable, and still a voice in agreement for its own family, but it is not being improved now ([Formalizers](README.md#experimental)).

## What it is

DistilBERT is a small [transformer](https://en.wikipedia.org/wiki/Transformer_(deep_learning_architecture)) language model, distilled from the larger [BERT](https://en.wikipedia.org/wiki/BERT_(language_model)) model ([knowledge distillation](https://en.wikipedia.org/wiki/Knowledge_distillation): a small model trained to imitate a large one). Its makers pretrained it on English text.

This formalizer starts from the pretrained model `distilbert-base-uncased` and fine-tunes it only on circuits of the syntax schema ([fine-tuning](https://en.wikipedia.org/wiki/Fine-tuning_(deep_learning)): further training of a pretrained model on a new task). Nothing learned from the project's earlier `nlu` annotations is used, and a checkpoint of that older model is refused.

The model runs in a persistent Python worker with [PyTorch](https://en.wikipedia.org/wiki/PyTorch); the strategy, in Node.js, sends it one message at a time. The code is in `strategies/distilbert/`. The trained weights are not part of the package: they live under `.local-models/distilbert/`, which git ignores.

## How it reads a message

The model reads the words of the message and, between them, every punctuation mark as a token of its own. For these tokens it predicts four things. (Wires, clauses, nominals, relations and coordinations are explained in [Read your first circuit](../concepts/first-circuit.md).)

| Prediction | What it is |
| --- | --- |
| Nodes | One for every wire, standing at a word: a clause at its verb, a nominal at its head, a relation at its marker, a coordination at its conjunction. |
| Owners | For every word, the wire and the key that hold it (`verb`, `head`, `dependent`, `marker`, and so on). |
| Edges | The references between wires: `subject`, `complement`, `ellipsis`, `from`, `to`, `conjunct`. |
| Atoms | The `form` of a clause, and `attachment=ambiguous` on a relation. |

The keys, the wire types and the values are all read from the schema file `schemas/syntax/schema.sop`. The model knows no labels other than the schema's.

An output stage of rules then writes the circuit. Where the model's first choices do not fit together, it takes the model's next choice, so the circuit stays within the schema. No rule names a word.

## What it learns from

It learns from the labels of the dataset ([The WebMeet dataset and its labels](../evaluation/dataset.md)):

- **Judged labels** (gold): circuits a judge accepted or wrote. About one in ten is kept out of training, to choose the best epoch (one pass over the training data) and the thresholds.
- **Agreement labels** (silver): circuits that formalizers of different sources wrote alike. They count with a lower weight.

From checkpoint `syntax-v2` on, the benchmark messages are held out of training. DistilBERT is not fully independent of the other formalizers, because most labels come from hmm-rules and spaCy agreeing.

## Standard, new here, particular

| Label | In the DistilBERT formalizer |
| --- | --- |
| Standard | A pretrained transformer, fine-tuned for a prediction task over tokens. Choosing the best epoch on held-out messages ([early stopping](https://en.wikipedia.org/wiki/Early_stopping)). |
| New here | The prediction targets (nodes, owners, edges, atoms, all read from the schema) and the output stage that turns them into a valid circuit. |
| Particular | It is trained on this dataset's labels, most of which come from hmm-rules and spaCy agreeing. |

## Speed and cost

A few milliseconds per message on a GPU; on a CPU the current checkpoint is not measured. Training needs a GPU and the labels. Comparison: [Speed and cost](speed.md). Numbers: [STATUS](../STATUS.md#speed-and-cost-per-strategy).

## Known limits

- **Which checkpoint ran is not recorded.** A benchmark run's `summary.json` has no checkpoint field. For the first judged benchmark run, the checkpoint was most probably one trained on agreement circuits of 576 benchmark messages, so that score was not a held-out measure ([DistilBERT: checkpoints](distilbert-details.md#checkpoints)).
- **It depends on other formalizers.** It learns mostly from circuits that hmm-rules and spaCy agreed on, so it learns their readings. The session notes of 2026-11-27 add a reading, not a separate measurement: agreement happens mostly on easy messages, so judged examples from the hard messages help it more than thousands of agreed ones ([Limits of the measurements](../evaluation/validity.md)).
- **The default path is old.** With no option, the code loads `syntax-v1`. A run must name the checkpoint it wants.
- **Not in a browser as it is.** That would need an export to ONNX and a web runtime, which is not done.

## Run it

- Run it: [Run a formalizer](../guides/run-a-formalizer.md). The default checkpoint path in the code is `.local-models/distilbert/syntax-v1/checkpoint`. Another checkpoint is named with the option `modelPath` or the variable `SOP_NLU_DISTILBERT_MODEL`, as the benchmark runs of `syntax-v2` and `syntax-v3` had to do.
- Train it again: [Retrain the DistilBERT model](../guides/retrain-distilbert.md).

## Details

[DistilBERT: model, output stage, options, checkpoints](distilbert-details.md).

---

Next: [DistilBERT: model, output stage, options, checkpoints](distilbert-details.md) · Up: [Formalizers](README.md)
