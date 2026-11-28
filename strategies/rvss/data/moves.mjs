// rvss data, step 3: every circuit of the training sets as rvss moves, by the adopted rules ("open at the evidence",
// the `late` conventions of hierarchy-checks/v2/oracle2.mjs), each replayed from the words and the moves alone.
//
//   node strategies/rvss/data/moves.mjs [--in <folder>] [--threads 10]
//
// Reads <in>/distill.jsonl.gz and <in>/mixed.jsonl.gz (build-sets.mjs) and writes <in>/moves-distill.jsonl.gz and
// <in>/moves-mixed.jsonl.gz, one line per line of the set, in its order:
//   {text, file, row, split, origin, accepted_by?, source?, sop, written?, words, moves, replay, replayNormal}
//   sop    = the circuit in the normal form of the benchmark (tests/benchmark/syntax/lib.mjs normalForm), the form a
//            judge sees; `written` = the circuit as the set holds it, when that differs (spaCy writes "thank you" as
//            one discourse value, the normal form as two; the moves place one word per step and join only
//            neighbouring words of keys other than dependent/modifier/auxiliary/negation/discourse)
//   words  = the words of lib/syntax.mjs wordsOf (the units the moves place), as strings
//   moves  = oracle2.mjs derive(text, sop, {late: true}).moves, or null when the oracle derives none
//   replay = "identical" (replay(text, moves) written with writeCircuit has the core, coreOf, of `sop`),
//            "differs", "replay error: ..." or "no derivation: <the oracle's reason>"
//   replayNormal = the replayed circuit has the same normal-form core as `sop`
// The counts also give the derivation from the circuit as written (fromWritten), as hierarchy-checks/v2 measured it.
// A circuit that stands in both sets (a message with no label) is derived once.
// Prints the counts by set, split and origin, and writes <in>/moves.json with them.
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads'
import {createReadStream, writeFileSync} from 'node:fs'
import {createInterface} from 'node:readline'
import {createGunzip, gzipSync} from 'node:zlib'
import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

const thisFile = fileURLToPath(import.meta.url)
const repo = resolve(thisFile, '../../../..')

