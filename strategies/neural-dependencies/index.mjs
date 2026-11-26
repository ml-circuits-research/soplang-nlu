import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {fileURLToPath} from 'node:url'

const worker = fileURLToPath(new URL('./worker.py',import.meta.url))

/** Transport for optional dependency evidence. Producing an SOP graph is the strategy's job. */
async function openSpacy({
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

export const spacyDependencies = {name:'spacy', open:openSpacy}

export async function openDependencies({syntaxModel = spacyDependencies, ...options} = {}) {
  const backend = await syntaxModel.open(options)
  return {
    metadata: backend.metadata,
    close: () => backend.close(),
    async parse(text) {
      const tokens = await backend.parse(text)
      let previousEnd = 0
      if (!Array.isArray(tokens)) throw TypeError('Dependency model must return a token array')
      for (const [index, token] of tokens.entries()) {
        if (token.i !== index || !Number.isInteger(token.start) || !Number.isInteger(token.end) ||
            token.start < previousEnd || token.end <= token.start || token.end > text.length ||
            text.slice(token.start, token.end) !== token.text ||
            !Number.isInteger(token.head) || token.head < 0 || token.head >= tokens.length ||
            !['pos','tag','dep','lemma'].every(key => typeof token[key] === 'string')) {
          throw Error('Invalid dependency token, source boundary or head at index ' + index)
        }
        previousEnd = token.end
      }
      return tokens
    }
  }
}
