# Symbolic Z3 finite clauses and complex nominal phrases

The Z3 chart now offers explicitly grounded finite subordinate adjuncts, including condition, purpose, cause, concession and time. A prefix or suffix can independently select its own predicate and overt subject. The matrix selects a typed directed relation. An interrogative content verb can select an embedded `if` or `whether` clause as its complement. An adjectival result can compete with a nominal reading when the verb frame supports an overt object plus a predicate. A fused genitive can supply a separate possessor entity within an otherwise ordinary noun phrase. The exact source token includes its possessive inflection.

The first change is `341779b`. The second is `5abf59f`. Both keep the plan and its local roles in the MaxSMT optimizer and retain the public budget of two readings. The latter also allows a word with one supported open-class category in the installed WordNet counts to supply a category if the earlier lexicon and morphology offered none.

## Development protocol

The paired replay uses the existing 283-source expanded DistilBERT development split (`a27bd763ef92d54af878e605a41625cf74f572128aa91b35ebfe0164b34a23bd`). Only the source reaches the public reader. The baseline is `9ecd3bf`; the updated Z3 sources are `5abf59f`. The cohort was used for development diagnostics. The replay did not use the published 100/250 studies. An exact digest comparison against the reserved inventory gave zero overlaps. The run is a development comparison.

Replay the two versions sequentially with the same environment, solver install and input. Set `REPLAY` to the absolute path of this directory's script and `DEV` to the development JSONL gzip. Run the same command from each relevant checkout with a separate output path.

```sh
export SOP_KNOWLEDGE_DIR=/path/to/sop-knowledge-worlds
env OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1   taskset -c 0,1 nice -n 15 ionice -c 3 node "$REPLAY" "$DEV" "$ARM"
```

CPU time is Node process user plus system time per public request, including its WASM solver. Wall time includes contention with other processes. This replay used Node 22.23.2, z3-solver 5.4.1, and knowledge checkout `3b2deebd85aa6ca070b7dc2ce94ff775fc891658`. Startup and solver initialization are reported in the run logs. The source-completeness gate is the public validator's `hasCompleteSource`; it does not score clause meaning or attachments.

## Paired results

| Public replay on 283 sources | Baseline | Updated |
| --- | ---: | ---: |
| At least one source-complete reading | 141 (49.8%) | 145 (51.2%) |
| Zero / one / two public readings | 3 / 151 / 129 | 3 / 151 / 129 |
| Solver errors | 1 | 1 |
| CPU time per request, median / p95 | 346 / 3,420 ms | 386 / 3,928 ms |
| Total request CPU time | 221.6 s | 237.4 s |
| Wall time per request, median / p95 | 624 / 5,734 ms | 744 / 6,577 ms |

Six sources gained a complete reading and two lost one. Total CPU cost increased 7.1% in these runs. On 94 sources the literal public candidate list changed, including reorderings. The separate intermediate adjunct-only stage gave 142 complete sources in each arm when run with four sharded readers. Reader lifetime and shared-host contention differ across the two protocols.

## Targeted source-only plausibility review

The comparison packet masks version labels. It includes every static coverage flip, ten SHA-ordered changed texts with coverage in both versions, and two SHA-ordered texts still incomplete in both versions. The implementation author reviewed the packet against the literal source using the public distinction between NONE, MIXED and ALL. Some development sources were already familiar from diagnosing the intermediate stage. There was no second reviewer. These selections and labels cannot estimate a cohort-wide semantic success rate.

| Reviewed subset | Sources | Baseline NONE / MIXED / ALL | Updated NONE / MIXED / ALL |
| --- | ---: | ---: | ---: |
| All static coverage flips | 8 | 8 / 0 / 0 | 7 / 0 / 1 |
| Sampled changes complete in both | 10 | 9 / 1 / 0 | 7 / 3 / 0 |
| Sampled changes incomplete in both | 2 | 2 / 0 / 0 | 2 / 0 / 0 |
| Combined targeted review | 20 | 19 / 1 / 0 | 16 / 3 / 1 |

- “make Mia's jacket green, and make Leo's jacket yellow” is the confirmed whole-reading gain among the six new coverage cases. The previous draft left `Mia's` unresolved and treated `Leo's` as a compound. The new reading gives each jacket a separate `possessor` entity and its own result color.
- “on the flat top of the big rock, draw a little cat, so the wind does not tip it over.” gained static coverage and a correctly directed purpose clause. The circuit still invented an imperative `top` and lost the intended location of the cat. Its full reading remained unacceptable.
- “darw a flock of birds over the lake” gained one acceptable witness when `of` links the flock to the birds and `over` locates the birds above the lake. Its other witness retained the wrong `of` attachment. “I need the legend at the top right” similarly gained a witness with a single landmark instead of treating `right` as the result of `need`.
- In the intermediate run, “i wonder if you could place two purple blocks below the bottommost block of the floating column” changed from additive clause coordination to a `clausal_complement` of `wonder`. A complete reading still needs to attach `of the floating column` to the bottommost block.

The complete proposals and verdicts are in the paired gzip files, `review-packet.json`, `review-key.json` and `review.tsv`. There were 22 passing Z3 tests, including source-exact possessors, finite conditional, temporal and purpose clauses, and the nominal PP control. The benchmark establishes a small static gain at a measurable CPU cost and shows why coverage and plausibility have to be measured separately.
