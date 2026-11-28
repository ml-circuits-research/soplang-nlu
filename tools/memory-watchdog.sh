#!/usr/bin/env bash
# Stops GPU jobs before the machine runs out of memory.
#
# Every 5 s it reads MemAvailable from /proc/meminfo (on this machine it also drops when the GPU driver takes
# memory). Below SOP_MEM_LOW_GB (default 15) it stops the newest job registered by tools/gpu-run.sh (SIGTERM,
# then SIGKILL after 15 s) and logs why. Below SOP_MEM_CRITICAL_GB (default 6), with no GPU job left, it stops
# the largest python process of this user. It never touches anything else.
#
# Start it once per boot, detached from any terminal:
#   systemd-run --user --unit=soplang-memwatch tools/memory-watchdog.sh
# Log: SOP_MEM_LOG (default ~/.local/state/soplang-memwatch.log)
set -uo pipefail
low=$(( ${SOP_MEM_LOW_GB:-15} * 1024 * 1024 ))
critical=$(( ${SOP_MEM_CRITICAL_GB:-6} * 1024 * 1024 ))
jobs="${SOP_GPU_JOBS:-/tmp/soplang-gpu-jobs}"
log="${SOP_MEM_LOG:-$HOME/.local/state/soplang-memwatch.log}"
mkdir -p "$(dirname "$log")" "$jobs"
say() { echo "$(date +%FT%T) $*" >> "$log"; }
tree() { echo "$1"; for c in $(ps -o pid= --ppid "$1"); do tree "$c"; done; }  # a process and all its descendants
stop() {  # pid, reason
  say "stopping $1 ($(tr '\0' ' ' < /proc/$1/cmdline 2>/dev/null | cut -c1-200)): $2"
  local all; all=$(tree "$1")
  kill -TERM $all 2>/dev/null
  for _ in $(seq 15); do kill -0 $all 2>/dev/null || return; sleep 1; done
  kill -KILL $all 2>/dev/null
}
say "watchdog started: low ${SOP_MEM_LOW_GB:-15} GB, critical ${SOP_MEM_CRITICAL_GB:-6} GB"
while true; do
  avail=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)
  if (( avail < low )); then
    newest=$(ls -t "$jobs" 2>/dev/null | head -1)
    if [[ -n "$newest" ]] && kill -0 "$newest" 2>/dev/null; then
      stop "$newest" "MemAvailable $((avail / 1024)) MB < low mark"; rm -f "$jobs/$newest"; sleep 10; continue
    fi
    [[ -n "$newest" ]] && rm -f "$jobs/$newest"
    if (( avail < critical )); then
      big=$(ps -u "$(id -u)" -o pid=,rss=,comm= --sort=-rss | awk '$3 ~ /^python/ {print $1; exit}')
      [[ -n "$big" ]] && { stop "$big" "MemAvailable $((avail / 1024)) MB < critical mark, no GPU job left"; sleep 10; continue; }
    fi
  fi
  sleep 5
done
