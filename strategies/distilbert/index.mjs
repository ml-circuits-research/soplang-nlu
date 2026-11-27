// The DistilBERT strategy: a fine-tuned DistilBERT model in a persistent Python worker predicts
// the structure of one message, and `syntax.mjs` writes that prediction as one circuit of the
// `syntax` schema. Nothing is read from a knowledge repository.
import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {fileURLToPath} from 'node:url'
import {modelTokens, writeSyntax} from './syntax.mjs'

const defaultWorker = fileURLToPath(new URL('./worker.py',import.meta.url))

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
 * Open the worker and return {analyse, close}.
 * @param tokenize the tokens of a message, as the model was trained to receive them
 * @param render (text, tokens, reply) => the circuit as text; it may throw
 * @param detail ask the worker for the ranked choices beside each prediction
 */
async function openWorker({
  python = process.env.SOP_NLU_DISTILBERT_PYTHON ?? 'python3',
  modelPath = process.env.SOP_NLU_DISTILBERT_MODEL,
  device = process.env.SOP_NLU_DISTILBERT_DEVICE ?? 'auto',
  workerPath = defaultWorker,
  timeoutMs = 120000
} = {}, {modelFlag = '--model', tokenize, render, detail = false} = {}) {
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
  // `error` is what the common reader of a syntax strategy reports; the diagnostics keep the older shape.
  function failure(error, status = 'error') {
    return {analyses:[],error:error.message,analysisDiagnostics:{...diagnostics,status,error:error.message}}
  }

  async function run(text,draftNodes) {
    if (fatal) return failure(fatal)
    if (typeof text !== 'string' || !text.trim()) return failure(Error('Expected a nonempty source string.'))
    const tokens = tokenize(text)
    if (!tokens.length) return failure(Error('The message has no words.'),'no-graph')
    const id = ++requestId
    let response
    try {
      const line = JSON.stringify({id,text,tokens,...(detail ? {detail:true} : {}),...(draftNodes === undefined ? {} : {draftNodes})})+'\n'
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
      return failure(error)
    }
    if (typeof response.error === 'string') return failure(Error(response.error))
    if (response.status === 'input-too-long') return failure(Error('The message is longer than the model can read.'),'no-graph')
    if (!response.nodes.length) return failure(Error('The model found no node in the message.'),'no-graph')
    try {
      const sop = render(text,tokens,response)
      return {analyses:[{sop}],analysisDiagnostics:{...diagnostics,status:'ok'}}
    } catch (error) {
      return failure(error)
    }
  }

  function analyse(text,draftNodes) {
    if (closing) return Promise.resolve(failure(Error('DistilBERT reader is closed.')))
    const next = pending.then(()=>run(text,draftNodes))
    pending = next.catch(()=>{})
    return next
  }

  return {analyse,propose:analyse,async close() {
    closing ??= pending.then(async ()=>{
      child.stdin.end()
      try { await deadline(exited,timeoutMs,'DistilBERT shutdown') }
      catch (error) { terminate(error); await exited }
    })
    await closing
  }}
}

/**
 * The strategy. `open` takes {python, modelPath, device, workerPath, timeoutMs, attachmentMargin};
 * the first three can also be given as SOP_NLU_DISTILBERT_PYTHON, SOP_NLU_DISTILBERT_MODEL and
 * SOP_NLU_DISTILBERT_DEVICE. `analyse(text)` returns {analyses: [{sop}]} with one circuit of the
 * syntax schema, or {analyses: [], error}.
 */
export const distilBert = {
  name:'distilbert',
  schema:'syntax',
  open:({attachmentMargin,...options} = {}) => openWorker(options,{detail:true,tokenize:modelTokens,
    render:(text,tokens,reply) => writeSyntax(text,tokens,reply,attachmentMargin === undefined ? {} : {attachmentMargin})})
}

/**
 * Not used by the strategy any more: the same worker with its nodes written in the old `nlu`
 * schema. Kept for the experiments that open other workers through it; `graph.mjs` is loaded
 * only when this is called.
 */
export async function openGraphWorker(options = {}, extra = {}) {
  const {renderGraph, tokenizeSource} = await import('./graph.mjs')
  return openWorker(options,{...extra,tokenize:tokenizeSource,render:(text,tokens,reply) => renderGraph(text,tokens,reply.nodes)})
}
