# Prolog example transfer

Train with `trainExampleTransfer(rows, {knowledgeDir, worldPaths})`. Each row supplies its utterance in `text` and independent SOP circuits in `references`. Partition the corpus before training when evaluating held-out utterances. Persist the returned object as JSON and pass its path as `modelPath` to `prologExampleTransfer.open`, along with the SOP knowledge directory and optional world overlays and SWI-Prolog executable.

The trainer aligns written fields to token spans and identifies typed slots for names, open values, numbers, dates and times. Each template stores literal anchors, slot bounds, an output circuit and support from distinct normalized utterances. A template needs either observed variation in a slot or at least three literal word anchors. The matcher unifies the entire utterance with a template in SWI-Prolog. Circuit evidence and slot offsets come from the matched input. Native SOP validation, catalog constraints and span checks filter the returned circuits.

The strategy preserves original symbolic candidates in order and appends up to twelve distinct transfer readings. Each carries the source `prolog-example-transfer`, the number of supporting training utterances and the text and code-point offsets of its captured slots.

The model's `training` counters record the input rows, distinct normalized utterances, provided references, within-row duplicate references, circuits skipped with empty or oversized utterances, parse failures, unsupported circuits, circuits that could not yield a slot pattern, eligible circuits, weak pattern groups and emitted templates. An eligible circuit may share its template with other circuits. Additional copies of the same normalized utterance do not add to a template's support.

Slot induction and matching follow the approach of the original GPLv3 Prolog formaliser. The strategy uses the in-tree symbolic port and carries the same license.
