// Measure two fixed policies using the already settled exact candidates of each engine.
import {readFileSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {gunzipSync} from 'node:zlib'
import {combineReadings} from '../../strategies/selector-distilbert/index.mjs'

const [input,name,output]=process.argv.slice(2)
if(!output||!process.env.SOP_KNOWLEDGE_DIR)throw Error('Expected OUTCOMES MODEL_FIELD REPORT with SOP_KNOWLEDGE_DIR')
const {parse}=await import(pathToFileURL(join(resolve(process.env.SOP_KNOWLEDGE_DIR),'tools/sopworld/sopworld.mjs')))
const rows=gunzipSync(readFileSync(input)).toString().trim().split('\n').map(JSON.parse)
const count=()=>({any:0,all:0,mixed:0,none:0,gained:0,lost:0,changed:0})
const stats={selector:count(),fillVacancy:count(),preferNewComplete:count()}
for(const row of rows){
  const base=row.selector.slice(0,2)
  const expected=base.some(c=>c.accepted)
  const prefer=combineReadings(base,row[name],parse,c=>c.eligible)
  for(const [policy,set] of Object.entries({selector:base,fillVacancy:base.length<2?prefer:base,preferNewComplete:prefer})){
    const entry=stats[policy]
    const any=set.some(c=>c.accepted),all=any&&set.every(c=>c.accepted)
    entry.any+=Number(any);entry.all+=Number(all);entry.mixed+=Number(any&&!all);entry.none+=Number(!any)
    entry.gained+=Number(any&&!expected);entry.lost+=Number(expected&&!any);entry.changed+=Number(set.length!==base.length || set.some((c,i)=>c.sop!==base[i]?.sop))
  }
}
writeFileSync(output,JSON.stringify({texts:rows.length,model:name,policies:stats},null,2)+'\n',{flag:'wx'})
