# NLU semantic review v1

Grade the best complete circuit emitted for each message by each strategy. Grade meaning against the original text, preserving exact case and Unicode. Use the references as fallible annotations. The unit is one strategy and one message, regardless of candidate count or order. Never combine pieces of different candidates.

| Level | Criterion | Example |
| --- | --- | --- |
| L0 | No usable interpretation: no output, all candidates structurally invalid, or nothing useful interpreted. | The whole command is unread. |
| L1 | The chosen reading changes the main action, question or polarity. | Remove becomes create. |
| L2 | It chooses the wrong object, participant, recipient or endpoint. | A below B becomes B below A. |
| L3 | It contradicts an explicit detail, role, direction, unit or scope. | The red object becomes the object to paint red. |
| L4 | It adds a material instruction, condition, entity or value unsupported by the text. | An unnamed object is bound to a specific page ID. |
| L5 | It preserves useful meaning but omits a requested action or step. | Creates A and omits connecting it. |
| L6 | It omits an essential target, participant, reference or endpoint. | Records deletion but misses the named chart. |
| L7 | It omits an essential property, value, placement, condition or qualifier. | Records resizing the circle and drops the requested width. |
| 🟢 L8 | A complete, reasonable interpretation different from the reference. | A defensible alternate reading, different local IDs or equivalent phrasing. |
| 🟢 L9 | A complete, reasonable interpretation exactly matching a reference after trimming outer whitespace and normalising line endings. | All wire IDs and values match. |
| 🟢 L10 | A second reviewer confirms that the candidate is complete and demonstrably better than the references. Cite the source words, the material defect in the annotation, and the wires that correct it. | An annotation reverses the two endpoints and the candidate preserves their written order. |

L8, L9 and L10 meet the acceptance threshold. L10 records a proposed dataset correction for review. If another supplied reference already represents the meaning correctly, record an issue on the defective reference separately and use L8 or L9. Additional source quotes, punctuation or formatting alone do not establish material superiority. An essential meaning left in unread or filler remains missing. Legitimate aliases, implicit grammar, and unresolved literal pronouns can be reasonable. Schema validity, repeated evidence, engine failures and reference quality are separate diagnostics. An engine error with no usable candidate gives L0; a broken annotation does not assign the candidate a grade.

For several defects in one candidate use the first applicable error family in L1–L7. Choose an acceptable candidate whenever available; among failed candidates prefer the closest usable interpretation. L0 applies to the entire set only when nothing usable remains. L10 takes precedence only after confirmation, followed by L9 and L8. The former WebMeet v1.2 L1a–d correspond to the new L1–L4; L2a–c to L5–L7; L3 to L9; L4 to L8 or confirmed L10. The two scales must be labelled separately.

## Diagnostic detail within L0–L7

- **L0** distinguishes an engine error or timeout with no usable output, an empty proposal set, invalid SOP syntax, a structural schema failure, and an entirely unread or irrelevant set. Store the specific reason. Repeating evidence in two keys is an annotation-style warning and does not by itself invalidate a syntactically valid circuit.
- **L1** distinguishes a changed action, speech act or polarity. A misplaced negation that reverses the instruction belongs here.
- **L2** includes wrong attachment to an object, swapped endpoints and incorrect pronoun resolution. Case and Unicode can change which entity the source names.
- **L3** includes swapped semantic roles of a modifier, a mistaken unit, and a wrong selector/result phase. Incorrect scope belongs here unless it reverses the main intent.
- **L4** identifies invented meaning. Locate the generated action, participant, key or value and explain why the text does not license it.
- **L5** identifies a lost clause, step or coordinated instruction. **L6** identifies a lost participant, endpoint or reference. **L7** identifies a missing value, property, condition, count or other essential key.
- A syntax check can catch an invalid span or phrase attachment. POS coverage by itself cannot establish the intended interpretation. Grade the semantic consequence on the actual emitted circuit and retain syntax findings as secondary diagnostics.
