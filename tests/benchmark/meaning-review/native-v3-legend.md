# NLU source-first proposal-set review v3

Grade one source utterance and one strategy's public returned list. Evaluate each candidate independently against the original source. A candidate is acceptable if it provides a syntactically plausible whole reading with the essential typed roles and no materially incorrect asserted meaning. Optional semantic classifications can be absent. Distinct reasonable alternatives can all be acceptable.

| Level | Proposal-set result | Criterion |
| --- | --- | --- |
| L0 | NONE | No usable native reading. Examples include empty output, no valid grounded circuit, or no useful interpretation in any eligible proposal. |
| L1 | NONE | The closest usable witness has the wrong principal clause form, boundary, predicate interpretation, action, question, modality, or polarity. |
| L2 | NONE | A schema-valid, source-grounded proposal exists, but every such proposal has material unaccounted or unresolved source. |
| L3 | NONE | The closest witness assigns a wrong role, participant, endpoint, attachment, direction, value, scope, or qualifier. |
| L4 | NONE | The closest witness asserts a material instruction, entity, condition, value, or semantic class unsupported by the source. |
| L5 | NONE | The closest witness omits an essential clause, predicate, action, or step. |
| L6 | NONE | The closest witness omits an essential participant, reference, role, relation, property, value, placement, scope, or qualifier. |
| L7 | MIXED | The strategy returned at least one acceptable candidate and at least one unacceptable candidate. |
| L8 | ALL | The strategy returned a nonempty list and every candidate is acceptable. |
| L9 | ALL | Every candidate is acceptable, and the complete returned alternative set matches frozen compatible native references exactly. |
| L10 | ALL | Every candidate is acceptable, and an independent review attests a material defect in the applicable frozen native reference set that the returned readings correct. |

The order of alternatives has no effect. Identical serialized alternatives count once for native-reference set comparison after outer whitespace and line-ending normalization. Different wire IDs remain different under exact matching. A shared accepted circuit is evidence for each strategy that actually returned the identical circuit for the same source. An independently verified correction binds the complete frozen native reference set and the complete acceptable returned set. Without compatible native gold, L9 and L10 are unavailable.

L0–L6 retain the principal failure from source-first witness review when none succeeds. A v2 L7 for a single incomplete witness maps to v3 L6. The v3 meaning of L7 is specific to mixed lists. The `native` model profile and `native-legend.md` grade individual eligible witnesses on the v2 scale as an intermediate input. The v3 set classifier converts those records into the current cohort results.
