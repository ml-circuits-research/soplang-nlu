import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {selectorChoices} from './features.mjs'
import {openProposalPool} from './pool.mjs'
import {selectReadings} from './score.mjs'

const defaultModel = new URL('./model.json',import.meta.url)

function validEstimator(estimator, width) {
  const finiteArray = (values, size) => Array.isArray(values) &&
    values.length === size && values.every(Number.isFinite)
  if (estimator?.type === 'logistic') {
    return Number.isFinite(estimator.intercept) && finiteArray(estimator.weights,width)
  }
  if (estimator?.type !== 'gradient_boosting' ||
      ![estimator.baseScore,estimator.learningRate].every(Number.isFinite) ||
      !Array.isArray(estimator.trees) || !estimator.trees.length) return false
  return estimator.trees.every(tree => {
    const size = tree?.left?.length
    return size > 0 && ['feature','threshold','left','right','value'].every(key => finiteArray(tree[key],size)) &&
      tree.left.every((left,index) => {
        const right = tree.right[index]
        const feature = tree.feature[index]
        const child = offset => Number.isInteger(offset) && offset > index && offset < size
        return left < 0 ? right < 0 : child(left) && child(right) &&
          Number.isInteger(feature) && feature >= 0 && feature < width
      })
  })
}

async function open({
  knowledgeDir = process.env.SOP_KNOWLEDGE_DIR,
  selectorModelPath = process.env.SOP_NLU_SELECTOR_MODEL ?? defaultModel,
  ...options
} = {}) {
  if (!knowledgeDir) throw Error('Set SOP_KNOWLEDGE_DIR or pass knowledgeDir.')
  const bytes = await readFile(selectorModelPath).catch(error => {
    if (error.code === 'ENOENT') {
      throw Error('Proposal ranker model is missing. Set SOP_NLU_SELECTOR_MODEL or install model.json.', {cause:error})
    }
    throw error
  })
  const model = JSON.parse(bytes)
  if (model?.format !== 'sop-proposal-ranker-v1' || !Array.isArray(model.featureNames) ||
      !model.featureNames.length || !model.featureNames.every(name => typeof name === 'string') ||
      !validEstimator(model.estimator,model.featureNames.length) ||
      !Number.isInteger(model.policy?.maxCandidates) || model.policy.maxCandidates < 1 ||
      model.policy.maxCandidates > 3 || ![model.policy.minScore,model.policy.maxSimilarity]
        .every(value => Number.isFinite(value) && value >= 0 && value <= 1)) {
    throw Error('Invalid proposal ranker model.')
  }
  const {parse} = await import(pathToFileURL(join(resolve(knowledgeDir),'tools/sopworld/sopworld.mjs')))
  const pool = await openProposalPool({knowledgeDir,...options})
  const modelSha256 = createHash('sha256').update(bytes).digest('hex')
  async function analyse(text) {
    const diagnostics = {projector:'neuro-selector',modelSha256}
    try {
      const observations = await pool.propose(text)
      const input = selectorChoices(text,observations,parse)
      if (!input.candidates.length) {
        const first = observations[0]
        return {analyses:first ? [{sop:first.sop}] : [],analysisDiagnostics:{...diagnostics,
          status:first ? 'partial' : 'no-eligible',observations:observations.length,eligibleCircuits:0,
          ...(first ? {fallbackFamily:first.family,fallbackRank:first.rank} : {})}}
      }
      const analyses = selectReadings(input,model).map(({index,probability}) =>
        ({sop:input.candidates[index].sop,selectorScore:probability}))
      return {analyses,analysisDiagnostics:{...diagnostics,status:'ok',
        observations:observations.length,eligibleCircuits:input.candidates.length}}
    } catch (error) {
      return {analyses:[],analysisDiagnostics:{...diagnostics,status:'error',error:error.message}}
    }
  }
  return {analyse,propose:analyse,close:()=>pool.close()}
}

export const neuroSelector = {name:'neuro-selector',open}
