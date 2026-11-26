import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {fileURLToPath} from 'node:url'

const worker = fileURLToPath(new URL('./worker.py',import.meta.url))

/** Transport for optional dependency evidence. Producing an SOP graph is the strategy's job. */
export async function openDependencies({
  python = process.env.SOP_NLU_SYNTAX_PYTHON || 'python3',
  model = process.env.SOP_NLU_SYNTAX_MODEL || 'en_core_web_sm'
} = {}) {
  const child = spawn(python, ['-u',worker,model], {stdio:['pipe','pipe','pipe']})
  let diagnostic = ''
  child.stderr.setEncoding('utf8').on('data', data => { diagnostic = (diagnostic + data).slice(-2000) })
  child.stdin.on('error', () => {})
  const lines = createInterface({input:child.stdout})[Symbol.asyncIterator]()
  const stopped = new Promise(resolve => {
    child.once('error',error => resolve(error.message))
    child.once('close',(code,signal) => resolve(signal ?? code))
  })
  async function read() {
    const line = await lines.next()
    if (line.done) throw Error('Dependency parser exited: ' + (diagnostic.trim() || await stopped))
    const message = JSON.parse(line.value)
    if (message.error) throw Error('Dependency parser: ' + message.error)
    return message
  }
  let metadata
  try {
    metadata = (await read()).metadata
    if (!metadata) throw Error('Missing dependency parser metadata')
  } catch (error) {
    child.stdin.end()
    await stopped
    throw error
  }
  let pending = Promise.resolve()
  let closed = false
  return {
    metadata,
    parse(text) {
      if (closed) return Promise.reject(Error('Dependency parser is closed'))
      if (typeof text !== 'string') return Promise.reject(TypeError('Expected a source string'))
      const next = pending.then(async () => {
        child.stdin.write(JSON.stringify(text) + '\n')
        const {tokens} = await read()
        if (!Array.isArray(tokens) || tokens.some((token,index) =>
          token.i !== index || text.slice(token.start,token.end) !== token.text ||
          !Number.isInteger(token.head) || token.head < 0 || token.head >= tokens.length)) {
          throw Error('Invalid dependency token boundary or reference')
        }
        return tokens
      })
      pending = next.catch(() => {})
      return next
    },
    async close() {
      closed = true
      await pending
      child.stdin.end()
      await stopped
    }
  }
}
