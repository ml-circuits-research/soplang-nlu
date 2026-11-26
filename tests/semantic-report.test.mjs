import assert from 'node:assert/strict'
import {mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {test} from 'node:test'
import {gzipSync} from 'node:zlib'
import {gradeBand, summarizeReview, writeReviewReport} from './benchmark/meaning-review/report.mjs'

const row = (engine, id, grade, diagnostics = []) => ({
  id, engine, grade, diagnostics, reason: 'Reviewed', candidateIndex: grade === 0 ? null : 0
})

test('summarizes all eleven levels with deterministic shares, bands and secondary diagnostic counts', () => {
  const rows = [
    row('z3', 'a', 0, ['engine error', 'engine error']),
    row('z3', 'b', 7, ['unread detail']),
    row('z3', 'c', 10, ['reference defect']),
    row('prolog', 'a', 8), row('prolog', 'b', 8), row('prolog', 'c', 9)
  ]
  const summary = summarizeReview(rows)
  assert.deepEqual(summarizeReview(rows.toReversed()), summary)
  assert.equal(summary.totalMessages, 3)
  assert.deepEqual(Object.keys(summary.engines), ['prolog', 'z3'])
  assert.deepEqual(Object.values(summary.gradeBands),
    ['red', 'red', 'red', 'red', 'red', 'orange', 'orange', 'orange', 'green', 'green', 'green'])
  assert.equal(gradeBand(10), 'green')
  for (const engine of Object.values(summary.engines)) {
    assert.equal(Object.keys(engine.counts).length, 11)
    assert.equal(Object.values(engine.counts).reduce((sum, count) => sum + count, 0), 3)
    assert.equal(Object.values(engine.roundedPercentages)
      .reduce((sum, value) => sum + Math.round(value * 10), 0), 1000)
  }
  const z3 = summary.engines.z3
  assert.equal(z3.roundedPercentages.L0, 33.4)
  assert.equal(z3.roundedPercentages.L7, 33.3)
  assert.equal(z3.roundedPercentages.L10, 33.3)
  assert.deepEqual(z3.accepted, {count: 1, percentage: 100 / 3, roundedPercentage: 33.3})
  assert.deepEqual(z3.diagnosticsByLevel.L0, {'engine error': 1})
  assert.deepEqual(z3.diagnostics, {'engine error': 1, 'reference defect': 1, 'unread detail': 1})
})

test('writes English percentages, rubric, and separate counts from plain or gzip input', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'meaning-report-'))
  try {
    const rows = [row('z3', 'a', 10, ['reference defect'])]
    const jsonl = rows.map((record) => JSON.stringify(record)).join('\n') + '\n'
    const input = join(dir, 'judgments.jsonl')
    const compressed = join(dir, 'judgments.jsonl.gz')
    const plainOutput = join(dir, 'plain')
    const compressedOutput = join(dir, 'compressed')
    await Promise.all([writeFile(input, jsonl), writeFile(compressed, gzipSync(jsonl))])
    const [plain, zipped] = await Promise.all([
      writeReviewReport(input, plainOutput), writeReviewReport(compressed, compressedOutput)
    ])
    assert.deepEqual(zipped, plain)
    assert.deepEqual((await readdir(compressedOutput)).sort(), ['report.md', 'summary.json'])
    const [report, summary] = await Promise.all(['report.md', 'summary.json']
      .map((file) => readFile(join(compressedOutput, file), 'utf8')))
    assert.match(report, /🔴 L4 \| 0\.0%/)
    assert.match(report, /🟠 L7 \| 0\.0%/)
    assert.match(report, /🟢 L10 \| 100\.0%/)
    assert.match(report, /A second reviewer confirms/)
    assert.match(report, /\| z3 \| L10 \| reference defect \| 1 \|/)
    const [, scoreTable, legend] = report.split('\n\n')
    assert.doesNotMatch(scoreTable, /Reviewed messages|Diagnostic/)
    assert.match(legend, /🔴 L0–L4 .*🟠 L5–L7 .*🟢 L8–L10/)
    assert.deepEqual(JSON.parse(summary), plain)
  } finally {
    await rm(dir, {recursive: true, force: true})
  }
})

test('rejects duplicate strategy-message judgments and invalid levels', () => {
  assert.throws(() => summarizeReview([row('z3', 'a', 0), row('z3', 'a', 1)]), /Duplicate judgment/)
  assert.throws(() => summarizeReview([row('z3', 'a', 11)]), /Invalid semantic grade/)
})
