// The neuro-selector: four other strategies each write a circuit of the `syntax` schema for the
// message, a fitted ranker scores the distinct circuits, and the best one is returned. Where the
// circuits of the pool do not settle the start of a phrase, the returned circuit says so
// (`attachment=ambiguous`). No knowledge repository is read.
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {selectorChoices} from './syntax-features.mjs'
import {openSyntaxPool} from './syntax-pool.mjs'
import {selectReadings} from './score.mjs'
import {settleAttachments} from './attachments.mjs'

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

/**
 * `open` takes the options of the pool (see syntax-pool.mjs) and `selectorModelPath`
 * (or SOP_NLU_SELECTOR_MODEL; by default the model.json beside this file).
 * `analyse(text)` returns {analyses: [{sop, selectorScore, families}]} with one circuit, or
 * {analyses: [], error}.
 */
async function open({
  selectorModelPath = process.env.SOP_NLU_SELECTOR_MODEL ?? defaultModel,
  ...options
} = {}) {
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
  const pool = await openSyntaxPool(options)
  const modelSha256 = createHash('sha256').update(bytes).digest('hex')
  async function analyse(text) {
    const diagnostics = {projector:'neuro-selector',modelSha256}
    try {
      const {observations,failures} = await pool.propose(text)
      const input = selectorChoices(text,observations,model.featureNames)
      if (!input.candidates.length) {
        const error = 'No strategy of the pool returned a valid circuit' +
          (failures.length ? ': ' + failures.map(failure => failure.family + ': ' + failure.error).join('; ') : '.')
        return {analyses:[],error,analysisDiagnostics:{...diagnostics,status:'no-circuit',failures}}
      }
      // the ranker orders the distinct circuits; a strategy returns one circuit, so the first is taken
      const [best] = selectReadings(input,model)
      const chosen = input.candidates[best.index]
      const sop = settleAttachments(text,chosen.sop,observations.map(observation => observation.sop))
      return {analyses:[{sop,selectorScore:best.probability,families:chosen.families}],
        analysisDiagnostics:{...diagnostics,status:'ok',observations:observations.length,
          distinctCircuits:input.candidates.length,attachmentsLeftOpen:sop !== chosen.sop,
          ...(failures.length ? {failures} : {})}}
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {analyses:[],error:message,analysisDiagnostics:{...diagnostics,status:'error',error:message}}
    }
  }
  return {analyse,propose:analyse,close:()=>pool.close()}
}

export const neuroSelector = {name:'neuro-selector',schema:'syntax',open}
