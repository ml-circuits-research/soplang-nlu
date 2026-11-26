# Offline proposal selection training

Use a Python environment with scikit-learn installed. Node inference needs
the exported JSON only.

```sh
python experiments/proposal-selection/train.py fit train.jsonl.gz validation.jsonl.gz features.json model.json --report fit.json
python experiments/proposal-selection/train.py score model.json diagnostic.jsonl.gz --report diagnostic-report.json
python experiments/proposal-selection/test_train.py
```

Supply training and validation as separate files. The trainer checks that
they contain exactly 500 training IDs and 100 validation IDs, with no overlap.
The model stores their sorted ID digests and input file digests. Hold the
separate diagnostic file until the model has been frozen. The scoring command
loads the artifact before it opens the specified input, and records the model
digest with the results.

Each JSONL row has `id`, `split` and `candidates`. Each candidate has its
`sop`, an ordered finite numeric `features` array, a boolean `accepted` and a
`similarity` array in candidate order. Similarities lie in [0, 1]. Candidate
order is preserved for scoring ties. An empty array represents a text without
an eligible proposal. The feature names file is an ordered JSON array.

Both classifiers fit training labels only. Every nonempty training text gets
total weight one, distributed equally across its candidates. The estimators
are standardized logistic regression and shallow gradient boosting with a
fixed seed and fixed hyperparameters. Validation compares a fixed policy grid.
Among policies within two percentage points of the best validation ANY rate,
selection maximizes ALL, then ANY, then prefers fewer returned candidates.
The validation report records all tried policies.

The `sop-proposal-ranker-v1` artifact contains `featureNames`, `estimator` and
`policy`. The logistic estimator is `{type, intercept, weights}` in the original
feature space. Its logit starts at `intercept` and adds each feature times its
weight in order. The boosting estimator is
`{type, baseScore, learningRate, trees}`. Each tree has parallel arrays
`feature`, `threshold`, `left`, `right`, and `value`. Start at node zero. At a
nonleaf, convert its feature value to float32 and take the left branch for
`value <= threshold`. A negative left index identifies a leaf. The logit
starts at `baseScore` and adds each leaf value times `learningRate`, in tree
order. Apply the sigmoid to the logit to obtain the score.

The policy is `{maxCandidates, minScore, maxSimilarity}`. Sort by descending
score and break ties with the original candidate index. Always keep the first
eligible candidate, even below `minScore`. Add later candidates up to the cap
when their score is at least `minScore` and each similarity to a selected
candidate is at most `maxSimilarity`. Use the candidate's similarity array
for this check. In a score report, each row records its selected indices and
reference scores in original candidate order. The summary reports NONE,
SOME, ALL, ANY and mean candidate count.
