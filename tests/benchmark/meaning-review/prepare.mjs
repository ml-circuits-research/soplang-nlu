import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {gunzipSync,gzipSync} from 'node:zlib'
import {join,resolve} from 'node:path'
import {createVerifier} from '../../../strategies/z3/src/verify/check.mjs'
const [run, output, installation] = process.argv.slice(2)
const verifier = await createVerifier({knowledgeDir:resolve(installation)})
const unpack = file => gunzipSync(readFileSync(join(run,file))).toString()
const rows = JSON.parse(unpack('sample.json.gz'))
const engines = ['z3','prolog-worlds','prolog-example-transfer']
const predictions = engines.map(name=>new Map(unpack(name+'.jsonl.gz').trim().split('\n').map(l=>{
  const row = JSON.parse(l); return [row.id,row]
})))
mkdirSync(output,{recursive:true})
const packets = rows.map(({id,text,references},rowIndex)=>{
  const unique = [...new Set([...references,...predictions.flatMap(store=>store.get(id).candidates)])].sort()
  const lines = [...new Set(unique.flatMap(sop=>sop.split(/\r?\n/)))]
  const valid = unique.map(sop=>sop.trim() !== '' && verifier.check(text,sop).schemaValid)
  const groups = {}
  const memberships = {}
  for (let i=0;i<engines.length;i++) {
    const actual = predictions[i].get(id).candidates
    const eligible = [...new Set(actual.map(s=>unique.indexOf(s)).filter(idx=>valid[idx]))].sort((a,b)=>a-b)
    const key = Object.keys(groups).find(k=>String(groups[k])===String(eligible)) ?? String(Object.keys(groups).length)
    groups[key] = eligible
    memberships[engines[i]] = {key,original:actual.map(s=>unique.indexOf(s))}
  }
  return {id,rowIndex,text,references:references.map(s=>unique.indexOf(s)),groups,memberships,lines,circuits:unique.map(sop=>sop.split(/\r?\n/).map(l=>lines.indexOf(l)))}
})
writeFileSync(join(output,'packets.json.gz'),gzipSync(JSON.stringify(packets)))
