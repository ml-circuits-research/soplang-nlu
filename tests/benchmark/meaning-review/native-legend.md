# NLU source-first review v1

The unit is one utterance and one strategy. Evaluate all candidates against the source sentence, independently of their serialization order. Judge the best whole circuit. Native circuit structure and exact source grounding have already been checked before semantic review. A syntactically plausible analysis succeeds when it keeps the recoverable essential roles and says nothing materially wrong. Semantic classification is optional. A wrong emitted semantic classification still counts against the candidate.

| Level | Criterion |
| --- | --- |
| L0 | No usable interpretation. No candidate is structurally and source eligible, or all eligible proposals leave effectively everything unresolved or capture nothing useful. |
| L1 | Wrong principal form, clause boundary, predicate interpretation, action, question, modality or polarity. |
| L2 | Wrong subject, object, participant, recipient, endpoint or other central role attachment. |
| L3 | Wrong explicit detail, relation, direction, value, attachment scope or qualifier. |
| L4 | Adds a material role, action, entity, condition, value or semantic class unsupported by the source. |
| L5 | Recognizes useful meaning, but omits an essential clause, predicate, action or step. |
| L6 | Omits an essential participant, subject, object, reference or endpoint of a recognized clause. |
| L7 | Omits an essential modifier, property, relation, value, placement, scope or condition. |
| L8 | A coherent whole source reading. Includes reasonable alternate attachments or unresolved identity of a genuinely contextual pronoun. |
| L9 | A coherent whole reading exactly matching independently validated native gold. Reserved when this cohort has no native gold. |
| L10 | A coherent whole reading materially improving all applicable native references and independently confirmed. Reserved when this cohort has no native gold. |

Prefer an acceptable reading when one exists. For each failed witness, apply the first relevant defect grade L1–L7. Among failed candidates select the closest useful whole reading. A wrong role is distinct from an absent role. Evidence in `unresolved` acknowledges an unknown word or unassigned source role. An unaccounted word has no witness at all. If either contains essential recoverable content, that content remains absent from the analysis. A coherent reading can omit politeness and punctuation that make no material difference. Preserve question form and modality where they matter, while recognizing conventional polite requests where supported.

This cohort has historical `w.request` annotations, but no native `nlu` gold. The primary judge sees no historical references and assigns L0–L8. Missing legacy action categories or world concepts are never themselves a defect. L9 and L10 are deliberately unpopulated rather than inferred from differences between schemas. The rate of acceptable source readings in this cohort is therefore L8. This is a model-based evaluation of integrated role graphs, separate from mechanical source accounting and historical exact-reference scores.
