[Home](../README.md) › [Formalizers](README.md) › Speed and cost

# Speed and cost: what to consider

This page: the one page that compares the formalizers on speed and cost. It says how speed is measured, what each formalizer needs to run, which comparisons are not like for like, and what is not measured yet. The numbers themselves are only on the [status page](../STATUS.md#speed-and-cost-per-strategy). Kind: Explanation.

## How speed is measured

**In benchmark runs.** `tests/benchmark/syntax/run.mjs` runs each strategy in a process of its own, on the same machine, and sends it one message at a time.

- For every message it records the [wall-clock time](https://en.wikipedia.org/wiki/Elapsed_real_time) of one call, in milliseconds, in the strategy's output file (`<strategy>.jsonl`, field `ms`). The time runs from handing over the message until the circuit comes back. It includes the call into Python or Prolog, where there is one, and the common reader's check of the circuit against the schema.
- In `summary.json` it records the start-up time (opening the strategy and loading its model) and the median time per message.
- Start-up is paid once per process. It is not part of the per-message times.
- With `--jobs n`, n strategies run at the same time, each in its own process. The options are listed in [Benchmark tools](../reference/run-tools.md).

**Standalone.** `lib/measure-strategy.mjs` exports `measureStrategy(createReader, texts)`. It opens one reader, reads the messages one after another, and returns the time of every message. It also returns the start-up time, the total time, messages per second, the median and the 95th percentile ([Library API](../reference/library.md)).

**The terms.** The [median](https://en.wikipedia.org/wiki/Median) is the time half of the messages stay under. The 95th [percentile](https://en.wikipedia.org/wiki/Percentile) is the time 95% of messages stay under; the status page also gives the 90th and 99th. Messages per second is the [throughput](https://en.wikipedia.org/wiki/Throughput). A **long tail** means that a few messages take far longer than the median.

| Label | In these measurements |
| --- | --- |
| Standard | Wall-clock time per call; median, percentiles and throughput. |
| New here | Nothing: the tools are plain timers around the common reader. |
| Particular | One machine, shared with other work; this dataset's messages; single runs. |

## What each formalizer needs

### hmm-rules

| Need | Fact |
| --- | --- |
| Runtime | Node.js only: plain JavaScript in one process. |
| Model files | One JSON file, `strategies/hmm-rules/model/model.json`. |
| Hardware | One CPU core. No GPU. |
| In a browser | Not yet: a small loader is needed, not built. |
| Trained on | Raw text only, with no labels. |

### spacy

| Need | Fact |
| --- | --- |
| Runtime | Python with spaCy and spacy-transformers (PyTorch), called from Node.js. |
| Model files | A large transformer pipeline, `en_core_web_trf`. |
| Hardware | A CPU in the benchmark. |
| In a browser | No. |
| Trained on | English treebanks, by spaCy's makers. Nothing is trained by this project. |

### distilbert

| Need | Fact |
| --- | --- |
| Runtime | Python with PyTorch and Hugging Face transformers, called from Node.js; CUDA for the GPU. |
| Model files | One checkpoint folder under `.local-models/distilbert/`. |
| Hardware | A GPU for millisecond speed. It can run on a CPU; how fast the current checkpoint is there is not measured. |
| In a browser | Not as it is: it would need an export to ONNX and a web runtime. |
| Trained on | The dataset's labels: judged ones, and agreement ones at a lower weight. |

### prolog

| Need | Fact |
| --- | --- |
| Runtime | SWI-Prolog, a native program, called from Node.js. |
| Model files | A small word model, `strategies/prolog/model/word-model.json`. |
| Hardware | One CPU core. |
| In a browser | Not as it is. SWI-Prolog has a WebAssembly build; not tried. |
| Trained on | Word counts in raw text; the grammar is hand-written. |

### z3

| Need | Fact |
| --- | --- |
| Runtime | Node.js and the `z3-solver` package, Z3 compiled to WebAssembly. |
| Model files | A small usage table, `strategies/z3/model/usage.json`, plus the solver's large WebAssembly file. |
| Hardware | The CPU. |
| In a browser | In principle: `z3-solver` has a browser build, but its file is large and needs threads in the browser. |
| Trained on | Word counts in raw text; the grammar is hand-written. |

The sizes of the model files are on the status page, [Side by side](../STATUS.md#speed-and-cost-per-strategy).

## Orders of magnitude

Per message, one message at a time:

- **hmm-rules and Prolog**: about a millisecond or less; hmm-rules is the fastest.
- **DistilBERT**: a few milliseconds, on a GPU.
- **spaCy and Z3**: tens of milliseconds. Z3 has a long tail.

## Not like for like

- **GPU against CPU.** DistilBERT ran on the GPU, spaCy on the CPU.
- **Threads inside one process.** The PyTorch strategies (spaCy's transformer and DistilBERT) may use several CPU threads inside their one process, so "one process" favours them.
- **A shared machine.** Other work, and other strategies run with `--jobs`, may share the machine.
- **Single runs.** Each figure comes from one run; it was not repeated.
- **One message at a time.** spaCy and DistilBERT would be faster on batches of messages.

## Not measured yet

- The current DistilBERT checkpoint on a CPU. This decides whether DistilBERT can run where there is no GPU.
- The CPU time of each strategy, as against wall-clock time.
- Speed with batches of messages.

## Training cost

- **hmm-rules** trains on the whole raw text of the dataset, on a CPU, with no labels.
- **spaCy** is not trained by this project.
- **DistilBERT** trains on the labels, on a GPU, and is retrained as the labels grow ([DistilBERT: checkpoints](distilbert-details.md#checkpoints)).
- **Prolog and Z3** only count words in raw text.

The training times are on the status page.

## In practice

- **Reruns over the whole dataset.** spaCy is the slowest step of every rerun over all messages, such as those after each round of rules ([Converting the dataset](../evaluation/conversion.md)). hmm-rules, run in several processes at once, would take seconds (an estimate, not measured).
- **While someone types.** hmm-rules is instant, and spaCy's delay goes unnoticed. Z3's slowest messages would be felt.

## Where the numbers are

[Status: speed and cost per strategy](../STATUS.md#speed-and-cost-per-strategy) gives one line per formalizer; [Speed and cost in detail](../status/speed.md) gives messages per second, time for the whole dataset, median, 90th and 99th percentile, mean, start-up, model sizes and training times. Which formalizer is most accurate is in [the benchmark, live](../STATUS.md#the-benchmark-live).

---

Next: [Evaluation and labels](../evaluation/README.md) · Up: [Formalizers](README.md)
