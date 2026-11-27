// Train the parser on the train split.   node train.mjs [--epochs 10] [--gold 3] [--explore 0.9] [--limit N] [--out model.json.gz]
import {readFileSync, writeFileSync} from 'node:fs'
import {gunzipSync, gzipSync} from 'node:zlib'
import {Parser} from './parser.mjs'
const arg = (name, value) => { const at = process.argv.indexOf('--' + name); return at < 0 ? value : process.argv[at + 1] }
const epochs = Number(arg('epochs', 10)), goldWeight = Number(arg('gold', 3)), explore = Number(arg('explore', 0.9))
const limit = Number(arg('limit', 1e9)), outFile = arg('out', 'model.json.gz'), exploreFrom = Number(arg('explore-from', 2))
const data = JSON.parse(gunzipSync(readFileSync(arg('data', 'data.json.gz'))))
const train = data.filter(x => x.split === 'train' && x.heads && (x.proj || process.argv.includes('--nonproj'))).slice(0, limit)
const labels = [...new Set(train.flatMap(x => x.labels))].sort()
console.log('train messages', train.length, 'gold', train.filter(x => x.gold).length, 'labels', labels.length)
// a seeded generator, so a run can be repeated
let seed = 12345
const rng = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296 }
const parser = new Parser(labels, {extra: process.argv.includes('--extra')})
const t0 = performance.now()
for (let epoch = 1; epoch <= epochs; epoch++) {
  const order = train.map((_, k) => k)
  for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(rng() * (k + 1)); [order[k], order[j]] = [order[j], order[k]] }
  let wrong = 0, moves = 0
  const te = performance.now()
  for (const k of order) {
    const x = train[k]
    wrong += parser.train(x, x.gold ? goldWeight : 1, epoch >= exploreFrom ? explore : 0, rng)
    moves += 2 * x.atoms.length
  }
  console.log(`epoch ${epoch}: wrong moves ${(100 * wrong / moves).toFixed(2)}%  features ${parser.weights.size}  ${((performance.now() - te) / 1000).toFixed(1)} s`)
}
parser.average()
const trainMs = performance.now() - t0
console.log('features after averaging', parser.weights.size, 'training s', (trainMs / 1000).toFixed(1))
writeFileSync(outFile, gzipSync(JSON.stringify({...parser.toJSON(), meta: {epochs, goldWeight, explore, exploreFrom, train: train.length, trainSeconds: trainMs / 1000}})))
console.log('wrote', outFile)
