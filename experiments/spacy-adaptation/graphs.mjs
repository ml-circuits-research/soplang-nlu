import {readFileSync,writeFileSync} from 'node:fs'
import {gunzipSync,gzipSync} from 'node:zlib'
import {join} from 'node:path'
import {openDependencies} from '../../strategies/neural-dependencies/index.mjs'

const [dir,model] = process.argv.slice(2)
if (!model) throw Error('Usage: graphs.mjs ARTIFACTS TEACHER_MODEL')
const source=JSON.parse(gunzipSync(readFileSync(join(dir,'training-sources.json.gz'))))
const parser=await openDependencies({model})
const graphs=[]
try {
  for (const row of source) graphs.push({...row,tokens:await parser.parse(row.text)})
} finally {await parser.close()}
writeFileSync(join(dir,'teacher-graphs.json.gz'),gzipSync(JSON.stringify({model:parser.metadata,graphs})),{flag:'wx'})
