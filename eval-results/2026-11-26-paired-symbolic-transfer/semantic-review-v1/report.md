# NLU semantic review v1

| Level | prolog-example-transfer | prolog-worlds | z3 |
| --- | ---: | ---: | ---: |
| 🔴 L0 | 27.6% | 33.4% | 2.5% |
| 🔴 L1 | 2.6% | 2.7% | 1.0% |
| 🔴 L2 | 1.0% | 1.1% | 1.3% |
| 🔴 L3 | 1.3% | 1.3% | 2.4% |
| 🔴 L4 | 1.7% | 1.9% | 1.3% |
| 🟠 L5 | 13.1% | 14.8% | 9.6% |
| 🟠 L6 | 5.3% | 5.5% | 3.0% |
| 🟠 L7 | 7.1% | 6.9% | 9.7% |
| 🟢 L8 | 26.2% | 32.4% | 67.7% |
| 🟢 L9 | 14.0% | 0.0% | 1.5% |
| 🟢 L10 | 0.1% | 0.0% | 0.0% |
| **Total** | **100.0%** | **100.0%** | **100.0%** |
| **Accepted (L8–L10)** | **40.3%** | **32.4%** | **69.2%** |

🔴 L0–L4 Wrong or unusable · 🟠 L5–L7 Incomplete · 🟢 L8–L10 Accepted

## Grading rubric

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

## Reviewed messages

Percentages use finalized strategy–message judgments. The denominator is the number of reviewed messages for each strategy. The accepted percentage sums the displayed L8–L10 values. The table uses the largest remainder method to display one decimal place and total 100.0% per strategy.

| Strategy | Reviewed messages |
| --- | ---: |
| prolog-example-transfer | 1861 |
| prolog-worlds | 1861 |
| z3 | 1861 |

## Secondary diagnostics by level

