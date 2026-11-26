# NLU source-first review v2

The unit is one utterance and one strategy. Evaluate complete candidates against the source sentence, independently of their serialization order. Judge the best whole circuit. Native structure and exact source grounding are checked first. Only candidates with every source occurrence accounted for and none marked unresolved reach model review. A syntactically plausible analysis succeeds when it keeps the recoverable essential roles and says nothing materially wrong. Semantic classification is optional. A wrong emitted semantic classification still counts against the candidate.

| Level | Criterion |
| --- | --- |
| L0 | No usable interpretation. No candidate is schema-valid and source-grounded, or none of the complete candidates represents a coherent fragment or useful role. |
| L1 | Wrong principal form, clause boundary, predicate interpretation, action, question, modality or polarity. |
| L2 | Static source gap. A valid, grounded candidate exists, but all such candidates leave source occurrences uncovered or unresolved. |
| L3 | Wrong subject, object, participant, recipient, endpoint, relationship, direction, value, scope or qualifier. |
| L4 | Adds a material role, action, entity, condition, value or semantic class unsupported by the source. |
| L5 | Recognizes useful meaning, but omits an essential clause, predicate, action or step. |
| L6 | Omits an essential participant, subject, object, reference or endpoint of a recognized clause. |
| L7 | Omits an essential modifier, property, relation, value, placement, scope or condition. |
| L8 | A coherent whole source reading. Includes reasonable alternate attachments or unresolved identity of a genuinely contextual pronoun. |
| L9 | A coherent whole reading exactly matching independently validated native gold. Reserved when this cohort has no native gold. |
| L10 | A coherent whole reading materially improving all applicable native references and independently confirmed. Reserved when this cohort has no native gold. |

Prefer an acceptable reading when one exists. For each failed model-reviewed witness, apply the first relevant nonstatic defect grade L1–L7. Among failed candidates select the closest useful whole reading. A wrong role is distinct from an absent role. Evidence in `unresolved` acknowledges an unknown word or unassigned source role. An unaccounted word has no witness at all. Both are static source gaps. Filler can account for courtesy and punctuation, but cannot account for the meaning of a substantive participant or instruction. Preserve question form and modality where they matter, while recognizing conventional polite requests where supported.

This cohort has historical `w.request` annotations, but no native `nlu` gold. Model reviewers see no historical references and assign L0–L8 except static L2. Missing legacy action categories or world concepts are never themselves a defect. L9 and L10 are deliberately unpopulated rather than inferred from differences between schemas. The rate of acceptable source readings in this cohort is therefore L8. This is an evaluation of integrated role graphs with a static eligibility gate, separate from historical exact-reference scores.
