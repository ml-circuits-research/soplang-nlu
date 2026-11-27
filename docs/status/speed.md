[Home](../README.md) › [Status](../STATUS.md) › Speed and cost in detail

# Speed and cost in detail

This page: the time per message, start-up, model size, runtime and training of every strategy, as measured in the benchmark run. Kind: Reference.

Generated 2026-11-27 22:55 (UTC+01:00) by `node docs/status/build.mjs` · soplang-nlu 94baeb1 (2 uncommitted paths) · webmeet-dataset c6b11f6. The main figures are in [Speed and cost per strategy](../STATUS.md#speed-and-cost-per-strategy) on the status page; the terms are explained in the [Glossary](../reference/glossary.md).

Measured while the benchmark ran (`run.mjs`): each strategy in a process of its own, on the same machine, one message at a time. Each figure is the wall-clock time of one call to the strategy's `propose` function: from handing over the message until the circuit comes back, including the call into Python or Prolog where there is one, and not including start-up (loading the model, paid once per process). The figures come from the milliseconds recorded for every message in the strategy files of the run, the same files the GOAL is computed from. Every figure is for one process. "Messages per second" and "Whole dataset" (the time for all 183,497 messages) come from the mean; "90% within" is the time 90% of messages stay under.

Sizes are measured on disk now, in decimal units (1 MB = 1,000,000 bytes). "Model files" are the files the strategy loads; the runtime it needs (Node.js, Python with PyTorch, SWI-Prolog) is not counted, except where noted. The strategies are listed from the fastest to the slowest by mean time.

**hmm-rules** (experimental)

| Measure | Value |
| --- | --- |
| Messages per second | 1,530 |
| Whole dataset | 2 min |
| Median | 0.47 ms |
| 90% within | 1.23 ms |
| 99% within | 2.7 ms |
| Mean | 0.65 ms |
| Start-up | not recorded |
| Model files | 3.3 MB |
| Runtime | Node.js |
| In a browser | not yet; needs a small loader |
| Training | about 1 min, CPU |
| Learns from labels | no: raw text only |

**prolog** (experimental)

| Measure | Value |
| --- | --- |
| Messages per second | 624 |
| Whole dataset | 5 min |
| Median | 1.10 ms |
| 90% within | 3.41 ms |
| 99% within | 7.0 ms |
| Mean | 1.60 ms |
| Start-up | 7 ms |
| Model files | 24 KB |
| Runtime | SWI-Prolog |
| In a browser | not as it is |
| Training | word counts only |
| Learns from labels | no: raw text counts |

**distilbert** (experimental)

| Measure | Value |
| --- | --- |
| Messages per second | 240 |
| Whole dataset | 13 min |
| Median | 3.92 ms |
| 90% within | 5.08 ms |
| 99% within | 6.3 ms |
| Mean | 4.17 ms |
| Start-up | 3.5 s |
| Model files | 268.6 MB |
| Runtime | Python with PyTorch and Hugging Face transformers; CUDA for the GPU |
| In a browser | not as it is |
| Training | 35 min, GPU |
| Learns from labels | yes: judged labels, and agreement labels at a lower weight |

**spacy**

| Measure | Value |
| --- | --- |
| Messages per second | 18 |
| Whole dataset | 2.8 h |
| Median | 50.9 ms |
| 90% within | 72.6 ms |
| 99% within | 112.1 ms |
| Mean | 55.0 ms |
| Start-up | 2.6 s |
| Model files | 500.7 MB |
| Runtime | Python with spaCy and spacy-transformers (PyTorch) |
| In a browser | no |
| Training | none by us |
| Learns from labels | no: English treebanks, by its makers |

**z3** (experimental)

| Measure | Value |
| --- | --- |
| Messages per second | 9 |
| Whole dataset | 5.8 h |
| Median | 56.7 ms |
| 90% within | 254.4 ms |
| 99% within | 984.8 ms |
| Mean | 113.6 ms |
| Start-up | 252 ms |
| Model files | 88 KB |
| Runtime | Node.js and z3-solver, whose WebAssembly file is 39.2 MB |
| In a browser | in principle; large |
| Training | word counts only |
| Learns from labels | no: raw text counts |

Start-up comes from `summary.json`, which `run.mjs` writes when it runs a strategy.

**In practice.** hmm-rules reads about 1,530 messages a second in one Node process on one CPU core, so the whole dataset takes about 2 min; with 20 processes on this machine's 20 cores, about 6 s (an estimate, not measured). spaCy takes about 2.8 h for the same work in one process: 84 times longer per message on average (109 times at the median). That makes spaCy the slowest step of every rerun over the whole dataset, such as the next one planned in [Working on now](../STATUS.md#working-on-now). DistilBERT on the GPU takes about 13 min; Z3 about 5.8 h, with a long tail (90% of messages within 254 ms, 99% within 985 ms). For use while someone types: the 0.5 ms of hmm-rules is instant, spaCy's 51 ms goes unnoticed, and Z3's slow messages would be felt.

**Not like for like, and not measured yet:** GPU against CPU, threads inside one process, single runs, one message at a time ([Speed and cost: not like for like](../formalizers/speed.md#not-like-for-like)).

### Model files and training

What each strategy needs to run, and where its analysis comes from: [Speed and cost: what each formalizer needs](../formalizers/speed.md#what-each-formalizer-needs).

**hmm-rules** (experimental)

- Model files: model.json: 3.3 MB (strategies/hmm-rules/model/model.json)
- Training: About 60–70 s on the CPU (reported by the training runs, not measured here), from 183,497 messages of raw text (2,623,108 words, 25 rounds of EM). No labels are used. The raw text is the whole dataset, so it includes the benchmark messages, without their labels.

**spacy** (active)

- Model files: en_core_web_trf: 500.7 MB (/tmp/sop-nlu-trf-model/en_core_web_trf)
- Training: None by us: a pipeline trained by its makers on large English treebanks. Our part is the layer that writes circuits from its parse.

**distilbert** (experimental)

- Model files: checkpoint syntax-v3: 268.6 MB (.local-models/distilbert/syntax-v3/checkpoint)
- Training: Checkpoint syntax-v3, the one named by the latest DistilBERT measurement of "Progress over time": 35 min for 6 epochs on the GPU, 81,470 training circuits (judged labels, and agreement labels at weight 0.3); benchmark messages held out. On held-out development messages 73.5% equal the label.

**prolog** (experimental)

- Model files: word model: 24 KB (strategies/prolog/model)
- Training: The grammar is hand-written. A small word model counts, in raw text, where each word stands next to function words.

**z3** (experimental)

- Model files: word usage table: 88 KB (strategies/z3/model)
- Runtime files: z3-built.wasm: 39.2 MB (strategies/z3/node_modules/z3-solver/build/z3-built.wasm)
- Training: The grammar is hand-written as constraints. A table counts how each word is used in raw text.

---

Next: [Dataset labels by area](dataset.md) · Up: [Status](../STATUS.md)
