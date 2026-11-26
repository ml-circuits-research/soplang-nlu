import {spawn} from 'node:child_process'
import {createHash} from 'node:crypto'
import {mkdir, readFile, readdir, rename, writeFile} from 'node:fs/promises'
import {dirname,join,resolve} from 'node:path'
import {gunzipSync,gzipSync} from 'node:zlib'
import {createAnalysisValidator,hasCompleteSource,sourceTokenMatches} from '../../lib/check-analysis.mjs'
import {removeSurplusPunctuation,restoreLiteralDelimiters,restoreOptionalPunctuation} from './duplicate-punctuation.mjs'

import {groundEntityAnchor} from './ground-entity-anchor.mjs'

const [inputArg,outputArg,knowledgeArg,startArg='0',batchCountArg='1']=process.argv.slice(2)
const offset=Number(startArg), batchCount=Number(batchCountArg)
if(!knowledgeArg||!Number.isSafeInteger(offset)||offset<0||offset%500||!Number.isSafeInteger(batchCount)||batchCount<1)
  throw Error('Usage: curate.mjs INPUT.jsonl[.gz] OUTPUT KNOWLEDGE_DIR [START_ROW_MULTIPLE_OF_500] [LOGICAL_BATCH_COUNT]')
const input=resolve(inputArg), output=resolve(outputArg), knowledgeDir=resolve(knowledgeArg)
const backend=process.env.SOP_NLU_CURATION_BACKEND??'codex'
const models={codex:['gpt-6-sol','gpt-6.1-terra'],vibe:['deepseek-v4-1-flash-1017']}
if(!Object.hasOwn(models,backend))throw Error('Unsupported curation backend: '+backend)
const model=process.env.SOP_NLU_CURATION_MODEL??models[backend][0]
if(!models[backend].includes(model))throw Error('Unsupported curation model: '+model)
const logicalSize=backend==='vibe'?Number(process.env.SOP_NLU_VIBE_GROUP_ROWS??500):500
if(!Number.isSafeInteger(logicalSize)||logicalSize<500||logicalSize>5000||
   (backend==='vibe'&&offset!==0))throw Error('Vibe expects an offset of zero and group size of 500 to 5000')
const microRows=backend==='vibe'?Number(process.env.SOP_NLU_VIBE_BATCH_ROWS??24):10
const microBytes=backend==='vibe'?Math.max(60000, microRows*2000):28000
if(!Number.isSafeInteger(microRows)||microRows<1||microRows>5000)throw Error('Expected 1 to 5000 rows per model request')
const jobs=Number(process.env.SOP_NLU_CURATION_JOBS??8)
if(!Number.isSafeInteger(jobs)||jobs<1||jobs>64)throw Error('SOP_NLU_CURATION_JOBS must be an integer from 1 to 64')
const codex=process.env.SOP_NLU_CURATION_CODEX??'codex'
const vibe=process.env.SOP_NLU_CURATION_VIBE??'vibe'
const bytes=await readFile(input)
const splitLines=(input.endsWith('.gz')?gunzipSync(bytes):bytes).toString().split(/\r?\n/).filter(line=>line.trim())
const selected=splitLines.slice(offset,offset+logicalSize*batchCount).map(JSON.parse)
const sha=x=>createHash('sha256').update(x).digest('hex')
const stringify=x=>JSON.stringify(x,null,2)+'\n'
if(!selected.length)throw Error('No rows selected')
const seen=new Set()
for(const row of selected){
  if(typeof row.id!=='string'||!row.id||seen.has(row.id)||typeof row.text!=='string'||!row.text.trim()||
    !Array.isArray(row.candidates)||!row.candidates.every(c=>typeof c?.sop==='string'&&c.sop.trim()))
    throw Error('Invalid or repeated selected input ID: '+row.id)
  seen.add(row.id)
}
const readLocal=url=>readFile(new URL(url,import.meta.url),'utf8')
const instructions=await readLocal('./curation-prompt.md')
const schema=await readLocal('../../schemas/nlu/schema.sop')
const punctuationCode=backend==='vibe'?await readLocal('./duplicate-punctuation.mjs'):''
const anchorCode=backend==='vibe'?await readLocal('./ground-entity-anchor.mjs'):''
const checker=await readLocal('../../lib/check-analysis.mjs')
const code=await readLocal('./curate.mjs')
const knowledge=await readFile(join(knowledgeDir,'tools/sopworld/sopworld.mjs'))
const validate=await createAnalysisValidator({knowledgeDir})
const properties={index:{type:'integer'},readings:{type:'array',items:{type:'object',additionalProperties:false,
  required:['draftIndex','sop'],properties:{draftIndex:{type:['integer','null']},sop:{type:['string','null']}}}},
  ambiguity:{type:['string','null']},reason:{type:['string','null']}}
