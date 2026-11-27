[Home](../README.md) › [VSS in depth](README.md) › Limits

# Known limits of VSS

This page: the known limits of VSS in one place, including where its faults lie according to the lever study. Kind: Explanation.

From the VSS report (section 14, at commit `fa46cb7`), the journal and the strategy page of the `nlu` period. Faults observed at `fa46cb7` were run again at `97a1b83` for this page. Current scores are in [STATUS.md](../STATUS.md).

## One path, one pass

Each reading round decodes one station path, and the linker is one pass of fixed policy. Alternative readings are never built and compared. The loop of doubts can only ban stations and start again ([Reading](reading.md)).

## Where the faults are

The lever study (`eval-results/2026-11-27-vss-levers-study`, commit `45677bc`) forced VSS's stations to those of a known accepted circuit, on the 538 benchmark messages where VSS was not accepted but such a circuit exists.

- For 292 of the 538 the circuit did not change at all. The stations already fitted, so the fault lies in the units and links (`src/units.mjs`, `src/links.mjs`).
- The study first estimated that perfect stations would add +2.7 points, counting only circuits already judged.
- **Correction, after judging.** The forced-station circuits were then judged in full (`eval-results/2026-11-27-vss-lever-trials`, commit `9df0889`): 170 of 401 were accepted. Perfect stations would repair up to about 170 messages, roughly +9 points.

So both parts matter: for about half of the failures the fault is in units and links; for the other half better tagging is a real lever. The faults left form a long tail: 17 rule groups of 5 to 32 messages each, of about 520 rejected.

This moved an earlier finding. An independent review in the `nlu` period found "that most lost acceptance comes from the station of a word, not from linking", and estimated a ceiling of 60 to 65% for this design. Both were set in the `nlu` schema. In the syntax schema VSS was above that ceiling already in its first judged run ([Results as first measured](../project/first-results.md); [The nlu-schema period](../project/nlu-period.md)).

## How VSS knows what it knows

- **Habits counted on its own readings.** The habits and the memory are counted on the reader's own readings of the text, with a plainer chunker than the one that reads. An error can confirm itself, and the learned lists carry noise ("drawing" as a clause-taking verb, "igve" as a giving verb) ([What VSS learns](learned-knowledge.md)).
- **Thresholds set by hand.** Three are documented as chosen from counts in this dataset: `SURELY_A_THING`, `SURELY_A_VERB`, `UNLIKE`. Most rules use counts such as "at least 3" whose origin is not recorded. Training has its own hand-set numbers: the prior weights, the weight 20 of the prior in the counts, sharpening, kinship, and the thresholds of variants and openers.
- **Rules as ordered code.** The rules are JavaScript, in order, many reading the same structures. Their interactions show only by running: a rule's own example can be caught first by another rule ([Linking](linking.md#coordination-which-nominal-a-listed-one-joins)). Only the eight lettered groups can be switched off.
- **English in the code.** Ending classes, clitics, stem spelling, the plural test, the question mark, the word "it" in the anchored frames and the break marks of openers are in JavaScript, outside the legend ([Learned and declared](learned-and-declared.md)).
- **A legend tied to the code.** The code hard-codes the legend's station, mark and slot names, so the legend cannot be edited or replaced apart from the code ([The legend](legend.md)).
- **The model carries the legend.** An edit to `legend.sop` needs retraining before it changes any reading ([The model file](model-file.md)).
- **Learned items shaped by the dataset.** Some openers ("circle", "260", "roundup 260") and spelling variants ("foward" → "toward") come from the dataset's patterns or are wrong; misspellings under 5 letters are never corrected.

## Faults observed

Four faults the report found at `fa46cb7`, and what VSS writes for them at `97a1b83`:

- **"the two lines differ"**. At `fa46cb7`: `head="differ"`. At `97a1b83`: `head="lines"` with `dependent="differ"`, still one nominal in a fragment; the verb is not read.
- **"make runway orange"**. At `fa46cb7`: one modifier run "runway orange". At `97a1b83`: `complement` "runway" and `modifier="orange"` on the clause.
- **"make sure it fits"**. At both: "it" is the complement of "make sure" and also the subject of "fits".
- **"pie radius smaller"**. At both: "smaller" is a dependent of the nominal. The schema's own example writes it as a modifier of the fragment clause ([Clause and nominal wires](../schema/clause-and-nominal.md)).

To find and fix faults like these: [Add a rule to VSS](../guides/add-vss-rule.md).

## Portability

The reader is meant to run without file access, so that it could run in a browser. But `src/emit-syntax.mjs` imports `lib/syntax.mjs`, which reads the schema file with `node:fs` when it is loaded. Passing the schema text in, or bundling it, would restore the property; this is not done.

## Leftovers in the code

At `fa46cb7`:

- `src/units.mjs.orig`, a copy of an earlier `units.mjs`, imported by nothing;
- `src/syntax.mjs`, which writes version 1 of the syntax schema, obsolete since version 3;
- the `nlu`-period tools (`core.mjs`, `compare.mjs`, `evaluate.mjs`, `judged.mjs`, `triage.mjs`) and their judging rules;
- `asideW`, a constant `false` in `fill`;
- `budget.known`, with no effect by default;
- in `src/anchors.mjs`, an unused `grades` and a quality branch that adds nothing;
- the pair `between … and`, which never fires.

## Not tried

VSS has never been tried on English outside the WebMeet dataset. The plan for such a test is on [Making VSS reusable](reuse.md).

## How far the measurements can be trusted

The benchmark figure leans on agreement labels that VSS helped write, and some rules were found in the benchmark's own rejections. These and other caveats are on [Limits of the measurements](../evaluation/validity.md).

---

Next: [Making VSS reusable](reuse.md) · Up: [VSS in depth](README.md)
