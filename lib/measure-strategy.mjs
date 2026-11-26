// Run one reader on the ordered sample. Evaluation and persistence belong
// outside the measured interval. Call sequentially for competing strategies.
export async function measureStrategy(createReader, texts) {
  const start = performance.now()
  const reader = await createReader()
  const ready = performance.now()
  const results = []
  const latencies = []
  let finished
  try {
    for (const text of texts) {
      const before = performance.now()
      const result = await reader.propose(text)
      latencies.push(performance.now() - before)
      results.push(result)
    }
    finished = performance.now()
  } finally {
    await reader.close()
  }
  const closed = performance.now()
  const sorted = [...latencies].sort((a,b) => a-b)
  const percentile = p => sorted[Math.ceil(sorted.length * p) - 1] ?? null
  const proposalMs = finished - ready
  return {
    results, latencies,
    timing: {
      requests: results.length, workers: 1, startupMs: ready - start, proposalMs,
      shutdownMs: closed - finished, totalMs: closed - start,
      requestsPerSecond: results.length && proposalMs > 0 ? 1000 * results.length / proposalMs : null,
      medianMs: percentile(0.5), p95Ms: percentile(0.95)
    }
  }
}
