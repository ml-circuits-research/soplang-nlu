import {readFileSync} from 'node:fs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {createVssReader} = await import(root + 'strategies/vss/src/reader.mjs')
const model = JSON.parse(readFileSync(root + 'strategies/vss/model/model.json', 'utf8'))
const t0 = performance.now()
const reader = createVssReader(model, {schema: 'syntax'})
console.log('open ms', performance.now() - t0)
for (const text of ['Could you move the blue box next to the red circle, please?', "let's put Review on Work 4 at 10am", 'make "Hello world" bigger']) {
  const r = reader.analyse(text)
  console.log(r.tokens.map((t, i) => `${t.text}/${r.stations[i]}/${t.shape}/${t.word}`).join(' '))
  console.log(JSON.stringify(reader.lexicon.kindsOf('move')), JSON.stringify(reader.lexicon.kindsOf('box')), JSON.stringify(reader.lexicon.kindsOf('blue')))
}
console.log(reader.legend.stations.map(s => s.name).join(' '))
let t1 = performance.now(); for (let i = 0; i < 200; i++) reader.analyse('Could you move the blue box next to the red circle, please?'); console.log('ms/msg', (performance.now() - t1) / 200)