| Strategy | Level | Diagnostic | Count |
| --- | --- | --- | ---: |
| prolog-example-transfer | L0 | engine.empty-output | 380 |
| prolog-example-transfer | L0 | meaning.no-usable-candidate | 133 |
| prolog-example-transfer | L0 | no-usable-reading | 513 |
| prolog-example-transfer | L0 | reference.failed-legacy-verifier | 2 |
| prolog-example-transfer | L1 | intent-or-polarity | 49 |
| prolog-example-transfer | L1 | verifier.not a declared request family | 1 |
| prolog-example-transfer | L2 | target-or-endpoint | 19 |
| prolog-example-transfer | L2 | verifier.not a declared request family | 1 |
| prolog-example-transfer | L3 | detail-role-or-scope | 25 |
| prolog-example-transfer | L3 | verifier.not a declared request family | 3 |
| prolog-example-transfer | L4 | unsupported-addition | 32 |
| prolog-example-transfer | L5 | missing-step | 244 |
| prolog-example-transfer | L5 | verifier.not a declared request family | 27 |
| prolog-example-transfer | L5 | verifier.repeats the whole text (leave it out) | 5 |
| prolog-example-transfer | L5 | verifier.repeats value (leave it out) | 2 |
| prolog-example-transfer | L6 | missing-participant | 98 |
| prolog-example-transfer | L6 | reference.failed-legacy-verifier | 4 |
| prolog-example-transfer | L6 | verifier.filler hides content words of a request | 1 |
| prolog-example-transfer | L6 | verifier.not a declared request family | 11 |
| prolog-example-transfer | L6 | verifier.repeats the whole text (leave it out) | 1 |
| prolog-example-transfer | L7 | missing-key-or-value | 132 |
| prolog-example-transfer | L7 | verifier.filler hides content words of a request | 1 |
| prolog-example-transfer | L7 | verifier.not a declared request family | 22 |
| prolog-example-transfer | L7 | verifier.repeats the whole text (leave it out) | 1 |
| prolog-example-transfer | L7 | verifier.repeats value (leave it out) | 2 |
| prolog-example-transfer | L8 | reference.failed-legacy-verifier | 1 |
| prolog-example-transfer | L8 | verifier.filler hides content words of a request | 6 |
| prolog-example-transfer | L8 | verifier.not a declared request family | 68 |
| prolog-example-transfer | L8 | verifier.repeats sort (leave it out) | 1 |
| prolog-example-transfer | L8 | verifier.repeats the whole text (leave it out) | 17 |
| prolog-example-transfer | L8 | verifier.repeats value (leave it out) | 8 |
| prolog-example-transfer | L10 | reference.confirmed-material-defect | 2 |
| prolog-example-transfer | L10 | reference.failed-legacy-verifier | 1 |
| prolog-example-transfer | L10 | verifier.repeats sort (leave it out) | 1 |
| prolog-example-transfer | L10 | verifier.repeats the whole text (leave it out) | 1 |
| prolog-worlds | L0 | engine.empty-output | 469 |
| prolog-worlds | L0 | meaning.no-usable-candidate | 153 |
| prolog-worlds | L0 | no-usable-reading | 622 |
| prolog-worlds | L0 | reference.failed-legacy-verifier | 3 |
| prolog-worlds | L1 | intent-or-polarity | 50 |
| prolog-worlds | L1 | verifier.not a declared request family | 1 |
| prolog-worlds | L2 | target-or-endpoint | 20 |
| prolog-worlds | L2 | verifier.not a declared request family | 1 |
| prolog-worlds | L3 | detail-role-or-scope | 24 |
| prolog-worlds | L3 | verifier.not a declared request family | 3 |
| prolog-worlds | L4 | reference.failed-legacy-verifier | 1 |
| prolog-worlds | L4 | unsupported-addition | 35 |
| prolog-worlds | L4 | verifier.not a declared request family | 1 |
| prolog-worlds | L5 | missing-step | 275 |
| prolog-worlds | L5 | verifier.not a declared request family | 30 |
| prolog-worlds | L5 | verifier.repeats the whole text (leave it out) | 5 |
| prolog-worlds | L5 | verifier.repeats value (leave it out) | 2 |
| prolog-worlds | L6 | missing-participant | 103 |
| prolog-worlds | L6 | reference.failed-legacy-verifier | 4 |
| prolog-worlds | L6 | verifier.filler hides content words of a request | 2 |
| prolog-worlds | L6 | verifier.not a declared request family | 12 |
| prolog-worlds | L6 | verifier.repeats the whole text (leave it out) | 1 |
| prolog-worlds | L7 | missing-key-or-value | 128 |
| prolog-worlds | L7 | verifier.filler hides content words of a request | 2 |
| prolog-worlds | L7 | verifier.not a declared request family | 28 |
| prolog-worlds | L7 | verifier.repeats the whole text (leave it out) | 1 |
| prolog-worlds | L7 | verifier.repeats value (leave it out) | 2 |
| prolog-worlds | L8 | verifier.filler hides content words of a request | 23 |
| prolog-worlds | L8 | verifier.no reader key (a meaning without a key is an unread wire with a note) | 1 |
| prolog-worlds | L8 | verifier.not a declared request family | 85 |
| prolog-worlds | L8 | verifier.repeats sort (leave it out) | 3 |
| prolog-worlds | L8 | verifier.repeats the whole text (leave it out) | 19 |
| prolog-worlds | L8 | verifier.repeats value (leave it out) | 7 |
| prolog-worlds | L10 | reference.confirmed-material-defect | 1 |
| prolog-worlds | L10 | verifier.repeats sort (leave it out) | 1 |
| prolog-worlds | L10 | verifier.repeats the whole text (leave it out) | 1 |
| z3 | L0 | engine.empty-output | 4 |
| z3 | L0 | engine.error | 2 |
| z3 | L0 | meaning.no-usable-candidate | 42 |
| z3 | L0 | no-usable-reading | 46 |
| z3 | L1 | intent-or-polarity | 18 |
| z3 | L2 | target-or-endpoint | 25 |
| z3 | L3 | detail-role-or-scope | 44 |
| z3 | L4 | unsupported-addition | 25 |
| z3 | L5 | missing-step | 178 |
| z3 | L5 | reference.failed-legacy-verifier | 1 |
| z3 | L6 | missing-participant | 57 |
| z3 | L6 | reference.failed-legacy-verifier | 1 |
| z3 | L7 | missing-key-or-value | 180 |
| z3 | L7 | reference.failed-legacy-verifier | 1 |
| z3 | L8 | reference.failed-legacy-verifier | 5 |
| z3 | L8 | verifier.a phrase the text does not say (keep the words; the system normalises them) | 2 |

