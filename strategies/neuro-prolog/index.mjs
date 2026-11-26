import {createAnalysisValidator,hasCompleteSource} from '../../lib/check-analysis.mjs'
import {openDependencies} from '../neural-dependencies/index.mjs'
import {prolog} from '../prolog/index.mjs'
import {prologWorker} from '../prolog/src/prolog-worker.mjs'

const program = new URL('./prolog/worker.pl',import.meta.url)

// The projection owns wire types and source intervals. Serialization only reads the source.
function serialize(text,tokens,wires) {
  const lines=wires.map(([id,type,fields])=>{
    const attributes=fields.map(([slot,kind,value,end])=>{
      if (kind==='atom') return slot+'='+value
      if (kind==='ref') return slot+'=$'+value
      return slot+'='+JSON.stringify(text.slice(tokens[value].start,tokens[end-1].end))
    })
    return '@'+id+' nlu.'+type+' '+attributes.join(' ')
  })
  return {sop:lines.join('\n'),semanticEvidence:[],origin:'dependency-prolog'}
}

function rank(text,validate,neural,symbolic) {
  const distinct=new Map()
  for (const candidate of [...symbolic,...neural]) {
    if (!distinct.has(candidate.sop)) {
      distinct.set(candidate.sop,{candidate,check:validate(text,candidate.sop)})
    }
  }
  const valid=[...distinct.values()].filter(({check})=>check.valid)
  const complete=valid.filter(({check})=>hasCompleteSource(check))
  const ranked=complete.length ? complete : valid.sort((a,b)=>
    a.check.sourceGaps.materialUnresolved+a.check.sourceGaps.materialUncovered-
    b.check.sourceGaps.materialUnresolved-b.check.sourceGaps.materialUncovered
  )
  return {
    analyses:ranked.slice(0,3).map(({candidate})=>candidate),
    projectionFindings:[...distinct.values()].filter(({candidate,check})=>
      candidate.origin==='dependency-prolog' && !check.valid).map(({check})=>check.findings)
  }
}

export const neuroProlog = {
  name:'neuro-prolog',
  async open({
    knowledgeDir=process.env.SOP_KNOWLEDGE_DIR,
    swipl=process.env.SWIPL || 'swipl',
    worldPaths,python,model,syntaxModel,schemaPaths,dependencyOnly=false
  }={}) {
    const validate=await createAnalysisValidator({knowledgeDir,schemaPaths})
    const dependencies=await openDependencies({python,model,syntaxModel})
    let symbolic=null
    try {
      if (!dependencyOnly) symbolic=await prolog.open({knowledgeDir,swipl,worldPaths})
    } catch (error) {
      await dependencies.close()
      throw error
    }
    const solver=prologWorker(program,swipl)

    async function analyse(text) {
      const result=await Promise.allSettled([
        dependencies.parse(text).then(async tokens=>{
          const projected=await solver.request({tokens})
          if (projected.error) throw Error(projected.error)
          return [serialize(text,tokens,projected.wires)]
        }),
        symbolic?.analyse(text) ?? {analyses:[]}
      ])
      const [neural,pure]=result
      const errors=result.filter(part=>part.status==='rejected').map(part=>String(part.reason))
      if (pure.status==='fulfilled' && pure.value.analysisDiagnostics?.error) {
        errors.push(pure.value.analysisDiagnostics.error)
      }
      const {analyses,projectionFindings}=rank(text,validate,neural.status==='fulfilled'?neural.value:[],
        pure.status==='fulfilled'?pure.value.analyses:[])
      return {analyses,analysisDiagnostics:{
        solver:'swipl',status:errors.length?(analyses.length?'partial':'error'):'ok',
        model:dependencies.metadata,
        ...(projectionFindings.length?{projectionFindings}:{}),
        ...(errors.length?{error:errors.join(' | ')}:{})
      }}
    }

    return {
      analyse,
      model:dependencies.metadata,
      async close() {
        const closed=await Promise.allSettled([dependencies.close(),solver.close(),symbolic?.close()])
        const failure=closed.find(result=>result.status==='rejected')
        if (failure) throw failure.reason
      }
    }
  }
}
