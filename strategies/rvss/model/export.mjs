// rvss M2: export the derived moves with the words and the marks between them, for the Python trainer.
//   node strategies/rvss/model/export.mjs   ->  .local-data/rvss/model/{distill,labels}.jsonl
// distill: every derived spaCy line (moves-distill); labels: the label lines of moves-mixed (origin != spacy).
import {createReadStream, createWriteStream} from 'node:fs'
import {createGunzip} from 'node:zlib'
import {createInterface} from 'node:readline'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {wordsOf} = await import(root + 'lib/syntax.mjs')
const D = root + '.local-data/rvss/'
async function run(src, dst, keep) {
  const out = createWriteStream(D + 'model/' + dst); const c = {}
  for await (const l of createInterface({input: createReadStream(D + src).pipe(createGunzip())})) {
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
await run('moves-distill.jsonl.gz', 'distill.jsonl', () => true)
await run('moves-mixed.jsonl.gz', 'labels.jsonl', o => o.origin !== 'spacy')
