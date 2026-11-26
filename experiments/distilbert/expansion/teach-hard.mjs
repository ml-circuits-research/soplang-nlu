import {createHash} from 'node:crypto'
import {spawn} from 'node:child_process'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {gunzipSync,gzipSync} from 'node:zlib'
import {createAnalysisValidator,hasCompleteSource,sourceTokenMatches} from '../../../lib/check-analysis.mjs'

const [inputPath,outputPath,knowledgePath] = process.argv.slice(2)
if (!knowledgePath) throw Error('Usage: teach-hard.mjs TRANCHE_DIR NEW_OUTPUT_DIR KNOWLEDGE_DIR')
const input = resolve(inputPath), out = resolve(outputPath), knowledgeDir = resolve(knowledgePath)
const sha = value => createHash('sha256').update(value).digest('hex')
const unpack = bytes => gunzipSync(bytes).toString().trim().split('\n').filter(Boolean).map(JSON.parse)
const write = (name,data) => writeFile(join(out,name),JSON.stringify(data,null,2)+'\n',{flag:'wx'})
const packed = (name,rows) => writeFile(join(out,name),gzipSync(rows.map(JSON.stringify).join('\n')+'\n'),{flag:'wx'})
const read = async name => readFile(join(input,name))
const [sampleBytes,hardBytes,sealBytes] = await Promise.all([
  read('sample.json.gz'),read('no-complete-proposal.jsonl.gz'),read('selection.json')
])
const seal = JSON.parse(sealBytes)
if (sha(sampleBytes) !== seal.sampleSha256 || seal.exactTextOverlap !== 0) throw Error('Training tranche seal mismatch.')
const sample = JSON.parse(gunzipSync(sampleBytes))
const hard = unpack(hardBytes)
const failures = new Map(hard.map(row=>[row.id,row.text]))
if (failures.size !== hard.length || sample.length !== seal.count ||
    new Set(sample.map(row=>row.id)).size !== sample.length ||
    new Set(sample.map(row=>row.text)).size !== sample.length) throw Error('Invalid training tranche.')
const expected = sample.filter(row=>failures.has(row.id))
if (expected.length !== hard.length ||
    expected.some(({id,text},i)=>hard[i].id !== id || hard[i].text !== text)) throw Error('Failure list differs from frozen source order.')
const selected = expected.slice(0,500)
if (!selected.length) throw Error('No hard sources in the tranche.')
const reserved = new Set(JSON.parse(gunzipSync(await readFile(
  new URL('../../../tests/benchmark/next-evaluation/reserved-exact-texts.json.gz',import.meta.url)))))
if (selected.some(({text})=>reserved.has(sha(text)))) throw Error('Reserved text in hard training tranche.')
const validate = await createAnalysisValidator({knowledgeDir})
const ids = new Set(selected.map(row=>row.id))
const candidates = new Map()
const shardDigests = []
for(let shard=0;shard<6;shard++) {
  const path = 'part-'+shard+'/pool.jsonl.gz'
  const [bytes,timing] = await Promise.all([read(path),read(path+'.timing.json')])
  const rows = unpack(bytes)
  if (JSON.parse(timing).rows !== rows.length) throw Error('Unsealed provider shard.')
  shardDigests.push(sha(bytes))
  for(const row of rows.filter(row=>ids.has(row.id))) {
    if(candidates.has(row.id)) throw Error('Duplicate selected row in provider shards.')
    candidates.set(row.id,row)
  }
}
function feedback(text,check) {
  if(!check) return 'No circuit.'
  const byToken = new Map()
  for (const placement of check.placements ?? []) {
    for(let i=placement.start;i<placement.end;i++) byToken.set(i,placement.key)
  }
  return {findings:check.findings,coverage:check.coverage,sourceGaps:check.sourceGaps,
    unresolved:sourceTokenMatches(text).filter((_,i)=>byToken.get(i)==='unresolved').map(token=>token[0]),
    uncovered:sourceTokenMatches(text).filter((_,i)=>!byToken.has(i)).map(token=>token[0])}
}
const rows = selected.map(({id,text},index)=>{
  const provider = candidates.get(id)
  if(provider?.text!==text) throw Error('Missing provider evidence for selected row '+id)
  const grounded = provider.candidates.map(({sop,eligible})=>{
    const check = validate(text,sop,{alignSource:true})
    if (eligible || hasCompleteSource(check)) throw Error('Complete provider in hard tranche: '+id)
    return {sop,check}
  }).filter(item=>item.check.valid).sort((a,b)=>{
    const gaps = ({check})=>check.sourceGaps.materialUncovered+check.sourceGaps.materialUnresolved
    return gaps(a)-gaps(b) || b.check.coverage.understood-a.check.coverage.understood
  })
  const draft = grounded[0]
  return {id,text,index,...(draft?{draftSop:draft.sop,draftFeedback:feedback(text,draft.check)}:{})}
})

const jobs = Number(process.env.TEACHER_JOBS ?? 8)
const batchSize = 8
const model = 'gpt-6-sol'
if(!Number.isSafeInteger(jobs)||jobs<1) throw Error('Expected positive TEACHER_JOBS.')
const instructions = await readFile(new URL('../../native-teacher/prompt.md',import.meta.url),'utf8') +
  '\nAn optional draftSop is an incomplete provider proposal supplied solely to flag gaps. It can be wrong even in quoted roles. You may keep independently correct parts, or replace the entire draft. Analyze the original text independently. In a repair input, previousSop is the teacher output that failed the static check.\n'
