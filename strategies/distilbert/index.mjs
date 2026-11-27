// The DistilBERT strategy: a DistilBERT model trained on circuits of the `syntax` schema, in a
// persistent Python worker, predicts the wires of one message, the key of every word and the
// ties; `circuit.mjs` writes that prediction as one circuit. Nothing is read from a knowledge
// repository, and nothing that was learned from the older `nlu` annotations is used.
import {spawn} from 'node:child_process'
import {existsSync, readFileSync} from 'node:fs'
import {createInterface} from 'node:readline'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {modelTokens} from './targets.mjs'
import {writeSyntaxCircuit} from './circuit.mjs'

const syntaxWorker = fileURLToPath(new URL('./syntax_worker.py',import.meta.url))
const olderWorker = fileURLToPath(new URL('./worker.py',import.meta.url))
// where retrain.mjs puts the checkpoint; the weights are not part of the package
export const installedModel = fileURLToPath(new URL('../../.local-models/distilbert/syntax-v1/checkpoint',import.meta.url))
export const modelFormat = 'syntax-distilbert-v1'

async function deadline(action, timeoutMs, description) {
  let timer
  try {
    return await Promise.race([action,new Promise((_,reject)=>{
      timer = setTimeout(()=>reject(Error(description + ' timed out.')),timeoutMs)
    })])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Open a worker and return {ask, diagnostics, close}. `ask(text, fields)` sends one message with
 * its tokens and returns {tokens, reply}; it throws when the worker has no answer for it.
 * @param tokenize the tokens of a message, as the model was trained to receive them
 */
async function openWorker({
  python = process.env.SOP_NLU_DISTILBERT_PYTHON ?? 'python3',
  modelPath,
  device = process.env.SOP_NLU_DISTILBERT_DEVICE ?? 'auto',
  workerPath,
  timeoutMs = 120000
} = {}, {modelFlag = '--model', tokenize} = {}) {
  if (!modelPath) throw Error('Set SOP_NLU_DISTILBERT_MODEL or pass modelPath.')
  if (!['auto','cpu','cuda'].includes(device)) throw Error('Expected DistilBERT device auto, cpu or cuda.')
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) {
    throw Error('Expected a positive DistilBERT worker timeout in milliseconds.')
  }
  const child = spawn(python,['-u',workerPath,...(modelFlag ? [modelFlag] : []),modelPath,'--device',device],{stdio:['pipe','pipe','pipe']})
  let stderr = ''
  child.stderr.setEncoding('utf8').on('data',chunk=>{ stderr = (stderr + chunk).slice(-2000) })
  child.stdin.on('error',()=>{})
  const output = createInterface({input:child.stdout})[Symbol.asyncIterator]()
  const exited = new Promise(resolve=>{
    child.once('error',error=>resolve(error.message))
    child.once('close',(code,signal)=>resolve(signal ?? 'exit ' + code))
  })
  let fatal
  function terminate(error) {
    fatal ??= error
    child.kill('SIGKILL')
  }
  async function read(description) {
    const line = await deadline(output.next(),timeoutMs,description)
    if (line.done) throw Error('DistilBERT worker exited: ' + (stderr.trim() || await exited))
    let message
    try { message = JSON.parse(line.value) }
    catch { throw Error('DistilBERT worker returned malformed JSON.') }
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      throw Error('DistilBERT worker returned an invalid message.')
    }
    return message
  }

  let ready
  try {
    ready = await read('DistilBERT startup')
    if (ready.ready !== true) throw Error(ready.error ?? 'DistilBERT worker did not report readiness.')
  } catch (error) {
    terminate(error)
    await exited
    throw error
  }

  const diagnostics = {projector:'distilbert',device:ready.device,model:ready.model,
    ...(ready.metadata ? {metadata:ready.metadata} : {})}
  let pending = Promise.resolve()
  let closing
  let requestId = 0
  const none = message => Object.assign(Error(message),{status:'no-graph'})

  async function run(text,fields) {
    if (fatal) throw fatal
    if (typeof text !== 'string' || !text.trim()) throw Error('Expected a nonempty source string.')
    const tokens = tokenize(text)
    if (!tokens.length) throw none('The message has no words.')
    const id = ++requestId
    let response
    try {
      const line = JSON.stringify({id,text,tokens,...fields})+'\n'
      await deadline(new Promise((resolve,reject)=>{
        child.stdin.write(line,error=>error ? reject(error) : resolve())
      }),timeoutMs,'DistilBERT request write')
      response = await read('DistilBERT inference')
      if (response.id !== id) throw Error('DistilBERT worker returned an unexpected request ID.')
      if (typeof response.error !== 'string' && !Array.isArray(response.nodes)) {
        throw Error('DistilBERT worker returned no graph array.')
      }
    } catch (error) {
      terminate(error)
      throw error
    }
    if (typeof response.error === 'string') throw Error(response.error)
    if (response.status === 'input-too-long') throw none('The message is longer than the model can read.')
    if (!response.nodes.length) throw none('The model found no wire in the message.')
    return {tokens,reply:response}
  }

  function ask(text,fields = {}) {
    if (closing) return Promise.reject(Error('DistilBERT reader is closed.'))
    const next = pending.then(()=>run(text,fields))
    pending = next.catch(()=>{})
    return next
  }

  return {ask,diagnostics,async close() {
    closing ??= pending.then(async ()=>{
      child.stdin.end()
      try { await deadline(exited,timeoutMs,'DistilBERT shutdown') }
      catch (error) { terminate(error); await exited }
    })
    await closing
  }}
}

