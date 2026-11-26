import {createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {gunzipSync, gzipSync} from 'node:zlib'
import {createAnalysisValidator, hasCompleteSource} from '../../lib/check-analysis.mjs'

const [poolDir, out, knowledgeDir] = process.argv.slice(2)
if (!knowledgeDir) throw Error('Usage: teach.mjs POOL_TRAIN_DIR OUTPUT_DIR KNOWLEDGE_DIR')
const model = 'gpt-6-sol'
const write = (name, data) => writeFile(join(out,name), JSON.stringify(data,null,2)+'\n',{flag:'wx'})
const packed = (name, data) => writeFile(join(out,name), gzipSync(data.map(x=>JSON.stringify(x)).join('\n')+'\n'),{flag:'wx'})
const bytes = await readFile(join(poolDir,'sources.jsonl.gz'))
const split = JSON.parse(await readFile(join(poolDir,'split.json')))
const ids = new Set(split.trainIds)
const sha = value => createHash('sha256').update(value).digest('hex')
const ranked = gunzipSync(bytes).toString().trim().split('\n').map(JSON.parse)
  .filter(row=>ids.has(row.id)).map(({id,text})=>({id,text,hash:sha('native-teacher-v1\0'+id)}))
if (ids.size!==500 || ranked.length!==500 || new Set(ranked.map(row=>row.id)).size!==500) throw Error('Expected 500 unique rank-train sources.')
ranked.sort((a,b)=>a.hash.localeCompare(b.hash))
const rows = ranked.slice(0,64).map((row,index)=>({...row,index}))
const instructions = await readFile(new URL('./prompt.md',import.meta.url),'utf8')
const schema = await readFile(new URL('../../schemas/nlu/schema.sop',import.meta.url),'utf8')
const outputSchema = {type:'object',additionalProperties:false,required:['results'],properties:{results:{type:'array',items:{
  type:'object',additionalProperties:false,required:['index','sop'],properties:{index:{type:'integer'},sop:{type:'string'}}
}}}}
const validate = await createAnalysisValidator({knowledgeDir})
await mkdir(out,{recursive:true})
await mkdir(join(out,'batches'))
await writeFile(join(out,'prompt.md'),instructions,{flag:'wx'})
await writeFile(join(out,'schema.sop'),schema,{flag:'wx'})
await write('output-schema.json',outputSchema)
await write('selection.json',{sourceSha256:sha(bytes),model,reasoning:'low',batchSize:8,rows})
const emptyDir = join(out,'sandbox')
await mkdir(emptyDir)
const start = performance.now()
async function batch(inputs, phase, num) {
  const base = join(out,'batches',`${phase}-${num}`)
  const prompt = instructions+'\nLocal schema:\n'+schema+'\nInput JSON:\n'+JSON.stringify(inputs)+'\n'
  await writeFile(base+'.prompt.txt',prompt,{flag:'wx'})
  const args=['-a','never','exec','--ephemeral','--ignore-user-config','--skip-git-repo-check','--sandbox','read-only',
    '--color','never','-m',model,'-c','model_reasoning_effort="low"','--output-schema',join(out,'output-schema.json'),
    '-o',base+'.output.json','-']
  const begin = performance.now()
  const child=spawn('codex',args,{cwd:emptyDir,stdio:['pipe','pipe','pipe']})
  let diagnostic=''
  child.stdout.on('data',()=>{})
  child.stderr.setEncoding('utf8').on('data',chunk=>diagnostic+=chunk)
  child.stdin.on('error',()=>{})
  child.stdin.end(prompt)
  const code = await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)})
  await writeFile(base+'.log',diagnostic,{flag:'wx'})
  const responses=new Map()
  let responseError
  try {
    if(code!==0)throw Error('Exit '+code)
    const result=JSON.parse(await readFile(base+'.output.json'))
    for(const response of result.results) {
      if(!inputs.some(x=>x.index===response.index) || responses.has(response.index) || typeof response.sop!=='string')
        throw Error('Unrequested, duplicate or invalid teacher response')
      responses.set(response.index,response.sop.trim())
    }
  } catch(error) {
    responses.clear()
    responseError=error.message
  }
  const attempts=inputs.map(({index,text})=>{
    const sop=responses.get(index) ?? ''
    const check=sop?validate(text,sop):null
    return {index,sop,check,eligible:hasCompleteSource(check),...(responseError?{responseError}:{})}
  })
  await writeFile(base+'.status.json',JSON.stringify({args,code,wallMs:performance.now()-begin,attempts},null,2)+'\n',{flag:'wx'})
  console.log(phase,num,attempts.filter(x=>x.eligible).length+'/'+inputs.length)
  return attempts
}
function round(inputs,phase) {
  return Promise.all(Array.from({length:Math.ceil(inputs.length/8)},(_,i)=>batch(inputs.slice(i*8,(i+1)*8),phase,i)))
}
const first=(await round(rows.map(({index,text})=>({index,text})),'initial')).flat()
const repairInputs=first.filter(row=>!row.eligible).map(({index,sop,check})=>{
  const {findings,coverage,sourceGaps}=check??{}
  return {index,text:rows[index].text,previousSop:sop,staticFeedback:check?{findings,coverage,sourceGaps}:'Missing circuit.'}
})
const second=(await round(repairInputs,'repair')).flat()
const repairs=new Map(second.map(row=>[row.index,row]))
const pool=rows.map(({id,text,index})=>{
  const chosen=repairs.get(index)??first[index]
  return {id,text,candidates:chosen.sop?[{family:'native-teacher',rank:0,sop:chosen.sop,eligible:chosen.eligible}]:[]}
})
await packed('pool.jsonl.gz',pool)
await packed('sources.jsonl.gz',rows.map(({id,text})=>({id,text})))
await write('pool.jsonl.gz.timing.json',{model,wallMs:performance.now()-start,sources:rows.length,firstEligible:first.filter(x=>x.eligible).length,repairSources:second.length,repairEligible:second.filter(x=>x.eligible).length})
