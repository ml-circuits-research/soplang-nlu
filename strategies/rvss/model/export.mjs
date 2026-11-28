// rvss M2: export the derived moves with the words and the marks between them, for the Python trainer.
//   node strategies/rvss/model/export.mjs [--in <folder under .local-data/rvss/, default the top>] [--name distill]
//        [--no-labels]   ->  .local-data/rvss/model/{<name>,labels}.jsonl
// distill: every derived spaCy line (moves-distill, also the general corpora's, origin general); labels: the label
// lines of moves-mixed (origin neither spacy nor general).
import {createReadStream, createWriteStream} from 'node:fs'
import {createGunzip} from 'node:zlib'
import {createInterface} from 'node:readline'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {wordsOf} = await import(root + 'lib/syntax.mjs')
const argv = process.argv.slice(2), opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d }
const D = root + '.local-data/rvss/', IN = D + (opt('in') ? opt('in') + '/' : '').replace(/^\.local-data\/rvss\//, '')
async function run(src, dst, keep) {
  const out = createWriteStream(D + 'model/' + dst); const c = {}
  for await (const l of createInterface({input: createReadStream(IN + src).pipe(createGunzip())})) {
    const o = JSON.parse(l); if (!keep(o)) continue
    const k = o.split + ' ' + o.origin + ' ' + (o.moves ? 'derived' : 'not'); c[k] = (c[k] ?? 0) + 1
    if (!o.moves) continue
    const ws = wordsOf(o.text); let prev = 0; const gaps = []
    for (const w of ws) { gaps.push(o.text.slice(prev, w.start).replace(/\s+/gu, '')); prev = w.end }
    gaps.push(o.text.slice(prev).replace(/\s+/gu, ''))
    out.write(JSON.stringify({text: o.text, file: o.file, row: o.row, split: o.split, origin: o.origin, words: ws.map(w => w.text), gaps, moves: o.moves}) + '\n')
  }
  out.end(); console.log(dst, JSON.stringify(c))
}
await run('moves-distill.jsonl.gz', opt('name', 'distill') + '.jsonl', () => true)
if (!argv.includes('--no-labels')) await run('moves-mixed.jsonl.gz', 'labels.jsonl', o => o.origin !== 'spacy' && o.origin !== 'general')