const schema = await readFile(new URL('../../../schemas/nlu/schema.sop',import.meta.url),'utf8')
const outputSchema = {type:'object',additionalProperties:false,required:['results'],properties:{results:{type:'array',items:{
  type:'object',additionalProperties:false,required:['index','sop'],properties:{index:{type:'integer'},sop:{type:'string'}}
}}}}
await mkdir(out)
await mkdir(join(out,'batches'))
await mkdir(join(out,'sandbox'))
await write('selection.json',{sampleSha256:sha(sampleBytes),failureListSha256:sha(hardBytes),
  parentSelectionSha256:sha(sealBytes),schemaSha256:sha(schema),shardDigests,model,reasoning:'low',batchSize,
  count:rows.length,withDraft:rows.filter(row=>row.draftSop).length,ids:rows.map(row=>row.id)})
await writeFile(join(out,'prompt.md'),instructions,{flag:'wx'})
await writeFile(join(out,'schema.sop'),schema,{flag:'wx'})
await write('output-schema.json',outputSchema)
await packed('sources.jsonl.gz',rows.map(({id,text})=>({id,text})))

async function batch(inputs,phase,index) {
  const base = join(out,'batches',phase+'-'+index)
  const prompt = instructions+'\nLocal schema:\n'+schema+'\nInput JSON:\n'+JSON.stringify(inputs)+'\n'
  await writeFile(base+'.prompt.txt',prompt,{flag:'wx'})
  const args = ['-a','never','exec','--ephemeral','--ignore-user-config','--skip-git-repo-check','--sandbox','read-only',
    '--color','never','-m',model,'-c','model_reasoning_effort="low"','--output-schema',join(out,'output-schema.json'),
    '-o',base+'.output.json','-']
  const child = spawn('codex',args,{cwd:join(out,'sandbox'),stdio:['pipe','pipe','pipe']})
  child.stdout.resume()
  let diagnostic = ''
  child.stderr.setEncoding('utf8').on('data',chunk=>{diagnostic+=chunk})
  child.stdin.on('error',()=>{})
  child.stdin.end(prompt)
  const timeout = setTimeout(()=>child.kill('SIGKILL'),180000)
  const exit = await new Promise((done,fail)=>{child.once('error',fail);child.once('close',done)})
    .finally(()=>clearTimeout(timeout))
  await writeFile(base+'.log',diagnostic,{flag:'wx'})
  const responses = new Map()
  let responseError
  try {
    if (exit!==0) throw Error('Process exit '+exit)
    const {results} = JSON.parse(await readFile(base+'.output.json'))
    for (const result of results) {
      if(!inputs.some(item=>item.index===result.index)||responses.has(result.index)||typeof result.sop!=='string') {
        throw Error('Invalid teacher response index or circuit.')
      }
      responses.set(result.index,result.sop.trim())
    }
  } catch(error) {
    responses.clear()
    responseError=error.message
  }
  const attempts = inputs.map(({index,text})=>{
    const sop = responses.get(index) ?? ''
    const check = sop ? validate(text,sop,{alignSource:true}) : null
    return {index,sop,eligible:hasCompleteSource(check),...(responseError?{responseError}:{}),
      ...(!hasCompleteSource(check)?{staticFeedback:feedback(text,check)}:{})}
  })
  await writeFile(base+'.status.json',JSON.stringify(attempts,null,2)+'\n',{flag:'wx'})
  console.log(phase,index,attempts.filter(row=>row.eligible).length+'/'+inputs.length)
  return attempts
}
async function round(inputs,phase) {
  const results = []
  const batches = Array.from({length:Math.ceil(inputs.length/batchSize)},(_,i)=>inputs.slice(i*batchSize,(i+1)*batchSize))
  let next = 0
  await Promise.all(Array.from({length:Math.min(jobs,batches.length)},async ()=>{
    while(next<batches.length) {
      const index = next++
      results[index] = await batch(batches[index],phase,index)
    }
  }))
  return results.flat()
}
const begin = performance.now()
const first = await round(rows.map(({id,...item})=>item),'initial')
const second = await round(first.filter(item=>!item.eligible).map(({index,sop,staticFeedback})=>
  ({index,text:rows[index].text,previousSop:sop,staticFeedback})),'repair')
const repairs = new Map(second.map(item=>[item.index,item]))
const pool = rows.map(({id,text,index})=>{
  const proposal = repairs.get(index) ?? first[index]
  return {id,text,candidates:proposal.eligible?[{family:'native-teacher-hard',rank:0,sop:proposal.sop,eligible:true}]:[]}
})
await packed('pool.jsonl.gz',pool)
await write('pool.jsonl.gz.timing.json',{rows:rows.length,model,jobs,batchSize,wallMs:performance.now()-begin,
  firstEligible:first.filter(row=>row.eligible).length,attemptedRepair:second.length,
  repairedEligible:second.filter(row=>row.eligible).length,eligible:pool.filter(row=>row.candidates.length).length})
