[Home](../README.md) › [hmm-rules in depth](README.md) › Making hmm-rules reusable

# Making hmm-rules reusable

This page: what is not yet general in hmm-rules, the four steps planned to make it a reusable reader of English, what the lever trials showed, and why training hmm-rules on the labels is circular. Kind: Explanation.

From the journal ([improvements-ideas.md](../../improvements-ideas.md), section "Making VSS reusable", written when the strategy was called vss; on a phone: [The journal, as lists](../status/journal.md)), the architecture report (section 15) and the design of rvss.

## The owner's question

On 2026-11-27 the owner asked whether the rules added to hmm-rules are general or particular. The journal's answer: the rules are statements about English that name only function words and use what hmm-rules learns from text. The analyses were split by area (drawing, diagram, calendar) only to find the faults where they occur.

## What is not yet general

- **Thresholds measured on this dataset**: a word seen as a thing at least 20 times; the likeness 0.3 ([The rule catalogue](rules.md)).
- **The choice of constructions**: which constructions get rules was driven by the frequent faults of commands to a drawing application.
- **Borderline legend words**: left/right as direction adverbs, today/tomorrow, thanks.

The full list of particular parts: [Learned and declared](learned-and-declared.md).

## Four steps

1. **An audit of generality.** List every rule and word list, and try to show each one particular. Class each as general English, a threshold tuned on this data, or particular. Rewrite or remove the particular ones. The report's catalogue, with its T and n marks, is a starting inventory.
2. **Rules as data.** Move the rules out of JavaScript into constructions declared in the legend (SOP Lang), over stations and word marks. The engine stays generic, and the grammar of English becomes a file that can be read, checked and extended. Precondition: the code now hard-codes the legend's station, mark and slot names; constructions declared as data would have to name those through the legend ([The legend](legend.md)).
3. **Thresholds learned, not set.** The code names the features of each decision; the weights are learned from the accepted circuits, so that no number is tuned by hand on this dataset.
4. **A test outside the dataset.** Run hmm-rules on English it was never tuned on (other kinds of messages, or a public corpus) and have a judge read a sample.

The report adds two needs for a fair measure: the English knowledge now in JavaScript would move into the legend or a language file, and the benchmark sample used to check rules would be replaced by a fresh one.

## The lever trials

A **lever** is a change beyond adding single rules. The lever trials tried three learned aids on a copy of hmm-rules, each judged against the same plain copy on the same benchmark messages (`eval-results/2026-11-27-vss-lever-trials`):

- **Station prior**: the station tagger of hmm-rules trained again with the accepted circuits mapped to stations as a weighted prior, benchmark messages held out.
- **DistilBERT evidence on the verb**: a small per-word table learned from DistilBERT's circuits says how a word is used; where it is sure and hmm-rules disagrees, the word is kept off the stations the table rules out. Used for the verb only.
- **DistilBERT evidence on roles**: the same table for all five word uses (verb, word of a nominal, modifier, marker, other).

All three gained over the plain copy: the station prior least, the evidence on roles most. The conclusion recorded in the journal: evidence from a better tagger is a real lever. To keep hmm-rules portable, it would be distilled into a table that hmm-rules reads, with no model at run time. The numbers: [STATUS.md, Progress over time](../STATUS.md#progress-over-time).

The journal's plan for hmm-rules: "first the measured rule prototypes, one commit each; then the structural rules; then learned decisions where thresholds fail; station-level learning only if the trials justify it". The prototypes landed in `83fce90` ([The rule catalogue](rules.md#rules-added-after-fa46cb7)).

## Ideas not yet tried

A supervised station model, learned decisions in the linker, reranking of the readings of hmm-rules, and DistilBERT as a voice inside hmm-rules are listed, each with the reason to expect a gain, in the journal's section "Ideas not yet tried" ([improvements-ideas.md](../../improvements-ideas.md); on a phone: [The journal, as lists](../status/journal.md)).

## The circularity of training on labels

Most labels of the dataset are agreement circuits, and most of those were written by hmm-rules agreeing with a spaCy formalizer ([The WebMeet dataset](../evaluation/dataset.md)). Trained on them, hmm-rules would partly learn its own output, and its later agreement with spaCy would mean less.

Two learned methods tried on the labels showed this (`experiments/syntax-learned/README.md`). A transition-based parser trained on the labels learned the conventions of hmm-rules, because 91% of its training labels were agreement labels, which carry the circuits of hmm-rules. spaCy fine-tuned on the judged circuits learned them too, because two thirds of those circuits were written by hmm-rules. Both need training signal from the hard part of the dataset (judged circuits, with rejected ones as negatives) before they can help ([Tried and dropped](../project/tried-and-dropped.md)).

## A different design: rvss

The owner asked for a separate formalizer, `rvss` (first called `strict-vss`), that reads a message the way the original vector-symbolic reader did: the message is composed into one vector state by VSA operations only, and the circuit is read out of that state. The strategy then called `vss` stays as it is, renamed `hmm-rules` on 2026-11-27. rvss is in design (`strategies/strict-vss/DESIGN.md`); see [Formalizers](../formalizers/README.md).

---

Next: [hmm-rules' own names](names.md) · Up: [hmm-rules in depth](README.md)
