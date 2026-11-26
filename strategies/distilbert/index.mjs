import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {fileURLToPath} from 'node:url'
import {renderGraph, tokenizeSource} from './graph.mjs'

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

async function open({
  python = process.env.SOP_NLU_DISTILBERT_PYTHON ?? 'python3',
  modelPath = process.env.SOP_NLU_DISTILBERT_MODEL,
  device = process.env.SOP_NLU_DISTILBERT_DEVICE ?? 'auto',
  workerPath = defaultWorker,
  timeoutMs = 120000
} = {}) {
  if (!modelPath) throw Error('Set SOP_NLU_DISTILBERT_MODEL or pass modelPath.')
  if (!['auto','cpu','cuda'].includes(device)) throw Error('Expected DistilBERT device auto, cpu or cuda.')
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647) {
    throw Error('Expected a positive DistilBERT worker timeout in milliseconds.')
  }
  const child = spawn(python,['-u',workerPath,'--model',modelPath,'--device',device],{stdio:['pipe','pipe','pipe']})
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
  function failure(error) {
    return {analyses:[],analysisDiagnostics:{...diagnostics,status:'error',error:error.message}}
  }

  async function run(text) {
    if (fatal) return failure(fatal)
    if (typeof text !== 'string' || !text.trim()) return failure(Error('Expected a nonempty source string.'))
    const tokens = tokenizeSource(text)
    if (!tokens.length) return {analyses:[],analysisDiagnostics:{...diagnostics,status:'no-graph'}}
    const id = ++requestId
    let response
    try {
      const line = JSON.stringify({id,text,tokens})+'\n'
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
    if (!response.nodes.length) return {analyses:[],analysisDiagnostics:{...diagnostics,status:'no-graph'}}
    try {
      const sop = renderGraph(text,tokens,response.nodes)
      return {analyses:[{sop}],analysisDiagnostics:{...diagnostics,status:'ok'}}
    } catch (error) {
      return failure(error)
    }
  }

  function analyse(text) {
    if (closing) return Promise.resolve(failure(Error('DistilBERT reader is closed.')))
    const next = pending.then(()=>run(text))
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

export const distilBert = {name:'distilbert',open}
