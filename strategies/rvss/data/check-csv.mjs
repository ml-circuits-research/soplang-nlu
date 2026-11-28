// Checks that run-spacy.mjs readCsv gives the same records as tests/benchmark/syntax/lib.mjs readCsv on every
// CSV file of the dataset's semantic/ and syntactic/ folders.
//   node strategies/rvss/data/check-csv.mjs [<webmeet-dataset>]
import {readFileSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {readCsv, csvFilesOf} from './run-spacy.mjs'
const {readCsv: reference} = await import(new URL('../../../tests/benchmark/syntax/lib.mjs', import.meta.url).href)
const dataset = resolve(process.argv[2] ?? new URL('../../../../webmeet-dataset', import.meta.url).pathname)
let files = 0, records = 0, differ = 0
for (const folder of ['semantic', 'syntactic']) for (const file of csvFilesOf(join(dataset, folder))) {
  const content = readFileSync(join(dataset, folder, file), 'utf8')
  const a = readCsv(content), b = reference(content)
  files++; records += b.length
  if (JSON.stringify(a) !== JSON.stringify(b)) { differ++; console.log('differs', folder, file) }
}
console.log(JSON.stringify({files, records, differ}))
