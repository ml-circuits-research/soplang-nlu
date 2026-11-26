// Compare already-judged strategies on the same utterances. No calls to a model.
import {readFileSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {gunzipSync} from 'node:zlib'
import {distribution} from './review-public-candidates.mjs'

const [reviewDirectory, historicalSample, output] = process.argv.slice(2)
if (!output) throw Error('Usage: paired-strategies.mjs REVIEW_DIR HISTORICAL_SAMPLE_JSON_GZ OUTPUT_JSON')
const unpack = filename => gunzipSync(readFileSync(filename)).toString()
const historical = new Set(JSON.parse(unpack(historicalSample)).map(row => row.text))
const rows = unpack(join(reviewDirectory,'public-set-judgments.jsonl.gz')).trim().split('\n').map(JSON.parse)
const bySource = new Map()
const engines = new Set()
for (const row of rows) {
  const source = bySource.get(row.id) ?? {text:row.text, outcomes:new Map()}
  if (source.text !== row.text || source.outcomes.has(row.engine)) throw Error('Inconsistent or duplicate result')
  if (!['none','some','all'].includes(row.outcome)) throw Error('Unknown public-set outcome')
  source.outcomes.set(row.engine,row.outcome)
  engines.add(row.engine)
  bySource.set(row.id,source)
}
const all = [...bySource.values()]
if (all.some(row => row.outcomes.size !== engines.size)) throw Error('Incomplete paired sample')
function describe(sample) {
  const outcomes = {}
  const comparisons = []
  const names = [...engines].sort()
  for (const [i,name] of names.entries()) {
    outcomes[name] = distribution(['none','some','all'],sample,row => row.outcomes.get(name))
    for (const other of names.slice(i+1)) {
      const categories = ['neither','firstOnly','secondOnly','both']
      comparisons.push({first:name,second:other,
        ...distribution(categories,sample,row => categories[
          Number(row.outcomes.get(name)!=='none')+2*Number(row.outcomes.get(other)!=='none')])})
    }
  }
  return {size:sample.length,outcomes,comparisons}
}
const unseen = all.filter(row => !historical.has(row.text))
const result = {unit:'source utterance', previousExactSourceOverlaps:all.length-unseen.length,
  full:describe(all),excludingEarlierHistoricalSources:describe(unseen)}
writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'})
