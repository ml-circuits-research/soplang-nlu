# Frozen transformer encoder adaptation pilot

Training only the transformer pipeline's tagging and parsing heads increased wholly acceptable standalone outputs from **60.8% to 63.2%** on the frozen 250-row historical diagnostic. The projector stayed at `24f248b`. The adapted model gained 18 inputs and lost 12. Material source completeness fell from 78.0% to 74.8%, with ten gains and 18 losses. The small teacher-validation improvement transferred to a modest net gain in accepted circuits alongside real regressions.

| Transformer model | NONE | SOME | ALL / ANY | Source-complete | Model startup | Serial parser + mapper p50 / p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Pretrained | 39.2% | 0.0% | 60.8% | 78.0% | 2.473 s | 47.61 / 82.49 ms |
| Adapted heads | 36.8% | 0.0% | 63.2% | 74.8% | 2.577 s | 48.63 / 84.63 ms |

Each run returned exactly one public circuit per input and had zero reader errors. The live pretrained baseline reproduced all 250 historical source checks, graphs and circuits exactly. The adapted checkpoint changed 121 dependency graph digests and 92 public circuits. The gate and both reader runs use the same isolated projector revision. This diagnostic uses historical data, separate from the fresh final evaluation.

The adapted reading recovered the requested red flower inside the fence plus the separate preservation instruction in `drawing/placement-02.csv#2137`. On the three-block instruction in `drawing/scenes-13.csv#2208`, the adapted graph instead scopes “send” under “push.” The generated circuit loses the three successive imperatives and fails review. Exact paired changes and reasons are in `comparison.json.gz`.

## Accepted-circuit unions

| Archived comparator | Comparator ANY | Adapted transformer only | Comparator only | Either |
| --- | ---: | ---: | ---: | ---: |
| Pretrained transformer at the fixed projector | 60.8% | 7.2% | 4.8% | 68.0% |
| Adapted compact at the fixed projector | 51.2% | 18.0% | 6.0% | 69.2% |
| Neuro-Prolog historical diagnostic | 54.0% | 18.0% | 8.8% | 72.0% |
| Refreshed direct projector | 66.4% | 5.6% | 8.8% | 72.0% |
| Refreshed dependency beam | 71.6% | 4.4% | 12.8% | 76.0% |
| Union of all five prior inventories | 78.0% | 3.2% | 18.0% | 81.2% |

The offline union of pretrained and adapted transformer candidates contains a suitable circuit on 170 inputs. Adding adapted transformer candidates to all previously settled inventories raises offline acceptance availability from 195 to 203. These are unions of individually reviewed candidate sets. They provide no measured ranking or combined strategy performance. The comparison validates every matched ID and source text and records the exact gains and losses in `unions.json`.

## Training and evidence

The experiment reused the [sealed corrected graphs from the compact pilot](../2026-11-26-spacy-compact-adaptation-pilot/training/corrected-graphs.json.gz) exactly. The digest is recorded in the training manifest. The 510 training and 90 validation assignments stayed fixed. No new teacher calls were needed, and the diagnostic did not enter training or checkpoint selection.

The original transformer forward pass produced cached last-layer features. The tagger and transition-based parser used their pretrained listeners with the encoder gradient callback disabled. The published pipeline has the original encoder files byte for byte, and its in-memory encoder serialization hash also matched before training and after deployment. The reloaded model's complete token, POS, fine tag, dependency label and head signatures exactly matched cached evaluation on all 90 validation inputs.

Epoch zero was an untouched candidate for selection by labeled attachment. The best checkpoint was epoch eight, the configured cap. Teacher-validation labeled attachment rose from 91.29% to 92.06%, head accuracy rose from 94.14% to 94.53%, and fine-tag agreement fell from 98.69% to 97.69%. Caching took 30.00 s. Head training, serialization and deployment verification took 13.35 s. The local optional checkpoint is `/tmp/wm-spacy-trf-heads/adapted-model`. Its tree digest is `e529157beb6a1c28bc4e210452c59d9303d134ee8ecf3b69060cdbc13ecdd913`. The archive contains per-file digests in `training/training-summary.json` and uses the existing runtime loader with an explicit local path.

Review reused 147 exact prior votes and independently judged 40 novel eligible circuits. The third reviewer adjudicated 14 threshold disagreements and contradicted four of 39 sampled consensus decisions. This gives a direct indication of judgment variability alongside the paired gain of six inputs. The reported set outcomes follow the same fixed policy as the other historical diagnostics.

The [experiment code and replay commands](../../experiments/spacy-adaptation/README.md) reproduce training, standard inference, and exact vote reuse.