const replySchema={type:'object',additionalProperties:false,required:['results'],properties:{
  results:{type:'array',items:{type:'object',additionalProperties:false,required:Object.keys(properties),properties}}
}}
const serialization=backend==='vibe'?await readLocal('./vibe-serialization.md'):''
const jsonContract=backend==='vibe'?
  '\nReturn {"results":[{"index":0,"readings":[{"draftIndex":0,"sop":null}],"ambiguity":null,"reason":null}]}. '+
  'Use each input index exactly once. Include all four fields per result.\n':''
const header=instructions+serialization+jsonContract+'\nLocal schema:\n'+schema+'\nInput JSON:\n'
const config={format:'native-nlu-curation-v1',model,reasoning:'low',inputSha256:sha(bytes),offset,rows:selected.length,
  logicalSize,microRows,microBytes,promptSha256:sha(instructions+serialization),schemaSha256:sha(schema),scriptSha256:sha(code),
  checkerSha256:sha(checker),knowledgeLoaderSha256:sha(knowledge),...(backend==='vibe'?{backend,vibe,singlePass:true,punctuationSha256:sha(punctuationCode),anchorSha256:sha(anchorCode)}:{codex})}
const get=async path=>{try{return await readFile(path,'utf8')}catch(e){if(e.code!=='ENOENT')throw e}}
async function ensure(path,text){
  await mkdir(dirname(path),{recursive:true})
  try{await writeFile(path,text,{flag:'wx'})}catch(error){
    if(error.code!=='EEXIST'||await get(path)!==text)throw Error('Run configuration or immutable file differs at '+path)
  }
}
async function save(path,text){
  const tmp=path+'.'+process.pid+'.tmp'
  await writeFile(tmp,text)
  await rename(tmp,path)
}
await ensure(join(output,'manifest.json'),stringify(config))
await ensure(join(output,'curation-prompt.md'),instructions+serialization)
await ensure(join(output,'schema.sop'),schema)
const outputSchema=join(output,'output-schema.json')
await ensure(outputSchema,stringify(replySchema))
const emptyDir=join(output,'sandbox')
await mkdir(emptyDir,{recursive:true})
const started=performance.now()
const known=new Map()
const prior=process.env.SOP_NLU_VIBE_PRIOR
if(backend==='vibe'&&prior){
  const old=JSON.parse(await readFile(join(prior,'manifest.json'),'utf8'))
  if(old.inputSha256!==config.inputSha256||old.offset!==offset||old.rows!==selected.length||
     old.model!==model)throw Error('Prior checkpoint does not belong to this exact Vibe input.')
  for(const file of (await readdir(join(prior,'logical-00000'))).sort()){
    if(!/^\d{3}-(?:initial|repair-\d+)\.json$/u.test(file))continue
    const cached=JSON.parse(await readFile(join(prior,'logical-00000',file),'utf8'))
    for(const row of cached.results??[])known.set(row.index,row)
  }
}
const inputRow=(index,row)=>({index,text:row.text,drafts:row.candidates.map(({sop},index)=>({index,sop}))})
const size=rows=>Buffer.byteLength(header)+Buffer.byteLength(JSON.stringify(rows))
function partition(rows){
  const batches=[]
  let next=[]
  for(const row of rows){
    if(next.length&&(next.length===microRows||size([...next,row])>microBytes)){
      batches.push(next)
      next=[]
    }
    next.push(row)
  }
  if(next.length)batches.push(next)
  return batches
}
function attempt(row,result,issue){
  const problems=issue?[issue]:[]
  const accepted=[]
  const tried=[]
  const shape=result&&Array.isArray(result.readings)&&result.readings.length<=2&&
    (result.ambiguity===null||typeof result.ambiguity==='string')&&
    (result.reason===null||typeof result.reason==='string')
  if(!shape)problems.push('Missing or malformed model result')
  if(shape&&result.readings.length===2&&!result.ambiguity?.trim())problems.push('Two readings require an explicit ambiguity')
  if(shape&&!result.readings.length)problems.push(result.reason?.trim()||'No proposed reading')
  for(const choice of shape?result.readings:[]){
    let sop=null, draftIndex=null
    if(choice?.sop===null&&Number.isInteger(choice.draftIndex)){
      draftIndex=choice.draftIndex
      sop=row.drafts[draftIndex]?.sop??null
    }else if(choice?.draftIndex===null&&typeof choice.sop==='string')sop=choice.sop.trim()
    if(sop&&backend==='vibe'){
      const cleaned=groundEntityAnchor(removeSurplusPunctuation(row.text,restoreLiteralDelimiters(row.text,sop)))
      if(cleaned!==sop){sop=cleaned;draftIndex=null}
    }
    let check=sop?validate(row.text,sop,{alignSource:true}):null
    if(backend==='vibe'&&check?.valid&&!check.coverage.allAccountedFor){
      const completed=restoreOptionalPunctuation(row.text,sop,check.placements)
      if(completed!==sop){
        const final=validate(row.text,completed,{alignSource:true})
        if(hasCompleteSource(final)){sop=completed;draftIndex=null;check=final}
      }
    }
    const eligible=hasCompleteSource(check)
    tried.push({draftIndex,sop,check,eligible})
    if(!eligible)problems.push('Reading '+tried.length+' failed the static gate')
    else if(accepted.some(item=>item.sop.trim()===sop.trim()))problems.push('Exact duplicate reading')
    else accepted.push({draftIndex,sop})
  }
  return {result:result??null,problems,accepted,tried}
}
const callArgs=['-a','never','exec','--ephemeral','--ignore-user-config','--ignore-rules','--skip-git-repo-check',
  '--sandbox','read-only','--color','never','-m',model,'-c','model_reasoning_effort="low"','--output-schema',outputSchema]
