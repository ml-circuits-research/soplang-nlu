// The portable model has no text dictionary or per-input table. All scores
// use features of this source, its grounded circuits and the other providers.
function probability(features,model) {
  let logit
  if(model.type==='logistic'){
    logit=model.intercept
    for(const [i,x] of features.entries())logit+=x*model.weights[i]
  } else if(model.type==='gradient_boosting'){
    logit=model.baseScore
    for(const tree of model.trees){
      let node=0
      while(tree.left[node]>=0){
        node=Math.fround(features[tree.feature[node]])<=tree.threshold[node]?tree.left[node]:tree.right[node]
      }
      logit+=model.learningRate*tree.value[node]
    }
  } else throw Error('Unsupported proposal ranker')
  return logit>=0?1/(1+Math.exp(-logit)):Math.exp(logit)/(1+Math.exp(logit))
}

export function selectReadings(input,model) {
  const {featureNames,candidates}=input
  if(!candidates.length)return []
  if(model.format!=='sop-proposal-ranker-v1'||JSON.stringify(featureNames)!==JSON.stringify(model.featureNames))
    throw Error('Proposal ranker feature schema mismatch')
  const {maxCandidates,minScore,maxSimilarity}=model.policy
  if(!Number.isInteger(maxCandidates)||maxCandidates<1||maxCandidates>3)throw Error('Invalid public proposal cap')
  const ranked=candidates.map((candidate,index)=>({index,probability:probability(candidate.features,model.estimator)}))
    .sort((a,b)=>b.probability-a.probability||a.index-b.index)
  const chosen=[]
  for(const item of ranked) {
    if(chosen.length && (item.probability<minScore ||
        chosen.some(previous=>candidates[item.index].similarity[previous.index]>maxSimilarity)))continue
    chosen.push(item)
    if(chosen.length===maxCandidates)break
  }
  return chosen
}
