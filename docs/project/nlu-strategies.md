[Home](../README.md) › [Project](README.md) › Strategies of the nlu-schema period

# Strategies of the nlu-schema period

This page: one short section for each strategy page of the nlu period, so that their names and figures can be traced. Kind: Explanation.

> **History only.** Nothing on this page describes the current system. In the nlu period the strategies wrote the `nlu` schema, read knowledge worlds and could return up to two readings ([The nlu-schema period](nlu-period.md)). The figures below were measured in that schema and are not comparable with today's levels.

Each section summarises the former page `docs/strategies/<name>.md`, whose earlier text stays in the git history (for example `git show 97a1b83:docs/strategies/spacy-beam.md`). Where the page gave acceptance or timing figures, they are repeated with the revision it named.

### spacy-direct and spacy-beam

`spacy-direct` projected one [dependency parse](https://en.wikipedia.org/wiki/Dependency_grammar) by [spaCy](https://en.wikipedia.org/wiki/SpaCy) into an nlu circuit in one deterministic pass. It mapped dependency labels to clause roles, nominal modifiers, coordination and relations, and kept the exact words for each role. At projector revision `24f248b`, on 1,861 historical inputs, independent reviewers accepted 38.90% with the compact model (`en_core_web_sm`) and 60.61% with the transformer model; median CPU time for parse plus projection was 2.20 ms and 49.28 ms.

`spacy-beam` used spaCy's dependency [beam](https://en.wikipedia.org/wiki/Beam_search) (width eight, at most three distinct parses) with the same projection, and needed a knowledge directory to check its readings. It kept the greedy reading first when complete, then up to two complete beam readings by parser score. On a historical pilot of 250 texts, the beam raised the inputs with at least one accepted reading from 152 to 171, while the inputs with every reading accepted fell from 152 to 113. At projector revision `0b955a1`, a plausible circuit came out for 66.4% of texts by direct projection and 71.6% by beam projection. A later snapshot opened in 2.47 s and took 52.09 ms per request at the median.

### neural-dependencies

Not a reader of its own but the transport that neuro-prolog and neuro-z3 used to call a local spaCy parser. Each token came with its written form, tag, lemma, dependency label and head index; a head index was treated as the parser's hypothesis. The worker started once per reader. It used spaCy 3.8 with `en_core_web_sm` 3.8.0, chosen with `SOP_NLU_SYNTAX_PYTHON` and `SOP_NLU_SYNTAX_MODEL`. The parser was pretrained on outside data; nothing was trained on WebMeet.

### neuro-selector

A fitted ranker (a `sop-proposal-ranker-v1` model) chose among complete readings proposed by four families of proposals: two transformer beams (base and adapted), an adapted compact direct projector, and neuro-prolog. It removed exact duplicates, ranked by circuit features and agreement across families, and returned at most two readings, each an unchanged proposal. It needed `SOP_KNOWLEDGE_DIR` and loaded two transformer models and one compact model per worker. The page gave no acceptance figure.

### selector-distilbert

The neuro-selector's first reading, plus a second, distinct reading from a [DistilBERT](https://en.wikipedia.org/wiki/BERT_(language_model)) model that wrote nlu graphs directly. Its checkpoint was trained on 7,040 texts (an "ownership" checkpoint). On a historical diagnostic of 250 sources on the CPU, 81.2% of messages had at least one plausible reading (48.4% wholly accepted, 32.8% mixed), against 78.0% for the selector alone.

### prolog-example-transfer

The symbolic Prolog reader plus patterns learned from labelled texts; a learned pattern could propose more candidates when its anchors and slots matched the message. Its page defined a **training boundary**, a method for keeping the test texts out of training:

1. Freeze the test sample from a committed revision of the dataset.
2. Read the training corpus from that same revision.
3. Leave out every row whose original text equals a held-out text, across all files and columns; case, spaces and Unicode code points count.
4. Check that the final training texts and test texts do not intersect. Similar sentences can still occur on both sides.
5. Train a new artefact for each split, and record the dataset revision, the fingerprints, the rows left out and the training time.

The page gave no acceptance figure.

### prolog

A native reader that indexed vocabulary and frame declarations from the configured worlds and sent the words to a persistent [SWI-Prolog](https://en.wikipedia.org/wiki/SWI-Prolog) process. The [Prolog](https://en.wikipedia.org/wiki/Prolog) grammar chose clause boundaries, predicates and roles, entity groups, coordination, scope and attachment alternatives. A second reading could come from a bottom-up constituent chart ([chart parsing](https://en.wikipedia.org/wiki/Chart_parser)): each cell covered an exact stretch of the message and a category, and kept its best derivation. It took no training input.

### z3

A constraint model solved by the [Z3 solver](https://en.wikipedia.org/wiki/Z3_Theorem_Prover) as a weighted problem ([MaxSAT](https://en.wikipedia.org/wiki/Maximum_satisfiability_problem) over theories, MaxSMT). It chose parts of speech, clause predicates, entity spans and roles, and modelled local attachments as alternatives: for "Put the box on the table by the door" it could return both an attachment to the clause and one to "table". It used English lexical facts and action frames from the configured worlds. The page gave no acceptance figure.

## Where each name is today

- `spacy-direct`: [Retired formalizers](../formalizers/retired.md); its repair files are used by spacy
- `spacy-beam`: is now `spacy`: [spaCy](../formalizers/spacy.md)
- `neural-dependencies`: [Retired formalizers](../formalizers/retired.md); its transport and circuit writer serve spacy
- `neuro-selector`: [Retired formalizers](../formalizers/retired.md)
- `selector-distilbert`: [Retired formalizers](../formalizers/retired.md)
- `neuro-prolog`: [Retired formalizers](../formalizers/retired.md)
- `neuro-z3`: [Retired formalizers](../formalizers/retired.md)
- `prolog-example-transfer`: [Retired formalizers](../formalizers/retired.md)
- `prolog`: [Prolog (experimental)](../formalizers/prolog.md)
- `z3`: [Z3 (experimental)](../formalizers/z3.md)

All of them now write the syntax schema; the retired ones still run by name, but leave rounds and benchmark ([Decisions, D10](decisions.md#d10)).

---

Next: [The full reports](reports.md) · Up: [Project](README.md)
