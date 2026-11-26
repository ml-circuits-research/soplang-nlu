# Draft-conditioned graph repair development results

This isolated experiment used 7,040 existing native SOP training labels and 283 development labels. Each source was conditioned on its first frozen public neuro-selector proposal, including grounded partials. The experiment kept the source-only supervision fixed. The comparison here uses development graph facts and public static validation. It contains no semantic review or study predictions.

| Development result | Original draft | Editor | Draft plus editor |
| --- | ---: | ---: | ---: |
| Anchored fact F1 | 91.62% | 90.67% | — |
| Exact match to the labeled graph | 130/283 | 92/283 | 130/283 |
| At least one source-complete public reading | 282/283 | 258/283 | 282/283 |

The editor had zero exact additions to the original draft and lost 38 exact matches when used alone. It had zero static completeness additions, lost 24 when used alone, and two outputs failed public structural validation. Pairing preserved the original draft's exact and complete counts. The CPU probe still emitted two distinct grounded SOP strings on 278/283 inputs. Distinct strings can represent the same anchored graph.

The development selector chose epoch 8 and confidence thresholds of 0.65 for node, attribute, and token ownership. The checkpoint SHA-256 is `84f3e27875b4acb3570caab3c9d0cb8c36a7aaa849ddab0d0dec0f7c8e0438a8`. The exact per-file digests, including separate encoder and head weights, are in `training-summary.json`. Training ran for 8 epochs on a shared NVIDIA GB10. The two-thread CPU decoder measured 1.66 s startup, 68.11 ms warm median and 95.98 ms warm p95 on this host. This excludes generating original drafts and validating the edited circuits.

The archived training repair audit found substantial structural overlap between drafts and human-accepted corrections. This particular conditioning architecture did not convert that overlap into additional exact or source-complete readings on the development split. Exact match to a single annotation and static completeness cannot establish acceptance of a plausible alternative, which requires independent semantic review.

## Independent whole-reading study

On the paired 100-source diagnostic, the live draft/repair strategy achieved 74% ANY, equal to the two-reading selector, gaining two sources and losing two. It returned all acceptable readings on 42%, compared with the original selector's 47%. Static completeness improved from 93% to 95%. Live end-to-end CPU median was 255 ms. These results did not justify promoting the editor to the default pipeline.
