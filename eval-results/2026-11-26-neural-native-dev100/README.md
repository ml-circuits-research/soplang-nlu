# Native neuro-symbolic circuit review on frozen development inputs

This review uses the 100 IDs from the [uniform historical baseline](../2026-11-26-uniform-development-100/README.md), with the same native schema and source-first judgment procedure. It compares neuro-Prolog and neuro-Z3 to the earlier symbolic outputs and the [raw dependency graph diagnostic](../2026-11-26-neural-dependency-dev100/README.md). Both neuro strategies used spaCy 3.8.16 with the English compact model 3.8.0. The Prolog snapshot was `d5d6c07`, and the Z3 snapshot was `5e004fe`. Both ran with eight workers. Each strategy's environment is archived separately under `inference/`. Neuro-Prolog emits a bounded set containing dependency projections and symbolic candidates. Neuro-Z3 uses dependencies as constraints and evidence in its own search.

The installed schema and source grounding gate eliminate unauditable variants before reviewer calls. All remaining distinct source and exact circuit combinations were judged as literal singletons. The source and circuit traveled together, without strategy labels, rank, or references. There were 188 eligible distinct targets across 75 sources. The 65 exact matches to previously reviewed symbolic circuits reuse both blinded votes and applicable threshold adjudications. Fresh Sol and Terra reviews covered the 123 new targets. A separate Sol reviewer settled novel threshold disagreements and examined 20 randomly selected agreement acceptances and 20 agreement rejections. Accepted native candidates define the public set outcomes NONE, SOME and ALL. ANY is SOME plus ALL. No native references entered this development review.

Prolog dependency attribution uses exact SOP matches to the independently generated same-revision, dependency-only sidecar. It identifies projected circuits present in the public hybrid set, which also can contain symbolic variants. A graph can be plausible and still lose a role during conversion, and a graph with a defective attachment can still provide evidence for a later correct circuit. The comparisons are paired by source ID. The symbolic snapshots are earlier code, use their archived checker revision, and have distinct candidate limits. The quality differences therefore compare recorded strategies as run. Isolating the effect of dependency evidence for every Prolog witness requires holding the symbolic engine, selection limit, and checker revision constant.

## Results

| Strategy | NONE | SOME | ALL | ANY | Source-eligible rows | Eight-worker wall | P50 | P95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Symbolic Prolog, earlier | 68 | 13 | 19 | 32 | 65 | 2.448 s | 17.82 ms | 126.32 ms |
| Neuro-Prolog | 48 | 20 | 32 | 52 | 71 | 2.803 s | 15.61 ms | 116.00 ms |
| Symbolic Z3, earlier | 72 | 8 | 20 | 28 | 51 | 17.440 s | 348.92 ms | 4,135.77 ms |
| Neuro-Z3 | 66 | 0 | 34 | 34 | 54 | 2.422 s | 29.69 ms | 241.94 ms |

Each count is also its percentage of 100 inputs. Both neuro runs completed with zero reader errors. Neuro-Prolog had 20 new accepted rows and kept all 32 prior accepted rows. At least one public dependency projection was acceptable on 16 of those 20 new rows. The other four gains lack an accepted dependency witness. Neuro-Z3 added an acceptable reading on 14 rows and lost previous acceptance on eight. The union of the two neuro strategies covers 55 inputs versus 41 for the two symbolic strategies, with 16 gains and two losses. Neuro-Prolog reviewed 131 of 201 public candidates, and neuro-Z3 reviewed 57 of 106.

| Strategy | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Neuro-Prolog | 0 | 8 | 29 | 9 | 0 | 0 | 2 | 20 | 32 | 0 | 0 |
| Neuro-Z3 | 0 | 9 | 46 | 7 | 2 | 0 | 2 | 0 | 34 | 0 | 0 |

The initial threshold reviewers disagreed on 27 of 188 circuits. Three of 40 consensus checks disagreed with the initial decision. An additional gate audit found six incorrect L0 judgments that cited only an unresolved comma, despite the native gate's explicit incidental-punctuation allowance. Independent re-review with the gate clarified produced four L8 and two L1 judgments, all unanimous, moving three neuro-Z3 rows to ALL. Both versions are retained. The final scoring is in `review/adjudicated/`.

## Graph conversion

| Output on the 50 inputs with a usable raw compact graph | Neuro-Prolog projection only | Neuro-Z3 |
| --- | ---: | ---: |
| Accepted circuit | 32 | 29 |
| Source-eligible circuit rejected in review | 2 | 11 |
| Public circuit failed material coverage | 7 | 10 |
| No public dependency-derived circuit | 9 | 0 |

On the other 50 inputs, neuro-Prolog had an acceptable emitted dependency projection on four and neuro-Z3 had an acceptable circuit on five. This shows the mapper and solver sometimes recover structure the raw parser missed. The accepted witness counts in this table are narrower than the full hybrid Prolog results.

- **Recovered predicate.** Both raw dependency models root “press delete on the current selection” at `delete`, with `press` as its nominal modifier. Neuro-Z3 emits an imperative rooted at `press` with `delete` as object and passed review.
- **Recovered result.** The compact graph for “make candle green” makes `candle` part of a malformed `green` complement. Both converters return an accepted alternative with `candle` as object and `green` as result. Neuro-Prolog also returns a rejected alternative treating `green` as a nonfinite predicate, which makes the overall set SOME.
- **Lost argument.** In “one flow chart about the customer refund process is what i need,” the compact graph retains `what` as the object of `need`. The Prolog projection places it only in a question slot and omits the object; neuro-Z3 preserves the object and passes.
- **Introduced form error.** In “Let us place Review to 2026-12-04 at 16:00 UTC. That would help,” the dependency-derived circuits mark the bare-infinitival `place` clause declarative. Neuro-Prolog also returns a correct symbolic reading, so it scores SOME.
- **Introduced semantic error.** The compact graph retains the target and condition in “all the labels move to 22 points once the flow gets printed.” Neuro-Z3 adds `kind=dot` to the 22 points, an unsupported reading of the typographic size. The circuit fails despite covering the words.

## Replay

Use the archived preparation and candidate packets to rescore without new reviewer calls. Paths below are relative to the NLU checkout.

```sh
out=eval-results/2026-11-26-neural-native-dev100
node tests/benchmark/meaning-review/review-public-candidates.mjs score "$out/review" "$out/inference" neuro-prolog,neuro-z3
node "$out/apply-gate-recheck.mjs" "$out"
python3 "$out/analyze.py" "$out" eval-results/2026-11-26-uniform-development-100 eval-results/2026-11-26-neural-dependency-dev100
```

The archived `reuse.py` implements exact-identity vote reuse. `review/novel/` contains the newly sent packets, literal decisions, and execution metadata.
