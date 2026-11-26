# Native DistilBERT baseline training

The checkpoint fine-tunes the official `distilbert/distilbert-base-uncased` encoder at revision `12040acc`. Its native graph heads predict typed nodes anchored to source tokens, slot presence, grounded span boundaries, atomic values, and typed graph edges. The decoder returns one graph. Its evidence slots point into the original source token sequence, and linked nodes refer to positions in the returned graph. The public reader applies the shared native schema and source validator. The checkpoint contains learned weights, tokenizer, label vocabulary and confidence thresholds.

The trainer consumed 2,549 training rows and 283 development rows, with zero exact text overlap. The training archive manifest records the frozen label inputs. The separately prepared study texts did not enter training, development, or checkpoint selection. The model learns from the source and native graph labels, with no spelling correction stage.

CUDA training took 117.58 seconds on an NVIDIA GB10, using Python 3.12, PyTorch 2.14.0 with CUDA 13.0, and Transformers 4.57.6. The host lacked Python development headers for its optional Triton compiler path. The run disabled those overrides and used the native CUDA backend. Epoch eight had the highest development graph-fact F1 under the fixed threshold grid. The selected node and attribute thresholds were 0.70 and 0.50.

| Development metric | Result |
| --- | ---: |
| Anchored graph-fact precision | 86.04% |
| Anchored graph-fact recall | 86.01% |
| Anchored graph-fact F1 | 86.02% |
| Exact graph agreement | 14.49% |
| Nonempty raw graphs | 100.00% |
| Schema-valid, source-grounded public circuits | 96.47% |
| Complete material source coverage | 62.54% |

Anchored graph-fact comparison includes node type and position, evidence spans, atom values, and link endpoints, against the held-out development labels. Public completeness is a static check. Independent study adjudication measures interpretation quality separately.

The public CPU probe returned 273 valid public circuits and 177 source-complete circuits from the 283 development texts. The validator rejected ten raw circuits. The reader reported zero runtime errors. The first 24 development texts produced exactly the same public outputs on CPU and CUDA.

| Live public-reader probe | Worker start | Per-request p50 | Per-request p95 |
| --- | ---: | ---: | ---: |
| CPU, all 283 development inputs | 1.964 s | 21.84 ms | 33.02 ms |
| CUDA, first 24 development inputs | 3.451 s | 4.87 ms | 14.49 ms |

The timing runs include the public Node/Python request, native serialization and source validation. Both measurements exclude one unmeasured warm-up request. The percentile samples differ in size, and exact device parity was verified on the matched 24 inputs.

The frozen local checkpoint is `/tmp/sop-distilbert-runs/native-v1-eager/checkpoint`. Its tree SHA-256 is `02a466159675a0dbebe34d0f62a7a091145922ee8823690e3760cb9d8a3ba17b`. Per-file base and checkpoint hashes are recorded in the provenance and training summaries. The optional checkpoint remains outside Git.

Training and inference are available through the [DistilBERT strategy](../../strategies/distilbert/). A persistent worker takes `--model` and optional `--device auto|cpu|cuda`. The same local checkpoint supports both devices.
