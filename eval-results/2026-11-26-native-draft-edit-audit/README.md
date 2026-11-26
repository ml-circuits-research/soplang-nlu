# What survives a repair of a native SOP draft

We compared frozen provider drafts with already accepted native SOP supervision on two training sets. Sol hard451 starts with no source-complete provider proposal. Curated batch 000001 starts with the first proposal in the published ordering, independent of the curator's draft choice. The cohorts overlap by 39 texts and are reported separately.

| Changed first accepted reading | Hard451 | Curated 000001 |
| --- | ---: | ---: |
| Readings with measured edits | 368 | 205 |
| Draft literal spans retained | 95.9% | 97.4% |
| Draft typed node anchors retained | 88.3% | 89.3% |
| Draft typed literal roles retained | 82.6% | 85.4% |
| Draft directed links retained | 66.6% | 72.7% |
| Median relative graph edit | 24.3% | 17.0% |
| Median core graph edit | 22.4% | 14.9% |

Among the curated changes, 171 first accepted circuits were novel relative to every archived proposal for the text. Their median relative edit was 19.1%. Across all curated alternatives, 234 of 463 retained the exact first proposal, 5 changed serialization without changing measured facts, and 224 changed facts. Some genuine edits are small, but a model needs to be able to repoint or replace links. A relation or coordination link changed on 307/368 hard and 144/205 curated edits. An existing role link was reattached on 243/368 and 111/205. An added or changed core clause argument occurred on 162/368 and 79/205. Newly grounded lexical tokens occurred on 338/368 and 30/205. Categories overlap.

| Verified baseline status | Texts | At least one accepted curated reading |
| --- | ---: | ---: |
| Hard451, whole pool NONE | 451 | 368 (81.6%) |
| Curated 000001, first draft NONE | 156 | 112 (71.8%) |
| Curated 000001, whole pool confirmed NONE | 61 | 36 (59.0%) |
| Curated 000001, whole pool status unknown | 89 | 70 |

The curated output has a reading for 332 of 344 originally accepted first drafts and 338 of 350 originally accepted whole pools. Whole-pool status remains unknown when an originally eligible alternative has no exact settled vote and no known acceptance establishes ANY. The absence of newly accepted supervision is distinct from a proven semantic failure.

## Examples

- Hard `drawing/scenes-02.csv#159`, “shrink the avatar a little”. The draft already has `predicate="shrink"` and `direct_object` pointing to the avatar. The accepted circuit replaces unresolved `a` and `little` with `degree="a little"`. Both node anchors, all three existing literal roles and the directed link survive renumbering.
- Curated `diagram/ui-coverage.csv#748`, “show the node IDs briefly”. The complete but rejected draft uses `direct_object` pointing to `head="node"` and a separate `label` link to `name="IDs"`. The accepted circuit preserves `show` and `briefly`, drops the label link, and makes `head="IDs" compound="node"` the direct object. Literal overlap alone would miss the main correction.
- The cohorts accepted different attachments for `diagram/charts-04.csv#4024`, “go with the title a little further from the plot”. Both added `degree="a little"`. The hard reading attached `from` to the title, while curated batch 000001 retained its attachment to `go`. An edit model should allow alternate readings and take source context into account.

## Measurement and limits

The static checker assigns exact quoted spans to source token intervals. Literal spans exclude filler, unresolved text, separators and terminators. A typed anchor combines wire type with an attribute's source position, prioritizing predicates, heads, and cues. Cue-less wires can use an operand anchor. Literal roles include their owner anchor and slot. Links include the source anchor, slot and target anchor in that order. Atoms include an owner anchor, slot and value. The relative edit is the normalized fact symmetric difference divided by the combined draft and final fact counts. The core edit excludes optional domain atoms and explicit positive polarity. The retention percentages divide retained facts by draft facts, summed over the indicated readings.

Repeated tokens can admit multiple placements, and source-position keys can collapse distinct cue-less wires. Eleven hard and two curated edited primary readings have unanchored wires, whose unassignable facts are omitted. Restricting to unambiguous placements gave 65.9% and 70.7% directed-link retention. The comparison measures structural overlap among accepted training outputs. Shared facts can still be incorrect in other readings, and the recovery rates depend on curated training selections and review. They do not estimate generalization or the accuracy of an automated editor.

`paired-facts.jsonl.gz` stores paired original/final circuits and per-alternative counts. `summary.json` includes all alternatives, primary readings, and sensitivity breakdowns. To reproduce with the original training proposal inputs and votes, run this from the repository root:

```sh
stage=eval-results/2026-11-26-native-draft-edit-audit
node "$stage/measure.mjs" eval-results/2026-11-26-distilbert-hard-supervision \
  eval-results/2026-11-26-sol-native-curation/000001 \
  /tmp/sop-curation-v1/batches/000001.jsonl.gz \
  /tmp/sop-distilbert-extra-6000/sources.jsonl.gz \
  /tmp/sop-distilbert-extra-6000/votes.jsonl.gz "$stage" ../sop-knowledge-worlds
```
