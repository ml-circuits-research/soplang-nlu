# DistilBERT

`distilbert` is a formalizer of the `syntax` schema (`docs/syntax-schema.md`). A DistilBERT model, trained on accepted circuits of that schema, reads one message and predicts its circuit. The model runs in a persistent local Python worker. No knowledge repository is read.

The model was trained on `syntax` circuits only. The encoder starts from the pretrained base model `distilbert-base-uncased`. Nothing that was learned from the older `nlu` annotations is used: not the heads, not the label sets, not the thresholds, not the fine-tuned encoder. A checkpoint of that older model is refused when it is given.

## Use

```js
import {createReader} from 'soplang-nlu'
import {distilBert} from 'soplang-nlu/strategies/distilbert'

const reader = await createReader({strategy: distilBert, python: '/path/to/python', device: 'cpu'})
try {
  const result = await reader.propose('delete the last row')
  console.log(result.candidates[0].sop)
} finally {
  await reader.close()
}
```

| Option | Environment variable | Meaning |
| --- | --- | --- |
| `python` | `SOP_NLU_DISTILBERT_PYTHON` | The Python interpreter, with `torch` and `transformers`. Default `python3`. |
| `modelPath` | `SOP_NLU_DISTILBERT_MODEL` | The checkpoint folder. Default: `.local-models/distilbert/syntax-v1/checkpoint`, when it exists. |
| `device` | `SOP_NLU_DISTILBERT_DEVICE` | `auto` (the default: the GPU when there is one), `cpu` or `cuda`. |
| `nodeThreshold`, `tie` | | The two thresholds. By default those chosen at training, stored in the checkpoint. |

The weights are not part of the package. `.local-models` is ignored by git.

`analyse(text)` returns `{analyses: [{sop}]}` with one circuit, or `{analyses: [], error}`. The reader serializes the requests to its worker.

## What the model predicts

The model reads the tokens of the message: its words (those of `wordsOf(text)`) and, between them, every punctuation mark as a token of its own. For these tokens it predicts:

| Prediction | Meaning |
| --- | --- |
| nodes | One for every wire, standing at a word: a clause at its verb, a nominal at its head, a relation at its marker, a coordination at its conjunction. A wire with no such word stands at the word of what it holds (a relation with no marker at its end, a clause with no word at its first nominal). |
| owners | For every word, the node and the key that hold it (`verb`, `auxiliary`, `negation`, `modifier`, `discourse`, `head`, `dependent`, `marker`, `conjunction`). A punctuation mark has no owner. |
| edges | The references between nodes: `subject`, `complement`, `ellipsis`, `from`, `to`, `conjunct`. |
| atoms | The `form` of a clause, and `attachment=ambiguous` on a relation. |

The keys, the types a reference may point to and the values of the atoms are read from `schemas/syntax/schema.sop`. The model has no other label.

| File | Content |
| --- | --- |
| `strategies/distilbert/targets.mjs` | The tokens; the schema as the model needs it; `encodeCircuit(text, sop)`, which turns a circuit into training targets. |
| `strategies/distilbert/syntax_model.py` | The encoder and the heads; the loss; the prediction. |
| `strategies/distilbert/syntax_worker.py` | The worker: one JSON line per message in, one line with the prediction out. |
| `strategies/distilbert/circuit.mjs` | The output stage: from a prediction to wires, written with `writeCircuit`. |
| `strategies/distilbert/index.mjs` | The strategy. |

## What the output stage does by rule

The model names the wires, the key of every word and the ties. The output stage only keeps the circuit within the schema where the first choices of the model do not fit together, each time by taking the next choice of the model. No rule names a word.

