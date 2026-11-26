# Frozen four-family proposal pools

This archive releases source-only frozen candidates and blind acceptance labels for a bounded selector experiment. The fit and validation cohort contains 600 new texts from dataset revision `38ae0b5`. The first 500 hash-ranked texts are reserved for fitting and the last 100 for validation. The exact 250 historical comparison IDs are separate and supply no fit or validation labels. The verified training and validation texts have zero exact overlap with the earlier 600 model adaptation sources, the historical 1%, or the sealed fresh 1%. No fresh source text was written to the experiment artifacts.

Both pools used the same frozen public projection and validation code at `3fc0d95`. The four source-only families are pretrained transformer beam, adapted transformer beam, adapted compact direct projection, and Neuro-Prolog. Base beam and Neuro-Prolog share the pretrained dependency call. The pool preserves each returned circuit's original family and rank, including public candidates that fail material source coverage. The input sample, model artifacts, installed world revision, pool digests and original CPU collection latency are recorded in the manifests.

| Cohort | Sources | Public observations | Eligible distinct exact source/circuit targets | Novel review | Exact reuse |
| --- | ---: | ---: | ---: | ---: | ---: |
| Training and validation | 600 | 3,758 | 2,235 | 2,235 | 0 |
| Historical diagnostic | 250 | 1,573 | 943 | 133 | 810 |

All novel reviews present one literal circuit per target without family, rank, split or reference cells. The primary and independent reviewers each evaluate all novel eligible targets. A third reviewer resolves their acceptance disagreements. A separate deterministic sample from each agreement stratum measures judge variability. The historical diagnostic samples found six acceptance contradictions among 40 agreement checks. These audits preserve the original consensus unless the first two reviewers disagree. This fixed procedure keeps the labels uniform; the independent agreement checks are retained for interpretation.

The training pool supplies at least one accepted candidate on 369 of 500 fitting texts and 81 of 100 validation texts. The separate diagnostic pool has one on 203 of 250 texts. All 263 training-pool threshold disagreements were independently settled, and three of 40 sampled consensus decisions were contradicted. This is the availability of reviewed choices and is separate from any measured ranking performance. `summary.json` gives the corresponding training and validation availability and contribution by family.

## Data and verification

- `train/pool.jsonl.gz` and `diagnostic/pool.jsonl.gz` store literal source and public candidates.
- `train/votes.jsonl.gz` and `diagnostic/votes.jsonl.gz` store one boolean decision per exact eligible source ID and SOP circuit.
- `train/split.json` stores the disjoint fitting and validation IDs.
- The cohort review folders store exact membership, novel and reused decisions, blind judge evidence and adjudication.

The [experiment workflow](../../experiments/proposal-selection/README-pool-data.md) reproduces source selection, collection, blind labeling and independent static verification. Offline sealing reuses archived judgments and requires no new model calls.

```sh
out=eval-results/2026-11-26-neuro-selector-proposal-pools
exp=experiments/proposal-selection
for cohort in train diagnostic; do
  python3 "$exp/review-pool.py" seal "$out/$cohort"
  node "$exp/verify-pool.mjs" "$out/$cohort" "$SOP_KNOWLEDGE_DIR"
done
python3 "$exp/summarize-pool.py" "$out"
```
