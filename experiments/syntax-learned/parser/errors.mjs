// Where the parser's trees differ from the label's on dev: label confusions and head errors.
//   node errors.mjs [model] [--gold] [--show N]
import {readFileSync} from 'node:fs'
import {gunzipSync} from 'node:zlib'
import {Parser} from './parser.mjs'
const modelFile = process.argv[2] ?? 'model.json.gz'
const goldOnly = process.argv.includes('--gold')
const show = process.argv.includes('--show') ? Number(process.argv[process.argv.indexOf('--show') + 1]) : 0
const parser = Parser.fromJSON(JSON.parse(gunzipSync(readFileSync(modelFile))))
const data = JSON.parse(gunzipSync(readFileSync('data.json.gz')))
const dev = data.filter(x => x.split === 'dev' && x.heads && (!goldOnly || x.gold))
const conf = {}, headErr = {}
let sentencesWrong = 0, shown = 0
const firstErr = {}
for (const x of dev) {
  const p = parser.parse(x)
  let wrong = false, first = null
  for (let k = 0; k < x.heads.length; k++) {
    const gl = x.labels[k], pl = p.labels[k], hOk = p.heads[k] === x.heads[k]
    if (!hOk) { headErr[gl] = (headErr[gl] ?? 0) + 1; wrong = true; first ??= `head ${gl}` }
    if (gl !== pl) { const c = gl + ' -> ' + pl; conf[c] = (conf[c] ?? 0) + 1; wrong = true; first ??= `label ${gl}->${pl}` }
  }
  if (wrong) { sentencesWrong++; firstErr[first] = (firstErr[first] ?? 0) + 1
    if (shown++ < show) console.log(x.text, '\n  ' + x.atoms.map((a, k) => (p.heads[k] !== x.heads[k] || p.labels[k] !== x.labels[k]) ? `[${k}:${a.w} gold ${x.heads[k]}/${x.labels[k]} got ${p.heads[k]}/${p.labels[k]}]` : null).filter(Boolean).join(' ')) }
}
console.log('dev trees', dev.length, 'wrong', sentencesWrong)
const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n)
console.log('HEAD ERRORS by gold label'); for (const [k, v] of top(headErr, 20)) console.log(String(v).padStart(6), k)
console.log('LABEL CONFUSIONS'); for (const [k, v] of top(conf, 30)) console.log(String(v).padStart(6), k)
console.log('FIRST ERROR of a wrong tree'); for (const [k, v] of top(firstErr, 20)) console.log(String(v).padStart(6), k)