1. Every word takes the first of its ranked places whose wire still stands. A punctuation mark gets no place.
2. A nominal with no word, a relation without two different ends and a coordination without two conjuncts of one type do not stand. The two ends of a relation are the pair of different wires that the model ranks highest. A coordination takes the conjuncts the model is sure of, and at least its best two.
3. A clause has one verb and a nominal one head, each a run of neighbouring words. A second run becomes a `modifier` or a `dependent`. A nominal with no head word takes the word the model ranks highest as its head, else its last word.
4. An optional tie (`subject`, `complement`, `ellipsis`, `conjunct`, `attachment=ambiguous`) is written from the threshold `tie` on. `attachment=ambiguous` is written only on a relation that starts at a clause, as the schema says.
5. Two wires that hold the same wires are one wire: two coordinations of the same conjuncts, two clauses with no word that take the same nominals. Of two relations between the same two wires, one that has no word is dropped.
6. A nominal that nothing holds takes the tie the model ranks highest for it, below the threshold too. With no such tie it is a complement of the clause in which it stands. A message with no clause gets a fragment.
7. The form of a clause agrees with whether it has a verb: with a verb, the most probable form other than `fragment`; without one, `fragment`.
8. A word with no place left is a `dependent` when it stands inside a nominal, else a `discourse` word of its clause.
9. `dependent`, `modifier`, `auxiliary`, `negation` and `discourse` hold one word per value; neighbouring `marker` or `conjunction` words are one value.

Every accepted circuit of the dataset, turned into targets and written back by this stage, says the same as before (the training tool checks this for every circuit it uses).

## Training

```sh
node strategies/distilbert/retrain.mjs --python ~/nlp-venv/bin/python
```

| Option | Meaning |
| --- | --- |
| `--gold <file>` | One line per message `{text, label}`: the accepted circuits. Default: `../webmeet-dataset/annotations/syntax/v1/labels.jsonl`, as the file is when the tool runs. |
| `--silver <file>[=<weight>]` | Further files, one line per message `{text, sop}`. The option can be repeated. The weight (0.3 when none is given) is how much one message of the file counts in the loss, against 1 for a gold message. A silver message that is also a gold message is left out. |
| `--exclude <file>` | A JSON array or JSON Lines file of `{text}`: these messages are left out altogether. |
| `--out <folder>` | Where the result goes. Default: `.local-models/distilbert/syntax-v1`, which the strategy uses. An existing checkpoint is kept unless `--overwrite` is given. |
| `--seed`, `--epochs`, `--device`, `--base` | The seed (20261127), the largest number of epochs (20), `cuda` or `cpu`, the base model (`distilbert-base-uncased`). |
| `--tune` | No training: the two thresholds of the checkpoint in `--out` are chosen again on its development messages. Use it after a change of the output stage. |

What the tool does:

1. It keeps about one gold message in ten out of training: the development messages. A message is chosen by a hash of the seed and its text, so it stays on its side when the labels file grows.
2. It turns every circuit into targets (`encodeCircuit`) and writes them to `<out>/data/`. A circuit that is not valid, or that the output stage could not write back, is counted and left out.
3. It starts `syntax_train.py`. The encoder is loaded from the local Hugging Face cache (`distilbert-base-uncased`); the tool does not download anything and reads no earlier checkpoint. After every epoch the first choices of the model are compared with the targets of the development messages; the best epoch is kept.
4. It chooses the two thresholds on the development messages, with the output stage itself: `nodeThreshold` (how sure the model must be of a wire) and `tieThreshold` (of an optional tie). Each is tried at 0.3, 0.4, 0.5, 0.6 and 0.7. A few development messages more or less are chance, so among the pairs that come within one message in a hundred of the best, the pair nearest to 0.5 is written into the checkpoint.
5. It writes `<out>/training-summary.json`: the data sizes, the seed, the epochs and the development results.

The tool reads the two kinds of files named above and nothing else of the dataset.

On the GB10 one epoch takes about 6 ms per training message (12 s for 2,100 messages). With a large silver file, fewer epochs are enough: set `--epochs`.

## Measuring

`eval-results/2026-11-27-distilbert-syntax-training/measure.mjs <name> <training folder>` runs a checkpoint through the common reader. It reports, for the development messages, the valid circuits and the circuits equal to the gold circuit; for the 598 messages of conversion round 2, the valid circuits and how often the circuit is the one VSS or spacy-direct wrote; and the time per message on CPU and on GPU.

## Older files

These files belong to the model that was trained on the older `nlu` annotations. They stay in the folder and the strategy does not use them: `model.py`, `train.py`, `worker.py`, `graph.mjs`, `syntax.mjs` (the output stage that translated the slots of that model), and the export `openGraphWorker` of `index.mjs`. The older checkpoints stay under `.local-models/distilbert/`.
