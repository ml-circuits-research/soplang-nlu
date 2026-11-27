// How the circuits of a variant differ from the current strategy's on the benchmark: attachment mark only, relation start only (relaxed), or more.
import {readFileSync} from 'node:fs'
import {relaxedCore} from './convert.mjs'
const root = '/home/salboaie/work/sopworlds/soplang-nlu/'
const {normalForm} = await import(root + 'tests/benchmark/syntax/lib.mjs')
const loose = core => core?.split('\n').filter(line => !/ attachment ambiguous$/u.test(line)).join('\n') ?? null
for (const file of process.argv.slice(2)) {
  const rows = readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  const c = {same: 0, attachmentMarkOnly: 0, relationStartOnly: 0, more: 0}
  const byVerdict = {}
  for (const r of rows) {
    let k
    if (r.same) k = 'same'
    else if (loose(normalForm(r.text, r.sop)?.core) === loose(normalForm(r.text, r.baseSop)?.core)) k = 'attachmentMarkOnly'
    else if (relaxedCore(r.text, r.sop) === relaxedCore(r.text, r.baseSop)) k = 'relationStartOnly'
    else k = 'more'
    c[k]++
    const v = k + ' ' + r.baseVerdict + '->' + r.verdict + (r.like ? '/' + r.like : '')
    byVerdict[v] = (byVerdict[v] ?? 0) + 1
  }
  console.log(file, JSON.stringify(c))
  console.log('  ', JSON.stringify(Object.fromEntries(Object.entries(byVerdict).sort())))
}