if (!isMainThread) {
  const {derive, replay, Fail} = await import(join(repo, 'strategies/rvss/hierarchy-checks/v2/oracle2.mjs'))
  const {coreOf, wordsOf} = await import(join(repo, 'lib/syntax.mjs'))
  const {normalForm} = await import(join(repo, 'tests/benchmark/syntax/lib.mjs'))
  // derive + replay one circuit; "identical" = the replayed circuit has the core (coreOf) of the circuit derived from
  const convert = (text, sop) => {
    let d
    try { d = derive(text, sop, {late: true}) }
    catch (error) { return {moves: null, replay: 'no derivation: ' + (error instanceof Fail ? error.message : 'error: ' + error.message)} }
    let out = null, status
    try { out = replay(text, d.moves); status = coreOf(text, out) === coreOf(text, sop) ? 'identical' : 'differs' }
    catch (error) { status = 'replay error: ' + error.message }
    return {moves: d.moves, replay: status, out}
  }
  parentPort.on('message', ({id, items}) => {
    const results = items.map(({text, sop}) => {
      const words = wordsOf(text).map(word => word.text)
      const normal = normalForm(text, sop)
      const written = convert(text, sop)
      const target = normal && normal.sop !== sop ? normal.sop : sop
      const main = target === sop ? written : convert(text, target)
      // the same circuit in the normal form of the benchmark: what a judge sees
      const sameNormal = main.out != null && normal ? normalForm(text, main.out)?.core === normal.core : false
      return {words, normal: target, moves: main.moves, replay: main.replay, replayNormal: sameNormal, replayWritten: written.replay}
    })
    parentPort.postMessage({id, results})
  })
} else {
  const args = process.argv.slice(2)
  const opt = (name, fallback) => { const at = args.indexOf('--' + name); return at >= 0 ? args[at + 1] : fallback }
  const dir = resolve(opt('in', join(repo, '.local-data/rvss')))
  const threads = Number(opt('threads', 10))
  const t0 = performance.now()
  const read = async file => {
    const lines = []
    for await (const line of createInterface({input: createReadStream(join(dir, file)).pipe(createGunzip()), crlfDelay: Infinity})) if (line) lines.push(JSON.parse(line))
    return lines
  }
  const sets = {distill: await read('distill.jsonl.gz'), mixed: await read('mixed.jsonl.gz')}
  // one derivation per distinct (text, circuit)
  const pairKey = line => line.text + '\0' + line.sop
  const unique = new Map()
  for (const lines of Object.values(sets)) for (const line of lines) if (!unique.has(pairKey(line))) unique.set(pairKey(line), {text: line.text, sop: line.sop})
  const items = [...unique.values()]
  console.error(`circuits: distill ${sets.distill.length}, mixed ${sets.mixed.length}, distinct ${items.length}`)
  const CHUNK = 1000, chunks = []
  for (let i = 0; i < items.length; i += CHUNK) chunks.push(items.slice(i, i + CHUNK))
  const results = new Array(chunks.length)
  let next = 0, done = 0
  await new Promise((finish, fail) => {
    let live = 0
    for (let k = 0; k < Math.min(threads, chunks.length); k++) {
      const worker = new Worker(thisFile); live++
      const give = () => { if (next >= chunks.length) { worker.terminate(); return } const id = next++; worker.postMessage({id, items: chunks[id]}) }
      worker.on('message', ({id, results: r}) => { results[id] = r; done++; if (done % 20 === 0) console.error(`${done}/${chunks.length} chunks, ${((performance.now() - t0) / 1000).toFixed(0)} s`); give() })
      worker.on('error', fail)
      worker.on('exit', () => { if (--live === 0) finish() })
      give()
    }
  })
  const byPair = new Map()
  results.flat().forEach((result, i) => byPair.set(pairKey(items[i]), result))
  const summary = {}
  for (const [name, lines] of Object.entries(sets)) {
    const outLines = []
    const counts = {}
    for (const line of lines) {
      const r = byPair.get(pairKey(line))
      const {judged, spacySame, source, ...kept} = line
      outLines.push({...kept, sop: r.normal, ...(r.normal !== line.sop ? {written: line.sop} : {}), ...(source ? {source} : {}), words: r.words, moves: r.moves, replay: r.replay, replayNormal: r.replayNormal})
      const group = line.split + ' ' + (line.origin === 'spacy' ? 'spacy' : 'labels') + ' ' + line.origin
      const c = counts[group] ??= {circuits: 0, writtenInNormalForm: 0, identical: 0, identicalNormalForm: 0, differs: 0, replayError: 0, noDerivation: 0, reasons: {},
        fromWritten: {identical: 0, differs: 0, replayError: 0, noDerivation: 0}, moves: 0, words: 0}
      c.circuits++
      if (r.normal === line.sop) c.writtenInNormalForm++
      if (r.replayNormal) c.identicalNormalForm++
      const w = r.replayWritten
      c.fromWritten[w === 'identical' ? 'identical' : w === 'differs' ? 'differs' : w.startsWith('replay error') ? 'replayError' : 'noDerivation']++
      if (r.replay === 'identical') c.identical++
      else if (r.replay === 'differs') c.differs++
      else if (r.replay.startsWith('replay error')) c.replayError++
      else { c.noDerivation++; const why = r.replay.replace('no derivation: ', ''); c.reasons[why] = (c.reasons[why] ?? 0) + 1 }
      if (r.moves) { c.moves += r.moves.length; c.words += r.words.length }
    }
    for (const c of Object.values(counts)) { c.share = +(100 * c.identical / c.circuits).toFixed(3); c.shareNormalForm = +(100 * c.identicalNormalForm / c.circuits).toFixed(3); c.fromWritten.share = +(100 * c.fromWritten.identical / c.circuits).toFixed(3); c.movesPerWord = +(c.moves / c.words).toFixed(3); delete c.moves; delete c.words }
    summary[name] = Object.fromEntries(Object.entries(counts).sort())
    // joined in pieces: one string of a large set is longer than V8 allows
    const pieces = []
    for (let i = 0; i < outLines.length; i += 20000) pieces.push(Buffer.from(outLines.slice(i, i + 20000).map(line => JSON.stringify(line)).join('\n') + '\n'))
    writeFileSync(join(dir, 'moves-' + name + '.jsonl.gz'), gzipSync(Buffer.concat(pieces)))
  }
  const report = {built: new Date().toISOString(), seconds: Math.round((performance.now() - t0) / 1000), threads, distinctCircuits: items.length, oracle: 'strategies/rvss/hierarchy-checks/v2/oracle2.mjs derive(late) + replay', summary}
  writeFileSync(join(dir, 'moves.json'), JSON.stringify(report, null, 1) + '\n')
  console.log(JSON.stringify(report, null, 1))
}
