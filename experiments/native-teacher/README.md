# Offline native SOP teacher pilot

Select 64 exact sources by sorting the sealed 500 rank-train identifiers by SHA-256 of `native-teacher-v1`, an ASCII NUL, and the identifier. Generate one native circuit from each original source. A circuit that fails public completeness gets one repair attempt with static feedback. Independent literal review scores eligible circuits as singletons. Only accepted source/circuit pairs are exported as supervision.

Run from the repository root using the pinned knowledge installation and the proposal pool archive.

```sh
archive="$PWD/eval-results/2026-11-26-neuro-selector-proposal-pools/train"
work=/absolute/path/to/new-output-directory
knowledge=/absolute/path/to/sop-knowledge-worlds
node experiments/native-teacher/teach.mjs "$archive" "$work" "$knowledge"
bash experiments/native-teacher/review.sh "$work" "$archive/review"
node experiments/native-teacher/compare.mjs "$work" "$archive" "$knowledge"
```

The teacher prompt includes the local native schema and literal source strings, without IDs, references, previous systems' outputs or semantic grades. Only the repair round sees the teacher's previous circuit and static diagnostics. Terra and GPT-6.2 Sol independently review eligible novel circuits. A separate GPT-6.1 Sol call decides threshold disagreements and audits up to 20 agreements per outcome. These reviews receive source and circuit only, under the existing native singleton rubric. Exact prior verified votes are reused when available.

The selector baseline replays the already-frozen ranker on original four-family archives, using the same source and candidate eligibility. It has previously trained on these inputs and its measured performance is an in-sample comparison. No classifier fitting or public-strategy changes are part of this experiment.
