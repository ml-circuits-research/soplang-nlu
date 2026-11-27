# Working on now

Written by hand at each step. It holds no scores on purpose, so that it cannot contradict the computed
sections of this page. Each judged step, with its score: [Progress over time](#progress).

**Latest steps** (2026-11-27, evening)

- **spaCy**: a second, third, fourth and fifth round of general repairs in the layer that writes its
  circuits (commits `0a7bb62`, `730c906`, `fa4452c`, `0f20f16`). After each round, judges read the
  benchmark circuits that changed.
- **hmm-rules**: three rounds of rules (commits `71f0dd2`, `85de0bb`, `c080ce8`). Among them: subject–verb
  agreement and "-ing" verbs after the verbs that take them, both learned from the raw text; fronted
  clauses; lists after "with" and after colons. After each round, judges read the benchmark circuits
  that changed.
- **DistilBERT**: retrained on the grown labels, with the benchmark messages held out (checkpoint
  `syntax-v3`), and measured (commit `6af9b97`).
- **A wider agreement key**, `variants` (commit `c8d0a09`): two circuits also count as the same up to
  the choices the judges' rules let pass either way ([Agreement between formalizers](evaluation/agreement.md)).
- **The conversion refilled**: hmm-rules and spaCy, in newer versions, ran again over the files of the batch
  conversion; agreement was settled with the wider key, and a judge read a random 2% of the new agreed
  circuits (pooled in `eval-results/conversion-audit-02` and `eval-results/conversion-audit-03`, the
  second in commit `aef741e`). Counts: [The dataset](#dataset) and [Agreement](#agreement).
- **The judges' rules**: ten settled cases added after a consistency check of all distinct verdicts,
  with the verdicts they contradict (commit `7ffdbd4`).
- **Two learned methods, measured and not adopted**: a transition-based parser trained on the labels,
  and spaCy fine-tuned on the judged circuits (`experiments/syntax-learned/README.md`).
- **rvss** (folder `strategies/rvss/`): the design of a separate formalizer that reads through a
  vector-symbolic sentence state, and its first measurements (commit `f5be34c`;
  [Formalizers](formalizers/README.md)).
- **The strategy `vss` renamed `hmm-rules`** (2026-11-27): a hidden Markov model plus rules, not a
  vector-symbolic reader ([hmm-rules: Name](formalizers/hmm-rules.md#name)).
- **The status of each formalizer** (the owner's decision of 2026-11-27): spaCy is the one active
  strategy, measured and being improved; hmm-rules, DistilBERT, Prolog and Z3 are experimental:
  measured, kept runnable and still a voice in agreement for their own family, but not improved now;
  rvss is being built ([Formalizers](formalizers/README.md)).

**Running now** (2026-11-27, night)

- **The rvss sprint**: spaCy run over every message of the dataset as training data for rvss (a "silver"
  set, kept apart from the labels); training sets and the rvss move sequences; an evaluation harness;
  then rvss built and trained on the GPU (placement, moves under teacher forcing, free running), aiming to
  reproduce spaCy with a smaller and faster model, measured on the benchmark and checked by a reviewer.
- **A silver audit**: every spaCy circuit of the open messages gets a suspicion score from cheap signals
  (disagreement with hmm-rules and DistilBERT, length, structure); a judge reads a stratified random sample
  per suspicion level, to know how clean spaCy's circuits are before large language models clean the rest.
- **spaCy, a sixth round of general repairs** on the circuits judges still reject.
- **Documentation of rvss as an HMM plus a VSA memory**, with what research on HMMs, hierarchical HMMs,
  grammar induction and vector-symbolic sequence memory says for its design (section docs/rvss/).

**Next, in order**

1. Read rvss's first measurements against spaCy (accuracy, speed, size); decide the next milestone.
2. Clean the spaCy circuits of the suspicious levels with judges that rewrite rejected circuits; publish
   what they accept as labels.
3. A fresh random benchmark sample, since the current one has been used to find faults.

**Not measured yet** (what a reviewer will ask)

- GOAL on a fresh random sample: rules were found by reading this benchmark's rejected circuits, so the
  current sample overstates hmm-rules and spaCy somewhat
  ([Limits of the measurements](evaluation/validity.md#no-longer-an-unseen-sample)). A new sample will
  be drawn once the labels have grown.
- hmm-rules learns its word habits from the raw text of the whole dataset, including the benchmark's messages
  (no labels): this is allowed (unsupervised), but it is not a held-out measurement in the strict sense.
- How often two judges, or a judge and a person, agree on this schema
  ([Judges](evaluation/judging.md#what-is-not-known-about-judges)).
