# Working on now

Updated by hand with every step; the numbers are in the sections this text links to.

**Latest results**

- VSS reached **75.5%** on the benchmark (65.9% at the first judging): the rules of three fault analyses and
  the measured prototypes of the lever study ([Progress over time](#progress)). It is now above DistilBERT
  (73.1%); spaCy leads with 86.8% after general repairs in our writing layer.
- The lever trials, judged in full: evidence from DistilBERT on the roles of words would add about 3.9 points
  to VSS; with perfect word tags (stations) up to about 9 points. Better tagging is a real lever for VSS,
  alongside the structural rules.
- Where VSS and spaCy write different circuits, both are accepted in a large share of messages: the schema
  allows several readings ([Agreement](#agreement)).
- **A wider agreement key** (commit `c8d0a09`): two circuits now count as the same also up to eight choices
  the judges' rules let pass either way (which word heads a name, a number after a noun, where a discourse
  word sits, "let's", "left of", quantity phrases, "a bit", naming participles). On the judged benchmark it
  adds 182 agreements where both circuits were accepted and none where one was rejected. On the 217 files
  of the batch conversion, VSS and spaCy now agree on 38.9% of messages instead of 31.7% (calendar: 56.0%
  instead of 10.6%), so more cells can be filled without a judge, with the usual 2% audit.

- **Two learned methods, measured and not adopted** (`experiments/syntax-learned/README.md`): a
  transition-based parser for VSS trained on the labels (55% known accepted, 63–76% estimated, below VSS), and
  spaCy fine-tuned on the judged circuits (about break-even with the base model). Both mostly learn VSS's own
  conventions, because most labels so far are VSS's agreement circuits; they need judged examples from the hard
  part of the dataset first.

- **The dataset grew to 45.6%** (83,619 of 183,497 messages have an accepted circuit; 33.8% before): VSS and
  spaCy in their current versions ran again over the 217 files of the batch conversion, agreement was settled
  with the wider key, a judge read a random 2% of the new agreed circuits (431 of 433 accepted), and the empty
  cells were filled ([Dataset](#dataset)). On the way a fault of the write step was found and fixed: a file
  where one labelled message had got another circuit was skipped whole (commit `9b2831e`).

**Running at this moment**

- **VSS rules, next round.** The largest group first: the finite verb found by agreement with its subject
  ("the board dials in tomorrow morning", "the data lives somewhere" are today read as nouns), built on a
  number habit learned from the text, not on word lists; then fronted clauses ("while you're at it, …"),
  measures and appositions set off by commas, numerals as heads, relative clauses.
- **spaCy, second round of general repairs** in the layer that writes its circuits, on the about 241
  benchmark circuits judges still reject (scene lists, gapping, grading words, clauses untied across ";").

**Next, in order**

1. Judge the benchmark circuits that the next VSS round changes; record the new GOAL here.
2. Judge the benchmark circuits that the spaCy repairs change; record the new GOAL.
3. Rerun VSS over the conversion after each round of rules and settle again (each gain fills cells without a
   judge, with a 2% audit).
4. Retrain DistilBERT on the grown labels (benchmark held out) and measure.
5. Conversion rounds for the messages that stay open: a judge reads one circuit per message and writes it when
   it is rejected.

**Not measured yet** (what a reviewer will ask)

- GOAL on a fresh random sample: the rules were found by reading this benchmark's rejected circuits, so the
  current sample now overstates VSS somewhat. A new sample will be drawn once the labels have grown.
- VSS learns its word habits from the raw text of the whole dataset, including the benchmark's messages (no
  labels): this is allowed (unsupervised), but it is not a held-out measurement in the strict sense.
