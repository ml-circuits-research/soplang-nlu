[Home](../README.md) › [Status](../STATUS.md) › Agreement and audit in detail

# Agreement and audit in detail

This page: how often hmm-rules and spaCy write the same circuit on the benchmark, by area and over time, what the judges said where they differ, the audit of the batch conversion, and where the agreed circuits stand in the dataset. Kind: Reference.

Generated 2026-11-27 22:55 (UTC+01:00) by `node docs/status/build.mjs` · soplang-nlu 94baeb1 (2 uncommitted paths) · webmeet-dataset c6b11f6. The main figures are in [Agreement between hmm-rules and spaCy](../STATUS.md#agreement-between-hmm-rules-and-spacy) on the status page; the terms are explained in the [Glossary](../reference/glossary.md).

Two strategies that read a message from different sources (hmm-rules from raw text, spaCy from a parser trained on treebanks) and write the same circuit are very likely right. This is how most labels of the dataset were made. **Same circuit**: equal after the [normal form](../reference/glossary.md#project-terms) (wire names and order do not matter). **Up to attachment**: the same circuit except where a phrase with a linking word ("on", "of", "for") starts, which the judges' rules let be the clause or a nominal of it (the journal says "up to the start of marked relations"). Under it: how many of these agreed circuits the judges accepted, rejected, or have not read.

**First judging (16:39)**, benchmark messages:

| Measure | Count |
| --- | ---: |
| Messages | 1,831 |
| Same circuit | 400 (21.8%) |
| Up to attachment | 575 (31.4%) |
| … accepted | 573 |
| … rejected | 2 |

**Now**, benchmark messages:

| Measure | Count |
| --- | ---: |
| Messages | 1,831 |
| Same circuit | 484 (26.4%) |
| Up to attachment | 702 (38.3%) |
| … accepted | 699 |
| … rejected | 3 |

**By area** (now; at the end of each row, the first judging (16:39)). Small areas give rough shares: look at the number of messages.

| Area | Agreement |
| --- | --- |
| drawing | 43.3% up to attachment, 30.9% same circuit, of 876 messages; first judging (16:39): 36.4% up to attachment |
| diagram | 38.0% up to attachment, 25.2% same circuit, of 808 messages; first judging (16:39): 29.8% up to attachment |
| calendar | 16.7% up to attachment, 6.3% same circuit, of 48 messages; first judging (16:39): 12.5% up to attachment |
| document | 8.1% up to attachment, 6.1% same circuit, of 99 messages; first judging (16:39): 9.1% up to attachment |

Where both wrote a valid circuit and the circuits differ (1,129 messages, now), what the judges said of each:

| Messages | What the judges said |
| ---: | --- |
| 704 | circuit of hmm-rules: accepted; spaCy's circuit: accepted |
| 326 | circuit of hmm-rules: rejected; spaCy's circuit: accepted |
| 56 | circuit of hmm-rules: rejected; spaCy's circuit: rejected |
| 43 | circuit of hmm-rules: accepted; spaCy's circuit: rejected |

Where both circuits were accepted, the schema allows more than one reading (which word heads a name, a number after a noun as a dependent or as its own nominal, modifier or discourse word). The tables above compare by the keys `core` and `relaxed`; the wider key `variants` (commit `c8d0a09`) also counts such choices as the same ([Agreement: the keys](../evaluation/agreement.md)).

**Audit of the batch conversion.** When the whole dataset was converted, every circuit that strategies of different [families](../reference/glossary.md#project-terms) wrote alike was written into the dataset with no judge; a judge read a random 2% of them as a control (the [audit](../reference/glossary.md#project-terms)). Counted now from the agreement records of the conversion folders:

| Audit | Count |
| --- | ---: |
| Conversion folders | 217 |
| Settled by agreement | 86,437 |
| Read by a judge | 1,715 (2.0%) |
| … accepted | 1,698 |
| … rejected | 17 (0.99%) |

The records count 1,715 audit circuits read (1,698 accepted, 17 rejected), and these are the figures shown. The journal and commit `a09047d` give 1,154 read and 10 rejected: the audit of the first batch conversion alone. The records also hold the audits of the later refills of the conversion. The judges read the audit circuits in pooled packets (`eval-results/conversion-audit`, `eval-results/conversion-audit-02`, `eval-results/conversion-audit-03`), together with other circuits of the conversion folders. How the counts add up: [The audit: the counts](../evaluation/audit.md#the-counts).

**Why the dataset has 84,186 agreement labels, not 86,437.** Where the 86,437 agreed circuits stand in the dataset now:

| Count | Where the agreed circuit stands |
| ---: | --- |
| 83,886 | Still the label, marked as settled by agreement |
| 1,682 | Still the label, now marked as accepted by a judge (read in the audit and accepted) |
| 849 | Replaced by another circuit (352 of them on benchmark messages, when the benchmark was published) |
| 20 | No circuit in the dataset now (the cell was emptied) |

The other 300 agreement labels of the dataset were settled outside these folders.

---

Next: [The journal, as lists](journal.md) · Up: [Status](../STATUS.md)
