# Working on now

Written by hand at each step. It holds no scores on purpose, so that it cannot contradict the computed
sections of this page. Each judged step, with its score: [Progress over time](#progress).

**Latest steps** (2026-11-27, evening)

- **spaCy**: a second, third, fourth and fifth round of general repairs in the layer that writes its
  circuits (commits `0a7bb62`, `730c906`, `fa4452c`, `0f20f16`). After each round, judges read the
  benchmark circuits that changed.
- **VSS**: three rounds of rules (commits `71f0dd2`, `85de0bb`, `c080ce8`). Among them: subject–verb
  agreement and "-ing" verbs after the verbs that take them, both learned from the raw text; fronted
  clauses; lists after "with" and after colons. After each round, judges read the benchmark circuits
  that changed.
- **DistilBERT**: retrained on the grown labels, with the benchmark messages held out (checkpoint
  `syntax-v3`), and measured (commit `6af9b97`).
- **A wider agreement key**, `variants` (commit `c8d0a09`): two circuits also count as the same up to
  the choices the judges' rules let pass either way ([Agreement between formalizers](evaluation/agreement.md)).
- **The conversion refilled**: VSS and spaCy, in newer versions, ran again over the files of the batch
  conversion; agreement was settled with the wider key, and a judge read a random 2% of the new agreed
  circuits (pooled in `eval-results/conversion-audit-02` and `eval-results/conversion-audit-03`, the
  second in commit `aef741e`). Counts: [The dataset](#dataset) and [Agreement](#agreement).
- **The judges' rules**: ten settled cases added after a consistency check of all distinct verdicts,
  with the verdicts they contradict (commit `7ffdbd4`).
- **Two learned methods, measured and not adopted**: a transition-based parser trained on the labels,
  and spaCy fine-tuned on the judged circuits (`experiments/syntax-learned/README.md`).
- **strict-vss**: the design of a separate formalizer that reads through a vector-symbolic sentence
  state, and its first measurements (commit `f5be34c`; [Formalizers](formalizers/README.md)).

**Next, in order** (the journal, "Next steps")

1. Commit the next VSS round once checked; judge only the benchmark circuits that changed.
2. After each round of rules, run VSS again over the conversion, settle with the wider key, audit 2%,
   fill the empty cells.
3. Conversion rounds for the messages that stay open: one judge reads one circuit per message (the one
   most strategies wrote), and a fixer writes it when it is rejected.
4. Retrain DistilBERT as the labels grow (benchmark held out) and measure.

**Not measured yet** (what a reviewer will ask)

- GOAL on a fresh random sample: rules were found by reading this benchmark's rejected circuits, so the
  current sample overstates VSS and spaCy somewhat
  ([Limits of the measurements](evaluation/validity.md#no-longer-an-unseen-sample)). A new sample will
  be drawn once the labels have grown.
- VSS learns its word habits from the raw text of the whole dataset, including the benchmark's messages
  (no labels): this is allowed (unsupervised), but it is not a held-out measurement in the strict sense.
- How often two judges, or a judge and a person, agree on this schema
  ([Judges](evaluation/judging.md#what-is-not-known-about-judges)).
