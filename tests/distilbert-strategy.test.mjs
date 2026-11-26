import assert from 'node:assert/strict'
import {mkdtemp,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {test} from 'node:test'
import {createReader} from '../lib/index.mjs'
import {hasCompleteSource} from '../lib/check-analysis.mjs'
import {distilBert} from '../strategies/distilbert/index.mjs'

const knowledgeDir = process.env.SOP_KNOWLEDGE_DIR ??
  fileURLToPath(new URL('../../sop-knowledge-worlds',import.meta.url))

const fixture = `import json, sys

def write(value):
    print(json.dumps(value), flush=True)

write({"ready": True, "device": "cpu", "model": "protocol fixture"})
for line in sys.stdin:
    request = json.loads(line)
    rid = request["id"]
    tokens = request["tokens"]
    text = request["text"]
    if text == "Mismatched.":
        write({"id": rid + 1, "nodes": []})
        continue
    if text == "Worker error.":
        write({"id": rid, "error": "fixture request failed"})
        continue
    if text == "Invalid span.":
        write({"id": rid, "nodes": [{"anchor": 0, "type": "nlu.clause", "attrs": [{"key": "predicate", "start": 0, "end": 100}]}]})
        continue
    if text == "No graph.":
        write({"id": rid, "nodes": []})
        continue
    if text == "Move 😀." and (tokens[1]["start"], tokens[1]["end"]) != (5, 7):
        write({"id": rid, "error": "expected UTF-16 offsets"})
        continue
    write({"id": rid, "nodes": [
        {"anchor": 0, "type": "nlu.clause", "attrs": [
            {"key": "form", "atom": "imperative"},
            {"key": "predicate", "start": 0, "end": 1},
            {"key": "direct_object", "target": 1},
            {"key": "terminator", "start": len(tokens) - 1, "end": len(tokens)}
        ]},
        {"anchor": 1, "type": "nlu.entity", "attrs": [{"key": "head", "start": 1, "end": 2}]}
    ]})
`

test('DistilBERT adapter serializes worker replies and keeps exact source checks',async () => {
  const directory = await mkdtemp(join(tmpdir(),'sop-distilbert-'))
  const workerPath = join(directory,'fixture.py')
  let reader
  try {
    await writeFile(workerPath,fixture)
    reader = await createReader({strategy:distilBert,knowledgeDir,workerPath,modelPath:directory})
    const [covered,partial] = await Promise.all([reader.propose('Move 😀.'),reader.propose('Move it now.')])
    assert.equal(covered.engine,'distilbert')
    assert.equal(covered.candidates.length,1)
    assert.equal(covered.analysisDiagnostics.device,'cpu')
    assert.ok(hasCompleteSource(covered.candidates[0].check))
    assert.match(covered.candidates[0].sop,/head="😀"/u)
    assert.equal(partial.candidates.length,1)
    assert.equal(hasCompleteSource(partial.candidates[0].check),false)
    assert.equal(partial.candidates[0].check.sourceGaps.materialUncovered,1)

    const failed = await reader.propose('Worker error.')
    assert.equal(failed.error,'fixture request failed')
    assert.equal((await reader.propose('No graph.')).analysisDiagnostics.status,'no-graph')
    assert.match((await reader.propose('Invalid span.')).error,/Invalid evidence span/)
    assert.equal((await reader.propose('Move it.')).candidates.length,1)

    assert.match((await reader.propose('Mismatched.')).error,/unexpected request ID/)
    assert.match((await reader.propose('Move it.')).error,/unexpected request ID/)
  } finally {
    await reader?.close()
    await rm(directory,{recursive:true,force:true})
  }
})
