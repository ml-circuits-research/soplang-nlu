#!/usr/bin/env bash
# Runs one GPU job at a time on this machine, so that trainings never pile up and exhaust memory.
#
# Why: the machine (DGX Spark class) shares ~125 GB between the CPU and the GPU, and memory taken by the GPU
# driver is not shown as any process's memory. On 2026-11-28 several rVSS trainings and decodes ran at once on
# the GPU; the driver held ~100 GB, the kernel's out-of-memory killer could only stop small desktop services,
# and the machine froze. See tools/README.md.
#
# What this launcher does:
#   - waits for a machine-wide lock, so only one GPU job runs at a time (the queue order is first come);
#   - starts the job first in line for the out-of-memory killer (oom_score_adj 1000), so that under pressure
#     the job dies and frees its GPU memory instead of the system freezing;
#   - caps PyTorch's GPU memory to SOP_GPU_MEM_FRACTION of the device (default 0.4) through
#     PYTORCH_CUDA_ALLOC_CONF=per_process_memory_fraction (checked on torch 2.14: an allocation over the cap fails);
#   - registers the job for tools/memory-watchdog.sh, which stops the newest job when memory runs low.
#
# Usage:  tools/gpu-run.sh <command> [args...]
#   e.g.  tools/gpu-run.sh python strategies/rvss/model/m2a.py --D 1024
# Settings: SOP_GPU_MEM_FRACTION (0.4), SOP_GPU_LOCK (/tmp/soplang-gpu.lock), SOP_GPU_JOBS (/tmp/soplang-gpu-jobs)
set -euo pipefail
lock="${SOP_GPU_LOCK:-/tmp/soplang-gpu.lock}"
jobs="${SOP_GPU_JOBS:-/tmp/soplang-gpu-jobs}"
mkdir -p "$jobs"
fraction="${SOP_GPU_MEM_FRACTION:-0.4}"
export PYTORCH_CUDA_ALLOC_CONF="per_process_memory_fraction:$fraction${PYTORCH_CUDA_ALLOC_CONF:+,$PYTORCH_CUDA_ALLOC_CONF}"
exec 9>"$lock"
if ! flock -n 9; then
  echo "gpu-run: waiting for the GPU lock (another GPU job is running: $(cat "$jobs"/* 2>/dev/null | head -1))" >&2
  flock 9
fi
echo 1000 > /proc/self/oom_score_adj
echo "$$ $(date +%FT%T) $*" > "$jobs/$$"
trap 'rm -f "$jobs/$$"' EXIT
"$@"
