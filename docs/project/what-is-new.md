[Home](../README.md) › [Project](README.md) › What is new here

# What is new here: an index

This page: for each piece of the project, one short line on what was designed here, with a link to the page that holds its full Standard / New here / Particular block. Kind: Explanation.

## The three labels

Every page that describes a piece of the project says, for that piece:

- **Standard**: an established idea or tool, used as the field knows it.
- **New here**: designed in this project (a format, a combination, a procedure).
- **Particular**: holds only for this project's language, data or setting.

A piece is often all three at once. The hmm-rules reader, for example, uses a standard model (a [hidden Markov model](https://en.wikipedia.org/wiki/Hidden_Markov_model)), adds rules of its own (new here), and learns from the WebMeet messages (particular). The linked page says which part is which, and why.

## What was designed here

Each line is a summary. Its terms are explained on the linked page; EM, legend, family and audit are also in the [Glossary](../reference/glossary.md). The beam of a parser keeps several high-scoring parses instead of one ([beam search](https://en.wikipedia.org/wiki/Beam_search)).

| Piece | New here (the full block is on the linked page) |
| --- | --- |
| Syntax first | The output of the syntactic step: every word in one place, quoted. [Message to action](../concepts/message-to-action.md) |
| SOP Lang, schemas | Nothing here; the notation is the project family's own (Particular). [SOP Lang](../concepts/sop-lang.md) |
| Worlds | Nothing for this repository; the formalizers use no world. [Worlds](../concepts/worlds.md) |
| Syntax schema | Quoted words instead of positions; marked ambiguity; several right readings. [Overview](../schema/overview.md) |
| hmm-rules | The legend; changes to EM; re-decoding on doubt; function-word-only rules. [Learned and declared](../hmm-rules/learned-and-declared.md) |
| spaCy | The circuit writer, its repairs, and the beam rule for ambiguity. [spaCy](../formalizers/spacy.md) |
| DistilBERT | The prediction targets and the assembly of a circuit from them. [DistilBERT](../formalizers/distilbert.md) |
| Prolog | The grammar. [Prolog](../formalizers/prolog.md) |
| Z3 | The constraint model: its choices, constraints and weights. [Z3](../formalizers/z3.md) |
| rvss | Reading through a vector-symbolic state, as the earlier reader did; in design (folder `strategies/rvss/`). [Formalizers](../formalizers/README.md) |
| Judging | The one-question criterion; rules grown by settled cases; the levels. [Judging](../evaluation/judging.md) |
| Agreement, audit | The procedure: families by source, keys the rules allow, a seeded audit. [Agreement](../evaluation/agreement.md) |
| Benchmark | GOAL; accepted circuits published as labels; labels frozen per run. [Benchmark](../evaluation/benchmark.md) |
| WebMeet dataset | Mirrored semantic and syntactic layers, checked with no language model. [Dataset](../evaluation/dataset.md) |

## Standard parts, for comparison

Most of the methods inside these pieces are established; what is new is how they are combined and what they are aimed at. The main standard parts:

- hmm-rules: a [hidden Markov model](https://en.wikipedia.org/wiki/Hidden_Markov_model) trained by [expectation–maximization](https://en.wikipedia.org/wiki/Expectation%E2%80%93maximization_algorithm), decoded with the [Viterbi algorithm](https://en.wikipedia.org/wiki/Viterbi_algorithm); rule-based chunking.
- spaCy: a pretrained [dependency parser](https://en.wikipedia.org/wiki/Dependency_grammar).
- DistilBERT: [fine-tuning](https://en.wikipedia.org/wiki/Fine-tuning_(deep_learning)) of a pretrained [transformer](https://en.wikipedia.org/wiki/BERT_(language_model)).
- Prolog and Z3: grammars in [Prolog](https://en.wikipedia.org/wiki/Prolog), and constraints solved with [satisfiability modulo theories](https://en.wikipedia.org/wiki/Satisfiability_modulo_theories).
- Judging and labels: a [large language model](https://en.wikipedia.org/wiki/Large_language_model) as evaluator; independent views that confirm each other ([co-training](https://en.wikipedia.org/wiki/Co-training)); a sampled check ([acceptance sampling](https://en.wikipedia.org/wiki/Acceptance_sampling)).

## Where Particular matters most

A reviewer who asks "would this carry over to other English?" should look first at these, each explained on its page:

- the WebMeet messages themselves: commands to a calendar, a drawing canvas, a diagram editor and a document editor, many from templates or with typos ([Dataset](../evaluation/dataset.md));
- the numbers in the rules of hmm-rules that were chosen from counts in this dataset ([hmm-rules rule catalogue](../hmm-rules/rules.md));
- the repairs of the spaCy writer, found on this data's faults ([spaCy](../formalizers/spacy.md));
- the settled cases of the judging rules, added where judges ruled differently on this data's messages ([Judging](../evaluation/judging.md));
- DistilBERT's training labels, most of which come from hmm-rules and spaCy agreeing ([DistilBERT](../formalizers/distilbert.md)).

## How novelty is checked

The schema page [Related work, weak points, open questions](../schema/related-work.md) relates the schema to the literature. The method of judging and its limits are in [Judges and the judging rule](../evaluation/judging.md) and [Limits of the measurements](../evaluation/validity.md). The reasons behind each choice are in [Decisions D1–D14](decisions.md).

---

Next: [Decisions of the owner](decisions.md) · Up: [Project](README.md)
