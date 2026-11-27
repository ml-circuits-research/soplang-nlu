# Verdicts to judge again: 142

Columns of rejudge.tsv: settled_case, file, n (the `n` of the packet line for a judging folder; the line number for a registry file), run, old_grade, grade_by_rules, text, why, old_note, also_in (the same verdict in the registry).

| | benchmark-random | conversion-audit | round-01 | round-02 | vss-fixed-sample | total |
|---|---|---|---|---|---|---|
| existing: "everything else" | 15 |  |  |  | 1 | 16 |
| existing: naming participle ("a group called g2") |  |  |  |  | 31 | 31 |
| existing: question-word clause inside another clause | 10 | 1 |  |  |  | 11 |
| new: "And/Then/So" after a full stop; "Now" at the start | 4 |  |  |  |  | 4 |
| new: a clause set off between a dash and a comma |  |  |  |  | 2 | 2 |
| new: a command coordinated with a clause inside a relation | 11 |  |  |  |  | 11 |
| new: a word after a complement nominal, and after a measure | 13 |  |  |  | 4 | 17 |
| new: a word that grades a linking word (extends rule "right behind") | 26 |  |  |  |  | 26 |
| new: any word of quantity before "of" (extends rule "a pair of trees") | 2 |  |  |  | 14 | 16 |
| new: shared subject and auxiliary after "and" | 2 |  |  |  |  | 2 |
| new: words of place, time and order after a nominal | 4 |  | 1 | 1 |  | 6 |
| total | 87 | 1 | 1 | 1 | 52 | 142 |

- accepted->rejected: 88
- rejected, note changes: 15
- rejected->L8: 39

Labels (accepted by agreement, no judge) that the new case on "Have the legend switched on." contradicts: webmeet-dataset/syntactic/drawing/scenes-13.05.csv "Have the grid switched on." and drawing/scenes-03.02.csv "have the man sat down on the bench" (both interrogative with "Have" as auxiliary).

## Contradiction groups found (unique verdicts over all judging folders and the registry; 14,581 unique of 25,126 lines)

Same circuit, different verdict: 0. Same message, circuits equal under the `variants` key but one accepted and one rejected: 45 messages (54 under `relaxed`), listed in mixed-variants.json; most differ in a relation start that the words settle (which the keys leave out), the rest fall in the groups below.

| Group | accepted / rejected (rejections that name the point) | Settled as |
| --- | --- | --- |
| Verb after "and" sharing subject + auxiliary ("the Check box should be …, and connect" vs "the Gate box should go …, and align") | 8 / 2 | all three forms pass |
| Word of place after a nominal as dependent ("the lake there") | 56 / 1 | dependent or modifier |
| Word of time/order as dependent ("by week first", "beside the sun next", "now a second boat") | 5 / 4 | modifier only, L3 |
| Word after a complement nominal or a measure as dependent ("line thinner", "font bigger", "two spaces left") | 17 / 6 | modifier only, L3 (rules 74, 89; schema example "pie radius smaller") |
| Grading word as dependent of a nominal ("face right on the swing") | 24 / 16 | L3 (schema Rule 5.6) |
| Grading word in a clause the relation does not belong to | 2 / 38 | L1 (rule 82) |
| "And/Then" after a full stop as discourse | 34 / 2 | discourse or conjunction |
| "Now" at the start as discourse | 8 / 2 | discourse or modifier |
| "Have the legend switched on." interrogative | 0 judge / 2 judge rejections; 2 agreement labels interrogative | imperative, L1 |
| Clause between a dash and a comma tied to the clause before ("— while you're at it, …") | 2 / 23 (25 accepted tied after) | ties to the clause after, L3 |
| Command coordinated with a clause that ends a marked relation | 11 / 45 | L3 |
| Coordination skipping a clause between conjuncts ("and give it the title" joined to "I walked") | 0 / 3 | L3 (consistent; written out) |
| Quantity word before "of" as dependents: phrases of rule 84 | 23 / 12 (all 12 judged before the rule) | pass (rule 84) |
| Quantity word before "of" as dependents: others ("any of", "each of", "one of") | 3 / 7 | pass (structural extension; owner check) |
| Naming participle as marker (rule 87) | — / 31 (all on the fixed sample, before the rule) | pass |
| "else" as clause modifier (rule 95) | 16 accepted | L3 |
| Question-word clause inside a clause written interrogative (rule 96) | 11 accepted | L1 |
