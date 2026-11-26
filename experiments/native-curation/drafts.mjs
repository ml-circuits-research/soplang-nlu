// Fill missing draft options for the curator. A draft never conveys approval.
import {readFileSync,writeFileSync,renameSync} from 'node:fs'
import {resolve} from 'node:path'
import {gzipSync,gunzipSync} from 'node:zlib'
import {createReader} from '../../lib/reader.mjs'
import {neuroSelector} from '../../strategies/neuro-selector/index.mjs'
const [input,output]=process.argv.slice(2)
if(!output)throw Error('Expected batch input and new draft output')
const rows=gunzipSync(readFileSync(input)).toString().trim().split('\n').map(JSON.parse)
let reader
let withNewDraft=0
try{
  for(const row of rows){
    if(row.candidates.length)continue
    reader??=await createReader({strategy:neuroSelector,knowledgeDir:resolve(process.env.SOP_KNOWLEDGE_DIR)})
    const result=await reader.propose(row.text)
    if(result.error)throw Error('Draft engine failed on '+row.id+': '+result.error)
    row.candidates=result.candidates.slice(0,2).map(c=>({sop:c.sop}))
    if(row.candidates.length)withNewDraft++
  }
} finally {if(reader)await reader.close()}
const temp=output+'.'+process.pid+'.tmp'
writeFileSync(temp,gzipSync(rows.map(r=>JSON.stringify(r)).join('\n')+'\n'),{flag:'wx'})
renameSync(temp,output)
console.log(JSON.stringify({rows:rows.length,withNewDraft}))
