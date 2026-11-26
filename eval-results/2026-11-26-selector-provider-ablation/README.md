# Provider ablation on the historical SHA250 pool

The three spaCy providers together had at least one accepted reading available on **199 of 250 texts (79.6%)**. Adding Neuro-Prolog raised availability to **203 of 250 (81.2%)**, four additional texts. These are oracle availability counts from settled votes. A deployed ranker would still need to choose the accepted reading from the available set.

| Providers retained cumulatively | Texts with an accepted reading | Added texts | Estimated serial CPU latency |
|---|---:|---:|---:|
| Pretrained transformer beam | 179/250 (71.6%) | — | ~48 ms |
| + adapted transformer beam | 194/250 (77.6%) | +15 (+6.0 pp) | ~98 ms |
| + adapted compact direct | 199/250 (79.6%) | +5 (+2.0 pp) | ~100 ms |
| + Neuro-Prolog | 203/250 (81.2%) | +4 (+1.6 pp) | ~105 ms |

The comparison retains eligible public observations from the named providers, then checks the settled vote for each exact `(id, SOP)` pair. A text counts once even if several families supplied accepted readings. All 943 eligible pairs matched a settled vote. Adding a provider can only increase this metric. No candidates were generated or reranked for this comparison. [Counts, changed IDs, and input hashes](summary.json)

## Timing basis

The cumulative latency column adds component medians from separate CPU runs. The pretrained and adapted transformer direct runs took 47.61 and 48.63 ms, respectively. The pretrained beam pilot measured 0.78 ms of additional beam work, used here as a proxy for both beam decoders. The adapted compact direct run took 1.97 ms. Neuro-Prolog added 5.31 ms of mapping in its archived historical run and shares the base greedy graph. These component sums are approximate. The actual full four-provider collector on this cohort measured **113.58 ms median and 269.75 ms p95**, excluding model startup. It used two serial transformer encodings per text. [Timing files and scope](summary.json)

## Paired readings

**“just put it back”** (`diagram/nodes-05.csv#2014`). The pretrained beam was source-complete and its sole reading failed. The adapted beam’s first reading passed after changing the clause from declarative to imperative. The other fields and the pronoun wire stayed the same.

```sop
@n1 nlu.clause form=declarative predicate="put" polarity=positive adverb="just" direct_object=$n2 particle="back"
@n2 nlu.entity pronoun="it"
```

```sop
@n1 nlu.clause form=imperative predicate="put" polarity=positive adverb="just" direct_object=$n2 particle="back"
@n2 nlu.entity pronoun="it"
```

**“rounding this off with a vials”** (`drawing/objects-04.csv#444`). All three spaCy providers returned the same rejected circuit. Neuro-Prolog preserved the object, particle and prepositional attachment while marking “rounding” as nonfinite. That reading passed.

```sop
@n1 nlu.clause form=declarative predicate="rounding" polarity=positive direct_object=$n2 particle="off"
@n2 nlu.entity pronoun="this"
@n3 nlu.entity head="vials" determiner="a"
@n4 nlu.relation kind=with from=$n1 to=$n3 cue="with"
```

```sop
@c0 nlu.clause form=nonfinite predicate="rounding" direct_object=$e1 particle="off"
@e1 nlu.entity pronoun="this"
@r3 nlu.relation kind=with from=$c0 to=$e5 cue="with"
@e5 nlu.entity head="vials" determiner="a"
```
