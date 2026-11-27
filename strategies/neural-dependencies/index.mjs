import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'
import {fileURLToPath} from 'node:url'
import {circuitOf} from './syntax-circuit.mjs'

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
  function request(text, beam = false) {
    if (closed) return Promise.reject(Error('Dependency parser is closed'))
    if (typeof text !== 'string') return Promise.reject(TypeError('Expected a source string'))
    const next = pending.then(async () => {
      child.stdin.write(JSON.stringify(beam ? {text, beam: true} : text) + '\n')
      return read()
    })
    pending = next.catch(() => {})
    return next
  }
  return {
    metadata,
    async parse(text) { return (await request(text)).tokens },
    parseBeam(text) { return request(text, true) },
    async close() {
      closed = true
      await pending
      child.stdin.end()
      await stopped
    }
  }
}

export const spacyDependencies = {name:'spacy', open:openSpacy}

function validateTokens(text, tokens) {
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

export async function openDependencies({syntaxModel = spacyDependencies, ...options} = {}) {
  const backend = await syntaxModel.open(options)
  const parseBeam = typeof backend.parseBeam === 'function' ? async (text) => {
    const {tokens, alternatives} = await backend.parseBeam(text)
    validateTokens(text, tokens)
    if (!Array.isArray(alternatives) || alternatives.length > 3) throw Error('Expected at most three dependency alternatives')
    const lexicalKeys = ['text', 'start', 'end', 'pos', 'tag', 'lemma']
    for (const alternative of alternatives) {
      const {score, tokens: graph} = alternative
      validateTokens(text, graph)
      if (!Number.isFinite(score) || graph.length !== tokens.length || graph.some((token, i) =>
        lexicalKeys.some(key => token[key] !== tokens[i][key]))) {
        throw Error('Beam alternatives must share the source and lexical evidence of the greedy parse')
      }
    }
    return {tokens, alternatives}
  } : undefined
  return {
    metadata: backend.metadata,
    close: () => backend.close(),
    async parse(text) { return validateTokens(text, await backend.parse(text)) },
    ...(parseBeam ? {parseBeam} : {})
  }
}

/**
 * The strategy `neural-dependencies`: the dependency parse of the message, written as it stands
 * as one circuit of the `syntax` schema. It corrects nothing the parser says. It reads no
 * knowledge repository: its only resources are the parser and this package.
 */
async function open({python, model, syntaxModel} = {}) {
  const parser = await openDependencies({python, model, syntaxModel})
  async function analyse(text) {
    if (typeof text !== 'string' || !text.trim()) return {analyses: [], error: 'Expected a nonempty text string.'}
    try {
      const {sop, loose} = circuitOf(text, await parser.parse(text))
      return {analyses: [{sop, loose}]}
    } catch (error) {
      return {analyses: [], error: error instanceof Error ? error.message : String(error)}
    }
  }
  return {analyse, metadata: parser.metadata, close: () => parser.close()}
}

export const neuralDependencies = {name: 'neural-dependencies', schema: 'syntax', open}