/**
 * Open the syntax model. The checkpoint is `modelPath`, else SOP_NLU_DISTILBERT_MODEL, else the one
 * retrain.mjs installed under .local-models/distilbert/syntax-v1. A checkpoint that was trained
 * on the older `nlu` annotations is refused.
 * @returns {predict(text, {nodeThreshold}?) → {tokens, prediction}, thresholds: {node, tie}, diagnostics, close}
 */
export async function openSyntaxModel({modelPath = process.env.SOP_NLU_DISTILBERT_MODEL, workerPath = syntaxWorker, ...options} = {}) {
  const checkpoint = modelPath ?? (existsSync(join(installedModel,'manifest.json')) ? installedModel : undefined)
  if (!checkpoint) throw Error('No checkpoint of the syntax model is installed. Train one with strategies/distilbert/retrain.mjs, or set SOP_NLU_DISTILBERT_MODEL or pass modelPath.')
  let manifest = null
  if (workerPath === syntaxWorker) {
    const file = join(checkpoint,'manifest.json')
    if (!existsSync(file)) throw Error('There is no checkpoint of the syntax model at ' + checkpoint + ' (no manifest.json).')
    manifest = JSON.parse(readFileSync(file,'utf8'))
    if (manifest.format !== modelFormat) {
      throw Error(`The checkpoint at ${checkpoint} is no syntax model (format ${JSON.stringify(manifest.format)}, expected ${JSON.stringify(modelFormat)}). ` +
        'A checkpoint trained on the older nlu annotations is not read any more.')
    }
  }
  const worker = await openWorker({...options,modelPath:checkpoint,workerPath},{tokenize:modelTokens})
  return {
    thresholds:{node:manifest?.nodeThreshold ?? .5,tie:manifest?.tieThreshold ?? .5},
    diagnostics:worker.diagnostics,
    async predict(text,{nodeThreshold} = {}) {
      const {tokens,reply} = await worker.ask(text,nodeThreshold === undefined ? {} : {nodeThreshold})
      return {tokens,prediction:reply}
    },
    close:worker.close
  }
}

/**
 * The strategy. `open` takes {python, modelPath, device, workerPath, timeoutMs, nodeThreshold, tie};
 * the first three can also be given as SOP_NLU_DISTILBERT_PYTHON, SOP_NLU_DISTILBERT_MODEL and
 * SOP_NLU_DISTILBERT_DEVICE. The two thresholds are those chosen at training unless given.
 * `analyse(text)` returns {analyses: [{sop}]} with one circuit of the syntax schema, or
 * {analyses: [], error}.
 */
export const distilBert = {
  name:'distilbert',
  schema:'syntax',
  async open({nodeThreshold,tie,...options} = {}) {
    const model = await openSyntaxModel(options)
    const call = nodeThreshold === undefined ? {} : {nodeThreshold}
    const writing = {tie:tie ?? model.thresholds.tie}
    async function analyse(text) {
      try {
        const {tokens,prediction} = await model.predict(text,call)
        return {analyses:[{sop:writeSyntaxCircuit(text,tokens,prediction,writing)}],analysisDiagnostics:{...model.diagnostics,status:'ok'}}
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {analyses:[],error:message,analysisDiagnostics:{...model.diagnostics,status:error?.status ?? 'error',error:message}}
      }
    }
    return {analyse,propose:analyse,close:model.close}
  }
}

/**
 * Not used by the strategy: the worker of the older model (worker.py), with its nodes written in
 * the old `nlu` schema. Kept for the experiments that open other workers through it; `graph.mjs`
 * is loaded only when this is called.
 */
export async function openGraphWorker({modelPath = process.env.SOP_NLU_DISTILBERT_MODEL, workerPath = olderWorker, ...options} = {}, extra = {}) {
  const {renderGraph, tokenizeSource} = await import('./graph.mjs')
  const worker = await openWorker({...options,modelPath,workerPath},{...extra,tokenize:tokenizeSource})
  async function analyse(text,draftNodes) {
    try {
      const {tokens,reply} = await worker.ask(text,draftNodes === undefined ? {} : {draftNodes})
      return {analyses:[{sop:renderGraph(text,tokens,reply.nodes)}],analysisDiagnostics:{...worker.diagnostics,status:'ok'}}
    } catch (error) {
      return {analyses:[],error:error.message,analysisDiagnostics:{...worker.diagnostics,status:error.status ?? 'error',error:error.message}}
    }
  }
  return {analyse,propose:analyse,close:worker.close}
}
