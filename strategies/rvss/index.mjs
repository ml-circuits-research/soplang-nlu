// The rvss strategy (DESIGN.md, third revision): a pilot walks the words and moves stars between
// constellations (open, place, close, claim, gather, reopen, point); its decisions are VSA scores (kinds from a
// permutation-coded window of fixed word stars, views bundled by parts, prototypes per outcome, choice stars),
// trained to reproduce the spaCy strategy's circuits (distillation). The circuit is read back from the pilot's
// own constellations and atlas (the m1star decoder) and written with writeCircuit. A Python worker (numpy, CPU,
// one thread) holds the model.
//   options / environment: modelPath (SOP_NLU_RVSS_MODEL, default .local-models/rvss/current),
//   python (SOP_NLU_RVSS_PYTHON, default python3), timeoutMs.
import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {fileURLToPath} from 'node:url'
import {wordsOf} from '../../lib/syntax.mjs'
import {writeNodes} from './writer.mjs'

const workerPath = fileURLToPath(new URL('./worker.py', import.meta.url))
export const installedModel = fileURLToPath(new URL('../../.local-models/rvss/current', import.meta.url))

function inputOf(text) {
  const ws = wordsOf(text); let prev = 0; const gaps = []
  for (const w of ws) { gaps.push(text.slice(prev, w.start).replace(/\s+/gu, '')); prev = w.end }
  gaps.push(text.slice(prev).replace(/\s+/gu, ''))
  return {words: ws.map(w => w.text), gaps}
}

async function openWorker({python = process.env.SOP_NLU_RVSS_PYTHON ?? 'python3', modelPath = process.env.SOP_NLU_RVSS_MODEL ?? installedModel, timeoutMs = 60000} = {}) {
  const child = spawn(python, ['-u', workerPath, '--model', modelPath], {stdio: ['pipe', 'pipe', 'pipe']})
  let stderr = ''
  child.stderr.setEncoding('utf8').on('data', c => { stderr = (stderr + c).slice(-2000) })
  child.stdin.on('error', () => {})
  const lines = createInterface({input: child.stdout})[Symbol.asyncIterator]()
  const read = async what => {
    let timer
    const r = await Promise.race([lines.next(), new Promise((_, no) => { timer = setTimeout(() => no(Error('rvss ' + what + ' timed out')), timeoutMs) })]).finally(() => clearTimeout(timer))
    if (r.done) throw Error('rvss worker exited: ' + stderr.trim())
    return JSON.parse(r.value)
  }
  const ready = await read('startup')
  if (ready.ready !== true) throw Error('rvss worker not ready: ' + stderr.trim())
  let pending = Promise.resolve(), id = 0
  function ask(input) {
    const next = pending.then(async () => {
      const req = {id: ++id, ...input}
      child.stdin.write(JSON.stringify(req) + '\n')
      const res = await read('reading')
      if (res.id !== req.id) throw Error('rvss worker answered another request')
      return res
    })
    pending = next.catch(() => {})
    return next
  }
  return {ask, ready, close: async () => { child.stdin.end(); child.kill() }}
}

export const rvss = {
  name: 'rvss',
  schema: 'syntax',
  async open(options = {}) {
    const worker = await openWorker(options)
    const diagnostics = {projector: 'rvss', device: worker.ready.device, model: worker.ready.model, kind: worker.ready.kind}
    async function analyse(text) {
      try {
        const input = inputOf(text)
        if (!input.words.length) throw Object.assign(Error('The message has no words.'), {status: 'no-graph'})
        const res = await worker.ask(input)
        if (res.error) throw Error(res.error)
        return {analyses: [{sop: writeNodes(text, res.nodes)}], analysisDiagnostics: {...diagnostics, status: 'ok', readback: res.readback, msPilot: res.ms_pilot, msReadback: res.ms_readback}}
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {analyses: [], error: message, analysisDiagnostics: {...diagnostics, status: error?.status ?? 'error', error: message}}
      }
    }
    return {analyse, propose: analyse, close: worker.close}
  }
}
export default rvss
