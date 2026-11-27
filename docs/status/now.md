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

**Running at this moment**

- **VSS rules, next round.** The largest group first: the finite verb found by agreement with its subject
  ("the board dials in tomorrow morning", "the data lives somewhere" are today read as nouns), built on a
  number habit learned from the text, not on word lists; then fronted clauses ("while you're at it, …"),
  measures and appositions set off by commas, numerals as heads, relative clauses.
- **A wider agreement key.** It counts the variations the judges' rules allow either way as the same circuit,
  so that more messages can be settled without a judge; it is measured on the judged pairs where only one of
  the two circuits was accepted (a false agreement there would let a wrong circuit through).
- **Refilling the dataset.** VSS and spaCy, in their current versions, run again over the 217 files of the
  batch conversion; then the agreement is settled again, a judge reads 2% of the new agreed circuits, and
  empty cells are filled ([Dataset](#dataset)).
- **Two prototypes of general methods**, in scratch: a learned structure for VSS (a transition-based parser
  with an averaged perceptron, in plain JavaScript, trained on the accepted circuits) and spaCy fine-tuned on
  the judged circuits. The benchmark messages are held out of both; a reviewer checks the comparisons.

**Next, in order**

1. Judge the benchmark circuits that the next VSS round changes; record the new GOAL here.
2. Adopt the wider agreement key if it holds, settle the refilled conversion folders, audit, fill cells.
3. Decide, on the prototypes' numbers, whether to build the learned structure for VSS and the fine-tuned
   spaCy.
4. Conversion rounds for the messages that stay open: a judge reads one circuit per message and writes it when
   it is rejected.

**Not measured yet** (what a reviewer will ask)

- GOAL on a fresh random sample: the rules were found by reading this benchmark's rejected circuits, so the
  current sample now overstates VSS somewhat. A new sample will be drawn once the labels have grown.
- VSS learns its word habits from the raw text of the whole dataset, including the benchmark's messages (no
  labels): this is allowed (unsupervised), but it is not a held-out measurement in the strict sense.
