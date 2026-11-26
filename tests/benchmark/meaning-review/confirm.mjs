import {spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {gunzipSync} from 'node:zlib'
import {createVerifier} from '../../../strategies/z3/src/verify/check.mjs'

const [mode = 'all', directory = '/tmp/webmeet-nlu-review', installation = process.env.SOP_KNOWLEDGE_DIR] = process.argv.slice(2)
if (!['manual', 'checkpoint', 'primary', 'rescue', 'all'].includes(mode) || !installation) {
  throw Error('Usage: node confirm.mjs manual|checkpoint|primary|rescue|all REVIEW_DIRECTORY SOP_KNOWLEDGE_DIRECTORY')
}

const review = resolve(directory)
const packets = JSON.parse(gunzipSync(readFileSync(join(review, 'packets.json.gz'))))
const byId = new Map(packets.map(packet => [packet.id, packet]))
const byIndex = new Map(packets.map(packet => [packet.rowIndex, packet]))
const jsonl = path => readFileSync(path, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
const nominees = new Map()
function nominate(packet, candidate) {
  if (!packet || !Number.isSafeInteger(candidate) || !packet.circuits[candidate]) {
    throw Error('Invalid confirmation nomination')
  }
  nominees.set(packet.rowIndex + ':' + candidate, {packet, candidate})
}

if (mode === 'manual' || mode === 'all') {
  for (const label of ['edge', 'prolog', 'z3', 'reader-errors']) {
    const path = '/tmp/wm-sem-' + label + '.jsonl'
    if (!existsSync(path)) continue
    for (const row of jsonl(path)) {
      if (row.grade !== 'L4' || !row.referenceIssue || !Number.isSafeInteger(row.candidateIndex)) continue
      const packet = byId.get(row.id)
      nominate(packet, packet?.memberships[row.engine]?.original[row.candidateIndex])
    }
  }
}
function nominatePrimary(rows) {
  for (const row of rows) {
    if (!['L10', 10, '10'].includes(row.grade)) continue
    const packet = byIndex.get(row.rowIndex)
    if (!packet?.groups[row.group]?.includes(row.candidate)) {
      throw Error('Confirmation nomination is not eligible in its original group')
    }
    nominate(packet, row.candidate)
  }
}
if (mode === 'primary' || mode === 'all') nominatePrimary(jsonl(join(review, 'full.jsonl')))
const rescuePath = join(review, 'rescue.jsonl')
if (mode === 'rescue' || mode === 'all' && existsSync(rescuePath)) nominatePrimary(jsonl(rescuePath))
if (mode === 'checkpoint') {
  const checkpointDirectories = readdirSync(review, {withFileTypes:true})
    .filter(item => item.isDirectory() && item.name.endsWith('-batches'))
  for (const directory of checkpointDirectories) {
    const batches = join(review, directory.name)
    for (const name of readdirSync(batches).filter(name => /^[a-f0-9]+\.json$/.test(name)).sort()) {
      nominatePrimary(JSON.parse(readFileSync(join(batches, name), 'utf8')).results)
    }
  }
}

const verifier = await createVerifier({knowledgeDir: resolve(installation)})
const prompts = readFileSync(new URL('./confirm.prompt.md', import.meta.url), 'utf8')
const model = 'gpt-6.2-sol'
const schema = fileURLToPath(new URL('./confirm.schema.json', import.meta.url))
const policy = createHash('sha256').update(model).update(prompts).update(readFileSync(schema)).digest('hex')
const work = join(review, 'confirmation-work')
const auditFile = join(review, 'confirmation-audit.jsonl')
const metadata = join(review, 'confirmation-environment.json')
const output = join(review, 'confirmation.jsonl')
mkdirSync(work, {recursive: true})
writeFileSync(metadata, JSON.stringify({model, reasoningEffort:'low', ephemeral:true, sandbox:'read-only', policy},
  null, 2) + '\n')
const checked = new Map(existsSync(auditFile) ? jsonl(auditFile).filter(entry => entry.policy === policy)
  .map(entry => [entry.signature, entry]) : [])

function checkedCircuit(text, sop) {
  const result = verifier.check(text, sop)
  return {sop, schemaValid: result.schemaValid === true}
}

const records = new Map()
for (const nomination of nominees.values()) {
  const {packet, candidate} = nomination
  const sop = index => packet.circuits[index].map(line => packet.lines[line]).join('\n')
  const references = [...new Set(packet.references.map(sop))].sort()
  const candidateSop = sop(candidate)
  const signature = createHash('sha256').update(JSON.stringify([policy, packet.text, candidateSop, references])).digest('hex')
  if (!records.has(signature)) {
    records.set(signature, {signature, nominations: [], input: {
      key: records.size, text: packet.text, candidate: checkedCircuit(packet.text, candidateSop),
      references: references.map(reference => checkedCircuit(packet.text, reference))
    }})
  }
  records.get(signature).nominations.push({rowIndex: packet.rowIndex, candidate})
}

function request(batch, basename) {
  const resultPath = join(work, basename + '.result.json')
  const logPath = join(work, basename + '.log')
  rmSync(resultPath, {force: true})
  return new Promise((complete, reject) => {
    const child = spawn('codex', ['-a', 'never', 'exec', '--ephemeral', '--sandbox', 'read-only',
      '--skip-git-repo-check', '--ignore-user-config', '--ignore-rules', '--color', 'never',
      '--cd', work, '--model', model, '-c', 'model_reasoning_effort="low"', '--output-schema', schema,
      '--output-last-message', resultPath, '-'], {stdio: ['pipe', 'pipe', 'pipe']})
    const timeout = setTimeout(() => child.kill('SIGTERM'), 180_000)
    child.stdin.on('error', () => {})
    child.on('error', error => {
      clearTimeout(timeout)
      reject(error)
    })
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', chunk => appendFileSync(logPath, chunk))
    }
    child.on('close', code => {
      clearTimeout(timeout)
      if (code !== 0) return reject(Error('Codex exited ' + code + ' in ' + logPath))
      try { complete(JSON.parse(readFileSync(resultPath, 'utf8')).results) }
      catch (error) { reject(error) }
    })
    child.stdin.end(prompts + '\nCases (one complete JSON array):\n' + JSON.stringify(batch.map(record => record.input)))
  })
}

const ordinary = /^L[0-9]$/
const groundedReason = result => result.reason + ' The source reads ' + JSON.stringify(result.sourceQuote) +
  '. The candidate encodes ' + JSON.stringify(result.candidateQuote) + '.'
function grade(record, result) {
  const {input, signature} = record
  if (!result || !ordinary.test(result.fallbackGrade) || !result.reason?.trim() ||
      !Array.isArray(result.defects) || !(ordinary.test(result.grade) || result.grade === 'L10')) {
    throw Error('Malformed judgment for key ' + input.key)
  }
  if (!input.candidate.schemaValid) {
    return {signature, grade:'L0', reason:'The candidate did not pass native SOP schema verification.',
      referenceIssue:null, reviewer:result}
  }
  const exact = input.references.some(reference => reference.sop.trim() === input.candidate.sop.trim())
  if (exact && ['L8', 'L9', 'L10'].includes(result.grade)) {
    return {signature, grade:'L9', reason:result.reason, referenceIssue:null, reviewer:result}
  }
  if (result.grade === 'L10') {
    const evidence = input.references.length > 0 && result.defects.length === input.references.length &&
      new Set(result.defects.map(entry => entry.referenceIndex)).size === input.references.length &&
      result.defects.every(({referenceIndex, quote, defect}) =>
        quote?.trim() && defect?.trim() && input.references[referenceIndex]?.sop.includes(quote)) &&
      result.sourceQuote?.trim() && input.text.includes(result.sourceQuote) &&
      result.candidateQuote?.trim() && input.candidate.sop.includes(result.candidateQuote) &&
      result.fallbackGrade === 'L8'
    if (!evidence) {
      return {signature, grade:result.fallbackGrade === 'L9' ? 'L8' : result.fallbackGrade,
        reason:result.reason + ' The material-defect confirmation lacked verifiable quoted evidence.',
        referenceIssue:null, reviewer:result}
    }
    return {signature, grade:'L10', reason:groundedReason(result),
      referenceIssue:result.defects.map(({referenceIndex, quote, defect}) =>
        'Reference ' + (referenceIndex + 1) + ' ' + JSON.stringify(quote) + ' — ' + defect).join('\n'),
      reviewer:result}
  }
  return {signature, grade:result.grade === 'L9' ? 'L8' : result.grade, reason:result.reason, referenceIssue:null, reviewer:result}
}

const pending = [...records.values()].filter(record => !checked.has(record.signature))
const batchWidth = 8
const batches = Array.from({length: Math.ceil(pending.length / batchWidth)}, (_, i) =>
  pending.slice(i * batchWidth, (i + 1) * batchWidth))
let next = 0
let completed = 0
const seen = new Set(existsSync(output) ? jsonl(output).map(entry => entry.rowIndex + ':' + entry.candidate) : [])
function saveCurrent() {
  const available = new Map(existsSync(output) ? jsonl(output).map(entry => [entry.rowIndex + ':' + entry.candidate, entry]) : [])
  for (const record of records.values()) {
    const resolved = checked.get(record.signature)
    if (!resolved) continue
    const {grade, referenceIssue} = resolved
    const reason = grade === 'L10' ? groundedReason(resolved.reviewer) : resolved.reason
    for (const fields of record.nominations) {
      available.set(fields.rowIndex + ':' + fields.candidate, {...fields, grade:Number(grade.slice(1)), reason, referenceIssue})
    }
  }
  const contents = [...available.values()].sort((a,b) => a.rowIndex-b.rowIndex || a.candidate-b.candidate)
  const temp = output + '.' + process.pid
  writeFileSync(temp, contents.map(row => JSON.stringify(row) + '\n').join(''))
  renameSync(temp, output)
}

console.log('confirmation', {mode, nominations:nominees.size, distinct:records.size, pending:pending.length, batches:batches.length, existing:seen.size})
const retry = async (batch, index) => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await request(batch, mode + '-' + process.pid + '-' + index + '-' + attempt)
      const keyed = new Map(result.map(entry => [entry.key, entry]))
      if (keyed.size !== batch.length) throw Error('Unexpected number of confirmation judgments')
      return batch.map(record => grade(record, keyed.get(record.input.key)))
    } catch (error) {
      console.error('confirmation batch', index, 'attempt', attempt, error.message)
      if (attempt === 3) throw error
    }
  }
}
const results = await Promise.allSettled(Array.from({length: Math.min(8, batches.length)}, async () => {
  while (next < batches.length) {
    const index = next++
    const judgments = await retry(batches[index], index)
    for (const judgment of judgments) {
      appendFileSync(auditFile, JSON.stringify({model, policy, ...judgment}) + '\n')
      checked.set(judgment.signature, judgment)
    }
    completed += judgments.length
    saveCurrent()
    console.log('confirmed', completed + '/' + pending.length)
  }
}))
saveCurrent()
const rejected = results.filter(result => result.status === 'rejected')
if (rejected.length) throw new AggregateError(rejected.map(result => result.reason), 'Incomplete confirmation review')
