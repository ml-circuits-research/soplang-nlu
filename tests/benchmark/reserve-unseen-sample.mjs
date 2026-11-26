// Draw one percent of the full pinned corpus from previously unseen source texts.
// An experiment can exclude reserved inputs locally using their exact UTF-8 hashes.
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync} from 'node:fs'
import {dirname,join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {gunzipSync,gzipSync} from 'node:zlib'
import {readCommittedRows} from './train-split.mjs'

const root = fileURLToPath(new URL('../../',import.meta.url))
const [lockFile, output, mode='reserve'] = process.argv.slice(2)
if (!output || !['reserve','reveal'].includes(mode)) throw Error('Expected LOCK OUTPUT reserve|reveal')
const lock = JSON.parse(readFileSync(lockFile))
const digest = value => createHash('sha256').update(value).digest('hex')
const excluded = new Set()
for (const {file,sha256} of lock.previouslyExposed) {
  const bytes = readFileSync(join(root,file))
  if (digest(bytes)!==sha256) throw Error('Changed exclusion source '+file)
  for (const row of JSON.parse(gunzipSync(bytes))) excluded.add(row.text)
}
const dataset = resolve(process.env.SOP_WORKSPACE ?? join(root,'..'),'webmeet-dataset')
let population = 0
const available = []
for await (const row of readCommittedRows(dataset,lock.datasetRevision)) {
  population++
  if (!excluded.has(row.text)) available.push({hash:digest(lock.seed+'\0'+row.id),row})
}
const count = Math.round(population*lock.percent/100)
available.sort((a,b)=>a.hash<b.hash?-1:a.hash>b.hash?1:0)
const texts = new Set()
const sample = []
for (const {row} of available) {
  if (texts.has(row.text)) continue
  texts.add(row.text)
  sample.push(row)
  if (sample.length===count) break
}
if (sample.length!==count) throw Error('Insufficient unseen source texts')
const membership = [...texts].map(digest).sort()
const reserved = join(dirname(lockFile),lock.reservedExactTextDigests)
if (mode==='reveal' && JSON.stringify(JSON.parse(gunzipSync(readFileSync(reserved))))!==JSON.stringify(membership)) {
  throw Error('The sample differs from the prospective reservation')
}
const result = mode==='reserve'?membership:sample
writeFileSync(output,gzipSync(JSON.stringify(result)),{flag:'wx'})
console.log(JSON.stringify({population,excludedUnique:excluded.size,eligibleRows:available.length,reserved:count}))
