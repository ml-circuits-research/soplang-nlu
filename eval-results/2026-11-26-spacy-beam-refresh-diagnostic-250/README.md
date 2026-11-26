# Direct and beam projection refresh on the historical 250

On the same 250 historical inputs, the updated direct projector accepted **166** texts, up from 152. The updated beam exposed an accepted reading on **179** texts, up from 171. Beam mode exposed a mixture of acceptable and unacceptable readings on 59 texts. Direct and beam used revision `0b955a1` and the same archived transformer dependency beams as the original pilot.

| Strategy and projector | NONE | SOME | ALL | ANY |
|---|---:|---:|---:|---:|
| Direct, `24f248b` | 98 (39.2%) | 0 | 152 (60.8%) | 152 (60.8%) |
| Beam, `24f248b` | 79 (31.6%) | 58 (23.2%) | 113 (45.2%) | 171 (68.4%) |
| Direct, `0b955a1` | 84 (33.6%) | 0 | 166 (66.4%) | 166 (66.4%) |
| Beam, `0b955a1` | 71 (28.4%) | 59 (23.6%) | 120 (48.0%) | 179 (71.6%) |
| Fixed Neuro-Prolog | 115 (46.0%) | 48 (19.2%) | 87 (34.8%) | 135 (54.0%) |

NONE means zero accepted readings, SOME means a mix of accepted and rejected public readings, and ALL means every public reading passed. ANY combines SOME and ALL. The diagnostic has no fresh sample or new dependency inference.

- Updated direct gained 14 accepted texts and lost zero. Its source-complete count rose from 195 to 201.
- Updated beam gained nine ANY texts and lost one. On ALL it gained eight and lost one. Its source-complete count stayed at 210, while the returned set shrank from 437 total candidates to 423.
- At the updated revision, beam added 13 ANY texts over direct, including four for which every beam candidate passed. Fifty otherwise acceptable direct singleton results became mixed beam sets.
- Against fixed Neuro-Prolog, direct and Neuro-Prolog both passed ANY on 120 texts. There were 46 direct-only, 15 Neuro-Prolog-only and 69 neither. Beam and Neuro-Prolog both passed on 124 texts, with 55 beam-only, 11 Neuro-Prolog-only and 60 neither. Every text and greedy dependency graph hash matched the fixed Neuro-Prolog evaluation.

## Remaining failures

For the 84 direct NONE outcomes, 49 failed the source-completeness gate and 35 passed the structural gate but failed interpretation review. The 71 beam NONE outcomes included 40 source gaps and 31 semantic failures. The latter include sentence form and modal scope, attachment, and lexical property or object roles. Exact per-grade counts and transitions are in [comparison.json](comparison.json).

- **“Could you create a red circle and call it fruit bowl. I appreciate it.”** (`drawing/scenes-16.csv#3341`) was the only ANY loss against the archived beam. The new projection assigns the period to “create” in both hypotheses and collapses them to one circuit. The earlier accepted alternative assigned that period to “call.” Both versions represent “call” as imperative, so the pass/fail change also reflects a reviewer-level distinction between very similar graphs. The current rejection cites the missing shared scope of “Could you.” Neuro-Prolog passed this text.
- **“let there be a bus instead of the car”** (`drawing/scenes-03.csv#96`) still left material unresolved in direct and beam. Neuro-Prolog supplied an accepted imperative with the bus and the replacement phrase.
- **“set the from y of all the arrows to 40”** (`diagram/diagrams-07.csv#487`) was source-complete in both spaCy strategies but failed because the graph made “the” the object and attached “from” as a relation. It missed the property “from y” of the arrows. The Neuro-Prolog reading had the same defect.
- **“Could you what values does Prizes show?. I appreciate it.”** (`diagram/diagrams-04.csv#2929`) is a direct gain. The updated circuit captures the interrupted request, its independent question, and the appreciation statement. Neuro-Prolog made “you” the object of “show.”

Exact circuits and reasons from all three strategies are in [paired-cases.json.gz](paired-cases.json.gz).

## Measurement and replay

The archived `en_core_web_trf` 3.8.0 output was supplied through a source-locked `syntaxModel` to both normal public adapters. The beam policy retained complete greedy first, ranked the two highest-scored distinct complete alternatives after it and retained the greedy partial only if no complete reading survived. Each returned circuit was independently checked through the normal adapter. Median public projection and validation took 0.108 ms for direct and 0.344 ms for beam on the frozen graphs. This replay excludes dependency inference and subprocess transport.

Blind model review used exact source-and-circuit fingerprints. Of 383 eligible pairs, 323 reused matching judgments from the archives listed in [review/prior-archives.txt](review/prior-archives.txt). There were no conflicting historical threshold decisions for these reused pairs. New pairs had independent `gpt-6-sol` and `gpt-6.1-terra` votes. The third reviewer, `gpt-6.2-sol`, adjudicated threshold disputes and audited sampled agreements. Across all reused and new pairs there were 41 threshold disputes, and the third vote contradicted three of the 40 sampled threshold agreements. The detailed audit is in [review/candidate-review-summary.json](review/candidate-review-summary.json).

Run this from the NLU checkout to reproduce the paired counts:

```sh
base=eval-results
current="$base/2026-11-26-spacy-beam-refresh-diagnostic-250"
pilot="$base/2026-11-26-spacy-dependency-beam-pilot"
prolog="$base/2026-11-26-neuro-prolog-historical-diagnostic-250"
out=$(mktemp -d)
python3 "$current/compare.py" "$current" "$pilot" "$prolog" "$out"
diff -u "$current/comparison.json" "$out/comparison.json"
```

[replay.mjs](replay.mjs) also reconstructs public submissions from the fixed graphs using an isolated checkout at `0b955a1`.
