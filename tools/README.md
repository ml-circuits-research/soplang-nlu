# Machine safety tools

The working machine shares about 125 GB of memory between the CPU and the GPU. Memory the GPU driver takes is
not counted as any process's memory, so the kernel cannot see which job is responsible when memory runs out.

| What happened | When |
| --- | --- |
| A python job of 13 GB stopped by the kernel; the rVSS sprint died the first time | 2026-11-28 00:14 |
| The full VSA training stopped by the kernel at step 1,200 | 2026-11-28 06:36 |
| Five rVSS trainings and decodes on the GPU at once; the driver held ~100 GB; the machine froze and was restarted | 2026-11-28 07:25 |

## The rules

| Rule | How |
| --- | --- |
| One GPU job at a time | start every GPU job with `tools/gpu-run.sh <command>`; a second job waits for the first |
| A GPU job may take at most 40% of the GPU | `gpu-run.sh` sets `PYTORCH_CUDA_ALLOC_CONF=per_process_memory_fraction:0.4` (`SOP_GPU_MEM_FRACTION` changes it) |
| Under memory pressure the job dies, not the machine | `gpu-run.sh` gives the job `oom_score_adj` 1000 |
| A watchdog stops the newest GPU job below 15 GB available | `tools/memory-watchdog.sh`, started once per boot |
| Decoding and measuring run on the CPU | the rVSS worker's default device is `cpu` |
| Large models and environments never live in `/tmp` | `/tmp` is emptied at every restart; use `~/models/` or `.local-data/` |

## Start the watchdog after a restart

```sh
systemd-run --user --unit=soplang-memwatch --collect "$PWD/tools/memory-watchdog.sh"
systemctl --user is-active soplang-memwatch
tail ~/.local/state/soplang-memwatch.log
```

`MemAvailable` drops by the memory the GPU takes (checked: 20 GB on the GPU lowered it by 21 GB), so the
watchdog sees GPU pressure.

## The spaCy environment

`/tmp` lost the transformer model at the restart of 2026-11-28. It was rebuilt in `~/models/sop-nlu-trf/`
(spaCy 3.8.16, `en_core_web_trf` 3.8.0, spacy-curated-transformers 0.3.1, torch 2.15 CPU) and gives the
recorded parses exactly (459 of 459 messages, every 400th of the dataset). Before running a strategy:

```sh
. ~/models/sop-nlu-trf/env.sh
```

The adapted spaCy models of `spacy-beam` / `spacy-direct` (`SOP_NLU_ADAPTED_TRF_MODEL`, `SOP_NLU_COMPACT_MODEL`)
were lost with `/tmp` and are not rebuilt; the main spaCy strategy does not use them.
