import {readFileSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {gunzipSync} from 'node:zlib'
import {pathToFileURL} from 'node:url'

const [runPath, knowledgePath] = process.argv.slice(2)
if (!runPath || !knowledgePath) throw Error('Expected a run directory and SOP knowledge installation.')
const run = resolve(runPath)
const {World} = await import(pathToFileURL(join(resolve(knowledgePath),'tools/sopworld/sopworld.mjs')))
const schema = readFileSync(new URL('../../schemas/nlu/schema.sop',import.meta.url),'utf8')
const base = new World({library:{nlu:schema}})
if (!base.use('nlu').ok) throw Error('The independent SOP runtime rejected the NLU schema.')
const cache = new Map()
const results = {}
for (const engine of ['z3','prolog-worlds','prolog-example-transfer']) {
  const report = {emitted:0, nativeSchemaAccepted:0, disagreements:[]}
  const bytes = readFileSync(join(run,engine+'.jsonl.gz'))
  for (const line of gunzipSync(bytes).toString().trim().split('\n')) {
    const row = JSON.parse(line)
    const proposed = row.candidates.map((sop,i)=>({sop,check:row.checks[i]})).concat(row.rejected ?? [])
    for (const {sop,check} of proposed) {
      if (!cache.has(sop)) {
        const previous = base.fork()
        const result = previous.tell(sop)
        cache.set(sop,{ok:result.ok,violations:result.violations})
      }
      const native = cache.get(sop)
      report.emitted++
      if (native.ok) report.nativeSchemaAccepted++
      if (native.ok !== check.schemaValid) report.disagreements.push({id:row.id,sop,
        native,librarySchemaValid:check.schemaValid,findings:check.findings})
    }
  }
  results[engine] = report
}
writeFileSync(join(run,'native-schema-audit.json'),JSON.stringify({distinctSop:cache.size,results},null,2)+'\n')
console.log(Object.fromEntries(Object.entries(results).map(([k,r])=>[k,[r.emitted,r.nativeSchemaAccepted,r.disagreements.length]])))