async function request(dir,label,rows){
  const base=join(dir,label)
  const sealed=base+'.json'
  const prior=await get(sealed)
  if(prior)return JSON.parse(prior)
  const prompt=header+JSON.stringify(rows)+'\n'
  await ensure(base+'.prompt.txt',prompt)
  if(size(rows)>microBytes){
    const response={results:[],issue:'Source and drafts exceed prompt byte limit',wallMs:0}
    await save(sealed,stringify(response))
    return response
  }
  const raw=base+'.'+process.pid+'.response.json'
  const began=performance.now()
  const useVibe=backend==='vibe'
  const limit=useVibe?Math.max(150,Math.ceil(rows.length*1.8)+45):165
  const args=useVibe?['--trust','--auto-approve','--enabled-tools','__no_tools__',
    '--model',model,'--max-turns','1','--time-limit',String(limit),'--output','text','--prompt-file',base+'.prompt.txt']:
    [...callArgs,'-o',raw,'-']
  const child=spawn(useVibe?vibe:codex,args,{cwd:emptyDir,stdio:['pipe','pipe','pipe']})
  let diagnostics='', output=''
  child.stdout.setEncoding('utf8').on('data',chunk=>{if(useVibe)output+=chunk})
  child.stderr.setEncoding('utf8').on('data',chunk=>diagnostics+=chunk)
  child.stdin.on('error',()=>{})
  child.stdin.end(useVibe?undefined:prompt)
  const timer=setTimeout(()=>child.kill('SIGKILL'),(limit+15)*1000)
  const status=await new Promise(resolve=>{
    child.once('error',error=>resolve(error.message))
    child.once('close',code=>resolve(code))
  }).finally(()=>clearTimeout(timer))
  if(useVibe&&status!==0){
    await save(base+'.log',diagnostics)
    throw Error('Vibe failed ('+status+'); rerun the same batch to retry this request.')
  }
  if(useVibe)await save(raw,output)
  const body=await get(raw)
  await save(base+'.log',diagnostics)
  if(body!==undefined)await rename(raw,base+'.response.json')
  let issue, results=[]
  try{
    if(status!==0)throw Error(backend+' process failed: '+status)
    const content=useVibe?body.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu,'$1'):body
    results=JSON.parse(content).results
    if(!Array.isArray(results)||results.some(row=>!rows.some(source=>source.index===row.index))||
      new Set(results.map(row=>row.index)).size!==results.length)throw Error('Invalid response index set')
  }catch(error){issue=error.message;results=[]}
  const response={results,issue,status,args,wallMs:performance.now()-began}
  await save(sealed,stringify(response))
  return response
}
const lift=(rows,batch)=> {
  const byIndex=new Map(batch.results.map(result=>[result.index,result]))
  return rows.map(row=>attempt(row,byIndex.get(row.index),byIndex.has(row.index)?undefined:batch.issue))
}
function feedback(row,record){
  return {previous:record.result,issues:record.problems,checks:record.tried.map(({check})=>check?{
    findings:check.findings,sourceGaps:check.sourceGaps,uncovered:check.coverage.uncovered,
    unresolved:check.coverage.unresolved,
    missingQuotes:check.sourceValid?sourceTokenMatches(row.text).flatMap((token,i)=>
      check.placements.some(({start,end})=>start<=i&&i<end)?[]:[token[0]]):undefined}:null)}
}
async function runMicro(dir,number,rows){
  const name=String(number).padStart(3,'0')
  const missing=rows.filter(row=>!known.has(row.index))
  const fresh=missing.length?await request(dir,name+'-initial',missing):{results:[]}
  const initial=lift(rows,{...fresh,results:[...fresh.results,...rows.flatMap(row=>known.has(row.index)?[known.get(row.index)]:[])]})
  const pending=backend==='vibe'?[]:rows.flatMap((row,i)=>initial[i].problems.length?
    [{...row,repair:feedback(row,initial[i])}]:[])
  const correction=new Map()
  for(const [i,chunk] of partition(pending).entries()){
    const repairs=lift(chunk,await request(dir,name+'-repair-'+i,chunk))
    for(const [j,row] of chunk.entries())correction.set(row.index,repairs[j])
  }
  return rows.map(({index},i)=>{
    const original=selected[index-offset]
    const repair=correction.get(index)
    const best=repair??initial[i]
    const ready=!best.problems.length
    const accepted=(!ready&&initial[i].accepted.length>best.accepted.length?initial[i]:best).accepted
    return {id:original.id,text:original.text,index,status:ready?'curated':'rework',readings:ready?accepted:[],
      ...(ready&&accepted.length===2?{ambiguity:best.result.ambiguity}:{}),
      ...(!ready?{partialReadings:accepted,problems:best.problems}:{}),attempts:repair?2:1}
  })
}
const summaries=[]
for(let base=0;base<selected.length;base+=logicalSize){
  const dir=join(output,'logical-'+String((offset+base)/logicalSize).padStart(5,'0'))
  await mkdir(dir,{recursive:true})
  const rows=selected.slice(base,base+logicalSize).map((row,i)=>inputRow(offset+base+i,row))
  const groups=partition(rows)
  const replies=new Array(groups.length)
  let next=0
  await Promise.all(Array.from({length:Math.min(jobs,groups.length)},async()=>{
    while(next<groups.length){
      const at=next++
      replies[at]=await runMicro(dir,at,groups[at])
      console.log(dir,at+1,'/',groups.length,replies[at].filter(r=>r.status==='curated').length,'curated')
    }
  }))
  const results=replies.flat()
  const rework=results.filter(row=>row.status==='rework')
  const encode=rows=>gzipSync(rows.map(row=>JSON.stringify(row)+'\n').join(''))
  await save(join(dir,'records.jsonl.gz'),encode(results))
  await save(join(dir,'rework.jsonl.gz'),encode(rework))
  const summary={logicalBatch:(offset+base)/logicalSize,rows:results.length,curated:results.length-rework.length,
    rework:rework.length,secondReadings:results.filter(row=>row.readings.length===2).length,
    confirmedDrafts:results.flatMap(row=>row.readings).filter(row=>row.draftIndex!==null).length,
    modifiedReadings:results.flatMap(row=>row.readings).filter(row=>row.draftIndex===null).length}
  await save(join(dir,'summary.json'),stringify(summary))
  summaries.push(summary)
}
await save(join(output,'summary.json'),stringify({wallMs:performance.now()-started,summaries}))
