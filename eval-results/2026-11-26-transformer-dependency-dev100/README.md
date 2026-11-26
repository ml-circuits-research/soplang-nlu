# Pretrained transformer dependency measurement

The frozen 100 development sources, graph representation, prompt and acceptance
rubric are the same as in the [compact/large diagnostic](../2026-11-26-neural-dependency-dev100/README.md).
This run measured spaCy 3.8.16 with en_core_web_trf 3.8.0 on CPU, excluding NER.
The model release wheel has SHA-256
`272a31e9d8530d1e075351d30a462d7e80e31da23574f1b274e200f3fff35bf5`.
The model directory occupies about 478 MiB. No fine-tuning or SOP mapper was used.

| Model | Plausible raw graph | Requires structural repair | CPU median per input | CPU p95 |
| --- | ---: | ---: | ---: | ---: |
| Compact | 50% | 50% | 2.06 ms | 3.75 ms |
| Large | 48% | 52% | 2.00 ms | 3.90 ms |
| Transformer | 74% | 26% | 51.32 ms | 82.54 ms |

The transformer corrected 27 compact-model failures and introduced three failures
on inputs with a plausible compact-model graph. Four transformer graphs had an
essential predicate error and 17 had an argument or attachment error. In the
compact model those counts were 17 and 45. Error types can overlap.

All three models received the unmodified source text. For 28 exact matches to
previously reviewed source/graph fingerprints we reused the original votes.
For the other 72, Sol and Terra reviewed the graphs independently with model
identities withheld. They accepted 71 and 76 graphs across all 100. A third
reviewer decided all 11 threshold disagreements and checked 24 agreements.
It disagreed on two of those 24 checks. The chosen acceptance rule is the same
as in the compact/large diagnostic.

The [single-thread timing](timing.json) covers a separate sequential pass with
OMP, MKL and OpenBLAS thread counts set to one. Startup was 2.53 s; the 100
subsequent parser requests took 5.51 s. Raw production metadata also contains
timing from its two-thread inference pass. Run `python3 summarize.py` to replay
the paired decisions and axis counts from the saved exact graphs and votes.
