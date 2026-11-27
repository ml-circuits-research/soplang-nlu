// Train the DistilBERT strategy on circuits of the `syntax` schema.
//
//   node strategies/distilbert/retrain.mjs [--syntactic <folder>] [--no-agreement] [--silver <file>[=<weight>]]…
//        [--out <folder>] [--overwrite] [--exclude <file>] [--seed <n>] [--epochs <n>]
//        [--device cuda|cpu] [--python <interpreter>] [--base <model>]
//   node strategies/distilbert/retrain.mjs --tune [--out <folder>]
//
// The data are the labels of the dataset: the circuits in its syntactic files
// (../webmeet-dataset/syntactic, or the folder --syntactic names), as they are when the tool runs.
//   gold     the rows whose accepted_by is "judge" or "written": a judge accepted or wrote the
//            circuit. About one message in ten (chosen by a hash of the seed and the text) is
//            kept out of training: the development messages.
//   silver   the rows whose accepted_by is "agreement": formalizers wrote the circuit alike and no
//            judge read it. They are trained on with the weight 0.3, and none is a development
//            message. --no-agreement leaves them out.
// --silver   further files, one line per message {text, sop}, each with a weight (0.3 when
//            none is given). A silver message that is also a gold message is left out.
// --exclude  a JSON array or JSON Lines file of {text}: these messages are left out altogether.
// --out      where the result goes: <out>/checkpoint (what the strategy loads), <out>/data (the
//            targets the model was trained on) and <out>/training-summary.json. By default
//            .local-models/distilbert/syntax-v1, which the strategy uses when nothing else is given.
//
// --tune     no training: the two thresholds of the checkpoint in <out> are chosen again on its
//            development messages (after a change of the output stage, for example).
//
// The encoder starts from the pretrained base model in the local Hugging Face cache. Nothing of
// an earlier checkpoint and nothing of the older `nlu` annotations is read.
import {spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {createInterface} from 'node:readline'
import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {coreOf} from '../../lib/syntax.mjs'
import {readLabels} from '../../tests/benchmark/syntax/lib.mjs'
import {encodeCircuit, certainPrediction, modelSchema} from './targets.mjs'
import {writeSyntaxCircuit} from './circuit.mjs'
import {openSyntaxModel} from './index.mjs'

const here = file => fileURLToPath(new URL(file, import.meta.url))
const args = process.argv.slice(2), named = {silver: []}
for (let at = 0; at < args.length; at++) {
  const name = args[at].replace(/^--/u, '')
  if (!args[at].startsWith('--')) throw Error('Unexpected argument ' + args[at])
  if (name === 'overwrite' || name === 'tune' || name === 'no-agreement') named[name] = true
  else if (name === 'silver') named.silver.push(args[++at])
  else named[name] = args[++at]
}
if (named.gold) throw Error('The gold data are read from the syntactic files of the dataset; name another folder with --syntactic.')
const syntacticDir = resolve(named.syntactic ?? here('../../../webmeet-dataset/syntactic'))
const silverWeight = .3
const out = resolve(named.out ?? here('../../.local-models/distilbert/syntax-v1'))
const seed = Number(named.seed ?? 20261127), epochs = Number(named.epochs ?? 20)
const device = named.device ?? 'cuda'
const python = named.python ?? process.env.SOP_NLU_DISTILBERT_PYTHON ?? 'python3'
const base = named.base ?? 'distilbert-base-uncased'
const trained = existsSync(join(out, 'checkpoint', 'manifest.json'))
if (trained && !named.overwrite && !named.tune) throw Error(`There is already a checkpoint in ${out}. Name another folder with --out, or pass --overwrite.`)
if (!trained && named.tune) throw Error(`There is no checkpoint in ${out} to choose thresholds for.`)

const lines = file => readFileSync(file, 'utf8').split('\n').filter(line => line.trim()).map(line => JSON.parse(line))
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const inDev = text => parseInt(createHash('sha256').update(seed + '\n' + text).digest('hex').slice(0, 8), 16) % 10 === 0
const excluded = new Set()
if (named.exclude) {
  const content = readFileSync(resolve(named.exclude), 'utf8')
  for (const row of content.trimStart().startsWith('[') ? JSON.parse(content) : lines(resolve(named.exclude))) excluded.add(row.text)
}

// ---- the data: every circuit as targets
const skipped = {}
const skip = reason => { skipped[reason] = (skipped[reason] ?? 0) + 1; return null }
function targetsOf(text, circuit, weight) {
  if (typeof text !== 'string' || typeof circuit !== 'string') return skip('no text or no circuit')
  try {
    const targets = encodeCircuit(text, circuit)
    // a circuit the writer cannot give back from its own targets teaches nothing the strategy could write
    const back = writeSyntaxCircuit(text, targets.tokens, certainPrediction(targets))
    if (coreOf(text, back) === null) return skip('cannot be written back')
    return {...targets, weight, core: coreOf(text, back), circuit}
  } catch (error) { return skip(error.message.replace(/:.*$/u, '')) }
}
let train = [], dev = [], sizes = null, report = null
if (named.tune) {
  dev = lines(join(out, 'data', 'development.jsonl')).map(row => targetsOf(row.text, row.label, 1)).filter(Boolean)
} else {
  ({train, dev, sizes, report} = await trainOnTheData())
}

async function trainOnTheData() {
  // the labels of the dataset: a judge's circuits are gold, the circuits settled by agreement are silver
  const labels = [...readLabels(syntacticDir).values()], seen = new Set(), train = [], dev = []
  const gold = labels.filter(row => row.accepted_by === 'judge' || row.accepted_by === 'written')
  const agreed = named['no-agreement'] ? [] : labels.filter(row => row.accepted_by === 'agreement')
  const digest = rows => createHash('sha256').update(rows.map(row => row.text + '\0' + row.label).join('\n')).digest('hex')
  const sizes = {gold: {folder: syntacticDir, acceptedBy: 'judge or written', sha256: digest(gold), lines: gold.length, train: 0, development: 0, excluded: 0},
    agreement: named['no-agreement'] ? null : {folder: syntacticDir, acceptedBy: 'agreement', sha256: digest(agreed), weight: silverWeight, lines: agreed.length, train: 0, excluded: 0}, silver: []}
  for (const row of gold) {
    if (seen.has(row.text)) { skip('repeated message'); continue }
    if (excluded.has(row.text)) { sizes.gold.excluded++; continue }
    const targets = targetsOf(row.text, row.label, 1)
    if (!targets) continue
    seen.add(row.text)
    if (inDev(row.text)) { dev.push(targets); sizes.gold.development++ } else { train.push(targets); sizes.gold.train++ }
  }
  for (const row of agreed) {
    if (excluded.has(row.text)) { sizes.agreement.excluded++; continue }
    if (seen.has(row.text)) { skip('repeated message'); continue }
    const targets = targetsOf(row.text, row.label, silverWeight)
    if (!targets) continue
    seen.add(row.text)
    train.push(targets); sizes.agreement.train++
  }
  for (const entry of named.silver) {
    const [, file, weight] = /^(.*?)(?:=([0-9.]+))?$/u.exec(entry)
    const size = {file: resolve(file), sha256: sha(resolve(file)), weight: Number(weight ?? silverWeight), lines: 0, train: 0, alsoGold: 0, excluded: 0}
    for (const row of lines(resolve(file))) {
      size.lines++
      if (excluded.has(row.text)) { size.excluded++; continue }
      if (seen.has(row.text)) { size.alsoGold++; continue }
      const targets = targetsOf(row.text, row.sop ?? row.label, size.weight)
      if (!targets) continue
      seen.add(row.text)
      train.push(targets); size.train++
    }
    sizes.silver.push(size)
  }
  if (!train.length || !dev.length) throw Error('There are no messages to train on, or none to develop on.')
  mkdirSync(join(out, 'data'), {recursive: true})
  const files = {train: join(out, 'data', 'train.jsonl'), dev: join(out, 'data', 'dev.jsonl'), layout: join(out, 'data', 'layout.json')}
  const rowsOf = list => list.map(({core, circuit, ...row}) => JSON.stringify(row)).join('\n') + '\n'
  writeFileSync(files.train, rowsOf(train))
  writeFileSync(files.dev, rowsOf(dev))
  // the development messages with their gold circuits, for whoever measures the checkpoint
  writeFileSync(join(out, 'data', 'development.jsonl'), dev.map(row => JSON.stringify({text: row.text, label: row.circuit})).join('\n') + '\n')
  writeFileSync(files.layout, JSON.stringify(modelSchema(), null, 2) + '\n')
  console.log(JSON.stringify({messages: sizes, skipped}))

  // ---- the training, in Python
  const report = await new Promise((done, failed) => {
    const child = spawn(python, ['-u', here('./syntax_train.py'), files.train, files.dev, files.layout, join(out, 'checkpoint'),
      '--base', base, '--device', device, '--epochs', String(epochs), '--seed', String(seed)], {stdio: ['ignore', 'pipe', 'inherit']})
    let last = null
    createInterface({input: child.stdout}).on('line', line => {
      try { last = JSON.parse(line) } catch { console.log(line); return }
      if (last.epoch) console.log(`epoch ${last.epoch}: loss ${last.loss.toFixed(3)}, development messages exactly as their targets ${(100 * last.dev.exact).toFixed(1)}%, F1 ${last.dev.f1.toFixed(3)} (${last.seconds.toFixed(0)} s)`)
    })
    child.once('error', failed)
    child.once('close', code => code === 0 && last?.selectedEpoch ? done(last) : failed(Error('The training ended with ' + code)))
  })
  return {train, dev, sizes, report}
}

// ---- the two thresholds, chosen on the development messages with the output stage itself:
// how sure the model must be of a wire, and of an optional tie
const model = await openSyntaxModel({python, modelPath: join(out, 'checkpoint'), device})
const grid = [.3, .4, .5, .6, .7], tries = []
try {
  for (const node of grid) {
    const predictions = []
    for (const row of dev) predictions.push(await model.predict(row.text, {nodeThreshold: node}).catch(error => ({error})))
    for (const tie of grid) {
      let valid = 0, equal = 0
      dev.forEach((row, index) => {
        const {tokens, prediction, error} = predictions[index]
        if (error) return
        let core = null
        try { core = coreOf(row.text, writeSyntaxCircuit(row.text, tokens, prediction, {tie})) } catch { /* no circuit */ }
        if (core !== null) valid++
        if (core !== null && core === row.core) equal++
      })
      tries.push({nodeThreshold: node, tieThreshold: tie, valid: valid / dev.length, equal: equal / dev.length})
    }
  }
} finally {
  await model.close()
}
// A few development messages more or less are chance. Among the pairs that are within one message
// in a hundred of the best, the pair nearest to one half is taken.
const most = Math.max(...tries.map(entry => entry.equal))
const far = entry => Math.abs(entry.nodeThreshold - .5) + Math.abs(entry.tieThreshold - .5)
const chosen = tries.filter(entry => entry.equal >= most - .01).toSorted((a, b) => far(a) - far(b) || b.equal - a.equal || b.valid - a.valid)[0]
const manifestFile = join(out, 'checkpoint', 'manifest.json')
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'))
writeFileSync(manifestFile, JSON.stringify({...manifest, nodeThreshold: chosen.nodeThreshold, tieThreshold: chosen.tieThreshold}, null, 2) + '\n')
const summaryFile = join(out, 'training-summary.json')
const before = named.tune && existsSync(summaryFile) ? JSON.parse(readFileSync(summaryFile, 'utf8')) : null
const development = {validCircuits: chosen.valid, equalToGoldByCore: chosen.equal, nodeThreshold: chosen.nodeThreshold, tieThreshold: chosen.tieThreshold}
const summary = named.tune ? {...before, development: {...before?.development, ...development}, thresholdsTried: tries} : {
  format: manifest.format, base: manifest.base, baseRevision: manifest.baseRevision, encoderStartsFrom: 'the pretrained base model',
  seed, device: manifest.device, accelerator: manifest.accelerator, maximumEpochs: epochs, selectedEpoch: report.selectedEpoch,
  messages: sizes, skipped, trainRows: train.length, trainWeight: train.reduce((sum, row) => sum + row.weight, 0), developmentRows: dev.length,
  development: {...development, firstChoicesExactlyAsTargets: report.devFirstChoices.exact, f1OfFirstChoices: report.devFirstChoices.f1},
  thresholdsTried: tries, epochs: report.epochs.map(({epoch, loss, dev, seconds}) => ({epoch, loss, exact: dev.exact, f1: dev.f1, seconds})),
  trainingSeconds: report.seconds
}
writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify({checkpoint: join(out, 'checkpoint'), selectedEpoch: summary.selectedEpoch, development: summary.development}))
